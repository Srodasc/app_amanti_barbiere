'use client';

import { useEffect, useMemo, useState } from 'react';
import { Minus, Plus, Trash2, Search } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Button, Input, Select } from '@/components/ui';
import { formatCurrency } from '@/lib/utils';
import { PAYMENT_METHODS, productErrorMessage, type PaymentMethod, type Product } from '@/lib/products';

type Line = { product: Product; quantity: number };

/**
 * Registrar una venta de productos. La usan el administrador (Dashboard → Productos)
 * y el barbero (/mi-dia). Precio y stock los valida la base de datos al guardar
 * (register_product_sale); aquí solo se muestran como guía.
 */
export default function SaleForm({ onDone, onCancel }: { onDone: () => void; onCancel?: () => void }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [lines, setLines] = useState<Line[]>([]);
  const [payment, setPayment] = useState<PaymentMethod>('cash');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    const { data, error } = await createClient()
      .from('products')
      .select('id, name, category, sku, sale_price, cost_price, stock, min_stock, is_active')
      .eq('is_active', true)
      .order('name');
    if (error) setError(productErrorMessage(error));
    setProducts((data ?? []) as Product[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? products.filter(
          (p) => p.name.toLowerCase().includes(q) || p.category?.toLowerCase().includes(q) || p.sku?.toLowerCase().includes(q)
        )
      : products;
    return list.slice(0, 8);
  }, [products, query]);

  const qtyInCart = (id: string) => lines.find((l) => l.product.id === id)?.quantity ?? 0;

  const add = (p: Product) => {
    setError('');
    setLines((ls) => {
      const found = ls.find((l) => l.product.id === p.id);
      if (found) return ls.map((l) => (l.product.id === p.id ? { ...l, quantity: Math.min(l.quantity + 1, p.stock) } : l));
      return [...ls, { product: p, quantity: 1 }];
    });
    setQuery('');
  };

  const setQty = (id: string, q: number) =>
    setLines((ls) =>
      ls
        .map((l) => (l.product.id === id ? { ...l, quantity: Math.max(0, Math.min(q, l.product.stock)) } : l))
        .filter((l) => l.quantity > 0)
    );

  const total = lines.reduce((s, l) => s + l.quantity * l.product.sale_price, 0);

  const submit = async () => {
    if (lines.length === 0) return setError('Agrega al menos un producto.');
    setSaving(true);
    setError('');
    const { error } = await createClient().rpc('register_product_sale', {
      p_items: lines.map((l) => ({ product_id: l.product.id, quantity: l.quantity })),
      p_payment: payment,
      p_notes: notes.trim() || null,
    });
    setSaving(false);
    if (error) {
      setError(productErrorMessage(error));
      load(); // el stock pudo cambiar (otra venta al mismo tiempo)
      return;
    }
    setLines([]);
    setNotes('');
    onDone();
  };

  return (
    <div className="space-y-4">
      <Input
        placeholder="Buscar producto por nombre, categoría o código"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        icon={<Search className="w-4 h-4" />}
      />

      <div className="max-h-56 overflow-y-auto rounded border border-surface-container-low divide-y divide-surface-container-low">
        {loading ? (
          <p className="p-3 text-sm text-inverse/50">Cargando productos...</p>
        ) : results.length === 0 ? (
          <p className="p-3 text-sm text-inverse/50">{products.length === 0 ? 'No hay productos activos.' : 'Sin resultados.'}</p>
        ) : (
          results.map((p) => {
            const left = p.stock - qtyInCart(p.id);
            return (
              <button
                type="button"
                key={p.id}
                onClick={() => add(p)}
                disabled={left <= 0}
                className="w-full flex items-center justify-between gap-2 p-3 text-left hover:bg-surface disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <span className="min-w-0">
                  <span className="block font-medium truncate">{p.name}</span>
                  <span className="block text-xs text-inverse/50">
                    {left > 0 ? `${left} disponibles` : 'Sin stock'}
                    {p.category && ` · ${p.category}`}
                  </span>
                </span>
                <span className="text-sm font-semibold shrink-0">{formatCurrency(p.sale_price)}</span>
              </button>
            );
          })
        )}
      </div>

      {lines.length > 0 && (
        <ul className="space-y-2">
          {lines.map((l) => (
            <li key={l.product.id} className="flex items-center gap-2 bg-surface rounded p-2">
              <span className="flex-1 min-w-0 text-sm font-medium truncate">{l.product.name}</span>
              <button type="button" aria-label="Menos" onClick={() => setQty(l.product.id, l.quantity - 1)} className="p-1 rounded hover:bg-white">
                <Minus className="w-4 h-4" />
              </button>
              <span className="w-6 text-center text-sm font-semibold">{l.quantity}</span>
              <button
                type="button"
                aria-label="Más"
                onClick={() => setQty(l.product.id, l.quantity + 1)}
                disabled={l.quantity >= l.product.stock}
                className="p-1 rounded hover:bg-white disabled:opacity-30"
              >
                <Plus className="w-4 h-4" />
              </button>
              <span className="w-24 text-right text-sm">{formatCurrency(l.quantity * l.product.sale_price)}</span>
              <button type="button" aria-label="Quitar" onClick={() => setQty(l.product.id, 0)} className="p-1 text-inverse/50 hover:text-error">
                <Trash2 className="w-4 h-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Select
          label="Medio de pago"
          value={payment}
          onChange={(e) => setPayment(e.target.value as PaymentMethod)}
          options={Object.entries(PAYMENT_METHODS).map(([value, label]) => ({ value, label }))}
        />
        <Input label="Nota (opcional)" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={200} />
      </div>

      <div className="flex items-center justify-between border-t border-surface-container-low pt-3">
        <span className="text-inverse/60">Total</span>
        <span className="text-2xl font-bold">{formatCurrency(total)}</span>
      </div>

      {error && <p className="text-sm text-error">{error}</p>}

      <div className="flex gap-3">
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel} className="flex-1">
            Cancelar
          </Button>
        )}
        <Button type="button" onClick={submit} isLoading={saving} disabled={lines.length === 0} className="flex-1">
          Registrar venta
        </Button>
      </div>
    </div>
  );
}
