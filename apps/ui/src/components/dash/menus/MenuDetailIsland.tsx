import { useState, useCallback } from 'react';
import { useQuery, useQueryClient, QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '../../commons/Providers';
import Button from '../../commons/Button';
import MenuItemsSection from './MenuItemsSection';
import ProductPickerModal from './ProductPickerModal';
import { fetchMenuById, MENUS_QUERY_KEY } from '../../../lib/menus-api';
import type { MenuItem } from '../../../lib/menus-api';

const DAY_LABELS: Record<string, string> = {
  MON: 'Lun', TUE: 'Mar', WED: 'Mié', THU: 'Jue', FRI: 'Vie', SAT: 'Sáb', SUN: 'Dom',
};

function groupBySection(items: MenuItem[]): Record<string, MenuItem[]> {
  return items.reduce<Record<string, MenuItem[]>>((acc, item) => {
    const key = item.sectionName ?? 'Sin sección';
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});
}

function MenuDetailContent() {
  const menuId = new URLSearchParams(window.location.search).get('id') ?? '';
  const qc = useQueryClient();

  const [showSectionForm, setShowSectionForm] = useState(false);
  const [sectionNameInput, setSectionNameInput] = useState('');
  const [pickerSection, setPickerSection] = useState<string | null>(null);

  const { data: menu, isLoading, isError } = useQuery({
    queryKey: [MENUS_QUERY_KEY, menuId],
    queryFn: () => fetchMenuById(menuId),
    enabled: !!menuId,
  });

  const handleRefresh = useCallback(() => {
    qc.invalidateQueries({ queryKey: [MENUS_QUERY_KEY, menuId] });
  }, [qc, menuId]);

  const handleSectionSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const name = sectionNameInput.trim();
    if (!name) return;
    setShowSectionForm(false);
    setSectionNameInput('');
    setPickerSection(name);
  };

  const handlePickerConfirm = () => {
    setPickerSection(null);
    handleRefresh();
  };

  if (!menuId) {
    return <p className="text-red-600">ID de menú no especificado.</p>;
  }

  if (isLoading) {
    return <p className="text-slate-400 py-8">Cargando...</p>;
  }

  if (isError || !menu) {
    return <p className="text-red-600">Error al cargar el menú. Verifica el ID.</p>;
  }

  const scheduleParts: string[] = [];
  if (menu.startTime || menu.endTime) {
    scheduleParts.push(`${menu.startTime ?? '?'} - ${menu.endTime ?? '?'}`);
  }
  if (menu.daysOfWeek) {
    scheduleParts.push(
      menu.daysOfWeek.split(',').map(d => DAY_LABELS[d] ?? d).join(', '),
    );
  }

  const sections = groupBySection(menu.items);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <a href="/dash/menus" className="text-sm text-indigo-600 hover:text-indigo-800">
            &larr; Volver a menús
          </a>
          <h2 className="text-2xl font-bold text-slate-800 mt-1">{menu.name}</h2>
          {scheduleParts.length > 0 && (
            <p className="text-sm text-slate-500 mt-0.5">{scheduleParts.join(' | ')}</p>
          )}
          <span
            className={`inline-block mt-1 px-2 py-0.5 text-xs rounded-full ${
              menu.active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
            }`}
          >
            {menu.active ? 'Activo' : 'Inactivo'}
          </span>
        </div>

        {!showSectionForm && !pickerSection && (
          <Button onClick={() => setShowSectionForm(true)}>+ Nueva sección</Button>
        )}
      </div>

      {showSectionForm && (
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h3 className="text-lg font-semibold text-slate-800 mb-4">Nueva sección</h3>
          <form onSubmit={handleSectionSubmit} className="flex gap-4 items-end">
            <div className="flex-1">
              <label
                htmlFor="md-section-name"
                className="block text-sm font-medium text-slate-700 mb-1"
              >
                Nombre de la sección *
              </label>
              <input
                id="md-section-name"
                type="text"
                value={sectionNameInput}
                onChange={e => setSectionNameInput(e.target.value)}
                placeholder="Ej: Carnes, Entradas, Bebidas"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                autoFocus
              />
            </div>
            <Button type="submit">Crear y agregar productos</Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => { setShowSectionForm(false); setSectionNameInput(''); }}
            >
              Cancelar
            </Button>
          </form>
        </div>
      )}

      {pickerSection && (
        <ProductPickerModal
          menuId={menuId}
          sectionName={pickerSection}
          onConfirm={handlePickerConfirm}
          onCancel={() => setPickerSection(null)}
        />
      )}

      {menu.items.length === 0 && (
        <div className="bg-white rounded-xl border border-dashed border-slate-300 p-8 text-center text-slate-400">
          No hay secciones aún. Crea una con el botón de arriba.
        </div>
      )}

      {Object.entries(sections).map(([sectionName, items]) => (
        <MenuItemsSection
          key={sectionName}
          menuId={menuId}
          sectionName={sectionName}
          items={items}
          onAddProducts={() => setPickerSection(sectionName)}
          onRefresh={handleRefresh}
        />
      ))}
    </div>
  );
}

export default function MenuDetailIsland() {
  return (
    <QueryClientProvider client={queryClient}>
      <MenuDetailContent />
    </QueryClientProvider>
  );
}
