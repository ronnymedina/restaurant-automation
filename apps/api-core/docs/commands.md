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
