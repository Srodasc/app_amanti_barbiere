-- Limpiar base de datos: mantener solo administradores

-- Eliminar en orden correcto (respetando foreign keys)
DELETE FROM appointments;
DELETE FROM expenses;
DELETE FROM reminders;
DELETE FROM services;
DELETE FROM barbers;
DELETE FROM clients;

-- Verificar que solo queden admins
SELECT * FROM admin_users;