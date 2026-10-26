// Tipos y textos compartidos del módulo de productos.

export type Product = {
  id: string;
  name: string;
  category: string | null;
  sku: string | null;
  sale_price: number;
  cost_price: number;
  stock: number;
  min_stock: number;
  is_active: boolean;
};

export type PaymentMethod = 'cash' | 'card' | 'transfer' | 'other';

export const PAYMENT_METHODS: Record<PaymentMethod, string> = {
  cash: 'Efectivo',
  card: 'Tarjeta',
  transfer: 'Transferencia',
  other: 'Otro',
};

export const MOVEMENT_KINDS: Record<string, string> = {
  purchase: 'Entrada',
  sale: 'Venta',
  void: 'Venta anulada',
  adjustment: 'Ajuste',
};

export const isLowStock = (p: Pick<Product, 'stock' | 'min_stock'>) => p.stock <= p.min_stock;

/** Traduce los códigos que lanzan las funciones SQL del módulo a un mensaje para la persona. */
export function productErrorMessage(err: { message?: string; details?: string | null } | null | undefined): string {
  const m = err?.message ?? '';
  const d = err?.details ? ` ${err.details}` : '';
  if (m.includes('insufficient_stock')) return `No hay suficiente stock:${d}.`;
  if (m.includes('product_unavailable')) return 'Uno de los productos ya no está disponible. Recarga la lista.';
  if (m.includes('invalid_quantity')) return 'Revisa las cantidades (deben ser mayores que 0).';
  if (m.includes('empty_sale')) return 'Agrega al menos un producto.';
  if (m.includes('invalid_payment')) return 'Elige un medio de pago.';
  if (m.includes('note_required')) return 'Escribe el motivo del ajuste.';
  if (m.includes('sale_not_found')) return 'La venta no existe o ya estaba anulada.';
  if (m.includes('stock_direct_change')) return 'El stock solo se cambia con Entrada o Ajuste.';
  if (m.includes('not_authorized')) return 'No tienes permiso para esta acción.';
  if (m.includes('products_sku_unique') || m.includes('duplicate key')) return 'Ya existe un producto con ese código (SKU).';
  return m || 'Ocurrió un error inesperado.';
}
