import { useState } from 'react';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NAME_REGEX = /^[a-zA-ZÀ-ÿ \-_]+$/;
const NAME_MAX = 60;

function validateEmail(value: string): string | null {
  if (!value.trim()) return 'El correo electrónico es requerido';
  if (!EMAIL_REGEX.test(value)) return 'Ingresa un correo electrónico válido';
  return null;
}

function validateName(value: string): string | null {
  if (!value.trim()) return 'El nombre del restaurante es requerido';
  if (value.length > NAME_MAX) return `El nombre no puede superar ${NAME_MAX} caracteres`;
  if (!NAME_REGEX.test(value)) return 'Solo se permiten letras, espacios, guión medio y guión bajo';
  return null;
}

interface Step1FormProps {
  onSubmit: (data: { email: string; restaurantName: string }) => void;
}

const inputBase =
  'w-full py-3.5 px-4 border-2 rounded-xl text-base transition-all bg-white text-slate-800 box-border focus:outline-none focus:ring-4 focus:ring-[#f97316]/10 placeholder:text-slate-400';

export default function Step1Form({ onSubmit }: Step1FormProps) {
  const [email, setEmail] = useState('');
  const [restaurantName, setRestaurantName] = useState('');
  const [emailTouched, setEmailTouched] = useState(false);
  const [nameTouched, setNameTouched] = useState(false);

  const emailError = emailTouched ? validateEmail(email) : null;
  const nameError = nameTouched ? validateName(restaurantName) : null;
  const isValid = validateEmail(email) === null && validateName(restaurantName) === null;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isValid) onSubmit({ email: email.trim(), restaurantName: restaurantName.trim() });
  }

  const emailBorder = emailError
    ? 'border-red-500 focus:border-red-500'
    : emailTouched && !emailError
      ? 'border-emerald-500 focus:border-emerald-500'
      : 'border-slate-200 focus:border-[#f97316]';

  const nameBorder = nameError
    ? 'border-red-500 focus:border-red-500'
    : nameTouched && !nameError
      ? 'border-emerald-500 focus:border-emerald-500'
      : 'border-slate-200 focus:border-[#f97316]';

  return (
    <>
      <div className="text-center mb-8">
        <h2 className="text-3xl text-slate-800 mb-2 font-bold">¡Bienvenido!</h2>
        <p className="text-slate-500 text-base">Comienza a digitalizar tu restaurante</p>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="mb-6">
          <label htmlFor="email" className="block font-semibold text-slate-800 mb-2 text-sm">
            Correo electrónico
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onBlur={() => setEmailTouched(true)}
            placeholder="tu@email.com"
            className={`${inputBase} ${emailBorder}`}
          />
          {emailError && (
            <p className="text-red-500 text-xs mt-1 flex items-center gap-1">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <circle cx="12" cy="12" r="10" /><path d="M12 8v4" /><path d="M12 16h.01" />
              </svg>
              {emailError}
            </p>
          )}
        </div>

        <div className="mb-6">
          <label htmlFor="restaurantName" className="block font-semibold text-slate-800 mb-2 text-sm">
            Nombre del restaurante
          </label>
          <input
            id="restaurantName"
            type="text"
            value={restaurantName}
            onChange={(e) => setRestaurantName(e.target.value)}
            onBlur={() => setNameTouched(true)}
            placeholder="Mi Restaurante"
            maxLength={NAME_MAX + 10}
            className={`${inputBase} ${nameBorder}`}
          />
          {nameError && (
            <p className="text-red-500 text-xs mt-1 flex items-center gap-1">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <circle cx="12" cy="12" r="10" /><path d="M12 8v4" /><path d="M12 16h.01" />
              </svg>
              {nameError}
            </p>
          )}
          <p className={`text-xs text-right mt-1 ${restaurantName.length > NAME_MAX ? 'text-red-500' : 'text-slate-400'}`}>
            {restaurantName.length} / {NAME_MAX}
          </p>
        </div>

        <button
          type="submit"
          disabled={!isValid}
          className="w-full py-4 px-6 bg-[#f97316] text-white border-none rounded-xl text-base font-semibold cursor-pointer flex items-center justify-center gap-2 transition-all hover:bg-[#ea6c0a] hover:-translate-y-0.5 disabled:bg-slate-300 disabled:cursor-not-allowed disabled:translate-y-0"
        >
          Siguiente
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m9 18 6-6-6-6" />
          </svg>
        </button>
      </form>
    </>
  );
}
