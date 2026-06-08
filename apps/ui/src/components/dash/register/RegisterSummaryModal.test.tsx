import { render, screen, fireEvent } from '@testing-library/react';
import RegisterSummaryModal from './RegisterSummaryModal';
import type { CashShiftDto, ShiftSummary } from './api';

function makeSummary(overrides: Partial<ShiftSummary> = {}): ShiftSummary {
  return {
    counts: { total: 0, pending: 0, created: 0, confirmed: 0, processing: 0, served: 0, completed: 0, cancelled: 0 },
    revenue: { collected: 0, pending: 0, averageTicket: 0 },
    byPaymentMethod: [],
    byOrderType: [],
    byOrderSource: [],
    topProducts: [],
    ...overrides,
  };
}

function makeSession(overrides: Partial<CashShiftDto> = {}): CashShiftDto {
  return {
    id: 'shift-1',
    status: 'CLOSED',
    displayOpenedAt: '1 ene 2026, 10:00',
    displayClosedAt: '1 ene 2026, 18:00',
    closedBy: null,
    openedByEmail: null,
    ...overrides,
  };
}

const emptySummary = makeSummary();
const session = makeSession();

test('renders nothing when closed', () => {
  const { container } = render(
    <RegisterSummaryModal open={false} session={session} summary={emptySummary} onClose={vi.fn()} />,
  );
  expect(container).toBeEmptyDOMElement();
});

test('renders summary title when open', () => {
  render(<RegisterSummaryModal open={true} session={session} summary={emptySummary} onClose={vi.fn()} />);
  expect(screen.getByText('Resumen de Caja')).toBeInTheDocument();
});

test('renders open and close dates from session', () => {
  render(<RegisterSummaryModal open={true} session={session} summary={emptySummary} onClose={vi.fn()} />);
  expect(screen.getByText('1 ene 2026, 10:00')).toBeInTheDocument();
  expect(screen.getByText('1 ene 2026, 18:00')).toBeInTheDocument();
});

test('renders revenue tiles: total ingresado, pendiente, ticket promedio', () => {
  const summary = makeSummary({
    revenue: { collected: 480.5, pending: 75, averageTicket: 40.04 },
    counts: { ...emptySummary.counts, total: 12, completed: 12 },
  });
  render(<RegisterSummaryModal open={true} session={session} summary={summary} onClose={vi.fn()} />);
  expect(screen.getByText('Total ingresado')).toBeInTheDocument();
  expect(screen.getByText('$480.50')).toBeInTheDocument();
  expect(screen.getByText('Pendiente')).toBeInTheDocument();
  expect(screen.getByText('$75.00')).toBeInTheDocument();
  expect(screen.getByText('Ticket promedio')).toBeInTheDocument();
  expect(screen.getByText('$40.04')).toBeInTheDocument();
});

test('renders order counts: total, completados, pendientes, cancelados', () => {
  const summary = makeSummary({
    counts: { total: 10, pending: 4, created: 2, confirmed: 1, processing: 1, served: 0, completed: 5, cancelled: 1 },
  });
  render(<RegisterSummaryModal open={true} session={session} summary={summary} onClose={vi.fn()} />);
  expect(screen.getByText('Total pedidos')).toBeInTheDocument();
  expect(screen.getByText('10')).toBeInTheDocument();
  expect(screen.getByText('Completados')).toBeInTheDocument();
  expect(screen.getByText('5')).toBeInTheDocument();
  expect(screen.getByText('Pendientes')).toBeInTheDocument();
  expect(screen.getByText('4')).toBeInTheDocument();
  expect(screen.getByText('Cancelados')).toBeInTheDocument();
  expect(screen.getByText('1')).toBeInTheDocument();
});

test('renders pipeline section only for non-zero statuses', () => {
  const summary = makeSummary({
    counts: { total: 4, pending: 3, created: 2, confirmed: 0, processing: 1, served: 0, completed: 1, cancelled: 0 },
  });
  render(<RegisterSummaryModal open={true} session={session} summary={summary} onClose={vi.fn()} />);
  expect(screen.getByText('Pedidos pendientes por estado')).toBeInTheDocument();
  expect(screen.getByText('Creados')).toBeInTheDocument();
  expect(screen.getByText('En preparación')).toBeInTheDocument();
  expect(screen.queryByText('Confirmados')).not.toBeInTheDocument();
  expect(screen.queryByText('Servidos')).not.toBeInTheDocument();
});

test('omits pipeline section when no pending orders', () => {
  render(<RegisterSummaryModal open={true} session={session} summary={emptySummary} onClose={vi.fn()} />);
  expect(screen.queryByText('Pedidos pendientes por estado')).not.toBeInTheDocument();
});

test('shows Sin pedidos when breakdowns are empty', () => {
  render(<RegisterSummaryModal open={true} session={session} summary={emptySummary} onClose={vi.fn()} />);
  const empties = screen.getAllByText('Sin pedidos');
  expect(empties.length).toBeGreaterThan(0);
});

test('renders payment breakdown with friendly labels', () => {
  const summary = makeSummary({
    byPaymentMethod: [
      { method: 'CASH', count: 1, total: 50 },
      { method: 'CARD', count: 1, total: 50 },
      { method: 'DIGITAL_WALLET', count: 2, total: 80 },
    ],
  });
  render(<RegisterSummaryModal open={true} session={session} summary={summary} onClose={vi.fn()} />);
  expect(screen.getByText('Efectivo')).toBeInTheDocument();
  expect(screen.getByText('Tarjeta')).toBeInTheDocument();
  expect(screen.getByText('Billetera digital')).toBeInTheDocument();
});

test('renders order types with friendly labels', () => {
  const summary = makeSummary({
    byOrderType: [
      { type: 'DINE_IN', count: 3 },
      { type: 'PICKUP', count: 2 },
      { type: 'DELIVERY', count: 1 },
    ],
  });
  render(<RegisterSummaryModal open={true} session={session} summary={summary} onClose={vi.fn()} />);
  expect(screen.getByText('Tipos de pedido')).toBeInTheDocument();
  expect(screen.getByText('En mesa')).toBeInTheDocument();
  expect(screen.getByText('Para retirar')).toBeInTheDocument();
  expect(screen.getByText('Delivery')).toBeInTheDocument();
});

test('renders order sources with friendly labels', () => {
  const summary = makeSummary({
    byOrderSource: [
      { source: 'KIOSK', count: 4 },
      { source: 'STAFF', count: 2 },
    ],
  });
  render(<RegisterSummaryModal open={true} session={session} summary={summary} onClose={vi.fn()} />);
  expect(screen.getByText('Origen del pedido')).toBeInTheDocument();
  expect(screen.getByText('Kiosko')).toBeInTheDocument();
  expect(screen.getByText('Personal')).toBeInTheDocument();
});

test('renders top products', () => {
  const summary = makeSummary({
    topProducts: [
      { id: 'p1', name: 'Tacos', quantity: 10, total: 120 },
      { id: 'p2', name: 'Soda', quantity: 5, total: 25 },
    ],
  });
  render(<RegisterSummaryModal open={true} session={session} summary={summary} onClose={vi.fn()} />);
  expect(screen.getByText('Tacos')).toBeInTheDocument();
  expect(screen.getByText('Soda')).toBeInTheDocument();
});

test('shows fallback text when no top products', () => {
  render(<RegisterSummaryModal open={true} session={session} summary={emptySummary} onClose={vi.fn()} />);
  expect(screen.getByText('Sin datos de productos')).toBeInTheDocument();
});

test('renders without session', () => {
  render(<RegisterSummaryModal open={true} session={null} summary={emptySummary} onClose={vi.fn()} />);
  expect(screen.getByText('Resumen de Caja')).toBeInTheDocument();
  expect(screen.queryByText(/Apertura:/)).not.toBeInTheDocument();
});

test('calls onClose when Cerrar is clicked', () => {
  const onClose = vi.fn();
  render(<RegisterSummaryModal open={true} session={session} summary={emptySummary} onClose={onClose} />);
  fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
  expect(onClose).toHaveBeenCalledOnce();
});
