# Pending: Instalación manual del binario de Electron

## Por qué no se descarga automáticamente

El monorepo usa `pnpm.onlyBuiltDependencies` en el `package.json` raíz como medida de
seguridad. Los scripts `postinstall` de los paquetes npm pueden ejecutar código arbitrario
en la máquina del desarrollador durante `pnpm install`. Para evitar esto, solo los paquetes
explícitamente permitidos pueden correr sus scripts de instalación:

```json
// package.json (raíz)
"pnpm": {
  "onlyBuiltDependencies": [
    "@nestjs/core",
    "@prisma/engines",
    "better-sqlite3",
    "prisma"
  ]
}
```

`electron` **no está en esa lista** → su script de descarga del binario nunca corre
automáticamente → ningún app del monorepo puede hacer que Electron descargue nada sin
acción explícita del desarrollador.

---

## Cómo instalar el binario manualmente

Solo se necesita una vez, después del primer `pnpm install` o al limpiar `node_modules`.

```bash
pnpm --filter @restaurants/desktop pending
```

Este comando corre `node node_modules/electron/install.js` dentro de `apps/desktop/`,
que descarga el binario de Electron para la plataforma actual desde los releases oficiales
de GitHub.

**Cuándo correrlo:**
- Primera vez que clonás el repo y querés correr `apps/desktop`
- Después de borrar `node_modules/` y volver a instalar
- Al cambiar la versión de Electron en `apps/desktop/package.json`

---

## Agregar un nuevo paquete nativo al allowlist

Si en el futuro se necesita que otro paquete corra su `postinstall` (por ejemplo, un
addon nativo nuevo), agregarlo explícitamente en el `package.json` raíz:

```json
"pnpm": {
  "onlyBuiltDependencies": [
    "@nestjs/core",
    "@prisma/engines",
    "better-sqlite3",
    "prisma",
    "nombre-del-nuevo-paquete"   ← agregar aquí
  ]
}
```

Solo hacerlo después de revisar el `postinstall` script del paquete y confirmar que es
seguro.
