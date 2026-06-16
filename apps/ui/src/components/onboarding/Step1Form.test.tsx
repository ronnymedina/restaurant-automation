import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, test, expect, vi, beforeEach, it } from 'vitest';
import Step1Form from './Step1Form';

const noop = vi.fn();

const countries = [
  { code: 'AR', name: 'Argentina', currency: 'ARS', defaultDecimalSeparator: ',' },
  { code: 'MX', name: 'México', currency: 'MXN', defaultDecimalSeparator: '.' },
];

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => countries })) as unknown as typeof fetch);
});

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

  test('submit button is enabled when both fields and country are valid', async () => {
    render(<Step1Form onSubmit={noop} />);
    await waitFor(() => screen.getByLabelText(/país/i));
    fireEvent.change(screen.getByLabelText(/correo electrónico/i), {
      target: { value: 'chef@local.com' },
    });
    fireEvent.change(screen.getByLabelText(/nombre del restaurante/i), {
      target: { value: 'Mi Local' },
    });
    fireEvent.change(screen.getByLabelText(/país/i), { target: { value: 'AR' } });
    expect(screen.getByRole('button', { name: /siguiente/i })).not.toBeDisabled();
  });

  test('calls onSubmit with email and restaurantName when valid', async () => {
    const handleSubmit = vi.fn();
    render(<Step1Form onSubmit={handleSubmit} />);
    await waitFor(() => screen.getByLabelText(/país/i));
    fireEvent.change(screen.getByLabelText(/correo electrónico/i), {
      target: { value: 'chef@local.com' },
    });
    fireEvent.change(screen.getByLabelText(/nombre del restaurante/i), {
      target: { value: 'Mi Local' },
    });
    fireEvent.change(screen.getByLabelText(/país/i), { target: { value: 'AR' } });
    fireEvent.click(screen.getByRole('button', { name: /siguiente/i }));
    expect(handleSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'chef@local.com',
        restaurantName: 'Mi Local',
      }),
    );
  });

  test('does not call onSubmit when fields are invalid', () => {
    const handleSubmit = vi.fn();
    render(<Step1Form onSubmit={handleSubmit} />);
    fireEvent.click(screen.getByRole('button', { name: /siguiente/i }));
    expect(handleSubmit).not.toHaveBeenCalled();
  });
});

it('renderiza el selector de país con las opciones del endpoint', async () => {
  render(<Step1Form onSubmit={() => {}} />);
  await waitFor(() => expect(screen.getByLabelText(/país/i)).toBeInTheDocument());
  expect(screen.getByRole('option', { name: 'Argentina' })).toBeInTheDocument();
  expect(screen.getByRole('option', { name: 'México' })).toBeInTheDocument();
});

it('preselecciona el separador por defecto del país elegido (overridable)', async () => {
  render(<Step1Form onSubmit={() => {}} />);
  await waitFor(() => screen.getByLabelText(/país/i));
  fireEvent.change(screen.getByLabelText(/país/i), { target: { value: 'MX' } });
  await waitFor(() =>
    expect((screen.getByLabelText(/punto decimal/i) as HTMLInputElement).checked).toBe(true),
  );
});

it('envía country y decimalSeparator en onSubmit', async () => {
  const onSubmit = vi.fn();
  render(<Step1Form onSubmit={onSubmit} />);
  await waitFor(() => screen.getByLabelText(/país/i));
  fireEvent.change(screen.getByLabelText(/correo/i), { target: { value: 'a@b.com' } });
  fireEvent.change(screen.getByLabelText(/nombre/i), { target: { value: 'Mi Restaurante' } });
  fireEvent.change(screen.getByLabelText(/país/i), { target: { value: 'AR' } });
  fireEvent.submit(screen.getByRole('button', { name: /siguiente/i }));
  expect(onSubmit).toHaveBeenCalledWith(
    expect.objectContaining({ email: 'a@b.com', restaurantName: 'Mi Restaurante', country: 'AR', decimalSeparator: ',' }),
  );
});
