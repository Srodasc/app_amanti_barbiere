# Amanti Barbiere

Sistema de gestión integral para barberías con Next.js, Supabase y Tailwind CSS.

## Características

- 📅 **Agenda de Citas**: Agendamiento en tiempo real con calendario visual
- 👥 **Portal de Clientes**: Registro y gestión de clientes con historial y reservas
- 💈 **Booking Público**: Los clientes pueden reservar citas sin necesidad de login
- 💰 **Control de Ingresos**: Registro de servicios completados con totales
- 📊 **Dashboard**: Métricas visuales de citas, clientes y productividad
- 🔔 **Recordatorios**: Sistema de obligaciones con prioridades
- 📱 **Responsive**: Funciona en escritorio y móvil

## Tech Stack

- **Frontend**: Next.js 14 (App Router), React 18, TypeScript
- **Estilos**: Tailwind CSS
- **Backend/DB**: Supabase (PostgreSQL, Auth, RLS)
- **Deploy**: Vercel

## Requisitos Previos

1. Node.js 18+
2. Cuenta de [Supabase](https://supabase.com)

## Instalación

1. **Clonar el repositorio**
```bash
git clone https://github.com/Srodasc/app_amanti_barbiere.git
cd app_amanti_barbiere
```

2. **Instalar dependencias**
```bash
npm install
```

3. **Configurar variables de entorno**

Crea un archivo `.env.local` en la raíz del proyecto:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://tu-proyecto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=tu-anon-key
DEFAULT_ADMIN_ID=tu-admin-id
```

4. **Configurar Supabase**

Ejecuta el script SQL en `supabase/schema.sql` en tu panel de Supabase:
- Ve a SQL Editor en tu proyecto de Supabase
- Copia y pega el contenido de `supabase/schema.sql`
- Ejecuta el script

5. **Ejecutar en desarrollo**
```bash
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000)

## Estructura del Proyecto

```
src/
├── app/
│   ├── (auth)/           # Rutas de autenticación admin
│   │   ├── login/
│   │   └── register/
│   ├── (dashboard)/      # Rutas del panel admin
│   │   └── dashboard/
│   │       ├── clients/
│   │       ├── appointments/
│   │       ├── barbers/
│   │       ├── expenses/
│   │       ├── reminders/
│   │       └── settings/
│   ├── api/              # API routes
│   ├── book/             # Página pública de reservas
│   ├── client-login/     # Login de clientes
│   ├── client-portal/    # Portal del cliente
│   └── register-client/ # Registro de clientes
├── components/
│   └── ui/               # Componentes reutilizables
├── hooks/                # Custom hooks (Supabase)
├── lib/
│   ├── supabase/         # Configuración de cliente
│   └── utils.ts          # Utilidades
└── types/                # Tipos TypeScript
```

## Roles de Usuario

- **Administrador**: Accede al dashboard completo para gestionar clientes, citas, barberías, gastos y recordatorios
- **Cliente**: Puede registrarse, hacer login, ver sus citas y reservar nuevas citas desde la página pública

## Deploy en Vercel

1. Sube tu código a GitHub
2. Conecta tu repo a Vercel
3. Agrega las variables de entorno en Vercel:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `DEFAULT_ADMIN_ID`
4. Deploy automático en cada push a main

## Scripts Disponibles

```bash
npm run dev      # Desarrollo
npm run build    # Build de producción
npm run start    # Iniciar producción
npm run lint     # Linting
```

## Licencia

MIT