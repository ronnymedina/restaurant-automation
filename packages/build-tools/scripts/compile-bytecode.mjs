import { execSync } from 'child_process';
import { readdirSync, statSync, unlinkSync, cpSync, rmSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '../../..');
const bytenode = resolve(__dirname, '../node_modules/.bin/bytenode');
const distDir = resolve(root, 'apps/api-core/dist');
const bytecodeDir = resolve(root, 'apps/api-core/dist-bytecode');

rmSync(bytecodeDir, { recursive: true, force: true });
cpSync(distDir, bytecodeDir, { recursive: true }); // cross-platform, no shell cp

function compileDir(dir) {
  for (const entry of readdirSync(dir)) {
    const full = resolve(dir, entry);
    if (statSync(full).isDirectory()) {
      compileDir(full);
    } else if (entry.endsWith('.js')) {
      execSync(`"${bytenode}" --compile "${full}"`, { stdio: 'inherit' });
      unlinkSync(full); // remove original .js after compiling to .jsc
    }
  }
}

compileDir(bytecodeDir);
console.log('✓ Cloud bytecode compiled to dist-bytecode/');
