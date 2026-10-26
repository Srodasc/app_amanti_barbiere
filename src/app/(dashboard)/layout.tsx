'use client';

import { useEffect, useState } from 'react';
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
  ExternalLink,
  Package,
  Gift,
  ShieldCheck,
  Wallet,
  Percent,
  X,
} from 'lucide-react';
import { useAuth } from '@/hooks';
import { useReminders } from '@/hooks';
import { cn } from '@/lib/utils';
import { Avatar } from '@/components/ui';

type NavItem = { href: string; icon: typeof Calendar; label: string; badge?: boolean };

// Agrupado por uso: lo del día a día arriba, configuración abajo
const navGroups: { title: string | null; items: NavItem[] }[] = [
  {
    title: null,
    items: [
      { href: '/dashboard', icon: LayoutDashboard, label: 'Inicio' },
      { href: '/dashboard/appointments', icon: Calendar, label: 'Citas' },
      { href: '/dashboard/cash', icon: Wallet, label: 'Caja' },
    ],
  },
  {
    title: 'Personas',
    items: [
      { href: '/dashboard/clients', icon: Users, label: 'Clientes' },
      { href: '/dashboard/barbers', icon: UserCog, label: 'Barberos' },
      { href: '/dashboard/loyalty', icon: Gift, label: 'Fidelización' },
    ],
  },
  {
    title: 'Negocio',
    items: [
      { href: '/dashboard/products', icon: Package, label: 'Productos' },
      { href: '/dashboard/commissions', icon: Percent, label: 'Comisiones' },
      { href: '/dashboard/expenses', icon: DollarSign, label: 'Gastos' },
      { href: '/dashboard/reminders', icon: Bell, label: 'Recordatorios', badge: true },
    ],
  },
  {
    title: 'Ajustes',
    items: [
      { href: '/dashboard/users', icon: ShieldCheck, label: 'Usuarios' },
      { href: '/dashboard/settings', icon: Settings, label: 'Configuración' },
    ],
  },
];
const allItems = navGroups.flatMap((g) => g.items);

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, signOut } = useAuth();
  const { getPendingCount } = useReminders();
  const [open, setOpen] = useState(false);

  const isActive = (href: string) => pathname === href || (href !== '/dashboard' && pathname.startsWith(href));
  const current = allItems.find((i) => isActive(i.href));

  // Menú del celular: cerrar con Escape y no dejar que la página de atrás se desplace
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => setOpen(false), [pathname]);

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
    <div className="min-h-screen bg-surface lg:flex">
      <aside
        id="menu-principal"
        aria-label="Menú principal"
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] h-[100dvh] bg-inverse transform transition-transform duration-200',
          'lg:sticky lg:top-0 lg:z-auto lg:w-60 xl:w-64 lg:max-w-none lg:h-screen lg:translate-x-0 lg:shrink-0',
          open ? 'translate-x-0 shadow-2xl' : '-translate-x-full'
        )}
      >
        <div className="h-full flex flex-col">
          <div className="h-16 px-5 flex items-center justify-between border-b border-white/10 shrink-0">
            <Link href="/dashboard" className="flex items-center gap-2 min-w-0">
              <Scissors className="w-7 h-7 text-gold-light shrink-0" aria-hidden="true" />
              <span className="text-lg font-heading font-bold text-surface truncate">Amanti Barbiere</span>
            </Link>
            <button type="button" onClick={() => setOpen(false)} aria-label="Cerrar menú" className="lg:hidden p-2 -mr-2 text-white/70 hover:text-white">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* La lista se desplaza si la pantalla es baja; el usuario y "Salir" siempre quedan visibles */}
          <nav className="flex-1 overflow-y-auto overscroll-contain px-3 py-3 sidebar-scroll">
            {navGroups.map((g, gi) => (
              <div key={gi} className={cn(gi > 0 && 'mt-4')}>
                {g.title && <p className="px-3 mb-1 text-[11px] font-semibold text-white/50 uppercase tracking-wider">{g.title}</p>}
                <ul className="space-y-0.5">
                  {g.items.map((item) => {
                    const active = isActive(item.href);
                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          aria-current={active ? 'page' : undefined}
                          className={cn(
                            'flex items-center gap-3 px-3 min-h-[42px] rounded-lg text-[15px] transition-colors',
                            active ? 'bg-primary text-white font-semibold' : 'text-white/85 hover:bg-white/10 hover:text-white'
                          )}
                        >
                          <item.icon className="w-[18px] h-[18px] shrink-0" aria-hidden="true" />
                          <span className="truncate">{item.label}</span>
                          {item.badge && pendingReminders > 0 && (
                            <span className="ml-auto bg-error text-white text-xs font-bold px-2 py-0.5 rounded-full">{pendingReminders}</span>
                          )}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}

            <div className="mt-4 pt-3 border-t border-white/10">
              <a
                href="/book"
                target="_blank"
                rel="noopener"
                className="flex items-center gap-3 px-3 min-h-[42px] rounded-lg text-[15px] text-white/85 hover:bg-white/10 hover:text-white"
              >
                <ExternalLink className="w-[18px] h-[18px] shrink-0" aria-hidden="true" />
                <span>Página de reservas</span>
              </a>
            </div>
          </nav>

          <div className="shrink-0 border-t border-white/10 p-3">
            <div className="flex items-center gap-3 px-2 py-1.5">
              <Avatar name={user?.email || 'Usuario'} size="sm" />
              <p className="flex-1 min-w-0 text-sm text-white/90 truncate">{user?.email}</p>
              <button
                type="button"
                onClick={handleSignOut}
                className="inline-flex items-center gap-1.5 px-2.5 h-9 rounded-lg text-sm text-white/80 hover:text-white hover:bg-white/10"
                title="Cerrar sesión"
              >
                <LogOut className="w-4 h-4" aria-hidden="true" />
                Salir
              </button>
            </div>
          </div>
        </div>
      </aside>

      {open && <div className="fixed inset-0 bg-inverse/60 z-40 lg:hidden" onClick={() => setOpen(false)} aria-hidden="true" />}

      <div className="flex-1 flex flex-col min-w-0">
        <header className="lg:hidden sticky top-0 z-30 h-14 bg-surface/95 backdrop-blur border-b border-surface-300 px-2 flex items-center gap-1">
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Abrir menú"
            aria-expanded={open}
            aria-controls="menu-principal"
            className="w-11 h-11 flex items-center justify-center rounded-lg text-inverse/80 hover:bg-surface-200"
          >
            <Menu className="w-6 h-6" />
          </button>
          <Link href="/dashboard" className="flex items-center gap-2 min-w-0">
            <Scissors className="w-5 h-5 text-primary shrink-0" aria-hidden="true" />
            <span className="font-heading font-bold text-inverse truncate">{current && current.href !== '/dashboard' ? current.label : 'Amanti Barbiere'}</span>
          </Link>
        </header>

        <main className="flex-1 w-full max-w-[1400px] mx-auto px-4 py-5 sm:px-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
