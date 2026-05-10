import { render, screen, fireEvent } from '@testing-library/react';
import RegisterSummaryModal from './RegisterSummaryModal';
import type { CloseSummary } from './types';

const emptySummary: CloseSummary = { totalOrders: 0, totalSales: 0, paymentBreakdown: {} };

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

test('renders totalOrders and totalSales', () => {
  const summary: CloseSummary = { totalOrders: 12, totalSales: 480.5, paymentBreakdown: {} };
  render(<RegisterSummaryModal open={true} summary={summary} onClose={vi.fn()} />);
  expect(screen.getByText('12')).toBeInTheDocument();
  expect(screen.getByText('$480.50')).toBeInTheDocument();
});

test('shows Sin pedidos when paymentBreakdown is empty', () => {
  render(<RegisterSummaryModal open={true} summary={emptySummary} onClose={vi.fn()} />);
  expect(screen.getByText('Sin pedidos')).toBeInTheDocument();
});

test('renders payment breakdown entries', () => {
  const summary: CloseSummary = {
    totalOrders: 2,
    totalSales: 100,
    paymentBreakdown: {
      CASH: { count: 1, total: 50 },
      CARD: { count: 1, total: 50 },
    },
  };
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
