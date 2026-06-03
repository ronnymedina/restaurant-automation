// src/components/dash/RestaurantSettingsForm.tsx
import { useEffect, useRef, useMemo, useState } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import ct from 'countries-and-timezones';
import { apiFetch } from '../../lib/api';
import { queryClient } from '../commons/Providers';
import { useRestaurantSettings } from '../../lib/restaurant-settings';
import type { RestaurantSettings } from '../../lib/restaurant-settings';

const schema = z.object({
  name: z.string().min(1, 'El nombre es requerido').max(255),
  timezone: z.string().min(1),
  decimalSeparator: z.enum(['.', ',']),
});
type FormValues = z.infer<typeof schema>;

function SettingsFormContent() {
  const { data: settings } = useRestaurantSettings();
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', timezone: '', decimalSeparator: ',' },
  });

  const initialRef = useRef<RestaurantSettings | null>(null);
  const initializedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (initializedRef.current) return;   // already populated from real API data
    if (!settings.name) return;           // still on defaults, wait for real response
    reset({
      name: settings.name,
      timezone: settings.timezone,
      decimalSeparator: settings.decimalSeparator as '.' | ',',
    });
    initialRef.current = settings;
    initializedRef.current = true;
  }, [settings, reset]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const timezoneOptions = useMemo(() => {
    const list = ct.getCountry(settings.country)?.timezones ?? [];
    return list.includes(settings.timezone) ? list : [settings.timezone, ...list];
  }, [settings.country, settings.timezone]);

  const onSubmit = async (values: FormValues) => {
    const initial = initialRef.current;
    // currency is read-only in settings — it is set during onboarding and derived from country
    const patch: Record<string, string> = {};
    if (values.name !== initial?.name) patch.name = values.name;
    if (values.timezone !== initial?.timezone) patch.timezone = values.timezone;
    if (values.decimalSeparator !== initial?.decimalSeparator)
      patch.decimalSeparator = values.decimalSeparator;
    if (Object.keys(patch).length === 0) return;

    setStatus('idle');
    setErrorMsg('');
    setStatus('saving');
    try {
      const res = await apiFetch('/v1/restaurants/settings', {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        const code = data?.code as string | undefined;
        setErrorMsg(
          code === 'TIMEZONE_NOT_AVAILABLE_FOR_COUNTRY'
            ? 'La zona horaria no está disponible para tu país.'
            : code === 'DUPLICATE_RESTAURANT'
              ? 'Ya existe un restaurante con un nombre similar.'
              : data?.message || 'Error al guardar la configuración',
        );
        setStatus('error');
        return;
      }
      const updated = await res.json();
      initialRef.current = { ...settings, ...updated };
      queryClient.setQueryData(['restaurant-settings'], { ...settings, ...updated });
      setStatus('saved');
      timerRef.current = setTimeout(() => setStatus('idle'), 4000);
    } catch {
      setErrorMsg('Error de red al guardar la configuración');
      setStatus('error');
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-slate-800">Configuración</h2>

      <form
        onSubmit={handleSubmit(onSubmit)}
        className="bg-white rounded-xl border border-slate-200 p-6 space-y-4"
      >
        <div>
          <label htmlFor="name" className="block text-sm font-medium text-slate-700 mb-1">
            Nombre del restaurante
          </label>
          <input
            id="name"
            type="text"
            maxLength={255}
            {...register('name')}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          {errors.name && (
            <p className="mt-1 text-xs text-red-600">{errors.name.message}</p>
          )}
        </div>

        <div>
          <label htmlFor="timezone" className="block text-sm font-medium text-slate-700 mb-1">
            Zona horaria
          </label>
          <select
            id="timezone"
            {...register('timezone')}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {timezoneOptions.map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </select>
        </div>

        <fieldset>
          <legend className="block text-sm font-medium text-slate-700 mb-1">
            Formato decimal
          </legend>
          <label className="inline-flex items-center mr-4">
            <input type="radio" value="." {...register('decimalSeparator')} />
            <span className="ml-2 text-sm">Punto (1,234.56)</span>
          </label>
          <label className="inline-flex items-center">
            <input type="radio" value="," {...register('decimalSeparator')} />
            <span className="ml-2 text-sm">Coma (1.234,56)</span>
          </label>
        </fieldset>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={status === 'saving'}
            className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors cursor-pointer border-none disabled:opacity-50"
          >
            {status === 'saving' ? 'Guardando...' : 'Guardar'}
          </button>
          {status === 'saved' && (
            <p className="text-sm text-green-600">Configuración guardada</p>
          )}
          {status === 'error' && (
            <p className="text-sm text-red-600">{errorMsg}</p>
          )}
        </div>
      </form>

      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">
          Información del restaurante
        </h3>
        <dl className="space-y-3">
          <div className="flex items-center gap-4">
            <dt className="text-sm font-medium text-slate-500 w-24">Slug</dt>
            <dd className="text-sm text-slate-700 font-mono">{settings.slug}</dd>
          </div>
          <div className="flex items-center gap-4">
            <dt className="text-sm font-medium text-slate-500 w-24">País</dt>
            <dd className="text-sm text-slate-700">{settings.country}</dd>
          </div>
          <div className="flex items-center gap-4">
            <dt className="text-sm font-medium text-slate-500 w-24">Moneda</dt>
            <dd className="text-sm text-slate-700">{settings.currency}</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}

export default function RestaurantSettingsForm() {
  return (
    <QueryClientProvider client={queryClient}>
      <SettingsFormContent />
    </QueryClientProvider>
  );
}
