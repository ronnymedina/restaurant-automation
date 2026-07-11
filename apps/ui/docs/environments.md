# Variables de Entorno — ui

Las variables `PUBLIC_*` son bakeadas dentro del bundle JS en tiempo de build por Astro. No pueden modificarse en runtime sin reconstruir, excepto `PUBLIC_API_URL` que usa el mecanismo de placeholder descrito en el README.

Todas las variables se centralizan en `src/config.ts` y se acceden a través de ese módulo.

---

### API / BACKEND

* **PUBLIC_API_URL**: URL base del backend API.
  - Default: `http://localhost:3000`
  - Required: `true` (requerida en producción — el contenedor usa un placeholder que se inyecta en arranque)
  - Ejemplo: `https://api.tudominio.com`

---

### STOREFRONT / KIOSK

* **PUBLIC_STOREFRONT_URL**: URL base del kiosk público (storefront).
  - Default: `window.location.origin` (URL actual del navegador)
  - Required: `false`
  - Ejemplo: `https://kiosk.tudominio.com`

---

### SOPORTE

* **PUBLIC_SUPPORT_EMAIL**: Dirección de email de soporte que se muestra en el dashboard.
  - Default: `""` (vacío — el elemento se oculta si está vacío)
  - Required: `false`
  - Ejemplo: `soporte@tudominio.com`

* **PUBLIC_SUPPORT_GOOGLE_FORM_URL**: URL del formulario de Google para soporte técnico.
  - Default: `""` (vacío — el elemento se oculta si está vacío)
  - Required: `false`
  - Ejemplo: `https://forms.gle/xxxxxx`