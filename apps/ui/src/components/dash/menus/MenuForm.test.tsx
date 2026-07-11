import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, beforeEach } from 'vitest';
import MenuForm from './MenuForm';
import type { Menu } from '../../../lib/menus-api';

vi.mock('../../../lib/menus-api', () => ({
  createMenu: vi.fn(),
  updateMenu: vi.fn(),
}));

import { createMenu, updateMenu } from '../../../lib/menus-api';
const mockCreate = vi.mocked(createMenu);
const mockUpdate = vi.mocked(updateMenu);

const editMenu: Menu = {
  id: 'menu-1',
  name: 'Almuerzo',
  active: true,
  startTime: '12:00',
  endTime: '15:00',
  daysOfWeek: 'MON,WED,FRI',
  itemsCount: 3,
};

let defaultProps: { onSuccess: ReturnType<typeof vi.fn>; onCancel: ReturnType<typeof vi.fn> };

beforeEach(() => {
  vi.clearAllMocks();
  defaultProps = { onSuccess: vi.fn(), onCancel: vi.fn() };
});

test('renders "Nuevo menú" title in create mode', () => {
  render(<MenuForm {...defaultProps} />);
  expect(screen.getByRole('heading', { name: 'Nuevo menú' })).toBeInTheDocument();
});

test('renders "Editar menú" title in edit mode', () => {
  render(<MenuForm {...defaultProps} initialData={editMenu} />);
  expect(screen.getByRole('heading', { name: 'Editar menú' })).toBeInTheDocument();
});

test('calls onCancel when cancel button clicked', () => {
  render(<MenuForm {...defaultProps} />);
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
  expect(defaultProps.onCancel).toHaveBeenCalledTimes(1);
});

test('calls createMenu and onSuccess on submit in create mode', async () => {
  mockCreate.mockResolvedValue({
    id: 'new-menu',
    name: 'Cena',
    active: true,
    startTime: null,
    endTime: null,
    daysOfWeek: null,
    itemsCount: 0,
  });

  render(<MenuForm {...defaultProps} />);
  fireEvent.change(screen.getByLabelText(/Nombre/), { target: { value: 'Cena' } });
  fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

  await waitFor(() => expect(mockCreate).toHaveBeenCalledWith(
    expect.objectContaining({ name: 'Cena' }),
  ));
  expect(defaultProps.onSuccess).toHaveBeenCalledTimes(1);
});

test('calls updateMenu on submit in edit mode', async () => {
  mockUpdate.mockResolvedValue(editMenu);

  render(<MenuForm {...defaultProps} initialData={editMenu} />);
  fireEvent.change(screen.getByLabelText(/Nombre/), { target: { value: 'Almuerzo Ejecutivo' } });
  fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

  await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith(
    'menu-1',
    expect.objectContaining({ name: 'Almuerzo Ejecutivo' }),
  ));
  expect(defaultProps.onSuccess).toHaveBeenCalledTimes(1);
});

test('shows error message when name is empty and form is submitted', async () => {
  render(<MenuForm {...defaultProps} />);
  fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
  await waitFor(() =>
    expect(screen.getByText(/El nombre es requerido/i)).toBeInTheDocument(),
  );
});

test('pre-fills fields from initialData', () => {
  render(<MenuForm {...defaultProps} initialData={editMenu} />);
  expect((screen.getByLabelText(/Nombre/) as HTMLInputElement).value).toBe('Almuerzo');
});

test('shows time fields when allDay toggle is unchecked', () => {
  render(<MenuForm {...defaultProps} />);
  const toggle = screen.getByLabelText(/Disponible en todo el horario/i);
  expect(toggle).toBeChecked();
  fireEvent.click(toggle);
  expect(screen.getByLabelText(/Hora inicio/i)).toBeVisible();
  expect(screen.getByLabelText(/Hora fin/i)).toBeVisible();
});
