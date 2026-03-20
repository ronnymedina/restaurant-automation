import { cpSync, mkdirSync, rmSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '../../..');

const publicDir = resolve(root, 'apps/api-core/public');
rmSync(publicDir, { recursive: true, force: true });
mkdirSync(publicDir, { recursive: true });

// Copy dashboard to root of public (dashboard is the main UI at /)
cpSync(resolve(root, 'apps/ui-dashboard/dist'), publicDir, { recursive: true });

// Copy storefront to /storefront
cpSync(
  resolve(root, 'apps/ui-storefront/dist'),
  resolve(publicDir, 'storefront'),
  { recursive: true },
);

console.log('✓ Static files copied to api-core/public/');
