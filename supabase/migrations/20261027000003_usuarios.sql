-- =====================================================================
-- Gestión de usuarios administradores
-- Requiere: 20261026000001_hardening.sql. Idempotente.
--
-- 1) Cierra un hueco: la política admin_users_update dejaba que cada admin
--    editara TODA su fila, incluidos role e is_active (un admin desactivado
--    podía reactivarse solo, y un encargado volverse dueño). Ahora desde el
--    navegador solo se pueden cambiar name y phone de la fila propia; el resto
--    lo hace el servidor (/api/admin/users) con la service role.
-- 2) Roles: owner (dueño: gestiona usuarios) y manager (encargado: todo lo demás).
-- 3) Nunca puede quedar el sistema sin un dueño activo.
--
-- No se borran administradores: admin_users tiene "on delete cascade" hacia
-- gastos, servicios y citas, así que borrar uno borraría su historial.
-- Se desactivan (y el servidor bloquea su inicio de sesión).
-- =====================================================================

-- 1) Columnas editables desde el navegador
revoke update on admin_users from authenticated;
grant update (name, phone) on admin_users to authenticated;

-- 2) ¿La sesión actual es un dueño activo?
create or replace function is_owner()
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select exists (select 1 from admin_users where auth_id = auth.uid() and is_active and role = 'owner');
$$;
revoke execute on function is_owner() from public, anon;
grant  execute on function is_owner() to authenticated;

update admin_users set role = 'owner' where role is null;
alter table admin_users alter column role set default 'manager';
alter table admin_users alter column role set not null;

-- 3) Siempre al menos un dueño activo
create or replace function admin_users_keep_owner()
returns trigger language plpgsql as $$
begin
  if not exists (select 1 from admin_users where is_active and role = 'owner') then
    raise exception 'last_owner' using hint = 'Debe quedar al menos un dueño activo';
  end if;
  return null;
end;
$$;

drop trigger if exists trg_admin_users_keep_owner on admin_users;
create constraint trigger trg_admin_users_keep_owner
  after update of role, is_active or delete on admin_users
  deferrable initially immediate
  for each row execute function admin_users_keep_owner();

-- Una cuenta de acceso (auth) = un solo administrador ACTIVO. Si hoy hay duplicados
-- activos, no se crea el índice y se avisa: desactiva los sobrantes en Usuarios
-- y vuelve a ejecutar este archivo.
drop index if exists admin_users_auth_id_unique;
do $$
begin
  if exists (select auth_id from admin_users where auth_id is not null and is_active
              group by auth_id having count(*) > 1) then
    raise notice 'Hay administradores activos duplicados con la misma cuenta; desactiva los sobrantes en Usuarios y vuelve a ejecutar este archivo.';
  else
    create unique index admin_users_auth_id_unique on admin_users (auth_id) where auth_id is not null and is_active;
  end if;
end $$;
