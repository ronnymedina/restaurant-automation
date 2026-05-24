import { render, screen, fireEvent } from '@testing-library/react';
import Modal from './Modal';

test('renders title and children when open', () => {
  render(<Modal open title="Test" onClose={() => {}}><p>Content</p></Modal>);
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  expect(screen.getByText('Test')).toBeInTheDocument();
  expect(screen.getByText('Content')).toBeInTheDocument();
});

test('renders nothing when closed', () => {
  render(<Modal open={false} title="Test" onClose={() => {}}><p>X</p></Modal>);
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

test('shows Cerrar button by default', () => {
  render(<Modal open title="T" onClose={() => {}}><p>X</p></Modal>);
  expect(screen.getByRole('button', { name: /cerrar/i })).toBeInTheDocument();
});

test('hides Cerrar button when hideCloseButton=true', () => {
  render(<Modal open title="T" onClose={() => {}} hideCloseButton><p>X</p></Modal>);
  expect(screen.queryByRole('button', { name: /cerrar/i })).not.toBeInTheDocument();
});

test('applies bg-white by default', () => {
  render(<Modal open title="T" onClose={() => {}}><p>X</p></Modal>);
  const panel = screen.getByRole('dialog').firstElementChild as HTMLElement;
  expect(panel).toHaveClass('bg-white');
});

test('applies dark bg when dark=true', () => {
  render(<Modal open title="T" onClose={() => {}} dark><p>X</p></Modal>);
  const panel = screen.getByRole('dialog').firstElementChild as HTMLElement;
  expect(panel).toHaveClass('bg-[#1e293b]');
  expect(panel).not.toHaveClass('bg-white');
});

test('calls onClose when Cerrar clicked', () => {
  const onClose = vi.fn();
  render(<Modal open title="T" onClose={onClose}><p>X</p></Modal>);
  fireEvent.click(screen.getByRole('button', { name: /cerrar/i }));
  expect(onClose).toHaveBeenCalledOnce();
});
