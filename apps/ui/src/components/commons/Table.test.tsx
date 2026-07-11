import { render, screen, fireEvent } from '@testing-library/react';
import type { ColumnDef } from '@tanstack/react-table';
import Table from './Table';

interface Row { id: number; name: string }

const columns: ColumnDef<Row>[] = [
  { accessorKey: 'id', header: 'ID' },
  { accessorKey: 'name', header: 'Nombre' },
];

const data: Row[] = [
  { id: 1, name: 'Bebidas' },
  { id: 2, name: 'Postres' },
];

test('renders column headers', () => {
  render(<Table columns={columns} data={data} />);
  expect(screen.getByText('ID')).toBeInTheDocument();
  expect(screen.getByText('Nombre')).toBeInTheDocument();
});

test('renders data rows', () => {
  render(<Table columns={columns} data={data} />);
  expect(screen.getByText('Bebidas')).toBeInTheDocument();
  expect(screen.getByText('Postres')).toBeInTheDocument();
});

test('shows custom empty message when data is empty', () => {
  render(<Table columns={columns} data={[]} emptyMessage="Sin categorías" />);
  expect(screen.getByText('Sin categorías')).toBeInTheDocument();
});

test('shows default empty message', () => {
  render(<Table columns={columns} data={[]} />);
  expect(screen.getByText('No hay registros')).toBeInTheDocument();
});

test('shows loading text when isLoading is true', () => {
  render(<Table columns={columns} data={[]} isLoading />);
  expect(screen.getByText('Cargando...')).toBeInTheDocument();
});

test('calls onPageChange when a page button is clicked', () => {
  const onPageChange = vi.fn();
  render(
    <Table
      columns={columns}
      data={data}
      pagination={{ page: 1, totalPages: 3, onPageChange }}
    />,
  );
  const buttons = screen.getAllByRole('button');
  fireEvent.click(buttons[1]); // page 2 button (index 1)
  expect(onPageChange).toHaveBeenCalledWith(2);
});

test('renders all page buttons', () => {
  render(
    <Table
      columns={columns}
      data={data}
      pagination={{ page: 1, totalPages: 3, onPageChange: vi.fn() }}
    />,
  );
  const buttons = screen.getAllByRole('button');
  expect(buttons).toHaveLength(3);
  expect(buttons[0]).toHaveTextContent('1');
  expect(buttons[1]).toHaveTextContent('2');
  expect(buttons[2]).toHaveTextContent('3');
});

test('renders no pagination when pagination prop is absent', () => {
  render(<Table columns={columns} data={data} />);
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
});
