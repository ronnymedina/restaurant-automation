import { render, screen, fireEvent } from '@testing-library/react';
import { vi } from 'vitest';
import IconButton from './IconButton';

test('renders with aria-label and title', () => {
  render(<IconButton icon="pencil" label="Editar" />);
  const btn = screen.getByRole('button', { name: 'Editar' });
  expect(btn).toBeInTheDocument();
  expect(btn).toHaveAttribute('title', 'Editar');
});

test('calls onClick when clicked', () => {
  const handleClick = vi.fn();
  render(<IconButton icon="trash" label="Eliminar" onClick={handleClick} />);
  fireEvent.click(screen.getByRole('button', { name: 'Eliminar' }));
  expect(handleClick).toHaveBeenCalledTimes(1);
});

test('applies danger variant class on hover', () => {
  render(<IconButton icon="trash" label="Eliminar" variant="danger" />);
  const btn = screen.getByRole('button', { name: 'Eliminar' });
  expect(btn.className).toContain('hover:text-red');
});

test('applies primary variant class on hover', () => {
  render(<IconButton icon="eye" label="Ver" variant="primary" />);
  const btn = screen.getByRole('button', { name: 'Ver' });
  expect(btn.className).toContain('hover:text-indigo');
});

test('is disabled when disabled prop is true', () => {
  render(<IconButton icon="pencil" label="Editar" disabled />);
  expect(screen.getByRole('button', { name: 'Editar' })).toBeDisabled();
});

test('renders svg with sm size (w-4 h-4)', () => {
  const { container } = render(<IconButton icon="pencil" label="Editar" size="sm" />);
  const svg = container.querySelector('svg');
  expect(svg?.classList.contains('w-4')).toBe(true);
  expect(svg?.classList.contains('h-4')).toBe(true);
});

test('renders svg with lg size (w-6 h-6)', () => {
  const { container } = render(<IconButton icon="list-bullet" label="Items" size="lg" />);
  const svg = container.querySelector('svg');
  expect(svg?.classList.contains('w-6')).toBe(true);
  expect(svg?.classList.contains('h-6')).toBe(true);
});
