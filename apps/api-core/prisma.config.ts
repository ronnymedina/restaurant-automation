import 'dotenv/config';
import path from 'node:path';
import { defineConfig } from 'prisma/config';
import { DATABASE_URL } from './src/config';

const isPostgres =
  DATABASE_URL?.startsWith('postgresql://') || DATABASE_URL?.startsWith('postgres://');

const schemaFile = isPostgres ? 'schema.postgresql.prisma' : 'schema.prisma';

export default defineConfig({
  schema: path.join(__dirname, 'prisma', schemaFile),
  datasource: {
    url: DATABASE_URL,
  },
});
