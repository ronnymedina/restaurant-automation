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
