import { join } from 'path';

// app
export const PORT = process.env.PORT || 3000;
export const DATABASE_URL = process.env.DATABASE_URL || 'file:./dev.db';
export const NODE_ENV = process.env.NODE_ENV || 'development';

// ai
export const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
export const GEMINI_MODEL = process.env.GEMINI_MODEL || '';

// onboarding
const MAX_FILE_SIZE_MB = Number(process.env.MAX_FILE_SIZE_MB) || 5;
export const MAX_FILE_SIZE = MAX_FILE_SIZE_MB * 1024 * 1024; // Convert MB to bytes
export const MAX_FILES = Number(process.env.MAX_FILES) || 3;

// products
export const BATCH_SIZE = Number(process.env.BATCH_SIZE) || 10;
export const DEFAULT_CATEGORY_NAME = 'default';

// frontend
export const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:4321';

// pagination
export const DEFAULT_PAGE_SIZE = Number(process.env.DEFAULT_PAGE_SIZE) || 10;

// jwt
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} environment variable is required. Set it in your .env file.`,
    );
  }
  return value;
}
export const JWT_SECRET = requireEnv('JWT_SECRET');
export const JWT_ACCESS_EXPIRATION = process.env.JWT_ACCESS_EXPIRATION || '15m';
export const JWT_REFRESH_EXPIRATION =
  process.env.JWT_REFRESH_EXPIRATION || '7d';

// users
export const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
export const EMAIL_FROM = process.env.EMAIL_FROM || 'onboarding@resend.dev';
export const BCRYPT_SALT_ROUNDS = Number(process.env.BCRYPT_SALT_ROUNDS) || 10;

// kitchen
export const KITCHEN_TOKEN_EXPIRY_DAYS = Number(process.env.KITCHEN_TOKEN_EXPIRY_DAYS) || 60;

// timezone — Node reads TZ at startup via dotenv; also used explicitly in Intl.DateTimeFormat
export const TIMEZONE = requireEnv('TZ');

// print — if true, prints customer receipt immediately on order creation (not just on payment)
export const PRINT_CUSTOMER_ON_CREATE = process.env.PRINT_CUSTOMER_ON_CREATE === 'true';

// file paths — overridden by Electron in desktop mode
export const UPLOADS_PATH = process.env.UPLOADS_PATH
  ? process.env.UPLOADS_PATH
  : join(process.cwd(), 'uploads');

export const API_PUBLIC_PATH = process.env.API_PUBLIC_PATH
  ? process.env.API_PUBLIC_PATH
  : join(process.cwd(), 'public');
