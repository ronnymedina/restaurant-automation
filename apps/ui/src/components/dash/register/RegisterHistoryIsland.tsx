import { useState, useEffect, useCallback, useMemo } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';

import Table from '../../commons/Table';
import Modal from '../../commons/Modal';
import IconButton from '../../commons/icons/IconButton';
import ShiftSummaryView from '../../commons/ShiftSummaryView';
import { queryClient } from '../../commons/Providers';
import {
  getSessionHistory,
  getSessionDetail,
  type CashShiftDto,
  type SessionDetail,
} from './api';

export default function RegisterHistoryIsland() {
  const [sessions, setSessions] = useState<CashShiftDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [listError, setListError] = useState('');

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const [detailError, setDetailError] = useState('');

  const loadHistory = useCallback(async (p: number) => {
    setIsLoading(true);
    setListError('');
    const result = await getSessionHistory(p);
    setIsLoading(false);
    if (!result.ok) {
      setListError(
        result.httpStatus === 403
          ? 'No tienes permisos para acceder a esta sección'
          : 'Error al cargar el historial',
      );
      return;
    }
    setSessions(result.data.data);
    setTotalPages(result.data.meta.totalPages);
    setPage(p);
  }, []);

  useEffect(() => {
    loadHistory(1);
  }, [loadHistory]);

  async function openDetail(sessionId: string) {
    setDetail(null);
    setDetailError('');
    setDetailLoading(true);
    setDetailOpen(true);
    const detailResult = await getSessionDetail(sessionId);
    setDetailLoading(false);
    if (!detailResult.ok) {
      setDetailError('Error al cargar el detalle');
      return;
    }
    setDetail(detailResult.data);
  }

  const columns = useMemo<ColumnDef<CashShiftDto>[]>(
    () => [
      {
        accessorKey: 'displayOpenedAt',
        header: 'Fecha apertura',
        cell: ({ getValue }) => (
          <span className="whitespace-nowrap">{getValue<string>()}</span>
        ),
      },
      {
        accessorKey: 'displayClosedAt',
        header: 'Fecha cierre',
        cell: ({ getValue }) => (
          <span className="whitespace-nowrap">{getValue<string | null>() ?? '—'}</span>
        ),
      },
      {
        id: 'status',
        header: 'Estado',
        cell: ({ row }) => {
          const isOpen = row.original.status === 'OPEN';
          return (
            <span
              className={`px-2 py-0.5 text-xs rounded-full ${isOpen ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-700'}`}
            >
              {isOpen ? 'Abierta' : 'Cerrada'}
            </span>
          );
        },
      },
      {
        id: 'orders',
        header: 'Pedidos',
        cell: ({ row }) => row.original._count?.orders ?? 0,
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) => (
          <IconButton
            icon="eye"
            label="Ver detalle"
            variant="primary"
            onClick={() => openDetail(row.original.id)}
          />
        ),
      },
    ],
    [],
  );

  function renderDetailContent() {
    if (detailLoading) {
      return <p className="text-center text-slate-400 py-8">Cargando...</p>;
    }
    if (detailError) {
      return <p className="text-center text-red-400">{detailError}</p>;
    }
    if (!detail) return null;
    return <ShiftSummaryView session={detail.session} summary={detail.summary} />;
  }

  return (
    <QueryClientProvider client={queryClient}>
    <div className="space-y-6">
      <h2 className="text-lg font-bold text-slate-800">Historial de Caja</h2>

      {listError ? (
        <p className="text-red-400 text-center">{listError}</p>
      ) : (
        <Table
          columns={columns}
          data={sessions}
          isLoading={isLoading}
          emptyMessage="No hay sesiones de caja"
          pagination={totalPages > 1 ? { page, totalPages, onPageChange: loadHistory } : undefined}
        />
      )}

      <Modal
        open={detailOpen}
        title="Detalle de Sesión"
        onClose={() => setDetailOpen(false)}
        size="2xl"
      >
        {renderDetailContent()}
      </Modal>
    </div>
    </QueryClientProvider>
  );
}
