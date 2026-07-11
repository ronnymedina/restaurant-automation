// Must be set before any module import that reads config.ts
process.env.JWT_SECRET = 'test-secret-e2e-minimum-32-chars!!!';
process.env.DATABASE_URL = 'postgresql://postgres:postgres@res-db:5432/restaurants_test';
process.env.RESEND_API_KEY = '';
process.env.NODE_ENV = 'test';
process.env.TZ = 'UTC';

// Allow BigInt values to be serialized to JSON (required for Prisma BigInt fields in e2e tests)
(BigInt.prototype as unknown as { toJSON: () => string }).toJSON = function () {
  return this.toString();
};
