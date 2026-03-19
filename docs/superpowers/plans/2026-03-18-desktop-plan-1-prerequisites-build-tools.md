# Desktop Distribution — Plan 1: Prerequisites & Build Tools

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert Astro apps to static output, add the required api-core changes, and create the shared `packages/build-tools` package that produces protected build artifacts for both desktop and cloud distribution.

**Architecture:** Astro apps switch from SSR to static mode. NestJS gains a `/health` endpoint and environment-aware paths for uploads and static file serving. A new `packages/build-tools` package provides reusable scripts for obfuscation and binary/bytecode compilation.

**Tech Stack:** Astro (static output), NestJS, `javascript-obfuscator`, `bytenode`, `@yao-pkg/pkg`, Turborepo

**Spec:** `docs/superpowers/specs/2026-03-18-desktop-packaging-design.md`

---

## File Map

**Modified:**
- `apps/ui-dashboard/astro.config.mjs` — remove Node adapter, switch to static
- `apps/ui-dashboard/src/pages/dash/menus/[id].astro` — migrate `Astro.params` → `window.location.pathname`
- `apps/ui-storefront/astro.config.mjs` — remove Node adapter, switch to static
- `apps/ui-storefront/src/pages/kiosk/[slug].astro` — migrate `Astro.params` → `window.location.pathname`
- `apps/ui-dashboard/src/pages/kitchen/[slug].astro` — remove `prerender = false` only
- `apps/api-core/src/app.controller.ts` — add `GET /health`
- `apps/api-core/src/app.controller.spec.ts` — add health test
- `apps/api-core/src/config.ts` — add `UPLOADS_PATH`, `API_PUBLIC_PATH`
- `apps/api-core/src/uploads/uploads.service.ts` — use `UPLOADS_PATH` env var
- `apps/api-core/src/app.module.ts` — add public file serving, update uploads path
- `turbo.json` — add `build:desktop` and `build:cloud` tasks

**Created:**
- `apps/api-core/public/.gitkeep` — ensures the public dir exists for static serving
- `packages/build-tools/package.json`
- `packages/build-tools/scripts/obfuscate.mjs`
- `packages/build-tools/scripts/compile-bytecode.mjs`
- `packages/build-tools/scripts/compile-binary.mjs`
- `packages/build-tools/scripts/copy-static.mjs`

---

## Task 1: Convert `ui-dashboard` to static output

**Files:**
- Modify: `apps/ui-dashboard/astro.config.mjs`
- Modify: `apps/ui-dashboard/src/pages/dash/menus/[id].astro`
- Modify: `apps/ui-dashboard/src/pages/kitchen/[slug].astro`

- [ ] **Step 1.1: Update astro.config.mjs**

```js
// apps/ui-dashboard/astro.config.mjs
// @ts-check
import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';

export default defineConfig({
  output: 'static',
  integrations: [tailwind()],
});
```

- [ ] **Step 1.2: Remove the Node adapter package**

```bash
cd apps/ui-dashboard && pnpm remove @astrojs/node
```

- [ ] **Step 1.3: Migrate `menus/[id].astro` — remove Astro.params**

Replace the frontmatter block at the top of `apps/ui-dashboard/src/pages/dash/menus/[id].astro`.

Current:
```astro
---
export const prerender = false;
import DashboardLayout from '../../../layouts/DashboardLayout.astro';
const { id } = Astro.params;
---

<DashboardLayout>
  <div class="space-y-6" data-menu-id={id}>
```

Replace with:
```astro
---
import DashboardLayout from '../../../layouts/DashboardLayout.astro';
---

<DashboardLayout>
  <div class="space-y-6" id="menuContainer">
```

Then find the client-side `<script>` block in the same file. It already reads:
```js
const menuId = document.querySelector('[data-menu-id]')!.getAttribute('data-menu-id')!;
```

Replace that line with:
```js
const menuId = window.location.pathname.split('/').filter(Boolean).pop()!;
```

- [ ] **Step 1.4: Migrate `kitchen/[slug].astro` — remove prerender flag only**

The kitchen page already uses `window.location.pathname` in its script. Only the frontmatter flag needs removing.

Remove the line `export const prerender = false;` from the frontmatter of `apps/ui-dashboard/src/pages/kitchen/[slug].astro`. Leave everything else unchanged.

- [ ] **Step 1.5: Verify dashboard builds to static**

```bash
cd apps/ui-dashboard && pnpm build
```

Expected: `dist/` directory contains HTML files and no Node.js server files. No errors.

- [ ] **Step 1.6: Commit**

```bash
git add apps/ui-dashboard/
git commit -m "feat(ui-dashboard): switch to static output for desktop distribution"
```

---

## Task 2: Convert `ui-storefront` to static output

**Files:**
- Modify: `apps/ui-storefront/astro.config.mjs`
- Modify: `apps/ui-storefront/src/pages/kiosk/[slug].astro`

- [ ] **Step 2.1: Update astro.config.mjs**

```js
// apps/ui-storefront/astro.config.mjs
// @ts-check
import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';

export default defineConfig({
  output: 'static',
  integrations: [tailwind()],
});
```

- [ ] **Step 2.2: Remove the Node adapter package**

```bash
cd apps/ui-storefront && pnpm remove @astrojs/node
```

- [ ] **Step 2.3: Migrate `kiosk/[slug].astro` — remove Astro.params**

Replace the frontmatter block at the top of `apps/ui-storefront/src/pages/kiosk/[slug].astro`.

Current:
```astro
---
export const prerender = false;
import KioskLayout from '../../layouts/KioskLayout.astro';
const { slug } = Astro.params;
---

<KioskLayout>
  <div id="kioskApp" class="h-screen flex flex-col bg-amber-50 text-slate-800" data-slug={slug}>
```

Replace with:
```astro
---
import KioskLayout from '../../layouts/KioskLayout.astro';
---

<KioskLayout>
  <div id="kioskApp" class="h-screen flex flex-col bg-amber-50 text-slate-800">
```

Then find the client-side `<script>` block in the same file. Locate where it reads `dataset.slug` or similar from the `#kioskApp` element and replace it with:
```js
const slug = window.location.pathname.split('/').filter(Boolean).pop()!;
```

- [ ] **Step 2.4: Verify storefront builds to static**

```bash
cd apps/ui-storefront && pnpm build
```

Expected: `dist/` directory with static files. No errors.

- [ ] **Step 2.5: Commit**

```bash
git add apps/ui-storefront/
git commit -m "feat(ui-storefront): switch to static output for desktop distribution"
```

---

## Task 3: Add `/health` endpoint to `api-core`

**Files:**
- Modify: `apps/api-core/src/app.controller.ts`
- Modify: `apps/api-core/src/app.controller.spec.ts`

- [ ] **Step 3.1: Write the failing test**

Open `apps/api-core/src/app.controller.spec.ts` and add:

```typescript
it('GET /health should return status ok', () => {
  expect(controller.health()).toEqual({ status: 'ok' });
});
```

- [ ] **Step 3.2: Run the test to confirm it fails**

```bash
cd apps/api-core && pnpm test -- --testPathPattern="app.controller"
```

Expected: FAIL — `controller.health is not a function`

- [ ] **Step 3.3: Add the health endpoint**

```typescript
// apps/api-core/src/app.controller.ts
import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('health')
  health(): { status: string } {
    return { status: 'ok' };
  }
}
```

- [ ] **Step 3.4: Run the test to confirm it passes**

```bash
cd apps/api-core && pnpm test -- --testPathPattern="app.controller"
```

Expected: PASS

- [ ] **Step 3.5: Commit**

```bash
git add apps/api-core/src/app.controller.ts apps/api-core/src/app.controller.spec.ts
git commit -m "feat(api-core): add GET /health endpoint for Electron startup health check"
```

---

## Task 4: Add environment-aware uploads and public path to `api-core`

**Files:**
- Modify: `apps/api-core/src/config.ts`
- Modify: `apps/api-core/src/uploads/uploads.service.ts`
- Modify: `apps/api-core/src/app.module.ts`
- Create: `apps/api-core/public/.gitkeep`

- [ ] **Step 4.1: Add path config vars**

Add these two exports to `apps/api-core/src/config.ts`:

```typescript
// file paths — overridden by Electron in desktop mode
export const UPLOADS_PATH = process.env.UPLOADS_PATH
  ? process.env.UPLOADS_PATH
  : join(process.cwd(), 'uploads');

export const API_PUBLIC_PATH = process.env.API_PUBLIC_PATH
  ? process.env.API_PUBLIC_PATH
  : join(process.cwd(), 'public');
```

Also add `import { join } from 'path';` at the top of the file if not already present.

- [ ] **Step 4.2: Update uploads.service.ts to use the config**

Replace the hardcoded constant at the top of `apps/api-core/src/uploads/uploads.service.ts`:

Old:
```typescript
const UPLOADS_DIR = path.join(process.cwd(), 'uploads', 'products');
```

New:
```typescript
import { UPLOADS_PATH } from '../config';
const UPLOADS_DIR = path.join(UPLOADS_PATH, 'products');
```

- [ ] **Step 4.3: Update app.module.ts static serving**

In `apps/api-core/src/app.module.ts`, update the `ServeStaticModule.forRoot` import to add the `API_PUBLIC_PATH` import and a second static entry:

```typescript
import { UPLOADS_PATH, API_PUBLIC_PATH } from './config';

// Inside the imports array, replace the existing ServeStaticModule entries with:
ServeStaticModule.forRoot(
  {
    rootPath: UPLOADS_PATH,
    serveRoot: '/uploads',
  },
  {
    rootPath: API_PUBLIC_PATH,
    serveRoot: '/',
    serveStaticOptions: { fallthrough: true },
  },
),
```

- [ ] **Step 4.4: Create the public directory placeholder**

```bash
mkdir -p apps/api-core/public && touch apps/api-core/public/.gitkeep
```

- [ ] **Step 4.5: Verify api-core starts without errors**

```bash
cd apps/api-core && pnpm start:dev
```

Expected: NestJS starts on port 3000, no errors about missing directories. Ctrl+C to stop.

- [ ] **Step 4.6: Commit**

```bash
git add apps/api-core/src/config.ts apps/api-core/src/uploads/uploads.service.ts apps/api-core/src/app.module.ts apps/api-core/public/.gitkeep
git commit -m "feat(api-core): add UPLOADS_PATH and API_PUBLIC_PATH env vars for desktop mode"
```

---

## Task 5: Initialize Prisma migrations

**Files:**
- Create: `apps/api-core/prisma/migrations/` (auto-generated)

- [ ] **Step 5.1: Temporarily add a `url` to the datasource block**

The current `schema.prisma` uses the driver adapter pattern with no `url` field. The Prisma CLI (`migrate dev`) requires a direct database URL to run migrations. Add it temporarily:

```prisma
datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")  // ← add this line temporarily
}
```

Make sure `DATABASE_URL` is set in `apps/api-core/.env` (e.g., `DATABASE_URL="file:./dev.db"`).

- [ ] **Step 5.2: Generate the initial migration**

```bash
cd apps/api-core && pnpm prisma migrate dev --name init
```

Expected: Creates `prisma/migrations/YYYYMMDDHHMMSS_init/migration.sql`. No schema changes — this just captures the current schema as the baseline.

- [ ] **Step 5.3: Remove the `url` from the datasource block**

After the migration file is generated, remove the `url = env("DATABASE_URL")` line from the datasource block so it returns to driver-adapter-only mode:

```prisma
datasource db {
  provider = "sqlite"
  // url removed — driver adapter used at runtime
}
```

The `migrate deploy` command (run at app startup) also needs the direct URL. At runtime in desktop mode, Electron sets `DATABASE_URL` as an env var before spawning NestJS, so this is handled automatically.

- [ ] **Step 5.4: Verify migration applies cleanly**

```bash
cd apps/api-core && pnpm prisma migrate deploy
```

Expected: `All migrations have been applied.`

- [ ] **Step 5.5: Commit**

```bash
git add apps/api-core/prisma/schema.prisma apps/api-core/prisma/migrations/
git commit -m "feat(api-core): initialize Prisma migration baseline for desktop distribution"
```

---

## Task 6: Create `packages/build-tools`

**Files:**
- Create: `packages/build-tools/package.json`
- Create: `packages/build-tools/scripts/copy-static.mjs`
- Create: `packages/build-tools/scripts/obfuscate.mjs`
- Create: `packages/build-tools/scripts/compile-bytecode.mjs`
- Create: `packages/build-tools/scripts/compile-binary.mjs`

- [ ] **Step 6.1: Create the package**

```json
// packages/build-tools/package.json
{
  "name": "@restaurants/build-tools",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "copy-static": "node scripts/copy-static.mjs",
    "obfuscate": "node scripts/obfuscate.mjs",
    "build:cloud": "node scripts/obfuscate.mjs && node scripts/compile-bytecode.mjs",
    "build:desktop": "node scripts/obfuscate.mjs && node scripts/compile-binary.mjs"
  },
  "devDependencies": {
    "javascript-obfuscator": "^4.1.1",
    "bytenode": "^1.5.7",
    "@yao-pkg/pkg": "^5.15.0"
  }
}
```

- [ ] **Step 6.2: Install build-tools dependencies**

```bash
cd packages/build-tools && pnpm install
```

- [ ] **Step 6.3: Create copy-static.mjs**

This script copies both Astro dist directories into `api-core/public/` before the NestJS build.

```js
// packages/build-tools/scripts/copy-static.mjs
import { cpSync, mkdirSync, rmSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '../../..');

const publicDir = resolve(root, 'apps/api-core/public');
rmSync(publicDir, { recursive: true, force: true });
mkdirSync(publicDir, { recursive: true });

// Copy dashboard to root of public (dashboard is the main UI at /)
cpSync(resolve(root, 'apps/ui-dashboard/dist'), publicDir, { recursive: true });

// Copy storefront to /storefront
cpSync(
  resolve(root, 'apps/ui-storefront/dist'),
  resolve(publicDir, 'storefront'),
  { recursive: true },
);

console.log('✓ Static files copied to api-core/public/');
```

- [ ] **Step 6.4: Create obfuscate.mjs**

```js
// packages/build-tools/scripts/obfuscate.mjs
import JavaScriptObfuscator from 'javascript-obfuscator';
import { readdirSync, readFileSync, writeFileSync, statSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '../../..');
const distDir = resolve(root, 'apps/api-core/dist');

// Conservative settings safe for NestJS (preserves decorator metadata)
const OPTIONS = {
  renameGlobals: false,
  rotateStringArray: true,
  stringArray: true,
  stringArrayRotate: true,
  stringArrayShuffle: true,
  stringArrayIndexShift: true,
  stringArrayEncoding: ['base64'],
  deadCodeInjection: false,
  controlFlowFlattening: false,
};

function obfuscateDir(dir) {
  for (const entry of readdirSync(dir)) {
    const full = resolve(dir, entry);
    if (statSync(full).isDirectory()) {
      obfuscateDir(full);
    } else if (entry.endsWith('.js')) {
      const source = readFileSync(full, 'utf8');
      const result = JavaScriptObfuscator.obfuscate(source, OPTIONS);
      writeFileSync(full, result.getObfuscatedCode(), 'utf8');
    }
  }
}

obfuscateDir(distDir);
console.log('✓ NestJS dist obfuscated in place');
```

- [ ] **Step 6.5: Create compile-bytecode.mjs (cloud)**

```js
// packages/build-tools/scripts/compile-bytecode.mjs
import { execSync } from 'child_process';
import { readdirSync, statSync, unlinkSync, cpSync, rmSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '../../..');
const distDir = resolve(root, 'apps/api-core/dist');
const bytecodeDir = resolve(root, 'apps/api-core/dist-bytecode');

rmSync(bytecodeDir, { recursive: true, force: true });
cpSync(distDir, bytecodeDir, { recursive: true }); // cross-platform, no shell cp

function compileDir(dir) {
  for (const entry of readdirSync(dir)) {
    const full = resolve(dir, entry);
    if (statSync(full).isDirectory()) {
      compileDir(full);
    } else if (entry.endsWith('.js')) {
      execSync(`npx bytenode --compile "${full}"`);
      unlinkSync(full); // remove original .js after compiling to .jsc
    }
  }
}

compileDir(bytecodeDir);
console.log('✓ Cloud bytecode compiled to dist-bytecode/');
```

- [ ] **Step 6.6: Create compile-binary.mjs (desktop)**

```js
// packages/build-tools/scripts/compile-binary.mjs
import { execSync } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '../../..');
const entry = resolve(root, 'apps/api-core/dist/main.js');
const outDir = resolve(root, 'apps/api-core/dist-binary');

const targets = [
  'node22-win-x64',
  'node22-macos-x64',
  'node22-macos-arm64',
];

for (const target of targets) {
  const outFile = resolve(outDir, `api-core-${target}`);
  execSync(
    `npx @yao-pkg/pkg "${entry}" --target ${target} --output "${outFile}"`,
    { stdio: 'inherit' }
  );
  console.log(`✓ Binary built: api-core-${target}`);
}
```

- [ ] **Step 6.7: Test the copy-static script manually**

First build both Astro apps, then run:

```bash
cd apps/ui-dashboard && pnpm build
cd apps/ui-storefront && pnpm build
cd packages/build-tools && pnpm copy-static
```

Expected: `apps/api-core/public/` contains the dashboard HTML files and a `storefront/` subdirectory.

- [ ] **Step 6.8: Commit**

```bash
git add packages/build-tools/
git commit -m "feat(build-tools): add shared obfuscation, bytecode, and binary compilation scripts"
```

---

## Task 7: Wire up the full build pipeline in Turborepo

**Files:**
- Modify: `turbo.json`

- [ ] **Step 7.1: Update turbo.json with the new tasks**

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
    "lint": {},
    "copy-static": {
      "dependsOn": ["ui-dashboard#build", "ui-storefront#build"],
      "outputs": ["apps/api-core/public/**"]
    },
    "build:cloud": {
      "dependsOn": ["api-core#build", "@restaurants/build-tools#copy-static"],
      "outputs": ["apps/api-core/dist-bytecode/**"]
    },
    "build:desktop": {
      "dependsOn": ["api-core#build", "@restaurants/build-tools#copy-static"],
      "outputs": ["apps/api-core/dist-binary/**"]
    }
  }
}
```

- [ ] **Step 7.2: Run the full desktop build pipeline (dry run — compilation steps will be slow)**

```bash
cd apps/api-core && pnpm build
cd packages/build-tools && pnpm copy-static
```

Verify `apps/api-core/public/` has content. Do NOT run `build:desktop` yet (requires large pkg download).

- [ ] **Step 7.3: Commit**

```bash
git add turbo.json
git commit -m "feat: wire Astro static copy and protected build tasks into Turborepo pipeline"
```

---

## Verification

After all tasks are complete:

1. `pnpm --filter ui-dashboard build` — produces `dist/` with static HTML
2. `pnpm --filter ui-storefront build` — produces `dist/` with static HTML
3. `cd apps/api-core && pnpm start:dev` → `curl http://localhost:3000/health` returns `{"status":"ok"}`
4. `cd packages/build-tools && pnpm copy-static` → `apps/api-core/public/` has dashboard and storefront files
5. `cd apps/api-core && pnpm prisma migrate deploy` → `All migrations have been applied.`
