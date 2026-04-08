'use client';

import { cn } from '@/lib/utils';

export type BadgeVariant = 'default' | 'success' | 'warning' | 'error' | 'info' | 'accent';

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  className?: string;
  style?: React.CSSProperties;
}

export default function Badge({ children, variant = 'default', className = '', style }: BadgeProps) {
  const variants = {
    default: 'bg-surface-container-low text-inverse/70',
    success: 'bg-success/15 text-success',
    warning: 'bg-warning/15 text-warning',
    error: 'bg-error/15 text-error',
    info: 'bg-info/15 text-info',
    accent: 'bg-primary/15 text-primary',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center px-2.5 py-0.5 rounded-sm text-xs font-medium',
        variants[variant],
        className
      )}
      style={style}
    >
      {children}
    </span>
  );
}
