-- =====================================================================
-- Módulo de productos: inventario y ventas de la tienda de la barbería
-- Requiere: 20261026000001_hardening.sql (is_admin, my_barber_id, default_admin_id)
-- Idempotente: se puede ejecutar más de una vez.
--
-- Regla central: el stock SOLO cambia por las funciones de abajo, que bloquean
-- la fila del producto y dejan un movimiento en stock_movements. Así nunca se
-- vende la última unidad dos veces y siempre se sabe por qué cambió el stock.
-- =====================================================================

-- ---------- Tablas ----------

create table if not exists products (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(trim(name)) between 2 and 120),
  category    text,
  sku         text,
  sale_price  numeric(12,2) not null check (sale_price >= 0),
  cost_price  numeric(12,2) not null default 0 check (cost_price >= 0),
  stock       integer not null default 0 check (stock >= 0),
  min_stock   integer not null default 0 check (min_stock >= 0),
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index if not exists products_sku_unique on products (lower(sku)) where sku is not null and sku <> '';
create index if not exists products_active_name on products (is_active, name);

create table if not exists product_sales (
  id              uuid primary key default gen_random_uuid(),
  barber_id       uuid references barbers on delete set null,     -- quién vendió (null = administrador)
  sold_by         uuid,                                           -- auth.uid() de quien registró
  client_id       uuid references clients on delete set null,
  total           numeric(12,2) not null check (total >= 0),
  payment_method  text not null default 'cash'
                  check (payment_method in ('cash', 'card', 'transfer', 'other')),
  status          text not null default 'completed' check (status in ('completed', 'voided')),
  notes           text,
  voided_at       timestamptz,
  void_reason     text,
  created_at      timestamptz not null default now()
);
create index if not exists product_sales_created on product_sales (created_at desc);
create index if not exists product_sales_barber on product_sales (barber_id, created_at desc);

create table if not exists product_sale_items (
  id          uuid primary key default gen_random_uuid(),
  sale_id     uuid not null references product_sales on delete cascade,
  product_id  uuid not null references products on delete restrict,
  quantity    integer not null check (quantity > 0),
  unit_price  numeric(12,2) not null check (unit_price >= 0),
  unit_cost   numeric(12,2) not null default 0,   -- costo al momento de vender (para margen)
  line_total  numeric(12,2) generated always as (quantity * unit_price) stored
);
create index if not exists product_sale_items_sale on product_sale_items (sale_id);
create index if not exists product_sale_items_product on product_sale_items (product_id);

create table if not exists stock_movements (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references products on delete cascade,
  kind        text not null check (kind in ('purchase', 'sale', 'void', 'adjustment')),
  quantity    integer not null check (quantity <> 0),   -- + entra, - sale
  stock_after integer not null,
  unit_cost   numeric(12,2),
  sale_id     uuid references product_sales on delete set null,
  expense_id  uuid references expenses on delete set null,
  note        text,
  created_by  uuid,
  created_at  timestamptz not null default now()
);
create index if not exists stock_movements_product on stock_movements (product_id, created_at desc);

-- ---------- Protección del stock ----------

-- Solo las funciones de este archivo encienden 'app.stock_rpc' (dentro de su transacción).
create or replace function products_guard_stock()
returns trigger language plpgsql as $$
begin
  if coalesce(current_setting('app.stock_rpc', true), '') <> 'on' then
    if tg_op = 'INSERT' and new.stock <> 0 then
      raise exception 'stock_direct_change' using hint = 'Crea el producto con stock 0 y usa register_stock_entry';
    elsif tg_op = 'UPDATE' and new.stock is distinct from old.stock then
      raise exception 'stock_direct_change' using hint = 'Usa register_stock_entry, adjust_stock o register_product_sale';
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_products_guard_stock on products;
create trigger trg_products_guard_stock
  before insert or update on products
  for each row execute function products_guard_stock();

-- ---------- Funciones ----------

-- Venta: p_items = [{"product_id": "...", "quantity": 2}, ...]
-- Usa el precio actual de cada producto (el navegador no decide precios).
create or replace function register_product_sale(
  p_items   jsonb,
  p_payment text default 'cash',
  p_client  uuid default null,
  p_notes   text default null
)
returns uuid
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_barber uuid := my_barber_id();
  v_sale   uuid;
  v_total  numeric(12,2) := 0;
  v_lines  jsonb;
  r        record;
begin
  if not (is_admin() or v_barber is not null) then raise exception 'not_authorized'; end if;
  if is_admin() then v_barber := null; end if;  -- el admin vende como tienda
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'empty_sale';
  end if;
  if p_payment not in ('cash', 'card', 'transfer', 'other') then raise exception 'invalid_payment'; end if;

  perform set_config('app.stock_rpc', 'on', true);

  insert into product_sales (barber_id, sold_by, client_id, total, payment_method, notes)
  values (v_barber, auth.uid(), p_client, 0, p_payment, nullif(trim(p_notes), ''))
  returning id into v_sale;

  -- Líneas agrupadas por producto (si el mismo producto viene dos veces, se suman)
  select coalesce(jsonb_agg(jsonb_build_object('pid', pid, 'qty', qty)), '[]'::jsonb)
    into v_lines
    from (select (e ->> 'product_id')::uuid as pid, sum((e ->> 'quantity')::int) as qty
            from jsonb_array_elements(p_items) e
           group by 1) g;

  if exists (select 1 from jsonb_array_elements(v_lines) l
              where l ->> 'pid' is null or coalesce((l ->> 'qty')::int, 0) <= 0) then
    raise exception 'invalid_quantity';
  end if;
  if exists (select 1 from jsonb_array_elements(v_lines) l
              where not exists (select 1 from products p where p.id = (l ->> 'pid')::uuid and p.is_active)) then
    raise exception 'product_unavailable';
  end if;

  -- Bloquea los productos en orden fijo (evita interbloqueos entre ventas simultáneas)
  for r in
    select p.id, p.name, p.sale_price, p.cost_price, p.stock, (l ->> 'qty')::int as qty
      from jsonb_array_elements(v_lines) l
      join products p on p.id = (l ->> 'pid')::uuid
     order by p.id
       for update of p
  loop
    if r.stock < r.qty then
      raise exception 'insufficient_stock' using detail = r.name || ' (quedan ' || r.stock || ')';
    end if;

    update products set stock = stock - r.qty where id = r.id;
    insert into product_sale_items (sale_id, product_id, quantity, unit_price, unit_cost)
    values (v_sale, r.id, r.qty, r.sale_price, r.cost_price);
    insert into stock_movements (product_id, kind, quantity, stock_after, unit_cost, sale_id, created_by)
    values (r.id, 'sale', -r.qty, r.stock - r.qty, r.cost_price, v_sale, auth.uid());
    v_total := v_total + r.qty * r.sale_price;
  end loop;

  update product_sales set total = v_total where id = v_sale;
  return v_sale;
end;
$$;

-- Anular una venta (solo admin): devuelve el stock y deja constancia.
create or replace function void_product_sale(p_sale uuid, p_reason text default null)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  r record;
  v_stock int;
begin
  if not is_admin() then raise exception 'not_authorized'; end if;
  perform 1 from product_sales where id = p_sale and status = 'completed' for update;
  if not found then raise exception 'sale_not_found'; end if;

  perform set_config('app.stock_rpc', 'on', true);
  for r in select product_id, quantity from product_sale_items where sale_id = p_sale order by product_id loop
    update products set stock = stock + r.quantity where id = r.product_id returning stock into v_stock;
    insert into stock_movements (product_id, kind, quantity, stock_after, sale_id, note, created_by)
    values (r.product_id, 'void', r.quantity, v_stock, p_sale, nullif(trim(p_reason), ''), auth.uid());
  end loop;

  update product_sales
     set status = 'voided', voided_at = now(), void_reason = nullif(trim(p_reason), '')
   where id = p_sale;
end;
$$;

-- Entrada de mercancía (solo admin). Si p_as_expense y hay costo, crea el gasto.
create or replace function register_stock_entry(
  p_product    uuid,
  p_quantity   int,
  p_unit_cost  numeric default null,
  p_note       text default null,
  p_as_expense boolean default true,
  p_date       date default null
)
returns uuid  -- id del movimiento
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_name    text;
  v_stock   int;
  v_expense uuid;
  v_mov     uuid;
  v_cost    numeric(12,2) := nullif(p_unit_cost, 0);
begin
  if not is_admin() then raise exception 'not_authorized'; end if;
  if p_quantity is null or p_quantity <= 0 then raise exception 'invalid_quantity'; end if;
  if v_cost is not null and v_cost < 0 then raise exception 'invalid_cost'; end if;

  perform set_config('app.stock_rpc', 'on', true);
  update products
     set stock = stock + p_quantity,
         cost_price = coalesce(v_cost, cost_price)   -- último costo conocido
   where id = p_product
  returning name, stock into v_name, v_stock;
  if v_name is null then raise exception 'product_not_found'; end if;

  if p_as_expense and v_cost is not null then
    insert into expenses (admin_id, concept, amount, category, expense_date, notes)
    values (default_admin_id(),
            'Compra: ' || v_name || ' x' || p_quantity,
            round(v_cost * p_quantity, 2),
            'supplies',
            coalesce(p_date, (now() at time zone 'America/Bogota')::date),
            nullif(trim(p_note), ''))
    returning id into v_expense;
  end if;

  insert into stock_movements (product_id, kind, quantity, stock_after, unit_cost, expense_id, note, created_by)
  values (p_product, 'purchase', p_quantity, v_stock, v_cost, v_expense, nullif(trim(p_note), ''), auth.uid())
  returning id into v_mov;
  return v_mov;
end;
$$;

-- Ajuste por conteo físico, pérdida o daño (solo admin). p_new_stock = lo que hay realmente.
create or replace function adjust_stock(p_product uuid, p_new_stock int, p_note text)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_old int;
begin
  if not is_admin() then raise exception 'not_authorized'; end if;
  if p_new_stock is null or p_new_stock < 0 then raise exception 'invalid_quantity'; end if;
  if coalesce(trim(p_note), '') = '' then raise exception 'note_required'; end if;

  select stock into v_old from products where id = p_product for update;
  if v_old is null then raise exception 'product_not_found'; end if;
  if v_old = p_new_stock then return; end if;

  perform set_config('app.stock_rpc', 'on', true);
  update products set stock = p_new_stock where id = p_product;
  insert into stock_movements (product_id, kind, quantity, stock_after, note, created_by)
  values (p_product, 'adjustment', p_new_stock - v_old, p_new_stock, trim(p_note), auth.uid());
end;
$$;

-- ---------- Seguridad (RLS) ----------

alter table products            enable row level security;
alter table product_sales       enable row level security;
alter table product_sale_items  enable row level security;
alter table stock_movements     enable row level security;

drop policy if exists products_admin      on products;
drop policy if exists products_barber     on products;
drop policy if exists sales_admin         on product_sales;
drop policy if exists sales_barber        on product_sales;
drop policy if exists sale_items_read     on product_sale_items;
drop policy if exists movements_admin     on stock_movements;

-- Productos: el admin los administra; el barbero ve los activos para poder vender.
create policy products_admin  on products for all using (is_admin()) with check (is_admin());
create policy products_barber on products for select using (is_active and my_barber_id() is not null);

-- Ventas e ítems: solo lectura directa; se escriben con las funciones.
create policy sales_admin  on product_sales for select using (is_admin());
create policy sales_barber on product_sales for select using (barber_id = my_barber_id());
create policy sale_items_read on product_sale_items for select using (
  exists (select 1 from product_sales s where s.id = sale_id and (is_admin() or s.barber_id = my_barber_id()))
);
create policy movements_admin on stock_movements for select using (is_admin());

-- Público (anon): nada. Autenticados: lo que diga RLS; sin escritura directa en ventas/movimientos.
revoke all on products, product_sales, product_sale_items, stock_movements from anon;
revoke insert, update, delete on product_sales, product_sale_items, stock_movements from authenticated;
grant select on product_sales, product_sale_items, stock_movements to authenticated;
grant select, insert, update, delete on products to authenticated;

revoke execute on function register_product_sale(jsonb, text, uuid, text)              from public, anon;
revoke execute on function void_product_sale(uuid, text)                                from public, anon;
revoke execute on function register_stock_entry(uuid, int, numeric, text, boolean, date) from public, anon;
revoke execute on function adjust_stock(uuid, int, text)                                from public, anon;
grant  execute on function register_product_sale(jsonb, text, uuid, text)              to authenticated;
grant  execute on function void_product_sale(uuid, text)                                to authenticated;
grant  execute on function register_stock_entry(uuid, int, numeric, text, boolean, date) to authenticated;
grant  execute on function adjust_stock(uuid, int, text)                                to authenticated;
