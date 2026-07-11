import { render, screen, fireEvent } from '@testing-library/react';
import Alert, { ALERT_TYPE } from './Alert';

const noop = () => {};

const baseProps = {
  open: true,
  type: ALERT_TYPE.ERROR,
  title: 'Título de prueba',
  message: 'Mensaje de prueba',
  onConfirm: noop,
};

// --- visibility ---

test('renders nothing when open is false', () => {
  render(<Alert {...baseProps} open={false} />);
  expect(screen.queryByText('Título de prueba')).not.toBeInTheDocument();
});

test('renders title and message when open is true', () => {
  render(<Alert {...baseProps} />);
  expect(screen.getByText('Título de prueba')).toBeInTheDocument();
  expect(screen.getByText('Mensaje de prueba')).toBeInTheDocument();
});

test('renders into document.body via portal', () => {
  const { baseElement } = render(<Alert {...baseProps} />);
  expect(baseElement.querySelector('.fixed')).not.toBeNull();
});

// --- default confirm labels per type ---

test('error type uses "Entendido" as default confirm label', () => {
  render(<Alert {...baseProps} type={ALERT_TYPE.ERROR} />);
  expect(screen.getByRole('button', { name: 'Entendido' })).toBeInTheDocument();
});

test('warning type uses "Confirmar" as default confirm label', () => {
  render(<Alert {...baseProps} type={ALERT_TYPE.WARNING} onCancel={vi.fn()} />);
  expect(screen.getByRole('button', { name: 'Confirmar' })).toBeInTheDocument();
});

test('success type uses "Cerrar" as default confirm label', () => {
  render(<Alert {...baseProps} type={ALERT_TYPE.SUCCESS} />);
  expect(screen.getByRole('button', { name: 'Cerrar' })).toBeInTheDocument();
});

test('info type uses "OK" as default confirm label', () => {
  render(<Alert {...baseProps} type={ALERT_TYPE.INFO} />);
  expect(screen.getByRole('button', { name: 'OK' })).toBeInTheDocument();
});

// --- confirmLabel override ---

test('custom confirmLabel overrides the type default', () => {
  render(<Alert {...baseProps} confirmLabel="Aceptar todo" />);
  expect(screen.getByRole('button', { name: 'Aceptar todo' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Entendido' })).not.toBeInTheDocument();
});

// --- cancel button visibility ---

test('cancel button is shown for warning type', () => {
  render(<Alert {...baseProps} type={ALERT_TYPE.WARNING} onCancel={vi.fn()} />);
  expect(screen.getByRole('button', { name: 'Cancelar' })).toBeInTheDocument();
});

test('cancel button is NOT shown for error type', () => {
  render(<Alert {...baseProps} type={ALERT_TYPE.ERROR} />);
  expect(screen.queryByRole('button', { name: 'Cancelar' })).not.toBeInTheDocument();
});

test('cancel button is NOT shown for success type', () => {
  render(<Alert {...baseProps} type={ALERT_TYPE.SUCCESS} />);
  expect(screen.queryByRole('button', { name: 'Cancelar' })).not.toBeInTheDocument();
});

test('cancel button is NOT shown for info type', () => {
  render(<Alert {...baseProps} type={ALERT_TYPE.INFO} />);
  expect(screen.queryByRole('button', { name: 'Cancelar' })).not.toBeInTheDocument();
});

// --- cancelLabel override ---

test('custom cancelLabel is used in warning type', () => {
  render(
    <Alert
      {...baseProps}
      type={ALERT_TYPE.WARNING}
      cancelLabel="No, volver"
      onCancel={vi.fn()}
    />,
  );
  expect(screen.getByRole('button', { name: 'No, volver' })).toBeInTheDocument();
});

// --- callbacks ---

test('onConfirm is called when confirm button is clicked', () => {
  const onConfirm = vi.fn();
  render(<Alert {...baseProps} onConfirm={onConfirm} />);
  fireEvent.click(screen.getByRole('button', { name: 'Entendido' }));
  expect(onConfirm).toHaveBeenCalledOnce();
});

test('onCancel is called when cancel button is clicked', () => {
  const onCancel = vi.fn();
  render(<Alert {...baseProps} type={ALERT_TYPE.WARNING} onCancel={onCancel} />);
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
  expect(onCancel).toHaveBeenCalledOnce();
});

// --- icon background colors per type ---

test('error type uses red icon background', () => {
  render(<Alert {...baseProps} type={ALERT_TYPE.ERROR} />);
  expect(document.querySelector('.bg-red-100')).not.toBeNull();
});

test('warning type uses amber icon background', () => {
  render(<Alert {...baseProps} type={ALERT_TYPE.WARNING} onCancel={vi.fn()} />);
  expect(document.querySelector('.bg-amber-100')).not.toBeNull();
});

test('success type uses emerald icon background', () => {
  render(<Alert {...baseProps} type={ALERT_TYPE.SUCCESS} />);
  expect(document.querySelector('.bg-emerald-100')).not.toBeNull();
});

test('info type uses indigo icon background', () => {
  render(<Alert {...baseProps} type={ALERT_TYPE.INFO} />);
  expect(document.querySelector('.bg-indigo-100')).not.toBeNull();
});
