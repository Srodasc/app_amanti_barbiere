-- =====================================================================
-- Limpieza de gastos falsos creados por la versión anterior de "Completar cita"
--
-- Antes, al completar una cita el panel creaba un GASTO con el concepto
-- "Servicio: <nombre>" y otro "Extra: <nombre>" por cada adicional, categoría
-- "Otros" (other). Eran cobros, no gastos.
--
-- Cómo usarlo (Supabase → SQL Editor):
--   1. Ejecuta SOLO el PASO 1 y revisa la lista.
--   2. Si todo es correcto, ejecuta el PASO 2. Hace una copia antes de borrar.
-- =====================================================================

-- PASO 1: revisar qué se va a borrar
select expense_date, concept, amount, notes, created_at
  from expenses
 where category = 'other'
   and (concept like 'Servicio: %' or concept like 'Extra: %')
 order by expense_date desc;

select count(*) as gastos, sum(amount) as total
  from expenses
 where category = 'other'
   and (concept like 'Servicio: %' or concept like 'Extra: %');


-- PASO 2: copia de respaldo y borrado (quita los "--" de las líneas de abajo y ejecútalas)
-- create table if not exists expenses_respaldo_limpieza as
--   select * from expenses where false;
-- insert into expenses_respaldo_limpieza
--   select * from expenses
--    where category = 'other' and (concept like 'Servicio: %' or concept like 'Extra: %');
-- delete from expenses
--  where category = 'other' and (concept like 'Servicio: %' or concept like 'Extra: %');
