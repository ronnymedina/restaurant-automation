# Login & Onboarding Color Consistency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar la paleta indigo/morado en login y onboarding por la paleta Clara & Moderna (`#fafaf8` / `#f97316` / `#111`) de la landing.

**Architecture:** Reemplazo directo de hex inline (Approach A) — sin cambios a tailwind.config ni CSS custom properties. Cada archivo se reescribe con el contenido completo para evitar ediciones parciales. Lógica JS/TS intacta.

**Tech Stack:** Astro, React (TSX), Tailwind CSS

---

## File Map

| Acción | Archivo |
|--------|---------|
| Modify | `apps/ui/src/pages/login.astro` |
| Modify | `apps/ui/src/pages/onboarding.astro` |
| Modify | `apps/ui/src/components/onboarding/OnboardingWizard.tsx` |
| Modify | `apps/ui/src/components/onboarding/Step1Form.tsx` |
| Modify | `apps/ui/src/components/onboarding/Step2Upload.tsx` |
| Modify | `apps/ui/src/components/onboarding/Step3Success.tsx` |

---

### Task 1: Actualizar `login.astro`

**Files:**
- Modify: `apps/ui/src/pages/login.astro`

- [ ] **Step 1: Verificar servidor de desarrollo disponible**

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:4321
```
Esperado: `200`. Si no corre, desde la raíz: `docker compose up res-ui`

- [ ] **Step 2: Reemplazar el contenido completo de `login.astro`**

```astro
---
export const prerender = true;
import Layout from "../layouts/Layout.astro";
---

<Layout>
  <div class="min-h-screen flex items-center justify-center bg-[#fafaf8] p-8 px-4">
    <div class="bg-white rounded-xl shadow-md w-full max-w-[440px] p-10 relative overflow-hidden">
      <div class="text-center mb-8">
        <div class="text-[#f97316] mb-4">
          <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"></path>
            <polyline points="10 17 15 12 10 7"></polyline>
            <line x1="15" x2="3" y1="12" y2="12"></line>
          </svg>
        </div>
        <h2 class="text-3xl text-slate-800 mb-2 font-bold">Iniciar sesión</h2>
        <p class="text-slate-500 text-base m-0">Ingresa a tu dashboard</p>
      </div>

      <form id="loginForm">
        <div class="mb-6">
          <label for="email" class="block font-semibold text-slate-800 mb-2 text-sm">Correo electrónico</label>
          <input
            type="email"
            id="email"
            name="email"
            placeholder="tu@email.com"
            required
            class="w-full py-3.5 px-4 border-2 border-slate-200 rounded-xl text-base transition-all bg-white text-slate-800 box-border focus:outline-none focus:border-[#f97316] focus:ring-4 focus:ring-[#f97316]/10 placeholder:text-slate-400"
          />
        </div>

        <div class="mb-6">
          <label for="password" class="block font-semibold text-slate-800 mb-2 text-sm">Contraseña</label>
          <input
            type="password"
            id="password"
            name="password"
            placeholder="Tu contraseña"
            minlength="8"
            required
            class="w-full py-3.5 px-4 border-2 border-slate-200 rounded-xl text-base transition-all bg-white text-slate-800 box-border focus:outline-none focus:border-[#f97316] focus:ring-4 focus:ring-[#f97316]/10 placeholder:text-slate-400"
          />
        </div>

        <button type="submit" class="w-full py-4 px-6 bg-[#f97316] text-white border-none rounded-xl text-base font-semibold cursor-pointer flex items-center justify-center gap-2 transition-all hover:bg-[#ea6c0a] hover:-translate-y-0.5 disabled:bg-slate-300 disabled:cursor-not-allowed" id="submitBtn">
          Entrar
        </button>
      </form>

      <p class="text-center text-slate-500 text-sm mt-6">
        ¿No tienes cuenta? <a href="/onboarding" class="text-[#f97316] font-semibold no-underline hover:text-[#ea6c0a]">Regístrate aquí</a>
      </p>

      <!-- Loading Overlay -->
      <div class="loading-overlay absolute inset-0 bg-white/95 hidden flex-col items-center justify-center gap-4 rounded-xl z-10" id="loadingOverlay">
        <div class="spinner w-12 h-12 border-4 border-slate-200 border-t-[#f97316] rounded-full"></div>
        <p class="text-slate-500 font-medium">Iniciando sesión...</p>
      </div>

      <!-- Error Message -->
      <div class="error-toast absolute bottom-4 left-4 right-4 bg-red-500 text-white p-4 rounded-xl hidden items-center justify-between" id="errorMessage">
        <p class="m-0 font-medium"></p>
        <button type="button" class="bg-transparent border-none text-white text-2xl cursor-pointer p-0 leading-none" id="closeError">×</button>
      </div>
    </div>
  </div>
</Layout>

<style>
  .loading-overlay.visible {
    display: flex;
  }
  .error-toast.visible {
    display: flex;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }
  @keyframes slideUp {
    from { transform: translateY(100%); opacity: 0; }
    to { transform: translateY(0); opacity: 1; }
  }

  .spinner {
    animation: spin 1s linear infinite;
  }
  .error-toast {
    animation: slideUp 0.3s ease;
  }
</style>

<script>
  import { setTokens, isAuthenticated, setRestaurantTimezone } from '../lib/auth';
  import { getErrorMessage } from '../lib/error-messages';

  // Redirect if already authenticated
  if (isAuthenticated()) {
    window.location.href = '/dash';
  }

  const API_URL = import.meta.env.PUBLIC_API_URL || 'http://localhost:3000';

  const loginForm = document.getElementById('loginForm') as HTMLFormElement;
  const loadingOverlay = document.getElementById('loadingOverlay') as HTMLDivElement;
  const errorMessage = document.getElementById('errorMessage') as HTMLDivElement;
  const closeError = document.getElementById('closeError') as HTMLButtonElement;

  function setLoading(loading: boolean) {
    loadingOverlay.classList.toggle('visible', loading);
  }

  function showError(message: string) {
    const errorP = errorMessage.querySelector('p') as HTMLParagraphElement;
    errorP.textContent = message;
    errorMessage.classList.add('visible');
    setTimeout(() => errorMessage.classList.remove('visible'), 5000);
  }

  closeError.addEventListener('click', () => {
    errorMessage.classList.remove('visible');
  });

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const email = (document.getElementById('email') as HTMLInputElement).value.trim();
    const password = (document.getElementById('password') as HTMLInputElement).value;

    if (!email || !password) {
      showError('Por favor completa todos los campos');
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(`${API_URL}/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        if (errorData?.code) {
          showError(getErrorMessage(errorData.code));
        } else {
          showError('Error al iniciar sesión');
        }
        return;
      }

      const result = await response.json();
      setTokens(result.accessToken, result.refreshToken);
      setRestaurantTimezone(result.timezone ?? 'UTC');
      window.location.href = '/dash';
    } catch (error) {
      console.error('Login error:', error);
      showError('Error de conexión. Intenta nuevamente.');
    } finally {
      setLoading(false);
    }
  });
</script>
```

- [ ] **Step 3: Verificar en `http://localhost:4321/login`**

  - [ ] Fondo crema `#fafaf8` (no gradiente morado)
  - [ ] Card blanca con esquinas redondeadas moderadas (`rounded-xl`), sin el glass effect
  - [ ] Icono de login naranja
  - [ ] Botón "Entrar" naranja sólido
  - [ ] Link "Regístrate aquí" naranja

- [ ] **Step 4: Commit**

```bash
git add apps/ui/src/pages/login.astro
git commit -m "feat(ui): paleta Clara & Moderna en login"
```

---

### Task 2: Actualizar wrapper de onboarding y card del wizard

**Files:**
- Modify: `apps/ui/src/pages/onboarding.astro`
- Modify: `apps/ui/src/components/onboarding/OnboardingWizard.tsx`

- [ ] **Step 1: Reemplazar `onboarding.astro`**

```astro
---
export const prerender = true;
import Layout from "../layouts/Layout.astro";
import OnboardingWizard from "../components/onboarding/OnboardingWizard";
---

<Layout>
  <div class="min-h-screen flex items-center justify-center bg-[#fafaf8] p-8 px-4">
    <OnboardingWizard client:load />
  </div>
</Layout>
```

- [ ] **Step 2: Reemplazar `OnboardingWizard.tsx`**

```tsx
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

const API_URL = import.meta.env.PUBLIC_API_URL || 'http://localhost:3000';

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
                      ? 'bg-[#f97316] text-white'
                      : 'bg-slate-200 text-slate-500'
                }`}
              >
                {done ? '✓' : s.n}
              </div>
              <span
                className={`text-xs font-semibold ${
                  active ? 'text-[#f97316]' : 'text-slate-500'
                }`}
              >
                {s.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div
                className={`h-[3px] w-[60px] mb-6 transition-colors duration-300 rounded-full ${
                  done ? 'bg-[#f97316]' : 'bg-slate-200'
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
    body.append('timezone', Intl.DateTimeFormat().resolvedOptions().timeZone);
    if (useDemo) {
      body.append('createDemoData', 'true');
    } else if (photo) {
      body.append('photo', photo);
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
    <div className="bg-white rounded-xl shadow-md w-full max-w-[520px] p-10 relative overflow-hidden">
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

- [ ] **Step 3: Verificar en `http://localhost:4321/onboarding`**

  - [ ] Fondo crema `#fafaf8`
  - [ ] Card blanca `rounded-xl shadow-md` (sin glass, sin `rounded-3xl`)
  - [ ] Step indicator activo (círculo y label del paso 1) en naranja
  - [ ] Conector entre steps completados en naranja (avanzar al paso 2 para verificar)

- [ ] **Step 4: Commit**

```bash
git add apps/ui/src/pages/onboarding.astro apps/ui/src/components/onboarding/OnboardingWizard.tsx
git commit -m "feat(ui): paleta Clara & Moderna en wrapper onboarding y step indicator"
```

---

### Task 3: Actualizar componentes de pasos del wizard

**Files:**
- Modify: `apps/ui/src/components/onboarding/Step1Form.tsx`
- Modify: `apps/ui/src/components/onboarding/Step2Upload.tsx`
- Modify: `apps/ui/src/components/onboarding/Step3Success.tsx`

- [ ] **Step 1: Reemplazar `Step1Form.tsx`**

```tsx
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
  'w-full py-3.5 px-4 border-2 rounded-xl text-base transition-all bg-white text-slate-800 box-border focus:outline-none focus:ring-4 focus:ring-[#f97316]/10 placeholder:text-slate-400';

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
      : 'border-slate-200 focus:border-[#f97316]';

  const nameBorder = nameError
    ? 'border-red-500 focus:border-red-500'
    : nameTouched && !nameError
      ? 'border-emerald-500 focus:border-emerald-500'
      : 'border-slate-200 focus:border-[#f97316]';

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
          className="w-full py-4 px-6 bg-[#f97316] text-white border-none rounded-xl text-base font-semibold cursor-pointer flex items-center justify-center gap-2 transition-all hover:bg-[#ea6c0a] hover:-translate-y-0.5 disabled:bg-slate-300 disabled:cursor-not-allowed disabled:translate-y-0"
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

- [ ] **Step 2: Reemplazar `Step2Upload.tsx`**

```tsx
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

      <div className="flex gap-3 items-start bg-orange-50 border border-orange-200 rounded-xl p-4 mb-5">
        <div className="text-[#f97316] flex-shrink-0 mt-0.5">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" />
          </svg>
        </div>
        <p className="text-sm text-[#9a3412] m-0 leading-relaxed">
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
            ? 'border-[#f97316] bg-orange-50'
            : isDragOver
              ? 'border-[#f97316]/70 bg-orange-50'
              : 'border-slate-200 bg-gray-50 hover:border-[#f97316] hover:bg-orange-50/50'
        }`}
      >
        <div className={`mb-3 ${photo ? 'text-[#f97316]' : 'text-[#f97316]/30'}`}>
          <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
        </div>
        {photo ? (
          <>
            <p className="text-slate-800 font-medium m-0 mb-1">Foto seleccionada</p>
            <p className="text-[#f97316] text-sm m-0">Haz clic para cambiarla</p>
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
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f97316" strokeWidth="2">
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
          aria-label={photo ? 'Procesar Menú' : 'Continuar'}
          className="flex-1 py-4 px-6 bg-[#f97316] text-white border-none rounded-xl text-base font-semibold cursor-pointer flex items-center justify-center gap-2 transition-all hover:bg-[#ea6c0a] hover:-translate-y-0.5 disabled:bg-slate-300 disabled:cursor-not-allowed disabled:translate-y-0"
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
        disabled={isLoading}
        onClick={onBack}
        className="flex items-center gap-1 bg-transparent border-none text-slate-400 text-sm cursor-pointer p-0 hover:text-[#f97316] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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

- [ ] **Step 3: Reemplazar `Step3Success.tsx`**

```tsx
interface Step3SuccessProps {
  email: string;
  restaurantName: string;
  productsCreated: number;
}

export default function Step3Success({ email, restaurantName, productsCreated }: Step3SuccessProps) {
  return (
    <div className="text-center">
      <style>{`@keyframes scaleIn { from { transform: scale(0); opacity: 0; } to { transform: scale(1); opacity: 1; } }`}</style>
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

      <div className="flex gap-4 p-5 bg-orange-50 rounded-xl border border-orange-200">
        <div className="text-[#f97316] flex-shrink-0 mt-0.5">
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

- [ ] **Step 4: Verificar flujo completo en `http://localhost:4321/onboarding`**

  - [ ] Step 1: Botón "Siguiente" naranja, focus en inputs naranja
  - [ ] Step 2: Drop zone naranja al hover/seleccionar, info box naranja, botón "Continuar" naranja, botón "Volver" hover naranja
  - [ ] (Step 3 se verifica visualmente si hay API disponible, o se omite)

- [ ] **Step 5: Commit**

```bash
git add apps/ui/src/components/onboarding/Step1Form.tsx apps/ui/src/components/onboarding/Step2Upload.tsx apps/ui/src/components/onboarding/Step3Success.tsx
git commit -m "feat(ui): paleta Clara & Moderna en pasos del wizard onboarding"
```

---

## Self-Review contra el spec

| Requisito del spec | Cubierto |
|---|---|
| Wrapper bg login: gradiente → `#fafaf8` | ✅ Task 1 Step 2 |
| Card login: `rounded-3xl shadow-2xl bg-white/95` → `rounded-xl shadow-md bg-white` | ✅ Task 1 Step 2 |
| Icono login: `text-indigo-500` → `text-[#f97316]` | ✅ Task 1 Step 2 |
| Input focus login: indigo → naranja | ✅ Task 1 Step 2 |
| Botón login: indigo → naranja | ✅ Task 1 Step 2 |
| Spinner: `border-t-indigo-500` → `border-t-[#f97316]` | ✅ Task 1 Step 2 |
| Link registro: indigo → naranja | ✅ Task 1 Step 2 |
| Wrapper bg onboarding: gradiente → `#fafaf8` | ✅ Task 2 Step 1 |
| Card wizard: `rounded-3xl shadow-2xl bg-white/95` → `rounded-xl shadow-md bg-white` | ✅ Task 2 Step 2 |
| Step activo (círculo): `bg-indigo-500` → `bg-[#f97316]` | ✅ Task 2 Step 2 |
| Conector completado: `bg-indigo-500` → `bg-[#f97316]` | ✅ Task 2 Step 2 |
| Label activo: `text-indigo-500` → `text-[#f97316]` | ✅ Task 2 Step 2 |
| Focus inputs Step1: indigo → naranja | ✅ Task 3 Step 1 |
| Botón "Siguiente": indigo → naranja | ✅ Task 3 Step 1 |
| Drop zone: indigo → naranja | ✅ Task 3 Step 2 |
| Info box AI: violet → orange | ✅ Task 3 Step 2 |
| Botón "Continuar/Procesar": indigo → naranja | ✅ Task 3 Step 2 |
| Back hover: indigo → naranja | ✅ Task 3 Step 2 |
| Stroke imagen: `#6366f1` → `#f97316` | ✅ Task 3 Step 2 |
| Icono email Step3: `text-indigo-500` → `text-[#f97316]` | ✅ Task 3 Step 3 |
| Info box "Revisa tu correo": blue → orange | ✅ Task 3 Step 3 |
| Colores semánticos (emerald, red, green) sin cambiar | ✅ Ninguna tarea los modifica |
