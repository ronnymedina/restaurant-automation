import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, beforeEach } from 'vitest';
import ProductForm from './ProductForm';
import type { Category, Product } from '../../../lib/products-api';

vi.mock('../../../lib/products-api', () => ({
  createProduct: vi.fn(),
  updateProduct: vi.fn(),
  uploadImage: vi.fn(),
}));

import { createProduct, updateProduct } from '../../../lib/products-api';
const mockCreate = vi.mocked(createProduct);
const mockUpdate = vi.mocked(updateProduct);

const categories: Category[] = [
  { id: '550e8400-e29b-41d4-a716-446655440001', name: 'Bebidas', isDefault: false },
  { id: '550e8400-e29b-41d4-a716-446655440002', name: 'Comida', isDefault: false },
];

const editProduct: Product = {
  id: 'prod-1',
  name: 'Hamburguesa',
  price: 10.5,
  categoryId: '550e8400-e29b-41d4-a716-446655440001',
  active: true,
  stock: 5,
  sku: 'HAM-001',
  imageUrl: null,
  description: 'Con queso',
  restaurantId: 'rest-1',
  createdAt: '2026-01-01T00:00:00Z',
  category: { name: 'Bebidas' },
};

let defaultProps: { categories: Category[]; onSuccess: ReturnType<typeof vi.fn>; onCancel: ReturnType<typeof vi.fn> };

beforeEach(() => {
  vi.clearAllMocks();
  defaultProps = {
    categories,
    onSuccess: vi.fn(),
    onCancel: vi.fn(),
  };
});

test('renders "Nuevo producto" title in create mode', () => {
  render(<ProductForm {...defaultProps} />);
  expect(screen.getByRole('heading', { name: 'Nuevo producto' })).toBeInTheDocument();
});

test('renders "Editar producto" title and prefills name in edit mode', () => {
  render(<ProductForm {...defaultProps} initialData={editProduct} />);
  expect(screen.getByRole('heading', { name: 'Editar producto' })).toBeInTheDocument();
  expect(screen.getByLabelText(/Nombre/i)).toHaveValue('Hamburguesa');
});

test('prefills price, stock, sku, description in edit mode', () => {
  render(<ProductForm {...defaultProps} initialData={editProduct} />);
  expect(screen.getByLabelText(/Precio/i)).toHaveValue(10.5);
  expect(screen.getByLabelText(/Stock/i)).toHaveValue(5);
  expect(screen.getByLabelText(/SKU/i)).toHaveValue('HAM-001');
  expect(screen.getByLabelText(/Descripción/i)).toHaveValue('Con queso');
});

test('shows validation error when name is empty', async () => {
  render(<ProductForm {...defaultProps} />);
  fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
  await waitFor(() =>
    expect(screen.getByText(/El nombre es requerido/i)).toBeInTheDocument(),
  );
});

test('shows validation error when price is not positive', async () => {
  render(<ProductForm {...defaultProps} />);
  fireEvent.change(screen.getByLabelText(/Nombre/i), { target: { value: 'Agua' } });
  fireEvent.change(screen.getByLabelText(/Precio/i), { target: { value: '-1' } });
  fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
  await waitFor(() =>
    expect(screen.getByText(/El precio debe ser mayor a 0/i)).toBeInTheDocument(),
  );
});

test('calls createProduct and onSuccess on valid create submit', async () => {
  mockCreate.mockResolvedValue(undefined);
  render(<ProductForm {...defaultProps} />);

  fireEvent.change(screen.getByLabelText(/Nombre/i), { target: { value: 'Agua' } });
  fireEvent.change(screen.getByLabelText(/Precio/i), { target: { value: '5' } });
  fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

  await waitFor(() => expect(mockCreate).toHaveBeenCalledWith(
    expect.objectContaining({ name: 'Agua', price: 5, categoryId: categories[0].id })
  ));
  expect(defaultProps.onSuccess).toHaveBeenCalled();
  expect(mockUpdate).not.toHaveBeenCalled();
});

test('calls updateProduct and onSuccess on valid edit submit', async () => {
  mockUpdate.mockResolvedValue(undefined);
  render(<ProductForm {...defaultProps} initialData={editProduct} />);

  fireEvent.change(screen.getByLabelText(/Nombre/i), { target: { value: 'Hamburguesa XL' } });
  fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

  await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith('prod-1', expect.objectContaining({ name: 'Hamburguesa XL', categoryId: editProduct.categoryId })));
  expect(defaultProps.onSuccess).toHaveBeenCalled();
  expect(mockCreate).not.toHaveBeenCalled();
});

test('shows API error message when createProduct throws', async () => {
  mockCreate.mockRejectedValue(new Error('Error del servidor'));
  render(<ProductForm {...defaultProps} />);

  fireEvent.change(screen.getByLabelText(/Nombre/i), { target: { value: 'Agua' } });
  fireEvent.change(screen.getByLabelText(/Precio/i), { target: { value: '5' } });
  fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

  await waitFor(() =>
    expect(screen.getByText('Error del servidor')).toBeInTheDocument(),
  );
  expect(defaultProps.onSuccess).not.toHaveBeenCalled();
});

test('shows API error message when updateProduct throws', async () => {
  mockUpdate.mockRejectedValue(new Error('Error de actualización'));
  render(<ProductForm {...defaultProps} initialData={editProduct} />);

  fireEvent.change(screen.getByLabelText(/Nombre/i), { target: { value: 'Hamburguesa XL' } });
  fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

  await waitFor(() =>
    expect(screen.getByText('Error de actualización')).toBeInTheDocument(),
  );
  expect(defaultProps.onSuccess).not.toHaveBeenCalled();
});

test('calls onCancel when cancel button clicked', () => {
  render(<ProductForm {...defaultProps} />);
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
  expect(defaultProps.onCancel).toHaveBeenCalled();
});
