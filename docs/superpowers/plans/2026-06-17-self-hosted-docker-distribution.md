# Distribución self-hosted con Docker — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir autohospedar la plataforma con Docker: imágenes `prod` de api-core + ui publicadas en GHCR, un `docker-compose.yml` de un comando, migraciones automáticas, y activación de la cuenta admin sin email (link mostrado en la UI).

**Architecture:** Tres contenedores (`postgres` + `api-core` + `ui`) orquestados por un compose. api-core corre `prisma migrate deploy` al arrancar y sirve la API; ui (nginx) sirve la SPA e inyecta `PUBLIC_API_URL` en runtime. La PC instalada es servidor LAN; otros dispositivos entran por su IP. Cuando no hay proveedor de email, el onboarding devuelve el link de activación y la UI lo muestra.

**Tech Stack:** NestJS + Prisma + PostgreSQL (api-core), Astro SPA + nginx (ui), Docker Compose, GHCR. Tests: Jest (api-core), Vitest (ui). Spec: `docs/superpowers/specs/2026-06-17-self-hosted-docker-distribution-design.md`.

---

## Convenciones de ejecución

- **Tests de api-core SIEMPRE dentro del contenedor:** `docker compose exec res-api-core pnpm test <patrón>`.
- **Tests de ui dentro del contenedor, sin pnpm:** `docker compose exec -T res-ui node_modules/.bin/vitest run <archivo>`. Hay un **baseline de ~13 fallas UI preexistentes** ajenas a este trabajo; comparar contra ese baseline.
- Levantar el entorno de dev antes de testear: `docker compose up -d res-api-core res-db res-ui`.
- Sin `any` (ESLint `@typescript-eslint/no-explicit-any: error`). Contrato de error ADR 0007.
- Commits frecuentes, uno por tarea.

---

## File Structure

**api-core (modificar):**
- `apps/api-core/src/email/email.service.ts` — añade `isEnabled()` y `buildActivationUrl()`.
- `apps/api-core/src/email/email.service.spec.ts` — tests de los dos métodos.
- `apps/api-core/src/onboarding/onboarding.service.ts` — `OnboardingResult.activationUrl` + cálculo.
- `apps/api-core/src/onboarding/onboarding.service.spec.ts` — tests del link en modo self-hosted.
- `apps/api-core/src/onboarding/onboarding.controller.ts` — propaga `activationUrl` en la respuesta.
- `apps/api-core/src/onboarding/serializers/onboarding-response.serializer.ts` — campo `activationUrl`.
- `apps/api-core/Dockerfile` — directorio de uploads escribible por `node`.

**ui (modificar):**
- `apps/ui/src/components/onboarding/Step3Success.tsx` — panel de activación cuando hay `activationUrl`.
- `apps/ui/src/components/onboarding/Step3Success.test.tsx` — test del panel de activación.
- `apps/ui/src/components/onboarding/OnboardingWizard.tsx` — estado y pase de `activationUrl`.
- `apps/ui/src/components/onboarding/OnboardingWizard.test.tsx` — test de flujo self-hosted.

**Entregables nuevos:**
- `deploy/docker-compose.yml` — compose de self-host (imágenes GHCR).
- `deploy/.env.example` — plantilla de configuración.
- `docs/self-hosting.md` — guía de instalación (base del post).
- `docs/self-hosting-publishing.md` — build/push manual a GHCR (para el mantenedor).

**Docs a actualizar:**
- `apps/api-core/src/onboarding/onboarding.module.info.md`
- `apps/api-core/src/onboarding/onboarding.flow.mmd`
- `apps/api-core/docs/onboarding-error-mapping.md`

---

## Task 1: EmailService — `isEnabled()` y `buildActivationUrl()`

**Files:**
- Modify: `apps/api-core/src/email/email.service.ts`
- Test: `apps/api-core/src/email/email.service.spec.ts`

- [ ] **Step 1: Escribir los tests que fallan**

Añadir al final de `email.service.spec.ts`, dentro del `describe('EmailService', ...)` (después del `describe('sendActivationEmail', ...)`):

```ts
  describe('isEnabled', () => {
    it('returns true when an API key is configured', () => {
      expect(service.isEnabled()).toBe(true);
    });

    it('returns false when no API key is configured', async () => {
      const module = await Test.createTestingModule({
        providers: [
          EmailService,
          { provide: emailConfig.KEY, useValue: { ...mockConfig, resendApiKey: null } },
        ],
      }).compile();
      const noKeyService = module.get<EmailService>(EmailService);
      expect(noKeyService.isEnabled()).toBe(false);
    });
  });

  describe('buildActivationUrl', () => {
    it('builds the activation URL from the configured frontend URL', () => {
      expect(service.buildActivationUrl('abc')).toBe('http://localhost:4321/activate?token=abc');
    });
  });
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `docker compose exec res-api-core pnpm test email.service`
Expected: FAIL — `service.isEnabled is not a function` / `service.buildActivationUrl is not a function`.

- [ ] **Step 3: Implementar los métodos**

En `apps/api-core/src/email/email.service.ts`, añadir estos métodos públicos justo después del `constructor` (antes de `sendActivationEmail`):

```ts
  /** True cuando Resend está configurado y los emails se envían de verdad. */
  isEnabled(): boolean {
    return this.resend !== null;
  }

  /** Construye la URL de activación. Reutilizada por el email y por el onboarding self-hosted. */
  buildActivationUrl(token: string): string {
    return `${this.configService.frontendUrl}/activate?token=${token}`;
  }
```

Y refactorizar la primera línea de `sendActivationEmail` para reutilizar el helper (DRY). Reemplazar:

```ts
    const activationUrl = `${this.configService.frontendUrl}/activate?token=${token}`;
```

por:

```ts
    const activationUrl = this.buildActivationUrl(token);
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `docker compose exec res-api-core pnpm test email.service`
Expected: PASS (todos, incluidos los 6 tests previos de `sendActivationEmail`).

- [ ] **Step 5: Commit**

```bash
git add apps/api-core/src/email/email.service.ts apps/api-core/src/email/email.service.spec.ts
git commit -m "feat(email): exponer isEnabled() y buildActivationUrl() en EmailService

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: OnboardingService devuelve `activationUrl` sin email

**Files:**
- Modify: `apps/api-core/src/onboarding/onboarding.service.ts`
- Test: `apps/api-core/src/onboarding/onboarding.service.spec.ts`

- [ ] **Step 1: Escribir los tests que fallan**

En `onboarding.service.spec.ts`, actualizar el mock de EmailService. Reemplazar:

```ts
const mockEmailService = { sendActivationEmail: jest.fn() };
```

por:

```ts
const mockEmailService = {
  sendActivationEmail: jest.fn(),
  isEnabled: jest.fn(),
  buildActivationUrl: jest.fn(),
};
```

En el `beforeEach`, junto a los demás defaults happy-path (después de `mockEmailService.sendActivationEmail.mockResolvedValue(true);`), añadir:

```ts
    mockEmailService.isEnabled.mockReturnValue(true);
    mockEmailService.buildActivationUrl.mockReturnValue(
      'http://host:8080/activate?token=activation-token-uuid',
    );
```

Y añadir un nuevo `describe` al final del `describe('OnboardingService', ...)`:

```ts
  describe('self-hosted activation link', () => {
    it('omits activationUrl when email is enabled', async () => {
      mockEmailService.isEnabled.mockReturnValue(true);

      const result = await service.registerRestaurant({
        email: 'new@test.com', restaurantName: 'Test', country: 'CL',
      });

      expect(result.activationUrl).toBeUndefined();
      expect(mockEmailService.buildActivationUrl).not.toHaveBeenCalled();
    });

    it('returns activationUrl from the token when email is disabled', async () => {
      mockEmailService.isEnabled.mockReturnValue(false);

      const result = await service.registerRestaurant({
        email: 'new@test.com', restaurantName: 'Test', country: 'CL',
      });

      expect(mockEmailService.buildActivationUrl).toHaveBeenCalledWith('activation-token-uuid');
      expect(result.activationUrl).toBe('http://host:8080/activate?token=activation-token-uuid');
    });
  });
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `docker compose exec res-api-core pnpm test onboarding.service`
Expected: FAIL — `result.activationUrl` es `undefined` en el caso "email disabled" (el campo aún no existe).

- [ ] **Step 3: Implementar el cálculo del link**

En `apps/api-core/src/onboarding/onboarding.service.ts`:

a) Añadir el campo opcional a la interfaz `OnboardingResult`:

```ts
export interface OnboardingResult {
  productsCreated: number;
  productsWarning?: ProductsWarning;
  activationUrl?: string;
}
```

b) En `registerRestaurant`, reemplazar el bloque final. Cambiar:

```ts
    // 3. Send activation email right after core setup — independent of products
    await this.sendActivationEmail(user.email, user.activationToken!);

    // 4. Process products — non-fatal, failure returns a warning for the frontend
    const { count: productsCreated, warning: productsWarning } = await this.resolveProducts(restaurant.id, defaultCategoryId, input);

    return { productsCreated, productsWarning };
```

por:

```ts
    // 3. Send activation email right after core setup — independent of products
    await this.sendActivationEmail(user.email, user.activationToken!);

    // 3b. Self-hosted (sin proveedor de email): exponer el link para que la UI lo muestre.
    //     Con email configurado, el link va por correo y NO se expone en la respuesta.
    const activationUrl = this.emailService.isEnabled()
      ? undefined
      : this.emailService.buildActivationUrl(user.activationToken!);

    // 4. Process products — non-fatal, failure returns a warning for the frontend
    const { count: productsCreated, warning: productsWarning } = await this.resolveProducts(restaurant.id, defaultCategoryId, input);

    return { productsCreated, productsWarning, activationUrl };
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `docker compose exec res-api-core pnpm test onboarding.service`
Expected: PASS (nuevos + todos los previos).

- [ ] **Step 5: Commit**

```bash
git add apps/api-core/src/onboarding/onboarding.service.ts apps/api-core/src/onboarding/onboarding.service.spec.ts
git commit -m "feat(onboarding): devolver activationUrl cuando el email está deshabilitado

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Exponer `activationUrl` en controller + serializer

**Files:**
- Modify: `apps/api-core/src/onboarding/serializers/onboarding-response.serializer.ts`
- Modify: `apps/api-core/src/onboarding/onboarding.controller.ts`

- [ ] **Step 1: Añadir el campo al serializer**

En `onboarding-response.serializer.ts`, añadir dentro de la clase `OnboardingResponseSerializer`, después de `productsWarning`:

```ts
  @ApiProperty({
    description:
      'Presente solo en modo self-hosted (sin proveedor de email). URL para activar la cuenta admin directamente desde la UI.',
    example: 'http://192.168.1.50:8080/activate?token=2b1f...-uuid',
    required: false,
  })
  activationUrl?: string;
```

- [ ] **Step 2: Propagar el campo en el controller**

En `onboarding.controller.ts`, en el método `register`, reemplazar:

```ts
    return { productsCreated: result.productsCreated, productsWarning: result.productsWarning };
```

por:

```ts
    return {
      productsCreated: result.productsCreated,
      productsWarning: result.productsWarning,
      activationUrl: result.activationUrl,
    };
```

Además, actualizar el `@ApiResponse({ status: 201, ... })` y/o el `description` del `@ApiOperation` para mencionar que en self-hosted la respuesta incluye `activationUrl`. Reemplazar el `description` del `@ApiOperation` por:

```ts
    description:
      'Crea un restaurante + usuario ADMIN + categoría por defecto. El email de activación se envía inmediatamente si hay proveedor configurado; en modo self-hosted (sin RESEND_API_KEY) la respuesta incluye activationUrl para que la UI muestre el link.',
```

- [ ] **Step 3: Verificar que compila y los tests existentes pasan**

Run: `docker compose exec res-api-core pnpm test onboarding`
Expected: PASS. El `onboarding.controller.spec.ts` (solo prueba `getCountries`) sigue verde.

- [ ] **Step 4: Verificar el build TypeScript**

Run: `docker compose exec res-api-core pnpm run build`
Expected: build sin errores de tipo.

- [ ] **Step 5: Commit**

```bash
git add apps/api-core/src/onboarding/serializers/onboarding-response.serializer.ts apps/api-core/src/onboarding/onboarding.controller.ts
git commit -m "feat(onboarding): exponer activationUrl en la respuesta del endpoint register

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Dockerfile api-core — uploads escribible por `node`

**Files:**
- Modify: `apps/api-core/Dockerfile`

**Contexto:** El stage `prod` corre como `USER node`. El volumen de uploads (`/app/uploads`, default `UPLOADS_PATH = cwd/uploads`) se monta como named volume; si el directorio no existe en la imagen, Docker lo crea como `root` y `node` no puede escribir. Creándolo con ownership `node` en la imagen, el named volume hereda ese ownership.

- [ ] **Step 1: Crear el directorio con ownership node**

En `apps/api-core/Dockerfile`, en el stage `prod`, justo **antes** de `USER node`, añadir:

```dockerfile
RUN mkdir -p /app/uploads && chown node:node /app/uploads
```

(Queda inmediatamente después de la línea `RUN chmod +x ./commands/execute-migrations.sh ./commands/resend-activation.sh`.)

- [ ] **Step 2: Verificar que la imagen prod buildea**

Run: `docker build -f apps/api-core/Dockerfile --target prod -t restaurants-api-core:test apps/api-core`
Expected: build OK.

- [ ] **Step 3: Verificar ownership del dir**

Run: `docker run --rm restaurants-api-core:test sh -c "ls -ld /app/uploads"`
Expected: el directorio existe y es propiedad de `node`.

- [ ] **Step 4: Commit**

```bash
git add apps/api-core/Dockerfile
git commit -m "fix(docker): crear /app/uploads escribible por node en el stage prod

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: UI — Step3Success muestra el link de activación

**Files:**
- Modify: `apps/ui/src/components/onboarding/Step3Success.tsx`
- Test: `apps/ui/src/components/onboarding/Step3Success.test.tsx`

- [ ] **Step 1: Escribir los tests que fallan**

Añadir al final de `Step3Success.test.tsx`:

```tsx
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
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `docker compose exec -T res-ui node_modules/.bin/vitest run src/components/onboarding/Step3Success.test.tsx`
Expected: FAIL — no existe el link "Activar mi cuenta".

- [ ] **Step 3: Implementar el panel de activación**

En `Step3Success.tsx`:

a) Añadir `activationUrl` a la interfaz de props, después de `productsWarning?: string;`:

```tsx
  activationUrl?: string;
```

b) Añadir `activationUrl` a la desestructuración de props del componente, después de `productsWarning,`:

```tsx
  activationUrl,
```

c) Reemplazar el bloque que va desde `<div className="flex gap-4 p-5 bg-orange-50 ...">` (el panel "Revisa tu correo") hasta el cierre del `<div className="flex flex-col gap-3">` que contiene el botón "No me llegó el correo" y el link "Ir al login" — es decir, todo lo que sigue al bloque de `productsWarning` — por:

```tsx
      {activationUrl ? (
        <div className="flex flex-col gap-3 p-5 bg-orange-50 rounded-xl border border-orange-200 mb-6 text-left">
          <strong className="text-slate-800">Activá tu cuenta</strong>
          <p className="text-slate-500 m-0 text-sm leading-relaxed">
            Tu instalación no tiene servicio de correo configurado. Hacé clic para
            establecer tu contraseña y activar tu cuenta de administrador.
          </p>
          <a
            href={activationUrl}
            className="w-full py-3 px-6 bg-[#f97316] text-white no-underline rounded-xl text-sm font-semibold flex items-center justify-center transition-all hover:bg-orange-600"
          >
            Activar mi cuenta
          </a>
        </div>
      ) : (
        <>
          <div className="flex gap-4 p-5 bg-orange-50 rounded-xl border border-orange-200 mb-6">
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

          {resendStatus === 'sent' && (
            <p className="text-sm text-emerald-600 mb-4">
              Si el correo está registrado, recibirás un email en breve.
            </p>
          )}
          {resendStatus === 'error' && (
            <p className="text-sm text-red-500 mb-4">
              Error de conexión. Intenta nuevamente.
            </p>
          )}

          <div className="flex flex-col gap-3">
            <button
              type="button"
              onClick={onResend}
              disabled={resendStatus === 'loading' || resendStatus === 'sent'}
              className="w-full py-3 px-6 bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-sm font-medium cursor-pointer transition-all hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {resendStatus === 'loading' ? 'Enviando...' : 'No me llegó el correo'}
            </button>
            <a
              href="/login"
              className="w-full py-3 px-6 bg-[#f97316] text-white no-underline rounded-xl text-sm font-semibold flex items-center justify-center transition-all hover:bg-orange-600"
            >
              Ir al login
            </a>
          </div>
        </>
      )}
```

> Nota: el bloque de `productsWarning` (el `{productsWarning && (...)}`) queda **antes** y no se toca.

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `docker compose exec -T res-ui node_modules/.bin/vitest run src/components/onboarding/Step3Success.test.tsx`
Expected: PASS (los 6 tests previos + los 3 nuevos).

- [ ] **Step 5: Commit**

```bash
git add apps/ui/src/components/onboarding/Step3Success.tsx apps/ui/src/components/onboarding/Step3Success.test.tsx
git commit -m "feat(ui): Step3Success muestra link de activación en modo self-hosted

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: UI — OnboardingWizard propaga `activationUrl`

**Files:**
- Modify: `apps/ui/src/components/onboarding/OnboardingWizard.tsx`
- Test: `apps/ui/src/components/onboarding/OnboardingWizard.test.tsx`

- [ ] **Step 1: Escribir el test que falla**

Añadir al final de `OnboardingWizard.test.tsx`:

```tsx
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
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `docker compose exec -T res-ui node_modules/.bin/vitest run src/components/onboarding/OnboardingWizard.test.tsx`
Expected: FAIL — el link "Activar mi cuenta" no aparece (el wizard aún no pasa `activationUrl`).

- [ ] **Step 3: Implementar el threading del estado**

En `OnboardingWizard.tsx`:

a) Añadir el estado, después de `const [productsWarning, setProductsWarning] = useState<string | undefined>(undefined);`:

```tsx
  const [activationUrl, setActivationUrl] = useState<string | undefined>(undefined);
```

b) En `handleStep2Submit`, después de `setProductsWarning(result.productsWarning);`, añadir:

```tsx
      setActivationUrl(result.activationUrl);
```

c) En el render de `<Step3Success ... />`, añadir la prop después de `productsWarning={productsWarning}`:

```tsx
          activationUrl={activationUrl}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `docker compose exec -T res-ui node_modules/.bin/vitest run src/components/onboarding/OnboardingWizard.test.tsx`
Expected: PASS (nuevo + todos los previos del archivo).

- [ ] **Step 5: Commit**

```bash
git add apps/ui/src/components/onboarding/OnboardingWizard.tsx apps/ui/src/components/onboarding/OnboardingWizard.test.tsx
git commit -m "feat(ui): OnboardingWizard propaga activationUrl a Step3Success

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: Compose y `.env.example` de self-host

**Files:**
- Create: `deploy/docker-compose.yml`
- Create: `deploy/.env.example`

- [ ] **Step 1: Crear `deploy/docker-compose.yml`**

```yaml
name: restaurantes

services:
  res-db:
    image: postgres:17-alpine
    restart: unless-stopped
    environment:
      POSTGRES_DB: ${POSTGRES_DB:-restaurants}
      POSTGRES_USER: ${POSTGRES_USER:-postgres}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?Define POSTGRES_PASSWORD en el .env}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER:-postgres}"]
      interval: 5s
      timeout: 5s
      retries: 5

  res-api-core:
    image: ghcr.io/${GHCR_OWNER}/restaurants-api-core:latest
    restart: unless-stopped
    depends_on:
      res-db:
        condition: service_healthy
    environment:
      DATABASE_URL: postgresql://${POSTGRES_USER:-postgres}:${POSTGRES_PASSWORD}@res-db:5432/${POSTGRES_DB:-restaurants}
      JWT_SECRET: ${JWT_SECRET:?Define JWT_SECRET en el .env}
      FRONTEND_URL: http://${SERVER_IP}:${UI_PORT:-8080}
      CORS_ORIGIN: http://${SERVER_IP}:${UI_PORT:-8080}
      COOKIE_SECURE: "false"
      TZ: ${TZ:-America/Argentina/Buenos_Aires}
      RESEND_API_KEY: ${RESEND_API_KEY:-}
      EMAIL_FROM: ${EMAIL_FROM:-onboarding@resend.dev}
      GEMINI_API_KEY: ${GEMINI_API_KEY:-}
      GEMINI_MODEL: ${GEMINI_MODEL:-}
    command: ["sh", "-c", "./commands/execute-migrations.sh && node dist/src/main"]
    volumes:
      - uploads_data:/app/uploads
    ports:
      - "${API_PORT:-3000}:3000"

  res-ui:
    image: ghcr.io/${GHCR_OWNER}/restaurants-ui:latest
    restart: unless-stopped
    depends_on:
      - res-api-core
    environment:
      PUBLIC_API_URL: http://${SERVER_IP}:${API_PORT:-3000}
    ports:
      - "${UI_PORT:-8080}:80"

volumes:
  postgres_data:
  uploads_data:
```

- [ ] **Step 2: Crear `deploy/.env.example`**

```bash
# ─── Red / LAN ───────────────────────────────────────────────────
# IP de esta PC en la red local. Configurá IP estática o reserva DHCP
# en el router para que no cambie. Los otros dispositivos entran por aquí.
SERVER_IP=192.168.1.50

# Puertos publicados a la LAN
API_PORT=3000
UI_PORT=8080

# ─── Imágenes (GHCR) ─────────────────────────────────────────────
# Dueño del namespace: ghcr.io/<GHCR_OWNER>/restaurants-api-core
GHCR_OWNER=tu-usuario-github

# ─── Secretos (generá valores únicos y largos) ───────────────────
JWT_SECRET=cambia-esto-por-un-secreto-largo-y-aleatorio
POSTGRES_PASSWORD=cambia-esta-password

# ─── Base de datos (opcionales) ──────────────────────────────────
POSTGRES_DB=restaurants
POSTGRES_USER=postgres

# ─── Zona horaria ────────────────────────────────────────────────
TZ=America/Argentina/Buenos_Aires

# ─── Opcionales ──────────────────────────────────────────────────
# Email (Resend). Vacío = el onboarding muestra el link de activación en la UI.
RESEND_API_KEY=
EMAIL_FROM=onboarding@resend.dev
# IA de productos (Gemini). Vacío = productos solo manuales.
GEMINI_API_KEY=
GEMINI_MODEL=
```

- [ ] **Step 3: Validar la sintaxis del compose**

Primero copiar el ejemplo y poner un `GHCR_OWNER` cualquiera para que interpole:

Run: `cd deploy && cp .env.example .env && docker compose config >/dev/null && echo OK`
Expected: imprime `OK` sin errores de interpolación. (Borrar el `.env` de prueba después: `rm deploy/.env`.)

- [ ] **Step 4: Commit**

```bash
git add deploy/docker-compose.yml deploy/.env.example
git commit -m "feat(deploy): docker-compose y .env.example para self-host con GHCR

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 8: Documentación de instalación y publicación

**Files:**
- Create: `docs/self-hosting.md`
- Create: `docs/self-hosting-publishing.md`

- [ ] **Step 1: Crear `docs/self-hosting.md` (guía de instalación / base del post)**

```markdown
# Autohospedar la plataforma (self-hosting)

Esta guía instala todo el sistema en **una computadora** que actúa como servidor.
Los demás dispositivos (tótem, cocina, caja) se conectan por la red local (LAN).

## 1. Requisitos

- **Docker Desktop** instalado (Windows o macOS) o Docker Engine (Linux).
- La PC servidor con **IP estática** o **reserva DHCP** en el router (importante:
  si la IP cambia, los dispositivos pierden conexión).
- Los dispositivos en la **misma red WiFi/LAN** que la PC servidor.

## 2. Descargar los archivos

Descargá `docker-compose.yml` y `.env.example` (de la carpeta `deploy/` del proyecto)
a una carpeta nueva, por ejemplo `restaurantes/`.

## 3. Configurar

```bash
cp .env.example .env
```

Editá `.env` y completá como mínimo:

- `SERVER_IP` — la IP local de esta PC (ej. `192.168.1.50`). En Windows la ves con
  `ipconfig`; en macOS/Linux con `ifconfig` o `ip addr`.
- `GHCR_OWNER` — el usuario/organización de GitHub donde están publicadas las imágenes.
- `JWT_SECRET` y `POSTGRES_PASSWORD` — valores largos y únicos.

Email e IA son opcionales: si los dejás vacíos, el sistema funciona igual
(la activación se hace con un link en pantalla y los productos se cargan a mano).

## 4. Levantar

```bash
docker compose up -d
```

La primera vez descarga las imágenes y aplica las migraciones de la base de datos
automáticamente. Verificá que esté arriba:

```bash
docker compose ps
curl http://localhost:3000/health   # debe responder {"status":"ok"}
```

## 5. Primer uso (onboarding)

1. Abrí en el navegador de la PC: `http://localhost:8080`.
2. Entrá al onboarding y creá tu restaurante + tu usuario administrador.
3. Como no hay email configurado, al terminar verás un botón **"Activar mi cuenta"**.
   Hacé clic, definí tu contraseña y tu cuenta queda activa.
4. Iniciá sesión y cargá tus productos **manualmente** desde el dashboard.

## 6. Conectar otros dispositivos

Desde cualquier dispositivo en la misma red, abrí:

```
http://<SERVER_IP>:8080
```

(ej. `http://192.168.1.50:8080`). Tótem y cocina usan la misma URL.

## 7. Operación

- **Detener:** `docker compose down`
- **Actualizar a una nueva versión:** `docker compose pull && docker compose up -d`
- **Ver logs:** `docker compose logs -f res-api-core`
- **Backups:** los datos viven en los volúmenes Docker `postgres_data` (base de datos)
  y `uploads_data` (imágenes de productos). Respaldalos periódicamente, por ejemplo:
  `docker run --rm -v restaurantes_postgres_data:/data -v "$PWD":/backup alpine tar czf /backup/db-backup.tgz -C /data .`

## 8. Problemas comunes

- **Otro dispositivo no conecta:** revisá que `SERVER_IP` sea correcto y que el
  firewall de la PC permita los puertos `8080` y `3000` entrantes en la red local.
- **No puedo iniciar sesión / la sesión se cae:** asegurate de acceder por
  `http://<SERVER_IP>:8080` (no `https`), ya que la instalación corre sobre HTTP en LAN.
```

- [ ] **Step 2: Crear `docs/self-hosting-publishing.md` (para el mantenedor)**

```markdown
# Publicar las imágenes en GHCR (manual)

Las imágenes públicas de self-hosting se publican a mano en GitHub Container Registry.

## Requisitos

- `docker` y `gh` (GitHub CLI) instalados y autenticados.
- Un Personal Access Token con scope `write:packages` (o `gh auth token`).

## 1. Login a GHCR

```bash
echo "$(gh auth token)" | docker login ghcr.io -u <tu-usuario-github> --password-stdin
```

## 2. Build de las imágenes (stage prod)

```bash
# Desde la raíz del repo
docker build -f apps/api-core/Dockerfile --target prod \
  -t ghcr.io/<tu-usuario-github>/restaurants-api-core:latest apps/api-core

# La UI hornea PUBLIC_API_URL con un placeholder que el contenedor reemplaza en runtime.
docker build -f apps/ui/Dockerfile --target prod \
  --build-arg PUBLIC_API_URL=__PLACEHOLDER_API_URL__ \
  -t ghcr.io/<tu-usuario-github>/restaurants-ui:latest apps/ui
```

## 3. Push

```bash
docker push ghcr.io/<tu-usuario-github>/restaurants-api-core:latest
docker push ghcr.io/<tu-usuario-github>/restaurants-ui:latest
```

## 4. Marcar los packages como públicos (una sola vez)

En GHCR las imágenes nacen **privadas**. En GitHub:
`Profile → Packages → restaurants-api-core → Package settings → Change visibility → Public`
(repetir para `restaurants-ui`). Sin esto, los usuarios no pueden hacer `pull` sin login.

## 5. Versionado (opcional)

Además de `:latest`, etiquetá con la versión para que los usuarios puedan fijarla:

```bash
docker tag ghcr.io/<usuario>/restaurants-api-core:latest ghcr.io/<usuario>/restaurants-api-core:v1.0.0
docker push ghcr.io/<usuario>/restaurants-api-core:v1.0.0
```
```

- [ ] **Step 3: Commit**

```bash
git add docs/self-hosting.md docs/self-hosting-publishing.md
git commit -m "docs: guía de self-hosting y publicación manual de imágenes a GHCR

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 9: Actualizar la documentación del módulo onboarding

**Files:**
- Modify: `apps/api-core/src/onboarding/onboarding.module.info.md`
- Modify: `apps/api-core/src/onboarding/onboarding.flow.mmd`
- Modify: `apps/api-core/docs/onboarding-error-mapping.md`

- [ ] **Step 1: Documentar la nueva lógica en `onboarding.module.info.md`**

Añadir una sección nueva (después de la sección que describe el envío de email, cerca de la nota "El usuario creado tiene `isActive: false`..."):

```markdown
## Modo self-hosted (sin proveedor de email)

Cuando `RESEND_API_KEY` no está configurada (`EmailService.isEnabled() === false`),
el email de activación no se envía. Para no bloquear el alta:

- `registerRestaurant` devuelve `activationUrl` en `OnboardingResult` (construido con
  `EmailService.buildActivationUrl(token)`, base `FRONTEND_URL`).
- El controller lo expone en `OnboardingResponseSerializer.activationUrl`.
- La UI (`Step3Success`) muestra un botón **"Activar mi cuenta"** con ese link en vez
  del aviso "Revisa tu correo".

Con email configurado el comportamiento no cambia: el link va por correo y
`activationUrl` **no** se incluye en la respuesta.
```

- [ ] **Step 2: Reflejar la rama en el diagrama `onboarding.flow.mmd`**

En `onboarding.flow.mmd`, en el nodo de envío de email (`F[sendActivationEmail...]`),
añadir la bifurcación por disponibilidad de email. Añadir tras ese nodo:

```mermaid
    F -->|email habilitado| G[link enviado por correo]
    F -->|email deshabilitado| H[activationUrl en la respuesta\nla UI muestra el link]
```

(Ajustar los nombres de nodos a los existentes en el archivo; el objetivo es que el
diagrama muestre que sin email el link vuelve en la respuesta.)

- [ ] **Step 3: Anotar el campo en `onboarding-error-mapping.md`**

Añadir una nota en la sección del endpoint `register` indicando que la respuesta 201
puede incluir `activationUrl` en modo self-hosted (no es un error, pero forma parte
del contrato de la respuesta y del flujo de activación sin email).

```markdown
> **Self-hosted:** si no hay `RESEND_API_KEY`, la respuesta 201 de `POST /v1/onboarding/register`
> incluye `activationUrl`. La UI lo muestra como botón de activación. No se envía email.
```

- [ ] **Step 4: Commit**

```bash
git add apps/api-core/src/onboarding/onboarding.module.info.md apps/api-core/src/onboarding/onboarding.flow.mmd apps/api-core/docs/onboarding-error-mapping.md
git commit -m "docs(onboarding): documentar activación self-hosted (link en la respuesta)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 10: Verificación end-to-end del stack self-host

**Files:** ninguno (verificación manual). No marcar el plan como completo hasta que esto pase.

- [ ] **Step 1: Build local de ambas imágenes prod**

```bash
docker build -f apps/api-core/Dockerfile --target prod -t ghcr.io/local/restaurants-api-core:latest apps/api-core
docker build -f apps/ui/Dockerfile --target prod --build-arg PUBLIC_API_URL=__PLACEHOLDER_API_URL__ -t ghcr.io/local/restaurants-ui:latest apps/ui
```
Expected: ambas imágenes buildean.

- [ ] **Step 2: Levantar el stack self-host SIN email ni IA**

Crear `deploy/.env` con `GHCR_OWNER=local`, `SERVER_IP=127.0.0.1`, `JWT_SECRET` y
`POSTGRES_PASSWORD` de prueba, y `RESEND_API_KEY`/`GEMINI_API_KEY` vacíos.

```bash
cd deploy && docker compose up -d
```
Expected: los tres servicios arrancan; `res-api-core` aplica migraciones (verlo con
`docker compose logs res-api-core`) y `GET http://localhost:3000/health` responde 200.

- [ ] **Step 3: Verificar que api-core arrancó sin GEMINI ni RESEND**

Run: `cd deploy && docker compose logs res-api-core | grep -iE "GEMINI_API_KEY not configured|RESEND_API_KEY not configured|Nest application successfully started"`
Expected: warnings de Gemini/Resend deshabilitados **y** el server arrancó igual.

- [ ] **Step 4: Onboarding muestra el link de activación**

Abrir `http://localhost:8080`, completar el onboarding. Verificar que aparece el botón
**"Activar mi cuenta"**, hacer clic, fijar contraseña, y confirmar que se puede
iniciar sesión con esa cuenta.

- [ ] **Step 5: Verificar persistencia y uploads**

Crear un producto con imagen desde el dashboard. Verificar que la imagen se guarda
(no hay error de permisos en `docker compose logs res-api-core`) y que sobrevive a
`docker compose restart res-api-core`.

- [ ] **Step 6: Limpiar**

```bash
cd deploy && docker compose down -v && rm -f .env
```

- [ ] **Step 7: Correr la suite completa para detectar regresiones**

```bash
docker compose exec res-api-core pnpm test
docker compose exec -T res-ui node_modules/.bin/vitest run
```
Expected: api-core verde; ui sin regresiones respecto del baseline (~13 fallas
preexistentes ajenas a este trabajo).

---

## Self-Review (cobertura del spec)

- **Imágenes prod api-core + ui** → Tasks 4, 8 (build/push), 10 (verificación).
- **GHCR público, publicación manual** → Task 8 (publishing doc, paso "marcar público").
- **docker-compose + .env.example** → Task 7.
- **LAN, IP en .env, derivados PUBLIC_API_URL/FRONTEND_URL/CORS_ORIGIN, COOKIE_SECURE=false** → Task 7.
- **Migraciones automáticas al arrancar** → Task 7 (`command` con `execute-migrations.sh`), Task 10 (verificación).
- **Provisioning: onboarding interactivo** → flujo existente; verificado en Task 10.
- **Activación sin email: link en respuesta + UI** → Tasks 1, 2, 3 (backend), 5, 6 (UI).
- **Productos manuales / IA opcional** → sin código (GeminiService ya degrada); verificado en Task 10 step 3.
- **Email opcional** → sin código (EmailService ya degrada); cubierto por Tasks 1–2 y verificación.
- **Uploads escribibles** → Task 4, verificado en Task 10 step 5.
- **Docs del módulo onboarding (.info/.mmd/error-mapping)** → Task 9.
- **Guía/post de instalación** → Task 8.
```
