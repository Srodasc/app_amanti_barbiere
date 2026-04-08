'use client';

import Link from 'next/link';
import { Scissors, Calendar, Clock, Star, MapPin, Phone, Mail } from 'lucide-react';

export default function Home() {
  return (
    <div className="min-h-screen bg-surface">
      <header className="fixed top-0 left-0 right-0 z-50 bg-surface/90 backdrop-blur-sm border-b border-surface-container-low">
        <div className="max-w-4xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-2">
              <Scissors className="w-8 h-8 text-primary" />
              <span className="text-xl font-heading font-bold text-inverse">Amanti Barbiere</span>
            </div>
            <Link 
              href="/book" 
              className="btn-primary text-sm sm:text-base py-2 px-3 sm:px-4"
            >
              Reservar Cita
            </Link>
          </div>
        </div>
      </header>

      <main>
        <section className="pt-24 pb-12 sm:pt-28 sm:pb-16 px-4 bg-gradient-to-b from-primary/5 to-surface">
          <div className="max-w-4xl mx-auto text-center">
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-heading font-bold text-inverse mb-4 sm:mb-6">
              Tu estilo, tu{' '}
              <span className="text-gradient">tiempo</span>
            </h1>
            <p className="text-base sm:text-lg text-inverse/60 mb-6 sm:mb-8 max-w-lg mx-auto">
              Reserva tu cita de manera fácil y rápida. Personaliza tu look con los mejores profesionales.
            </p>
            <Link 
              href="/book" 
              className="inline-flex items-center gap-2 bg-gradient-to-br from-primary to-gold-light hover:shadow-lg text-white font-bold px-6 py-3 sm:px-8 sm:py-4 rounded transition-all hover:-translate-y-0.5 text-base"
            >
              <Calendar className="w-5 h-5" />
              Reservar Cita Ahora
            </Link>
          </div>
        </section>

        <section className="py-12 sm:py-16 px-4">
          <div className="max-w-4xl mx-auto">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 sm:gap-8">
              <div className="text-center">
                <div className="w-14 h-14 sm:w-16 sm:h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-3 sm:mb-4">
                  <Clock className="w-6 h-6 sm:w-7 sm:h-7 text-primary" />
                </div>
                <h3 className="font-semibold text-inverse mb-1 sm:mb-2">Horarios Flexibles</h3>
                <p className="text-sm text-inverse/60">Agenda cuando quieras, disponibles las 24 horas</p>
              </div>
              <div className="text-center">
                <div className="w-14 h-14 sm:w-16 sm:h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-3 sm:mb-4">
                  <Star className="w-6 h-6 sm:w-7 sm:h-7 text-primary" />
                </div>
                <h3 className="font-semibold text-inverse mb-1 sm:mb-2">Profesionales Expertos</h3>
                <p className="text-sm text-inverse/60">Barberos con años de experiencia y reseñas verificaras</p>
              </div>
              <div className="text-center">
                <div className="w-14 h-14 sm:w-16 sm:h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-3 sm:mb-4">
                  <Calendar className="w-6 h-6 sm:w-7 sm:h-7 text-primary" />
                </div>
                <h3 className="font-semibold text-inverse mb-1 sm:mb-2">Recordatorios</h3>
                <p className="text-sm text-inverse/60">No olvides tu cita con notificaciones automáticas</p>
              </div>
            </div>
          </div>
        </section>

        <section className="py-12 sm:py-16 px-4 bg-surface-container-low">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-2xl sm:text-3xl font-heading font-bold text-inverse text-center mb-8 sm:mb-12">
              ¿Cómo funciona?
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 sm:gap-8">
              <div className="flex gap-4">
                <div className="w-10 h-10 bg-primary text-surface rounded-full flex items-center justify-center font-bold flex-shrink-0">
                  1
                </div>
                <div>
                  <h3 className="font-semibold text-inverse mb-1">Elige tu servicio</h3>
                  <p className="text-sm text-inverse/60">Corte, barba, tratamiento o combo</p>
                </div>
              </div>
              <div className="flex gap-4">
                <div className="w-10 h-10 bg-primary text-surface rounded-full flex items-center justify-center font-bold flex-shrink-0">
                  2
                </div>
                <div>
                  <h3 className="font-semibold text-inverse mb-1">Selecciona tu barbero</h3>
                  <p className="text-sm text-inverse/60">Elige tu preferido o cualquier disponible</p>
                </div>
              </div>
              <div className="flex gap-4">
                <div className="w-10 h-10 bg-primary text-surface rounded-full flex items-center justify-center font-bold flex-shrink-0">
                  3
                </div>
                <div>
                  <h3 className="font-semibold text-inverse mb-1">Elige fecha y hora</h3>
                  <p className="text-sm text-inverse/60">Horarios disponibles en tiempo real</p>
                </div>
              </div>
              <div className="flex gap-4">
                <div className="w-10 h-10 bg-primary text-surface rounded-full flex items-center justify-center font-bold flex-shrink-0">
                  4
                </div>
                <div>
                  <h3 className="font-semibold text-inverse mb-1">Confirma tu cita</h3>
                  <p className="text-sm text-inverse/60">Recibe confirmación al instante</p>
                </div>
              </div>
            </div>
            <div className="text-center mt-8 sm:mt-12">
              <Link 
                href="/book" 
                className="btn-primary text-base px-8 py-3 sm:py-4 inline-block"
              >
                Reservar Ahora
              </Link>
            </div>
          </div>
        </section>

        <section className="py-12 sm:py-16 px-4">
          <div className="max-w-4xl mx-auto text-center">
            <h2 className="text-2xl sm:text-3xl font-heading font-bold text-inverse mb-4 sm:mb-6">
              ¿Ya tienes cuenta?
            </h2>
            <p className="text-inverse/60 mb-6 sm:mb-8 max-w-lg mx-auto">
              Inicia sesión para ver tu historial de citas, próximas reservas y más.
            </p>
            <div className="flex flex-wrap gap-3 sm:gap-4 justify-center">
              <Link 
                href="/client-login" 
                className="btn-primary text-base px-6 py-3"
              >
                Iniciar Sesión
              </Link>
              <Link 
                href="/register-client" 
                className="btn-secondary text-base px-6 py-3"
              >
                Crear Cuenta
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="py-8 sm:py-10 px-4 border-t border-surface-container-low">
        <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 sm:gap-6">
          <div className="flex items-center gap-2">
            <Scissors className="w-5 h-5 sm:w-6 sm:h-6 text-primary" />
            <span className="font-heading font-bold text-inverse text-sm sm:text-base">Amanti Barbiere</span>
          </div>
          <div className="flex items-center gap-6 text-sm text-inverse/50">
            <Link href="/book" className="hover:text-primary transition-colors">Reservar</Link>
            <Link href="/client-login" className="hover:text-primary transition-colors">Iniciar Sesión</Link>
          </div>
          <p className="text-inverse/50 text-xs sm:text-sm">
            © 2024 Amanti Barbiere
          </p>
        </div>
      </footer>
    </div>
  );
}