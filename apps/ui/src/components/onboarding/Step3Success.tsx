interface Step3SuccessProps {
  email: string;
  restaurantName: string;
  productsCreated: number;
}

export default function Step3Success({ email, restaurantName, productsCreated }: Step3SuccessProps) {
  return (
    <div className="text-center">
      <style>{`@keyframes scaleIn { from { transform: scale(0); opacity: 0; } to { transform: scale(1); opacity: 1; } }`}</style>
      <div className="text-emerald-500 mb-4" style={{ animation: 'scaleIn 0.5s ease' }}>
        <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
          <polyline points="22 4 12 14.01 9 11.01" />
        </svg>
      </div>
      <h2 className="text-3xl text-slate-800 mb-2 font-bold">¡Registro Exitoso!</h2>
      <p className="text-slate-500 text-base mb-8">Tu restaurante ha sido creado</p>

      <div className="bg-green-50 rounded-xl p-5 mb-6">
        <div className="flex justify-between items-center mb-3">
          <span className="text-sm text-slate-500">Restaurante</span>
          <span className="text-sm font-semibold text-slate-800">{restaurantName}</span>
        </div>
        <div className="flex justify-between items-center mb-3">
          <span className="text-sm text-slate-500">Email</span>
          <span className="text-sm font-semibold text-slate-800 break-all">{email}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-sm text-slate-500">Productos creados</span>
          <span className="bg-green-100 text-green-700 text-xs font-bold px-3 py-1 rounded-full">
            {productsCreated} productos
          </span>
        </div>
      </div>

      <div className="flex gap-4 p-5 bg-orange-50 rounded-xl border border-orange-200">
        <div className="text-[#f97316] flex-shrink-0 mt-0.5">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect width="20" height="16" x="2" y="4" rx="2" />
            <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
          </svg>
        </div>
        <div className="text-left">
          <strong className="text-slate-800 block mb-1">Revisa tu correo</strong>
          <p className="text-slate-500 m-0 text-sm leading-relaxed">
            Hemos enviado un enlace de activación a tu dirección de correo.
            Si no aparece en tu bandeja principal, revisa la carpeta de spam.
          </p>
        </div>
      </div>
    </div>
  );
}
