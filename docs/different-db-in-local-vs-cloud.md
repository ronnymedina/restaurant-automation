# Estrategia: Base de datos local vs cloud (pendiente de implementar)

## Contexto

El sistema debe soportar dos modos de instalacion:

- **Local / self-hosted**: SQLite embebido, sin dependencias de servidor externo.
- **Cloud / Railway**: PostgreSQL gestionado por Railway.

La razon de mantener SQLite en local es que el perfil de usuario final (duenos de restaurantes) no deberia tener que instalar ni configurar un servidor de base de datos.

---

## Lo que Prisma abstrae y lo que no

| Cosa | Lo abstrae Prisma? |
|------|--------------------|
| Queries (`findMany`, `create`, etc.) | Si — el codigo TypeScript es identico |
| Tipos en el schema (`.prisma`) | Si — `String`, `Int`, `DateTime` son universales |
| SQL generado en migraciones | No — es especifico por motor |
| Tipos nativos de BD (`UUID`, `JSONB`) | No — son especificos por motor |

**Conclusion:** el codigo de la app (servicios, repositorios, queries) no cambia entre providers. Lo que cambia es el `provider` en el datasource y los archivos `.sql` de migraciones que Prisma genera.

---

## Diferencia real entre los dos schemas

La diferencia entre SQLite y PostgreSQL en Prisma se reduce a **una sola linea**:

```prisma
// SQLite (local)
datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}

// PostgreSQL (Railway / cloud)
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

Todo lo demas — modelos, relaciones, campos — queda identico.

---

## Providers disponibles en Prisma (referencia)

| Provider | Uso tipico |
|----------|-----------|
| `sqlite` | Local, self-hosted simple |
| `postgresql` | Cloud, produccion, Railway |
| `mysql` | Hosting compartido, PlanetScale |
| `mongodb` | NoSQL, datos no relacionales |
| `sqlserver` | Entornos Microsoft / enterprise |
| `cockroachdb` | PostgreSQL distribuido |

---

## Estrategia propuesta para implementar

### Estructura de archivos

```
apps/api-core/prisma/
├── schema.prisma                  ← schema activo (copiado por script)
├── schema.sqlite.prisma           ← para local / self-hosted
├── schema.postgresql.prisma       ← para Railway / cloud
└── migrations/
    ├── sqlite/                    ← migraciones generadas para SQLite
    └── postgresql/                ← migraciones generadas para PostgreSQL
```

### Scripts en package.json

```bash
# Selecciona schema y corre migraciones segun DATABASE_PROVIDER
DATABASE_PROVIDER=sqlite      pnpm db:setup   # local
DATABASE_PROVIDER=postgresql  pnpm db:setup   # cloud / Railway
```

Un script `scripts/select-schema.js` copia el schema correcto a `schema.prisma` antes de cualquier operacion de Prisma.

### Variables de entorno por entorno

```env
# Local / self-hosted
DATABASE_PROVIDER=sqlite
DATABASE_URL=file:./data.db

# Railway / cloud
DATABASE_PROVIDER=postgresql
DATABASE_URL=postgresql://user:pass@host:5432/db  # inyectado automaticamente por Railway
```

---

## Perfiles de usuario y base de datos recomendada

| Perfil | Base de datos | Como |
|--------|--------------|------|
| Restaurante pequeno, instala solo | SQLite | Sin dependencias, funciona de inmediato |
| Dev / tecnico que instala localmente | PostgreSQL via Docker | `docker run postgres:16-alpine` |
| Deploy en Railway | PostgreSQL | Automatico, Railway lo inyecta |

---

## Archivos a crear / modificar cuando se implemente

| Archivo | Accion | Descripcion |
|---------|--------|-------------|
| `apps/api-core/prisma/schema.sqlite.prisma` | Crear | Copia del schema actual con `provider = "sqlite"` |
| `apps/api-core/prisma/schema.postgresql.prisma` | Crear | Schema adaptado con `provider = "postgresql"` |
| `apps/api-core/prisma/schema.prisma` | Modificar | Pasa a ser generado por el script selector |
| `apps/api-core/package.json` | Modificar | Agregar scripts `db:setup`, `db:migrate` |
| `apps/api-core/scripts/select-schema.js` | Crear | Script selector de schema segun `DATABASE_PROVIDER` |
| `apps/api-core/src/main.ts` | Modificar | Cargar adaptador Prisma correcto segun provider |

---

## Notas adicionales

- Los modelos actuales no usan tipos nativos de PostgreSQL (`UUID`, `JSONB`, etc.), por lo que la diferencia entre ambas migraciones sera minima.
- El codigo de servicios y repositorios de NestJS **no requiere cambios** al cambiar de provider.
- Esta tarea esta bloqueada hasta que se defina y apruebe la estrategia de deploy en Railway (ver propuesta en conversacion).
