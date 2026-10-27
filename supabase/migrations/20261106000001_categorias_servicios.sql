-- =====================================================================
-- Categorías de servicios
--   main  = "Servicio" (cortes, etc.): se agenda en la reserva en línea.
--   addon = "Adicional" (cejas, mascarilla…): NO se agenda; se suma al cobrar la cita.
-- Requiere: 20261105000001_ventana_reserva.sql. Idempotente.
-- =====================================================================

alter table services add column if not exists kind text not null default 'main';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'services_kind_check') then
    alter table services add constraint services_kind_check check (kind in ('main', 'addon'));
  end if;
end $$;

-- La reserva en línea no puede crear citas con un adicional como servicio
-- (también protege a quien llame la función de reserva directamente).
create or replace function appointments_bookable_service()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.source = 'web' and exists (select 1 from services s where s.id = new.service_id and s.kind = 'addon') then
    raise exception 'service_not_bookable';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_appointments_bookable_service on appointments;
create trigger trg_appointments_bookable_service
  before insert on appointments
  for each row execute function appointments_bookable_service();
