# Unify Frontend Base — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename `apps/restaurant-ui` → `apps/ui`, migrate Astro from SSR a static output con React integration, configurar NestJS para servir los archivos estáticos, y verificar que el build pipeline completo funciona.

**Architecture:** Astro genera archivos estáticos en `apps/ui/dist/`. El script `copy-static.mjs` los copia a `apps/api-core/public/`. NestJS usa `ServeStaticModule` para servirlos. Sin adaptador Node en Astro — cero procesos extra.

**Tech Stack:** Astro 5, `@astrojs/react`, React 18, `@nestjs/serve-static`, pnpm workspaces, Turborepo

**Spec:** `docs/superpowers/specs/2026-04-16-unify-platform-design.md`

---

## File Map

**Renombrado:**
- `apps/restaurant-ui/` → `apps/ui/`

**Modificados:**
- `apps/ui/package.json` — nombre e dependencias
- `apps/ui/astro.config.mjs` — output static, react integration, sin adapter
- `packages/build-tools/scripts/copy-static.mjs` — source path `apps/ui/dist`
- `turbo.json` — referencias al nuevo package name `@restaurants/ui`
- `apps/api-core/src/app.module.ts` — agregar `ServeStaticModule`
- `apps/api-core/src/app.controller.ts` — mover `/` a `/health`
- `apps/api-core/src/app.service.ts` — simplificar (queda huérfano sin `getHello`)
- `apps/api-core/package.json` — agregar `@nestjs/serve-static`

---

## Task 1: Renombrar el folder con git

- [ ] **Step 1.1 — Renombrar con git mv para preservar historial**

```bash
git mv apps/restaurant-ui apps/ui
```

- [ ] **Step 1.2 — Verificar que el rename se registró correctamente**

```bash
git status
```

Esperado: los archivos aparecen como `renamed: apps/restaurant-ui/... -> apps/ui/...`

- [ ] **Step 1.3 — Commit**

```bash
git add -A
git commit -m "refactor: rename apps/restaurant-ui to apps/ui"
```

---

## Task 2: Actualizar package.json del frontend

**Archivo:** `apps/ui/package.json`

El `name` actual es `restaurant-ui`. Turbo necesita el scope `@restaurants/` para referencias entre packages.

- [ ] **Step 2.1 — Reemplazar el contenido completo**

```json
{
  "name": "@restaurants/ui",
  "type": "module",
  "version": "0.0.1",
  "scripts": {
    "dev": "astro dev",
    "build": "astro build",
    "preview": "astro preview",
    "astro": "astro"
  },
  "dependencies": {
    "@astrojs/react": "4.2.1",
    "@astrojs/tailwind": "6.0.2",
    "astro": "5.17.1",
    "react": "19.1.0",
    "react-dom": "19.1.0",
    "tailwindcss": "^3.4.19"
  },
  "devDependencies": {
    "@types/react": "19.1.2",
    "@types/react-dom": "19.1.2"
  }
}
```

> Nota: `@astrojs/node` se elimina — ya no se usa SSR. `@astrojs/react`, `react`, `react-dom` se agregan.

- [ ] **Step 2.2 — Instalar dependencias**

```bash
pnpm install
```

Esperado: `@astrojs/react`, `react`, `react-dom` instalados en `apps/ui/node_modules/`.

- [ ] **Step 2.3 — Commit**

```bash
git add apps/ui/package.json pnpm-lock.yaml
git commit -m "feat(ui): update package.json — static output deps, add react"
```

---

## Task 3: Actualizar astro.config.mjs

**Archivo:** `apps/ui/astro.config.mjs`

- [ ] **Step 3.1 — Reemplazar el contenido completo**

```js
// @ts-check
import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';
import react from '@astrojs/react';

// https://astro.build/config
export default defineConfig({
  output: 'static',
  integrations: [react(), tailwind()],
});
```

- [ ] **Step 3.2 — Remover `export const prerender = false` del kiosk page**

En `apps/ui/src/pages/kiosk/[slug].astro`, la primera línea del frontmatter es:

```
export const prerender = false;
```

Eliminarla — en `output: 'static'` todas las páginas se pre-renderizan por defecto.

> Nota: esta página se renombra a `index.astro` en el Plan 2. Por ahora solo quitar el `prerender = false` para que el build no falle.

- [ ] **Step 3.3 — Verificar que `astro build` compila sin errores**

```bash
cd apps/ui
pnpm build
```

Esperado:
```
▶ Astro
✔ Building static output
✔ Completed in X.Xs
```

Y la carpeta `apps/ui/dist/` debe existir con archivos HTML.

> Si el build falla con error de ruta dinámica `/kiosk/[slug]` sin `getStaticPaths`, agregar temporalmente al frontmatter de `[slug].astro`:
> ```js
> export function getStaticPaths() { return [] }
> ```
> Esto genera la página sin rutas — se resuelve definitivamente en Plan 2.

- [ ] **Step 3.4 — Commit**

```bash
git add apps/ui/astro.config.mjs apps/ui/src/pages/kiosk/
git commit -m "feat(ui): switch to static output, add react integration"
```

---

## Task 4: Actualizar copy-static.mjs

**Archivo:** `packages/build-tools/scripts/copy-static.mjs`

El script actual copia desde `apps/ui-dashboard` y `apps/ui-storefront` (que no existen en esta rama). Ahora hay un solo app: `apps/ui`.

- [ ] **Step 4.1 — Reemplazar el contenido completo**

```js
import { cpSync, mkdirSync, rmSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '../../..');

const publicDir = resolve(root, 'apps/api-core/public');
rmSync(publicDir, { recursive: true, force: true });
mkdirSync(publicDir, { recursive: true });

// Copy unified UI to root of public
cpSync(resolve(root, 'apps/ui/dist'), publicDir, { recursive: true });

console.log('✓ Static files copied to api-core/public/');
```

- [ ] **Step 4.2 — Verificar que el script corre correctamente**

Primero asegurarse de que `apps/ui/dist/` existe (correr `pnpm build` en `apps/ui` si no existe), luego:

```bash
pnpm copy-static
```

Esperado:
```
✓ Static files copied to api-core/public/
```

Y `apps/api-core/public/` debe contener los archivos HTML del frontend.

- [ ] **Step 4.3 — Commit**

```bash
git add packages/build-tools/scripts/copy-static.mjs
git commit -m "feat(build): update copy-static to use unified apps/ui"
```

---

## Task 5: Actualizar turbo.json

**Archivo:** `turbo.json`

El archivo actual referencia `@restaurants/ui-dashboard` y `@restaurants/ui-storefront`. Ambos se reemplazan por `@restaurants/ui`.

- [ ] **Step 5.1 — Reemplazar el contenido completo**

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", ".next/**", "out/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "//#copy-static": {
      "dependsOn": ["@restaurants/ui#build"],
      "cache": false
    },
    "//#build:cloud": {
      "dependsOn": ["api-core#build", "//#copy-static"],
      "cache": false
    },
    "//#build:desktop": {
      "dependsOn": ["api-core#build", "//#copy-static"],
      "cache": false
    }
  }
}
```

- [ ] **Step 5.2 — Commit**

```bash
git add turbo.json
git commit -m "feat(build): update turbo.json to reference @restaurants/ui"
```

---

## Task 6: Agregar ServeStaticModule a NestJS

**Archivos:**
- Modify: `apps/api-core/package.json`
- Modify: `apps/api-core/src/app.module.ts`
- Modify: `apps/api-core/src/app.controller.ts`

El `AppController` actualmente tiene un `@Get()` en `/` que interferiría con los archivos estáticos. Lo movemos a `/health` (el Electron desktop app lo usa para health check).

- [ ] **Step 6.1 — Instalar @nestjs/serve-static**

```bash
pnpm --filter api-core add @nestjs/serve-static
```

- [ ] **Step 6.2 — Actualizar app.controller.ts y app.service.ts**

Reemplazar `apps/api-core/src/app.controller.ts`:

```typescript
import { Controller, Get } from '@nestjs/common';

@Controller()
export class AppController {
  @Get('health')
  health(): { status: string } {
    return { status: 'ok' };
  }
}
```

Reemplazar `apps/api-core/src/app.service.ts`:

```typescript
import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {}
```

- [ ] **Step 6.3 — Actualizar app.module.ts**

Reemplazar el contenido completo:

```typescript
import { join } from 'path';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ServeStaticModule } from '@nestjs/serve-static';
import { AppController } from './app.controller';
import { EventsModule } from './events/events.module';
import { PrismaModule } from './prisma/prisma.module';
import { RestaurantsModule } from './restaurants/restaurants.module';
import { ProductsModule } from './products/products.module';
import { OnboardingModule } from './onboarding/onboarding.module';
import { UsersModule } from './users/users.module';
import { EmailModule } from './email/email.module';
import { AuthModule } from './auth/auth.module';
import { MenusModule } from './menus/menus.module';
import { OrdersModule } from './orders/orders.module';
import { RegisterModule } from './register/register.module';
import { KioskModule } from './kiosk/kiosk.module';
import { PrintModule } from './print/print.module';

@Module({
  imports: [
    ConfigModule.forRoot(),
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'public'),
      exclude: ['/v1/*', '/health', '/docs'],
    }),
    EventsModule,
    PrismaModule,
    RestaurantsModule,
    ProductsModule,
    MenusModule,
    OnboardingModule,
    UsersModule,
    EmailModule,
    AuthModule,
    OrdersModule,
    RegisterModule,
    KioskModule,
    PrintModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
```

- [ ] **Step 6.4 — Verificar que NestJS compila**

```bash
pnpm --filter api-core build
```

Esperado: compilación exitosa sin errores TypeScript.

- [ ] **Step 6.5 — Commit**

```bash
git add apps/api-core/package.json apps/api-core/src/app.module.ts apps/api-core/src/app.controller.ts pnpm-lock.yaml
git commit -m "feat(api): add ServeStaticModule, move root route to /health"
```

---

## Task 7: Smoke test completo

- [ ] **Step 7.1 — Correr copy-static para refrescar public/**

```bash
pnpm --filter @restaurants/ui build && pnpm copy-static
```

Verificar que `apps/api-core/public/` contiene `index.html` y otros archivos.

- [ ] **Step 7.2 — Levantar NestJS y verificar que sirve el frontend**

```bash
pnpm --filter api-core dev
```

Abrir `http://localhost:3000` en el browser. Esperado: se sirve el HTML del frontend de Astro (puede ser una página vacía o redirigir — lo importante es que NestJS la sirve, no un 404).

- [ ] **Step 7.3 — Verificar endpoint de health**

```bash
curl http://localhost:3000/health
```

Esperado:
```json
{"status":"ok"}
```

- [ ] **Step 7.4 — Commit final si todo funciona**

```bash
git add -A
git commit -m "chore: verify build pipeline works end-to-end"
```
