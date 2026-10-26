-- =====================================================================
-- Fidelización configurable
-- Requiere: 20261026000001_hardening.sql. Idempotente.
--
-- Cómo funciona:
--   * Una REGLA dice: "cada N visitas [de tal servicio o de cualquiera] →
--     premio (gratis / % de descuento / valor fijo)". Puede haber varias.
--   * Al COMPLETAR una cita, el cliente suma una visita en cada regla activa
--     que aplique; al llegar a N gana un premio y el contador vuelve a empezar.
--   * El premio se APLICA a una cita antes de completarla (cambia su precio).
--     La cita en la que se usa un premio no suma visita.
--   * Todo queda en loyalty_events (historial / constancia).
--
-- Cambios respecto a la versión inicial:
--   - Historial de eventos (loyalty_events).
--   - Se puede aplicar el premio con la cita "en curso" (antes solo pendiente/confirmada).
--   - Si se cancela o no llega una cita con premio aplicado, el premio se devuelve.
--   - Si una cita completada se "descompleta", se resta la visita sumada.
--   - Los premios ya ganados se respetan aunque la regla se desactive.
--   - Ajuste manual de saldos (para cargar el avance que los clientes ya traen).
--   - El cliente ve su avance desde el enlace de su cita.
-- =====================================================================

-- ---------- Reglas: descripción, fechas y validación del premio ----------
alter table loyalty_rules add column if not exists description text;
alter table loyalty_rules add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'loyalty_rules_reward_valid') then
    alter table loyalty_rules add constraint loyalty_rules_reward_valid check (
      (reward_type = 'free') or
      (reward_type = 'percent' and reward_value > 0 and reward_value <= 100) or
      (reward_type = 'amount'  and reward_value > 0)
    );
  end if;
  if not exists (select 1 from pg_constraint where conname = 'loyalty_rules_name_len') then
    alter table loyalty_rules add constraint loyalty_rules_name_len check (length(trim(name)) between 2 and 80);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'loyalty_balances_non_negative') then
    alter table loyalty_balances add constraint loyalty_balances_non_negative check (visits >= 0 and rewards_available >= 0);
  end if;
end $$;

create or replace function loyalty_rules_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists trg_loyalty_rules_touch on loyalty_rules;
create trigger trg_loyalty_rules_touch before update on loyalty_rules
  for each row execute function loyalty_rules_touch();

-- Precio que tenía la cita antes de aplicar el premio (para devolverlo exacto)
alter table appointments add column if not exists price_before_reward numeric(10,2);

-- ---------- Historial ----------
create table if not exists loyalty_events (
  id              uuid primary key default gen_random_uuid(),
  client_id       uuid not null references clients on delete cascade,
  rule_id         uuid not null references loyalty_rules on delete cascade,
  appointment_id  uuid references appointments on delete set null,
  kind            text not null check (kind in ('visit', 'visit_reverted', 'reward_earned', 'reward_redeemed',
                                                'reward_returned', 'manual')),
  visits_delta    integer not null default 0,
  rewards_delta   integer not null default 0,
  note            text,
  created_by      uuid,
  created_at      timestamptz not null default clock_timestamp()  -- hora real de cada evento
);
alter table loyalty_events alter column created_at set default clock_timestamp();
create index if not exists loyalty_events_client on loyalty_events (client_id, created_at desc);
create index if not exists loyalty_events_created on loyalty_events (created_at desc);

-- ---------- Sumar visita al completar ----------
create or replace function accumulate_loyalty(p_appointment uuid)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_a record;
  v_r record;
  v_visits int;
begin
  select a.client_id, a.service_id, a.reward_rule_id into v_a from appointments a where a.id = p_appointment;
  -- Sin cliente, cliente de mostrador o cita pagada con premio: no suma
  if v_a.client_id is null or v_a.reward_rule_id is not null then return; end if;
  if exists (select 1 from clients c where c.id = v_a.client_id and c.phone = 'mostrador') then return; end if;
  -- Evita sumar dos veces la misma cita
  if exists (select 1 from loyalty_events e where e.appointment_id = p_appointment and e.kind = 'visit'
             and not exists (select 1 from loyalty_events r where r.appointment_id = p_appointment
                             and r.rule_id = e.rule_id and r.kind = 'visit_reverted' and r.created_at > e.created_at)) then
    return;
  end if;

  for v_r in
    select r.id, r.visits_required from loyalty_rules r
     where r.is_active and (r.service_id is null or r.service_id = v_a.service_id)
  loop
    insert into loyalty_balances (client_id, rule_id, visits)
    values (v_a.client_id, v_r.id, 1)
    on conflict (client_id, rule_id) do update set visits = loyalty_balances.visits + 1
    returning visits into v_visits;

    insert into loyalty_events (client_id, rule_id, appointment_id, kind, visits_delta)
    values (v_a.client_id, v_r.id, p_appointment, 'visit', 1);

    if v_visits >= v_r.visits_required then
      update loyalty_balances
         set visits = visits - v_r.visits_required,
             rewards_available = rewards_available + 1
       where client_id = v_a.client_id and rule_id = v_r.id;
      insert into loyalty_events (client_id, rule_id, appointment_id, kind, visits_delta, rewards_delta)
      values (v_a.client_id, v_r.id, p_appointment, 'reward_earned', -v_r.visits_required, 1);
    end if;
  end loop;
end;
$$;

-- ---------- Restar la visita si la cita deja de estar completada ----------
create or replace function revert_loyalty_visit(p_appointment uuid)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_e record;
  v_required int;
  v_bal record;
begin
  for v_e in
    select distinct on (e.rule_id) e.rule_id, e.client_id, e.kind
      from loyalty_events e
     where e.appointment_id = p_appointment and e.kind in ('visit', 'visit_reverted')
     order by e.rule_id, e.created_at desc
  loop
    continue when v_e.kind <> 'visit';  -- ya revertida
    select visits_required into v_required from loyalty_rules where id = v_e.rule_id;
    select * into v_bal from loyalty_balances where client_id = v_e.client_id and rule_id = v_e.rule_id for update;
    if v_bal.visits > 0 then
      update loyalty_balances set visits = visits - 1 where client_id = v_e.client_id and rule_id = v_e.rule_id;
      insert into loyalty_events (client_id, rule_id, appointment_id, kind, visits_delta)
      values (v_e.client_id, v_e.rule_id, p_appointment, 'visit_reverted', -1);
    elsif v_bal.rewards_available > 0 then
      -- Esa visita había completado un premio que aún no se usa: se deshace el premio
      update loyalty_balances set visits = v_required - 1, rewards_available = rewards_available - 1
       where client_id = v_e.client_id and rule_id = v_e.rule_id;
      insert into loyalty_events (client_id, rule_id, appointment_id, kind, visits_delta, rewards_delta, note)
      values (v_e.client_id, v_e.rule_id, p_appointment, 'visit_reverted', v_required - 1, -1, 'Se deshizo el premio que había completado');
    else
      -- El premio ya se usó: no se puede deshacer, solo se deja constancia
      insert into loyalty_events (client_id, rule_id, appointment_id, kind, note)
      values (v_e.client_id, v_e.rule_id, p_appointment, 'visit_reverted', 'Sin efecto: el premio ya se había usado');
    end if;
  end loop;
end;
$$;

-- ---------- Aplicar / quitar premio en una cita ----------
create or replace function apply_loyalty_reward(p_appointment uuid, p_rule uuid)
returns numeric
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_a   record;
  v_r   record;
  v_new numeric;
begin
  select a.id, a.barber_id, a.client_id, a.service_id, a.status, coalesce(a.price, s.price) as price, a.reward_rule_id
    into v_a from appointments a left join services s on s.id = a.service_id where a.id = p_appointment
     for update of a;
  if v_a.id is null then raise exception 'appointment_not_found'; end if;
  if not (is_admin() or my_barber_id() = v_a.barber_id) then raise exception 'not_authorized'; end if;
  if v_a.status not in ('pending', 'confirmed', 'in_progress') then raise exception 'appointment_locked'; end if;
  if v_a.reward_rule_id is not null then raise exception 'reward_already_applied'; end if;

  -- Los premios ganados se respetan aunque la regla esté desactivada
  select r.* into v_r from loyalty_rules r
   where r.id = p_rule and (r.service_id is null or r.service_id = v_a.service_id);
  if v_r.id is null then raise exception 'rule_not_applicable'; end if;

  update loyalty_balances lb set rewards_available = lb.rewards_available - 1
   where lb.client_id = v_a.client_id and lb.rule_id = p_rule and lb.rewards_available > 0;
  if not found then raise exception 'no_rewards_available'; end if;

  v_new := case v_r.reward_type
    when 'free'    then 0
    when 'percent' then round(v_a.price * (1 - v_r.reward_value / 100.0))
    when 'amount'  then greatest(0, v_a.price - v_r.reward_value)
  end;

  update appointments set price = v_new, reward_rule_id = p_rule, price_before_reward = v_a.price where id = p_appointment;
  insert into loyalty_events (client_id, rule_id, appointment_id, kind, rewards_delta, note, created_by)
  values (v_a.client_id, p_rule, p_appointment, 'reward_redeemed', -1,
          'Precio ' || v_a.price || ' → ' || v_new, auth.uid());
  return v_new;
end;
$$;

-- Devuelve el premio (interno): la cita recupera su precio anterior y el cliente +1 premio
create or replace function return_loyalty_reward_internal(p_appointment uuid, p_note text)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_a record;
begin
  select a.id, a.client_id, a.reward_rule_id, coalesce(a.price_before_reward, s.price) as restore_price
    into v_a from appointments a left join services s on s.id = a.service_id where a.id = p_appointment;
  if v_a.reward_rule_id is null then return; end if;

  insert into loyalty_balances (client_id, rule_id, rewards_available)
  values (v_a.client_id, v_a.reward_rule_id, 1)
  on conflict (client_id, rule_id) do update set rewards_available = loyalty_balances.rewards_available + 1;

  -- Este UPDATE dispara on_appointment_update, pero ya no cambia el estado: no hay recursión
  update appointments set reward_rule_id = null, price = v_a.restore_price, price_before_reward = null where id = p_appointment;

  insert into loyalty_events (client_id, rule_id, appointment_id, kind, rewards_delta, note, created_by)
  values (v_a.client_id, v_a.reward_rule_id, p_appointment, 'reward_returned', 1, p_note, auth.uid());
end;
$$;

-- Quitar un premio aplicado por error (antes de completar la cita)
create or replace function remove_loyalty_reward(p_appointment uuid)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_a record;
begin
  select a.id, a.barber_id, a.status, a.reward_rule_id into v_a from appointments a where a.id = p_appointment for update;
  if v_a.id is null then raise exception 'appointment_not_found'; end if;
  if not (is_admin() or my_barber_id() = v_a.barber_id) then raise exception 'not_authorized'; end if;
  if v_a.reward_rule_id is null then raise exception 'no_reward_applied'; end if;
  if v_a.status not in ('pending', 'confirmed', 'in_progress') then raise exception 'appointment_locked'; end if;
  perform return_loyalty_reward_internal(p_appointment, 'Premio quitado de la cita');
end;
$$;

-- ---------- Ajuste manual (solo admin): fija visitas y premios disponibles ----------
create or replace function adjust_loyalty_balance(
  p_client  uuid,
  p_rule    uuid,
  p_visits  int,
  p_rewards int,
  p_note    text
)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_old record;
  v_required int;
begin
  if not is_admin() then raise exception 'not_authorized'; end if;
  if p_visits is null or p_visits < 0 or p_rewards is null or p_rewards < 0 then raise exception 'invalid_quantity'; end if;
  if coalesce(trim(p_note), '') = '' then raise exception 'note_required'; end if;
  select visits_required into v_required from loyalty_rules where id = p_rule;
  if v_required is null then raise exception 'rule_not_found'; end if;
  if p_visits >= v_required then raise exception 'visits_over_limit'; end if;
  if not exists (select 1 from clients where id = p_client) then raise exception 'client_not_found'; end if;

  select visits, rewards_available into v_old from loyalty_balances
   where client_id = p_client and rule_id = p_rule for update;

  insert into loyalty_balances (client_id, rule_id, visits, rewards_available)
  values (p_client, p_rule, p_visits, p_rewards)
  on conflict (client_id, rule_id) do update set visits = excluded.visits, rewards_available = excluded.rewards_available;

  insert into loyalty_events (client_id, rule_id, kind, visits_delta, rewards_delta, note, created_by)
  values (p_client, p_rule, 'manual',
          p_visits - coalesce(v_old.visits, 0), p_rewards - coalesce(v_old.rewards_available, 0),
          trim(p_note), auth.uid());
end;
$$;

-- ---------- El cliente ve su avance desde el enlace de su cita ----------
create or replace function get_loyalty_by_token(p_token uuid)
returns table (rule_name text, description text, visits int, visits_required int,
               rewards_available int, reward_type text, reward_value numeric, service_name text)
language sql stable security definer set search_path = public, pg_temp
as $$
  select r.name, r.description, coalesce(b.visits, 0), r.visits_required, coalesce(b.rewards_available, 0),
         r.reward_type, r.reward_value, s.name
    from appointments a
    join loyalty_rules r on r.is_active or exists (
           select 1 from loyalty_balances b2 where b2.client_id = a.client_id and b2.rule_id = r.id and b2.rewards_available > 0)
    left join loyalty_balances b on b.client_id = a.client_id and b.rule_id = r.id
    left join services s on s.id = r.service_id
   where a.cancel_token = p_token and a.client_id is not null
   order by r.visits_required;
$$;

-- ---------- Trigger de citas: añade devolución de premio y reversa de visita ----------
create or replace function on_appointment_update()
returns trigger
language plpgsql security definer set search_path = public, pg_temp
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

    -- Cita con premio aplicado que no se realizó: el premio vuelve al cliente
    if new.status in ('cancelled', 'no_show') and new.reward_rule_id is not null then
      perform return_loyalty_reward_internal(new.id,
        case new.status when 'cancelled' then 'Cita cancelada' else 'El cliente no llegó' end);
    end if;

    if new.status = 'completed' and old.status <> 'completed' then
      perform accumulate_loyalty(new.id);
    end if;

    -- Se deshace un "completada" (error al marcar): se resta la visita sumada
    if old.status = 'completed' and new.status <> 'completed' then
      perform revert_loyalty_visit(new.id);
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

-- ---------- Seguridad ----------
alter table loyalty_events enable row level security;
drop policy if exists loyalty_events_read on loyalty_events;
create policy loyalty_events_read on loyalty_events for select using (
  is_admin() or exists (select 1 from appointments a where a.client_id = loyalty_events.client_id and a.barber_id = my_barber_id())
);

-- Saldos e historial solo cambian con las funciones (quedan en el historial)
revoke all on loyalty_events from anon;
revoke insert, update, delete on loyalty_events, loyalty_balances from authenticated;
grant select on loyalty_events, loyalty_balances to authenticated;
-- Reglas: el admin las crea y edita desde la app (RLS: loyalty_rules_admin). Sin borrar:
-- borrar una regla borraría en cascada el avance de los clientes; se desactiva.
revoke delete on loyalty_rules from authenticated;
grant select, insert, update on loyalty_rules to authenticated;

revoke execute on function accumulate_loyalty(uuid)                      from public, anon, authenticated;
revoke execute on function revert_loyalty_visit(uuid)                    from public, anon, authenticated;
revoke execute on function return_loyalty_reward_internal(uuid, text)    from public, anon, authenticated;
revoke execute on function apply_loyalty_reward(uuid, uuid)              from public, anon;
revoke execute on function remove_loyalty_reward(uuid)                   from public, anon;
revoke execute on function adjust_loyalty_balance(uuid, uuid, int, int, text) from public, anon;
revoke execute on function get_loyalty_by_token(uuid)                    from public;
grant  execute on function apply_loyalty_reward(uuid, uuid)              to authenticated;
grant  execute on function remove_loyalty_reward(uuid)                   to authenticated;
grant  execute on function adjust_loyalty_balance(uuid, uuid, int, int, text) to authenticated;
grant  execute on function get_loyalty_by_token(uuid)                    to anon, authenticated;
