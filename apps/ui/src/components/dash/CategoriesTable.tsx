import { useState } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { queryClient } from '../commons/Providers';
import TableWithFetch from '../commons/TableWithFetch';
import Button from '../commons/Button';
import IconButton from '../commons/icons/IconButton';
import { apiFetch } from '../../lib/api';

interface Category {
  id: number;
  name: string;
}

export default function CategoriesTable() {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formName, setFormName] = useState('');
  const [error, setError] = useState('');

  const resetForm = () => {
    setShowForm(false);
    setEditingId(null);
    setFormName('');
    setError('');
  };

  const handleEdit = (category: Category) => {
    setEditingId(category.id);
    setFormName(category.name);
    setShowForm(true);
  };

  const handleDelete = async (id: number) => {
    if (!confirm('¿Eliminar esta categoría?')) return;
    try {
      const res = await apiFetch(`/v1/categories/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      queryClient.invalidateQueries({ queryKey: ['/v1/categories'] });
    } catch {
      alert('Error al eliminar la categoría');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      setError('El nombre es requerido');
      return;
    }
    try {
      const res = editingId
        ? await apiFetch(`/v1/categories/${editingId}`, {
          method: 'PATCH',
          body: JSON.stringify({ name: formName }),
        })
        : await apiFetch('/v1/categories', {
          method: 'POST',
          body: JSON.stringify({ name: formName }),
        });
      if (!res.ok) throw new Error();
      queryClient.invalidateQueries({ queryKey: ['/v1/categories'] });
      resetForm();
    } catch {
      setError('Error al guardar la categoría');
    }
  };

  const columns: ColumnDef<Category>[] = [
    { accessorKey: 'name', header: 'Nombre' },
    {
      id: 'actions',
      header: 'Acciones',
      cell: ({ row }) => (
        <div className="flex gap-1 justify-end">
          <IconButton
            icon="pencil"
            label="Editar"
            variant="primary"
            onClick={() => handleEdit(row.original)}
          />
          <IconButton
            icon="trash"
            label="Eliminar"
            variant="danger"
            onClick={() => handleDelete(row.original.id)}
          />
        </div>
      ),
    },
  ];

  return (
    <QueryClientProvider client={queryClient}>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h2 className="text-2xl font-bold text-slate-800">Categorías</h2>
          <Button
            onClick={() => {
              if (showForm) resetForm();
              else setShowForm(true);
            }}
          >
            {showForm ? 'Cancelar' : 'Nueva categoría'}
          </Button>
        </div>

        {showForm && (
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <h3 className="text-lg font-semibold text-slate-800 mb-4">
              {editingId ? 'Editar categoría' : 'Nueva categoría'}
            </h3>
            <form onSubmit={handleSubmit} className="flex gap-4 items-end">
              <div className="flex-1">
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Nombre *
                </label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="Nombre de la categoría"
                />
              </div>
              <Button type="submit">Guardar</Button>
              <Button type="button" variant="secondary" onClick={resetForm}>
                Cancelar
              </Button>
            </form>
            {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
          </div>
        )}

        <TableWithFetch<Category>
          url="/v1/categories"
          columns={columns}
          params={{ limit: '20' }}
          emptyMessage="No hay categorías"
        />
      </div>
    </QueryClientProvider>
  );
}
