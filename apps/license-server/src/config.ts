import { readFileSync } from 'fs';
import { resolve } from 'path';

export const PORT = Number(process.env.PORT) || 3001;
export const DATABASE_URL = process.env.DATABASE_URL!;
export const ADMIN_API_KEY = process.env.ADMIN_API_KEY!;
export const JWT_ISSUER = process.env.JWT_ISSUER || 'restaurant-license-server';

// Support RSA key from env var (Railway) or from file (local dev)
export const RSA_PRIVATE_KEY = process.env.RSA_PRIVATE_KEY
  ? process.env.RSA_PRIVATE_KEY.replace(/\\n/g, '\n')
  : readFileSync(
      resolve(process.env.RSA_PRIVATE_KEY_PATH ?? './keys/private.pem'),
      'utf8',
    );
