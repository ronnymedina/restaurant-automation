import { execSync } from 'child_process';
import { mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '../../..');
const entry = resolve(root, 'apps/api-core/dist/main.js');
const outDir = resolve(root, 'apps/api-core/dist-binary');

mkdirSync(outDir, { recursive: true });

const targets = [
  'node22-win-x64',
  'node22-macos-x64',
  'node22-macos-arm64',
];

for (const target of targets) {
  const outFile = resolve(outDir, `api-core-${target}`);
  execSync(
    `npx @yao-pkg/pkg "${entry}" --target ${target} --output "${outFile}"`,
    { stdio: 'inherit' }
  );
  console.log(`✓ Binary built: api-core-${target}`);
}
