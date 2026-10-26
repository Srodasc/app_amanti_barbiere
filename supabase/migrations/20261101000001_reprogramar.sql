-- =====================================================================
-- Reprogramar citas desde el panel / Mi día
-- Requiere: 20261026000001_hardening.sql y 20261031000001_citas_cobro.sql. Idempotente.
-- =====================================================================

-- Horarios libres ignorando una cita (la que se va a mover). Misma lógica que
-- get_available_slots (que no se toca, porque la usa la reserva pública).
create or replace function get_available_slots_excluding(
  p_service uuid, p_date date, p_barber uuid default null, p_exclude uuid default null
)
returns table (slot_time time, barber_id uuid)
language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare
  v_dur        int;
  v_now        timestamp := local_now();
  v_notice     int := setting_int('min_notice_hours', 1);
  v_max_days   int := setting_int('max_days_ahead', 30);
  v_dow        int := extract(dow from p_date)::int;
begin
  if not (is_admin() or my_barber_id() is not null) then return; end if;
  select s.duration_minutes into v_dur from services s where s.id = p_service and s.is_active;
  if v_dur is null then return; end if;
  -- El personal puede mover citas más allá de la ventana pública, pero no al pasado
  if p_date < v_now::date or p_date > v_now::date + greatest(v_max_days, 90) then return; end if;

  return query
  with barberos as (
    select b.id as bid
      from barbers b
     where b.is_active and (p_barber is null or b.id = p_barber)
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

-- Mover una cita: nueva fecha, hora y barbero (y opcionalmente servicio).
--   p_force = true  → "otra hora": fuera de la agenda (solo valida que no choque con otra cita)
--   p_notify = true → avisa al cliente con una nueva confirmación por WhatsApp
create or replace function reschedule_appointment(
  p_appointment uuid,
  p_date        date,
  p_time        time,
  p_barber      uuid,
  p_service     uuid default null,
  p_force       boolean default false,
  p_notify      boolean default true
)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_a       record;
  v_service uuid;
  v_dur     int;
  v_price   numeric;
begin
  select id, barber_id, service_id, status, reward_rule_id, price into v_a
    from appointments where id = p_appointment for update;
  if v_a.id is null then raise exception 'appointment_not_found'; end if;
  -- Admin: cualquier cita. Barbero: solo las suyas y sin pasarlas a otro barbero.
  if not (is_admin() or (my_barber_id() = v_a.barber_id and my_barber_id() = p_barber)) then
    raise exception 'not_authorized';
  end if;
  if v_a.status not in ('pending', 'confirmed') then raise exception 'appointment_locked'; end if;
  if p_date < local_now()::date then raise exception 'date_in_past'; end if;

  v_service := coalesce(p_service, v_a.service_id);
  if v_service is distinct from v_a.service_id and v_a.reward_rule_id is not null then
    raise exception 'reward_applied';  -- quitar el premio antes de cambiar de servicio
  end if;
  select duration_minutes, price into v_dur, v_price from services where id = v_service and is_active;
  if v_dur is null then raise exception 'service_unavailable'; end if;
  if not exists (select 1 from barbers where id = p_barber and is_active) then raise exception 'barber_unavailable'; end if;

  if not p_force and not exists (
    select 1 from get_available_slots_excluding(v_service, p_date, p_barber, p_appointment) g where g.slot_time = p_time
  ) then
    raise exception 'slot_unavailable';
  end if;

  begin
    update appointments
       set date = p_date,
           start_time = p_time,
           end_time = p_time + make_interval(mins => v_dur),
           barber_id = p_barber,
           service_id = v_service,
           price = case when v_service is distinct from v_a.service_id then v_price else price end
     where id = p_appointment;  -- el trigger de citas recalcula los recordatorios
  exception when exclusion_violation then
    raise exception 'slot_unavailable';
  end;

  if p_notify then
    insert into notifications (appointment_id, kind, scheduled_for) values (p_appointment, 'confirmation', now());
  end if;
end;
$$;

revoke execute on function get_available_slots_excluding(uuid, date, uuid, uuid)              from public, anon;
revoke execute on function reschedule_appointment(uuid, date, time, uuid, uuid, boolean, boolean) from public, anon;
grant  execute on function get_available_slots_excluding(uuid, date, uuid, uuid)              to authenticated;
grant  execute on function reschedule_appointment(uuid, date, time, uuid, uuid, boolean, boolean) to authenticated;

-- Actualización en vivo de la agenda (Supabase Realtime) — idempotente
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'appointments') then
    alter publication supabase_realtime add table appointments;
  end if;
end $$;
