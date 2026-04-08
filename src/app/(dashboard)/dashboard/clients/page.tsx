'use client';

import { useState } from 'react';
import { Plus, Search, Edit2, Trash2, Phone, Mail, FileText, Key } from 'lucide-react';
import { useClients } from '@/hooks';
import { Button, Input, Modal, Card, Avatar, Badge, Table } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import { cn, getErrorMessage } from '@/lib/utils';
import { Client } from '@/types';
import { formatDate } from '@/lib/utils';

const emptyForm = {
  name: '',
  email: '',
  phone: '',
  photo_url: '',
  notes: '',
};

export default function ClientsPage() {
  const { clients, addClient, updateClient, deleteClient, searchClients, isLoading } = useClients();
  const { showToast } = useToast();
  
  const [searchQuery, setSearchQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [clientToChangePassword, setClientToChangePassword] = useState<Client | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [clientToDelete, setClientToDelete] = useState<Client | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const filteredClients = searchClients(searchQuery);

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (!form.name || form.name.length < 2) {
      newErrors.name = 'El nombre es requerido (mínimo 2 caracteres)';
    }
    if (!form.phone) {
      newErrors.phone = 'El teléfono es requerido';
    }
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      newErrors.email = 'Correo inválido';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const openCreateModal = () => {
    setForm(emptyForm);
    setEditingClient(null);
    setErrors({});
    setIsModalOpen(true);
  };

  const openEditModal = (client: Client) => {
    setForm({
      name: client.name,
      email: client.email || '',
      phone: client.phone || '',
      photo_url: '',
      notes: '',
    });
    setEditingClient(client);
    setErrors({});
    setIsModalOpen(true);
  };

  const openDeleteModal = (client: Client) => {
    setClientToDelete(client);
    setIsDeleteModalOpen(true);
  };

  const openPasswordModal = (client: Client) => {
    setClientToChangePassword(client);
    setNewPassword('');
    setPasswordError('');
    setIsPasswordModalOpen(true);
  };

  const handlePasswordChange = async () => {
    if (!clientToChangePassword || !newPassword) return;
    
    if (newPassword.length < 4) {
      setPasswordError('La contraseña debe tener al menos 4 caracteres');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/clients/password', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: clientToChangePassword.id, newPassword }),
      });

      const data = await res.json();

      if (!res.ok) {
        showToast(data.error || 'Error al cambiar contraseña', 'error');
      } else {
        showToast('Contraseña actualizada correctamente', 'success');
        setIsPasswordModalOpen(false);
      }
    } catch (error) {
      showToast('Error de conexión', 'error');
    }
    setIsSubmitting(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setIsSubmitting(true);
    const clientData = {
      name: form.name,
      email: form.email || null,
      phone: form.phone,
      photo_url: form.photo_url || null,
      notes: form.notes || null,
    };

    let result;
    if (editingClient) {
      result = await updateClient(editingClient.id, clientData);
    } else {
      result = await addClient(clientData);
    }

    setIsSubmitting(false);

    if (result.error) {
      showToast(getErrorMessage(result.error), 'error');
    } else {
      showToast(editingClient ? 'Cliente actualizado' : 'Cliente agregado', 'success');
      setIsModalOpen(false);
    }
  };

  const handleDelete = async () => {
    if (!clientToDelete) return;
    
    setIsSubmitting(true);
    const { error } = await deleteClient(clientToDelete.id);
    setIsSubmitting(false);

    if (error) {
      showToast(error.message, 'error');
    } else {
      showToast('Cliente eliminado', 'success');
      setIsDeleteModalOpen(false);
    }
  };

  const columns = [
    {
      key: 'name',
      header: 'Cliente',
      render: (client: Client) => (
        <div className="flex items-center gap-3">
          <Avatar name={client.name} size="md" />
          <div>
            <p className="font-medium text-inverse">{client.name}</p>
            {client.email && (
              <p className="text-xs text-inverse/60">{client.email}</p>
            )}
          </div>
        </div>
      ),
    },
    {
      key: 'phone',
      header: 'Teléfono',
      render: (client: Client) => (
        <div className="flex items-center gap-2 text-inverse/60">
          <Phone className="w-4 h-4" />
          {client.phone}
        </div>
      ),
    },
    {
      key: 'created_at',
      header: 'Registrado',
      render: (client: Client) => (
        <span className="text-inverse/60">{formatDate(client.created_at)}</span>
      ),
    },
    {
      key: 'actions',
      header: '',
      className: 'w-32',
      render: (client: Client) => (
        <div className="flex items-center gap-1 justify-end">
          <button
            onClick={(e) => { e.stopPropagation(); openPasswordModal(client); }}
            className="p-2 text-inverse/60 hover:text-accent hover:bg-surface rounded-lg transition-colors"
            title="Cambiar contraseña"
          >
            <Key className="w-4 h-4" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); openEditModal(client); }}
            className="p-2 text-inverse/60 hover:text-primary hover:bg-surface rounded-lg transition-colors"
          >
            <Edit2 className="w-4 h-4" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); openDeleteModal(client); }}
            className="p-2 text-inverse/60 hover:text-error hover:bg-surface rounded-lg transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-heading font-bold text-inverse">Clientes</h1>
          <p className="text-inverse/60">{clients.length} clientes registrados</p>
        </div>
        <Button onClick={openCreateModal}>
          <Plus className="w-4 h-4 mr-2" />
          Nuevo Cliente
        </Button>
      </div>

      <Card className="!p-0 overflow-x-hidden">
        <div className="p-4 border-b border-surface-container-low">
          <Input
            placeholder="Buscar por nombre, teléfono o email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            icon={<Search className="w-5 h-5" />}
          />
        </div>
        <Table
          columns={columns}
          data={filteredClients}
          keyExtractor={(c) => c.id}
          emptyMessage="No hay clientes registrados"
          isLoading={isLoading}
        />
      </Card>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingClient ? 'Editar Cliente' : 'Nuevo Cliente'}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Nombre completo"
            placeholder="Nombre del cliente"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            error={errors.name}
          />
          <Input
            label="Correo electrónico"
            type="email"
            placeholder="cliente@email.com"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            error={errors.email}
            icon={<Mail className="w-4 h-4" />}
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
            label="URL de foto (opcional)"
            placeholder="https://..."
            value={form.photo_url}
            onChange={(e) => setForm({ ...form, photo_url: e.target.value })}
          />
          <div>
            <label className="block text-sm font-medium text-inverse/60 mb-2">
              Notas
            </label>
            <textarea
              className="input-field resize-none"
              rows={3}
              placeholder="Notas sobre el cliente..."
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
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
              {editingClient ? 'Guardar' : 'Crear'}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        title="Eliminar Cliente"
        size="sm"
      >
        <p className="text-inverse/60 mb-6">
          ¿Estás seguro de eliminar a <span className="text-inverse font-semibold">{clientToDelete?.name}</span>? 
          Esta acción no se puede deshacer.
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

      <Modal
        isOpen={isPasswordModalOpen}
        onClose={() => setIsPasswordModalOpen(false)}
        title="Cambiar Contraseña"
        size="sm"
      >
        <p className="text-inverse/60 mb-4">
          Nueva contraseña para <span className="text-inverse font-semibold">{clientToChangePassword?.name}</span>
        </p>
        <div className="space-y-4">
          <Input
            type="password"
            placeholder="Nueva contraseña (mínimo 4 caracteres)"
            value={newPassword}
            onChange={(e) => {
              setNewPassword(e.target.value);
              setPasswordError('');
            }}
            error={passwordError}
          />
          <div className="flex gap-3">
            <Button
              variant="ghost"
              onClick={() => setIsPasswordModalOpen(false)}
              className="flex-1"
            >
              Cancelar
            </Button>
            <Button
              onClick={handlePasswordChange}
              isLoading={isSubmitting}
              className="flex-1"
            >
              Guardar
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
