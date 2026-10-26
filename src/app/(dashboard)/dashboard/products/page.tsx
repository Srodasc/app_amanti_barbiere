'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { format, startOfMonth } from 'date-fns';
import { es } from 'date-fns/locale';
import { Plus, Search, Edit2, PackagePlus, SlidersHorizontal, ShoppingCart, AlertTriangle, Ban, History } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Button, Input, Select, Modal, Card, Badge } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import { cn, formatCurrency } from '@/lib/utils';
import SaleForm from '@/components/products/SaleForm';
import {
  MOVEMENT_KINDS,
  PAYMENT_METHODS,
  isLowStock,
  productErrorMessage,
  type PaymentMethod,
  type Product,
} from '@/lib/products';

type Sale = {
  id: string;
  total: number;
  payment_method: PaymentMethod;
  status: 'completed' | 'voided';
  notes: string | null;
  void_reason: string | null;
  created_at: string;
  barber: { name: string } | { name: string }[] | null;
  items: { quantity: number; unit_price: number; unit_cost: number; product: { name: string } | { name: string }[] | null }[];
};
type Movement = {
  id: string;
  kind: string;
  quantity: number;
  stock_after: number;
  unit_cost: number | null;
  note: string | null;
  created_at: string;
  product: { name: string } | { name: string }[] | null;
};

const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v);
const n = (v: unknown) => Number(v) || 0;
const when = (ts: string) => format(new Date(ts), "d MMM yyyy, h:mm a", { locale: es });

const emptyProduct = { name: '', category: '', sku: '', sale_price: '', cost_price: '', min_stock: '0', initial_stock: '', is_active: true };

export default function ProductsPage() {
  const supabase = () => createClient();
  const { showToast } = useToast();

  const [tab, setTab] = useState<'inventario' | 'ventas' | 'movimientos'>('inventario');
  const [products, setProducts] = useState<Product[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [onlyLow, setOnlyLow] = useState(false);
  const [showInactive, setShowInactive] = useState(false);
  const [salesFrom, setSalesFrom] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [salesTo, setSalesTo] = useState(format(new Date(), 'yyyy-MM-dd'));

  // modales
  const [editing, setEditing] = useState<Product | 'new' | null>(null);
  const [form, setForm] = useState(emptyProduct);
  const [entryFor, setEntryFor] = useState<Product | null>(null);
  const [entry, setEntry] = useState({ quantity: '', unit_cost: '', note: '', as_expense: true });
  const [adjustFor, setAdjustFor] = useState<Product | null>(null);
  const [adjust, setAdjust] = useState({ stock: '', note: '' });
  const [saleOpen, setSaleOpen] = useState(false);
  const [voidSale, setVoidSale] = useState<Sale | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const [historyFor, setHistoryFor] = useState<Product | null>(null);
  const [productHistory, setProductHistory] = useState<Movement[]>([]);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const loadProducts = useCallback(async () => {
    const { data, error } = await supabase()
      .from('products')
      .select('id, name, category, sku, sale_price, cost_price, stock, min_stock, is_active')
      .order('name');
    if (error) showToast(productErrorMessage(error), 'error');
    setProducts(((data ?? []) as Product[]).map((p) => ({ ...p, sale_price: n(p.sale_price), cost_price: n(p.cost_price) })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadSales = useCallback(async () => {
    const to = new Date(`${salesTo}T00:00:00`);
    to.setDate(to.getDate() + 1);
    const { data, error } = await supabase()
      .from('product_sales')
      .select(
        'id, total, payment_method, status, notes, void_reason, created_at, barber:barbers(name), items:product_sale_items(quantity, unit_price, unit_cost, product:products(name))'
      )
      .gte('created_at', new Date(`${salesFrom}T00:00:00`).toISOString())
      .lt('created_at', to.toISOString())
      .order('created_at', { ascending: false })
      .limit(500);
    if (error) showToast(productErrorMessage(error), 'error');
    setSales((data ?? []) as unknown as Sale[]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [salesFrom, salesTo]);

  const loadMovements = useCallback(async () => {
    const { data, error } = await supabase()
      .from('stock_movements')
      .select('id, kind, quantity, stock_after, unit_cost, note, created_at, product:products(name)')
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) showToast(productErrorMessage(error), 'error');
    setMovements((data ?? []) as unknown as Movement[]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await loadProducts();
      setLoading(false);
    })();
  }, [loadProducts]);
  useEffect(() => {
    if (tab === 'ventas') loadSales();
    if (tab === 'movimientos') loadMovements();
  }, [tab, loadSales, loadMovements]);

  const refreshAll = async () => {
    await loadProducts();
    if (tab === 'ventas') await loadSales();
    if (tab === 'movimientos') await loadMovements();
  };

  // ---------- resumen ----------
  const active = products.filter((p) => p.is_active);
  const lowCount = active.filter(isLowStock).length;
  const stockValue = active.reduce((s, p) => s + p.stock * p.cost_price, 0);
  const completedSales = sales.filter((s) => s.status === 'completed');
  const salesTotal = completedSales.reduce((s, x) => s + n(x.total), 0);
  const salesMargin = completedSales.reduce(
    (s, x) => s + x.items.reduce((a, i) => a + i.quantity * (n(i.unit_price) - n(i.unit_cost)), 0),
    0
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter(
      (p) =>
        (showInactive || p.is_active) &&
        (!onlyLow || (p.is_active && isLowStock(p))) &&
        (!q || p.name.toLowerCase().includes(q) || p.category?.toLowerCase().includes(q) || p.sku?.toLowerCase().includes(q))
    );
  }, [products, query, onlyLow, showInactive]);

  const categories = useMemo(
    () => Array.from(new Set(products.map((p) => p.category).filter(Boolean))) as string[],
    [products]
  );

  // ---------- crear / editar ----------
  const openNew = () => {
    setForm(emptyProduct);
    setFormError('');
    setEditing('new');
  };
  const openEdit = (p: Product) => {
    setForm({
      name: p.name,
      category: p.category ?? '',
      sku: p.sku ?? '',
      sale_price: String(p.sale_price),
      cost_price: String(p.cost_price),
      min_stock: String(p.min_stock),
      initial_stock: '',
      is_active: p.is_active,
    });
    setFormError('');
    setEditing(p);
  };

  const saveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    const sale = Number(form.sale_price);
    const cost = form.cost_price === '' ? 0 : Number(form.cost_price);
    const min = form.min_stock === '' ? 0 : Number(form.min_stock);
    const initial = form.initial_stock === '' ? 0 : Number(form.initial_stock);
    if (form.name.trim().length < 2) return setFormError('Escribe el nombre del producto.');
    if (!(sale >= 0) || form.sale_price === '') return setFormError('El precio de venta no es válido.');
    if (!(cost >= 0)) return setFormError('El costo no es válido.');
    if (!Number.isInteger(min) || min < 0) return setFormError('El stock mínimo debe ser un número entero.');
    if (!Number.isInteger(initial) || initial < 0) return setFormError('El stock inicial debe ser un número entero.');
    // El stock inicial es mercancía en la que ya se invirtió: siempre queda como gasto, así que necesita costo
    if (editing === 'new' && initial > 0 && !(cost > 0)) return setFormError('Escribe el costo por unidad para registrar el gasto del stock inicial.');

    const payload = {
      name: form.name.trim(),
      category: form.category.trim() || null,
      sku: form.sku.trim() || null,
      sale_price: sale,
      cost_price: cost,
      min_stock: min,
      is_active: form.is_active,
    };

    setSaving(true);
    if (editing === 'new') {
      const { data, error } = await supabase().from('products').insert(payload).select('id').single();
      if (error || !data) {
        setSaving(false);
        return setFormError(productErrorMessage(error));
      }
      if (initial > 0) {
        // Inventario inicial: siempre se registra como gasto (ya se invirtió en esa mercancía)
        const { error: e2 } = await supabase().rpc('register_stock_entry', {
          p_product: data.id,
          p_quantity: initial,
          p_unit_cost: cost || null,
          p_note: 'Inventario inicial',
          p_as_expense: true,
        });
        if (e2) showToast(`Producto creado, pero no se cargó el stock inicial: ${productErrorMessage(e2)}`, 'error');
      }
    } else if (editing) {
      const { error } = await supabase().from('products').update(payload).eq('id', editing.id);
      if (error) {
        setSaving(false);
        return setFormError(productErrorMessage(error));
      }
    }
    setSaving(false);
    showToast(
      editing === 'new' && initial > 0
        ? `Producto creado y gasto de ${formatCurrency(initial * cost)} registrado`
        : editing === 'new'
          ? 'Producto creado'
          : 'Producto actualizado',
      'success'
    );
    setEditing(null);
    refreshAll();
  };

  // ---------- entrada ----------
  const openEntry = (p: Product) => {
    setEntry({ quantity: '', unit_cost: p.cost_price ? String(p.cost_price) : '', note: '', as_expense: true });
    setFormError('');
    setEntryFor(p);
  };
  const saveEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!entryFor) return;
    const qty = Number(entry.quantity);
    const cost = entry.unit_cost === '' ? null : Number(entry.unit_cost);
    if (!Number.isInteger(qty) || qty <= 0) return setFormError('La cantidad debe ser un número entero mayor que 0.');
    if (cost !== null && !(cost >= 0)) return setFormError('El costo no es válido.');
    setSaving(true);
    const { error } = await supabase().rpc('register_stock_entry', {
      p_product: entryFor.id,
      p_quantity: qty,
      p_unit_cost: cost,
      p_note: entry.note.trim() || null,
      p_as_expense: entry.as_expense,
    });
    setSaving(false);
    if (error) return setFormError(productErrorMessage(error));
    showToast(
      entry.as_expense && cost ? `Entrada registrada y gasto de ${formatCurrency(qty * cost)} creado` : 'Entrada registrada',
      'success'
    );
    setEntryFor(null);
    refreshAll();
  };

  // ---------- ajuste ----------
  const openAdjust = (p: Product) => {
    setAdjust({ stock: String(p.stock), note: '' });
    setFormError('');
    setAdjustFor(p);
  };
  const saveAdjust = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustFor) return;
    const val = Number(adjust.stock);
    if (!Number.isInteger(val) || val < 0) return setFormError('Escribe la cantidad real (número entero, 0 o más).');
    if (!adjust.note.trim()) return setFormError('Escribe el motivo (conteo, daño, pérdida…).');
    setSaving(true);
    const { error } = await supabase().rpc('adjust_stock', { p_product: adjustFor.id, p_new_stock: val, p_note: adjust.note.trim() });
    setSaving(false);
    if (error) return setFormError(productErrorMessage(error));
    showToast('Stock ajustado', 'success');
    setAdjustFor(null);
    refreshAll();
  };

  // ---------- anular ----------
  const saveVoid = async () => {
    if (!voidSale) return;
    setSaving(true);
    const { error } = await supabase().rpc('void_product_sale', { p_sale: voidSale.id, p_reason: voidReason.trim() || null });
    setSaving(false);
    if (error) return showToast(productErrorMessage(error), 'error');
    showToast('Venta anulada y stock devuelto', 'success');
    setVoidSale(null);
    setVoidReason('');
    refreshAll();
  };

  const openHistory = async (p: Product) => {
    setProductHistory([]);
    setHistoryFor(p);
    const { data, error } = await supabase()
      .from('stock_movements')
      .select('id, kind, quantity, stock_after, unit_cost, note, created_at, product:products(name)')
      .eq('product_id', p.id)
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) showToast(productErrorMessage(error), 'error');
    setProductHistory((data ?? []) as unknown as Movement[]);
  };

  const tabs = [
    { id: 'inventario', label: 'Inventario' },
    { id: 'ventas', label: 'Ventas' },
    { id: 'movimientos', label: 'Movimientos' },
  ] as const;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-heading font-bold text-inverse">Productos</h1>
          <p className="text-inverse/60">Inventario y ventas de la tienda</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setSaleOpen(true)}>
            <ShoppingCart className="w-4 h-4 mr-2" /> Nueva venta
          </Button>
          <Button onClick={openNew}>
            <Plus className="w-4 h-4 mr-2" /> Nuevo producto
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="!p-4" hover={false}>
          <p className="text-sm text-inverse/60">Productos activos</p>
          <p className="text-2xl font-bold mt-1">{active.length}</p>
        </Card>
        <Card className="!p-4 cursor-pointer" hover={false} onClick={() => { setTab('inventario'); setOnlyLow(true); }}>
          <p className="text-sm text-inverse/60">Stock bajo</p>
          <p className={cn('text-2xl font-bold mt-1', lowCount > 0 && 'text-warning')}>{lowCount}</p>
        </Card>
        <Card className="!p-4" hover={false}>
          <p className="text-sm text-inverse/60">Valor del inventario (costo)</p>
          <p className="text-2xl font-bold mt-1">{formatCurrency(stockValue)}</p>
        </Card>
        <Card className="!p-4" hover={false}>
          <p className="text-sm text-inverse/60">Ventas del periodo</p>
          <p className="text-2xl font-bold mt-1">{tab === 'ventas' ? formatCurrency(salesTotal) : '—'}</p>
          {tab === 'ventas' && <p className="text-xs text-success mt-1">Margen {formatCurrency(salesMargin)}</p>}
        </Card>
      </div>

      <div className="flex gap-2 border-b border-surface-container-low">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              'px-4 py-2 text-sm font-semibold border-b-2 -mb-px',
              tab === t.id ? 'border-primary text-primary' : 'border-transparent text-inverse/60 hover:text-inverse'
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'inventario' && (
        <Card className="!p-0" hover={false}>
          <div className="p-4 border-b border-surface-container-low flex flex-col sm:flex-row gap-3 sm:items-center">
            <div className="flex-1">
              <Input placeholder="Buscar por nombre, categoría o código" value={query} onChange={(e) => setQuery(e.target.value)} icon={<Search className="w-5 h-5" />} />
            </div>
            <label className="flex items-center gap-2 text-sm text-inverse/70">
              <input type="checkbox" checked={onlyLow} onChange={(e) => setOnlyLow(e.target.checked)} /> Solo stock bajo
            </label>
            <label className="flex items-center gap-2 text-sm text-inverse/70">
              <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} /> Ver inactivos
            </label>
          </div>
          {loading ? (
            <p className="p-6 text-inverse/60">Cargando...</p>
          ) : visible.length === 0 ? (
            <p className="p-6 text-inverse/60">
              {products.length === 0 ? 'Aún no hay productos. Crea el primero con "Nuevo producto".' : 'No hay productos con ese filtro.'}
            </p>
          ) : (
            <ul className="divide-y divide-surface-container-low">
              {visible.map((p) => (
                <li key={p.id} className={cn('p-4 flex flex-col sm:flex-row sm:items-center gap-3', !p.is_active && 'opacity-60')}>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold truncate">
                      {p.name} {!p.is_active && <Badge>Inactivo</Badge>}
                    </p>
                    <p className="text-sm text-inverse/60">
                      {p.category || 'Sin categoría'}
                      {p.sku && ` · ${p.sku}`} · Venta {formatCurrency(p.sale_price)} · Costo {formatCurrency(p.cost_price)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right w-24">
                      <p className={cn('text-xl font-bold', p.is_active && isLowStock(p) && 'text-warning')}>{p.stock}</p>
                      <p className="text-xs text-inverse/50">mín. {p.min_stock}</p>
                    </div>
                    {p.is_active && isLowStock(p) && <AlertTriangle className="w-5 h-5 text-warning" aria-label="Stock bajo" />}
                    <div className="flex gap-1">
                      <button title="Entrada de mercancía" onClick={() => openEntry(p)} className="p-2 rounded-lg text-inverse/60 hover:text-primary hover:bg-surface">
                        <PackagePlus className="w-4 h-4" />
                      </button>
                      <button title="Ajustar stock" onClick={() => openAdjust(p)} className="p-2 rounded-lg text-inverse/60 hover:text-primary hover:bg-surface">
                        <SlidersHorizontal className="w-4 h-4" />
                      </button>
                      <button title="Historial" onClick={() => openHistory(p)} className="p-2 rounded-lg text-inverse/60 hover:text-primary hover:bg-surface">
                        <History className="w-4 h-4" />
                      </button>
                      <button title="Editar" onClick={() => openEdit(p)} className="p-2 rounded-lg text-inverse/60 hover:text-primary hover:bg-surface">
                        <Edit2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {tab === 'ventas' && (
        <Card className="!p-0" hover={false}>
          <div className="p-4 border-b border-surface-container-low grid grid-cols-2 gap-3 sm:max-w-md">
            <Input label="Desde" type="date" value={salesFrom} max={salesTo} onChange={(e) => setSalesFrom(e.target.value)} />
            <Input label="Hasta" type="date" value={salesTo} min={salesFrom} onChange={(e) => setSalesTo(e.target.value)} />
          </div>
          {sales.length === 0 ? (
            <p className="p-6 text-inverse/60">No hay ventas en este periodo.</p>
          ) : (
            <ul className="divide-y divide-surface-container-low">
              {sales.map((s) => (
                <li key={s.id} className={cn('p-4 flex flex-col sm:flex-row sm:items-center gap-2', s.status === 'voided' && 'opacity-60')}>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold">
                      {formatCurrency(n(s.total))}{' '}
                      <span className="text-sm font-normal text-inverse/60">· {PAYMENT_METHODS[s.payment_method]}</span>{' '}
                      {s.status === 'voided' && <Badge variant="error">Anulada</Badge>}
                    </p>
                    <p className="text-sm text-inverse/70 truncate">
                      {s.items.map((i) => `${i.quantity}× ${one(i.product)?.name ?? 'Producto'}`).join(', ')}
                    </p>
                    <p className="text-xs text-inverse/50">
                      {when(s.created_at)} · Vendió: {one(s.barber)?.name ?? 'Administración'}
                      {s.notes && ` · ${s.notes}`}
                      {s.void_reason && ` · Motivo de anulación: ${s.void_reason}`}
                    </p>
                  </div>
                  {s.status === 'completed' && (
                    <Button size="sm" variant="ghost" onClick={() => { setVoidReason(''); setVoidSale(s); }}>
                      <Ban className="w-4 h-4 mr-1" /> Anular
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {tab === 'movimientos' && (
        <Card className="!p-0" hover={false}>
          {movements.length === 0 ? (
            <p className="p-6 text-inverse/60">Aún no hay movimientos.</p>
          ) : (
            <ul className="divide-y divide-surface-container-low">
              {movements.map((m) => (
                <li key={m.id} className="p-4 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{one(m.product)?.name ?? 'Producto'}</p>
                    <p className="text-xs text-inverse/50">
                      {MOVEMENT_KINDS[m.kind] ?? m.kind} · {when(m.created_at)}
                      {m.note && ` · ${m.note}`}
                    </p>
                  </div>
                  <span className={cn('font-semibold w-14 text-right', m.quantity > 0 ? 'text-success' : 'text-error')}>
                    {m.quantity > 0 ? `+${m.quantity}` : m.quantity}
                  </span>
                  <span className="text-sm text-inverse/60 w-20 text-right">quedan {m.stock_after}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="p-3 text-xs text-inverse/50 border-t border-surface-container-low">Se muestran los últimos 200 movimientos.</p>
        </Card>
      )}

      {/* ---------- Modales ---------- */}
      <Modal isOpen={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? 'Nuevo producto' : 'Editar producto'}>
        <form onSubmit={saveProduct} className="space-y-4">
          <Input label="Nombre" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ej: Cera mate 100 g" />
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Input label="Categoría (opcional)" list="product-categories" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="Ej: Cabello" />
              <datalist id="product-categories">
                {categories.map((c) => <option key={c} value={c} />)}
              </datalist>
            </div>
            <Input label="Código / SKU (opcional)" value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Precio de venta" type="number" min="0" step="any" inputMode="decimal" value={form.sale_price} onChange={(e) => setForm({ ...form, sale_price: e.target.value })} />
            <Input label="Costo (opcional)" type="number" min="0" step="any" inputMode="decimal" value={form.cost_price} onChange={(e) => setForm({ ...form, cost_price: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Avisar con stock ≤" type="number" min="0" step="1" value={form.min_stock} onChange={(e) => setForm({ ...form, min_stock: e.target.value })} />
            {editing === 'new' ? (
              <Input label="Stock inicial" type="number" min="0" step="1" value={form.initial_stock} onChange={(e) => setForm({ ...form, initial_stock: e.target.value })} placeholder="0" />
            ) : (
              <div className="text-sm text-inverse/60 self-end pb-3">
                Stock actual: <strong>{(editing as Product | null)?.stock ?? 0}</strong>. Se cambia con Entrada o Ajuste.
              </div>
            )}
          </div>
          {editing !== 'new' && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
              Activo (si lo desactivas deja de aparecer para vender, pero conserva su historial)
            </label>
          )}
          {editing === 'new' && Number(form.initial_stock) > 0 && (
            Number(form.cost_price) > 0 ? (
              <p className="text-sm text-inverse/70">
                Se registrará un gasto de{' '}
                <strong>{formatCurrency(Number(form.initial_stock) * Number(form.cost_price))}</strong> por el stock inicial (Gastos → Insumos).
              </p>
            ) : (
              <p className="text-xs text-warning">Escribe el costo por unidad: el stock inicial se registra como gasto.</p>
            )
          )}
          {formError && <p className="text-sm text-error">{formError}</p>}
          <div className="flex gap-3 pt-2">
            <Button type="button" variant="ghost" onClick={() => setEditing(null)} className="flex-1">Cancelar</Button>
            <Button type="submit" isLoading={saving} className="flex-1">Guardar</Button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={!!entryFor} onClose={() => setEntryFor(null)} title={`Entrada: ${entryFor?.name ?? ''}`}>
        <form onSubmit={saveEntry} className="space-y-4">
          <p className="text-sm text-inverse/60">Stock actual: {entryFor?.stock}</p>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Cantidad que llegó" type="number" min="1" step="1" value={entry.quantity} onChange={(e) => setEntry({ ...entry, quantity: e.target.value })} />
            <Input label="Costo por unidad" type="number" min="0" step="any" inputMode="decimal" value={entry.unit_cost} onChange={(e) => setEntry({ ...entry, unit_cost: e.target.value })} />
          </div>
          <Input label="Nota (opcional)" placeholder="Ej: proveedor, factura" value={entry.note} onChange={(e) => setEntry({ ...entry, note: e.target.value })} />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={entry.as_expense} onChange={(e) => setEntry({ ...entry, as_expense: e.target.checked })} />
            Registrar como gasto en Gastos (categoría Insumos)
          </label>
          {entry.as_expense && Number(entry.quantity) > 0 && Number(entry.unit_cost) > 0 && (
            <p className="text-sm">Gasto: <strong>{formatCurrency(Number(entry.quantity) * Number(entry.unit_cost))}</strong></p>
          )}
          {entry.as_expense && !(Number(entry.unit_cost) > 0) && (
            <p className="text-xs text-warning">Sin costo por unidad no se crea el gasto.</p>
          )}
          {formError && <p className="text-sm text-error">{formError}</p>}
          <div className="flex gap-3 pt-2">
            <Button type="button" variant="ghost" onClick={() => setEntryFor(null)} className="flex-1">Cancelar</Button>
            <Button type="submit" isLoading={saving} className="flex-1">Registrar entrada</Button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={!!adjustFor} onClose={() => setAdjustFor(null)} title={`Ajustar stock: ${adjustFor?.name ?? ''}`}>
        <form onSubmit={saveAdjust} className="space-y-4">
          <p className="text-sm text-inverse/60">
            Úsalo cuando el conteo físico no coincide (producto dañado, perdido o un error). Para mercancía nueva usa <strong>Entrada</strong>.
          </p>
          <Input label={`Cantidad real (hoy dice ${adjustFor?.stock ?? 0})`} type="number" min="0" step="1" value={adjust.stock} onChange={(e) => setAdjust({ ...adjust, stock: e.target.value })} />
          <Input label="Motivo" placeholder="Ej: conteo físico, se dañó un frasco" value={adjust.note} onChange={(e) => setAdjust({ ...adjust, note: e.target.value })} />
          {formError && <p className="text-sm text-error">{formError}</p>}
          <div className="flex gap-3 pt-2">
            <Button type="button" variant="ghost" onClick={() => setAdjustFor(null)} className="flex-1">Cancelar</Button>
            <Button type="submit" isLoading={saving} className="flex-1">Guardar ajuste</Button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={saleOpen} onClose={() => setSaleOpen(false)} title="Nueva venta" size="lg">
        {saleOpen && (
          <SaleForm
            onCancel={() => setSaleOpen(false)}
            onDone={() => {
              showToast('Venta registrada', 'success');
              setSaleOpen(false);
              refreshAll();
            }}
          />
        )}
      </Modal>

      <Modal isOpen={!!voidSale} onClose={() => setVoidSale(null)} title="Anular venta">
        <div className="space-y-4">
          <p className="text-sm">
            Se anulará la venta de <strong>{formatCurrency(n(voidSale?.total))}</strong> y los productos vuelven al stock. La venta queda en el historial como anulada.
          </p>
          <Input label="Motivo (opcional)" value={voidReason} onChange={(e) => setVoidReason(e.target.value)} placeholder="Ej: devolución, error al registrar" />
          <div className="flex gap-3 pt-2">
            <Button type="button" variant="ghost" onClick={() => setVoidSale(null)} className="flex-1">Volver</Button>
            <Button type="button" variant="danger" isLoading={saving} onClick={saveVoid} className="flex-1">Anular venta</Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={!!historyFor} onClose={() => setHistoryFor(null)} title={`Historial: ${historyFor?.name ?? ''}`}>
        {productHistory.length === 0 ? (
          <p className="text-sm text-inverse/60">Sin movimientos recientes.</p>
        ) : (
          <ul className="divide-y divide-surface-container-low max-h-96 overflow-y-auto">
            {productHistory.map((m) => (
              <li key={m.id} className="py-2 flex items-center gap-3 text-sm">
                <div className="flex-1">
                  <p>{MOVEMENT_KINDS[m.kind] ?? m.kind}{m.note && ` · ${m.note}`}</p>
                  <p className="text-xs text-inverse/50">{when(m.created_at)}</p>
                </div>
                <span className={cn('font-semibold', m.quantity > 0 ? 'text-success' : 'text-error')}>
                  {m.quantity > 0 ? `+${m.quantity}` : m.quantity}
                </span>
                <span className="text-inverse/60 w-16 text-right">→ {m.stock_after}</span>
              </li>
            ))}
          </ul>
        )}
      </Modal>
    </div>
  );
}
