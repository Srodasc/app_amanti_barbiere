'use client';

import { useState, useEffect } from 'react';
import { Save, Plus, Trash2, Clock, DollarSign } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks';
import { Button, Input, Modal, Card } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import { Service } from '@/types';
import { cn, getErrorMessage } from '@/lib/utils';

const defaultService = {
  name: '',
  duration_minutes: 30,
  price: 0,
  description: '',
  is_active: true,
};

export default function SettingsPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [services, setServices] = useState<Service[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [serviceToDelete, setServiceToDelete] = useState<Service | null>(null);
  const [form, setForm] = useState(defaultService);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    loadServices();
  }, []);

  const loadServices = async () => {
    const supabase = createClient();
    const { data } = await supabase.from('services').select('*').order('name');
    if (data) setServices(data);
    setIsLoading(false);
  };

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (!form.name) newErrors.name = 'El nombre es requerido';
    if (form.duration_minutes < 5) newErrors.duration_minutes = 'Mínimo 5 minutos';
    if (form.price < 0) newErrors.price = 'El precio no puede ser negativo';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const openCreateModal = () => {
    setForm(defaultService);
    setEditingService(null);
    setErrors({});
    setIsModalOpen(true);
  };

  const openEditModal = (service: Service) => {
    setForm({
      name: service.name,
      duration_minutes: service.duration_minutes,
      price: service.price,
      description: service.description || '',
      is_active: service.is_active,
    });
    setEditingService(service);
    setErrors({});
    setIsModalOpen(true);
  };

  const openDeleteModal = (service: Service) => {
    setServiceToDelete(service);
    setIsDeleteModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setIsSubmitting(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    let result;
    if (editingService) {
      result = await supabase
        .from('services')
        .update(form)
        .eq('id', editingService.id)
        .select()
        .single();
    } else {
      result = await supabase
        .from('services')
        .insert({ ...form, user_id: user?.id })
        .select()
        .single();
    }

    setIsSubmitting(false);

    if (result.error) {
      showToast(getErrorMessage(result.error), 'error');
    } else {
      showToast(editingService ? 'Servicio actualizado' : 'Servicio creado', 'success');
      setIsModalOpen(false);
      loadServices();
    }
  };

  const handleDelete = async () => {
    if (!serviceToDelete) return;
    
    setIsSubmitting(true);
    const supabase = createClient();
    const { error } = await supabase.from('services').delete().eq('id', serviceToDelete.id);
    setIsSubmitting(false);

    if (error) {
      showToast(error.message, 'error');
    } else {
      showToast('Servicio eliminado', 'success');
      setIsDeleteModalOpen(false);
      loadServices();
    }
  };

  const toggleActive = async (service: Service) => {
    const supabase = createClient();
    const { error } = await supabase
      .from('services')
      .update({ is_active: !service.is_active })
      .eq('id', service.id);

    if (error) {
      showToast(error.message, 'error');
    } else {
      loadServices();
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 bg-surface-container-low rounded animate-pulse" />
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <Card key={i} className="h-24">
              <div className="animate-pulse space-y-2">
                <div className="h-4 w-32 bg-surface rounded" />
                <div className="h-3 w-48 bg-surface rounded" />
              </div>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in max-w-2xl">
      <div>
        <h1 className="text-2xl font-heading font-bold text-inverse">Configuración</h1>
        <p className="text-inverse/60">Gestiona los servicios de tu barbería</p>
      </div>

      <Card>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-semibold text-inverse">Servicios</h2>
            <p className="text-sm text-inverse/60">Configura los servicios que ofreces</p>
          </div>
          <Button onClick={openCreateModal}>
            <Plus className="w-4 h-4 mr-2" />
            Nuevo Servicio
          </Button>
        </div>

        {services.length === 0 ? (
          <div className="text-center py-8">
            <DollarSign className="w-12 h-12 mx-auto text-inverse/60 mb-4" />
            <p className="text-inverse/60 mb-4">No hay servicios configurados</p>
            <Button onClick={openCreateModal}>Crear primer servicio</Button>
          </div>
        ) : (
          <div className="space-y-3">
            {services.map((service) => (
              <div
                key={service.id}
                className={cn(
                  'p-4 rounded-lg border transition-all',
                  service.is_active 
                    ? 'bg-surface border-surface-container-low' 
                    : 'bg-surface/50 border-surface'
                )}
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className={cn(
                        'font-medium',
                        service.is_active ? 'text-inverse' : 'text-inverse/60'
                      )}>
                        {service.name}
                      </h3>
                      {!service.is_active && (
                        <span className="text-xs text-inverse/60">(Inactivo)</span>
                      )}
                    </div>
                    <div className="flex items-center gap-4 mt-1 text-sm text-inverse/60">
                      <span className="flex items-center gap-1">
                        <Clock className="w-4 h-4" />
                        {service.duration_minutes} min
                      </span>
                      <span className="flex items-center gap-1 font-mono">
                        ${service.price}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => toggleActive(service)}
                      className={cn(
                        'px-3 py-1 rounded text-xs font-medium transition-colors',
                        service.is_active 
                          ? 'bg-error/20 text-error hover:bg-error/30' 
                          : 'bg-success/20 text-success hover:bg-success/30'
                      )}
                    >
                      {service.is_active ? 'Desactivar' : 'Activar'}
                    </button>
                    <button
                      onClick={() => openEditModal(service)}
                      className="p-2 text-inverse/60 hover:text-primary hover:bg-surface rounded-lg transition-colors"
                    >
                      <Save className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => openDeleteModal(service)}
                      className="p-2 text-inverse/60 hover:text-error hover:bg-surface rounded-lg transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingService ? 'Editar Servicio' : 'Nuevo Servicio'}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Nombre del servicio"
            placeholder="Ej: Corte de cabello"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            error={errors.name}
          />

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Duración (minutos)"
              type="number"
              min="5"
              value={form.duration_minutes}
              onChange={(e) => setForm({ ...form, duration_minutes: parseInt(e.target.value) })}
              error={errors.duration_minutes}
              icon={<Clock className="w-4 h-4" />}
            />
            <Input
              label="Precio ($)"
              type="number"
              min="0"
              step="0.01"
              value={form.price}
              onChange={(e) => setForm({ ...form, price: parseFloat(e.target.value) })}
              error={errors.price}
              icon={<DollarSign className="w-4 h-4" />}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-inverse/60 mb-2">
              Descripción (opcional)
            </label>
            <textarea
              className="input-field resize-none"
              rows={2}
              placeholder="Descripción del servicio..."
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
              {editingService ? 'Guardar' : 'Crear'}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        title="Eliminar Servicio"
        size="sm"
      >
        <p className="text-inverse/60 mb-6">
          ¿Estás seguro de eliminar el servicio <span className="text-inverse font-semibold">{serviceToDelete?.name}</span>? 
          Las citas existentes no se verán afectadas.
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
