-- =====================================================
-- BarberHub - Supabase Database Setup (v2)
-- Sistema con roles: Admin y Clientes
-- =====================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- =====================================================
-- TABLES (usar IF NOT EXISTS para evitar errores)
-- =====================================================

-- Admin Users table
create table if not exists public.admin_users (
  id uuid default gen_random_uuid() primary key,
  auth_id uuid references auth.users on delete cascade,
  name text not null,
  email text not null,
  phone text,
  role text default 'owner' check (role in ('owner', 'manager')),
  is_active boolean default true,
  created_at timestamptz default now()
);

-- Barbers table
create table if not exists public.barbers (
  id uuid default gen_random_uuid() primary key,
  admin_id uuid references public.admin_users on delete cascade,
  name text not null,
  email text,
  phone text,
  photo_url text,
  specialty text,
  is_active boolean default true,
  created_at timestamptz default now()
);

-- Barber Schedules
create table if not exists public.barber_schedules (
  id uuid default gen_random_uuid() primary key,
  barber_id uuid references public.barbers on delete cascade not null,
  day_of_week integer not null check (day_of_week >= 0 and day_of_week <= 6),
  start_time time not null,
  end_time time not null,
  is_available boolean default true,
  appointment_duration integer default 30,
  created_at timestamptz default now(),
  unique(barber_id, day_of_week)
);

-- Clients table
create table if not exists public.clients (
  id uuid default gen_random_uuid() primary key,
  auth_id uuid references auth.users on delete set null,
  name text not null,
  email text,
  phone text unique,
  password_hash text,
  is_verified boolean default false,
  created_at timestamptz default now()
);

-- Services table
create table if not exists public.services (
  id uuid default gen_random_uuid() primary key,
  admin_id uuid references public.admin_users on delete cascade,
  name text not null,
  duration_minutes integer not null default 30,
  price decimal(10,2) not null,
  description text,
  is_active boolean default true,
  created_at timestamptz default now()
);

-- Appointments table
create table if not exists public.appointments (
  id uuid default gen_random_uuid() primary key,
  admin_id uuid references public.admin_users on delete cascade,
  client_id uuid references public.clients on delete set null,
  barber_id uuid references public.barbers on delete set null,
  service_id uuid references public.services on delete set null,
  date date not null,
  start_time time not null,
  end_time time not null,
  status text default 'pending' check (status in ('pending', 'confirmed', 'in_progress', 'completed', 'cancelled')),
  notes text,
  client_name text,
  client_phone text,
  created_at timestamptz default now()
);

-- Expenses table
create table if not exists public.expenses (
  id uuid default gen_random_uuid() primary key,
  admin_id uuid references public.admin_users on delete cascade,
  concept text not null,
  amount decimal(10,2) not null,
  category text not null check (category in ('supplies', 'services', 'payroll', 'marketing', 'maintenance', 'other')),
  expense_date date not null,
  receipt_url text,
  notes text,
  created_at timestamptz default now()
);

-- Reminders table
create table if not exists public.reminders (
  id uuid default gen_random_uuid() primary key,
  admin_id uuid references public.admin_users on delete cascade,
  title text not null,
  description text,
  due_date date not null,
  due_time time,
  type text not null check (type in ('payment', 'purchase', 'payroll', 'appointment', 'custom')),
  priority text default 'medium' check (priority in ('low', 'medium', 'high')),
  is_completed boolean default false,
  created_at timestamptz default now()
);

-- Profiles table
create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  email text,
  full_name text,
  avatar_url text,
  phone text,
  user_type text default 'admin' check (user_type in ('admin', 'client')),
  created_at timestamptz default now()
);

-- =====================================================
-- ROW LEVEL SECURITY (RLS)
-- =====================================================

alter table public.admin_users enable row level security;
alter table public.barbers enable row level security;
alter table public.barber_schedules enable row level security;
alter table public.clients enable row level security;
alter table public.services enable row level security;
alter table public.appointments enable row level security;
alter table public.expenses enable row level security;
alter table public.reminders enable row level security;
alter table public.profiles enable row level security;

-- =====================================================
-- POLICIES (usar OR REPLACE para evitar duplicados)
-- =====================================================

-- Admin Users policies
drop policy if exists "Admins manage own profile" on public.admin_users;
create policy "Admins manage own profile" on public.admin_users
  for all using (auth.uid() = auth_id);

-- Barbers policies
drop policy if exists "Admins can manage own barbers" on public.barbers;
create policy "Admins can manage own barbers" on public.barbers
  for all using (
    auth.uid() in (select auth_id from public.admin_users where is_active = true)
  );

drop policy if exists "Barbers are visible to admins and clients" on public.barbers;
create policy "Barbers are visible to admins and clients" on public.barbers
  for select using (is_active = true);

-- Barber Schedules policies
drop policy if exists "Admins can manage schedules" on public.barber_schedules;
create policy "Admins can manage schedules" on public.barber_schedules
  for all using (auth.uid() in (
    select a.auth_id from public.barbers b
    join public.admin_users a on b.admin_id = a.id
    where a.is_active = true
  ));

drop policy if exists "Schedules visible to admins" on public.barber_schedules;
create policy "Schedules visible to admins" on public.barber_schedules
  for select using (
    auth.uid() in (select auth_id from public.admin_users where is_active = true)
  );

-- Clients policies
drop policy if exists "Admins can manage clients" on public.clients;
create policy "Admins can manage clients" on public.clients
  for all using (
    auth.uid() in (select auth_id from public.admin_users where is_active = true)
  );

drop policy if exists "Clients visible to admins" on public.clients;
create policy "Clients visible to admins" on public.clients
  for select using (
    auth.uid() in (select auth_id from public.admin_users where is_active = true)
  );

-- Services policies
drop policy if exists "Admins can manage services" on public.services;
create policy "Admins can manage services" on public.services
  for all using (
    auth.uid() in (select auth_id from public.admin_users where is_active = true)
  );

drop policy if exists "Active services visible to all" on public.services;
create policy "Active services visible to all" on public.services
  for select using (is_active = true);

-- Appointments policies
drop policy if exists "Admins can manage appointments" on public.appointments;
create policy "Admins can manage appointments" on public.appointments
  for all using (
    auth.uid() in (select auth_id from public.admin_users where is_active = true)
  );

-- Expenses policies
drop policy if exists "Admins can manage expenses" on public.expenses;
create policy "Admins can manage expenses" on public.expenses
  for all using (
    auth.uid() in (select auth_id from public.admin_users where is_active = true)
  );

-- Reminders policies
drop policy if exists "Admins can manage reminders" on public.reminders;
create policy "Admins can manage reminders" on public.reminders
  for all using (
    auth.uid() in (select auth_id from public.admin_users where is_active = true)
  );

-- Profiles policies
drop policy if exists "Users can view own profile" on public.profiles;
create policy "Users can view own profile" on public.profiles
  for select using (auth.uid() = id);

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile" on public.profiles
  for update using (auth.uid() = id);

-- =====================================================
-- TRIGGERS
-- =====================================================

create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, new.raw_user_meta_data->>'full_name');

  insert into public.admin_users (auth_id, name, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', 'Admin'), new.email);

  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- =====================================================
-- REALTIME
-- =====================================================

alter publication supabase_realtime add table public.appointments;
alter publication supabase_realtime add table public.reminders;

-- =====================================================
-- INDEXES
-- =====================================================

create index if not exists idx_barbers_admin_id on public.barbers(admin_id);
create index if not exists idx_barber_schedules_barber_id on public.barber_schedules(barber_id);
create index if not exists idx_barber_schedules_day on public.barber_schedules(day_of_week);
create index if not exists idx_appointments_admin_id on public.appointments(admin_id);
create index if not exists idx_appointments_barber_id on public.appointments(barber_id);
create index if not exists idx_appointments_date on public.appointments(date);
create index if not exists idx_appointments_client_id on public.appointments(client_id);
create index if not exists idx_clients_auth_id on public.clients(auth_id);
create index if not exists idx_services_admin_id on public.services(admin_id);

-- =====================================================
-- SERVICIOS DE EJEMPLO (descomenta si los quieres)
-- =====================================================

insert into public.services (name, duration_minutes, price, description) 
select 'Corte de cabello', 30, 150.00, 'Corte clásico o moderno'
where not exists (select 1 from public.services where name = 'Corte de cabello');

insert into public.services (name, duration_minutes, price, description) 
select 'Afeitado completo', 20, 100.00, 'Afeitado con navaja'
where not exists (select 1 from public.services where name = 'Afeitado completo');

insert into public.services (name, duration_minutes, price, description) 
select 'Corte + Barba', 45, 250.00, 'Corte y arreglo de barba'
where not exists (select 1 from public.services where name = 'Corte + Barba');
