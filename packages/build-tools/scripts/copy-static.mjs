import { cpSync, mkdirSync, rmSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '../../..');

const publicDir = resolve(root, 'apps/api-core/public');
rmSync(publicDir, { recursive: true, force: true });
mkdirSync(publicDir, { recursive: true });

// Copy unified UI to root of public
cpSync(resolve(root, 'apps/ui/dist'), publicDir, { recursive: true });

console.log('✓ Static files copied to api-core/public/');
