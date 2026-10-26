'use client';

import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { CalendarClock, MessageCircle, Phone, Scissors, User, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatPhone } from '@/lib/phone';
import { PAYMENT_LABELS, SOURCE_LABELS, money, time12, whatsappLink } from '@/lib/appointments';
import AppointmentReward from '@/components/loyalty/AppointmentReward';
import type { LoyaltyBalance, LoyaltyRule } from '@/lib/loyalty';
import { STATUS_UI } from './agendaUi';
import type { AgendaAppointment } from './useAgenda';

export type PanelAction = 'confirm' | 'start' | 'complete' | 'reschedule' | 'no_show' | 'cancel' | 'delete';

/** Detalle de la cita seleccionada con todas sus acciones. */
export default function AppointmentPanel({
  appointment: a,
  rules,
  balances,
  busy,
  onAction,
  onClose,
  onRewardChanged,
}: {
  appointment: AgendaAppointment;
  rules: LoyaltyRule[];
  balances: LoyaltyBalance[];
  busy: boolean;
  onAction: (action: PanelAction) => void;
  onClose?: () => void;
  onRewardChanged: () => void;
}) {
  const ui = STATUS_UI[a.status];
  const open = ['pending', 'confirmed', 'in_progress'].includes(a.status);
  const movable = a.status === 'pending' || a.status === 'confirmed';
  const name = a.client?.name ?? a.client_name ?? 'Cliente';
  const phone = a.client?.phone && a.client.phone !== 'mostrador' ? a.client.phone : null;
  const wa = whatsappLink(phone);
  const price = Number(a.price ?? a.service?.price ?? 0);

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <span
            className="inline-block text-xs font-bold px-2 py-0.5 rounded-full mb-1.5"
            style={{ background: ui.bg, color: ui.text, border: `1px solid ${ui.border}` }}
          >
            {ui.label}
          </span>
          <h3 className="text-lg font-heading font-bold text-inverse leading-tight">{name}</h3>
          <p className="text-sm text-inverse/70 first-letter:uppercase">
            {format(new Date(`${a.date}T00:00:00`), "EEEE d 'de' MMMM", { locale: es })} · {time12(a.start_time)} – {time12(a.end_time)}
          </p>
        </div>
        {onClose && (
          <button type="button" onClick={onClose} aria-label="Cerrar detalle" className="p-1.5 rounded hover:bg-surface-container-low text-inverse/70">
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      <dl className="space-y-2 text-sm">
        <div className="flex items-center gap-2">
          <Scissors className="w-4 h-4 text-inverse/50 shrink-0" aria-hidden="true" />
          <dt className="sr-only">Servicio</dt>
          <dd className="flex-1">
            {a.service?.name ?? 'Servicio'} · <strong>{money(price)}</strong>
          </dd>
        </div>
        <div className="flex items-center gap-2">
          <User className="w-4 h-4 text-inverse/50 shrink-0" aria-hidden="true" />
          <dt className="sr-only">Barbero</dt>
          <dd className="flex-1">con {a.barber?.name ?? 'sin barbero'}</dd>
          {a.source && SOURCE_LABELS[a.source] && (
            <span className="text-[11px] font-bold px-1.5 py-0.5 rounded border border-primary-200 text-primary-700">{SOURCE_LABELS[a.source]}</span>
          )}
        </div>
        {phone && (
          <div className="flex items-center gap-2">
            <Phone className="w-4 h-4 text-inverse/50 shrink-0" aria-hidden="true" />
            <dt className="sr-only">Celular</dt>
            <dd className="flex-1">{formatPhone(phone)}</dd>
            {wa && (
              <a
                href={wa}
                target="_blank"
                rel="noopener"
                className="inline-flex items-center gap-1 text-xs font-bold px-2 py-1 rounded bg-success/15 text-success hover:bg-success/25"
              >
                <MessageCircle className="w-3.5 h-3.5" aria-hidden="true" /> WhatsApp
              </a>
            )}
          </div>
        )}
      </dl>

      {a.notes && <p className="text-sm text-inverse/80 bg-surface-container-low rounded-lg px-3 py-2">“{a.notes}”</p>}

      <AppointmentReward
        appointment={a}
        rules={rules}
        balances={balances}
        clientName={a.client?.name}
        clientPhone={a.client?.phone}
        onChanged={onRewardChanged}
      />

      {a.status === 'completed' && a.paid_amount != null && (
        <p className="text-sm font-semibold text-success bg-success/10 rounded-lg px-3 py-2">
          Cobrado {money(Number(a.paid_amount))}
          {a.payment_method && ` · ${PAYMENT_LABELS[a.payment_method] ?? a.payment_method}`}
        </p>
      )}
      {a.status === 'cancelled' && a.cancel_reason && <p className="text-sm text-inverse/70">Motivo: {a.cancel_reason}</p>}

      {open && (
        <div className="space-y-2 pt-3 border-t border-surface-300">
          <button
            type="button"
            disabled={busy}
            onClick={() => onAction('complete')}
            className="w-full min-h-[44px] text-sm font-bold bg-primary text-white rounded-lg hover:bg-primary-600 disabled:opacity-60"
          >
            Completar y cobrar
          </button>
          <div className="grid grid-cols-2 gap-2">
            {a.status === 'pending' && (
              <ActionBtn disabled={busy} onClick={() => onAction('confirm')} className="bg-success/15 text-success hover:bg-success/25">
                Confirmar
              </ActionBtn>
            )}
            {a.status !== 'in_progress' && (
              <ActionBtn disabled={busy} onClick={() => onAction('start')} className="bg-info/15 text-info hover:bg-info/25">
                Iniciar
              </ActionBtn>
            )}
            {movable && (
              <ActionBtn disabled={busy} onClick={() => onAction('reschedule')} className="border border-primary-200 text-primary-700 hover:bg-primary-50">
                <CalendarClock className="w-4 h-4" aria-hidden="true" /> Reprogramar
              </ActionBtn>
            )}
            <ActionBtn disabled={busy} onClick={() => onAction('no_show')} className="border border-surface-300 hover:bg-surface">
              No llegó
            </ActionBtn>
            <ActionBtn disabled={busy} onClick={() => onAction('cancel')} className="text-error border border-error/30 hover:bg-error/10">
              Cancelar…
            </ActionBtn>
          </div>
        </div>
      )}

      {a.status !== 'completed' && (
        <button type="button" onClick={() => onAction('delete')} className="w-full py-1 text-xs text-inverse/60 hover:text-error">
          Eliminar (creada por error)
        </button>
      )}
    </div>
  );
}

function ActionBtn({ className, ...p }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...p}
      className={cn('min-h-[40px] inline-flex items-center justify-center gap-1.5 text-sm font-semibold rounded-lg transition-colors disabled:opacity-60', className)}
    />
  );
}
