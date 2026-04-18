import { useState } from 'react';
import Button from '../../commons/Button';
import type { Menu, MenuPayload } from '../../../lib/menus-api';
import { createMenu, updateMenu } from '../../../lib/menus-api';

const DAY_OPTIONS = [
  { value: 'MON', label: 'Lun' },
  { value: 'TUE', label: 'Mar' },
  { value: 'WED', label: 'Mié' },
  { value: 'THU', label: 'Jue' },
  { value: 'FRI', label: 'Vie' },
  { value: 'SAT', label: 'Sáb' },
  { value: 'SUN', label: 'Dom' },
];

interface MenuFormProps {
  initialData?: Menu;
  onSuccess: () => void;
  onCancel: () => void;
}

export default function MenuForm({ initialData, onSuccess, onCancel }: MenuFormProps) {
  const isEditing = !!initialData;

  const hasTime = !!(initialData?.startTime || initialData?.endTime);

  const [name, setName] = useState(initialData?.name ?? '');
  const [allDay, setAllDay] = useState(!hasTime);
  const [startTime, setStartTime] = useState(initialData?.startTime ?? '');
  const [endTime, setEndTime] = useState(initialData?.endTime ?? '');
  const [selectedDays, setSelectedDays] = useState<string[]>(
    initialData?.daysOfWeek ? initialData.daysOfWeek.split(',') : [],
  );
  const [active, setActive] = useState(initialData?.active !== false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const toggleDay = (day: string) => {
    setSelectedDays(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day],
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError('El nombre es requerido');
      return;
    }

    const payload: MenuPayload = { name: name.trim(), active };

    if (isEditing) {
      payload.startTime = allDay ? null : startTime || null;
      payload.endTime = allDay ? null : endTime || null;
      payload.daysOfWeek = selectedDays.length > 0 ? selectedDays.join(',') : null;
    } else {
      if (!allDay && startTime) payload.startTime = startTime;
      if (!allDay && endTime) payload.endTime = endTime;
      if (selectedDays.length > 0) payload.daysOfWeek = selectedDays.join(',');
    }

    setIsSubmitting(true);
    try {
      if (initialData) {
        await updateMenu(initialData.id, payload);
      } else {
        await createMenu(payload);
      }
      onSuccess();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6">
      <h3 className="text-lg font-semibold text-slate-800 mb-4">
        {isEditing ? 'Editar menú' : 'Nuevo menú'}
      </h3>

      <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="md:col-span-2">
          <label htmlFor="mf-name" className="block text-sm font-medium text-slate-700 mb-1">
            Nombre *
          </label>
          <input
            id="mf-name"
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <div className="md:col-span-2 flex items-center gap-2">
          <input
            id="mf-allday"
            type="checkbox"
            checked={allDay}
            onChange={e => setAllDay(e.target.checked)}
            className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500"
          />
          <label htmlFor="mf-allday" className="text-sm font-medium text-slate-700">
            Disponible en todo el horario
          </label>
        </div>

        {!allDay && (
          <>
            <div>
              <label htmlFor="mf-start" className="block text-sm font-medium text-slate-700 mb-1">
                Hora inicio
              </label>
              <input
                id="mf-start"
                type="time"
                value={startTime}
                onChange={e => setStartTime(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label htmlFor="mf-end" className="block text-sm font-medium text-slate-700 mb-1">
                Hora fin
              </label>
              <input
                id="mf-end"
                type="time"
                value={endTime}
                onChange={e => setEndTime(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </>
        )}

        <div className="md:col-span-2">
          <p className="text-sm font-medium text-slate-700 mb-2">Días de la semana</p>
          <div className="flex flex-wrap gap-3">
            {DAY_OPTIONS.map(({ value, label }) => (
              <label key={value} className="flex items-center gap-1.5 text-sm text-slate-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedDays.includes(value)}
                  onChange={() => toggleDay(value)}
                  className="w-4 h-4 text-indigo-600 rounded border-slate-300"
                />
                {label}
              </label>
            ))}
          </div>
        </div>

        <div className="md:col-span-2 flex items-center gap-2">
          <input
            id="mf-active"
            type="checkbox"
            checked={active}
            onChange={e => setActive(e.target.checked)}
            className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500"
          />
          <label htmlFor="mf-active" className="text-sm font-medium text-slate-700">
            Menú activo
          </label>
        </div>

        <div className="md:col-span-2 flex gap-2">
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Guardando...' : 'Guardar'}
          </Button>
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancelar
          </Button>
        </div>

        {error && (
          <p className="md:col-span-2 text-sm text-red-600">{error}</p>
        )}
      </form>
    </div>
  );
}
