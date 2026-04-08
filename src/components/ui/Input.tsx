'use client';

import { forwardRef, InputHTMLAttributes } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  icon?: React.ReactNode;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className = '', label, error, icon, ...props }, ref) => {
    return (
      <div className="w-full">
        {label && (
          <label className="block text-sm font-medium text-inverse/70 mb-2">
            {label}
          </label>
        )}
        <div className="relative">
          {icon && (
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-inverse/50">
              {icon}
            </div>
          )}
          <input
            ref={ref}
            className={`
              w-full bg-surface-container border-b-2 border-transparent px-4 py-3 text-inverse 
              placeholder-inverse/40
              focus:outline-none transition-all duration-200
              ${icon ? 'pl-10' : ''}
              ${error 
                ? 'border-error focus:border-error' 
                : 'focus:border-primary'
              }
              ${className}
            `}
            {...props}
          />
        </div>
        {error && (
          <p className="mt-1 text-sm text-error">{error}</p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';

export default Input;
