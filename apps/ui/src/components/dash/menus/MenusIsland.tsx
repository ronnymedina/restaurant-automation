import { useState, useMemo, useCallback } from 'react';
import { useQueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { queryClient } from '../../commons/Providers';
import TableWithFetch from '../../commons/TableWithFetch';
import Button from '../../commons/Button';
import IconButton from '../../commons/IconButton';
import MenuForm from './MenuForm';
import { deleteMenu, MENUS_QUERY_KEY } from '../../../lib/menus-api';
import type { Menu } from '../../../lib/menus-api';

const DAY_LABELS: Record<string, string> = {
  MON: 'Lun', TUE: 'Mar', WED: 'Mié', THU: 'Jue', FRI: 'Vie', SAT: 'Sáb', SUN: 'Dom',
};

function formatSchedule(start: string | null, end: string | null): string {
  if (!start && !end) return '-';
  return `${start ?? '?'} - ${end ?? '?'}`;
}

function formatDays(days: string | null): string {
  if (!days) return '-';
  return days.split(',').map(d => DAY_LABELS[d] ?? d).join(', ');
}

function MenusContent() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingMenu, setEditingMenu] = useState<Menu | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleNew = () => {
    setEditingMenu(null);
    setShowForm(true);
  };

  const handleEdit = useCallback((menu: Menu) => {
    setEditingMenu(menu);
    setShowForm(true);
  }, []);

  const handleSuccess = () => {
    setShowForm(false);
    setEditingMenu(null);
    qc.invalidateQueries({ queryKey: [MENUS_QUERY_KEY] });
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditingMenu(null);
  };

  const handleDelete = useCallback(async (id: string) => {
    setDeleteError(null);
    if (!confirm('¿Eliminar este menú y todos sus items?')) return;
    try {
      await deleteMenu(id);
      qc.invalidateQueries({ queryKey: [MENUS_QUERY_KEY] });
    } catch {
      setDeleteError('Error al eliminar el menú');
    }
  }, [qc]);

  const columns = useMemo<ColumnDef<Menu>[]>(() => [
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
      id: 'schedule',
      header: 'Horario',
      cell: ({ row }) => (
        <span className="whitespace-nowrap text-slate-600">
          {formatSchedule(row.original.startTime, row.original.endTime)}
        </span>
      ),
    },
    {
      id: 'days',
      header: 'Días',
      cell: ({ row }) => (
        <span className="text-xs text-slate-600">{formatDays(row.original.daysOfWeek)}</span>
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
            icon="list-bullet"
            label="Ver items"
            variant="primary"
            onClick={() => { window.location.href = `/dash/menus/detail?id=${row.original.id}`; }}
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
        <h2 className="text-2xl font-bold text-slate-800">Menús</h2>
        {!showForm && (
          <Button onClick={handleNew}>Nuevo menú</Button>
        )}
      </div>

      {deleteError && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2">
          {deleteError}
        </p>
      )}

      {showForm && (
        <MenuForm
          initialData={editingMenu ?? undefined}
          onSuccess={handleSuccess}
          onCancel={handleCancel}
        />
      )}

      <TableWithFetch<Menu>
        url={MENUS_QUERY_KEY}
        columns={columns}
        params={{ limit: '50' }}
        emptyMessage="No hay menús"
      />
    </div>
  );
}

export default function MenusIsland() {
  return (
    <QueryClientProvider client={queryClient}>
      <MenusContent />
    </QueryClientProvider>
  );
}
