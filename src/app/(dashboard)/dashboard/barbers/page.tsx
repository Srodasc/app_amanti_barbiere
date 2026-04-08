'use client';

import { useState } from 'react';
import { Plus, Search, Edit2, Trash2, Phone, Mail, Scissors, Clock } from 'lucide-react';
import { useBarbers } from '@/hooks';
import { Button, Input, Modal, Card, Avatar, Badge, Table } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import { cn, formatDate, getErrorMessage } from '@/lib/utils';
import { Barber } from '@/types';
import Link from 'next/link';

const emptyForm = {
  name: '',
  email: '',
  phone: '',
  photo_url: '',
  specialty: '',
};

export default function BarbersPage() {
  const { barbers, addBarber, updateBarber, toggleActive, isLoading } = useBarbers();
  const { showToast } = useToast();
  
  const [searchQuery, setSearchQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingBarber, setEditingBarber] = useState<Barber | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const filteredBarbers = barbers.filter((b) =>
    b.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    b.specialty?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (!form.name || form.name.length < 2) {
      newErrors.name = 'El nombre es requerido (mínimo 2 caracteres)';
    }
    if (!form.phone) {
      newErrors.phone = 'El teléfono es requerido';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const openCreateModal = () => {
    setForm(emptyForm);
    setEditingBarber(null);
    setErrors({});
    setIsModalOpen(true);
  };

  const openEditModal = (barber: Barber) => {
    setForm({
      name: barber.name,
      email: barber.email || '',
      phone: barber.phone || '',
      photo_url: barber.photo_url || '',
      specialty: barber.specialty || '',
    });
    setEditingBarber(barber);
    setErrors({});
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setIsSubmitting(true);
    const barberData = {
      name: form.name,
      email: form.email || null,
      phone: form.phone,
      photo_url: form.photo_url || null,
      specialty: form.specialty || null,
      is_active: true,
    };

    let result;
    if (editingBarber) {
      result = await updateBarber(editingBarber.id, barberData);
    } else {
      result = await addBarber(barberData);
    }

    setIsSubmitting(false);

    if (result.error) {
      showToast(result.error.message, 'error');
    } else {
      showToast(editingBarber ? 'Barbero actualizado' : 'Barbero agregado', 'success');
      setIsModalOpen(false);
    }
  };

  const handleToggleActive = async (barber: Barber) => {
    const { error } = await toggleActive(barber.id);
    if (error) {
      showToast(getErrorMessage(error), 'error');
    } else {
      showToast(barber.is_active ? 'Barbero desactivado' : 'Barbero activado', 'success');
    }
  };

  const columns = [
    {
      key: 'name',
      header: 'Barbero',
      render: (barber: Barber) => (
        <div className="flex items-center gap-3">
          <Avatar name={barber.name} src={barber.photo_url} size="lg" />
          <div>
            <p className="font-medium text-inverse">{barber.name}</p>
            {barber.specialty && (
              <p className="text-xs text-primary">{barber.specialty}</p>
            )}
          </div>
        </div>
      ),
    },
    {
      key: 'phone',
      header: 'Teléfono',
      render: (barber: Barber) => (
        <div className="flex items-center gap-2 text-inverse/60">
          <Phone className="w-4 h-4" />
          {barber.phone}
        </div>
      ),
    },
    {
      key: 'email',
      header: 'Email',
      render: (barber: Barber) => (
        barber.email ? (
          <div className="flex items-center gap-2 text-inverse/60">
            <Mail className="w-4 h-4" />
            {barber.email}
          </div>
        ) : (
          <span className="text-inverse/60">-</span>
        )
      ),
    },
    {
      key: 'status',
      header: 'Estado',
      render: (barber: Barber) => (
        <Badge variant={barber.is_active ? 'success' : 'default'}>
          {barber.is_active ? 'Activo' : 'Inactivo'}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: '',
      className: 'w-32',
      render: (barber: Barber) => (
        <div className="flex items-center gap-2 justify-end">
          <Link
            href={`/dashboard/barbers/${barber.id}/schedules`}
            className="p-2 text-inverse/60 hover:text-primary hover:bg-surface rounded-lg transition-colors"
            title="Horarios"
          >
            <Clock className="w-4 h-4" />
          </Link>
          <button
            onClick={(e) => { e.stopPropagation(); openEditModal(barber); }}
            className="p-2 text-inverse/60 hover:text-primary hover:bg-surface rounded-lg transition-colors"
          >
            <Edit2 className="w-4 h-4" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); handleToggleActive(barber); }}
            className={cn(
              'p-2 rounded-lg transition-colors',
              barber.is_active 
                ? 'text-inverse/60 hover:text-error hover:bg-surface' 
                : 'text-inverse/60 hover:text-success hover:bg-surface'
            )}
          >
            {barber.is_active ? <Trash2 className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-heading font-bold text-inverse">Barberos</h1>
          <p className="text-inverse/60">{barbers.length} barberos registrados</p>
        </div>
        <Button onClick={openCreateModal}>
          <Plus className="w-4 h-4 mr-2" />
          Nuevo Barbero
        </Button>
      </div>

      <Card className="!p-0">
        <div className="p-4 border-b border-surface-container-low">
          <Input
            placeholder="Buscar por nombre o especialidad..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            icon={<Search className="w-5 h-5" />}
          />
        </div>
        <Table
          columns={columns}
          data={filteredBarbers}
          keyExtractor={(b) => b.id}
          emptyMessage="No hay barberos registrados"
          isLoading={isLoading}
        />
      </Card>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingBarber ? 'Editar Barbero' : 'Nuevo Barbero'}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Nombre completo"
            placeholder="Nombre del barbero"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            error={errors.name}
          />
          
          <Input
            label="Teléfono"
            type="tel"
            placeholder="+52 123 456 7890"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            error={errors.phone}
            icon={<Phone className="w-4 h-4" />}
          />

          <Input
            label="Correo electrónico"
            type="email"
            placeholder="barbero@email.com"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            icon={<Mail className="w-4 h-4" />}
          />

          <Input
            label="Especialidad"
            placeholder="Ej: Cortes clásicos, Degradados..."
            value={form.specialty}
            onChange={(e) => setForm({ ...form, specialty: e.target.value })}
            icon={<Scissors className="w-4 h-4" />}
          />

          <Input
            label="URL de foto (opcional)"
            placeholder="https://..."
            value={form.photo_url}
            onChange={(e) => setForm({ ...form, photo_url: e.target.value })}
          />

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
              {editingBarber ? 'Guardar' : 'Crear'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
