interface SessionLike {
  displayOpenedAt: string;
  displayClosedAt: string | null;
}

interface ShiftCountsLike {
  total: number;
  pending: number;
  created: number;
  confirmed: number;
  processing: number;
  served: number;
  completed: number;
  cancelled: number;
}

interface ShiftRevenueLike {
  completed: number;
  pending: number;
  averageTicket: number;
}

interface PaymentBreakdownItemLike {
  method: string;
  count: number;
  total: number;
}

interface OrderTypeBreakdownItemLike {
  type: string;
  count: number;
}

interface OrderSourceBreakdownItemLike {
  source: string;
  count: number;
}

interface TopProductLike {
  id: string;
  name: string;
  quantity: number;
  total: number;
}

export interface ShiftSummaryLike {
  counts: ShiftCountsLike;
  revenue: ShiftRevenueLike;
  byPaymentMethod: PaymentBreakdownItemLike[];
  byOrderType: OrderTypeBreakdownItemLike[];
  byOrderSource: OrderSourceBreakdownItemLike[];
  topProducts: TopProductLike[];
}

const PAYMENT_LABELS: Record<string, string> = {
  CASH: 'Efectivo',
  CARD: 'Tarjeta',
  DIGITAL_WALLET: 'Billetera digital',
  SIN_METODO: 'Sin método de pago',
};

const ORDER_TYPE_LABELS: Record<string, string> = {
  DINE_IN: 'En mesa',
  PICKUP: 'Para retirar',
  DELIVERY: 'Delivery',
  UNKNOWN: 'Sin tipo',
};

const ORDER_SOURCE_LABELS: Record<string, string> = {
  KIOSK: 'Kiosko',
  WEB: 'Web',
  STAFF: 'Personal',
  UNKNOWN: 'Sin origen',
};

const STATUS_LABELS: Record<string, string> = {
  created: 'Creados',
  confirmed: 'Confirmados',
  processing: 'En preparación',
  served: 'Servidos',
};

function formatCurrency(value: number | null | undefined): string {
  if (value == null) return '$0.00';
  return `$${Number(value).toFixed(2)}`;
}

interface StatTileProps {
  label: string;
  value: string | number;
  tone?: 'default' | 'info' | 'success' | 'warning' | 'danger';
}

function StatTile({ label, value, tone = 'default' }: StatTileProps) {
  const tones = {
    default: 'bg-slate-50 text-slate-700',
    info: 'bg-blue-50 text-blue-700',
    success: 'bg-emerald-50 text-emerald-700',
    warning: 'bg-amber-50 text-amber-700',
    danger: 'bg-red-50 text-red-600',
  } as const;
  return (
    <div className={`${tones[tone]} rounded-lg p-3 text-center`}>
      <p className="text-lg font-bold leading-tight">{value}</p>
      <p className="text-xs mt-1 opacity-80">{label}</p>
    </div>
  );
}

interface BreakdownRowProps {
  label: string;
  right: React.ReactNode;
}

function BreakdownRow({ label, right }: BreakdownRowProps) {
  return (
    <div className="flex justify-between items-center py-1.5 border-b border-slate-100 last:border-0">
      <span className="text-slate-600">{label}</span>
      <span className="text-slate-800 font-medium">{right}</span>
    </div>
  );
}

interface SectionProps {
  title: string;
  emptyMessage?: string;
  isEmpty?: boolean;
  children: React.ReactNode;
}

function Section({ title, emptyMessage, isEmpty, children }: SectionProps) {
  return (
    <div>
      <h4 className="font-semibold text-slate-700 mb-2">{title}</h4>
      <div className="bg-slate-50 rounded-lg px-4 py-2">
        {isEmpty ? (
          <p className="text-slate-400 text-sm py-1">{emptyMessage}</p>
        ) : (
          children
        )}
      </div>
    </div>
  );
}

interface Props {
  session?: SessionLike | null;
  summary: ShiftSummaryLike;
}

export default function ShiftSummaryView({ session, summary }: Props) {
  const { counts, revenue, byPaymentMethod, byOrderType, byOrderSource, topProducts } = summary;

  const pipelineEntries = (['created', 'confirmed', 'processing', 'served'] as const)
    .map((key) => ({ key, label: STATUS_LABELS[key], count: counts[key] }))
    .filter((e) => e.count > 0);

  return (
    <div className="space-y-5">
      {session && (
        <div className="text-sm text-slate-500 space-y-0.5">
          <p>
            Apertura:{' '}
            <span className="text-slate-700 font-medium">{session.displayOpenedAt}</span>
          </p>
          <p>
            Cierre:{' '}
            <span className="text-slate-700 font-medium">{session.displayClosedAt ?? '—'}</span>
          </p>
        </div>
      )}

      <div className="grid grid-cols-3 gap-3">
        <StatTile label="Total ingresado" value={formatCurrency(revenue.completed)} tone="success" />
        <StatTile label="Pendiente" value={formatCurrency(revenue.pending)} tone="warning" />
        <StatTile label="Ticket promedio" value={formatCurrency(revenue.averageTicket)} />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatTile label="Total pedidos" value={counts.total} />
        <StatTile label="Completados" value={counts.completed} tone="info" />
        <StatTile label="Pendientes" value={counts.pending} tone="warning" />
        <StatTile label="Cancelados" value={counts.cancelled} tone="danger" />
      </div>

      {pipelineEntries.length > 0 && (
        <Section title="Pedidos pendientes por estado">
          {pipelineEntries.map((e) => (
            <BreakdownRow key={e.key} label={e.label} right={`${e.count} pedidos`} />
          ))}
        </Section>
      )}

      <Section
        title="Desglose por método de pago"
        emptyMessage="Sin pedidos"
        isEmpty={byPaymentMethod.length === 0}
      >
        {byPaymentMethod.map((item) => (
          <BreakdownRow
            key={item.method}
            label={PAYMENT_LABELS[item.method] ?? item.method}
            right={`${item.count} pedidos — ${formatCurrency(item.total)}`}
          />
        ))}
      </Section>

      <Section
        title="Tipos de pedido"
        emptyMessage="Sin pedidos"
        isEmpty={byOrderType.length === 0}
      >
        {byOrderType.map((item) => (
          <BreakdownRow
            key={item.type}
            label={ORDER_TYPE_LABELS[item.type] ?? item.type}
            right={`${item.count} pedidos`}
          />
        ))}
      </Section>

      <Section
        title="Origen del pedido"
        emptyMessage="Sin pedidos"
        isEmpty={byOrderSource.length === 0}
      >
        {byOrderSource.map((item) => (
          <BreakdownRow
            key={item.source}
            label={ORDER_SOURCE_LABELS[item.source] ?? item.source}
            right={`${item.count} pedidos`}
          />
        ))}
      </Section>

      <Section
        title="Platillos más vendidos"
        emptyMessage="Sin datos de productos"
        isEmpty={topProducts.length === 0}
      >
        {topProducts.map((p, i) => (
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
        ))}
      </Section>
    </div>
  );
}
