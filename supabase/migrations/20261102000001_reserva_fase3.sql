-- =====================================================================
-- Reserva — Fase 3: el cliente reprograma su cita desde el enlace privado
-- Requiere: 20261101000001_reprogramar.sql. Idempotente.
--
-- Reglas:
--   * Solo citas pendientes o confirmadas, y antes del plazo para cancelar
--     (cancel_before_hours): las mismas reglas que cancelar en línea.
--   * Mismo barbero y mismo servicio; solo cambia el día y la hora.
--   * Dentro de la ventana pública (max_days_ahead) y con la anticipación mínima.
--   * Máximo max_client_reschedules veces por cita (por defecto 2).
--   * El cambio es atómico: la cita conserva su turno hasta que el nuevo se guarda.
-- =====================================================================

alter table appointments add column if not exists client_reschedules int not null default 0;

insert into business_settings (key, value, description) values
  ('max_client_reschedules', '2', 'Veces que el cliente puede reprogramar una cita desde su enlace')
on conflict (key) do nothing;

-- ---------- Núcleo de disponibilidad (interno, sin permisos propios) ----------
-- Horarios libres de un barbero (o de todos) en una fecha, ignorando una cita.
create or replace function slots_core(p_service uuid, p_date date, p_barber uuid, p_exclude uuid)
returns table (slot_time time, barber_id uuid)
language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare
  v_dur    int;
  v_now    timestamp := local_now();
  v_notice int := setting_int('min_notice_hours', 1);
  v_dow    int := extract(dow from p_date)::int;
begin
  select s.duration_minutes into v_dur from services s where s.id = p_service and s.is_active;
  if v_dur is null or p_date < v_now::date then return; end if;

  return query
  with barberos as (
    select b.id as bid from barbers b where b.is_active and (p_barber is null or b.id = p_barber)
  ),
  ventanas as (
    select b.bid, o.start_time as t0, o.end_time as t1,
           greatest(coalesce(s.appointment_duration, 30), 5) as step
      from barberos b
      join schedule_overrides o on o.barber_id = b.bid and o.date = p_date and o.is_available
      left join barber_schedules s on s.barber_id = b.bid and s.day_of_week = v_dow
    union all
    select b.bid, s.start_time, s.end_time, greatest(coalesce(s.appointment_duration, 30), 5)
      from barberos b
      join barber_schedules s on s.barber_id = b.bid and s.day_of_week = v_dow and s.is_available
     where not exists (select 1 from schedule_overrides o where o.barber_id = b.bid and o.date = p_date)
  ),
  candidatos as (
    select v.bid, (p_date + v.t0 + make_interval(mins => g * v.step)) as ini
      from ventanas v,
           generate_series(0, floor((extract(epoch from (v.t1 - v.t0)) / 60 - v_dur) / v.step)::int) as g
  ),
  libres as (
    select c.bid, c.ini
      from candidatos c
     where c.ini >= v_now + make_interval(hours => v_notice)
       and not exists (
         select 1 from appointments a
          where a.barber_id = c.bid
            and (p_exclude is null or a.id <> p_exclude)
            and a.status in ('pending', 'confirmed', 'in_progress', 'completed')
            and tsrange(a.date + a.start_time, a.date + a.end_time, '[)')
                && tsrange(c.ini, c.ini + make_interval(mins => v_dur), '[)'))
       and not exists (
         select 1 from time_off t
          where t.barber_id = c.bid
            and tsrange(t.starts_at, t.ends_at, '[)') && tsrange(c.ini, c.ini + make_interval(mins => v_dur), '[)'))
       and not exists (
         select 1 from barber_breaks br
          where br.barber_id = c.bid and br.day_of_week = v_dow
            and tsrange(p_date + br.start_time, p_date + br.end_time, '[)')
                && tsrange(c.ini, c.ini + make_interval(mins => v_dur), '[)'))
  )
  select distinct on (l.ini) l.ini::time, l.bid
    from libres l
   order by l.ini,
            (select count(*) from appointments a where a.barber_id = l.bid and a.date = p_date and a.status <> 'cancelled'),
            l.bid;
end;
$$;
revoke execute on function slots_core(uuid, date, uuid, uuid) from public, anon, authenticated;

-- El del personal (Fase B) pasa a usar el núcleo: misma firma y mismas reglas
create or replace function get_available_slots_excluding(
  p_service uuid, p_date date, p_barber uuid default null, p_exclude uuid default null
)
returns table (slot_time time, barber_id uuid)
language plpgsql stable security definer set search_path = public, pg_temp
as $$
begin
  if not (is_admin() or my_barber_id() is not null) then return; end if;
  if p_date > local_now()::date + greatest(setting_int('max_days_ahead', 30), 90) then return; end if;
  return query select * from slots_core(p_service, p_date, p_barber, p_exclude);
end;
$$;

-- ---------- ¿Se puede reprogramar esta cita desde el enlace? ----------
create or replace function reschedule_info_by_token(p_token uuid)
returns table (can_reschedule boolean, reschedules_left int, duration_minutes int, deadline_hours int)
language sql stable security definer set search_path = public, pg_temp
as $$
  select a.status in ('pending', 'confirmed')
           and (a.date + a.start_time) > local_now() + make_interval(hours => setting_int('cancel_before_hours', 2))
           and a.client_reschedules < setting_int('max_client_reschedules', 2)
           and a.barber_id is not null and a.service_id is not null,
         greatest(setting_int('max_client_reschedules', 2) - a.client_reschedules, 0),
         coalesce(s.duration_minutes, extract(epoch from (a.end_time - a.start_time))::int / 60),
         setting_int('cancel_before_hours', 2)
    from appointments a
    left join services s on s.id = a.service_id
   where a.cancel_token = p_token;
$$;

-- Días de la ventana pública con horarios libres para esta cita (mismo barbero y servicio)
create or replace function reschedule_days_by_token(p_token uuid)
returns table (day date, status text, slots int, label text)
language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare
  v_a     record;
  v_today date := local_now()::date;
  v_d     date;
  v_n     int;
begin
  select a.id, a.barber_id, a.service_id into v_a from appointments a where a.cancel_token = p_token;
  if v_a.id is null or not coalesce((select r.can_reschedule from reschedule_info_by_token(p_token) r), false) then return; end if;

  for i in 0 .. setting_int('max_days_ahead', 30) loop
    v_d := v_today + i;
    select count(*)::int into v_n from slots_core(v_a.service_id, v_d, v_a.barber_id, v_a.id);
    day := v_d; slots := v_n;
    if v_n > 0 then status := 'open'; label := null;
    else status := 'closed'; label := 'Sin cupos';
    end if;
    return next;
  end loop;
end;
$$;

-- Horarios libres de un día para esta cita
create or replace function reschedule_slots_by_token(p_token uuid, p_date date)
returns table (slot_time time)
language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare
  v_a record;
begin
  select a.id, a.barber_id, a.service_id into v_a from appointments a where a.cancel_token = p_token;
  if v_a.id is null or not coalesce((select r.can_reschedule from reschedule_info_by_token(p_token) r), false) then return; end if;
  if p_date > local_now()::date + setting_int('max_days_ahead', 30) then return; end if;
  return query select g.slot_time from slots_core(v_a.service_id, p_date, v_a.barber_id, v_a.id) g;
end;
$$;

-- Mover la cita. Devuelve 'ok' o el motivo: not_found, locked, limit, out_of_range, slot_unavailable
create or replace function reschedule_by_token(p_token uuid, p_date date, p_time time)
returns text
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_a   record;
  v_dur int;
begin
  select a.id, a.barber_id, a.service_id, a.status, a.date, a.start_time, a.client_reschedules
    into v_a
    from appointments a where a.cancel_token = p_token
     for update;
  if v_a.id is null then return 'not_found'; end if;
  if v_a.status not in ('pending', 'confirmed') or v_a.barber_id is null or v_a.service_id is null
     or (v_a.date + v_a.start_time) <= local_now() + make_interval(hours => setting_int('cancel_before_hours', 2)) then
    return 'locked';
  end if;
  if v_a.client_reschedules >= setting_int('max_client_reschedules', 2) then return 'limit'; end if;
  if p_date is null or p_time is null or p_date > local_now()::date + setting_int('max_days_ahead', 30) then
    return 'out_of_range';
  end if;
  if not exists (select 1 from slots_core(v_a.service_id, p_date, v_a.barber_id, v_a.id) g where g.slot_time = p_time) then
    return 'slot_unavailable';
  end if;

  select duration_minutes into v_dur from services where id = v_a.service_id;
  begin
    update appointments
       set date = p_date,
           start_time = p_time,
           end_time = p_time + make_interval(mins => v_dur),
           client_reschedules = client_reschedules + 1
     where id = v_a.id;  -- el trigger de citas recalcula los recordatorios
  exception when exclusion_violation then
    return 'slot_unavailable';
  end;

  -- Nueva confirmación por WhatsApp con la hora nueva (sale cuando WhatsApp esté activo);
  -- una confirmación anterior aún sin enviar ya no sirve
  update notifications set status = 'skipped'
   where appointment_id = v_a.id and kind = 'confirmation' and status = 'pending';
  insert into notifications (appointment_id, kind, scheduled_for) values (v_a.id, 'confirmation', now());
  return 'ok';
end;
$$;

revoke execute on function reschedule_info_by_token(uuid)               from public;
revoke execute on function reschedule_days_by_token(uuid)               from public;
revoke execute on function reschedule_slots_by_token(uuid, date)        from public;
revoke execute on function reschedule_by_token(uuid, date, time)        from public;
grant  execute on function reschedule_info_by_token(uuid)               to anon, authenticated;
grant  execute on function reschedule_days_by_token(uuid)               to anon, authenticated;
grant  execute on function reschedule_slots_by_token(uuid, date)        to anon, authenticated;
grant  execute on function reschedule_by_token(uuid, date, time)        to anon, authenticated;
