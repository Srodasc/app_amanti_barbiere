-- =====================================================================
-- Ventana de reserva para clientes: 7 días que se van abriendo día a día
-- (hoy y los 6 siguientes; cada medianoche se abre un día nuevo al final).
-- Se configura en Configuración → Reglas de la reserva:
--   booking_window = 'days'  → hoy + max_days_ahead días (ventana móvil) — por defecto
--   booking_window = 'week'  → solo la semana en curso (hasta el domingo)
-- Solo afecta a la reserva pública y a los cambios que hace el cliente desde su
-- enlace. El personal puede agendar y mover citas más adelante desde el panel.
-- Requiere: 20261102000001_reserva_fase3.sql. Idempotente.
-- =====================================================================

insert into business_settings (key, value, description) values
  ('booking_window', 'days', 'Ventana de reserva: days = hoy + N días (móvil); week = semana en curso (lun–dom)')
on conflict (key) do nothing;

-- Decisión del negocio: 7 días visibles para el cliente (hoy + 6)
update business_settings set value = '6' where key = 'max_days_ahead';

drop policy if exists settings_public on business_settings;
create policy settings_public on business_settings for select
  using (key in ('business_name', 'business_address', 'max_days_ahead', 'cancel_before_hours',
                 'legal_name', 'legal_id', 'privacy_email', 'business_phone', 'business_city',
                 'privacy_policy_date', 'booking_window'));

-- Último día que el cliente puede reservar (hora de Bogotá)
create or replace function booking_last_day()
returns date
language sql stable security definer set search_path = public, pg_temp
as $$
  select case
    when coalesce((select value from business_settings where key = 'booking_window'), 'days') = 'week'
      then local_now()::date + (7 - extract(isodow from local_now())::int)   -- domingo de esta semana
    else local_now()::date + setting_int('max_days_ahead', 30)
  end;
$$;
grant execute on function booking_last_day() to anon, authenticated;

-- Horarios libres (reserva pública): hasta booking_last_day()
create or replace function get_available_slots(p_service uuid, p_date date, p_barber uuid default null)
returns table (slot_time time, barber_id uuid)
language plpgsql stable security definer set search_path = public
as $$
declare
  v_dur        int;
  v_now        timestamp := local_now();
  v_notice     int := setting_int('min_notice_hours', 1);
  v_dow        int := extract(dow from p_date)::int;
begin
  select s.duration_minutes into v_dur from services s where s.id = p_service and s.is_active;
  if v_dur is null then return; end if;
  if p_date < v_now::date or p_date > booking_last_day() then return; end if;

  return query
  with barberos as (
    select b.id as bid
      from barbers b
     where b.is_active and (p_barber is null or b.id = p_barber)
  ),
  ventanas as (
    -- excepción de ese día con horario propio
    select b.bid, o.start_time as t0, o.end_time as t1,
           greatest(coalesce(s.appointment_duration, 30), 5) as step
      from barberos b
      join schedule_overrides o on o.barber_id = b.bid and o.date = p_date and o.is_available
      left join barber_schedules s on s.barber_id = b.bid and s.day_of_week = v_dow
    union all
    -- horario semanal, solo si ese día NO tiene excepción
    select b.bid, s.start_time, s.end_time, greatest(coalesce(s.appointment_duration, 30), 5)
      from barberos b
      join barber_schedules s on s.barber_id = b.bid and s.day_of_week = v_dow and s.is_available
     where not exists (select 1 from schedule_overrides o where o.barber_id = b.bid and o.date = p_date)
  ),
  candidatos as (
    select v.bid, (p_date + v.t0 + make_interval(mins => g * v.step)) as ini
      from ventanas v,
           generate_series(
             0,
             floor((extract(epoch from (v.t1 - v.t0)) / 60 - v_dur) / v.step)::int
           ) as g
  ),
  libres as (
    select c.bid, c.ini, c.ini + make_interval(mins => v_dur) as fin
      from candidatos c
     where c.ini >= v_now + make_interval(hours => v_notice)
       and not exists (
         select 1 from appointments a
          where a.barber_id = c.bid
            and a.status in ('pending', 'confirmed', 'in_progress', 'completed')
            and tsrange(a.date + a.start_time, a.date + a.end_time, '[)')
                && tsrange(c.ini, c.ini + make_interval(mins => v_dur), '[)')
       )
       and not exists (
         select 1 from time_off t
          where t.barber_id = c.bid
            and tsrange(t.starts_at, t.ends_at, '[)')
                && tsrange(c.ini, c.ini + make_interval(mins => v_dur), '[)')
       )
       and not exists (
         select 1 from barber_breaks br
          where br.barber_id = c.bid and br.day_of_week = v_dow
            and tsrange(p_date + br.start_time, p_date + br.end_time, '[)')
                && tsrange(c.ini, c.ini + make_interval(mins => v_dur), '[)')
       )
  )
  select distinct on (l.ini) l.ini::time, l.bid
    from libres l
   order by l.ini,
            (select count(*) from appointments a
              where a.barber_id = l.bid and a.date = p_date and a.status <> 'cancelled'),
            l.bid;
end;
$$;

-- Días con cupo (reserva pública)
create or replace function get_available_days(p_service uuid, p_barber uuid default null)
returns table (day date, status text, slots int, first_time time, first_barber uuid, label text)
language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare
  v_today date := local_now()::date;
  v_max   int  := booking_last_day() - local_now()::date;
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

-- Cambios desde el enlace del cliente: misma ventana
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

  for i in 0 .. (booking_last_day() - v_today) loop
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

create or replace function reschedule_slots_by_token(p_token uuid, p_date date)
returns table (slot_time time)
language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare
  v_a record;
begin
  select a.id, a.barber_id, a.service_id into v_a from appointments a where a.cancel_token = p_token;
  if v_a.id is null or not coalesce((select r.can_reschedule from reschedule_info_by_token(p_token) r), false) then return; end if;
  if p_date > booking_last_day() then return; end if;
  return query select g.slot_time from slots_core(v_a.service_id, p_date, v_a.barber_id, v_a.id) g;
end;
$$;

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
  if p_date is null or p_time is null or p_date > booking_last_day() then
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
