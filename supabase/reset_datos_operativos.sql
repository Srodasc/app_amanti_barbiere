-- =====================================================================
-- Amanti Barbiere — Reiniciar los datos de operación (citas, clientes, ingresos)
--
-- SE BORRA:
--   * Citas y todo lo que depende de ellas: adicionales cobrados, cola de
--     WhatsApp (notificaciones).
--   * Clientes, con su avance y su historial de fidelización.
--   * Cierres de caja.
--   * Liquidaciones de comisiones (los GASTOS que generaron se conservan).
--
-- SE CONSERVA (no se toca):
--   * Barberos, sus horarios, descansos, días especiales, bloqueos y % de comisión.
--   * Usuarios y accesos (administradores y barberos).
--   * Servicios, reglas de fidelización, datos y ajustes del negocio.
--   * Productos con su stock actual y TODO el historial de movimientos de inventario.
--   * Ventas de productos: se conservan completas (total, barbero, medio de pago,
--     productos). Solo pierden el enlace al cliente y a la cita borrados.
--   * Gastos y recordatorios internos.
--
-- Cómo usarlo (Supabase → SQL Editor):
--   1. Ejecuta el PASO 1 y revisa cuántos registros se van a borrar.
--   2. Ejecuta el PASO 2 (respaldo). Guarda una copia en el esquema "respaldo_reset".
--   3. Ejecuta el PASO 3 (borrado). Es una sola transacción: o se borra todo o nada.
--   4. Cuando confirmes que la app quedó bien, ejecuta el PASO 4 para borrar el respaldo.
-- El borrado no se puede deshacer desde la app; solo restaurando el respaldo del PASO 2.
-- =====================================================================


-- ---------------------------------------------------------------------
-- PASO 1 — Ver qué se va a borrar (no cambia nada)
-- ---------------------------------------------------------------------
select 'Citas' as dato, count(*) as registros from appointments
union all select 'Adicionales cobrados', count(*) from appointment_extras
union all select 'Notificaciones WhatsApp', count(*) from notifications
union all select 'Clientes', count(*) from clients
union all select 'Saldos de fidelización', count(*) from loyalty_balances
union all select 'Historial de fidelización', count(*) from loyalty_events
union all select 'Cierres de caja', count(*) from cash_closings
union all select 'Liquidaciones de comisiones', count(*) from commission_payouts
union all select '(se conservan) Ventas de productos', count(*) from product_sales;


-- ---------------------------------------------------------------------
-- PASO 2 — Respaldo (copia de todo lo que se va a borrar)
-- ---------------------------------------------------------------------
/*
create schema if not exists respaldo_reset;
create table respaldo_reset.appointments        as table appointments;
create table respaldo_reset.appointment_extras  as table appointment_extras;
create table respaldo_reset.notifications       as table notifications;
create table respaldo_reset.clients             as table clients;
create table respaldo_reset.loyalty_balances    as table loyalty_balances;
create table respaldo_reset.loyalty_events      as table loyalty_events;
-- De las ventas solo cambia el enlace al cliente y a la cita: se guarda para poder restaurarlo
create table respaldo_reset.product_sales_links as select id, client_id, appointment_id from product_sales;
create table respaldo_reset.cash_closings       as table cash_closings;
create table respaldo_reset.commission_payouts  as table commission_payouts;
-- El respaldo no es visible desde la app (no está en el esquema public).
revoke all on schema respaldo_reset from anon, authenticated;
*/


-- ---------------------------------------------------------------------
-- PASO 3 — Borrado (una sola transacción)
-- ---------------------------------------------------------------------
/*
begin;

-- Las ventas de productos NO se borran (al borrar clientes y citas solo pierden ese enlace).

-- Cierres de caja
delete from cash_closings;

-- Citas: adicionales y notificaciones se borran en cascada
delete from appointments;

-- Liquidaciones de comisiones (después de las citas; sus gastos se conservan)
delete from commission_payouts;

-- Fidelización de los clientes (las REGLAS se conservan)
delete from loyalty_events;
delete from loyalty_balances;

-- Clientes (el "Cliente de mostrador" se vuelve a crear solo cuando se necesite)
delete from clients;

-- Verificación: todo en cero
select 'Citas' as dato, count(*) as quedan from appointments
union all select 'Clientes', count(*) from clients
union all select 'Cierres de caja', count(*) from cash_closings
union all select 'Liquidaciones', count(*) from commission_payouts
union all select 'Fidelización', (select count(*) from loyalty_balances) + (select count(*) from loyalty_events)
union all select '(se conservan) Ventas de productos', count(*) from product_sales;

commit;
*/


-- ---------------------------------------------------------------------
-- SOLO SI ALGO SALIÓ MAL — Restaurar desde el respaldo del PASO 2
-- (antes del PASO 4; devuelve todo como estaba antes del PASO 3)
-- ---------------------------------------------------------------------
/*
begin;
insert into clients            select * from respaldo_reset.clients;
insert into commission_payouts select * from respaldo_reset.commission_payouts;
alter table appointments disable trigger user;   -- no recalcular precios ni avisos al restaurar
insert into appointments       select * from respaldo_reset.appointments;
alter table appointments enable trigger user;
insert into appointment_extras select * from respaldo_reset.appointment_extras;
insert into notifications      select * from respaldo_reset.notifications;
insert into loyalty_balances   select * from respaldo_reset.loyalty_balances;
insert into loyalty_events     select * from respaldo_reset.loyalty_events;
update product_sales ps set client_id = l.client_id, appointment_id = l.appointment_id
  from respaldo_reset.product_sales_links l where l.id = ps.id;
insert into cash_closings      select * from respaldo_reset.cash_closings;
commit;
*/


-- ---------------------------------------------------------------------
-- PASO 4 — Borrar el respaldo (cuando confirmes que todo está bien)
-- ---------------------------------------------------------------------
/*
drop schema respaldo_reset cascade;
*/
