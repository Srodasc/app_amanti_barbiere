'use client';

import { useState, useMemo } from 'react';
import { 
  Plus, 
  Search, 
  Edit2, 
  Trash2, 
  DollarSign, 
  Download
} from 'lucide-react';
import { useExpenses } from '@/hooks';
import { Button, Input, Select, Modal, Card, Badge, Table } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import { formatCurrency, formatDate, cn, getErrorMessage } from '@/lib/utils';
import { Expense, ExpenseCategory, EXPENSE_CATEGORIES } from '@/types';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
} from 'recharts';

const CATEGORY_COLORS: Record<ExpenseCategory, string> = {
  supplies: '#0288d1',
  services: '#7b1fa2',
  payroll: '#ed6c02',
  marketing: '#d81b60',
  maintenance: '#2e7d32',
  other: '#757575',
};

const emptyForm = {
  concept: '',
  amount: '',
  category: '' as ExpenseCategory | '',
  expense_date: new Date().toISOString().split('T')[0],
  receipt_url: '',
  notes: '',
};

export default function ExpensesPage() {
  const { 
    expenses, 
    addExpense, 
    updateExpense, 
    deleteExpense, 
    getTotalExpenses,
    getTotalExpensesByCategory,
    isLoading 
  } = useExpenses();
  const { showToast } = useToast();
  
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<ExpenseCategory | ''>('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [expenseToDelete, setExpenseToDelete] = useState<Expense | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const filteredExpenses = useMemo(() => {
    return expenses.filter((e) => {
      const matchesSearch = 
        e.concept.toLowerCase().includes(searchQuery.toLowerCase()) ||
        e.notes?.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory = !categoryFilter || e.category === categoryFilter;
      return matchesSearch && matchesCategory;
    });
  }, [expenses, searchQuery, categoryFilter]);

  const totalByCategory = getTotalExpensesByCategory();
  const categoryPieData = Object.entries(totalByCategory).map(([cat, amount]) => ({
    name: EXPENSE_CATEGORIES[cat as ExpenseCategory],
    value: amount,
    color: CATEGORY_COLORS[cat as ExpenseCategory],
  }));

  const chartData = useMemo(() => {
    const months: Record<string, number> = {};
    expenses.forEach((e) => {
      const month = e.expense_date.slice(0, 7);
      months[month] = (months[month] || 0) + e.amount;
    });
    return Object.entries(months)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-6)
      .map(([month, amount]) => ({
        name: new Date(month + '-01').toLocaleDateString('es-MX', { month: 'short' }),
        monto: amount,
      }));
  }, [expenses]);

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (!form.concept) newErrors.concept = 'El concepto es requerido';
    if (!form.amount || parseFloat(form.amount) <= 0) {
      newErrors.amount = 'El monto debe ser mayor a 0';
    }
    if (!form.category) newErrors.category = 'Selecciona una categoría';
    if (!form.expense_date) newErrors.expense_date = 'La fecha es requerida';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const openCreateModal = () => {
    setForm(emptyForm);
    setEditingExpense(null);
    setErrors({});
    setIsModalOpen(true);
  };

  const openEditModal = (expense: Expense) => {
    setForm({
      concept: expense.concept,
      amount: expense.amount.toString(),
      category: expense.category,
      expense_date: expense.expense_date,
      receipt_url: expense.receipt_url || '',
      notes: expense.notes || '',
    });
    setEditingExpense(expense);
    setErrors({});
    setIsModalOpen(true);
  };

  const openDeleteModal = (expense: Expense) => {
    setExpenseToDelete(expense);
    setIsDeleteModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setIsSubmitting(true);
    const expenseData = {
      concept: form.concept,
      amount: parseFloat(form.amount),
      category: form.category as ExpenseCategory,
      expense_date: form.expense_date,
      receipt_url: form.receipt_url || null,
      notes: form.notes || null,
    };

    let result;
    if (editingExpense) {
      result = await updateExpense(editingExpense.id, expenseData);
    } else {
      result = await addExpense(expenseData);
    }

    setIsSubmitting(false);

    if (result.error) {
      showToast(getErrorMessage(result.error), 'error');
    } else {
      showToast(editingExpense ? 'Gasto actualizado' : 'Gasto registrado', 'success');
      setIsModalOpen(false);
    }
  };

  const handleDelete = async () => {
    if (!expenseToDelete) return;
    
    setIsSubmitting(true);
    const { error } = await deleteExpense(expenseToDelete.id);
    setIsSubmitting(false);

    if (error) {
      showToast(error.message, 'error');
    } else {
      showToast('Gasto eliminado', 'success');
      setIsDeleteModalOpen(false);
    }
  };

  const exportToCSV = () => {
    const headers = ['Fecha', 'Concepto', 'Categoría', 'Monto', 'Notas'];
    const rows = filteredExpenses.map((e) => [
      e.expense_date,
      e.concept,
      EXPENSE_CATEGORIES[e.category],
      e.amount.toString(),
      e.notes || '',
    ]);
    
    const csv = [headers, ...rows].map((row) => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gastos_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const columns = [
    {
      key: 'expense_date',
      header: 'Fecha',
      render: (expense: Expense) => (
        <span className="text-inverse/60">{formatDate(expense.expense_date)}</span>
      ),
    },
    {
      key: 'concept',
      header: 'Concepto',
      render: (expense: Expense) => (
        <span className="font-medium text-inverse">{expense.concept}</span>
      ),
    },
    {
      key: 'category',
      header: 'Categoría',
      render: (expense: Expense) => (
        <Badge 
          style={{ backgroundColor: `${CATEGORY_COLORS[expense.category]}20`, color: CATEGORY_COLORS[expense.category] }}
        >
          {EXPENSE_CATEGORIES[expense.category]}
        </Badge>
      ),
    },
    {
      key: 'amount',
      header: 'Monto',
      render: (expense: Expense) => (
        <span className="font-mono font-semibold text-inverse">
          {formatCurrency(expense.amount)}
        </span>
      ),
    },
    {
      key: 'notes',
      header: 'Notas',
      render: (expense: Expense) => (
        <span className="text-inverse/50 truncate max-w-xs block">
          {expense.notes || '-'}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      className: 'w-24',
      render: (expense: Expense) => (
        <div className="flex items-center gap-2 justify-end">
          <button
            onClick={(e) => { e.stopPropagation(); openEditModal(expense); }}
            className="p-2 text-inverse/40 hover:text-primary hover:bg-surface-container-low rounded transition-colors"
          >
            <Edit2 className="w-4 h-4" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); openDeleteModal(expense); }}
            className="p-2 text-inverse/40 hover:text-error hover:bg-surface-container-low rounded transition-colors"
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
          <h1 className="text-2xl font-heading font-bold text-inverse">Gastos</h1>
          <p className="text-inverse/60">Controla tus gastos y categorías</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={exportToCSV}>
            <Download className="w-4 h-4 mr-2" />
            Exportar
          </Button>
          <Button onClick={openCreateModal}>
            <Plus className="w-4 h-4 mr-2" />
            Nuevo Gasto
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="!p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-inverse/60">Total de Gastos</p>
              <p className="text-2xl font-bold text-inverse mt-1">{formatCurrency(getTotalExpenses())}</p>
            </div>
            <div className="w-12 h-12 bg-error/10 rounded-lg flex items-center justify-center">
              <DollarSign className="w-6 h-6 text-error" />
            </div>
          </div>
        </Card>
        <Card className="lg:col-span-2">
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#ebe4df" />
                <XAxis dataKey="name" stroke="#313030" strokeOpacity={0.5} fontSize={12} />
                <YAxis stroke="#313030" strokeOpacity={0.5} fontSize={12} tickFormatter={(v) => `$${v}`} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#fcf9f8', border: 'none', borderRadius: '8px', boxShadow: '0 4px 12px rgba(49, 48, 48, 0.1)' }}
                  labelStyle={{ color: '#313030' }}
                  formatter={(value) => [formatCurrency(value as number), 'Monto']}
                />
                <Area 
                  type="monotone" 
                  dataKey="monto" 
                  stroke="#ba1a1a" 
                  fill="#ba1a1a20" 
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <Card className="!p-0">
        <div className="p-4 border-b border-surface-container-low flex flex-col sm:flex-row gap-4">
          <Input
            placeholder="Buscar gastos..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            icon={<Search className="w-5 h-5" />}
            className="flex-1"
          />
          <Select
            placeholder="Todas las categorías"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value as ExpenseCategory | '')}
            options={[
              { value: '', label: 'Todas las categorías' },
              ...Object.entries(EXPENSE_CATEGORIES).map(([value, label]) => ({ value, label })),
            ]}
            className="sm:w-64"
          />
        </div>
        <Table
          columns={columns}
          data={filteredExpenses}
          keyExtractor={(e) => e.id}
          emptyMessage="No hay gastos registrados"
          isLoading={isLoading}
        />
      </Card>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingExpense ? 'Editar Gasto' : 'Nuevo Gasto'}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Concepto"
            placeholder="Descripción del gasto"
            value={form.concept}
            onChange={(e) => setForm({ ...form, concept: e.target.value })}
            error={errors.concept}
          />
          
          <Input
            label="Monto"
            type="number"
            step="0.01"
            placeholder="0.00"
            value={form.amount}
            onChange={(e) => setForm({ ...form, amount: e.target.value })}
            error={errors.amount}
            icon={<DollarSign className="w-4 h-4" />}
          />

          <Select
            label="Categoría"
            placeholder="Selecciona una categoría"
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value as ExpenseCategory })}
            error={errors.category}
            options={Object.entries(EXPENSE_CATEGORIES).map(([value, label]) => ({ value, label }))}
          />

          <Input
            label="Fecha"
            type="date"
            value={form.expense_date}
            onChange={(e) => setForm({ ...form, expense_date: e.target.value })}
            error={errors.expense_date}
          />

          <Input
            label="URL del comprobante (opcional)"
            type="url"
            placeholder="https://..."
            value={form.receipt_url}
            onChange={(e) => setForm({ ...form, receipt_url: e.target.value })}
          />

          <div>
            <label className="block text-sm font-medium text-inverse/70 mb-2">
              Notas
            </label>
            <textarea
              className="input-field resize-none"
              rows={2}
              placeholder="Notas adicionales..."
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
              {editingExpense ? 'Guardar' : 'Registrar'}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        title="Eliminar Gasto"
        size="sm"
      >
        <p className="text-inverse/60 mb-6">
          ¿Estás seguro de eliminar este gasto? Esta acción no se puede deshacer.
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
