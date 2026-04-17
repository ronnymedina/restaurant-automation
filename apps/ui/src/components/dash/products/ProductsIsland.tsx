import { useState } from 'react';
import { useQuery, useQueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { queryClient } from '../../commons/Providers';
import TableWithFetch from '../../commons/TableWithFetch';
import Button from '../../commons/Button';
import ProductForm from './ProductForm';
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

  const { data: categories = [] } = useQuery({
    queryKey: [CATEGORIES_QUERY_KEY, 'all'],
    queryFn: fetchCategories,
  });

  const handleNew = () => {
    setEditingProduct(null);
    setShowForm(true);
  };

  const handleEdit = (product: Product) => {
    setEditingProduct(product);
    setShowForm(true);
  };

  const handleSuccess = () => {
    setShowForm(false);
    setEditingProduct(null);
    qc.invalidateQueries({ queryKey: [PRODUCTS_QUERY_KEY] });
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditingProduct(null);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar este producto?')) return;
    try {
      await deleteProduct(id);
      qc.invalidateQueries({ queryKey: [PRODUCTS_QUERY_KEY] });
    } catch {
      alert('Error al eliminar el producto');
    }
  };

  const columns: ColumnDef<Product>[] = [
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
        <div className="flex gap-2 justify-end">
          <Button variant="secondary" size="sm" onClick={() => handleEdit(row.original)}>
            Editar
          </Button>
          <Button variant="danger" size="sm" onClick={() => handleDelete(row.original.id)}>
            Eliminar
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-slate-800">Productos</h2>
        {!showForm && (
          <Button onClick={handleNew}>Nuevo producto</Button>
        )}
      </div>

      {showForm && (
        <ProductForm
          initialData={editingProduct ?? undefined}
          categories={categories}
          onSuccess={handleSuccess}
          onCancel={handleCancel}
        />
      )}

      <TableWithFetch<Product>
        url={PRODUCTS_QUERY_KEY}
        columns={columns}
        params={{ limit: '50' }}
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
