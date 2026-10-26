'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Plus, Edit2, KeyRound, UserX, UserCheck, ShieldCheck, Lock } from 'lucide-react';
import { Button, Input, Select, Modal, Card, Badge } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import { cn } from '@/lib/utils';

type Role = 'owner' | 'manager';
type AdminRow = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: Role;
  is_active: boolean;
  created_at: string;
  last_sign_in_at: string | null;
  is_me: boolean;
  has_login: boolean;
  login_blocked: boolean;
};
type BarberRow = { id: string; name: string; email: string | null; is_active: boolean; last_sign_in_at: string | null };

const ROLES: Record<Role, { label: string; help: string }> = {
  owner: { label: 'Dueño', help: 'Todo, incluida la gestión de usuarios.' },
  manager: { label: 'Encargado', help: 'Todo el panel excepto gestionar usuarios.' },
};

const lastSeen = (ts: string | null) =>
  ts ? `Último ingreso: ${format(new Date(ts), "d MMM yyyy, h:mm a", { locale: es })}` : 'Nunca ha ingresado';

const emptyForm = { name: '', email: '', phone: '', role: 'manager' as Role, password: '' };

export default function UsersPage() {
  const { showToast } = useToast();
  const [admins, setAdmins] = useState<AdminRow[]>([]);
  const [barbers, setBarbers] = useState<BarberRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState('');

  const [editing, setEditing] = useState<AdminRow | 'new' | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [pwdFor, setPwdFor] = useState<AdminRow | null>(null);
  const [pwd, setPwd] = useState('');
  const [toggleFor, setToggleFor] = useState<AdminRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch('/api/admin/users', { cache: 'no-store' });
    const data = await res.json().catch(() => ({}));
    if (res.status === 403 || res.status === 401) setForbidden(data.error || 'Sin permisos');
    else if (!res.ok) showToast(data.error || 'No se pudo cargar', 'error');
    else {
      setAdmins(data.admins ?? []);
      setBarbers(data.barbers ?? []);
    }
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const call = async (method: 'POST' | 'PATCH', body: Record<string, unknown>) => {
    setSaving(true);
    setFormError('');
    const res = await fetch('/api/admin/users', {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      setFormError(data.error || 'No se pudo guardar');
      return null;
    }
    if (data.warning) showToast(data.warning, 'error');
    return data;
  };

  const openNew = () => {
    setForm(emptyForm);
    setFormError('');
    setEditing('new');
  };
  const openEdit = (a: AdminRow) => {
    setForm({ name: a.name, email: a.email, phone: a.phone ?? '', role: a.role, password: '' });
    setFormError('');
    setEditing(a);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.name.trim().length < 2) return setFormError('Escribe el nombre.');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email.trim())) return setFormError('Correo inválido.');
    if (editing === 'new') {
      if (form.password.length < 8) return setFormError('La contraseña debe tener al menos 8 caracteres.');
      const ok = await call('POST', { ...form, phone: form.phone || null });
      if (!ok) return;
      showToast(`Usuario creado. Ya puede entrar en /login con ${form.email.trim()}`, 'success');
    } else if (editing) {
      const ok = await call('PATCH', {
        id: editing.id,
        name: form.name,
        email: form.email,
        phone: form.phone || null,
        ...(editing.is_me ? {} : { role: form.role }),
      });
      if (!ok) return;
      showToast('Usuario actualizado', 'success');
    }
    setEditing(null);
    load();
  };

  const savePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pwdFor) return;
    if (pwd.length < 8) return setFormError('La contraseña debe tener al menos 8 caracteres.');
    const ok = await call('PATCH', { id: pwdFor.id, password: pwd });
    if (!ok) return;
    showToast('Contraseña cambiada. Compártela por un medio privado.', 'success');
    setPwdFor(null);
  };

  const saveToggle = async () => {
    if (!toggleFor) return;
    const ok = await call('PATCH', { id: toggleFor.id, is_active: !toggleFor.is_active });
    if (!ok) return; // el error se muestra dentro del modal
    showToast(toggleFor.is_active ? 'Usuario desactivado' : 'Usuario reactivado', 'success');
    setToggleFor(null);
    load();
  };

  if (forbidden) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-center">
        <Lock className="w-10 h-10 text-inverse/40" />
        <p className="text-inverse/70">{forbidden}</p>
        <p className="text-sm text-inverse/50">Pídele a un dueño que te cambie el rol si necesitas gestionar usuarios.</p>
      </div>
    );
  }

  const activeOwners = admins.filter((a) => a.is_active && a.role === 'owner').length;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-heading font-bold text-inverse">Usuarios</h1>
          <p className="text-inverse/60">Quién puede entrar al panel</p>
        </div>
        <Button onClick={openNew}>
          <Plus className="w-4 h-4 mr-2" /> Nuevo usuario
        </Button>
      </div>

      <Card className="!p-0" hover={false}>
        <div className="p-4 border-b border-surface-container-low">
          <h2 className="font-semibold">Administradores</h2>
          <p className="text-sm text-inverse/60">
            <strong>Dueño</strong>: {ROLES.owner.help} <strong>Encargado</strong>: {ROLES.manager.help}
          </p>
        </div>
        {loading ? (
          <p className="p-6 text-inverse/60">Cargando...</p>
        ) : (
          <ul className="divide-y divide-surface-container-low">
            {admins.map((a) => {
              const lastOwner = a.is_active && a.role === 'owner' && activeOwners <= 1;
              return (
                <li key={a.id} className={cn('p-4 flex flex-col sm:flex-row sm:items-center gap-3', !a.is_active && 'opacity-60')}>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold flex flex-wrap items-center gap-2">
                      {a.name}
                      {a.is_me && <Badge variant="info">Tú</Badge>}
                      <Badge variant={a.role === 'owner' ? 'accent' : 'default'}>
                        {a.role === 'owner' && <ShieldCheck className="w-3 h-3 mr-1 inline" />}
                        {ROLES[a.role].label}
                      </Badge>
                      {!a.is_active && <Badge variant="error">Desactivado</Badge>}
                    </p>
                    <p className="text-sm text-inverse/70 truncate">
                      {a.email}
                      {a.phone && ` · ${a.phone}`}
                    </p>
                    <p className="text-xs text-inverse/50">
                      {a.has_login ? lastSeen(a.last_sign_in_at) : 'Sin cuenta de acceso'}
                      {a.login_blocked && ' · Inicio de sesión bloqueado'}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <button title="Editar" onClick={() => openEdit(a)} className="p-2 rounded-lg text-inverse/60 hover:text-primary hover:bg-surface">
                      <Edit2 className="w-4 h-4" />
                    </button>
                    {a.has_login && (
                      <button
                        title="Cambiar contraseña"
                        onClick={() => { setPwd(''); setFormError(''); setPwdFor(a); }}
                        className="p-2 rounded-lg text-inverse/60 hover:text-primary hover:bg-surface"
                      >
                        <KeyRound className="w-4 h-4" />
                      </button>
                    )}
                    {!a.is_me && (
                      <button
                        title={lastOwner ? 'Es el único dueño activo' : a.is_active ? 'Desactivar' : 'Reactivar'}
                        disabled={lastOwner}
                        onClick={() => { setFormError(''); setToggleFor(a); }}
                        className={cn(
                          'p-2 rounded-lg hover:bg-surface disabled:opacity-30 disabled:cursor-not-allowed',
                          a.is_active ? 'text-inverse/60 hover:text-error' : 'text-inverse/60 hover:text-success'
                        )}
                      >
                        {a.is_active ? <UserX className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card className="!p-0" hover={false}>
        <div className="p-4 border-b border-surface-container-low flex items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">Barberos con acceso</h2>
            <p className="text-sm text-inverse/60">Entran a Mi día. Su acceso se gestiona en Barberos (ícono de llave).</p>
          </div>
          <Link href="/dashboard/barbers" className="text-sm text-primary underline shrink-0">Ir a Barberos</Link>
        </div>
        {barbers.length === 0 ? (
          <p className="p-6 text-inverse/60 text-sm">Ningún barbero tiene acceso todavía.</p>
        ) : (
          <ul className="divide-y divide-surface-container-low">
            {barbers.map((b) => (
              <li key={b.id} className={cn('p-4', !b.is_active && 'opacity-60')}>
                <p className="font-medium">
                  {b.name} {!b.is_active && <Badge>Inactivo</Badge>}
                </p>
                <p className="text-sm text-inverse/70">{b.email ?? 'Cuenta no encontrada'}</p>
                <p className="text-xs text-inverse/50">{lastSeen(b.last_sign_in_at)}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* ---------- Modales ---------- */}
      <Modal isOpen={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? 'Nuevo usuario' : 'Editar usuario'}>
        <form onSubmit={save} className="space-y-4">
          <Input label="Nombre" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Input label="Correo (con el que inicia sesión)" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <Input label="Teléfono (opcional)" type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          {editing !== 'new' && editing?.is_me ? (
            <p className="text-sm text-inverse/60">Rol: <strong>{ROLES[form.role].label}</strong>. No puedes cambiar tu propio rol.</p>
          ) : (
            <Select
              label="Rol"
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value as Role })}
              options={(Object.keys(ROLES) as Role[]).map((r) => ({ value: r, label: `${ROLES[r].label} — ${ROLES[r].help}` }))}
            />
          )}
          {editing === 'new' && (
            <Input
              label="Contraseña inicial (mínimo 8 caracteres)"
              type="password"
              autoComplete="new-password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
          )}
          {formError && <p className="text-sm text-error">{formError}</p>}
          <div className="flex gap-3 pt-2">
            <Button type="button" variant="ghost" onClick={() => setEditing(null)} className="flex-1">Cancelar</Button>
            <Button type="submit" isLoading={saving} className="flex-1">{editing === 'new' ? 'Crear usuario' : 'Guardar'}</Button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={!!pwdFor} onClose={() => setPwdFor(null)} title={`Contraseña de ${pwdFor?.name ?? ''}`}>
        <form onSubmit={savePassword} className="space-y-4">
          <Input
            label="Nueva contraseña (mínimo 8 caracteres)"
            type="password"
            autoComplete="new-password"
            value={pwd}
            onChange={(e) => setPwd(e.target.value)}
          />
          <p className="text-xs text-inverse/50">Compártela por un medio privado y pídele que la cambie después.</p>
          {formError && <p className="text-sm text-error">{formError}</p>}
          <div className="flex gap-3 pt-2">
            <Button type="button" variant="ghost" onClick={() => setPwdFor(null)} className="flex-1">Cancelar</Button>
            <Button type="submit" isLoading={saving} className="flex-1">Cambiar contraseña</Button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={!!toggleFor} onClose={() => setToggleFor(null)} title={toggleFor?.is_active ? 'Desactivar usuario' : 'Reactivar usuario'}>
        <div className="space-y-4">
          {toggleFor?.is_active ? (
            <p className="text-sm">
              <strong>{toggleFor?.name}</strong> no podrá entrar al panel y se bloqueará su inicio de sesión. Sus gastos, citas y servicios se
              conservan. Puedes reactivarlo cuando quieras.
            </p>
          ) : (
            <p className="text-sm">
              <strong>{toggleFor?.name}</strong> podrá volver a entrar al panel con su correo y contraseña.
            </p>
          )}
          {formError && <p className="text-sm text-error">{formError}</p>}
          <div className="flex gap-3 pt-2">
            <Button type="button" variant="ghost" onClick={() => setToggleFor(null)} className="flex-1">Volver</Button>
            <Button type="button" variant={toggleFor?.is_active ? 'danger' : 'primary'} isLoading={saving} onClick={saveToggle} className="flex-1">
              {toggleFor?.is_active ? 'Desactivar' : 'Reactivar'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
