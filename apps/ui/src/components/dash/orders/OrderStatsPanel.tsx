import { useState, useEffect, useCallback, useImperativeHandle, forwardRef } from 'react';
import { getLiveStats } from '../register/api';
import type { ShiftSummary } from '../register/api';

export interface OrderStatsPanelHandle {
  refresh: () => void;
}

function formatCurrency(value: number): string {
  return `$${Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatLastUpdated(date: Date | null): string {
  if (!date) return '';
  const diffMin = Math.floor((Date.now() - date.getTime()) / 60000);
  return diffMin < 1 ? 'Ahora' : `Hace ${diffMin} min`;
}

const OrderStatsPanel = forwardRef<OrderStatsPanelHandle>(function OrderStatsPanel(_, ref) {
  const [stats, setStats] = useState<ShiftSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await getLiveStats();
    setLoading(false);
    if (!result.ok) {
      setError('No se pudo actualizar');
      return;
    }
    setStats(result.data.summary);
    setLastUpdated(new Date());
  }, []);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  useImperativeHandle(ref, () => ({ refresh: fetchStats }), [fetchStats]);

  const maxQty = stats?.topProducts[0]?.quantity ?? 1;

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
          Estadísticas en vivo
        </span>
        <div className="flex items-center gap-3">
          {lastUpdated && !loading && (
            <span className="flex items-center gap-1.5 text-xs text-slate-400">
              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full inline-block" />
              {formatLastUpdated(lastUpdated)}
            </span>
          )}
          {error && <span className="text-xs text-red-400">{error}</span>}
          <button
            type="button"
            aria-label="Actualizar"
            onClick={fetchStats}
            disabled={loading}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-slate-200 bg-white text-slate-600 text-xs font-medium hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            <span className={loading ? 'animate-spin inline-block' : 'inline-block'}>↻</span>
            {loading ? 'Actualizando...' : 'Actualizar'}
          </button>
        </div>
      </div>

      <div className="grid gap-3 items-stretch" style={{ gridTemplateColumns: '1fr 1.6fr' }}>
        {/* KPI tiles — 2×2 grid */}
        <div className="grid grid-cols-2 grid-rows-2 gap-2">
          {loading ? (
            <>
              <div className="bg-slate-100 rounded-xl h-[72px] animate-pulse" />
              <div className="bg-slate-100 rounded-xl h-[72px] animate-pulse" />
              <div className="bg-slate-100 rounded-xl h-[72px] animate-pulse" />
              <div className="bg-slate-100 rounded-xl h-[72px] animate-pulse" />
            </>
          ) : (
            <>
              <div className="bg-emerald-50 rounded-xl p-3 flex flex-col items-center justify-center">
                <p className="text-xl font-bold text-emerald-600 leading-none">
                  {formatCurrency(stats?.revenue.completed ?? 0)}
                </p>
                <p className="text-[10px] text-slate-500 mt-1">Ingresos</p>
              </div>
              <div className="bg-amber-50 rounded-xl p-3 flex flex-col items-center justify-center">
                <p className="text-xl font-bold text-amber-600 leading-none">
                  {formatCurrency(stats?.revenue.pending ?? 0)}
                </p>
                <p className="text-[10px] text-slate-500 mt-1">Pendiente cobro</p>
              </div>
              <div className="bg-blue-50 rounded-xl p-3 flex flex-col items-center justify-center">
                <p className="text-xl font-bold text-blue-600 leading-none">
                  {stats?.counts.total ?? 0}
                </p>
                <p className="text-[10px] text-slate-500 mt-1">Total pedidos</p>
              </div>
              <div className="bg-sky-50 rounded-xl p-3 flex flex-col items-center justify-center">
                <p className="text-xl font-bold text-sky-600 leading-none">
                  {formatCurrency(stats?.revenue.averageTicket ?? 0)}
                </p>
                <p className="text-[10px] text-slate-500 mt-1">Ticket promedio</p>
              </div>
            </>
          )}
        </div>

        {/* Top products — horizontal bar chart */}
        <div className="bg-slate-50 rounded-xl p-3 border border-slate-100 flex flex-col">
          <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-2.5">
            Top productos
          </p>
          {loading ? (
            <div className="flex-1 flex flex-col gap-3 justify-evenly">
              {[80, 65, 50, 40, 30].map((w, i) => (
                <div key={i} className="space-y-1.5">
                  <div className="h-2.5 bg-slate-200 rounded animate-pulse" style={{ width: `${w}%` }} />
                  <div className="h-2 bg-slate-100 rounded animate-pulse w-full" />
                </div>
              ))}
            </div>
          ) : stats?.topProducts.length ? (
            <div className="flex-1 flex flex-col gap-3 justify-evenly">
              {stats.topProducts.slice(0, 5).map((p) => (
                <div key={p.id}>
                  <div className="flex justify-between text-xs text-slate-700 mb-1">
                    <span className="truncate pr-2">{p.name}</span>
                    <span className="font-semibold text-slate-800 shrink-0">{p.quantity} uds.</span>
                  </div>
                  <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                    <div
                      className="h-2 rounded-full bg-gradient-to-r from-blue-500 to-blue-400"
                      style={{ width: `${Math.round((p.quantity / maxQty) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-400 flex-1 flex items-center justify-center">
              Sin datos aún
            </p>
          )}
        </div>
      </div>
    </div>
  );
});

export default OrderStatsPanel;
