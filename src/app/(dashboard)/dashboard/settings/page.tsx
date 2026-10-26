import BusinessSettingsCard from '@/components/settings/BusinessSettingsCard';
import ServicesCard from '@/components/settings/ServicesCard';

export default function SettingsPage() {
  return (
    <div className="space-y-6 animate-fade-in max-w-2xl">
      <div>
        <h1 className="text-2xl font-heading font-bold text-inverse">Configuración</h1>
        <p className="text-inverse/70">Datos del negocio, reglas de reserva y servicios</p>
      </div>
      <ServicesCard />
      <BusinessSettingsCard />
    </div>
  );
}
