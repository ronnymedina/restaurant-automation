import * as path from 'path';

// Must be set before any module import that reads config.ts
process.env.JWT_SECRET = 'test-secret-e2e';
process.env.DATABASE_URL = `file:${path.resolve(__dirname, 'test-e2e.db')}`;
process.env.RESEND_API_KEY = '';
process.env.NODE_ENV = 'test';
process.env.TZ = 'UTC';

// Allow BigInt values to be serialized to JSON (required for Prisma BigInt fields in e2e tests)
(BigInt.prototype as unknown as { toJSON: () => string }).toJSON = function () {
  return this.toString();
};
