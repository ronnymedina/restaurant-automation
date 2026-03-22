import JavaScriptObfuscator from 'javascript-obfuscator';
import { readdirSync, readFileSync, writeFileSync, statSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '../../..');
const distDir = resolve(root, 'apps/api-core/dist');

// Conservative settings safe for NestJS (preserves decorator metadata)
const OPTIONS = {
  renameGlobals: false,
  rotateStringArray: true,
  stringArray: true,
  stringArrayRotate: true,
  stringArrayShuffle: true,
  stringArrayIndexShift: true,
  stringArrayEncoding: ['base64'],
  deadCodeInjection: false,
  controlFlowFlattening: false,
};

function obfuscateDir(dir) {
  for (const entry of readdirSync(dir)) {
    const full = resolve(dir, entry);
    if (statSync(full).isDirectory()) {
      obfuscateDir(full);
    } else if (entry.endsWith('.js')) {
      const source = readFileSync(full, 'utf8');
      const result = JavaScriptObfuscator.obfuscate(source, OPTIONS);
      writeFileSync(full, result.getObfuscatedCode(), 'utf8');
    }
  }
}

obfuscateDir(distDir);
console.log('✓ NestJS dist obfuscated in place');
