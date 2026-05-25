import { render, screen, fireEvent } from '@testing-library/react';
import RegisterSummaryModal from './RegisterSummaryModal';
import type { ShiftSummary } from './api';

function makeSummary(overrides: Partial<ShiftSummary> = {}): ShiftSummary {
  return {
    counts: { total: 0, pending: 0, created: 0, confirmed: 0, processing: 0, served: 0, completed: 0, cancelled: 0 },
    revenue: { completed: 0, pending: 0, averageTicket: 0 },
    byPaymentMethod: [],
    byOrderType: [],
    byOrderSource: [],
    topProducts: [],
    ...overrides,
  };
}

const emptySummary = makeSummary();

test('renders nothing when closed', () => {
  const { container } = render(
    <RegisterSummaryModal open={false} summary={emptySummary} onClose={vi.fn()} />,
  );
  expect(container).toBeEmptyDOMElement();
});

test('renders summary title when open', () => {
  render(<RegisterSummaryModal open={true} summary={emptySummary} onClose={vi.fn()} />);
  expect(screen.getByText('Resumen de Caja')).toBeInTheDocument();
});

test('renders completed count and revenue', () => {
  const summary = makeSummary({
    counts: { ...emptySummary.counts, total: 12, completed: 12 },
    revenue: { completed: 480.5, pending: 0, averageTicket: 40.04 },
  });
  render(<RegisterSummaryModal open={true} summary={summary} onClose={vi.fn()} />);
  expect(screen.getByText('12')).toBeInTheDocument();
  expect(screen.getByText('$480.50')).toBeInTheDocument();
});

test('shows Sin pedidos when byPaymentMethod is empty', () => {
  render(<RegisterSummaryModal open={true} summary={emptySummary} onClose={vi.fn()} />);
  expect(screen.getByText('Sin pedidos')).toBeInTheDocument();
});

test('renders payment breakdown entries', () => {
  const summary = makeSummary({
    counts: { ...emptySummary.counts, total: 2, completed: 2 },
    revenue: { completed: 100, pending: 0, averageTicket: 50 },
    byPaymentMethod: [
      { method: 'CASH', count: 1, total: 50 },
      { method: 'CARD', count: 1, total: 50 },
    ],
  });
  render(<RegisterSummaryModal open={true} summary={summary} onClose={vi.fn()} />);
  expect(screen.getByText('CASH')).toBeInTheDocument();
  expect(screen.getByText('CARD')).toBeInTheDocument();
});

test('calls onClose when Cerrar is clicked', () => {
  const onClose = vi.fn();
  render(<RegisterSummaryModal open={true} summary={emptySummary} onClose={onClose} />);
  fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
  expect(onClose).toHaveBeenCalledOnce();
});
