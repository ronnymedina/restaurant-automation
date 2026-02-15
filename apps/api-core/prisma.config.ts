import path from 'node:path';
import { defineConfig } from 'prisma/config';
import { DATABASE_URL } from './src/config';

export default defineConfig({
  schema: path.join(__dirname, 'prisma', 'schema.prisma'),
  datasource: {
    url: DATABASE_URL,
  },
});
