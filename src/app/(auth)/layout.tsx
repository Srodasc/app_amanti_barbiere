export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-surface flex">
      <div className="hidden lg:flex lg:w-1/2 bg-primary relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-transparent" />
        <div className="absolute top-1/4 left-1/4 w-64 sm:w-96 h-64 sm:h-96 bg-primary/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-48 sm:w-64 h-48 sm:h-64 bg-primary/10 rounded-full blur-3xl" />
        <div className="relative z-10 flex flex-col items-center justify-center w-full p-6 sm:p-12 text-center">
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-heading font-bold text-inverse mb-4 sm:mb-6">
            Bienvenido a <span className="text-gradient">Amanti Barbiere</span>
          </h1>
          <p className="text-base sm:text-xl text-inverse/60 max-w-md">
            La plataforma integral para gestionar tu barbería de manera profesional y eficiente.
          </p>
          <div className="mt-8 sm:mt-12 grid grid-cols-2 gap-4 sm:gap-6">
            {[
              { stat: '500+', label: 'Barberías' },
              { stat: '10k+', label: 'Citas mensuales' },
              { stat: '98%', label: 'Satisfacción' },
              { stat: '24/7', label: 'Soporte' },
            ].map((item, i) => (
              <div key={i} className="text-center">
                <p className="text-2xl sm:text-3xl font-bold text-primary">{item.stat}</p>
                <p className="text-xs sm:text-sm text-inverse/60">{item.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="w-full lg:w-1/2 flex items-center justify-center p-4 sm:p-8">
        {children}
      </div>
    </div>
  );
}
