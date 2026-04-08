# BarberHub - Sistema de Gestión para Barbería

## 1. Concepto & Visión

BarberHub es una plataforma integral para barberías que combina la autenticidad de la cultura barber con una experiencia digital moderna. El sistema transmite profesionalismo y atención personalizada, donde cada cliente se siente valorado desde que entra al portal hasta que termina su servicio. La interfaz evoca un ambiente premium con toques clásicos pero con la practicidad de lo digital.

## 2. Design Language

### Aesthetic Direction
Inspirado en barberías clásicas con elementos vintage (cuadros deobarber pole, texturas de cuero) combinado con interfaces limpias y modernas. Paleta oscura con acentos dorados que evocan premium sin ser pretencioso.

### Color Palette
```
--primary:        #1A1A2E      // Azul muy oscuro (fondo principal)
--secondary:      #16213E      // Azul oscuro (cards, sidebar)
--accent:         #D4AF37      // Dorado clásico (CTAs, highlights)
--accent-light:   #F4D03F      // Dorado claro (hover states)
--surface:        #0F0F1A      // Negro profundo (backgrounds)
--surface-light:  #252540      // Gris oscuro (cards elevadas)
--text-primary:   #FFFFFF      // Blanco
--text-secondary: #A0A0B0      // Gris claro
--success:        #10B981      // Verde
--warning:        #F59E0B       // Naranja
--error:          #EF4444      // Rojo
--info:           #3B82F6      // Azul
```

### Typography
- **Headings**: Playfair Display (serif, elegante) - 700, 600
- **Body**: Inter (sans-serif, legible) - 400, 500, 600
- **Monospace**: JetBrains Mono (números, precios)

### Spatial System
- Base unit: 4px
- Spacing scale: 4, 8, 12, 16, 24, 32, 48, 64, 96px
- Border radius: 4px (small), 8px (medium), 12px (large), 9999px (pill)
- Max content width: 1280px

### Motion Philosophy
- **Transiciones**: 200ms ease-out para interacciones
- **Entradas**: fade-in + translateY de 8px, 300ms ease-out
- **Hover**: scale(1.02) en cards, cambio de color en 150ms
- **Loaders**: skeleton con shimmer animation
- **Stagger**: 50ms entre elementos de lista

### Visual Assets
- **Icons**: Lucide React (línea fina, consistente)
- **Imágenes**: Cloudinary para avatars, fotos de perfil
- **Decorativos**: Líneas doradas sutiles, iconos de tijeras/peine estilizados

## 3. Layout & Structure

### Estructura General

```
┌─────────────────────────────────────────────────────────────┐
│  HEADER (logo, nav links, user menu)                        │
├──────────────┬──────────────────────────────────────────────┤
│              │                                              │
│   SIDEBAR    │              MAIN CONTENT                     │
│   (240px)    │              (fluid)                          │
│              │                                              │
│   - Dashboard│                                              │
│   - Citas    │                                              │
│   - Clientes │                                              │
│   - Gastos   │                                              │
│   - Reportes │                                              │
│   - Ajustes  │                                              │
│              │                                              │
├──────────────┴──────────────────────────────────────────────┤
│  FOOTER (minimal - año, versión)                            │
└─────────────────────────────────────────────────────────────┘
```

### Páginas Principales

1. **Landing/Login** - Split layout: izquierda imagen hero, derecha formulario auth
2. **Dashboard** - Grid de métricas + gráficos + próxima cita
3. **Citas** - Calendario visual + lista de citas del día
4. **Clientes** - Tabla con búsqueda y filtros
5. **Gastos** - Formulario + historial categorizado
6. **Reportes** - Gráficos de barras/torta, exportación

### Responsive Strategy
- **Desktop (1024px+)**: Sidebar visible, layout completo
- **Tablet (768px-1023px)**: Sidebar colapsable, cards en grid 2 cols
- **Mobile (<768px)**: Bottom nav, cards full width, drawer navigation

## 4. Features & Interactions

### 4.1 Autenticación (Supabase Auth)

**Funcionalidades:**
- Registro con email/password
- Login con email/password
- Recuperación de contraseña
- Sesiones persistentes con JWT
- Middleware de protección de rutas

**Comportamiento:**
- Validación en tiempo real de campos
- Feedback visual de errores (shake animation + mensaje)
- Loading state en botones durante submit
- Redirect a dashboard tras login exitoso
- Auto-logout tras 7 días de inactividad

### 4.2 Portal de Clientes

**Funcionalidades:**
- Registro de clientes con: nombre, email, teléfono, foto (Cloudinary)
- Historial de servicios por cliente
- Notas internas por cliente
- Búsqueda por nombre/teléfono
- Edición y eliminación (soft delete)

**Campos de Cliente:**
```typescript
{
  id: uuid,
  name: string (required, 2-100 chars),
  email: string (valid email, unique),
  phone: string (required, formato +XX XXXX XXXX),
  photo_url: string (Cloudinary URL, nullable),
  notes: text (nullable),
  created_at: timestamp,
  updated_at: timestamp,
  user_id: uuid (owner, from auth)
}
```

**Interacciones:**
- Click en fila → drawer con detalle del cliente
- Hover en fila → highlight sutil + acciones rápidas
- Empty state → ilustración + CTA "Agregar primer cliente"
- Error de red → toast con retry automático

### 4.3 Agendamiento de Citas (Tiempo Real)

**Funcionalidades:**
- Crear cita: seleccionar cliente, servicio, fecha/hora, barbero
- Vista de calendario (día/semana/mes)
- Notificaciones en tiempo real de nuevas citas (Supabase Realtime)
- Estados: pendiente, confirmada, en proceso, completada, cancelada
- Duración por servicio configurable

**Tipos de Servicio:**
```typescript
{
  id: uuid,
  name: string,
  duration_minutes: number,
  price: decimal,
  description: text,
  is_active: boolean
}
```

**Estructura de Cita:**
```typescript
{
  id: uuid,
  client_id: uuid (FK clients),
  service_id: uuid (FK services),
  barber_id: uuid (nullable, FK users),
  date: date,
  start_time: time,
  end_time: time,
  status: enum('pending', 'confirmed', 'in_progress', 'completed', 'cancelled'),
  notes: text,
  created_at: timestamp
}
```

**Interacciones:**
- Drag & drop para reagendar (solo desktop)
- Click en slot vacío → modal crear cita
- Click en cita → drawer con detalles + acciones
- Sincronización en tiempo real entre dispositivos
- Conflicto de horario → validación antes de guardar

### 4.4 Control de Gastos

**Categorías Predefinidas:**
- Insumos/Rentock
- Servicios (luz, agua, internet)
- Nómina
- Marketing
- Mantenimiento
- Otros

**Estructura de Gasto:**
```typescript
{
  id: uuid,
  concept: string,
  amount: decimal,
  category: enum_categories,
  date: date,
  receipt_url: string (Cloudinary, nullable),
  notes: text,
  created_at: timestamp,
  user_id: uuid
}
```

**Funcionalidades:**
- CRUD completo de gastos
- Filtros por: categoría, rango de fechas, monto
- Totales por categoría y período
- Subida de comprobantes (imágenes)
- Exportación a CSV

**Interacciones:**
- Formulario con validación en tiempo real
- Preview de imagen al subir comprobante
- Confirmación antes de eliminar (modal)
- Totales calculados en tiempo real

### 4.5 Dashboard y Reportes

**Métricas del Dashboard:**
1. **Citas de Hoy** - Número + lista de próximas
2. **Clientes Este Mes** - Total + vs mes anterior (%)
3. **Ingresos del Mes** - Total de servicios completados
4. **Gastos del Mes** - Total categorizado
5. **Ganancia Neta** - Ingresos - Gastos

**Gráficos:**
- **Línea**: Ingresos vs Gastos (últimos 6 meses)
- **Barras**: Citas por día de la semana
- **Torta**: Distribución de servicios más populares

**Estructura de Reporte:**
```typescript
{
  period: { start: date, end: date },
  total_appointments: number,
  total_revenue: decimal,
  total_expenses: decimal,
  net_profit: decimal,
  top_services: array,
  top_clients: array
}
```

### 4.6 Recordatorios de Obligaciones

**Tipos de Recordatorio:**
- Pago de servicios
- Compra de insumos
- Nómina
- Cita importante
- Personalizado

**Estructura:**
```typescript
{
  id: uuid,
  title: string,
  description: text,
  due_date: date,
  due_time: time (nullable),
  type: enum('payment', 'purchase', 'payroll', 'appointment', 'custom'),
  priority: enum('low', 'medium', 'high'),
  is_completed: boolean,
  reminder_sent: boolean,
  created_at: timestamp,
  user_id: uuid
}
```

**Funcionalidades:**
- Lista de recordatorios pendientes
- Marcar como completado
- Filtros: pendientes, completados, vencidos
- Badge en sidebar con count de pendientes
- Notificaciones browser (con permiso)

## 5. Component Inventory

### Buttons
- **Primary**: bg-accent, text-primary-dark, hover:bg-accent-light
- **Secondary**: bg-transparent, border-accent, text-accent
- **Ghost**: bg-transparent, text-text-secondary, hover:bg-surface-light
- **Danger**: bg-error, text-white
- **States**: default, hover (scale 1.02), active (scale 0.98), disabled (opacity 0.5), loading (spinner)

### Inputs
- **Text/Email/Password**: border-surface-light, focus:border-accent, error:border-error
- **Select**: custom dropdown con Lucide icons
- **Date picker**: calendario modal
- **File upload**: drag & drop zone con preview
- **States**: default, focus (ring-2 ring-accent/50), error, disabled

### Cards
- bg: surface-light, rounded-12, shadow-sm
- Hover: shadow-md, translateY(-2px)
- Header opcional con título y acciones
- Empty state con ilustración

### Tables
- Header sticky con bg secondary
- Rows alternadas (opcional)
- Hover: bg-surface-light
- Acciones en última columna
- Paginación en footer

### Modals
- Overlay: bg-black/60, backdrop-blur-sm
- Content: bg-surface-light, rounded-12, max-w-md
- Animación: scale(0.95) → scale(1) + fade

### Toasts
- Posición: top-right
- Tipos: success (green), error (red), warning (amber), info (blue)
- Auto-dismiss: 5s
- Animación: slideInRight

### Skeleton Loaders
- bg: surface-light
- Shimmer animation: left-to-right gradient
- Formas: text (rounded), avatar (circle), card (rounded-lg)

## 6. Technical Approach

### Stack
- **Framework**: Next.js 14 (App Router)
- **Styling**: Tailwind CSS
- **Database/Auth/Real-time**: Supabase
- **Images**: Cloudinary
- **Deployment**: Vercel
- **Icons**: Lucide React

### Arquitectura de Carpetas
```
/
├── app/
│   ├── (auth)/
│   │   ├── login/page.tsx
│   │   ├── register/page.tsx
│   │   └── layout.tsx
│   ├── (dashboard)/
│   │   ├── dashboard/page.tsx
│   │   ├── clients/page.tsx
│   │   ├── appointments/page.tsx
│   │   ├── expenses/page.tsx
│   │   ├── reminders/page.tsx
│   │   └── layout.tsx
│   ├── api/
│   │   └── cloudinary/route.ts
│   ├── layout.tsx
│   ├── page.tsx
│   └── globals.css
├── components/
│   ├── ui/ (buttons, inputs, cards, etc.)
│   ├── dashboard/
│   ├── appointments/
│   ├── clients/
│   ├── expenses/
│   └── reminders/
├── lib/
│   ├── supabase/
│   │   ├── client.ts
│   │   ├── server.ts
│   │   └── types.ts
│   ├── cloudinary.ts
│   └── utils.ts
├── hooks/
│   ├── useAuth.ts
│   ├── useClients.ts
│   ├── useAppointments.ts
│   └── useExpenses.ts
├── types/
│   └── index.ts
└── middleware.ts
```

### API Routes (Next.js)
- `POST /api/cloudinary/signature` - Generar firma para upload

### Supabase Schema

```sql
-- Tablas base
create table profiles (
  id uuid references auth.users primary key,
  email text,
  full_name text,
  avatar_url text,
  created_at timestamptz default now()
);

create table clients (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users not null,
  name text not null,
  email text unique,
  phone text not null,
  photo_url text,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table services (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users,
  name text not null,
  duration_minutes int not null default 30,
  price decimal(10,2) not null,
  description text,
  is_active boolean default true,
  created_at timestamptz default now()
);

create table appointments (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users not null,
  client_id uuid references clients not null,
  service_id uuid references services not null,
  date date not null,
  start_time time not null,
  end_time time not null,
  status text default 'pending',
  notes text,
  created_at timestamptz default now()
);

create table expenses (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users not null,
  concept text not null,
  amount decimal(10,2) not null,
  category text not null,
  expense_date date not null,
  receipt_url text,
  notes text,
  created_at timestamptz default now()
);

create table reminders (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users not null,
  title text not null,
  description text,
  due_date date not null,
  due_time time,
  type text not null,
  priority text default 'medium',
  is_completed boolean default false,
  created_at timestamptz default now()
);

-- Row Level Security (RLS)
alter table clients enable row level security;
alter table appointments enable row level security;
alter table expenses enable row level security;
alter table reminders enable row level security;
alter table services enable row level security;

-- Policies
create policy "Users can manage own clients" on clients
  for all using (auth.uid() = user_id);

create policy "Users can manage own appointments" on appointments
  for all using (auth.uid() = user_id);

create policy "Users can manage own expenses" on expenses
  for all using (auth.uid() = user_id);

create policy "Users can manage own reminders" on reminders
  for all using (auth.uid() = user_id);

create policy "Users can manage own services" on services
  for all using (auth.uid() = user_id);

-- Realtime subscriptions en appointments y reminders
alter publication supabase_realtime add table appointments;
alter publication supabase_realtime add table reminders;
```

### Variables de Entorno
```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
CLOUDINARY_UPLOAD_PRESET=
```

### Flujo de Tiempo Real
1. Cliente crea cita → se inserta en Supabase
2. Supabase Realtime emite evento a todos los clientes suscritos
3. UI actualiza automáticamente la lista de citas
4. Toast de notificación al usuario

### Cloudinary Integration
- Upload widget para subir fotos de perfil y comprobantes
- Firmas del lado del servidor para seguridad
- Transformaciones para optimizar imágenes (resize, crop)

## 7. Implementación por Fases

### Fase 1: Fundamentos
- [x] Setup Next.js con Tailwind
- [x] Configuración de Supabase (schema, RLS)
- [x] Autenticación completa
- [x] Layout base (sidebar, header)

### Fase 2: Módulos Core
- [x] CRUD de Clientes
- [x] CRUD de Servicios
- [x] Sistema de Citas básico

### Fase 3: Tiempo Real y Uploads
- [x] Suscripciones Realtime
- [x] Integración Cloudinary
- [x] Galería de imágenes

### Fase 4: Finanzas
- [x] CRUD de Gastos
- [x] Dashboard con métricas
- [x] Reportes y gráficos

### Fase 5: Recordatorios y polish
- [x] Sistema de recordatorios
- [x] Notificaciones browser
- [x] Responsive mobile
- [x] Testing y optimización

---

## 8. Sistema de Usuarios y Roles

### 8.1 Tipos de Usuario

El sistema diferencia entre dos tipos principales de usuarios:

| Tipo | Descripción | Acceso |
|------|-------------|-------|
| **Administrador** | Dueño/gerente de la barbería | Panel completo, CRUD de barberos, servicios, horarios |
| **Cliente** | Usuario que reserva citas | Portal público de reservas, historial de citas |

### 8.2 Tablas de Usuarios

**admin_users** - Usuarios administradores del sistema:
```typescript
{
  id: uuid,
  auth_id: uuid (FK auth.users),
  name: string,
  email: string,
  phone: string,
  role: 'owner' | 'manager',
  is_active: boolean,
  created_at: timestamp
}
```

**clients** - Clientes que reservan:
```typescript
{
  id: uuid,
  auth_id: uuid (FK auth.users, nullable - pueden reservar sin cuenta),
  name: string,
  email: string,
  phone: string,
  is_verified: boolean,
  created_at: timestamp
}
```

### 8.3 Módulo de Barberos

**barbers** - Información de barberos:
```typescript
{
  id: uuid,
  user_id: uuid (FK auth.users, nullable),
  name: string,
  email: string,
  phone: string,
  photo_url: string,
  specialty: string,
  is_active: boolean,
  created_at: timestamp
}
```

**barber_schedules** - Horarios de trabajo:
```typescript
{
  id: uuid,
  barber_id: uuid (FK barbers),
  day_of_week: 0-6 (0=Domingo),
  start_time: time,
  end_time: time,
  is_available: boolean,
  appointment_duration: integer (minutos, default 30)
}
```

### 8.4 Portal de Reservas (Público)

Página pública donde clientes reservan citas:

**Flujo:**
1. Seleccionar servicio
2. Seleccionar barbero (opcional)
3. Seleccionar fecha del calendario
4. Seleccionar hora disponible
5. Ingresar datos personales (si no tiene cuenta)
6. Confirmar reserva

**Validaciones:**
- No mostrar horarios donde el barbero no trabaja
- No mostrar horarios con citas existentes
- Validar duración del servicio vs tiempo disponible

---

## 9. Estructura de Carpetas Actualizada

```
src/
├── app/
│   ├── (public)/              # Páginas públicas
│   │   ├── book/              # Portal de reservas
│   │   └── layout.tsx
│   ├── (auth)/                # Autenticación
│   ├── (admin)/               # Panel administrativo
│   │   ├── dashboard/
│   │   ├── barbers/           # CRUD barberos
│   │   ├── schedules/          # Horarios barberos
│   │   ├── clients/
│   │   ├── appointments/
│   │   ├── expenses/
│   │   ├── reminders/
│   │   └── settings/
│   └── api/
├── components/
│   ├── ui/
│   ├── booking/               # Componentes de reserva
│   ├── barbers/               # Componentes de barberos
│   └── admin/                 # Componentes admin
├── hooks/
├── lib/
└── types/
```

## 10. Nuevas Rutas

| Ruta | Descripción | Acceso |
|------|-------------|--------|
| `/book` | Portal de reservas público | Público |
| `/admin/barbers` | Gestión de barberos | Admin |
| `/admin/schedules` | Horarios de barberos | Admin |
| `/admin/dashboard` | Dashboard admin | Admin |
