import 'dotenv/config';
import path from 'node:path';
import { defineConfig } from 'prisma/config';

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://localhost:5432/restaurants';

const isSQLite = DATABASE_URL?.startsWith('file:');

const schemaFile = isSQLite ? 'schema.prisma' : 'schema.postgresql.prisma';

export default defineConfig({
  schema: path.join(__dirname, 'prisma', schemaFile),
  datasource: {
    url: DATABASE_URL,
  },
});
