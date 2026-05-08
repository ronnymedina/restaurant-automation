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
