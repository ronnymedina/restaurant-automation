# Pendiente: Configuración Dinámica de Base de Datos (SQLite / PostgreSQL)

**Fecha:** 2026-03-09
**Área:** `apps/api-core/prisma/`, `apps/api-core/src/prisma/`
**Prioridad:** Media

---

## Problema

El `schema.prisma` actual tiene el provider hardcodeado como `sqlite`. No existe manera de cambiar a PostgreSQL sin modificar el schema manualmente antes de hacer build.

```prisma
datasource db {
  provider = "sqlite" // ← hardcodeado
}
```

El objetivo es que el mismo binario pueda funcionar con SQLite (instalación local en el restaurante) o PostgreSQL (despliegue web / multi-tenant), configurado únicamente por variables de entorno.

---

## Limitación de Prisma

Prisma **no soporta** `provider = env("DATABASE_PROVIDER")` en el datasource — el provider debe ser un string literal en tiempo de build.

Por lo tanto, la solución no puede ser un solo schema dinámico. Se necesita una estrategia a nivel de build/deployment.

---

## Solución Propuesta: Schemas separados + script de selección

### Estructura de archivos

```
apps/api-core/prisma/
  schema.sqlite.prisma       ← provider = "sqlite"
  schema.postgresql.prisma   ← provider = "postgresql"
  schema.prisma              ← archivo activo (generado/copiado por el script)
  migrations/
    sqlite/                  ← migraciones para SQLite
    postgresql/              ← migraciones para PostgreSQL
```

### Variable de entorno nueva

```env
DATABASE_PROVIDER=sqlite       # default para instalación local
# o
DATABASE_PROVIDER=postgresql   # para despliegue web/cloud
```

### Script de selección (pre-build)

```ts
// scripts/select-db-schema.ts
// Copia schema.[provider].prisma → schema.prisma según DATABASE_PROVIDER
// Se ejecuta antes de `prisma generate` y `prisma migrate`
```

Agregar a `package.json`:
```json
"db:setup": "ts-node scripts/select-db-schema.ts && prisma generate",
"db:migrate": "ts-node scripts/select-db-schema.ts && prisma migrate deploy",
```

### Diferencias entre schemas

| Aspecto | SQLite | PostgreSQL |
|---------|--------|------------|
| `provider` | `"sqlite"` | `"postgresql"` |
| `DATABASE_URL` | `file:./data/restaurant.db` | `postgresql://user:pass@host/db` |
| Migraciones | Carpeta `migrations/sqlite/` | Carpeta `migrations/postgresql/` |
| `Decimal` fields | Soportado | Soportado |
| Enums | Soportado (desde Prisma 3.x) | Nativo |

### Configuración WAL para SQLite (producción local)

Agregar en el módulo Prisma al inicializar:

```ts
// En PrismaService.onModuleInit()
if (process.env.DATABASE_PROVIDER === 'sqlite') {
  await this.$executeRawUnsafe('PRAGMA journal_mode=WAL;');
  await this.$executeRawUnsafe('PRAGMA busy_timeout=5000;');
}
```

---

## Variables de entorno a documentar

Agregar en `docs/environments.md`:

```
DATABASE_PROVIDER: Driver de base de datos a usar.
  - Valores: sqlite | postgresql
  - Default: sqlite
  - Required: false

DATABASE_URL: URL de conexión.
  - SQLite default: file:./data/restaurant.db
  - PostgreSQL: postgresql://user:pass@localhost:5432/restaurants
  - Required: true
```

---

## Consideraciones

- **Migraciones**: Mantener las dos carpetas sincronizadas en schema. Al hacer cambios al modelo, generar migración para ambos providers.
- **CI/CD**: Correr tests con ambos providers (o al menos asegurar que el schema compile para los dos).
- **Docker**: El `Dockerfile` para instalación local incluye SQLite. El de cloud usa variables para apuntar a PostgreSQL externo.
- **driverAdapters**: Ya está habilitado en el schema (`previewFeatures = ["driverAdapters"]`). Si en el futuro se quiere usar `@prisma/adapter-libsql` (LibSQL/Turso), esto ya está listo.

---

## Referencias

- `apps/api-core/prisma/schema.prisma` — schema actual
- `apps/api-core/docs/environments.md` — variables documentadas
- Prisma docs: [Multi-provider schemas](https://www.prisma.io/docs/guides/other/multi-schema)
