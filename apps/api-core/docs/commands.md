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

#### Create Admin User
Creates a new user with ADMIN role.

```bash
pnpm run cli create-admin -e <email> -p <password>
```

**Options:**
- `-e, --email <email>`: Admin email address (Required).
- `-p, --password <password>`: Admin password (min 8 characters) (Required).
