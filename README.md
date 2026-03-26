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

### `pnpm build:cloud` — qué hace y por qué

Este comando prepara el backend para ser entregado a un cliente que lo desplegará en su propio servidor (Railway u otro). Ejecuta dos pasos:

1. **Ofusca** el código JS compilado — transforma nombres de variables, encripta strings, hace el código ilegible
2. **Compila a bytecode** con `bytenode` — convierte cada `.js` a `.jsc` (formato binario interno de V8), que no puede ser leído ni decompilado con herramientas disponibles públicamente

El resultado en `apps/api-core/dist-bytecode/` se empaqueta en un Docker y se entrega al cliente. El cliente recibe la aplicación funcionando pero **sin acceso al código fuente**.

#### Por qué bytecode y no el binario standalone

Un build normal (`pnpm build`) produce JS legible en `dist/`. Un binario (`build:desktop`) empaqueta Node.js dentro del ejecutable — útil para desktop donde el cliente no tiene Node instalado. El bytecode es la opción para cloud porque:

- El servidor ya tiene Node.js (Railway lo provee)
- Los `.jsc` son mucho más livianos que un binario con Node embebido
- No hay redundancia de empaquetar Node.js dentro de un contenedor que ya lo tiene

#### Por qué esto importa al entregar a un cliente

Cuando se entrega el software a un cliente para que lo corra en su propio servidor, **se pierde el acceso**. El cliente administra su máquina, puede inspeccionar los archivos, contratar a alguien para que analice el código. El bytecode hace que eso sea prácticamente inviable sin herramientas especializadas.

La capa de seguridad real sigue siendo la **verificación RSA de licencia**: aunque alguien lograra modificar el código, no puede generar un token JWT válido sin la llave privada que solo vive en el servidor de licencias. La app no arranca sin un token válido.

### `pnpm build:desktop` — qué hace y por qué

Este comando prepara el backend para ser distribuido como una **aplicación de escritorio** (Electron) que el cliente instala en su propio equipo. Ejecuta dos pasos:

1. **Ofusca** el código JS compilado (igual que `build:cloud`)
2. **Compila a binario standalone** con `@yao-pkg/pkg` — empaqueta el código junto con Node.js dentro de un único ejecutable por plataforma

El resultado queda en `apps/api-core/dist-binary/`:

```
dist-binary/
├── api-core-node22-win-x64          → Windows (64-bit)
├── api-core-node22-macos-x64        → macOS Intel
└── api-core-node22-macos-arm64      → macOS Apple Silicon
```

Cada archivo es un ejecutable independiente que **no requiere tener Node.js instalado** en la máquina del cliente — Node.js va embebido adentro.

#### Para qué sirve

El binario es el servidor NestJS (API + base de datos SQLite) que Electron va a ejecutar en segundo plano cuando el cliente abra la aplicación en su restaurante. El flujo en la app de escritorio es:

```
Cliente enciende el equipo
  → Electron arranca automáticamente
  → Electron ejecuta el binario (api-core-node22-macos-arm64)
  → El binario levanta NestJS en un puerto local
  → Electron abre una ventana apuntando a localhost:{puerto}
  → El restaurante opera normalmente sin internet
```

#### Cuándo usarlo

Solo cuando se va a empaquetar una nueva versión del instalador de escritorio (`.dmg` para macOS, `.exe` para Windows). No se usa en desarrollo ni en deploys cloud.

> ⚠️ La primera vez descarga Node.js para cada plataforma (~150 MB × 3 targets). Puede tardar varios minutos.
> Siempre correr un build limpio antes para evitar ofuscar código ya ofuscado:
> ```bash
> pnpm --filter @restaurants/api-core build && pnpm build:desktop
> ```

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
├── pending-to-deploy-the-stack.md   Checklist de deploy (firma, Railway, iconos)
└── superpowers/              Specs y planes de implementación
    ├── specs/pending-2026-03-18-desktop-packaging-design.md   Diseño completo de distribución (licencia en binario pendiente)
    └── specs/pending-2026-03-25-electron-app-dev-mode-design.md   Diseño dev mode Electron app (pendiente implementar)
```

---

## Electron App (`apps/desktop`)

> Ver [`docs/superpowers/specs/pending-2026-03-25-electron-app-dev-mode-design.md`](docs/superpowers/specs/pending-2026-03-25-electron-app-dev-mode-design.md) para el diseño completo.
> Ver [`docs/pending-to-deploy-the-stack.md`](docs/pending-to-deploy-the-stack.md) para el checklist de publicación (firma, Railway, iconos).

Una vez implementado, correr en modo desarrollo:

```bash
cd apps/desktop
cp .env.example .env   # ajustar valores
pnpm install
pnpm dev               # tsc + electron .
```

Variables de entorno útiles para dev:

| Variable | Descripción |
|----------|-------------|
| `ELECTRON_DEV_BACKEND=http://localhost:3000` | Usa NestJS ya corriendo en lugar de spawnear el binario |
