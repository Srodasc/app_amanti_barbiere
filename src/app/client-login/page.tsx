'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Scissors, Phone, Lock, ArrowLeft, User } from 'lucide-react';
import { Button, Input, Card } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';

export default function ClientLoginPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [form, setForm] = useState({
    phone: '',
    password: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = () => {
    const newErrors: Record<string, string> = {};
    
    if (!form.phone || form.phone.length < 10) {
      newErrors.phone = 'El teléfono es requerido';
    }
    if (!form.password) {
      newErrors.password = 'La contraseña es requerida';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setIsLoading(true);
    try {
      const res = await fetch('/api/clients/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });

      const data = await res.json();

      if (!res.ok) {
        showToast(data.error || 'Error al iniciar sesión', 'error');
        setIsLoading(false);
        return;
      }

      showToast(`¡Bienvenido, ${data.name}!`, 'success');
      router.push('/client-portal');
    } catch (error) {
      showToast('Error de conexión', 'error');
    }
    setIsLoading(false);
  };

  return (
    <div className="min-h-screen bg-surface pb-safe">
      <header className="bg-primary border-b border-surface-container-low">
        <div className="max-w-md mx-auto px-3 sm:px-4 py-3 sm:py-4">
          <div className="flex items-center gap-2">
            <Scissors className="w-6 h-6 sm:w-8 sm:h-8 text-primary" />
            <span className="text-lg sm:text-xl font-heading font-bold text-inverse">Amanti Barbiere</span>
          </div>
        </div>
      </header>

      <main className="max-w-md mx-auto px-3 sm:px-4 py-6 sm:py-8">
        <button
          onClick={() => router.push('/')}
          className="flex items-center gap-1 sm:gap-2 text-inverse/60 hover:text-inverse mb-4 sm:mb-6 transition-colors text-sm sm:text-base py-2 touch-target"
        >
          <ArrowLeft className="w-4 h-4" />
          Volver al inicio
        </button>

        <Card className="!p-4 sm:!p-6">
          <div className="text-center mb-4 sm:mb-6">
            <div className="w-12 h-12 sm:w-16 sm:h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-3 sm:mb-4">
              <User className="w-6 h-6 sm:w-8 sm:h-8 text-primary" />
            </div>
            <h1 className="text-xl sm:text-2xl font-heading font-bold text-inverse">Iniciar Sesión</h1>
            <p className="text-sm sm:text-base text-inverse/60 mt-1 sm:mt-2">Accede a tu cuenta de cliente</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3 sm:space-y-4">
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
              label="Contraseña"
              type="password"
              placeholder="Tu contraseña"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              error={errors.password}
              icon={<Lock className="w-4 h-4" />}
            />

            <Button type="submit" isLoading={isLoading} className="w-full" size="lg">
              Iniciar Sesión
            </Button>
          </form>

          <div className="mt-4 sm:mt-6 text-center">
            <p className="text-inverse/60 text-sm">
              ¿No tienes cuenta?{' '}
              <a href="/register-client" className="text-primary hover:underline">
                Regístrate aquí
              </a>
            </p>
          </div>
        </Card>
      </main>
    </div>
  );
}