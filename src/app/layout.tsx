import type { Metadata, Viewport } from 'next';
import { ToastProvider } from '@/components/ui';
import RegisterSW from '@/components/pwa/RegisterSW';
import './globals.css';

export const metadata: Metadata = {
  title: 'Amanti Barbiere - Sistema de Gestión para Barbería',
  description: 'Plataforma integral para barberías con agendamiento de citas, control de gastos y más.',
  // Al agregarla a la pantalla de inicio del iPhone se abre como app, sin barra del navegador
  appleWebApp: { capable: true, title: 'Amanti', statusBarStyle: 'default' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#775a19',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body className="no-pull-refresh antialiased">
        <ToastProvider>
          {children}
        </ToastProvider>
        <RegisterSW />
      </body>
    </html>
  );
}
