# Dynamic URL Injection for Astro Build

## Why the Placeholder Exists

Astro is a static site generator that bakes `PUBLIC_*` environment variables into the JavaScript bundle at build time. Once the site is built, these values are hardcoded into the compiled `.js` files. To deploy the same Docker image across multiple environments (local, staging, production) with different API URLs, we cannot simply rebuild the image for each environment—this would defeat the purpose of containerization and slow down deployments.

The placeholder mechanism solves this: build once with a known string placeholder, then inject the actual URL at container startup.

## How It Works

> **Note:** This mechanism only applies to the **`prod` stage** (the nginx image). The `dev` stage used by `docker-compose.yml` runs `astro dev` directly and handles environment variables normally through `env_file` and `environment` overrides.

### Build Time
1. The image is built with `PUBLIC_API_URL=__PLACEHOLDER_API_URL__` (defined as a build argument in the Dockerfile)
2. This placeholder string is baked into the compiled `.js` files when `astro build` runs in the `build` stage
3. The compiled output in `/app/dist` contains the literal string `__PLACEHOLDER_API_URL__` wherever the API URL is used

### Runtime
4. The production image (`prod` stage) copies the compiled files from the `build` stage to nginx
5. At container startup, the entrypoint script (`docker/entrypoint.sh`) runs before nginx starts
6. The script uses `sed` to search all `.js` files in `/usr/share/nginx/html` and replace `__PLACEHOLDER_API_URL__` with the value of the `$PUBLIC_API_URL` environment variable. If `PUBLIC_API_URL` is unset, the script exits with an error (fail-fast behavior).
7. nginx then serves the modified files with the correct API URL injected

### Railway Deployment
`PUBLIC_API_URL` is configured as a Service Variable in Railway. When a container is deployed:
- Railway injects the environment variable at startup time
- The entrypoint script reads it and performs the sed replacement
- The image itself remains unchanged; only the running container's environment differs

## Trade-off: Scalability vs Simplicity

This approach is text-based replacement on compiled files. It works well for environment-specific URLs, but it has a cost: every new `PUBLIC_*` variable added to the codebase requires three updates:

1. **Dockerfile** — add an `ARG` in the `build` stage and assign it to `ENV`:
   ```dockerfile
   ARG MY_NEW_VAR=__PLACEHOLDER_MY_NEW_VAR__
   ENV MY_NEW_VAR=$MY_NEW_VAR
   ```

2. **entrypoint.sh** — add a `sed` line to replace the placeholder:
   ```bash
   find /usr/share/nginx/html -name "*.js" \
     -exec sed -i "s#__PLACEHOLDER_MY_NEW_VAR__#${MY_NEW_VAR}#g" {} +
   ```

3. **.env (local development)** — add the variable for local testing:
   ```
   PUBLIC_MY_NEW_VAR=http://localhost:...
   ```

Future maintainers should follow this pattern when adding new environment-dependent configuration.

## Files Involved

- `apps/ui/Dockerfile` — defines the `build` and `prod` stages with placeholder
- `apps/ui/docker/entrypoint.sh` — performs runtime replacement
- `apps/ui/.env` — local development defaults
