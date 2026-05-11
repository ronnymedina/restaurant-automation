import { useState, useEffect, useCallback, useMemo } from 'react';
import type { ColumnDef } from '@tanstack/react-table';

import Table from '../../commons/Table';
import Modal from '../../commons/Modal';
import IconButton from '../../commons/icons/IconButton';
import { getRestaurantTimezone } from '../../../lib/auth';
import { formatDate } from '../../../lib/date';
import {
  getSessionHistory,
  getSessionDetail,
  type CashShiftDto,
  type SessionDetail,
} from './api';

const PAYMENT_LABELS: Record<string, string> = {
  CASH: 'Efectivo',
  CARD: 'Tarjeta',
  DIGITAL_WALLET: 'Billetera digital',
  SIN_METODO: 'Sin método de pago',
};

function formatCurrency(value: number | null | undefined): string {
  if (value == null) return '$0.00';
  return `$${Number(value).toFixed(2)}`;
}

export default function RegisterHistoryIsland() {
  const [timezone, setTimezone] = useState('UTC');

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
    setTimezone(getRestaurantTimezone());
    loadHistory(1);
  }, [loadHistory]);

  async function openDetail(sessionId: string) {
    setDetail(null);
    setDetailError('');
    setDetailLoading(true);
    setDetailOpen(true);
    const result = await getSessionDetail(sessionId);
    setDetailLoading(false);
    if (!result.ok) {
      setDetailError('Error al cargar el detalle');
      return;
    }
    setDetail(result.data);
  }

  const columns = useMemo<ColumnDef<CashShiftDto>[]>(
    () => [
      {
        accessorKey: 'openedAt',
        header: 'Fecha apertura',
        cell: ({ getValue }) => (
          <span className="whitespace-nowrap">{formatDate(getValue<string>(), timezone)}</span>
        ),
      },
      {
        accessorKey: 'closedAt',
        header: 'Fecha cierre',
        cell: ({ getValue }) => (
          <span className="whitespace-nowrap">{formatDate(getValue<string | null>(), timezone)}</span>
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
        cell: ({ row }) => row.original._count?.orders ?? row.original.totalOrders ?? 0,
      },
      {
        accessorKey: 'totalSales',
        header: () => <span className="block text-right">Total ventas</span>,
        cell: ({ getValue }) => (
          <span className="block text-right font-medium">
            {formatCurrency(getValue<number | null>())}
          </span>
        ),
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
    [timezone],
  );

  function renderDetailContent() {
    if (detailLoading) {
      return <p className="text-center text-slate-400 py-8">Cargando...</p>;
    }
    if (detailError) {
      return <p className="text-center text-red-400">{detailError}</p>;
    }
    if (!detail) return null;

    const { session, summary } = detail;

    return (
      <div className="space-y-5">
        <div className="text-sm text-slate-500 space-y-0.5">
          <p>
            Apertura:{' '}
            <span className="text-slate-700 font-medium">{formatDate(session.openedAt, timezone)}</span>
          </p>
          <p>
            Cierre:{' '}
            <span className="text-slate-700 font-medium">{formatDate(session.closedAt, timezone)}</span>
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="bg-emerald-50 rounded-lg p-4 text-center">
            <p className="text-lg font-bold text-emerald-700">{formatCurrency(summary.totalSales)}</p>
            <p className="text-xs text-emerald-600 mt-1">Total ventas</p>
          </div>
          <div className="bg-slate-50 rounded-lg p-4 text-center">
            <p className="text-lg font-bold text-slate-800">{summary.totalOrders}</p>
            <p className="text-xs text-slate-500 mt-1">Total pedidos</p>
          </div>
          <div className="bg-blue-50 rounded-lg p-4 text-center">
            <p className="text-lg font-bold text-blue-700">{summary.completedOrders ?? '—'}</p>
            <p className="text-xs text-blue-600 mt-1">Completados</p>
          </div>
          <div className="bg-red-50 rounded-lg p-4 text-center">
            <p className="text-lg font-bold text-red-600">{summary.cancelledOrders ?? '—'}</p>
            <p className="text-xs text-red-500 mt-1">Cancelados</p>
          </div>
        </div>

        <div>
          <h4 className="font-semibold text-slate-700 mb-2">Desglose por método de pago</h4>
          <div className="bg-slate-50 rounded-lg px-4 py-2">
            {Object.entries(summary.paymentBreakdown).length === 0 ? (
              <p className="text-slate-400 text-sm py-1">Sin pedidos</p>
            ) : (
              Object.entries(summary.paymentBreakdown).map(([method, info]) => (
                <div
                  key={method}
                  className="flex justify-between items-center py-1.5 border-b border-slate-100 last:border-0"
                >
                  <span className="text-slate-600">{PAYMENT_LABELS[method] ?? method}</span>
                  <span className="text-slate-800 font-medium">
                    {info.count} pedidos &mdash; {formatCurrency(info.total)}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        <div>
          <h4 className="font-semibold text-slate-700 mb-2">Platillos más vendidos</h4>
          <div className="bg-slate-50 rounded-lg px-4 py-2">
            {summary.topProducts.length === 0 ? (
              <p className="text-slate-400 text-sm py-1">Sin datos de productos</p>
            ) : (
              summary.topProducts.map((p, i) => (
                <div
                  key={p.id}
                  className="flex items-center gap-3 py-1.5 border-b border-slate-100 last:border-0"
                >
                  <span className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center justify-center flex-shrink-0">
                    {i + 1}
                  </span>
                  <span className="flex-1 text-slate-700">{p.name}</span>
                  <span className="text-slate-500 text-sm">{p.quantity} uds.</span>
                  <span className="text-slate-800 font-medium ml-4">{formatCurrency(p.total)}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
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
  );
}
