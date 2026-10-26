-- =====================================================================
-- Cobrar la cita y los productos en un solo paso
-- Requiere: 20261027000001_productos.sql y 20261103000001_comisiones_caja.sql. Idempotente.
--
-- Todo o nada: si un producto no tiene stock, no se completa la cita ni se
-- registra nada. La venta de productos queda ligada a la cita, a nombre del
-- barbero que atendió y con el mismo medio de pago. Productos sin comisión.
-- =====================================================================

alter table product_sales add column if not exists appointment_id uuid references appointments on delete set null;
create index if not exists product_sales_appointment on product_sales (appointment_id) where appointment_id is not null;

-- p_products = [{"product_id": "...", "quantity": 2}, ...]
create or replace function complete_appointment_with_products(
  p_appointment uuid,
  p_payment     text,
  p_extras      jsonb default '[]'::jsonb,
  p_products    jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_services numeric(12,2);
  v_sale     uuid;
  v_products numeric(12,2) := 0;
  v_a        record;
begin
  select id, barber_id, client_id into v_a from appointments where id = p_appointment;
  if v_a.id is null then raise exception 'appointment_not_found'; end if;

  -- Cobro de la cita (valida permisos, estado y medio de pago; calcula la comisión)
  v_services := complete_appointment(p_appointment, p_payment, p_extras);

  if p_products is not null and jsonb_typeof(p_products) = 'array' and jsonb_array_length(p_products) > 0 then
    v_sale := register_product_sale(p_products, p_payment, v_a.client_id, 'Vendido en la cita');
    update product_sales
       set appointment_id = p_appointment,
           barber_id = coalesce(v_a.barber_id, barber_id)
     where id = v_sale
     returning total into v_products;
  end if;

  return jsonb_build_object(
    'services', v_services,
    'products', coalesce(v_products, 0),
    'total', v_services + coalesce(v_products, 0),
    'sale_id', v_sale
  );
end;
$$;

revoke execute on function complete_appointment_with_products(uuid, text, jsonb, jsonb) from public, anon;
grant  execute on function complete_appointment_with_products(uuid, text, jsonb, jsonb) to authenticated;
