import { useState, useMemo, useCallback } from 'react';
import { useQuery, useQueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { queryClient } from '../../commons/Providers';
import TableWithFetch from '../../commons/TableWithFetch';
import Button from '../../commons/Button';
import IconButton from '../../commons/IconButton';
import ProductForm from './ProductForm';
import { useDebounce } from '../../../hooks/useDebounce';
import {
  fetchCategories,
  deleteProduct,
  PRODUCTS_QUERY_KEY,
  CATEGORIES_QUERY_KEY,
} from '../../../lib/products-api';
import type { Product } from '../../../lib/products-api';

function ProductsContent() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);

  const { data: categories = [] } = useQuery({
    queryKey: [CATEGORIES_QUERY_KEY, 'all'],
    queryFn: fetchCategories,
  });

  const handleNew = () => {
    setEditingProduct(null);
    setShowForm(true);
  };

  const handleEdit = useCallback((product: Product) => {
    setEditingProduct(product);
    setShowForm(true);
  }, []);

  const handleSuccess = () => {
    setShowForm(false);
    setEditingProduct(null);
    qc.invalidateQueries({ queryKey: [PRODUCTS_QUERY_KEY] });
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditingProduct(null);
  };

  const handleDelete = useCallback(async (id: string) => {
    setDeleteError(null);
    if (!confirm('¿Eliminar este producto?')) return;
    try {
      await deleteProduct(id);
      qc.invalidateQueries({ queryKey: [PRODUCTS_QUERY_KEY] });
    } catch {
      setDeleteError('Error al eliminar el producto');
    }
  }, [qc]);

  const columns = useMemo<ColumnDef<Product>[]>(() => [
    {
      accessorKey: 'name',
      header: 'Nombre',
      cell: ({ getValue }) => (
        <span className="font-medium text-slate-800 max-w-[200px] truncate block">
          {getValue<string>()}
        </span>
      ),
    },
    {
      accessorKey: 'price',
      header: 'Precio',
      cell: ({ getValue }) => (
        <span className="whitespace-nowrap">${Number(getValue<number>()).toFixed(2)}</span>
      ),
    },
    {
      accessorKey: 'stock',
      header: 'Stock',
      cell: ({ getValue }) => {
        const v = getValue<number | null>();
        return <span className="whitespace-nowrap">{v === null || v === undefined ? '∞' : v}</span>;
      },
    },
    {
      id: 'category',
      header: 'Categoría',
      cell: ({ row }) => (
        <span className="max-w-[160px] truncate block">{row.original.category?.name ?? '-'}</span>
      ),
    },
    {
      accessorKey: 'active',
      header: 'Activo',
      cell: ({ getValue }) => {
        const active = getValue<boolean>();
        return (
          <span
            className={`px-2 py-0.5 text-xs rounded-full whitespace-nowrap ${
              active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
            }`}
          >
            {active ? 'Sí' : 'No'}
          </span>
        );
      },
    },
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
  ], [handleEdit, handleDelete]);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-slate-800">Productos</h2>
        {!showForm && (
          <Button onClick={handleNew}>Nuevo producto</Button>
        )}
      </div>

      {deleteError && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2">
          {deleteError}
        </p>
      )}

      {showForm && (
        <ProductForm
          initialData={editingProduct ?? undefined}
          categories={categories}
          onSuccess={handleSuccess}
          onCancel={handleCancel}
        />
      )}

      <input
        type="search"
        placeholder="Buscar por nombre o SKU..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="w-full max-w-sm rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
      />

      <TableWithFetch<Product>
        key={debouncedSearch}
        url={PRODUCTS_QUERY_KEY}
        columns={columns}
        params={{
          limit: debouncedSearch ? '5' : '50',
          ...(debouncedSearch ? { search: debouncedSearch } : {}),
        }}
        emptyMessage="No hay productos"
      />
    </div>
  );
}

export default function ProductsIsland() {
  return (
    <QueryClientProvider client={queryClient}>
      <ProductsContent />
    </QueryClientProvider>
  );
}
