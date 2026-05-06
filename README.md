# restaurant-automation

Plataforma de automatización para restaurantes. Incluye un **kiosco** para que los clientes ordenen y un **dashboard de gestión** para el personal.

Desplegada en Railway (cloud). Cada app tiene su propio Dockerfile con stages para desarrollo y producción.

---

## Apps

| App | Descripción | README |
|-----|-------------|--------|
| `apps/api-core` | Backend NestJS + Prisma + PostgreSQL | [README](apps/api-core/README.md) |
| `apps/ui` | Frontend Astro (kiosco + dashboard) | [README](apps/ui/README.md) |

### Próximamente (no activos)

| App | Descripción |
|-----|-------------|
| `apps/license-server` | Servidor de licencias RSA — pendiente de integrar |
| `apps/desktop` | App Electron para uso sin internet — pendiente de implementar |

---

## Desarrollo local con Docker

El `docker-compose.yml` en la raíz levanta los tres servicios: backend, frontend y base de datos.

```bash
# Levantar todo
docker compose up

# Solo el backend + base de datos
docker compose up res-api-core res-db

# Solo el frontend
docker compose up res-ui
```

Cada app monta su `src/` como volumen, por lo que los cambios se reflejan en caliente sin reconstruir la imagen.

### Variables de entorno

Cada app lee su propio archivo `.env`:

```
apps/api-core/.env    # base de datos, JWT, claves opcionales
apps/ui/.env          # PUBLIC_API_URL (en local apunta a res-api-core)
```

Ver la documentación de cada app para la referencia completa de variables.

---

## Stages de Docker

Ambas apps usan builds multi-stage. El `docker-compose.yml` usa el stage `dev`; Railway usa el stage `prod`.

| Stage | api-core | ui |
|-------|----------|----|
| `deps` | Instala dependencias | Instala dependencias |
| `dev` | NestJS con hot reload | Astro dev server |
| `build` | Compila NestJS → `dist/` | Build estático con placeholder bakeado |
| `prod` | Node slim + migraciones al arrancar | nginx + inyección de URL en arranque |

---

## Deploy (Railway)

Cada app se despliega de forma independiente en Railway apuntando a su propio `Dockerfile`.

- **api-core**: usa el stage `prod`. Corre migraciones Prisma al arrancar.
- **ui**: usa el stage `prod`. nginx sirve el bundle estático; `entrypoint.sh` inyecta `PUBLIC_API_URL` en runtime para evitar reconstruir la imagen por entorno.

Ver el README de cada app para los detalles de configuración en Railway.
