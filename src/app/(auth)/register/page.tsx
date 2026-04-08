'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Mail, Lock, Eye, EyeOff, User, Phone, Scissors } from 'lucide-react';
import { useAuth } from '@/hooks';
import { Button, Input } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';

export default function RegisterPage() {
  const router = useRouter();
  const { signUp } = useAuth();
  const { showToast } = useToast();
  
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = () => {
    const newErrors: Record<string, string> = {};
    
    if (!fullName || fullName.length < 2) {
      newErrors.fullName = 'El nombre debe tener al menos 2 caracteres';
    }
    
    if (!email) {
      newErrors.email = 'El correo es requerido';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      newErrors.email = 'Correo inválido';
    }
    
    if (!phone) {
      newErrors.phone = 'El teléfono es requerido';
    } else if (!/^\+?[\d\s-]{10,}$/.test(phone)) {
      newErrors.phone = 'Teléfono inválido';
    }
    
    if (!password) {
      newErrors.password = 'La contraseña es requerida';
    } else if (password.length < 6) {
      newErrors.password = 'La contraseña debe tener al menos 6 caracteres';
    }
    
    if (password !== confirmPassword) {
      newErrors.confirmPassword = 'Las contraseñas no coinciden';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validate()) return;
    
    setIsLoading(true);
    const { error } = await signUp(email, password, fullName);
    
    if (error) {
      showToast(error.message, 'error');
      setIsLoading(false);
    } else {
      showToast('Cuenta creada exitosamente. ¡Bienvenido!', 'success');
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
          Crear Cuenta
        </h1>
        <p className="text-sm sm:text-base text-inverse/60">
          Completa el formulario para registrarte
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3 sm:space-y-5">
        <Input
          label="Nombre completo"
          type="text"
          placeholder="Tu nombre"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          error={errors.fullName}
          icon={<User className="w-5 h-5" />}
        />

        <Input
          label="Correo electrónico"
          type="email"
          placeholder="tu@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={errors.email}
          icon={<Mail className="w-5 h-5" />}
        />

        <Input
          label="Teléfono"
          type="tel"
          placeholder="+52 123 456 7890"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          error={errors.phone}
          icon={<Phone className="w-5 h-5" />}
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

        <Input
          label="Confirmar contraseña"
          type="password"
          placeholder="••••••••"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          error={errors.confirmPassword}
          icon={<Lock className="w-5 h-5" />}
        />

        <Button type="submit" className="w-full" isLoading={isLoading}>
          Crear Cuenta
        </Button>
      </form>

      <p className="mt-6 sm:mt-8 text-center text-inverse/60 text-sm sm:text-base">
        ¿Ya tienes cuenta?{' '}
        <Link href="/login" className="text-primary hover:text-primary-light font-semibold transition-colors">
          Inicia sesión
        </Link>
      </p>
    </div>
  );
}
