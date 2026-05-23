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
