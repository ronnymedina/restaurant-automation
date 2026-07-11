# Autohospedar la plataforma (self-hosting)

Esta guía instala todo el sistema en **una computadora** que actúa como servidor.
Los demás dispositivos (tótem, cocina, caja) se conectan por la red local (LAN).

## 1. Requisitos

- **Docker Desktop** instalado (Windows o macOS) o Docker Engine (Linux).
- La PC servidor con **IP estática** o **reserva DHCP** en el router (importante:
  si la IP cambia, los dispositivos pierden conexión).
- Los dispositivos en la **misma red WiFi/LAN** que la PC servidor.

## 2. Descargar los archivos

Descargá `docker-compose.yml` y `.env.example` (de la carpeta `deploy/` del proyecto)
a una carpeta nueva, por ejemplo `restaurantes/`.

## 3. Configurar

```bash
cp .env.example .env
```

Editá `.env` y completá como mínimo:

- `SERVER_IP` — la IP local de esta PC (ej. `192.168.1.50`). En Windows la ves con
  `ipconfig`; en macOS/Linux con `ifconfig` o `ip addr`.
- `GHCR_OWNER` — el usuario/organización de GitHub donde están publicadas las imágenes.
- `JWT_SECRET` y `POSTGRES_PASSWORD` — valores largos y únicos.

Email e IA son opcionales: si los dejás vacíos, el sistema funciona igual
(la activación se hace con un link en pantalla y los productos se cargan a mano).

## 4. Levantar

```bash
docker compose up -d
```

La primera vez descarga las imágenes y aplica las migraciones de la base de datos
automáticamente. Verificá que esté arriba:

```bash
docker compose ps
curl http://localhost:3000/health   # debe responder {"status":"ok"}
```

## 5. Primer uso (onboarding)

1. Abrí en el navegador: `http://<SERVER_IP>:8080` (ej. `http://192.168.1.50:8080`),
   usando el mismo `SERVER_IP` que pusiste en el `.env`.

   > **Importante — no uses `localhost`.** Aunque estés en la propia PC servidor,
   > entrá por `http://<SERVER_IP>:8080`. La API solo acepta peticiones desde ese
   > origen (CORS), y para el navegador `localhost` y la IP son orígenes distintos:
   > si abrís por `localhost`, el onboarding no podrá cargar (la lista de países
   > aparece vacía y el registro falla).
2. Entrá al onboarding y creá tu restaurante + tu usuario administrador.
3. Como no hay email configurado, al terminar verás un botón **"Activar mi cuenta"**.
   Hacé clic, definí tu contraseña y tu cuenta queda activa.
4. Iniciá sesión y cargá tus productos **manualmente** desde el dashboard.

> **Un solo restaurante por instancia.** Con `SINGLE_RESTAURANT_MODE=true` (default de la plantilla
> self-host), una vez que registrás tu restaurante el formulario de `/onboarding` deja de estar
> disponible: la página redirige a `/login`. Si en algún caso excepcional necesitás crear otro
> restaurante en la misma instancia, hacelo por línea de comando:
>
> ```bash
> docker compose exec res-api-core pnpm run cli create-restaurant --name "Otro Local"
> ```

## 6. Conectar otros dispositivos

Desde cualquier dispositivo en la misma red, abrí:

```
http://<SERVER_IP>:8080
```

(ej. `http://192.168.1.50:8080`). Tótem y cocina usan la misma URL.

## 7. Operación

- **Detener:** `docker compose down`
- **Actualizar a una nueva versión:** `docker compose pull && docker compose up -d`
- **Ver logs:** `docker compose logs -f res-api-core`
- **Backups:** los datos viven en los volúmenes Docker `postgres_data` (base de datos)
  y `uploads_data` (imágenes de productos). Respaldalos periódicamente, por ejemplo:
  `docker run --rm -v restaurantes_postgres_data:/data -v "$PWD":/backup alpine tar czf /backup/db-backup.tgz -C /data .`

## 8. Problemas comunes

- **El onboarding no carga la lista de países / el registro falla:** casi siempre es
  por entrar con la URL equivocada. Accedé por `http://<SERVER_IP>:8080` (la IP que
  pusiste en el `.env`), **nunca** por `http://localhost:8080`. La API solo permite
  ese origen (CORS) y, para el navegador, `localhost` y la IP no son lo mismo.
- **Otro dispositivo no conecta:** revisá que `SERVER_IP` sea correcto y que el
  firewall de la PC permita los puertos `8080` y `3000` entrantes en la red local.
- **No puedo iniciar sesión / la sesión se cae:** asegurate de acceder por
  `http://<SERVER_IP>:8080` (no `https`), ya que la instalación corre sobre HTTP en LAN.
