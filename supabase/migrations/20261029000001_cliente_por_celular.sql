-- =====================================================================
-- El celular identifica al cliente (fidelización, citas, ventas)
-- Requiere: 20261026000001_hardening.sql, 20261027000002 (my_admin_id) y 20261028000001_fidelizacion.sql. Idempotente.
--
--  1. Todos los celulares se guardan en el mismo formato (solo dígitos, con 57
--     si es un celular colombiano de 10 dígitos). Así "300 123 4567",
--     "+57 300-123-4567" y "573001234567" son el mismo cliente.
--  2. Se detectan y fusionan clientes duplicados (mismo celular), juntando
--     citas, ventas, sellos y premios.
--  3. Citas de mostrador / del panel identifican al cliente por celular.
--  4. Notas del cliente (la pantalla las pedía pero la columna no existía).
-- =====================================================================

alter table clients add column if not exists notes text;
alter table clients add column if not exists whatsapp_opt_in boolean not null default true;

-- ---------- 1. Formato único del celular ----------
create or replace function clients_normalize_phone()
returns trigger language plpgsql as $$
declare
  d text;
begin
  if new.phone is null or new.phone = 'mostrador' then return new; end if;
  d := normalize_phone(new.phone);
  if d = '' then
    new.phone := null;
  elsif d !~ '^[0-9]{7,15}$' then
    raise exception 'invalid_phone' using hint = 'El celular debe tener entre 7 y 15 dígitos';
  else
    new.phone := d;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_clients_normalize_phone on clients;
create trigger trg_clients_normalize_phone
  before insert or update of phone on clients
  for each row execute function clients_normalize_phone();

-- Normalizar los existentes que NO choquen con otro cliente
-- (los que chocan son duplicados: se fusionan desde Clientes → Duplicados)
do $$
declare
  v_fixed int;
  v_dups  int;
begin
  with norm as (
    select id, phone, normalize_phone(phone) as n
      from clients
     where phone is not null and phone <> 'mostrador'
  ), clash as (
    select n from norm group by n having count(*) > 1
  )
  update clients c set phone = norm.n
    from norm
   where c.id = norm.id
     and norm.phone <> norm.n
     and norm.n ~ '^[0-9]{7,15}$'
     and norm.n not in (select n from clash);
  get diagnostics v_fixed = row_count;

  select count(*) into v_dups from (
    select normalize_phone(phone) from clients
     where phone is not null and phone <> 'mostrador'
     group by 1 having count(*) > 1) d;

  raise notice 'Celulares normalizados: %. Grupos de clientes duplicados por fusionar: %.', v_fixed, v_dups;
end $$;

-- ---------- 2. Duplicados y fusión ----------
create or replace function find_client_duplicates()
returns table (phone text, client_ids uuid[], names text[], appointments int[])
language sql stable security definer set search_path = public, pg_temp
as $$
  select normalize_phone(c.phone),
         array_agg(c.id order by c.created_at),
         array_agg(c.name order by c.created_at),
         array_agg((select count(*)::int from appointments a where a.client_id = c.id) order by c.created_at)
    from clients c
   where is_admin() and c.phone is not null and c.phone <> 'mostrador'
   group by normalize_phone(c.phone)
  having count(*) > 1;
$$;

-- Junta p_merge dentro de p_keep y borra p_merge. Solo admin.
create or replace function merge_clients(p_keep uuid, p_merge uuid)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_keep  record;
  v_merge record;
  v_b     record;
  v_req   int;
begin
  if not is_admin() then raise exception 'not_authorized'; end if;
  if p_keep is null or p_merge is null or p_keep = p_merge then raise exception 'invalid_merge'; end if;

  -- Bloqueo en orden fijo para evitar interbloqueos
  perform 1 from clients where id in (p_keep, p_merge) order by id for update;
  select * into v_keep  from clients where id = p_keep;
  select * into v_merge from clients where id = p_merge;
  if v_keep.id is null or v_merge.id is null then raise exception 'client_not_found'; end if;
  if v_keep.phone = 'mostrador' or v_merge.phone = 'mostrador' then raise exception 'cannot_merge_counter'; end if;

  update appointments set client_id = p_keep where client_id = p_merge;
  update product_sales set client_id = p_keep where client_id = p_merge;
  update loyalty_events set client_id = p_keep where client_id = p_merge;

  -- Sellos y premios: se suman por regla
  for v_b in select * from loyalty_balances where client_id = p_merge loop
    insert into loyalty_balances (client_id, rule_id, visits, rewards_available)
    values (p_keep, v_b.rule_id, v_b.visits, v_b.rewards_available)
    on conflict (client_id, rule_id) do update
      set visits = loyalty_balances.visits + excluded.visits,
          rewards_available = loyalty_balances.rewards_available + excluded.rewards_available;

    -- Si al sumar se completaron premios, se convierten
    select visits_required into v_req from loyalty_rules where id = v_b.rule_id;
    update loyalty_balances
       set rewards_available = rewards_available + visits / v_req,
           visits = visits % v_req
     where client_id = p_keep and rule_id = v_b.rule_id and visits >= v_req;

    insert into loyalty_events (client_id, rule_id, kind, visits_delta, rewards_delta, note, created_by)
    values (p_keep, v_b.rule_id, 'manual', v_b.visits, v_b.rewards_available,
            'Fusión con el cliente duplicado "' || v_merge.name || '"', auth.uid());
  end loop;
  delete from loyalty_balances where client_id = p_merge;

  -- Datos de contacto: se conserva lo que falte en el cliente que queda
  update clients set
    email = coalesce(nullif(v_keep.email, ''), v_merge.email),
    notes = nullif(concat_ws(E'\n', nullif(v_keep.notes, ''), nullif(v_merge.notes, '')), ''),
    whatsapp_opt_in = v_keep.whatsapp_opt_in and v_merge.whatsapp_opt_in
   where id = p_keep;

  delete from clients where id = p_merge;

  -- Si el que queda tenía el celular en formato viejo, ahora sí se puede normalizar
  update clients set phone = phone
   where id = p_keep and phone is not null and normalize_phone(phone) ~ '^[0-9]{7,15}$';
end;
$$;

-- ---------- 3. Buscar por celular (panel y mostrador) ----------
create or replace function lookup_client_by_phone(p_phone text)
returns table (id uuid, name text, phone text, visits_total int, rewards_available int, last_visit date)
language sql stable security definer set search_path = public, pg_temp
as $$
  select c.id, c.name, c.phone,
         (select count(*)::int from appointments a where a.client_id = c.id and a.status = 'completed'),
         (select coalesce(sum(b.rewards_available), 0)::int from loyalty_balances b where b.client_id = c.id),
         (select max(a.date) from appointments a where a.client_id = c.id and a.status = 'completed')
    from clients c
   where (is_admin() or my_barber_id() is not null)
     and normalize_phone(p_phone) ~ '^[0-9]{7,15}$'
     and normalize_phone(c.phone) = normalize_phone(p_phone)
   order by c.created_at
   limit 1;
$$;

-- Cita creada por el personal: identifica o crea al cliente por celular.
-- Sin celular queda como "Cliente de mostrador" (no acumula fidelización).
drop function if exists create_staff_appointment(uuid, uuid, date, time, text, text, text);
create or replace function create_staff_appointment(
  p_barber  uuid,
  p_service uuid,
  p_date    date,
  p_time    time,
  p_name    text default null,
  p_phone   text default null,
  p_source  text default 'walk_in',
  p_notes   text default null
)
returns uuid
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_phone  text := nullif(normalize_phone(p_phone), '');
  v_dur    int;
  v_price  numeric;
  v_client uuid;
  v_cname  text;
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
    select c.id, c.name into v_client, v_cname from clients c where normalize_phone(c.phone) = v_phone
     order by c.created_at limit 1;
    if v_client is null then
      if length(trim(coalesce(p_name, ''))) < 2 then raise exception 'invalid_name'; end if;
      begin
        insert into clients (name, phone) values (trim(p_name), v_phone) returning id, name into v_client, v_cname;
      exception when unique_violation then
        select c.id, c.name into v_client, v_cname from clients c where c.phone = v_phone;
      end;
    end if;
  end if;

  begin
    insert into appointments (admin_id, client_id, barber_id, service_id, date, start_time, end_time,
                              status, notes, client_name, client_phone, source, price)
    values (coalesce(my_admin_id(), default_admin_id()), v_client, p_barber, p_service, p_date, p_time,
            p_time + make_interval(mins => v_dur), 'confirmed',
            nullif(trim(coalesce(p_notes, '')), ''),
            coalesce(v_cname, nullif(trim(coalesce(p_name, '')), '')), v_phone, p_source, v_price)
    returning id into v_id;
  exception when exclusion_violation then
    raise exception 'slot_unavailable';
  end;

  if v_phone is not null then perform enqueue_notifications(v_id, true); end if;
  return v_id;
end;
$$;

-- ---------- Permisos ----------
revoke execute on function find_client_duplicates()          from public, anon;
revoke execute on function merge_clients(uuid, uuid)         from public, anon;
revoke execute on function lookup_client_by_phone(text)      from public, anon;
revoke execute on function create_staff_appointment(uuid, uuid, date, time, text, text, text, text) from public, anon;
grant  execute on function find_client_duplicates()          to authenticated;
grant  execute on function merge_clients(uuid, uuid)         to authenticated;
grant  execute on function lookup_client_by_phone(text)      to authenticated;
grant  execute on function create_staff_appointment(uuid, uuid, date, time, text, text, text, text) to authenticated;
