import { app, dialog } from 'electron';
import { spawn, ChildProcess } from 'child_process';
import { join } from 'path';
import { createServer } from 'net';
import * as http from 'http';

let childProcess: ChildProcess | null = null;
let resolvedUrl: string | null = null;

function getBinaryName(): string {
  const { platform, arch } = process;
  if (platform === 'darwin' && arch === 'arm64') return 'api-core-node22-macos-arm64';
  if (platform === 'darwin') return 'api-core-node22-macos-x64';
  if (platform === 'win32') return 'api-core-node22-win-x64.exe';
  throw new Error(`Unsupported platform: ${platform}/${arch}`);
}

function getBinaryDir(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'bin')
    : join(app.getAppPath(), '..', 'api-core', 'dist-binary');
}

async function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, '127.0.0.1', () => {
      const address = server.address() as { port: number };
      server.close(() => resolve(address.port));
    });
    server.on('error', reject);
  });
}

async function pollHealth(url: string, timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 500));
    try {
      await new Promise<void>((resolve, reject) => {
        const req = http.get(`${url}/health`, res => {
          if (res.statusCode === 200) resolve();
          else reject(new Error(`HTTP ${res.statusCode}`));
        });
        req.on('error', reject);
        req.setTimeout(1000, () => {
          req.destroy();
          reject(new Error('timeout'));
        });
      });
      return; // health check passed
    } catch {
      // retry after 500 ms
    }
  }
  throw new Error('Backend did not respond to /health within 30 seconds');
}

export async function startServer(): Promise<string> {
  const devBackend = process.env.ELECTRON_DEV_BACKEND;
  if (devBackend) {
    console.log(`[spawn] Using dev backend: ${devBackend}`);
    resolvedUrl = devBackend;
    return resolvedUrl;
  }

  const port = await findFreePort();
  const userData = app.getPath('userData');
  const binaryDir = getBinaryDir();
  const binaryPath = join(binaryDir, getBinaryName());

  console.log(`[spawn] Starting binary: ${binaryPath} on port ${port}`);

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PORT: String(port),
    NODE_ENV: 'production',
    DATABASE_URL: `file://${join(userData, 'database.sqlite')}`,
    UPLOADS_PATH: join(userData, 'uploads'),
    JWT_SECRET: process.env.JWT_SECRET ?? '',
    TZ: process.env.TZ ?? 'UTC',
    FRONTEND_URL: `http://localhost:${port}`,
  };

  // Pass native addon paths if provided in .env (required for packaged mode)
  if (process.env.BETTER_SQLITE3_BINDING) {
    env.BETTER_SQLITE3_BINDING = process.env.BETTER_SQLITE3_BINDING;
  }
  if (process.env.PRISMA_QUERY_ENGINE_LIBRARY) {
    env.PRISMA_QUERY_ENGINE_LIBRARY = process.env.PRISMA_QUERY_ENGINE_LIBRARY;
  }

  childProcess = spawn(binaryPath, [], {
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  childProcess.stdout?.on('data', (d: Buffer) =>
    console.log('[api-core]', d.toString().trimEnd()),
  );
  childProcess.stderr?.on('data', (d: Buffer) =>
    console.error('[api-core]', d.toString().trimEnd()),
  );
  childProcess.on('exit', code => {
    if (code !== 0 && code !== null) {
      dialog.showErrorBox(
        'Error del servidor',
        `El proceso del servidor se detuvo inesperadamente (código ${code}).\nReinicia la aplicación.`,
      );
      app.quit();
    }
  });

  resolvedUrl = `http://localhost:${port}`;
  await pollHealth(resolvedUrl);
  console.log(`[spawn] Backend ready at ${resolvedUrl}`);
  return resolvedUrl;
}

export function stopServer(): void {
  if (childProcess) {
    console.log('[spawn] Stopping backend process');
    childProcess.kill();
    childProcess = null;
  }
}

export function getServerUrl(): string | null {
  return resolvedUrl;
}
