import { render, screen } from '@testing-library/react';
import Step3Success from './Step3Success';

const defaultProps = {
  email: 'chef@restaurante.com',
  restaurantName: 'La Parrilla',
  productsCreated: 5,
};

test('shows restaurant name', () => {
  render(<Step3Success {...defaultProps} />);
  expect(screen.getByText('La Parrilla')).toBeInTheDocument();
});

test('shows email', () => {
  render(<Step3Success {...defaultProps} />);
  expect(screen.getByText('chef@restaurante.com')).toBeInTheDocument();
});

test('shows products created count', () => {
  render(<Step3Success {...defaultProps} />);
  expect(screen.getByText('5 productos')).toBeInTheDocument();
});

test('shows email notice title', () => {
  render(<Step3Success {...defaultProps} />);
  expect(screen.getByText('Revisa tu correo')).toBeInTheDocument();
});

test('mentions spam folder in notice', () => {
  render(<Step3Success {...defaultProps} />);
  expect(screen.getByText(/carpeta de spam/i)).toBeInTheDocument();
});

test('shows 0 products when none created', () => {
  render(<Step3Success {...defaultProps} productsCreated={0} />);
  expect(screen.getByText('0 productos')).toBeInTheDocument();
});

test('shows activation link panel when activationUrl is present (self-hosted)', () => {
  render(
    <Step3Success
      {...defaultProps}
      activationUrl="http://192.168.1.50:8080/activate?token=abc"
    />,
  );
  const link = screen.getByRole('link', { name: /activar mi cuenta/i });
  expect(link).toHaveAttribute('href', 'http://192.168.1.50:8080/activate?token=abc');
});

test('hides the email notice when activationUrl is present', () => {
  render(
    <Step3Success
      {...defaultProps}
      activationUrl="http://192.168.1.50:8080/activate?token=abc"
    />,
  );
  expect(screen.queryByText('Revisa tu correo')).not.toBeInTheDocument();
});

test('shows the email notice (not the activation link) when activationUrl is absent', () => {
  render(<Step3Success {...defaultProps} />);
  expect(screen.getByText('Revisa tu correo')).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: /activar mi cuenta/i })).not.toBeInTheDocument();
});
