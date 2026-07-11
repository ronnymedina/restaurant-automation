const PRODUCTS_WARNING_MESSAGES: Record<string, string> = {
  products_extraction_failed: 'No pudimos extraer productos de la foto. Podés agregarlos manualmente desde el dashboard.',
  products_creation_failed: 'Hubo un error al crear los productos de demo. Podés agregarlos manualmente desde el dashboard.',
};

interface Step3SuccessProps {
  email: string;
  restaurantName: string;
  productsCreated: number;
  productsWarning?: string;
  activationUrl?: string;
  onResend: () => void;
  resendStatus: 'idle' | 'loading' | 'sent' | 'error';
}

export default function Step3Success({
  email,
  restaurantName,
  productsCreated,
  productsWarning,
  activationUrl,
  onResend,
  resendStatus,
}: Step3SuccessProps) {
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

      {productsWarning && (
        <div className="flex gap-3 p-4 bg-amber-50 rounded-xl border border-amber-200 mb-4 text-left">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-500 flex-shrink-0 mt-0.5">
            <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
            <path d="M12 9v4" /><path d="M12 17h.01" />
          </svg>
          <p className="text-sm text-amber-800 m-0">
            {PRODUCTS_WARNING_MESSAGES[productsWarning] ?? 'No pudimos procesar los productos. Podés agregarlos desde el dashboard.'}
          </p>
        </div>
      )}

      {activationUrl ? (
        <div className="flex flex-col gap-3 p-5 bg-orange-50 rounded-xl border border-orange-200 mb-6 text-left">
          <strong className="text-slate-800">Activá tu cuenta</strong>
          <p className="text-slate-500 m-0 text-sm leading-relaxed">
            Tu instalación no tiene servicio de correo configurado. Hacé clic para
            establecer tu contraseña y activar tu cuenta de administrador.
          </p>
          <a
            href={activationUrl}
            className="w-full py-3 px-6 bg-[#f97316] text-white no-underline rounded-xl text-sm font-semibold flex items-center justify-center transition-all hover:bg-orange-600"
          >
            Activar mi cuenta
          </a>
        </div>
      ) : (
        <>
          <div className="flex gap-4 p-5 bg-orange-50 rounded-xl border border-orange-200 mb-6">
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

          {resendStatus === 'sent' && (
            <p className="text-sm text-emerald-600 mb-4">
              Si el correo está registrado, recibirás un email en breve.
            </p>
          )}
          {resendStatus === 'error' && (
            <p className="text-sm text-red-500 mb-4">
              Error de conexión. Intenta nuevamente.
            </p>
          )}

          <div className="flex flex-col gap-3">
            <button
              type="button"
              onClick={onResend}
              disabled={resendStatus === 'loading' || resendStatus === 'sent'}
              className="w-full py-3 px-6 bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-sm font-medium cursor-pointer transition-all hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {resendStatus === 'loading' ? 'Enviando...' : 'No me llegó el correo'}
            </button>
            <a
              href="/login"
              className="w-full py-3 px-6 bg-[#f97316] text-white no-underline rounded-xl text-sm font-semibold flex items-center justify-center transition-all hover:bg-orange-600"
            >
              Ir al login
            </a>
          </div>
        </>
      )}
    </div>
  );
}
