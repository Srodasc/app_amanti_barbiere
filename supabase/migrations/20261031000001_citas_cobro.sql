-- =====================================================================
-- Citas: cobro al completar (sin crear gastos), adicionales, medio de pago,
-- cancelación con motivo.
-- Requiere: 20261026000001_hardening.sql y 20261028000001_fidelizacion.sql. Idempotente.
--
-- Antes, "Completar" en el panel creaba un GASTO por el precio del servicio y
-- otro por cada adicional. Ahora completar = registrar el COBRO de la cita:
--   paid_amount = precio de la cita (ya con premio, si lo hay) + adicionales
-- Los gastos falsos que ya existan se limpian con supabase/limpieza_gastos_falsos.sql
-- =====================================================================

alter table appointments add column if not exists payment_method text;
alter table appointments add column if not exists paid_amount   numeric(12,2);
alter table appointments add column if not exists paid_at       timestamptz;
alter table appointments add column if not exists completed_by  uuid;
alter table appointments add column if not exists cancel_reason text;
alter table appointments add column if not exists cancelled_at  timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'appointments_payment_method_check') then
    alter table appointments add constraint appointments_payment_method_check
      check (payment_method is null or payment_method in ('cash', 'card', 'transfer', 'other'));
  end if;
end $$;

-- Adicionales cobrados en la cita (p. ej. barba o cejas además del corte)
create table if not exists appointment_extras (
  id              uuid primary key default gen_random_uuid(),
  appointment_id  uuid not null references appointments on delete cascade,
  service_id      uuid references services on delete set null,
  name            text not null,
  price           numeric(12,2) not null check (price >= 0),
  created_at      timestamptz not null default now()
);
create index if not exists appointment_extras_appt on appointment_extras (appointment_id);

alter table appointment_extras enable row level security;
drop policy if exists appointment_extras_read on appointment_extras;
create policy appointment_extras_read on appointment_extras for select using (
  exists (select 1 from appointments a where a.id = appointment_id and (is_admin() or a.barber_id = my_barber_id()))
);
revoke all on appointment_extras from anon;
revoke insert, update, delete on appointment_extras from authenticated;
grant select on appointment_extras to authenticated;

-- ---------- Completar y cobrar (admin o el barbero de la cita) ----------
-- p_extras = ["<service_id>", ...]  (el precio sale de la base de datos, no del navegador)
create or replace function complete_appointment(p_appointment uuid, p_payment text, p_extras jsonb default '[]'::jsonb)
returns numeric
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_a      record;
  v_extras numeric(12,2) := 0;
  v_total  numeric(12,2);
begin
  select a.id, a.barber_id, a.status, coalesce(a.price, s.price, 0) as price
    into v_a
    from appointments a left join services s on s.id = a.service_id
   where a.id = p_appointment
     for update of a;
  if v_a.id is null then raise exception 'appointment_not_found'; end if;
  if not (is_admin() or my_barber_id() = v_a.barber_id) then raise exception 'not_authorized'; end if;
  if v_a.status not in ('pending', 'confirmed', 'in_progress') then raise exception 'appointment_locked'; end if;
  if p_payment not in ('cash', 'card', 'transfer', 'other') then raise exception 'invalid_payment'; end if;
  if p_extras is null or jsonb_typeof(p_extras) <> 'array' then p_extras := '[]'::jsonb; end if;

  insert into appointment_extras (appointment_id, service_id, name, price)
  select p_appointment, s.id, s.name, s.price
    from jsonb_array_elements_text(p_extras) e
    join services s on s.id = e::uuid and s.is_active;

  select coalesce(sum(price), 0) into v_extras from appointment_extras where appointment_id = p_appointment;
  v_total := v_a.price + v_extras;

  perform set_config('app.completing', 'on', true);
  update appointments
     set status = 'completed',
         payment_method = p_payment,
         paid_amount = v_total,
         paid_at = now(),
         completed_by = auth.uid()
   where id = p_appointment;  -- el trigger de citas suma la visita de fidelización

  return v_total;
end;
$$;

-- ---------- Cancelar con motivo ----------
create or replace function cancel_appointment_staff(p_appointment uuid, p_reason text default null)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_a record;
begin
  select id, barber_id, status into v_a from appointments where id = p_appointment for update;
  if v_a.id is null then raise exception 'appointment_not_found'; end if;
  if not (is_admin() or my_barber_id() = v_a.barber_id) then raise exception 'not_authorized'; end if;
  if v_a.status not in ('pending', 'confirmed', 'in_progress') then raise exception 'appointment_locked'; end if;
  -- El trigger de citas avisa al cliente (WhatsApp) y le devuelve el premio si tenía uno aplicado
  update appointments
     set status = 'cancelled', cancel_reason = nullif(trim(p_reason), ''), cancelled_at = now()
   where id = p_appointment;
end;
$$;

-- ---------- Reglas al cambiar el estado ----------
-- 1) Solo complete_appointment puede marcar "completada" (así siempre queda el cobro).
-- 2) Si una cita deja de estar completada (error al marcar), se borra su cobro y sus adicionales.
-- security definer: borra adicionales aunque quien cambia el estado no tenga permiso directo sobre esa tabla
create or replace function appointments_payment_guard()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.status = 'completed' and old.status is distinct from 'completed'
     and coalesce(current_setting('app.completing', true), '') <> 'on' then
    raise exception 'use_complete_appointment' using hint = 'Completa la cita con complete_appointment para registrar el cobro';
  end if;
  if old.status = 'completed' and new.status <> 'completed' then
    new.payment_method := null;
    new.paid_amount := null;
    new.paid_at := null;
    new.completed_by := null;
    delete from appointment_extras where appointment_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_appointments_payment_guard on appointments;
create trigger trg_appointments_payment_guard
  before update of status on appointments
  for each row execute function appointments_payment_guard();

revoke execute on function complete_appointment(uuid, text, jsonb)  from public, anon;
revoke execute on function cancel_appointment_staff(uuid, text)     from public, anon;
grant  execute on function complete_appointment(uuid, text, jsonb)  to authenticated;
grant  execute on function cancel_appointment_staff(uuid, text)     to authenticated;
