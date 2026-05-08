# Onboarding Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the broken inline `onboarding.astro` wizard with four React components that correctly align with the backend API contract.

**Architecture:** `onboarding.astro` becomes a thin layout shell that mounts `<OnboardingWizard client:load />`. The wizard owns all step state and the API call; each step is a focused React component receiving only what it needs via props.

**Tech Stack:** React 19, TypeScript, Tailwind CSS, Vitest + @testing-library/react, Astro `client:load`

---

## File Map

| Status | Path | Responsibility |
|--------|------|----------------|
| Create | `apps/ui/src/components/onboarding/Step3Success.tsx` | Confirmation screen — display only |
| Create | `apps/ui/src/components/onboarding/Step3Success.test.tsx` | Tests for Step3Success |
| Create | `apps/ui/src/components/onboarding/Step1Form.tsx` | Email + restaurantName with real-time validation |
| Create | `apps/ui/src/components/onboarding/Step1Form.test.tsx` | Tests for Step1Form |
| Create | `apps/ui/src/components/onboarding/Step2Upload.tsx` | File upload, AI notice, three submission paths |
| Create | `apps/ui/src/components/onboarding/Step2Upload.test.tsx` | Tests for Step2Upload |
| Create | `apps/ui/src/components/onboarding/OnboardingWizard.tsx` | Step orchestration, state, API call |
| Create | `apps/ui/src/components/onboarding/OnboardingWizard.test.tsx` | Tests for OnboardingWizard |
| Modify | `apps/ui/src/pages/onboarding.astro` | Replace all content with layout shell |

Run all tests from `apps/ui/`:
```bash
pnpm test
```

---

## Task 1: Step3Success component

**Files:**
- Create: `apps/ui/src/components/onboarding/Step3Success.tsx`
- Create: `apps/ui/src/components/onboarding/Step3Success.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// apps/ui/src/components/onboarding/Step3Success.test.tsx
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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd apps/ui && pnpm test --reporter=verbose Step3Success
```
Expected: 6 failures — `Step3Success` not found.

- [ ] **Step 3: Implement Step3Success**

```tsx
// apps/ui/src/components/onboarding/Step3Success.tsx
interface Step3SuccessProps {
  email: string;
  restaurantName: string;
  productsCreated: number;
}

export default function Step3Success({ email, restaurantName, productsCreated }: Step3SuccessProps) {
  return (
    <div className="text-center">
      <div className="text-emerald-500 mb-4" style={{ animation: 'scaleIn 0.5s ease' }}>
        <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
          <polyline points="22 4 12 14.01 9 11.01" />
        </svg>
      </div>
      <h2 className="text-3xl text-slate-800 mb-2 font-bold">¡Registro Exitoso!</h2>
      <p className="text-slate-500 text-base mb-8">Tu restaurante ha sido creado</p>

      <div className="bg-green-50 rounded-xl p-5 mb-6">
        <div className="flex justify-between items-center mb-3">
          <span className="text-sm text-slate-500">Restaurante</span>
          <span className="text-sm font-semibold text-slate-800">{restaurantName}</span>
        </div>
        <div className="flex justify-between items-center mb-3">
          <span className="text-sm text-slate-500">Email</span>
          <span className="text-sm font-semibold text-slate-800 break-all">{email}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-sm text-slate-500">Productos creados</span>
          <span className="bg-green-100 text-green-700 text-xs font-bold px-3 py-1 rounded-full">
            {productsCreated} productos
          </span>
        </div>
      </div>

      <div className="flex gap-4 p-5 bg-gradient-to-br from-blue-50 to-sky-50 rounded-xl border border-blue-200">
        <div className="text-indigo-500 flex-shrink-0 mt-0.5">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect width="20" height="16" x="2" y="4" rx="2" />
            <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
          </svg>
        </div>
        <div className="text-left">
          <strong className="text-slate-800 block mb-1">Revisa tu correo</strong>
          <p className="text-slate-500 m-0 text-sm leading-relaxed">
            Hemos enviado un enlace de activación a tu dirección de correo.
            Si no aparece en tu bandeja principal, revisa la carpeta de spam.
          </p>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd apps/ui && pnpm test --reporter=verbose Step3Success
```
Expected: 6 PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/ui/src/components/onboarding/Step3Success.tsx apps/ui/src/components/onboarding/Step3Success.test.tsx
git commit -m "feat(onboarding): add Step3Success component"
```

---

## Task 2: Step1Form component with real-time validation

**Files:**
- Create: `apps/ui/src/components/onboarding/Step1Form.tsx`
- Create: `apps/ui/src/components/onboarding/Step1Form.test.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
// apps/ui/src/components/onboarding/Step1Form.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import Step1Form from './Step1Form';

const noop = vi.fn();

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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd apps/ui && pnpm test --reporter=verbose Step1Form
```
Expected: all failures — `Step1Form` not found.

- [ ] **Step 3: Implement Step1Form**

```tsx
// apps/ui/src/components/onboarding/Step1Form.tsx
import { useState } from 'react';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NAME_REGEX = /^[a-zA-ZÀ-ÿ \-_]+$/;
const NAME_MAX = 60;

function validateEmail(value: string): string | null {
  if (!value.trim()) return 'El correo electrónico es requerido';
  if (!EMAIL_REGEX.test(value)) return 'Ingresa un correo electrónico válido';
  return null;
}

function validateName(value: string): string | null {
  if (!value.trim()) return 'El nombre del restaurante es requerido';
  if (value.length > NAME_MAX) return `El nombre no puede superar ${NAME_MAX} caracteres`;
  if (!NAME_REGEX.test(value)) return 'Solo se permiten letras, espacios, guión medio y guión bajo';
  return null;
}

interface Step1FormProps {
  onSubmit: (data: { email: string; restaurantName: string }) => void;
}

const inputBase =
  'w-full py-3.5 px-4 border-2 rounded-xl text-base transition-all bg-white text-slate-800 box-border focus:outline-none focus:ring-4 focus:ring-indigo-500/10 placeholder:text-slate-400';

export default function Step1Form({ onSubmit }: Step1FormProps) {
  const [email, setEmail] = useState('');
  const [restaurantName, setRestaurantName] = useState('');
  const [emailTouched, setEmailTouched] = useState(false);
  const [nameTouched, setNameTouched] = useState(false);

  const emailError = emailTouched ? validateEmail(email) : null;
  const nameError = nameTouched ? validateName(restaurantName) : null;
  const isValid = validateEmail(email) === null && validateName(restaurantName) === null;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isValid) onSubmit({ email: email.trim(), restaurantName: restaurantName.trim() });
  }

  const emailBorder = emailError
    ? 'border-red-500 focus:border-red-500'
    : emailTouched && !emailError
      ? 'border-emerald-500 focus:border-emerald-500'
      : 'border-slate-200 focus:border-indigo-500';

  const nameBorder = nameError
    ? 'border-red-500 focus:border-red-500'
    : nameTouched && !nameError
      ? 'border-emerald-500 focus:border-emerald-500'
      : 'border-slate-200 focus:border-indigo-500';

  return (
    <>
      <div className="text-center mb-8">
        <h2 className="text-3xl text-slate-800 mb-2 font-bold">¡Bienvenido!</h2>
        <p className="text-slate-500 text-base">Comienza a digitalizar tu restaurante</p>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="mb-6">
          <label htmlFor="email" className="block font-semibold text-slate-800 mb-2 text-sm">
            Correo electrónico
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onBlur={() => setEmailTouched(true)}
            placeholder="tu@email.com"
            className={`${inputBase} ${emailBorder}`}
          />
          {emailError && (
            <p className="text-red-500 text-xs mt-1 flex items-center gap-1">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <circle cx="12" cy="12" r="10" /><path d="M12 8v4" /><path d="M12 16h.01" />
              </svg>
              {emailError}
            </p>
          )}
        </div>

        <div className="mb-6">
          <label htmlFor="restaurantName" className="block font-semibold text-slate-800 mb-2 text-sm">
            Nombre del restaurante
          </label>
          <input
            id="restaurantName"
            type="text"
            value={restaurantName}
            onChange={(e) => setRestaurantName(e.target.value)}
            onBlur={() => setNameTouched(true)}
            placeholder="Mi Restaurante"
            maxLength={NAME_MAX + 10}
            className={`${inputBase} ${nameBorder}`}
          />
          {nameError && (
            <p className="text-red-500 text-xs mt-1 flex items-center gap-1">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <circle cx="12" cy="12" r="10" /><path d="M12 8v4" /><path d="M12 16h.01" />
              </svg>
              {nameError}
            </p>
          )}
          <p className={`text-xs text-right mt-1 ${restaurantName.length > NAME_MAX ? 'text-red-500' : 'text-slate-400'}`}>
            {restaurantName.length} / {NAME_MAX}
          </p>
        </div>

        <button
          type="submit"
          disabled={!isValid}
          className="w-full py-4 px-6 bg-indigo-500 text-white border-none rounded-xl text-base font-semibold cursor-pointer flex items-center justify-center gap-2 transition-all hover:bg-indigo-600 hover:-translate-y-0.5 disabled:bg-slate-300 disabled:cursor-not-allowed disabled:translate-y-0"
        >
          Siguiente
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m9 18 6-6-6-6" />
          </svg>
        </button>
      </form>
    </>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd apps/ui && pnpm test --reporter=verbose Step1Form
```
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/ui/src/components/onboarding/Step1Form.tsx apps/ui/src/components/onboarding/Step1Form.test.tsx
git commit -m "feat(onboarding): add Step1Form with real-time validation"
```

---

## Task 3: Step2Upload component

**Files:**
- Create: `apps/ui/src/components/onboarding/Step2Upload.tsx`
- Create: `apps/ui/src/components/onboarding/Step2Upload.test.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
// apps/ui/src/components/onboarding/Step2Upload.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import Step2Upload from './Step2Upload';

const defaultProps = {
  onSubmit: vi.fn(),
  onBack: vi.fn(),
  isLoading: false,
  error: null,
};

function makeFile(name: string, type: string, sizeBytes: number): File {
  const content = new Array(sizeBytes).fill('a').join('');
  return new File([content], name, { type });
}

beforeEach(() => {
  vi.clearAllMocks();
});

test('shows AI notice about image processing', () => {
  render(<Step2Upload {...defaultProps} />);
  expect(screen.getByText(/inteligencia artificial/i)).toBeInTheDocument();
  expect(screen.getByText(/pueden requerir ajustes/i)).toBeInTheDocument();
});

test('shows "Continuar" primary button when no file selected', () => {
  render(<Step2Upload {...defaultProps} />);
  expect(screen.getByRole('button', { name: /^continuar/i })).toBeInTheDocument();
});

test('shows "Usar datos demo" secondary button always', () => {
  render(<Step2Upload {...defaultProps} />);
  expect(screen.getByRole('button', { name: /usar datos demo/i })).toBeInTheDocument();
});

test('shows "Volver" button', () => {
  render(<Step2Upload {...defaultProps} />);
  expect(screen.getByRole('button', { name: /volver/i })).toBeInTheDocument();
});

test('calls onBack when "Volver" is clicked', () => {
  const onBack = vi.fn();
  render(<Step2Upload {...defaultProps} onBack={onBack} />);
  fireEvent.click(screen.getByRole('button', { name: /volver/i }));
  expect(onBack).toHaveBeenCalledOnce();
});

test('calls onSubmit(null, false) when "Continuar" clicked without file', () => {
  const onSubmit = vi.fn();
  render(<Step2Upload {...defaultProps} onSubmit={onSubmit} />);
  fireEvent.click(screen.getByRole('button', { name: /^continuar/i }));
  expect(onSubmit).toHaveBeenCalledWith(null, false);
});

test('calls onSubmit(null, true) when "Usar datos demo" clicked', () => {
  const onSubmit = vi.fn();
  render(<Step2Upload {...defaultProps} onSubmit={onSubmit} />);
  fireEvent.click(screen.getByRole('button', { name: /usar datos demo/i }));
  expect(onSubmit).toHaveBeenCalledWith(null, true);
});

test('shows error for invalid file type', () => {
  render(<Step2Upload {...defaultProps} />);
  const input = screen.getByTestId('photo-input');
  const file = makeFile('menu.gif', 'image/gif', 100);
  fireEvent.change(input, { target: { files: [file] } });
  expect(screen.getByText(/solo se aceptan imágenes en formato JPG o PNG/i)).toBeInTheDocument();
});

test('shows error when file exceeds 5 MB', () => {
  render(<Step2Upload {...defaultProps} />);
  const input = screen.getByTestId('photo-input');
  const file = makeFile('menu.jpg', 'image/jpeg', 6 * 1024 * 1024);
  fireEvent.change(input, { target: { files: [file] } });
  expect(screen.getByText(/no puede superar 5 MB/i)).toBeInTheDocument();
});

test('shows "Procesar Menú" button when valid file selected', () => {
  render(<Step2Upload {...defaultProps} />);
  const input = screen.getByTestId('photo-input');
  const file = makeFile('menu.jpg', 'image/jpeg', 1000);
  fireEvent.change(input, { target: { files: [file] } });
  expect(screen.getByRole('button', { name: /procesar menú/i })).toBeInTheDocument();
});

test('shows file name in preview when valid file selected', () => {
  render(<Step2Upload {...defaultProps} />);
  const input = screen.getByTestId('photo-input');
  const file = makeFile('menu-foto.jpg', 'image/jpeg', 1000);
  fireEvent.change(input, { target: { files: [file] } });
  expect(screen.getByText('menu-foto.jpg')).toBeInTheDocument();
});

test('calls onSubmit(file, false) when "Procesar Menú" clicked', () => {
  const onSubmit = vi.fn();
  render(<Step2Upload {...defaultProps} onSubmit={onSubmit} />);
  const input = screen.getByTestId('photo-input');
  const file = makeFile('menu.jpg', 'image/jpeg', 1000);
  fireEvent.change(input, { target: { files: [file] } });
  fireEvent.click(screen.getByRole('button', { name: /procesar menú/i }));
  expect(onSubmit).toHaveBeenCalledWith(file, false);
});

test('removes file when remove button clicked', () => {
  render(<Step2Upload {...defaultProps} />);
  const input = screen.getByTestId('photo-input');
  fireEvent.change(input, { target: { files: [makeFile('menu.jpg', 'image/jpeg', 1000)] } });
  fireEvent.click(screen.getByRole('button', { name: /eliminar foto/i }));
  expect(screen.queryByText('menu.jpg')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: /^continuar/i })).toBeInTheDocument();
});

test('disables primary button and demo button when isLoading', () => {
  render(<Step2Upload {...defaultProps} isLoading={true} />);
  expect(screen.getByRole('button', { name: /^continuar/i })).toBeDisabled();
  expect(screen.getByRole('button', { name: /usar datos demo/i })).toBeDisabled();
});

test('shows API error message when error prop is set', () => {
  render(<Step2Upload {...defaultProps} error="Este correo ya está registrado" />);
  expect(screen.getByText('Este correo ya está registrado')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd apps/ui && pnpm test --reporter=verbose Step2Upload
```
Expected: all failures.

- [ ] **Step 3: Implement Step2Upload**

```tsx
// apps/ui/src/components/onboarding/Step2Upload.tsx
import { useState, useRef } from 'react';

const ACCEPTED_TYPES = ['image/jpeg', 'image/png'];
const MAX_SIZE_BYTES = 5 * 1024 * 1024;

function validateFile(file: File): string | null {
  if (!ACCEPTED_TYPES.includes(file.type)) return 'Solo se aceptan imágenes en formato JPG o PNG.';
  if (file.size > MAX_SIZE_BYTES) return 'La imagen no puede superar 5 MB.';
  return null;
}

interface Step2UploadProps {
  onSubmit: (photo: File | null, useDemo: boolean) => void;
  onBack: () => void;
  isLoading: boolean;
  error: string | null;
}

export default function Step2Upload({ onSubmit, onBack, isLoading, error }: Step2UploadProps) {
  const [photo, setPhoto] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFile(file: File) {
    const err = validateFile(file);
    if (err) {
      setFileError(err);
      setPhoto(null);
    } else {
      setFileError(null);
      setPhoto(file);
    }
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = '';
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }

  return (
    <>
      <div className="text-center mb-8">
        <h2 className="text-3xl text-slate-800 mb-2 font-bold">Tu Menú</h2>
        <p className="text-slate-500 text-base">Carga tu carta para comenzar</p>
      </div>

      <div className="flex gap-3 items-start bg-violet-50 border border-violet-200 rounded-xl p-4 mb-5">
        <div className="text-violet-600 flex-shrink-0 mt-0.5">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" />
          </svg>
        </div>
        <p className="text-sm text-violet-800 m-0 leading-relaxed">
          <strong className="block mb-0.5">Procesamiento con inteligencia artificial</strong>
          Sube una fotografía de tu menú y extraeremos tus productos de forma automática.
          Te recomendamos revisar los resultados, ya que pueden requerir ajustes.
        </p>
      </div>

      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all mb-3 ${
          photo
            ? 'border-indigo-500 bg-indigo-50'
            : isDragOver
              ? 'border-indigo-400 bg-indigo-50'
              : 'border-slate-200 bg-gray-50 hover:border-indigo-500 hover:bg-indigo-50/50'
        }`}
      >
        <div className={`mb-3 ${photo ? 'text-indigo-500' : 'text-indigo-300'}`}>
          <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
        </div>
        {photo ? (
          <>
            <p className="text-slate-800 font-medium m-0 mb-1">Foto seleccionada</p>
            <p className="text-indigo-500 text-sm m-0">Haz clic para cambiarla</p>
          </>
        ) : (
          <>
            <p className="text-slate-800 font-medium m-0 mb-1">Arrastra la foto aquí o haz clic</p>
            <p className="text-slate-500 text-sm m-0">1 imagen · PNG o JPG · máx 5 MB</p>
          </>
        )}
        <input
          data-testid="photo-input"
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png"
          className="hidden"
          onChange={handleInputChange}
        />
      </div>

      {fileError && (
        <p className="text-red-500 text-xs mb-3 flex items-center gap-1">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <circle cx="12" cy="12" r="10" /><path d="M12 8v4" /><path d="M12 16h.01" />
          </svg>
          {fileError}
        </p>
      )}

      {photo && (
        <div className="flex items-center justify-between bg-slate-100 rounded-lg px-3 py-2 mb-4 text-sm text-slate-700">
          <div className="flex items-center gap-2">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2">
              <rect width="18" height="18" x="3" y="3" rx="2" /><circle cx="9" cy="9" r="2" />
              <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
            </svg>
            {photo.name}
          </div>
          <button
            type="button"
            aria-label="Eliminar foto"
            onClick={(e) => { e.stopPropagation(); setPhoto(null); setFileError(null); }}
            className="text-red-500 hover:text-red-700 text-lg leading-none bg-transparent border-none cursor-pointer p-0"
          >
            ×
          </button>
        </div>
      )}

      {error && (
        <p className="text-red-500 text-sm mb-4 text-center font-medium">{error}</p>
      )}

      <div className="flex gap-3 mb-3">
        <button
          type="button"
          disabled={isLoading}
          onClick={() => onSubmit(photo, false)}
          className="flex-1 py-4 px-6 bg-indigo-500 text-white border-none rounded-xl text-base font-semibold cursor-pointer flex items-center justify-center gap-2 transition-all hover:bg-indigo-600 hover:-translate-y-0.5 disabled:bg-slate-300 disabled:cursor-not-allowed disabled:translate-y-0"
        >
          {isLoading ? 'Procesando...' : photo ? 'Procesar Menú' : 'Continuar'}
          {!isLoading && (
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="m9 18 6-6-6-6" />
            </svg>
          )}
        </button>
      </div>

      <button
        type="button"
        disabled={isLoading}
        onClick={() => onSubmit(null, true)}
        className="w-full py-3 px-6 bg-white text-slate-500 border-2 border-slate-200 rounded-xl text-sm font-semibold cursor-pointer transition-all hover:bg-slate-50 hover:border-slate-400 disabled:opacity-50 disabled:cursor-not-allowed mb-4"
      >
        Usar datos demo
      </button>

      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-1 bg-transparent border-none text-slate-400 text-sm cursor-pointer p-0 hover:text-indigo-500 transition-colors"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="m15 18-6-6 6-6" />
        </svg>
        Volver
      </button>
    </>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd apps/ui && pnpm test --reporter=verbose Step2Upload
```
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/ui/src/components/onboarding/Step2Upload.tsx apps/ui/src/components/onboarding/Step2Upload.test.tsx
git commit -m "feat(onboarding): add Step2Upload with file validation and AI notice"
```

---

## Task 4: OnboardingWizard — step orchestration and API call

**Files:**
- Create: `apps/ui/src/components/onboarding/OnboardingWizard.tsx`
- Create: `apps/ui/src/components/onboarding/OnboardingWizard.test.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
// apps/ui/src/components/onboarding/OnboardingWizard.test.tsx
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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd apps/ui && pnpm test --reporter=verbose OnboardingWizard
```
Expected: all failures.

- [ ] **Step 3: Implement OnboardingWizard**

```tsx
// apps/ui/src/components/onboarding/OnboardingWizard.tsx
import { useState } from 'react';
import Step1Form from './Step1Form';
import Step2Upload from './Step2Upload';
import Step3Success from './Step3Success';
import { getErrorMessage } from '../../lib/error-messages';

type Step = 1 | 2 | 3;

interface Step1Data {
  email: string;
  restaurantName: string;
}

const API_URL = (import.meta as { env: Record<string, string> }).env.PUBLIC_API_URL ?? 'http://localhost:3000';

function StepIndicator({ current }: { current: Step }) {
  const steps: { n: Step; label: string }[] = [
    { n: 1, label: 'Información' },
    { n: 2, label: 'Menú' },
    { n: 3, label: 'Confirmación' },
  ];

  return (
    <div className="flex items-center justify-center mb-10 gap-2">
      {steps.map((s, i) => {
        const done = s.n < current;
        const active = s.n === current;
        return (
          <div key={s.n} className="flex items-center gap-2">
            <div className="flex flex-col items-center gap-1">
              <div
                data-testid={`step-${s.n}`}
                data-active={String(active)}
                className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold text-base transition-all duration-300 ${
                  done
                    ? 'bg-emerald-500 text-white'
                    : active
                      ? 'bg-indigo-500 text-white'
                      : 'bg-slate-200 text-slate-500'
                }`}
              >
                {done ? '✓' : s.n}
              </div>
              <span
                className={`text-xs font-semibold ${
                  active ? 'text-indigo-500' : 'text-slate-500'
                }`}
              >
                {s.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div
                className={`h-[3px] w-[60px] mb-6 transition-colors duration-300 rounded-full ${
                  done ? 'bg-indigo-500' : 'bg-slate-200'
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function OnboardingWizard() {
  const [step, setStep] = useState<Step>(1);
  const [formData, setFormData] = useState<Step1Data | null>(null);
  const [productsCreated, setProductsCreated] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleStep1Submit(data: Step1Data) {
    setFormData(data);
    setError(null);
    setStep(2);
  }

  async function handleStep2Submit(photo: File | null, useDemo: boolean) {
    if (!formData) return;

    setIsLoading(true);
    setError(null);

    const body = new globalThis.FormData();
    body.append('email', formData.email);
    body.append('restaurantName', formData.restaurantName);
    if (useDemo) {
      body.append('createDemoData', 'true');
    } else if (photo) {
      body.append('photos', photo);
    }

    try {
      const response = await fetch(`${API_URL}/v1/onboarding/register`, {
        method: 'POST',
        body,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        const msg = errorData?.code
          ? getErrorMessage(errorData.code)
          : 'Hubo un error al procesar tu solicitud.';
        setError(msg);
        return;
      }

      const result = await response.json();
      setProductsCreated(result.productsCreated ?? 0);
      setStep(3);
    } catch {
      setError('Hubo un error al procesar tu solicitud. Intenta nuevamente.');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="bg-white/95 rounded-3xl shadow-2xl w-full max-w-[520px] p-10 relative overflow-hidden">
      <StepIndicator current={step} />

      {step === 1 && <Step1Form onSubmit={handleStep1Submit} />}
      {step === 2 && (
        <Step2Upload
          onSubmit={handleStep2Submit}
          onBack={() => setStep(1)}
          isLoading={isLoading}
          error={error}
        />
      )}
      {step === 3 && formData && (
        <Step3Success
          email={formData.email}
          restaurantName={formData.restaurantName}
          productsCreated={productsCreated}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd apps/ui && pnpm test --reporter=verbose OnboardingWizard
```
Expected: all PASS.

- [ ] **Step 5: Run full test suite to check for regressions**

```bash
cd apps/ui && pnpm test
```
Expected: all existing tests still PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/ui/src/components/onboarding/OnboardingWizard.tsx apps/ui/src/components/onboarding/OnboardingWizard.test.tsx
git commit -m "feat(onboarding): add OnboardingWizard with step orchestration and API call"
```

---

## Task 5: Update onboarding.astro to mount React wizard

**Files:**
- Modify: `apps/ui/src/pages/onboarding.astro`

No test needed — this is a wiring change covered by manual smoke test.

- [ ] **Step 1: Replace onboarding.astro content**

```astro
---
export const prerender = true;
import Layout from "../layouts/Layout.astro";
import OnboardingWizard from "../components/onboarding/OnboardingWizard";
---

<Layout>
  <div class="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#667eea] to-[#764ba2] p-8 px-4">
    <OnboardingWizard client:load />
  </div>
</Layout>
```

- [ ] **Step 2: Start the dev server and verify visually**

```bash
cd apps/ui && pnpm dev
```

Open http://localhost:4321/onboarding and verify:
1. Step 1 shows with email + restaurant name inputs
2. Step indicator shows step 1 active
3. "Siguiente" starts disabled — becomes enabled when both fields are valid
4. Email validation fires on blur with invalid input
5. Name validation shows error for special characters (e.g. type `Café@2`)
6. Character counter shows below name field
7. Advancing to step 2 shows AI notice + upload area
8. Uploading a `.gif` shows the format error
9. Uploading a valid image shows "Procesar Menú" + file preview
10. "Usar datos demo" is always visible
11. "Volver" goes back to step 1
12. Submitting via "Continuar" (no file) reaches step 3 with correct name/email/count
13. Step 3 shows the email notice (no conditional state)

- [ ] **Step 3: Commit**

```bash
git add apps/ui/src/pages/onboarding.astro
git commit -m "feat(onboarding): wire OnboardingWizard into onboarding.astro"
```
