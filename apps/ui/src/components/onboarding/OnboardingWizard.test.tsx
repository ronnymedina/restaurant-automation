import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import OnboardingWizard from './OnboardingWizard';

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function fillStep1() {
  fireEvent.change(screen.getByLabelText(/correo electrónico/i), {
    target: { value: 'chef@local.com' },
  });
  fireEvent.change(screen.getByLabelText(/nombre del restaurante/i), {
    target: { value: 'Mi Local' },
  });
  fireEvent.click(screen.getByRole('button', { name: /siguiente/i }));
}

test('renders step 1 initially', () => {
  render(<OnboardingWizard />);
  expect(screen.getByLabelText(/correo electrónico/i)).toBeInTheDocument();
});

test('shows step 2 after step 1 is submitted', () => {
  render(<OnboardingWizard />);
  fillStep1();
  expect(screen.getByText(/inteligencia artificial/i)).toBeInTheDocument();
});

test('goes back to step 1 when Volver is clicked in step 2', () => {
  render(<OnboardingWizard />);
  fillStep1();
  fireEvent.click(screen.getByRole('button', { name: /volver/i }));
  expect(screen.getByLabelText(/correo electrónico/i)).toBeInTheDocument();
});

test('step 1 indicator is active on start', () => {
  render(<OnboardingWizard />);
  expect(screen.getByTestId('step-1')).toHaveAttribute('data-active', 'true');
});

test('step 2 indicator is active after step 1 submit', () => {
  render(<OnboardingWizard />);
  fillStep1();
  expect(screen.getByTestId('step-2')).toHaveAttribute('data-active', 'true');
});

test('calls fetch with correct fields on Continuar (no file, no demo)', async () => {
  vi.mocked(fetch).mockResolvedValueOnce({
    ok: true,
    json: async () => ({ productsCreated: 0 }),
  } as Response);

  render(<OnboardingWizard />);
  fillStep1();
  fireEvent.click(screen.getByRole('button', { name: /^continuar/i }));

  await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
  const [url, options] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
  expect(url).toContain('/v1/onboarding/register');
  const body = options.body as FormData;
  expect(body.get('email')).toBe('chef@local.com');
  expect(body.get('restaurantName')).toBe('Mi Local');
  expect(body.get('createDemoData')).toBeNull();
  expect(body.get('photos')).toBeNull();
});

test('calls fetch with createDemoData=true on demo submit', async () => {
  vi.mocked(fetch).mockResolvedValueOnce({
    ok: true,
    json: async () => ({ productsCreated: 5 }),
  } as Response);

  render(<OnboardingWizard />);
  fillStep1();
  fireEvent.click(screen.getByRole('button', { name: /usar datos demo/i }));

  await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
  const body = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body as FormData;
  expect(body.get('createDemoData')).toBe('true');
});

test('shows step 3 with correct data on success', async () => {
  vi.mocked(fetch).mockResolvedValueOnce({
    ok: true,
    json: async () => ({ productsCreated: 3 }),
  } as Response);

  render(<OnboardingWizard />);
  fillStep1();
  fireEvent.click(screen.getByRole('button', { name: /^continuar/i }));

  await waitFor(() => expect(screen.getByText('¡Registro Exitoso!')).toBeInTheDocument());
  expect(screen.getByText('Mi Local')).toBeInTheDocument();
  expect(screen.getByText('chef@local.com')).toBeInTheDocument();
  expect(screen.getByText('3 productos')).toBeInTheDocument();
});

test('shows error message when API returns error code', async () => {
  vi.mocked(fetch).mockResolvedValueOnce({
    ok: false,
    json: async () => ({ code: 'EMAIL_ALREADY_EXISTS' }),
  } as Response);

  render(<OnboardingWizard />);
  fillStep1();
  fireEvent.click(screen.getByRole('button', { name: /^continuar/i }));

  await waitFor(() =>
    expect(screen.getByText('Este correo ya está registrado')).toBeInTheDocument(),
  );
});

test('shows generic error when API returns non-JSON error', async () => {
  vi.mocked(fetch).mockResolvedValueOnce({
    ok: false,
    json: async () => { throw new Error(); },
  } as unknown as Response);

  render(<OnboardingWizard />);
  fillStep1();
  fireEvent.click(screen.getByRole('button', { name: /^continuar/i }));

  await waitFor(() =>
    expect(screen.getByText(/hubo un error/i)).toBeInTheDocument(),
  );
});
