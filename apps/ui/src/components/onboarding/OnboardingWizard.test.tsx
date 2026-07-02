import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import OnboardingWizard from './OnboardingWizard';

const COUNTRIES_MOCK = [
  { code: 'AR', name: 'Argentina', currency: 'ARS', defaultDecimalSeparator: ',' },
];

function makeFetchMock(registerResponse: { ok: boolean; json: () => Promise<unknown> }) {
  return vi.fn(async (url: string) => {
    if (String(url).endsWith('/v1/onboarding/status')) {
      return { ok: true, json: async () => ({ registrationOpen: true }) };
    }
    if (String(url).endsWith('/v1/onboarding/countries')) {
      return { ok: true, json: async () => COUNTRIES_MOCK };
    }
    // register / any other call
    return registerResponse;
  });
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function fillStep1() {
  await waitFor(() => expect(screen.getByLabelText(/país/i)).toBeInTheDocument());
  fireEvent.change(screen.getByLabelText(/correo electrónico/i), {
    target: { value: 'chef@local.com' },
  });
  fireEvent.change(screen.getByLabelText(/nombre del restaurante/i), {
    target: { value: 'Mi Local' },
  });
  fireEvent.change(screen.getByLabelText(/país/i), { target: { value: 'AR' } });
  fireEvent.click(screen.getByRole('button', { name: /siguiente/i }));
}

test('renders step 1 initially', async () => {
  vi.stubGlobal('fetch', makeFetchMock({ ok: true, json: async () => ({ productsCreated: 0 }) }));
  render(<OnboardingWizard />);
  expect(await screen.findByLabelText(/correo electrónico/i)).toBeInTheDocument();
});

test('shows step 2 after step 1 is submitted', async () => {
  vi.stubGlobal('fetch', makeFetchMock({ ok: true, json: async () => ({ productsCreated: 0 }) }));
  render(<OnboardingWizard />);
  await fillStep1();
  expect(screen.getByText(/inteligencia artificial/i)).toBeInTheDocument();
});

test('goes back to step 1 when Volver is clicked in step 2', async () => {
  vi.stubGlobal('fetch', makeFetchMock({ ok: true, json: async () => ({ productsCreated: 0 }) }));
  render(<OnboardingWizard />);
  await fillStep1();
  fireEvent.click(screen.getByRole('button', { name: /volver/i }));
  expect(screen.getByLabelText(/correo electrónico/i)).toBeInTheDocument();
});

test('step 1 indicator is active on start', async () => {
  vi.stubGlobal('fetch', makeFetchMock({ ok: true, json: async () => ({ productsCreated: 0 }) }));
  render(<OnboardingWizard />);
  expect(await screen.findByTestId('step-1')).toHaveAttribute('data-active', 'true');
});

test('step 2 indicator is active after step 1 submit', async () => {
  vi.stubGlobal('fetch', makeFetchMock({ ok: true, json: async () => ({ productsCreated: 0 }) }));
  render(<OnboardingWizard />);
  await fillStep1();
  expect(screen.getByTestId('step-2')).toHaveAttribute('data-active', 'true');
});

test('calls fetch with correct fields on Continuar (no file, no demo)', async () => {
  const fetchMock = makeFetchMock({ ok: true, json: async () => ({ productsCreated: 0 }) });
  vi.stubGlobal('fetch', fetchMock);

  render(<OnboardingWizard />);
  await fillStep1();
  fireEvent.click(screen.getByRole('button', { name: /^continuar/i }));

  await waitFor(() => {
    const registerCall = fetchMock.mock.calls.find(([u]: [string]) =>
      String(u).endsWith('/v1/onboarding/register'),
    );
    expect(registerCall).toBeDefined();
  });

  const registerCall = fetchMock.mock.calls.find(([u]: [string]) =>
    String(u).endsWith('/v1/onboarding/register'),
  );
  const body = registerCall![1]?.body as FormData;
  expect(body.get('email')).toBe('chef@local.com');
  expect(body.get('restaurantName')).toBe('Mi Local');
  expect(body.get('createDemoData')).toBeNull();
  expect(body.get('photos')).toBeNull();
});

test('calls fetch with createDemoData=true on demo submit', async () => {
  const fetchMock = makeFetchMock({ ok: true, json: async () => ({ productsCreated: 5 }) });
  vi.stubGlobal('fetch', fetchMock);

  render(<OnboardingWizard />);
  await fillStep1();
  fireEvent.click(screen.getByRole('button', { name: /usar datos demo/i }));

  await waitFor(() => {
    const registerCall = fetchMock.mock.calls.find(([u]: [string]) =>
      String(u).endsWith('/v1/onboarding/register'),
    );
    expect(registerCall).toBeDefined();
  });

  const registerCall = fetchMock.mock.calls.find(([u]: [string]) =>
    String(u).endsWith('/v1/onboarding/register'),
  );
  const body = registerCall![1]?.body as FormData;
  expect(body.get('createDemoData')).toBe('true');
});

test('shows step 3 with correct data on success', async () => {
  const fetchMock = makeFetchMock({ ok: true, json: async () => ({ productsCreated: 3 }) });
  vi.stubGlobal('fetch', fetchMock);

  render(<OnboardingWizard />);
  await fillStep1();
  fireEvent.click(screen.getByRole('button', { name: /^continuar/i }));

  await waitFor(() => expect(screen.getByText('¡Registro Exitoso!')).toBeInTheDocument());
  expect(screen.getByText('Mi Local')).toBeInTheDocument();
  expect(screen.getByText('chef@local.com')).toBeInTheDocument();
  expect(screen.getByText('3 productos')).toBeInTheDocument();
});

test('shows error message when API returns error code', async () => {
  const fetchMock = makeFetchMock({
    ok: false,
    json: async () => ({ code: 'EMAIL_ALREADY_EXISTS' }),
  });
  vi.stubGlobal('fetch', fetchMock);

  render(<OnboardingWizard />);
  await fillStep1();
  fireEvent.click(screen.getByRole('button', { name: /^continuar/i }));

  await waitFor(() =>
    expect(screen.getByText('Este correo ya está registrado')).toBeInTheDocument(),
  );
});

test('shows generic error when API returns non-JSON error', async () => {
  const fetchMock = makeFetchMock({
    ok: false,
    json: async () => { throw new Error(); },
  });
  vi.stubGlobal('fetch', fetchMock);

  render(<OnboardingWizard />);
  await fillStep1();
  fireEvent.click(screen.getByRole('button', { name: /^continuar/i }));

  await waitFor(() =>
    expect(screen.getByText(/hubo un error/i)).toBeInTheDocument(),
  );
});

test('shows activation link on step 3 when register returns activationUrl', async () => {
  vi.stubGlobal(
    'fetch',
    makeFetchMock({
      ok: true,
      json: async () => ({
        productsCreated: 0,
        activationUrl: 'http://192.168.1.50:8080/activate?token=abc',
      }),
    }),
  );

  render(<OnboardingWizard />);
  await fillStep1();
  fireEvent.click(screen.getByRole('button', { name: /^continuar/i }));

  await waitFor(() =>
    expect(screen.getByRole('link', { name: /activar mi cuenta/i })).toHaveAttribute(
      'href',
      'http://192.168.1.50:8080/activate?token=abc',
    ),
  );
});

test('register POST includes country and decimalSeparator from step 1', async () => {
  const fetchMock = vi.fn(async (url: string) => {
    if (String(url).endsWith('/v1/onboarding/countries')) {
      return { ok: true, json: async () => COUNTRIES_MOCK };
    }
    return { ok: true, json: async () => ({ productsCreated: 0 }) };
  });
  vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

  render(<OnboardingWizard />);

  // Wait for countries to load then fill step 1
  await waitFor(() => expect(screen.getByLabelText(/país/i)).toBeInTheDocument());
  fireEvent.change(screen.getByLabelText(/correo electrónico/i), {
    target: { value: 'chef@local.com' },
  });
  fireEvent.change(screen.getByLabelText(/nombre del restaurante/i), {
    target: { value: 'Mi Local' },
  });
  fireEvent.change(screen.getByLabelText(/país/i), { target: { value: 'AR' } });
  fireEvent.click(screen.getByRole('button', { name: /siguiente/i }));

  // Now in Step 2 — click Usar datos demo
  await waitFor(() =>
    expect(screen.getByRole('button', { name: /usar datos demo/i })).toBeInTheDocument(),
  );
  fireEvent.click(screen.getByRole('button', { name: /usar datos demo/i }));

  await waitFor(() => {
    const registerCall = fetchMock.mock.calls.find(([u]: [string]) =>
      String(u).endsWith('/v1/onboarding/register'),
    );
    expect(registerCall).toBeDefined();
  });

  const registerCall = fetchMock.mock.calls.find(([u]: [string]) =>
    String(u).endsWith('/v1/onboarding/register'),
  );
  const body = registerCall![1]?.body as FormData;
  expect(body.get('country')).toBe('AR');
  expect(body.get('decimalSeparator')).toBe(',');
});
