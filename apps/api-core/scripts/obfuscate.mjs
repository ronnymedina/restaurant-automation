import JavaScriptObfuscator from 'javascript-obfuscator';
import { readdirSync, readFileSync, writeFileSync, statSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
// El script vive en apps/api-core/scripts/ → dist está un nivel arriba.
const distDir = resolve(__dirname, '../dist');

// Settings conservadores: seguros para NestJS (preservan metadata de decoradores
// y nombres de clases/métodos para que la inyección de dependencias siga funcionando).
const OPTIONS = {
  renameGlobals: false,
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
console.log('✓ api-core dist obfuscated in place');
