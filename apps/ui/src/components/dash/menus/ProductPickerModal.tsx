import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Button from '../../commons/Button';
import { apiFetch } from '../../../lib/api';
import { bulkCreateMenuItems } from '../../../lib/menus-api';

interface SimpleProduct {
  id: string;
  name: string;
  price: number;
}

interface ProductPickerModalProps {
  menuId: string;
  sectionName: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ProductPickerModal({
  menuId,
  sectionName,
  onConfirm,
  onCancel,
}: ProductPickerModalProps) {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data, isLoading } = useQuery<{ data: SimpleProduct[] }>({
    queryKey: ['/v1/products', 'picker'],
    queryFn: async () => {
      const res = await apiFetch('/v1/products?limit=100');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
  });

  const products = data?.data ?? [];
  const filtered = products.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()),
  );

  const toggleProduct = (id: string) => {
    setSelected(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id],
    );
  };

  const handleConfirm = async () => {
    if (selected.length === 0) return;
    setIsSubmitting(true);
    try {
      await bulkCreateMenuItems(menuId, { productIds: selected, sectionName });
      onConfirm();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-indigo-200 p-6 shadow-lg">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold text-slate-800">
          Agregar productos a:{' '}
          <span className="text-indigo-600">{sectionName}</span>
        </h3>
        <button
          type="button"
          onClick={onCancel}
          className="text-slate-400 hover:text-slate-600 bg-transparent border-none cursor-pointer text-xl leading-none"
          aria-label="Cerrar"
        >
          &times;
        </button>
      </div>

      <div className="mb-3">
        <input
          type="text"
          placeholder="Buscar producto..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>

      <div className="max-h-64 overflow-y-auto space-y-1 mb-4 border border-slate-100 rounded-lg p-2">
        {isLoading && (
          <div className="text-center py-4 text-slate-400 text-sm">Cargando productos...</div>
        )}
        {!isLoading && filtered.length === 0 && (
          <div className="text-center py-4 text-slate-400 text-sm">No hay productos</div>
        )}
        {filtered.map(p => (
          <label
            key={p.id}
            className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-50 cursor-pointer"
          >
            <input
              type="checkbox"
              checked={selected.includes(p.id)}
              onChange={() => toggleProduct(p.id)}
              className="w-4 h-4 text-indigo-600 rounded border-slate-300"
            />
            <span className="flex-1 text-sm text-slate-800">{p.name}</span>
            <span className="text-xs text-slate-400">${Number(p.price).toFixed(2)}</span>
          </label>
        ))}
      </div>

      <div className="flex justify-between items-center">
        <span className="text-sm text-slate-500">
          {selected.length} seleccionado{selected.length !== 1 ? 's' : ''}
        </span>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={onCancel}>
            Cancelar
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={selected.length === 0 || isSubmitting}
          >
            {isSubmitting ? 'Agregando...' : 'Agregar seleccionados'}
          </Button>
        </div>
      </div>
    </div>
  );
}
