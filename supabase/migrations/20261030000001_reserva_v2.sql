-- =====================================================================
-- Reserva v2: días disponibles, autorización de datos y datos del negocio
-- Requiere: 20261026000001_hardening.sql. Idempotente.
-- =====================================================================

-- ---------- 1. Días reservables (para el calendario / tira de días) ----------
-- Un registro por día desde hoy hasta max_days_ahead:
--   open    → tiene horarios libres (slots, primer horario y su barbero)
--   full    → se trabaja ese día pero ya no hay cupos (o ya pasó la hora)
--   holiday → día especial cerrado (label = motivo, p. ej. "Festivo")
--   closed  → nadie trabaja ese día de la semana
create or replace function get_available_days(p_service uuid, p_barber uuid default null)
returns table (day date, status text, slots int, first_time time, first_barber uuid, label text)
language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare
  v_today date := local_now()::date;
  v_max   int  := setting_int('max_days_ahead', 30);
  v_d     date;
  v_dow   int;
  v_n     int;
  v_t     time;
  v_b     uuid;
  v_works boolean;
  v_reason text;
begin
  if not exists (select 1 from services s where s.id = p_service and s.is_active) then return; end if;

  for i in 0 .. v_max loop
    v_d := v_today + i;
    v_dow := extract(dow from v_d)::int;

    select count(*)::int, min(g.slot_time) into v_n, v_t from get_available_slots(p_service, v_d, p_barber) g;
    if v_n > 0 then
      select g.barber_id into v_b from get_available_slots(p_service, v_d, p_barber) g where g.slot_time = v_t limit 1;
      day := v_d; status := 'open'; slots := v_n; first_time := v_t; first_barber := v_b; label := null;
      return next;
      continue;
    end if;

    -- ¿Algún barbero (de los que aplican) trabaja ese día?
    select exists (
      select 1 from barbers b
       where b.is_active and (p_barber is null or b.id = p_barber)
         and (
           exists (select 1 from schedule_overrides o where o.barber_id = b.id and o.date = v_d and o.is_available)
           or (exists (select 1 from barber_schedules s where s.barber_id = b.id and s.day_of_week = v_dow and s.is_available)
               and not exists (select 1 from schedule_overrides o where o.barber_id = b.id and o.date = v_d))
         )
    ) into v_works;

    day := v_d; slots := 0; first_time := null; first_barber := null;
    if v_works then
      status := 'full'; label := 'Sin cupos';
    else
      select o.reason into v_reason
        from schedule_overrides o join barbers b on b.id = o.barber_id
       where o.date = v_d and not o.is_available and b.is_active and (p_barber is null or b.id = p_barber)
       order by o.reason nulls last limit 1;
      if found then
        status := 'holiday'; label := coalesce(nullif(trim(v_reason), ''), 'Cerrado');
      else
        status := 'closed'; label := 'Cerrado';
      end if;
    end if;
    return next;
  end loop;
end;
$$;

revoke execute on function get_available_days(uuid, uuid) from public;
grant  execute on function get_available_days(uuid, uuid) to anon, authenticated;

-- ---------- 2. Autorización de tratamiento de datos (Ley 1581 de 2012) ----------
alter table clients add column if not exists data_consent_at timestamptz;
alter table clients add column if not exists data_consent_version text;

-- La registra la reserva pública justo después de crear la cita (el token prueba
-- que quien llama acaba de reservar). Solo vale durante la primera hora.
create or replace function record_data_consent(p_token uuid, p_version text)
returns boolean
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_client uuid;
begin
  if coalesce(trim(p_version), '') = '' or length(p_version) > 40 then return false; end if;
  select a.client_id into v_client
    from appointments a
   where a.cancel_token = p_token and a.created_at > now() - interval '1 hour';
  if v_client is null then return false; end if;
  update clients set data_consent_at = now(), data_consent_version = trim(p_version) where id = v_client;
  return true;
end;
$$;

revoke execute on function record_data_consent(uuid, text) from public;
grant  execute on function record_data_consent(uuid, text) to anon, authenticated;

-- ---------- 3. Datos del negocio (política de privacidad, "Cómo llegar") ----------
insert into business_settings (key, value, description) values
  ('legal_name',    '', 'Razón social o nombre del responsable de los datos'),
  ('legal_id',      '', 'NIT o cédula del responsable'),
  ('privacy_email', '', 'Correo para consultas y reclamos de datos personales'),
  ('business_phone','', 'Teléfono o WhatsApp del negocio'),
  ('business_city', '', 'Ciudad del negocio'),
  ('privacy_policy_date', '', 'Fecha desde la que rige la política de datos (AAAA-MM-DD)')
on conflict (key) do nothing;

drop policy if exists settings_public on business_settings;
create policy settings_public on business_settings for select
  using (key in ('business_name', 'business_address', 'max_days_ahead', 'cancel_before_hours',
                 'legal_name', 'legal_id', 'privacy_email', 'business_phone', 'business_city',
                 'privacy_policy_date'));
