-- =====================================================================
-- Amanti Barbiere — endurecimiento y funciones de reserva
--
-- Se aplica SOBRE el esquema actual (schema.sql / reset_database.sql).
-- No borra tablas ni citas. Lo único irreversible: anula las contraseñas
-- en texto plano de clients.password_hash.
--
-- Qué hace:
--   1. Verifica que no haya citas traslapadas existentes (si las hay, se detiene).
--   2. Anti doble reserva a nivel de base de datos (constraint de exclusión).
--   3. Roles reales: admin (admin_users) y barbero (barbers.auth_id) con RLS.
--   4. Cierra el trigger que convertía a cualquier usuario nuevo en admin.
--   5. Disponibilidad, reserva y cancelación por token, todo en funciones seguras.
--   6. Excepciones de horario, descansos, bloqueos, cola de WhatsApp y fidelización.
--
-- Hora de negocio: America/Bogota. date/start_time/end_time siguen siendo
-- "hora local" (sin zona), como ya están en tu esquema.
-- =====================================================================

create extension if not exists btree_gist;
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- 0. Pre-chequeo: citas traslapadas ya guardadas
-- ---------------------------------------------------------------------
do $$
declare
  n int;
begin
  select count(*) into n
    from appointments a
    join appointments b
      on a.id < b.id
     and a.barber_id = b.barber_id
     and a.status not in ('cancelled')
     and b.status not in ('cancelled')
     and tsrange(a.date + a.start_time, a.date + a.end_time, '[)')
         && tsrange(b.date + b.start_time, b.date + b.end_time, '[)');

  if n > 0 then
    raise exception 'Hay % par(es) de citas traslapadas del mismo barbero. Cancela o mueve una de cada par y vuelve a ejecutar.', n
      using hint = 'Consulta: select a.id, b.id, a.barber_id, a.date, a.start_time, b.start_time from appointments a join appointments b on a.id < b.id and a.barber_id = b.barber_id and a.status <> ''cancelled'' and b.status <> ''cancelled'' and tsrange(a.date + a.start_time, a.date + a.end_time) && tsrange(b.date + b.start_time, b.date + b.end_time);';
  end if;
end $$;

-- Aviso (no detiene): citas futuras sin barbero NO bloquean ningún horario.
do $$
declare
  n int;
begin
  select count(*) into n from appointments
   where barber_id is null and status in ('pending', 'confirmed', 'in_progress')
     and date >= (now() at time zone 'America/Bogota')::date;
  if n > 0 then
    raise notice 'Hay % cita(s) futuras sin barbero asignado. Asígnales un barbero (update appointments set barber_id = ... where barber_id is null ...) para que bloqueen su horario.', n;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 1. Cambios de tablas existentes
-- ---------------------------------------------------------------------

-- Estado "no llegó"
alter table appointments drop constraint if exists appointments_status_check;
alter table appointments add constraint appointments_status_check
  check (status in ('pending', 'confirmed', 'in_progress', 'completed', 'cancelled', 'no_show'));

alter table appointments drop constraint if exists appointments_time_order;
alter table appointments add constraint appointments_time_order
  check (end_time > start_time) not valid;

-- Enlace privado para que el cliente vea/cancele su cita sin cuenta
alter table appointments add column if not exists cancel_token uuid not null default gen_random_uuid();
create unique index if not exists appointments_cancel_token_key on appointments (cancel_token);

alter table appointments add column if not exists source text not null default 'web'
  check (source in ('web', 'walk_in', 'staff'));
alter table appointments add column if not exists price numeric(10,2);
alter table appointments add column if not exists reward_rule_id uuid;

update appointments a set price = s.price
  from services s
 where a.service_id = s.id and a.price is null;

-- Barbero con login propio
alter table barbers add column if not exists auth_id uuid unique references auth.users on delete set null;

-- Clientes: preferencia de WhatsApp; se eliminan las contraseñas en texto plano
alter table clients add column if not exists whatsapp_opt_in boolean not null default true;
update clients set password_hash = null where password_hash is not null;
comment on column clients.password_hash is 'OBSOLETA: los clientes ya no tienen contraseña. Se puede eliminar la columna.';

-- ANTI DOBLE RESERVA
alter table appointments drop constraint if exists appointments_no_overlap;
alter table appointments add constraint appointments_no_overlap
  exclude using gist (
    barber_id with =,
    tsrange(date + start_time, date + end_time, '[)') with &&
  ) where (barber_id is not null and status in ('pending', 'confirmed', 'in_progress', 'completed'));

create index if not exists idx_appointments_barber_date on appointments (barber_id, date);

-- ---------------------------------------------------------------------
-- 2. Tablas nuevas
-- ---------------------------------------------------------------------

-- Descansos recurrentes (almuerzo): un barbero puede tener varios por día
create table if not exists barber_breaks (
  id           uuid primary key default gen_random_uuid(),
  barber_id    uuid not null references barbers on delete cascade,
  day_of_week  integer not null check (day_of_week between 0 and 6),
  start_time   time not null,
  end_time     time not null,
  created_at   timestamptz not null default now(),
  check (end_time > start_time)
);
create index if not exists idx_barber_breaks_barber on barber_breaks (barber_id, day_of_week);

-- Excepción para una fecha: día libre (is_available=false) u horario distinto
create table if not exists schedule_overrides (
  id            uuid primary key default gen_random_uuid(),
  barber_id     uuid not null references barbers on delete cascade,
  date          date not null,
  is_available  boolean not null default false,
  start_time    time,
  end_time      time,
  reason        text,
  created_at    timestamptz not null default now(),
  unique (barber_id, date),
  check ((is_available and start_time is not null and end_time is not null and end_time > start_time)
         or not is_available)
);

-- Bloqueos por rango (vacaciones, trámites). Hora local de Colombia.
create table if not exists time_off (
  id         uuid primary key default gen_random_uuid(),
  barber_id  uuid not null references barbers on delete cascade,
  starts_at  timestamp not null,
  ends_at    timestamp not null,
  reason     text,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index if not exists idx_time_off_barber on time_off (barber_id, starts_at, ends_at);

-- Reglas del negocio editables
create table if not exists business_settings (
  key          text primary key,
  value        text not null,
  description  text
);
insert into business_settings (key, value, description) values
  ('min_notice_hours',  '1',  'Horas mínimas de anticipación para reservar'),
  ('max_days_ahead',    '30', 'Hasta cuántos días adelante se puede reservar'),
  ('cancel_before_hours','2', 'Horas antes de la cita hasta las que el cliente puede cancelar'),
  ('business_name',     'Amanti Barbiere', 'Nombre del negocio'),
  ('business_address',  '',   'Dirección que se muestra al cliente')
on conflict (key) do nothing;

-- Cola de notificaciones de WhatsApp
create table if not exists notifications (
  id              uuid primary key default gen_random_uuid(),
  appointment_id  uuid not null references appointments on delete cascade,
  kind            text not null check (kind in ('confirmation', 'reminder_24h', 'reminder_2h', 'cancellation')),
  scheduled_for   timestamptz not null,
  status          text not null default 'pending' check (status in ('pending', 'sent', 'error', 'skipped')),
  attempts        integer not null default 0,
  last_error      text,
  sent_at         timestamptz,
  created_at      timestamptz not null default now()
);
create index if not exists idx_notifications_due on notifications (status, scheduled_for);

-- Fidelización configurable
create table if not exists loyalty_rules (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  is_active        boolean not null default true,
  visits_required  integer not null check (visits_required > 0),
  reward_type      text not null check (reward_type in ('free', 'percent', 'amount')),
  reward_value     numeric(10,2) not null default 0,
  service_id       uuid references services on delete cascade,
  created_at       timestamptz not null default now()
);

create table if not exists loyalty_balances (
  client_id          uuid not null references clients on delete cascade,
  rule_id            uuid not null references loyalty_rules on delete cascade,
  visits             integer not null default 0,
  rewards_available  integer not null default 0,
  primary key (client_id, rule_id)
);

-- ---------------------------------------------------------------------
-- 3. Funciones de apoyo
-- ---------------------------------------------------------------------

create or replace function local_now()
returns timestamp
language sql stable
as $$ select now() at time zone 'America/Bogota' $$;

-- Celular colombiano de 10 dígitos que empieza por 3 → 57 + número
create or replace function normalize_phone(p text)
returns text
language sql immutable
as $$
  select case when d ~ '^3[0-9]{9}$' then '57' || d else d end
    from (select regexp_replace(coalesce(p, ''), '\D', '', 'g') as d) t;
$$;

create or replace function is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from admin_users where auth_id = auth.uid() and is_active);
$$;

create or replace function my_barber_id()
returns uuid
language sql stable security definer set search_path = public
as $$
  select b.id from barbers b where b.auth_id = auth.uid() and b.is_active limit 1;
$$;

-- Negocio de un solo dueño: las citas web se asignan al primer admin activo
create or replace function default_admin_id()
returns uuid
language sql stable security definer set search_path = public
as $$
  select id from admin_users where is_active order by created_at limit 1;
$$;

create or replace function setting_int(p_key text, p_default int)
returns int
language sql stable security definer set search_path = public
as $$
  select coalesce((select value::int from business_settings where key = p_key), p_default);
$$;

-- ---------------------------------------------------------------------
-- 4. Trigger de usuarios: YA NO crea administradores
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into profiles (id, email, full_name, user_type)
  values (new.id, new.email, new.raw_user_meta_data ->> 'full_name', 'client')
  on conflict (id) do nothing;
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 5. Disponibilidad
--    p_barber null = "cualquier barbero": un horario por hora, con el barbero
--    menos cargado ese día.
-- ---------------------------------------------------------------------
create or replace function get_available_slots(p_service uuid, p_date date, p_barber uuid default null)
returns table (slot_time time, barber_id uuid)
language plpgsql stable security definer set search_path = public
as $$
declare
  v_dur        int;
  v_now        timestamp := local_now();
  v_notice     int := setting_int('min_notice_hours', 1);
  v_max_days   int := setting_int('max_days_ahead', 30);
  v_dow        int := extract(dow from p_date)::int;
begin
  select s.duration_minutes into v_dur from services s where s.id = p_service and s.is_active;
  if v_dur is null then return; end if;
  if p_date < v_now::date or p_date > v_now::date + v_max_days then return; end if;

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

-- ---------------------------------------------------------------------
-- 6. Notificaciones
-- ---------------------------------------------------------------------
create or replace function enqueue_notifications(p_appointment uuid, p_with_confirmation boolean)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_start timestamptz;
begin
  select ((a.date + a.start_time) at time zone 'America/Bogota') into v_start
    from appointments a where a.id = p_appointment;
  if v_start is null then return; end if;

  if p_with_confirmation then
    insert into notifications (appointment_id, kind, scheduled_for)
    values (p_appointment, 'confirmation', now());
  end if;
  if v_start - interval '24 hours' > now() then
    insert into notifications (appointment_id, kind, scheduled_for)
    values (p_appointment, 'reminder_24h', v_start - interval '24 hours');
  end if;
  if v_start - interval '2 hours' > now() then
    insert into notifications (appointment_id, kind, scheduled_for)
    values (p_appointment, 'reminder_2h', v_start - interval '2 hours');
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- 7. Reserva pública (cliente sin cuenta)
-- ---------------------------------------------------------------------
create or replace function book_appointment(
  p_service  uuid,
  p_date     date,
  p_time     time,
  p_barber   uuid,     -- null = cualquier barbero
  p_name     text,
  p_phone    text,
  p_notes    text default null
)
returns table (appointment_id uuid, cancel_token uuid, barber_name text)
language plpgsql security definer set search_path = public
as $$
declare
  v_phone    text := normalize_phone(p_phone);
  v_dur      int;
  v_price    numeric;
  v_barber   uuid;
  v_client   uuid;
  v_id       uuid;
  v_token    uuid;
  v_bname    text;
begin
  if length(trim(coalesce(p_name, ''))) < 2 then raise exception 'invalid_name'; end if;
  if v_phone !~ '^[0-9]{10,15}$' then raise exception 'invalid_phone'; end if;

  select s.duration_minutes, s.price into v_dur, v_price
    from services s where s.id = p_service and s.is_active;
  if v_dur is null then raise exception 'service_unavailable'; end if;

  -- El horario debe estar realmente disponible (y el barbero se resuelve aquí)
  select g.barber_id into v_barber
    from get_available_slots(p_service, p_date, p_barber) g
   where g.slot_time = p_time
   limit 1;
  if v_barber is null then raise exception 'slot_unavailable'; end if;

  -- Cliente por teléfono (no se pisa el nombre de uno existente)
  select c.id into v_client from clients c where normalize_phone(c.phone) = v_phone limit 1;
  if v_client is null then
    begin
      insert into clients (name, phone) values (trim(p_name), v_phone) returning id into v_client;
    exception when unique_violation then
      select c.id into v_client from clients c where normalize_phone(c.phone) = v_phone limit 1;
    end;
  end if;

  -- Freno básico a abuso: máximo 3 citas futuras activas por cliente
  if (select count(*) from appointments a
       where a.client_id = v_client
         and a.status in ('pending', 'confirmed')
         and (a.date + a.start_time) > local_now()) >= 3 then
    raise exception 'booking_limit';
  end if;

  begin
    insert into appointments (admin_id, client_id, barber_id, service_id, date, start_time, end_time,
                              status, notes, client_name, client_phone, source, price)
    values (default_admin_id(), v_client, v_barber, p_service, p_date, p_time,
            p_time + make_interval(mins => v_dur), 'confirmed',
            nullif(trim(coalesce(p_notes, '')), ''), trim(p_name), v_phone, 'web', v_price)
    returning id, appointments.cancel_token into v_id, v_token;
  exception when exclusion_violation then
    raise exception 'slot_unavailable';
  end;

  perform enqueue_notifications(v_id, true);

  select b.name into v_bname from barbers b where b.id = v_barber;
  return query select v_id, v_token, v_bname;
end;
$$;

-- ---------------------------------------------------------------------
-- 8. Ver / cancelar con el enlace privado
-- ---------------------------------------------------------------------
create or replace function get_appointment_by_token(p_token uuid)
returns table (
  appointment_id uuid, date date, start_time time, end_time time, status text,
  barber_name text, service_name text, price numeric, can_cancel boolean, business_address text
)
language sql stable security definer set search_path = public
as $$
  select a.id, a.date, a.start_time, a.end_time, a.status, b.name, s.name, coalesce(a.price, s.price),
         (a.status in ('pending', 'confirmed')
          and (a.date + a.start_time) > local_now() + make_interval(hours => setting_int('cancel_before_hours', 2))),
         (select value from business_settings where key = 'business_address')
    from appointments a
    left join barbers  b on b.id = a.barber_id
    left join services s on s.id = a.service_id
   where a.cancel_token = p_token;
$$;

create or replace function cancel_appointment_by_token(p_token uuid)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare
  v_id uuid;
begin
  update appointments a set status = 'cancelled'
   where a.cancel_token = p_token
     and a.status in ('pending', 'confirmed')
     and (a.date + a.start_time) > local_now() + make_interval(hours => setting_int('cancel_before_hours', 2))
  returning a.id into v_id;
  return v_id is not null;
end;
$$;

-- ---------------------------------------------------------------------
-- 9. Cita interna (barbero o admin): walk-in o tomada por teléfono
--    Sin teléfono se usa el cliente genérico 'mostrador' (sin WhatsApp).
-- ---------------------------------------------------------------------
create or replace function create_staff_appointment(
  p_barber  uuid,
  p_service uuid,
  p_date    date,
  p_time    time,
  p_name    text default null,
  p_phone   text default null,
  p_source  text default 'walk_in'
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_phone  text := nullif(normalize_phone(p_phone), '');
  v_dur    int;
  v_price  numeric;
  v_client uuid;
  v_id     uuid;
begin
  if not (is_admin() or my_barber_id() = p_barber) then raise exception 'not_authorized'; end if;
  if p_source not in ('walk_in', 'staff') then raise exception 'invalid_source'; end if;

  select s.duration_minutes, s.price into v_dur, v_price
    from services s where s.id = p_service and s.is_active;
  if v_dur is null then raise exception 'service_unavailable'; end if;

  if v_phone is null then
    select c.id into v_client from clients c where c.phone = 'mostrador';
    if v_client is null then
      insert into clients (name, phone, whatsapp_opt_in) values ('Cliente de mostrador', 'mostrador', false)
      on conflict (phone) do nothing returning id into v_client;
      if v_client is null then select c.id into v_client from clients c where c.phone = 'mostrador'; end if;
    end if;
  else
    if v_phone !~ '^[0-9]{10,15}$' then raise exception 'invalid_phone'; end if;
    select c.id into v_client from clients c where normalize_phone(c.phone) = v_phone limit 1;
    if v_client is null then
      insert into clients (name, phone) values (coalesce(nullif(trim(p_name), ''), 'Cliente'), v_phone)
      returning id into v_client;
    end if;
  end if;

  begin
    insert into appointments (admin_id, client_id, barber_id, service_id, date, start_time, end_time,
                              status, client_name, client_phone, source, price)
    values (default_admin_id(), v_client, p_barber, p_service, p_date, p_time,
            p_time + make_interval(mins => v_dur), 'confirmed',
            nullif(trim(coalesce(p_name, '')), ''), v_phone, p_source, v_price)
    returning id into v_id;
  exception when exclusion_violation then
    raise exception 'slot_unavailable';
  end;

  if v_phone is not null then perform enqueue_notifications(v_id, true); end if;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------
-- 10. Fidelización
-- ---------------------------------------------------------------------
create or replace function accumulate_loyalty(p_appointment uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_a record;
  v_r record;
begin
  select a.client_id, a.service_id, a.reward_rule_id into v_a from appointments a where a.id = p_appointment;
  if v_a.client_id is null or v_a.reward_rule_id is not null then return; end if;
  if exists (select 1 from clients c where c.id = v_a.client_id and c.phone = 'mostrador') then return; end if;

  for v_r in
    select r.id, r.visits_required from loyalty_rules r
     where r.is_active and (r.service_id is null or r.service_id = v_a.service_id)
  loop
    insert into loyalty_balances (client_id, rule_id, visits)
    values (v_a.client_id, v_r.id, 1)
    on conflict (client_id, rule_id) do update set visits = loyalty_balances.visits + 1;

    update loyalty_balances lb
       set visits = lb.visits - v_r.visits_required,
           rewards_available = lb.rewards_available + 1
     where lb.client_id = v_a.client_id and lb.rule_id = v_r.id and lb.visits >= v_r.visits_required;
  end loop;
end;
$$;

create or replace function apply_loyalty_reward(p_appointment uuid, p_rule uuid)
returns numeric
language plpgsql security definer set search_path = public
as $$
declare
  v_a   record;
  v_r   record;
  v_new numeric;
begin
  select a.id, a.barber_id, a.client_id, a.service_id, a.status, coalesce(a.price, s.price) as price, a.reward_rule_id
    into v_a from appointments a left join services s on s.id = a.service_id where a.id = p_appointment;
  if v_a.id is null then raise exception 'appointment_not_found'; end if;
  if not (is_admin() or my_barber_id() = v_a.barber_id) then raise exception 'not_authorized'; end if;
  if v_a.status not in ('pending', 'confirmed') then raise exception 'appointment_locked'; end if;
  if v_a.reward_rule_id is not null then raise exception 'reward_already_applied'; end if;

  select r.* into v_r from loyalty_rules r
   where r.id = p_rule and r.is_active and (r.service_id is null or r.service_id = v_a.service_id);
  if v_r.id is null then raise exception 'rule_not_applicable'; end if;

  update loyalty_balances lb set rewards_available = lb.rewards_available - 1
   where lb.client_id = v_a.client_id and lb.rule_id = p_rule and lb.rewards_available > 0;
  if not found then raise exception 'no_rewards_available'; end if;

  v_new := case v_r.reward_type
    when 'free'    then 0
    when 'percent' then round(v_a.price * (1 - v_r.reward_value / 100.0))
    when 'amount'  then greatest(0, v_a.price - v_r.reward_value)
  end;

  update appointments set price = v_new, reward_rule_id = p_rule where id = p_appointment;
  return v_new;
end;
$$;

-- ---------------------------------------------------------------------
-- 11. Triggers de citas
-- ---------------------------------------------------------------------

-- Toda cita guarda el precio vigente del servicio al crearse
create or replace function appointments_set_price()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.price is null and new.service_id is not null then
    select s.price into new.price from services s where s.id = new.service_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_appointments_price on appointments;
create trigger trg_appointments_price
  before insert on appointments
  for each row execute function appointments_set_price();

create or replace function on_appointment_update()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.status is distinct from old.status then
    if new.status = 'cancelled' and old.status in ('pending', 'confirmed') then
      update notifications set status = 'skipped' where appointment_id = new.id and status = 'pending';
      insert into notifications (appointment_id, kind, scheduled_for)
      values (new.id, 'cancellation', now());
    end if;

    if new.status in ('completed', 'no_show') then
      update notifications set status = 'skipped' where appointment_id = new.id and status = 'pending';
    end if;

    if new.status = 'completed' and old.status <> 'completed' then
      perform accumulate_loyalty(new.id);
    end if;
  end if;

  -- Si se mueve la cita, los recordatorios pendientes se recalculan
  if new.status in ('pending', 'confirmed')
     and (new.date is distinct from old.date or new.start_time is distinct from old.start_time) then
    update notifications set status = 'skipped'
     where appointment_id = new.id and status = 'pending' and kind in ('reminder_24h', 'reminder_2h');
    perform enqueue_notifications(new.id, false);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_appointments_update on appointments;
create trigger trg_appointments_update
  after update on appointments
  for each row execute function on_appointment_update();

-- ---------------------------------------------------------------------
-- 12. RLS — se reemplazan TODAS las políticas de estas tablas por un
--     conjunto conocido (las del repo y las que se hayan agregado a mano).
-- ---------------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in
    select schemaname, tablename, policyname from pg_policies
     where schemaname = 'public'
       and tablename in ('admin_users', 'barbers', 'barber_schedules', 'barber_breaks',
                         'schedule_overrides', 'time_off', 'clients', 'services', 'appointments',
                         'expenses', 'reminders', 'profiles', 'business_settings', 'notifications',
                         'loyalty_rules', 'loyalty_balances')
  loop
    execute format('drop policy %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;

alter table barber_breaks       enable row level security;
alter table schedule_overrides  enable row level security;
alter table time_off            enable row level security;
alter table business_settings   enable row level security;
alter table notifications       enable row level security;
alter table loyalty_rules       enable row level security;
alter table loyalty_balances    enable row level security;

-- Privilegios: el visitante anónimo solo lee catálogo; todo lo demás va por funciones.
revoke all on admin_users, barbers, barber_schedules, barber_breaks, schedule_overrides, time_off,
              clients, services, appointments, expenses, reminders, profiles, business_settings,
              notifications, loyalty_rules, loyalty_balances
  from anon;

grant select (id, name, photo_url, specialty, is_active) on barbers to anon;     -- sin email ni teléfono
grant select on services to anon;
grant select on barber_schedules to anon;
grant select on business_settings to anon;

-- admin_users
create policy admin_users_select on admin_users for select using (auth_id = auth.uid() or is_admin());
create policy admin_users_update on admin_users for update using (auth_id = auth.uid()) with check (auth_id = auth.uid());

-- barbers
create policy barbers_public on barbers for select using (is_active);
create policy barbers_admin  on barbers for all using (is_admin()) with check (is_admin());
create policy barbers_self   on barbers for select using (auth_id = auth.uid());

-- barber_schedules / breaks
create policy schedules_public on barber_schedules for select using (true);
create policy schedules_admin  on barber_schedules for all using (is_admin()) with check (is_admin());
create policy breaks_read  on barber_breaks for select using (is_admin() or barber_id = my_barber_id());
create policy breaks_admin on barber_breaks for all using (is_admin()) with check (is_admin());

-- excepciones y bloqueos: admin y el propio barbero
create policy overrides_own on schedule_overrides for all
  using (is_admin() or barber_id = my_barber_id()) with check (is_admin() or barber_id = my_barber_id());
create policy time_off_own on time_off for all
  using (is_admin() or barber_id = my_barber_id()) with check (is_admin() or barber_id = my_barber_id());

-- services
create policy services_public on services for select using (is_active);
create policy services_admin  on services for all using (is_admin()) with check (is_admin());

-- clients
create policy clients_admin on clients for all using (is_admin()) with check (is_admin());
create policy clients_barber on clients for select using (
  exists (select 1 from appointments a where a.client_id = clients.id and a.barber_id = my_barber_id())
);

-- appointments
create policy appointments_admin on appointments for all using (is_admin()) with check (is_admin());
create policy appointments_barber_read on appointments for select using (barber_id = my_barber_id());
create policy appointments_barber_update on appointments for update
  using (barber_id = my_barber_id()) with check (barber_id = my_barber_id());

-- finanzas y recordatorios internos: solo admin
create policy expenses_admin  on expenses  for all using (is_admin()) with check (is_admin());
create policy reminders_admin on reminders for all using (is_admin()) with check (is_admin());

-- profiles
create policy profiles_self_read   on profiles for select using (id = auth.uid() or is_admin());
create policy profiles_self_update on profiles for update using (id = auth.uid()) with check (id = auth.uid());

-- ajustes: algunas claves públicas
create policy settings_public on business_settings for select
  using (key in ('business_name', 'business_address', 'max_days_ahead'));
create policy settings_admin on business_settings for all using (is_admin()) with check (is_admin());

-- notificaciones y fidelización
create policy notifications_admin on notifications for all using (is_admin()) with check (is_admin());
create policy loyalty_rules_read  on loyalty_rules for select using (is_admin() or my_barber_id() is not null);
create policy loyalty_rules_admin on loyalty_rules for all using (is_admin()) with check (is_admin());
create policy loyalty_balances_read on loyalty_balances for select using (
  is_admin() or exists (select 1 from appointments a where a.client_id = loyalty_balances.client_id and a.barber_id = my_barber_id())
);
create policy loyalty_balances_admin on loyalty_balances for all using (is_admin()) with check (is_admin());

-- ---------------------------------------------------------------------
-- 13. Permisos de ejecución
-- ---------------------------------------------------------------------
revoke execute on function enqueue_notifications(uuid, boolean) from public, anon, authenticated;
revoke execute on function accumulate_loyalty(uuid)             from public, anon, authenticated;
revoke execute on function on_appointment_update()              from public, anon, authenticated;
revoke execute on function appointments_set_price()             from public, anon, authenticated;
revoke execute on function public.handle_new_user()             from public, anon, authenticated;
revoke execute on function create_staff_appointment(uuid, uuid, date, time, text, text, text) from public, anon;
revoke execute on function apply_loyalty_reward(uuid, uuid)     from public, anon;

grant execute on function get_available_slots(uuid, date, uuid)                       to anon, authenticated;
grant execute on function book_appointment(uuid, date, time, uuid, text, text, text)  to anon, authenticated;
grant execute on function get_appointment_by_token(uuid)                              to anon, authenticated;
grant execute on function cancel_appointment_by_token(uuid)                           to anon, authenticated;
grant execute on function create_staff_appointment(uuid, uuid, date, time, text, text, text) to authenticated;
grant execute on function apply_loyalty_reward(uuid, uuid)                            to authenticated;
