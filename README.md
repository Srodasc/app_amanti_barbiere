# BarberHub

Sistema de gestión integral para barberías con Next.js, Supabase y Cloudinary.

## Características

- 📅 **Agenda de Citas**: Agendamiento en tiempo real con calendario visual
- 👥 **Portal de Clientes**: Registro y gestión de clientes con historial
- 💰 **Control de Gastos**: Registro categorizado con gráficos y exportación
- 📊 **Dashboard**: Métricas visuales de ingresos, gastos y productividad
- 🔔 **Recordatorios**: Sistema de obligaciones con prioridades
- 📱 **Responsive**: Funciona en escritorio y móvil

## Tech Stack

- **Frontend**: Next.js 14 (App Router), React 18, TypeScript
- **Estilos**: Tailwind CSS
- **Backend/DB**: Supabase (PostgreSQL, Auth, Realtime)
- **Imágenes**: Cloudinary
- **Deploy**: Vercel

## Requisitos Previos

1. Node.js 18+
2. Cuenta de [Supabase](https://supabase.com)
3. Cuenta de [Cloudinary](https://cloudinary.com)

## Instalación

1. **Clonar el repositorio**
```bash
git clone <tu-repo>
cd barber-hub
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
SUPABASE_SERVICE_ROLE_KEY=tu-service-role-key

# Cloudinary
NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME=tu-cloud-name
NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET=tu-upload-preset
```

4. **Configurar Supabase**

Ejecuta el script SQL en `supabase/schema.sql` en tu panel de Supabase:
- Ve a SQL Editor en tu proyecto de Supabase
- Copia y pega el contenido de `supabase/schema.sql`
- Ejecuta el script

5. **Crear upload preset en Cloudinary**
- Ve a Settings > Upload
- Crea un unsigned upload preset
- Anota el nombre para usar en `NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET`

6. **Ejecutar en desarrollo**
```bash
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000)

## Estructura del Proyecto

```
src/
├── app/
│   ├── (auth)/           # Rutas de autenticación
│   │   ├── login/
│   │   └── register/
│   ├── (dashboard)/      # Rutas del panel
│   │   └── dashboard/
│   │       ├── clients/
│   │       ├── appointments/
│   │       ├── expenses/
│   │       ├── reminders/
│   │       └── settings/
│   ├── api/              # API routes
│   └── globals.css       # Estilos globales
├── components/
│   └── ui/               # Componentes reutilizables
├── hooks/                # Custom hooks (Supabase)
├── lib/
│   ├── supabase/         # Configuración de cliente
│   └── utils.ts          # Utilidades
└── types/                # Tipos TypeScript
```

## Scripts Disponibles

```bash
npm run dev      # Desarrollo
npm run build    # Build de producción
npm run start    # Iniciar producción
npm run lint     # Linting
```

## Deploy en Vercel

1. Sube tu código a GitHub
2. Conecta tu repo a Vercel
3. Agrega las variables de entorno en Vercel
4. Deploy automático en cada push

## Licencia

MIT
