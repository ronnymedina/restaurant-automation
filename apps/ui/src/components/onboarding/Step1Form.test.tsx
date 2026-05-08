import { render, screen, fireEvent } from '@testing-library/react';
import { describe, test, expect, vi } from 'vitest';
import Step1Form from './Step1Form';

const noop = vi.fn();

describe('Step1Form', () => {
  test('renders email and restaurant name inputs', () => {
    render(<Step1Form onSubmit={noop} />);
    expect(screen.getByLabelText(/correo electrónico/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/nombre del restaurante/i)).toBeInTheDocument();
  });

  test('submit button is disabled when fields are empty', () => {
    render(<Step1Form onSubmit={noop} />);
    expect(screen.getByRole('button', { name: /siguiente/i })).toBeDisabled();
  });

  test('shows email error on blur with invalid format', () => {
    render(<Step1Form onSubmit={noop} />);
    const input = screen.getByLabelText(/correo electrónico/i);
    fireEvent.change(input, { target: { value: 'noesvalido' } });
    fireEvent.blur(input);
    expect(screen.getByText(/correo electrónico válido/i)).toBeInTheDocument();
  });

  test('shows no email error when format is valid', () => {
    render(<Step1Form onSubmit={noop} />);
    const input = screen.getByLabelText(/correo electrónico/i);
    fireEvent.change(input, { target: { value: 'chef@restaurante.com' } });
    fireEvent.blur(input);
    expect(screen.queryByText(/correo electrónico válido/i)).not.toBeInTheDocument();
  });

  test('shows restaurant name error for invalid characters', () => {
    render(<Step1Form onSubmit={noop} />);
    const input = screen.getByLabelText(/nombre del restaurante/i);
    fireEvent.change(input, { target: { value: 'Mi Rest@urante2!' } });
    fireEvent.blur(input);
    expect(screen.getByText(/solo se permiten letras/i)).toBeInTheDocument();
  });

  test('shows error when restaurant name exceeds 60 characters', () => {
    render(<Step1Form onSubmit={noop} />);
    const input = screen.getByLabelText(/nombre del restaurante/i);
    fireEvent.change(input, { target: { value: 'A'.repeat(61) } });
    fireEvent.blur(input);
    expect(screen.getByText(/no puede superar 60 caracteres/i)).toBeInTheDocument();
  });

  test('shows character counter for restaurant name', () => {
    render(<Step1Form onSubmit={noop} />);
    const input = screen.getByLabelText(/nombre del restaurante/i);
    fireEvent.change(input, { target: { value: 'Mi Local' } });
    expect(screen.getByText('8 / 60')).toBeInTheDocument();
  });

  test('submit button is enabled when both fields are valid', () => {
    render(<Step1Form onSubmit={noop} />);
    fireEvent.change(screen.getByLabelText(/correo electrónico/i), {
      target: { value: 'chef@local.com' },
    });
    fireEvent.change(screen.getByLabelText(/nombre del restaurante/i), {
      target: { value: 'Mi Local' },
    });
    expect(screen.getByRole('button', { name: /siguiente/i })).not.toBeDisabled();
  });

  test('calls onSubmit with email and restaurantName when valid', () => {
    const handleSubmit = vi.fn();
    render(<Step1Form onSubmit={handleSubmit} />);
    fireEvent.change(screen.getByLabelText(/correo electrónico/i), {
      target: { value: 'chef@local.com' },
    });
    fireEvent.change(screen.getByLabelText(/nombre del restaurante/i), {
      target: { value: 'Mi Local' },
    });
    fireEvent.click(screen.getByRole('button', { name: /siguiente/i }));
    expect(handleSubmit).toHaveBeenCalledWith({
      email: 'chef@local.com',
      restaurantName: 'Mi Local',
    });
  });

  test('does not call onSubmit when fields are invalid', () => {
    const handleSubmit = vi.fn();
    render(<Step1Form onSubmit={handleSubmit} />);
    fireEvent.click(screen.getByRole('button', { name: /siguiente/i }));
    expect(handleSubmit).not.toHaveBeenCalled();
  });
});
