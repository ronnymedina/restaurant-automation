# restaurant-automation

Monorepo con Turborepo + pnpm workspaces.

---

## Apps

| Paquete | Descripción |
|---------|-------------|
| `@restaurants/api-core` | Backend NestJS + SQLite/PostgreSQL |
| `@restaurants/ui-dashboard` | Dashboard Astro (estático) |
| `@restaurants/ui-storefront` | Kiosco Astro (estático) |
| `@restaurants/license-server` | API de licencias RSA (Railway) |

---

## Instalación

Un solo comando desde la raíz instala las dependencias de **todos** los paquetes:

```bash
pnpm install
```

Para agregar una dependencia a un paquete específico:

```bash
pnpm --filter @restaurants/api-core add <paquete>
pnpm --filter @restaurants/ui-dashboard add <paquete>
pnpm --filter @restaurants/license-server add <paquete>

# Como devDependency
pnpm --filter @restaurants/api-core add -D <paquete>
```

---

## Comandos

### Todos los paquetes a la vez

```bash
pnpm build   # build de todos los paquetes (Turbo resuelve el orden)
pnpm dev     # modo desarrollo para todos
pnpm lint    # lint de todos
```

### Un paquete específico

```bash
pnpm --filter @restaurants/api-core build
pnpm --filter @restaurants/ui-dashboard build
pnpm --filter @restaurants/ui-storefront build
pnpm --filter @restaurants/license-server build
```

### Build de producción (ofuscación + artefactos protegidos)

```bash
pnpm copy-static    # copia Astro dist → api-core/public/
pnpm build:cloud    # obfusca + bytecode .jsc (para Railway)
pnpm build:desktop  # obfusca + binario standalone (para Electron)
```

Ver [`docs/build-and-test-guide.md`](docs/build-and-test-guide.md) para el pipeline completo.

---

## Convención de scripts

> **Para que un comando de Turbo funcione en todos los paquetes, cada sub-paquete debe tener ese script definido en su `package.json`.**

Turbo recorre todos los paquetes del workspace y ejecuta el script si existe. Si un paquete no lo tiene, lo omite silenciosamente — ese paquete no participa en el pipeline.

Ejemplo: `pnpm build` ejecuta el script `build` en cada paquete que lo tenga declarado:

```
apps/api-core/package.json        → "build": "nest build"        ✅ se ejecuta
apps/ui-dashboard/package.json    → "build": "astro build"       ✅ se ejecuta
apps/ui-storefront/package.json   → "build": "astro build"       ✅ se ejecuta
apps/license-server/package.json  → "build": "nest build"        ✅ se ejecuta
apps/desktop/package.json         → (sin script build)           ⏭ se omite
```

Por lo tanto, si agregas un nuevo paquete y quieres que participe en `pnpm build`, `pnpm dev`, o cualquier otro comando de Turbo, **debes agregar ese script en su `package.json`**.

---

## Run in producction

```bash

# backend
pnpm --filter @restaurants/api-core start:prod
```

---

## Protección de código (ofuscación)

> **Solo aplica para distribución a clientes. No usar en desarrollo local.**

Cuando el software se entrega a un cliente — ya sea como una aplicación de escritorio (Electron) o como un servicio desplegado en su propio servidor — el código fuente del backend debe ser protegido antes de entregarlo. La ofuscación transforma el JS compilado en código ilegible, dificultando la ingeniería inversa.

**La ofuscación no aplica al frontend** (dashboard y kiosco): ese código siempre llega al navegador del usuario y los bundlers ya aplican minificación estándar.

### Cuándo ofuscar

| Escenario | ¿Ofuscar? |
|-----------|-----------|
| Desarrollo local (`start:dev`) | ❌ Nunca |
| Deploy propio en Railway (SaaS) | ✅ Antes del build de producción |
| Empaquetado como app Electron | ✅ Antes de compilar el binario |

### Comandos

```bash
# 1. Compilar el backend
pnpm --filter @restaurants/api-core build

# 2. Ofuscar el dist/ (modifica los archivos in-place)
pnpm obfuscate

# 3a. Para cloud: compilar a bytecode .jsc (Railway)
pnpm build:cloud

# 3b. Para desktop: compilar a binario standalone (Electron)
pnpm build:desktop
```

> ⚠️ `pnpm obfuscate` sobreescribe `apps/api-core/dist/` directamente.
> Para restaurar el código original: volver a correr `pnpm --filter @restaurants/api-core build`.

Ver [`docs/build-and-test-guide.md`](docs/build-and-test-guide.md) para el pipeline completo con todos los pasos.

---

## Estructura

```
apps/
├── api-core/          NestJS backend
├── ui-dashboard/      Astro dashboard
├── ui-storefront/     Astro kiosco
├── license-server/    NestJS licencias
└── desktop/           Electron wrapper (Plan 3)

packages/
└── build-tools/
    └── scripts/       Scripts de ofuscación y compilación (sin package.json propio)

docs/
├── build-and-test-guide.md   Guía de build y Electron
└── superpowers/              Specs y planes de implementación
```
