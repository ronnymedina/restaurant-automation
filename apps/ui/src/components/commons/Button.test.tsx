import { render, screen, fireEvent } from '@testing-library/react';
import Button from './Button';

test('renders with default primary+md classes', () => {
  render(<Button>Click me</Button>);
  const btn = screen.getByRole('button', { name: 'Click me' });
  expect(btn).toHaveClass('bg-indigo-600', 'px-4', 'py-2', 'text-sm');
});

test('applies danger variant', () => {
  render(<Button variant="danger">Delete</Button>);
  expect(screen.getByRole('button')).toHaveClass('bg-red-600');
});

test('applies secondary variant', () => {
  render(<Button variant="secondary">Cancel</Button>);
  expect(screen.getByRole('button')).toHaveClass('bg-slate-100', 'text-slate-700');
});

test('applies warning variant', () => {
  render(<Button variant="warning">Warn</Button>);
  expect(screen.getByRole('button')).toHaveClass('bg-amber-500');
});

test('applies sm size', () => {
  render(<Button size="sm">Small</Button>);
  expect(screen.getByRole('button')).toHaveClass('px-3', 'py-1.5', 'text-xs');
});

test('applies lg size', () => {
  render(<Button size="lg">Large</Button>);
  expect(screen.getByRole('button')).toHaveClass('px-5', 'py-2.5', 'text-base');
});

test('appends custom className', () => {
  render(<Button className="mt-4">Extra</Button>);
  expect(screen.getByRole('button')).toHaveClass('mt-4');
});

test('calls onClick when clicked', () => {
  const handleClick = vi.fn();
  render(<Button onClick={handleClick}>Click</Button>);
  fireEvent.click(screen.getByRole('button'));
  expect(handleClick).toHaveBeenCalledOnce();
});

test('sets type attribute', () => {
  render(<Button type="submit">Submit</Button>);
  expect(screen.getByRole('button')).toHaveAttribute('type', 'submit');
});

test('is disabled when disabled prop passed', () => {
  render(<Button disabled>Off</Button>);
  expect(screen.getByRole('button')).toBeDisabled();
});
