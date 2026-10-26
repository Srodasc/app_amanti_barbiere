-- =====================================================================
-- Corrección: el gasto de una entrada de mercancía no aparecía en Gastos.
--
-- register_stock_entry() asignaba el gasto a default_admin_id() (el PRIMER
-- administrador creado), pero la pantalla Gastos solo muestra los gastos del
-- administrador con sesión. Con más de un registro en admin_users, el gasto
-- quedaba a nombre de otro.
--
-- Ahora el gasto queda a nombre de quien registra la entrada, y se reasignan
-- los gastos que ya se habían creado mal. Idempotente.
-- =====================================================================

-- Administrador de la sesión actual (o null)
create or replace function my_admin_id()
returns uuid
language sql stable security definer set search_path = public, pg_temp
as $$
  select id from admin_users where auth_id = auth.uid() and is_active limit 1;
$$;

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
    values (coalesce(my_admin_id(), default_admin_id()),
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

-- Reasignar los gastos ya creados por entradas al administrador que hizo la entrada
update expenses e
   set admin_id = a.id
  from stock_movements m
  join admin_users a on a.auth_id = m.created_by
 where m.expense_id = e.id
   and e.admin_id is distinct from a.id;

revoke execute on function my_admin_id() from public, anon;
grant  execute on function my_admin_id() to authenticated;
revoke execute on function register_stock_entry(uuid, int, numeric, text, boolean, date) from public, anon;
grant  execute on function register_stock_entry(uuid, int, numeric, text, boolean, date) to authenticated;
