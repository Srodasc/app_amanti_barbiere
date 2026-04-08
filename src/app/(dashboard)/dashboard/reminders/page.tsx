'use client';

import { useState } from 'react';
import { 
  Plus, 
  Bell, 
  Check, 
  Trash2, 
  Clock,
  AlertTriangle,
  Calendar,
  CreditCard,
  ShoppingCart,
  Users,
  Star
} from 'lucide-react';
import { useReminders } from '@/hooks';
import { Button, Input, Select, Modal, Card, Badge } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import { formatDate, formatTime, isOverdue, isToday, cn, getErrorMessage } from '@/lib/utils';
import { Reminder, ReminderType, ReminderPriority, REMINDER_TYPES, REMINDER_PRIORITIES } from '@/types';
import type { BadgeVariant } from '@/components/ui/Badge';

const TYPE_ICONS: Record<ReminderType, React.ElementType> = {
  payment: CreditCard,
  purchase: ShoppingCart,
  payroll: Users,
  appointment: Calendar,
  custom: Star,
};

const PRIORITY_COLORS: Record<ReminderPriority, BadgeVariant> = {
  low: 'success',
  medium: 'warning',
  high: 'error',
};

const emptyForm = {
  title: '',
  description: '',
  due_date: new Date().toISOString().split('T')[0],
  due_time: '',
  type: '' as ReminderType | '',
  priority: 'medium' as ReminderPriority,
};

export default function RemindersPage() {
  const { 
    reminders, 
    addReminder, 
    updateReminder, 
    toggleComplete, 
    deleteReminder,
    getPendingReminders,
    getCompletedReminders,
    getOverdueReminders,
    getTodayReminders,
    isLoading 
  } = useReminders();
  const { showToast } = useToast();
  
  const [filter, setFilter] = useState<'all' | 'pending' | 'completed' | 'overdue' | 'today'>('pending');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [reminderToDelete, setReminderToDelete] = useState<Reminder | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const filteredReminders = () => {
    switch (filter) {
      case 'pending': return getPendingReminders();
      case 'completed': return getCompletedReminders();
      case 'overdue': return getOverdueReminders();
      case 'today': return getTodayReminders();
      default: return reminders;
    }
  };

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (!form.title) newErrors.title = 'El título es requerido';
    if (!form.due_date) newErrors.due_date = 'La fecha es requerida';
    if (!form.type) newErrors.type = 'Selecciona un tipo';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const openCreateModal = () => {
    setForm(emptyForm);
    setErrors({});
    setIsModalOpen(true);
  };

  const openDeleteModal = (reminder: Reminder) => {
    setReminderToDelete(reminder);
    setIsDeleteModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setIsSubmitting(true);
    await addReminder({
      title: form.title,
      description: form.description || null,
      due_date: form.due_date,
      due_time: form.due_time || null,
      type: form.type as ReminderType,
      priority: form.priority,
    });

    setIsSubmitting(false);
    showToast('Recordatorio creado', 'success');
    setIsModalOpen(false);
  };

  const handleToggleComplete = async (id: string) => {
    const { error } = await toggleComplete(id);
    if (error) {
      showToast(getErrorMessage(error), 'error');
    } else {
      showToast('Estado actualizado', 'success');
    }
  };

  const handleDelete = async () => {
    if (!reminderToDelete) return;
    
    setIsSubmitting(true);
    const { error } = await deleteReminder(reminderToDelete.id);
    setIsSubmitting(false);

    if (error) {
      showToast(getErrorMessage(error), 'error');
    } else {
      showToast('Recordatorio eliminado', 'success');
      setIsDeleteModalOpen(false);
    }
  };

  const pendingCount = getPendingReminders().length;
  const overdueCount = getOverdueReminders().length;
  const todayCount = getTodayReminders().length;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-heading font-bold text-inverse">Recordatorios</h1>
          <p className="text-inverse/60">No olvides tus obligaciones</p>
        </div>
        <Button onClick={openCreateModal}>
          <Plus className="w-4 h-4 mr-2" />
          Nuevo Recordatorio
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card 
          className={cn(
            '!p-5 cursor-pointer transition-all',
            filter === 'overdue' && 'ring-2 ring-error'
          )}
          onClick={() => setFilter(filter === 'overdue' ? 'pending' : 'overdue')}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-inverse/60">Vencidos</p>
              <p className="text-2xl font-bold text-error mt-1">{overdueCount}</p>
            </div>
            <div className="w-12 h-12 bg-error/10 rounded-lg flex items-center justify-center">
              <AlertTriangle className="w-6 h-6 text-error" />
            </div>
          </div>
        </Card>

        <Card 
          className={cn(
            '!p-5 cursor-pointer transition-all',
            filter === 'today' && 'ring-2 ring-primary'
          )}
          onClick={() => setFilter(filter === 'today' ? 'pending' : 'today')}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-inverse/60">Para Hoy</p>
              <p className="text-2xl font-bold text-primary mt-1">{todayCount}</p>
            </div>
            <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
              <Bell className="w-6 h-6 text-primary" />
            </div>
          </div>
        </Card>

        <Card 
          className={cn(
            '!p-5 cursor-pointer transition-all',
            filter === 'pending' && 'ring-2 ring-warning'
          )}
          onClick={() => setFilter(filter === 'pending' ? 'all' : 'pending')}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-inverse/60">Pendientes</p>
              <p className="text-2xl font-bold text-warning mt-1">{pendingCount}</p>
            </div>
            <div className="w-12 h-12 bg-warning/10 rounded-lg flex items-center justify-center">
              <Clock className="w-6 h-6 text-warning" />
            </div>
          </div>
        </Card>
      </div>

      <div className="flex gap-2 flex-wrap">
        {[
          { key: 'pending', label: 'Pendientes' },
          { key: 'completed', label: 'Completados' },
          { key: 'today', label: 'Hoy' },
          { key: 'overdue', label: 'Vencidos' },
          { key: 'all', label: 'Todos' },
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setFilter(key as typeof filter)}
            className={cn(
              'px-4 py-2 rounded text-sm font-medium transition-all',
              filter === key 
                ? 'bg-primary text-white' 
                : 'bg-surface-container-low text-inverse/60 hover:text-inverse'
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <Card key={i} className="h-20">
              <div className="animate-pulse space-y-2">
                <div className="h-4 w-48 bg-surface-container-low rounded" />
                <div className="h-3 w-32 bg-surface-container-low rounded" />
              </div>
            </Card>
          ))}
        </div>
      ) : filteredReminders().length === 0 ? (
        <Card className="text-center py-12">
          <Bell className="w-12 h-12 mx-auto text-inverse/30 mb-4" />
          <p className="text-inverse/50">No hay recordatorios</p>
          <Button variant="ghost" onClick={openCreateModal} className="mt-4">
            Crear el primero
          </Button>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredReminders().map((reminder) => {
            const TypeIcon = TYPE_ICONS[reminder.type];
            const isReminderOverdue = isOverdue(reminder.due_date) && !reminder.is_completed;
            const isReminderToday = isToday(reminder.due_date);
            
            return (
              <Card 
                key={reminder.id} 
                className={cn(
                  '!p-4 transition-all',
                  reminder.is_completed && 'opacity-60'
                )}
              >
                <div className="flex items-start gap-4">
                  <button
                    onClick={() => handleToggleComplete(reminder.id)}
                    className={cn(
                      'w-6 h-6 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-all mt-0.5',
                      reminder.is_completed 
                        ? 'bg-success border-success text-white' 
                        : 'border-inverse/30 hover:border-success'
                    )}
                  >
                    {reminder.is_completed && <Check className="w-4 h-4" />}
                  </button>

                  <div className={cn(
                    'w-10 h-10 rounded flex items-center justify-center flex-shrink-0',
                    reminder.is_completed ? 'bg-surface-container-low' : 'bg-primary/10'
                  )}>
                    <TypeIcon className={cn(
                      'w-5 h-5',
                      reminder.is_completed ? 'text-inverse/40' : 'text-primary'
                    )} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className={cn(
                        'font-semibold text-inverse',
                        reminder.is_completed && 'line-through text-inverse/50'
                      )}>
                        {reminder.title}
                      </h3>
                      <Badge variant={PRIORITY_COLORS[reminder.priority]}>
                        {REMINDER_PRIORITIES[reminder.priority]}
                      </Badge>
                      {isReminderToday && !reminder.is_completed && (
                        <Badge variant="accent">Hoy</Badge>
                      )}
                      {isReminderOverdue && (
                        <Badge variant="error">Vencido</Badge>
                      )}
                    </div>
                    
                    <div className="flex items-center gap-4 mt-1 text-sm text-inverse/50">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-4 h-4" />
                        {formatDate(reminder.due_date)}
                      </span>
                      {reminder.due_time && (
                        <span className="flex items-center gap-1">
                          <Clock className="w-4 h-4" />
                          {formatTime(reminder.due_time)}
                        </span>
                      )}
                      <Badge variant="accent">
                        {REMINDER_TYPES[reminder.type]}
                      </Badge>
                    </div>

                    {reminder.description && (
                      <p className="mt-2 text-sm text-inverse/50">
                        {reminder.description}
                      </p>
                    )}
                  </div>

                  <button
                    onClick={() => openDeleteModal(reminder)}
                    className="p-2 text-inverse/40 hover:text-error hover:bg-surface-container-low rounded transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Nuevo Recordatorio"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Título"
            placeholder="¿Qué necesitas recordar?"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            error={errors.title}
          />

          <Select
            label="Tipo"
            placeholder="Selecciona el tipo"
            value={form.type}
            onChange={(e) => setForm({ ...form, type: e.target.value as ReminderType })}
            error={errors.type}
            options={Object.entries(REMINDER_TYPES).map(([value, label]) => ({ value, label }))}
          />

          <Select
            label="Prioridad"
            value={form.priority}
            onChange={(e) => setForm({ ...form, priority: e.target.value as ReminderPriority })}
            options={Object.entries(REMINDER_PRIORITIES).map(([value, label]) => ({ value, label }))}
          />

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Fecha"
              type="date"
              value={form.due_date}
              onChange={(e) => setForm({ ...form, due_date: e.target.value })}
              error={errors.due_date}
            />
            <Input
              label="Hora (opcional)"
              type="time"
              value={form.due_time}
              onChange={(e) => setForm({ ...form, due_time: e.target.value })}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-inverse/70 mb-2">
              Descripción (opcional)
            </label>
            <textarea
              className="input-field resize-none"
              rows={3}
              placeholder="Detalles adicionales..."
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>

          <div className="flex gap-3 pt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setIsModalOpen(false)}
              className="flex-1"
            >
              Cancelar
            </Button>
            <Button type="submit" isLoading={isSubmitting} className="flex-1">
              Crear
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        title="Eliminar Recordatorio"
        size="sm"
      >
        <p className="text-inverse/60 mb-6">
          ¿Estás seguro de eliminar este recordatorio? Esta acción no se puede deshacer.
        </p>
        <div className="flex gap-3">
          <Button
            variant="ghost"
            onClick={() => setIsDeleteModalOpen(false)}
            className="flex-1"
          >
            Cancelar
          </Button>
          <Button
            variant="danger"
            onClick={handleDelete}
            isLoading={isSubmitting}
            className="flex-1"
          >
            Eliminar
          </Button>
        </div>
      </Modal>
    </div>
  );
}
