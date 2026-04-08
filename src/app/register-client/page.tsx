'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { User, Phone, Mail, Lock, Scissors, Check } from 'lucide-react';
import { Button, Input, Card } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';

export default function RegisterClientPage() {
  const router = useRouter();
  const { showToast } = useToast();
  
  const [form, setForm] = useState({
    name: '',
    phone: '',
    email: '',
    password: '',
    confirmPassword: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);

  const validate = () => {
    const newErrors: Record<string, string> = {};
    
    if (!form.name || form.name.length < 2) {
      newErrors.name = 'El nombre es requerido (mínimo 2 caracteres)';
    }
    
    if (!form.phone) {
      newErrors.phone = 'El teléfono es requerido';
    } else if (form.phone.length < 10) {
      newErrors.phone = 'Teléfono inválido';
    }
    
    if (!form.password) {
      newErrors.password = 'La contraseña es requerida';
    } else if (form.password.length < 4) {
      newErrors.password = 'La contraseña debe tener al menos 4 caracteres';
    }
    
    if (form.password !== form.confirmPassword) {
      newErrors.confirmPassword = 'Las contraseñas no coinciden';
    }
    
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      newErrors.email = 'Correo inválido';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validate()) return;
    
    setIsLoading(true);
    
    try {
      const response = await fetch('/api/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          phone: form.phone,
          email: form.email || null,
          password: form.password,
        }),
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        showToast(data.error || 'Error al registrar', 'error');
        setIsLoading(false);
        return;
      }
      
      showToast('¡Registro exitoso! Ahora puedes reservar tu cita.', 'success');
      router.push(`/book?client=${data.id}`);
    } catch (error) {
      showToast('Error de conexión', 'error');
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface flex flex-col pb-safe">
      <header className="bg-primary border-b border-surface-container-low">
        <div className="max-w-4xl mx-auto px-3 sm:px-4 py-3 sm:py-4">
          <Link href="/" className="flex items-center gap-2">
            <Scissors className="w-6 h-6 sm:w-8 sm:h-8 text-primary" />
            <span className="text-lg sm:text-xl font-heading font-bold text-inverse">Amanti Barbiere</span>
          </Link>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center p-3 sm:p-4">
        <Card className="w-full max-w-md !p-4 sm:!p-6">
          <div className="text-center mb-4 sm:mb-6">
            <div className="w-12 h-12 sm:w-16 sm:h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-3 sm:mb-4">
              <User className="w-6 h-6 sm:w-8 sm:h-8 text-primary" />
            </div>
            <h1 className="text-xl sm:text-2xl font-heading font-bold text-inverse mb-1 sm:mb-2">
              Registro de Cliente
            </h1>
            <p className="text-sm sm:text-base text-inverse/60">
              Crea tu cuenta para reservar citas
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3 sm:space-y-4">
            <Input
              label="Nombre completo"
              placeholder="Tu nombre"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              error={errors.name}
              icon={<User className="w-5 h-5" />}
            />

            <Input
              label="Teléfono"
              type="tel"
              placeholder="+52 123 456 7890"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              error={errors.phone}
              icon={<Phone className="w-5 h-5" />}
            />

            <Input
              label="Correo electrónico (opcional)"
              type="email"
              placeholder="tu@email.com"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              error={errors.email}
              icon={<Mail className="w-5 h-5" />}
            />

            <Input
              label="Contraseña"
              type="password"
              placeholder="Mínimo 4 caracteres"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              error={errors.password}
              icon={<Lock className="w-5 h-5" />}
            />

            <Input
              label="Confirmar contraseña"
              type="password"
              placeholder="Repite tu contraseña"
              value={form.confirmPassword}
              onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
              error={errors.confirmPassword}
              icon={<Lock className="w-5 h-5" />}
            />

            <Button type="submit" className="w-full" isLoading={isLoading}>
              <Check className="w-4 h-4 mr-2" />
              Crear Cuenta
            </Button>
          </form>

          <div className="mt-4 sm:mt-6 text-center">
            <p className="text-inverse/60 text-sm">
              ¿Ya tienes cuenta?{' '}
              <Link href="/client-login" className="text-primary hover:text-primary-light font-semibold">
                Inicia sesión
              </Link>
            </p>
          </div>

          <div className="mt-4 sm:mt-6 pt-4 sm:pt-6 border-t border-surface-container-low">
            <Link 
              href="/book" 
              className="block text-center text-sm sm:text-base text-inverse/60 hover:text-inverse transition-colors"
            >
              O reserva directamente sin registrarte →
            </Link>
          </div>
        </Card>
      </main>
    </div>
  );
}