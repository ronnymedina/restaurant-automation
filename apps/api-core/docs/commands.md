# Prisma Commands

## Generate Prisma Client
Steps to generate the Prisma Client after schema changes:

```bash
pnpm exec prisma generate
```

## Database Migration (Dev)
Create a new migration and apply it to the development database:

```bash
pnpm exec prisma migrate dev --name <migration_name>
```

## Database Studio
Open Prisma Studio to view and edit data:

```bash
pnpm exec prisma studio
```

## Management Commands

### CLI Tool
The application includes a CLI tool for management tasks.

#### Create Dummy (Demo Data)
Creates a demo restaurant, admin user and sample products in a single command. No options required.

```bash
pnpm run cli create-dummy
```

**Output:**
- Restaurant: "Demo Restaurant"
- Admin user: `admin@demo.com` / `admin1234`
- 3 demo products with default category

#### Create Restaurant
Creates a new restaurant.

```bash
pnpm run cli create-restaurant --name <name>
```

**Options:**
- `-n, --name <name>`: Restaurant name (Required).

**Output:** Prints `id`, `name` and `slug` of the created restaurant.

#### Create Admin User
Creates a new user with ADMIN role linked to a restaurant.

```bash
pnpm run cli create-admin -e <email> -p <password> --restaurant-id <id>
```

**Options:**
- `-e, --email <email>`: Admin email address (Required).
- `-p, --password <password>`: Admin password (min 8 characters) (Required).
- `--restaurant-id <id>`: Restaurant ID to associate with the admin (Required).

#### Resend Activation Emails
Finds all inactive users (accounts pending activation), generates a new activation token for each, and sends the activation email. Useful when users never received or lost their original activation link.

```bash
pnpm run cli resend-activation
```

Add `--dry-run` to preview affected users without sending emails or updating tokens:

```bash
pnpm run cli resend-activation --dry-run
```

Also available as a shell script from the repo root:

```bash
./commands/resend-activation.sh
./commands/resend-activation.sh --dry-run
```

**Output:** Logs each processed email with `✓` (sent) or `✗` (failed), and prints a final summary `sent: N, failed: N`.

## OpenAPI Spec

Swagger is mounted **only in development** (`main.ts`: `if (!isProduction)`), so the production
image does not expose `/docs`. To export the OpenAPI spec to a file:

```bash
# Requiere el api dev arriba: docker compose up -d res-db res-api-core
pnpm gen:openapi     # -> apps/api-core/openapi.json (siempre en api-core; git-ignored)
```

The script (`scripts/gen-openapi.sh`) pulls the spec from the dev server's `/docs-json` — the
real running app, so it never drifts from `main.ts`. It **assumes the dev API is already up**
(it does not verify or start anything); if `/docs-json` doesn't answer, it errors telling you to
bring the dev stack up. The output always lands at `apps/api-core/openapi.json` (an artifact,
git-ignored), regardless of the current directory.

To refresh the spec published in the blog (the sibling `daikulab` repo, served at `/api-docs`),
copy it after generating:

```bash
pnpm gen:openapi
cp openapi.json ../../../daikulab/public/openapi/restaurants-api-v1.json
```
