'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Mail, Lock, Eye, EyeOff, Scissors } from 'lucide-react';
import { useAuth } from '@/hooks';
import { Button, Input } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';

export default function LoginPage() {
  const router = useRouter();
  const { signIn } = useAuth();
  const { showToast } = useToast();
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});

  const validate = () => {
    const newErrors: { email?: string; password?: string } = {};
    
    if (!email) {
      newErrors.email = 'El correo es requerido';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      newErrors.email = 'Correo inválido';
    }
    
    if (!password) {
      newErrors.password = 'La contraseña es requerida';
    } else if (password.length < 6) {
      newErrors.password = 'La contraseña debe tener al menos 6 caracteres';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validate()) return;
    
    setIsLoading(true);
    const { error } = await signIn(email, password);
    
    if (error) {
      showToast(error.message, 'error');
      setIsLoading(false);
    } else {
      showToast('Bienvenido de vuelta', 'success');
      router.push('/dashboard');
    }
  };

  return (
    <div className="w-full max-w-md animate-fade-in px-3 sm:px-0">
      <div className="lg:hidden flex items-center justify-center gap-2 mb-6 sm:mb-8">
        <Scissors className="w-8 h-8 sm:w-10 sm:h-10 text-primary" />
        <span className="text-xl sm:text-2xl font-heading font-bold text-inverse">Amanti Barbiere</span>
      </div>
      
      <div className="text-center lg:text-left mb-6 sm:mb-8">
        <h1 className="text-2xl sm:text-3xl font-heading font-bold text-inverse mb-2">
          Iniciar Sesión
        </h1>
        <p className="text-sm sm:text-base text-inverse/60">
          Ingresa tus credenciales para acceder a tu cuenta
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-6">
        <Input
          label="Correo electrónico"
          type="email"
          placeholder="tu@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={errors.email}
          icon={<Mail className="w-5 h-5" />}
        />

        <div className="relative">
          <Input
            label="Contraseña"
            type={showPassword ? 'text' : 'password'}
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={errors.password}
            icon={<Lock className="w-5 h-5" />}
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-9 text-inverse/60 hover:text-inverse transition-colors touch-target p-1"
          >
            {showPassword ? <EyeOff className="w-4 h-4 sm:w-5 sm:h-5" /> : <Eye className="w-4 h-4 sm:w-5 sm:h-5" />}
          </button>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-0">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              className="w-4 h-4 rounded border-surface-container-low bg-surface text-primary focus:ring-primary focus:ring-offset-0"
            />
            <span className="text-sm text-inverse/60">Recordarme</span>
          </label>
          <Link href="/forgot-password" className="text-sm text-primary hover:text-primary-light transition-colors">
            ¿Olvidaste tu contraseña?
          </Link>
        </div>

        <Button type="submit" className="w-full" isLoading={isLoading}>
          Iniciar Sesión
        </Button>
      </form>

      <p className="mt-6 sm:mt-8 text-center text-inverse/60 text-sm sm:text-base">
        ¿No tienes cuenta?{' '}
        <Link href="/register" className="text-primary hover:text-primary-light font-semibold transition-colors">
          Regístrate aquí
        </Link>
      </p>
    </div>
  );
}
