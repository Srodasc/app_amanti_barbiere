'use client';

import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface Column<T> {
  key: string;
  header: string;
  render?: (item: T) => ReactNode;
  className?: string;
}

interface TableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyExtractor: (item: T) => string;
  onRowClick?: (item: T) => void;
  emptyMessage?: string;
  isLoading?: boolean;
}

export default function Table<T>({
  columns,
  data,
  keyExtractor,
  onRowClick,
  emptyMessage = 'No hay datos',
  isLoading,
}: TableProps<T>) {
  if (isLoading) {
    return (
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-surface-container-low">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={cn(
                    'px-4 py-3 text-left text-sm font-semibold text-inverse/70',
                    col.className
                  )}
                >
                  <div className="h-4 w-20 bg-surface-container-low rounded animate-pulse" />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[...Array(5)].map((_, i) => (
              <tr key={i} className="border-b border-surface-container-low/50">
                {columns.map((col) => (
                  <td key={col.key} className="px-4 py-3">
                    <div className="h-4 w-full bg-surface-container-low rounded animate-pulse" />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="py-12 text-center">
        <div className="w-16 h-16 mx-auto mb-4 bg-surface-container-low rounded-full flex items-center justify-center">
          <svg className="w-8 h-8 text-inverse/40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
          </svg>
        </div>
        <p className="text-inverse/60">{emptyMessage}</p>
      </div>
    );
  }

  const cell = (col: Column<T>, item: T) => (col.render ? col.render(item) : ((item as Record<string, unknown>)[col.key] as ReactNode));
  const [titleCol, ...restCols] = columns;

  return (
    <>
    {/* Celular: cada fila es una tarjeta (la primera columna es el título; las sin encabezado, las acciones) */}
    <ul className="md:hidden divide-y divide-surface-container-low">
      {data.map((item) => (
        <li
          key={keyExtractor(item)}
          onClick={() => onRowClick?.(item)}
          className={cn('px-4 py-3 space-y-2', onRowClick && 'cursor-pointer active:bg-surface-container-low')}
        >
          <div className="text-sm text-inverse">{cell(titleCol, item)}</div>
          {restCols.some((c) => c.header) && (
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
              {restCols
                .filter((c) => c.header)
                .map((c) => (
                  <div key={c.key} className="contents">
                    <dt className="text-inverse/60">{c.header}</dt>
                    <dd className="min-w-0 text-inverse break-words">{cell(c, item)}</dd>
                  </div>
                ))}
            </dl>
          )}
          {restCols
            .filter((c) => !c.header)
            .map((c) => (
              <div key={c.key} className="flex justify-end -mr-2">
                {cell(c, item)}
              </div>
            ))}
        </li>
      ))}
    </ul>
    <div className="hidden md:block overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-surface-container-low">
            {columns.map((col) => (
              <th
                key={col.key}
                className={cn(
                  'px-4 py-3 text-left text-sm font-semibold text-inverse/70',
                  col.className
                )}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((item) => (
            <tr
              key={keyExtractor(item)}
              onClick={() => onRowClick?.(item)}
              className={cn(
                'border-b border-surface-container-low/50 transition-colors',
                onRowClick && 'cursor-pointer hover:bg-surface-container-low'
              )}
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={cn('px-4 py-3 text-sm text-inverse', col.className)}
                >
                  {col.render ? col.render(item) : (item as Record<string, unknown>)[col.key] as ReactNode}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    </>
  );
}
