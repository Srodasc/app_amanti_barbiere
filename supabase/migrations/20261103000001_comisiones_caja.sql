-- =====================================================================
-- Comisiones de barberos y cierre de caja diario
-- Requiere: 20261031000001_citas_cobro.sql. Idempotente.
--
-- Comisiones (decisiones del negocio):
--   * Porcentaje por barbero, con porcentaje distinto opcional para servicios puntuales.
--   * Solo servicios (también los adicionales cobrados en la cita); productos sin comisión.
--   * Si la cita usó un premio, la comisión se calcula sobre el precio normal
--     (el negocio asume el premio).
--   * Se calcula y se guarda al "Completar y cobrar" (no cambia si luego cambia el %).
--   * Liquidar = registrar el pago al barbero; queda como gasto (Nómina) y las citas
--     quedan marcadas para no pagarlas dos veces.
-- Caja (una por local, la cierra el administrador):
--   esperado = base inicial + servicios en efectivo + productos en efectivo
--              − gastos pagados con efectivo de la caja
-- =====================================================================

-- ---------- Configuración de comisiones ----------
alter table barbers add column if not exists commission_pct numeric(5,2) not null default 0;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'barbers_commission_pct_check') then
    alter table barbers add constraint barbers_commission_pct_check check (commission_pct between 0 and 100);
  end if;
end $$;

create table if not exists barber_service_commissions (
  barber_id  uuid not null references barbers on delete cascade,
  service_id uuid not null references services on delete cascade,
  pct        numeric(5,2) not null check (pct between 0 and 100),
  primary key (barber_id, service_id)
);
alter table barber_service_commissions enable row level security;
drop policy if exists bsc_admin  on barber_service_commissions;
drop policy if exists bsc_barber on barber_service_commissions;
create policy bsc_admin  on barber_service_commissions for all using (is_admin()) with check (is_admin());
create policy bsc_barber on barber_service_commissions for select using (barber_id = my_barber_id());
revoke all on barber_service_commissions from anon;

-- ---------- Comisión guardada en la cita ----------
alter table appointments       add column if not exists commission_base      numeric(12,2);
alter table appointments       add column if not exists commission_amount    numeric(12,2);
alter table appointments       add column if not exists commission_payout_id uuid;
alter table appointment_extras add column if not exists commission_amount    numeric(12,2);

-- ---------- Gastos pagados con el efectivo de la caja ----------
alter table expenses add column if not exists paid_from_cash boolean not null default false;

-- ---------- Liquidaciones ----------
create table if not exists commission_payouts (
  id             uuid primary key default gen_random_uuid(),
  barber_id      uuid not null references barbers on delete restrict,
  period_from    date not null,
  period_to      date not null,
  appointments   int  not null,
  amount         numeric(12,2) not null check (amount >= 0),
  paid_from_cash boolean not null default false,
  expense_id     uuid references expenses on delete set null,
  notes          text,
  created_by     uuid,
  created_at     timestamptz not null default now()
);
create index if not exists commission_payouts_barber on commission_payouts (barber_id, created_at desc);
alter table commission_payouts enable row level security;
drop policy if exists payouts_admin  on commission_payouts;
drop policy if exists payouts_barber on commission_payouts;
create policy payouts_admin  on commission_payouts for select using (is_admin());
create policy payouts_barber on commission_payouts for select using (barber_id = my_barber_id());
revoke all on commission_payouts from anon;
revoke insert, update, delete on commission_payouts from authenticated;
grant select on commission_payouts to authenticated;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'appointments_commission_payout_fk') then
    alter table appointments add constraint appointments_commission_payout_fk
      foreign key (commission_payout_id) references commission_payouts (id) on delete set null;
  end if;
end $$;
create index if not exists appointments_commission_pending on appointments (barber_id, paid_at) where commission_payout_id is null;

-- Porcentaje que aplica a un barbero en un servicio
create or replace function commission_pct_for(p_barber uuid, p_service uuid)
returns numeric
language sql stable security definer set search_path = public, pg_temp
as $$
  select coalesce(
    (select pct from barber_service_commissions where barber_id = p_barber and service_id = p_service),
    (select commission_pct from barbers where id = p_barber),
    0);
$$;
revoke execute on function commission_pct_for(uuid, uuid) from public, anon, authenticated;

-- ---------- Completar y cobrar: ahora también guarda la comisión ----------
create or replace function complete_appointment(p_appointment uuid, p_payment text, p_extras jsonb default '[]'::jsonb)
returns numeric
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_a      record;
  v_extras numeric(12,2) := 0;
  v_total  numeric(12,2);
  v_base   numeric(12,2);
  v_comm   numeric(12,2);
begin
  select a.id, a.barber_id, a.service_id, a.status, a.reward_rule_id,
         coalesce(a.price, s.price, 0) as price,
         -- con premio: comisión sobre el precio normal
         case when a.reward_rule_id is not null then coalesce(a.price_before_reward, s.price, a.price, 0)
              else coalesce(a.price, s.price, 0) end as base
    into v_a
    from appointments a left join services s on s.id = a.service_id
   where a.id = p_appointment
     for update of a;
  if v_a.id is null then raise exception 'appointment_not_found'; end if;
  if not (is_admin() or my_barber_id() = v_a.barber_id) then raise exception 'not_authorized'; end if;
  if v_a.status not in ('pending', 'confirmed', 'in_progress') then raise exception 'appointment_locked'; end if;
  if p_payment not in ('cash', 'card', 'transfer', 'other') then raise exception 'invalid_payment'; end if;
  if p_extras is null or jsonb_typeof(p_extras) <> 'array' then p_extras := '[]'::jsonb; end if;

  insert into appointment_extras (appointment_id, service_id, name, price, commission_amount)
  select p_appointment, s.id, s.name, s.price,
         case when v_a.barber_id is null then 0
              else round(s.price * commission_pct_for(v_a.barber_id, s.id) / 100.0, 0) end
    from jsonb_array_elements_text(p_extras) e
    join services s on s.id = e::uuid and s.is_active;

  select coalesce(sum(price), 0), coalesce(sum(commission_amount), 0)
    into v_extras, v_comm
    from appointment_extras where appointment_id = p_appointment;
  v_total := v_a.price + v_extras;
  v_base  := v_a.base + v_extras;
  if v_a.barber_id is not null then
    v_comm := v_comm + round(v_a.base * commission_pct_for(v_a.barber_id, v_a.service_id) / 100.0, 0);
  else
    v_comm := 0;
  end if;

  perform set_config('app.completing', 'on', true);
  update appointments
     set status = 'completed',
         payment_method = p_payment,
         paid_amount = v_total,
         paid_at = now(),
         completed_by = auth.uid(),
         commission_base = v_base,
         commission_amount = v_comm
   where id = p_appointment;  -- el trigger de citas suma la visita de fidelización

  return v_total;
end;
$$;

-- Al reabrir una cita completada se borra su cobro y su comisión; si ya se le pagó
-- la comisión al barbero, no se permite (habría que anular la liquidación primero).
create or replace function appointments_payment_guard()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.status = 'completed' and old.status is distinct from 'completed'
     and coalesce(current_setting('app.completing', true), '') <> 'on' then
    raise exception 'use_complete_appointment' using hint = 'Completa la cita con complete_appointment para registrar el cobro';
  end if;
  if old.status = 'completed' and new.status <> 'completed' then
    if old.commission_payout_id is not null then
      raise exception 'commission_paid' using hint = 'La comisión de esta cita ya se liquidó al barbero';
    end if;
    new.payment_method := null;
    new.paid_amount := null;
    new.paid_at := null;
    new.completed_by := null;
    new.commission_base := null;
    new.commission_amount := null;
    delete from appointment_extras where appointment_id = new.id;
  end if;
  return new;
end;
$$;

-- ---------- Resumen de comisiones por barbero en un periodo (fechas de cobro, hora local) ----------
create or replace function commission_summary(p_from date, p_to date)
returns table (
  barber_id uuid, barber_name text, commission_pct numeric,
  services int, sales numeric, base numeric, commission numeric, paid numeric, pending numeric
)
language sql stable security definer set search_path = public, pg_temp
as $$
  select b.id, b.name, b.commission_pct,
         count(a.id)::int,
         coalesce(sum(a.paid_amount), 0),
         coalesce(sum(a.commission_base), 0),
         coalesce(sum(a.commission_amount), 0),
         coalesce(sum(a.commission_amount) filter (where a.commission_payout_id is not null), 0),
         coalesce(sum(a.commission_amount) filter (where a.commission_payout_id is null), 0)
    from barbers b
    left join appointments a
      on a.barber_id = b.id and a.status = 'completed' and a.paid_at is not null
     and (a.paid_at at time zone 'America/Bogota')::date between p_from and p_to
   where (is_admin() and (b.is_active or a.id is not null)) or b.id = my_barber_id()
   group by b.id, b.name, b.commission_pct
   order by b.name;
$$;

-- Detalle de las citas de un barbero en el periodo
create or replace function commission_detail(p_barber uuid, p_from date, p_to date)
returns table (
  appointment_id uuid, paid_on date, client_name text, service_name text, extras text,
  paid_amount numeric, base numeric, commission numeric, rewarded boolean, payout_id uuid
)
language sql stable security definer set search_path = public, pg_temp
as $$
  select a.id, (a.paid_at at time zone 'America/Bogota')::date,
         coalesce(c.name, a.client_name), s.name,
         (select string_agg(x.name, ', ') from appointment_extras x where x.appointment_id = a.id),
         a.paid_amount, a.commission_base, a.commission_amount, a.reward_rule_id is not null, a.commission_payout_id
    from appointments a
    left join clients c on c.id = a.client_id
    left join services s on s.id = a.service_id
   where a.barber_id = p_barber and a.status = 'completed' and a.paid_at is not null
     and (a.paid_at at time zone 'America/Bogota')::date between p_from and p_to
     and (is_admin() or p_barber = my_barber_id())
   order by a.paid_at;
$$;

-- Liquidar (pagar) las comisiones pendientes de un barbero en el periodo
create or replace function pay_commissions(p_barber uuid, p_from date, p_to date, p_from_cash boolean default false, p_notes text default null)
returns uuid
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_name   text;
  v_ids    uuid[];
  v_amount numeric(12,2);
  v_exp    uuid;
  v_pay    uuid;
begin
  if not is_admin() then raise exception 'not_authorized'; end if;
  select name into v_name from barbers where id = p_barber;
  if v_name is null then raise exception 'barber_not_found'; end if;

  select array_agg(a.id), coalesce(sum(a.commission_amount), 0)
    into v_ids, v_amount
    from appointments a
   where a.barber_id = p_barber and a.status = 'completed' and a.paid_at is not null
     and a.commission_payout_id is null and coalesce(a.commission_amount, 0) > 0
     and (a.paid_at at time zone 'America/Bogota')::date between p_from and p_to;
  if v_ids is null or v_amount <= 0 then raise exception 'nothing_to_pay'; end if;

  insert into expenses (admin_id, concept, amount, category, expense_date, notes, paid_from_cash)
  values (coalesce(my_admin_id(), default_admin_id()),
          'Comisiones ' || v_name || ' (' || to_char(p_from, 'DD/MM') || ' – ' || to_char(p_to, 'DD/MM') || ')',
          v_amount, 'payroll', local_now()::date, nullif(trim(p_notes), ''), coalesce(p_from_cash, false))
  returning id into v_exp;

  insert into commission_payouts (barber_id, period_from, period_to, appointments, amount, paid_from_cash, expense_id, notes, created_by)
  values (p_barber, p_from, p_to, array_length(v_ids, 1), v_amount, coalesce(p_from_cash, false), v_exp, nullif(trim(p_notes), ''), auth.uid())
  returning id into v_pay;

  update appointments set commission_payout_id = v_pay where id = any (v_ids);
  return v_pay;
end;
$$;

-- Anular una liquidación hecha por error: las citas vuelven a quedar pendientes y se borra su gasto
create or replace function void_commission_payout(p_payout uuid)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_exp uuid;
begin
  if not is_admin() then raise exception 'not_authorized'; end if;
  select expense_id into v_exp from commission_payouts where id = p_payout;
  if not found then raise exception 'payout_not_found'; end if;
  update appointments set commission_payout_id = null where commission_payout_id = p_payout;
  delete from commission_payouts where id = p_payout;
  if v_exp is not null then delete from expenses where id = v_exp; end if;
end;
$$;

-- ---------- Cierre de caja ----------
create table if not exists cash_closings (
  day               date primary key,
  opening_cash      numeric(12,2) not null default 0,
  services_cash     numeric(12,2) not null default 0,
  products_cash     numeric(12,2) not null default 0,
  expenses_cash     numeric(12,2) not null default 0,
  expected_cash     numeric(12,2) not null default 0,
  counted_cash      numeric(12,2) not null,
  difference        numeric(12,2) not null default 0,
  withdrawn         numeric(12,2) not null default 0 check (withdrawn >= 0),
  card_total        numeric(12,2) not null default 0,
  transfer_total    numeric(12,2) not null default 0,
  other_total       numeric(12,2) not null default 0,
  notes             text,
  closed_by         uuid,
  closed_at         timestamptz not null default now()
);
alter table cash_closings enable row level security;
drop policy if exists cash_admin on cash_closings;
create policy cash_admin on cash_closings for select using (is_admin());
revoke all on cash_closings from anon;
revoke insert, update, delete on cash_closings from authenticated;
grant select on cash_closings to authenticated;

-- Movimientos del día por medio de pago (servicios cobrados, productos vendidos, gastos con caja)
create or replace function cash_day_summary(p_day date)
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare
  v_services jsonb;
  v_products jsonb;
  v_exp      numeric(12,2);
  v_prev     record;
  v_close    jsonb;
begin
  if not is_admin() then raise exception 'not_authorized'; end if;

  select coalesce(jsonb_object_agg(m, t), '{}'::jsonb) into v_services from (
    select payment_method as m, sum(paid_amount) as t
      from appointments
     where status = 'completed' and paid_at is not null and payment_method is not null
       and (paid_at at time zone 'America/Bogota')::date = p_day
     group by payment_method) x;

  select coalesce(jsonb_object_agg(m, t), '{}'::jsonb) into v_products from (
    select payment_method as m, sum(total) as t
      from product_sales
     where status = 'completed' and (created_at at time zone 'America/Bogota')::date = p_day
     group by payment_method) x;

  select coalesce(sum(amount), 0) into v_exp from expenses where paid_from_cash and expense_date = p_day;

  select day, counted_cash, withdrawn into v_prev from cash_closings where day < p_day order by day desc limit 1;
  select to_jsonb(c) into v_close from cash_closings c where c.day = p_day;

  return jsonb_build_object(
    'day', p_day,
    'services', v_services,
    'products', v_products,
    'services_count', (select count(*) from appointments where status = 'completed' and paid_at is not null
                         and (paid_at at time zone 'America/Bogota')::date = p_day),
    'products_count', (select count(*) from product_sales where status = 'completed'
                         and (created_at at time zone 'America/Bogota')::date = p_day),
    'expenses_cash', v_exp,
    'cash_expenses', coalesce((select jsonb_agg(jsonb_build_object('concept', concept, 'amount', amount) order by created_at)
                                 from expenses where paid_from_cash and expense_date = p_day), '[]'::jsonb),
    'suggested_opening', coalesce(v_prev.counted_cash - v_prev.withdrawn, 0),
    'previous_day', v_prev.day,
    'closing', v_close
  );
end;
$$;

-- Cerrar (o volver a cerrar, para corregir) la caja de un día
create or replace function close_cash_day(p_day date, p_opening numeric, p_counted numeric, p_withdrawn numeric default 0, p_notes text default null)
returns cash_closings
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_s   jsonb;
  v_sc  numeric(12,2);
  v_pc  numeric(12,2);
  v_ex  numeric(12,2);
  v_row cash_closings;
begin
  if not is_admin() then raise exception 'not_authorized'; end if;
  if p_day > local_now()::date then raise exception 'future_day'; end if;
  if p_opening is null or p_opening < 0 or p_counted is null or p_counted < 0
     or coalesce(p_withdrawn, 0) < 0 or coalesce(p_withdrawn, 0) > p_counted then
    raise exception 'invalid_amounts';
  end if;

  v_s  := cash_day_summary(p_day);
  v_sc := coalesce((v_s->'services'->>'cash')::numeric, 0);
  v_pc := coalesce((v_s->'products'->>'cash')::numeric, 0);
  v_ex := coalesce((v_s->>'expenses_cash')::numeric, 0);

  insert into cash_closings as c (day, opening_cash, services_cash, products_cash, expenses_cash, expected_cash,
                                  counted_cash, difference, withdrawn, card_total, transfer_total, other_total,
                                  notes, closed_by, closed_at)
  values (p_day, p_opening, v_sc, v_pc, v_ex, p_opening + v_sc + v_pc - v_ex,
          p_counted, p_counted - (p_opening + v_sc + v_pc - v_ex), coalesce(p_withdrawn, 0),
          coalesce((v_s->'services'->>'card')::numeric, 0) + coalesce((v_s->'products'->>'card')::numeric, 0),
          coalesce((v_s->'services'->>'transfer')::numeric, 0) + coalesce((v_s->'products'->>'transfer')::numeric, 0),
          coalesce((v_s->'services'->>'other')::numeric, 0) + coalesce((v_s->'products'->>'other')::numeric, 0),
          nullif(trim(p_notes), ''), auth.uid(), now())
  on conflict (day) do update
     set opening_cash = excluded.opening_cash, services_cash = excluded.services_cash,
         products_cash = excluded.products_cash, expenses_cash = excluded.expenses_cash,
         expected_cash = excluded.expected_cash, counted_cash = excluded.counted_cash,
         difference = excluded.difference, withdrawn = excluded.withdrawn,
         card_total = excluded.card_total, transfer_total = excluded.transfer_total,
         other_total = excluded.other_total, notes = excluded.notes,
         closed_by = excluded.closed_by, closed_at = excluded.closed_at
  returning * into v_row;
  return v_row;
end;
$$;

revoke execute on function commission_summary(date, date)                          from public, anon;
revoke execute on function commission_detail(uuid, date, date)                     from public, anon;
revoke execute on function pay_commissions(uuid, date, date, boolean, text)         from public, anon;
revoke execute on function void_commission_payout(uuid)                            from public, anon;
revoke execute on function cash_day_summary(date)                                  from public, anon;
revoke execute on function close_cash_day(date, numeric, numeric, numeric, text)   from public, anon;
grant  execute on function commission_summary(date, date)                          to authenticated;
grant  execute on function commission_detail(uuid, date, date)                     to authenticated;
grant  execute on function pay_commissions(uuid, date, date, boolean, text)         to authenticated;
grant  execute on function void_commission_payout(uuid)                            to authenticated;
grant  execute on function cash_day_summary(date)                                  to authenticated;
grant  execute on function close_cash_day(date, numeric, numeric, numeric, text)   to authenticated;
