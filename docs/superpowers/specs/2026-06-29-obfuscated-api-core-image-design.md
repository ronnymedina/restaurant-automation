# Imagen api-core ofuscada para distribución — Diseño

## Objetivo

Publicar una variante de la imagen `prod` de api-core con el `dist/` **ofuscado**, de modo
que el código distribuido no sirva como punto de partida para desarrollar un proyecto
derivado. La imagen debe seguir ejecutando **todo** igual que la no ofuscada (arranque,
migraciones, onboarding, login, uploads, etc.).

## Modelo de amenaza (qué protege y qué no)

- **Sí protege:** que un tercero tome la base de código distribuida y arranque/evolucione un
  proyecto nuevo encima. La imagen ya distribuye solo `dist/` (JS transpilado, nunca el `src/`
  TypeScript); ofuscarlo lo vuelve inservible como base de desarrollo (reescribir sale más
  barato que derivar).
- **No protege (y es aceptable):** ejecutar o redistribuir la imagen tal cual, ni ocultar
  *qué hace* el código. La ofuscación es una barrera de fricción, no cifrado: el `dist/`
  siempre es extraíble (`docker cp`) y ejecutable.

## Decisiones (cerradas en brainstorming)

1. **Mecanismo:** `javascript-obfuscator` (no bytecode). Settings conservadores que preservan
   la metadata de decoradores de NestJS y los nombres de clases/métodos.
2. **Alcance:** solo el backend (`api-core`). La UI ya se publica minificada por Astro/Vite;
   no se toca.
3. **Activación:** un **stage nuevo `prod-obfuscated`** en el Dockerfile, separado de `prod`.
   `prod` queda intacto (cloud/Railway, debuggeable); `prod-obfuscated` es lo que se publica a
   GHCR para self-host.

## Enfoque de integración

El script existente `packages/build-tools/scripts/obfuscate.mjs` fue hecho para un flujo
host-based (monorepo, fuera de Docker) del camino desktop abandonado, y vive fuera del build
context de api-core (`apps/api-core/`). En vez de cambiar el build context (invasivo), la
ofuscación se vuelve **auto-contenida dentro de `apps/api-core/`**.

## Componentes

### 1. Dependencia

- `javascript-obfuscator` se agrega como **devDependency** de `apps/api-core/package.json`.
- Se regenera `apps/api-core/pnpm-lock.yaml` (el Dockerfile instala con `--frozen-lockfile`,
  así que el lock debe incluir la nueva dependencia o el build falla).

### 2. Script `apps/api-core/scripts/obfuscate.mjs`

- Ofusca `dist/` **in-place** (recorre recursivamente los `.js` y los reescribe).
- Reutiliza los mismos `OPTIONS` conservadores del script original:
  `renameGlobals: false`, `controlFlowFlattening: false`, `deadCodeInjection: false`,
  `stringArray: true` con `stringArrayEncoding: ['base64']` y rotación/shuffle.
- Rutas relativas a su propio `dist/` (no al root del monorepo).
- Imprime una confirmación al terminar.

### 3. Dockerfile `apps/api-core/Dockerfile` — stages nuevos

Los stages actuales (`deps`, `prod-deps`, `build`, `dev`, `prod`) **no se modifican**. Se
agregan dos:

```
obfuscate         FROM build
                  RUN node ./scripts/obfuscate.mjs      # ofusca /builder/dist in-place
                  (tiene node_modules completo de 'build', con javascript-obfuscator)

prod-obfuscated   idéntico a 'prod', salvo que el dist proviene de 'obfuscate':
                  COPY --from=obfuscate /builder/dist ./dist
                  (resto igual: node_modules prod, prisma, commands, uploads, USER node, CMD)
```

> El stage `build` debe tener `scripts/` disponible. Hoy copia `src/`, `prisma/`, `commands/`;
> se añade `COPY scripts ./scripts` (o se incluye en un COPY existente) para que
> `obfuscate.mjs` esté presente. `javascript-obfuscator` ya estará en `node_modules` porque
> `build` hereda los `node_modules` completos del stage `deps`.

### 4. Publicación

- El build de self-host/GHCR pasa a `--target prod-obfuscated`.
- El build de cloud/Railway sigue usando `prod` (sin ofuscar).
- Se actualiza `docs/self-hosting-publishing.md` (comandos de build apuntan a
  `prod-obfuscated`) y la mención del stage en `docs/railway-deployment.md` (Railway = `prod`).

## Verificación (gate — "que se ejecuten todos los comandos")

La compatibilidad de NestJS con la ofuscación se valida empíricamente, no se asume:

1. **Build:** la imagen `prod-obfuscated` se construye sin errores.
2. **Ofuscación efectiva:** inspeccionar el `dist/` dentro de la imagen y confirmar que está
   ofuscado (sin identificadores legibles; strings en arrays). Ej. revisar `dist/src/main.js`.
3. **Arranque:** `node dist/src/main` levanta Nest sin errores de DI/reflection
   (`Nest application successfully started`).
4. **Flujo self-host completo** con la imagen ofuscada: migraciones aplican, `GET /health`
   200, onboarding (lista de países + registro con `activationUrl`), login y subida de imagen
   de producto funcionan — los mismos flujos ya validados en navegador.
5. **Suite de tests** de api-core sigue verde (los tests corren sobre `src`, no sobre el
   `dist` ofuscado, así que no deberían verse afectados; se corren igual como control de
   regresión del código fuente no relacionado).

## Riesgos y mitigación

- **NestJS DI/reflection:** depende de `reflect-metadata`. Los settings conservadores
  preservan nombres de clases (DI por tipo intacta) y los tokens string se decodifican en
  runtime. Riesgo bajo, pero la verificación de arranque real (paso 3-4) es el gate. Si algo
  se rompe, se afina `OPTIONS` (ej. excluir `main.js`/archivos de bootstrap, o desactivar
  `stringArray` puntualmente).
- **Tamaño/performance:** los settings suaves (sin control-flow-flattening ni dead-code) tienen
  impacto de runtime despreciable. El `dist/` ofuscado puede crecer algo por los string arrays;
  aceptable.
- **Lockfile desincronizado:** si se olvida regenerar `pnpm-lock.yaml`, el `--frozen-lockfile`
  hace fallar el build de forma temprana y evidente. Mitigado por la verificación de build.

## Archivos afectados

**Nuevos:**
- `apps/api-core/scripts/obfuscate.mjs`

**Modificados:**
- `apps/api-core/package.json` (+ devDependency `javascript-obfuscator`)
- `apps/api-core/pnpm-lock.yaml` (regenerado)
- `apps/api-core/Dockerfile` (+ stages `obfuscate` y `prod-obfuscated`; `COPY scripts`)
- `docs/self-hosting-publishing.md` (target `prod-obfuscated` para publicar)
- `docs/railway-deployment.md` (aclarar que Railway usa `prod` no ofuscado)

**Fuera de alcance:** el script `packages/build-tools/scripts/obfuscate.mjs` y los demás de
`build-tools` (bytecode/binary) quedan como están; pertenecen al flujo desktop y no se tocan.
