'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { 
  LayoutDashboard, 
  Calendar, 
  Users, 
  DollarSign, 
  Bell, 
  Settings, 
  LogOut,
  Scissors,
  Menu,
  UserCog,
  Clock
} from 'lucide-react';
import { useAuth } from '@/hooks';
import { useReminders } from '@/hooks';
import { cn } from '@/lib/utils';
import { Avatar } from '@/components/ui';

const navItems = [
  { href: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { href: '/dashboard/appointments', icon: Calendar, label: 'Citas' },
  { href: '/dashboard/barbers', icon: UserCog, label: 'Barberos' },
  { href: '/dashboard/clients', icon: Users, label: 'Clientes' },
  { href: '/dashboard/expenses', icon: DollarSign, label: 'Gastos' },
  { href: '/dashboard/reminders', icon: Bell, label: 'Recordatorios', badge: true },
];

const secondaryNavItems = [
  { href: '/book', icon: Clock, label: 'Reservar Cita', external: true },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { user, signOut } = useAuth();
  const { getPendingCount } = useReminders();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const handleSignOut = async () => {
    await signOut();
    // Limpiar todas las cookies de sesión
    document.cookie.split(';').forEach((c) => { 
      document.cookie = c.replace(/^ +/, '').replace(/=.*/, '=;expires=' + new Date().toUTCString() + ';path=/');
    });
    window.location.href = '/login';
  };

  const pendingReminders = getPendingCount();

  return (
    <div className="min-h-screen bg-surface flex">
      <aside className={cn(
        'fixed lg:static inset-y-0 left-0 z-50 w-64 bg-inverse border-r border-inverse-50 transform transition-transform lg:translate-x-0',
        isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
      )}>
        <div className="h-full flex flex-col">
          <div className="p-6 border-b border-inverse-50">
            <Link href="/dashboard" className="flex items-center gap-2">
              <Scissors className="w-8 h-8 text-gold-light" />
              <span className="text-xl font-heading font-bold text-surface">Amanti Barbiere</span>
            </Link>
          </div>

          <nav className="flex-1 p-4 space-y-1">
            {navItems.map((item) => {
              const isActive = pathname === item.href || 
                (item.href !== '/dashboard' && pathname.startsWith(item.href));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setIsSidebarOpen(false)}
                  className={cn(
                    'flex items-center gap-3 px-4 py-3 rounded transition-all',
                    isActive 
                      ? 'bg-primary text-surface font-semibold' 
                      : 'text-white hover:bg-inverse-50 hover:text-surface'
                  )}
                >
                  <item.icon className="w-5 h-5" />
                  <span>{item.label}</span>
                  {item.badge && pendingReminders > 0 && (
                    <span className="ml-auto bg-error text-surface text-xs font-bold px-2 py-0.5 rounded-sm">
                      {pendingReminders}
                    </span>
                  )}
                </Link>
              );
            })}
            
            <div className="pt-4 border-t border-inverse-50">
              <p className="px-4 text-xs text-surface/50 uppercase tracking-wider mb-2">Herramientas</p>
              {secondaryNavItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  target={item.external ? '_blank' : undefined}
                  onClick={() => setIsSidebarOpen(false)}
                  className="flex items-center gap-3 px-4 py-3 rounded text-white hover:bg-inverse-50 hover:text-surface transition-all"
                >
                  <item.icon className="w-5 h-5" />
                  <span>{item.label}</span>
                </Link>
              ))}
            </div>
          </nav>

          <div className="p-4 border-t border-inverse-50">
            <Link
              href="/dashboard/settings"
              className="flex items-center gap-3 px-4 py-3 rounded text-white hover:bg-inverse-50 hover:text-surface transition-all"
            >
              <Settings className="w-5 h-5" />
              <span>Configuración</span>
            </Link>
          </div>

          <div className="p-4 border-t border-inverse-50">
            <div className="flex items-center gap-3 px-4 py-3">
              <Avatar name={user?.email || 'User'} size="sm" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-surface truncate">
                  {user?.email}
                </p>
              </div>
              <button
                onClick={handleSignOut}
                className="p-2 text-surface/50 hover:text-error transition-colors"
                title="Cerrar sesión"
              >
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </aside>

      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-inverse/60 z-40 lg:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      <div className="flex-1 flex flex-col min-w-0">
        <header className="lg:hidden sticky top-0 z-30 bg-surface border-b border-surface-container-low px-4 py-3 flex items-center justify-between">
          <button
            onClick={() => setIsSidebarOpen(true)}
            className="p-2 text-inverse/70 hover:text-inverse transition-colors touch-target flex items-center justify-center"
          >
            <Menu className="w-6 h-6" />
          </button>
          <Link href="/dashboard" className="flex items-center gap-2">
            <Scissors className="w-6 h-6 text-primary" />
            <span className="font-heading font-bold text-inverse">Amanti Barbiere</span>
          </Link>
          <div className="w-10" />
        </header>

        <main className="flex-1 p-4 lg:p-8 pb-24 lg:pb-8 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
