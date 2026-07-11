import { app } from 'electron';
import { join } from 'path';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { randomBytes } from 'crypto';

interface AppConfig {
  jwtSecret: string;
}

function isValidConfig(data: unknown): data is AppConfig {
  return (
    typeof data === 'object' &&
    data !== null &&
    typeof (data as Record<string, unknown>).jwtSecret === 'string' &&
    (data as AppConfig).jwtSecret.length > 0
  );
}

export function getOrCreateAppConfig(): AppConfig {
  const userData = app.getPath('userData');
  const configPath = join(userData, 'config.json');

  if (existsSync(configPath)) {
    try {
      const raw = JSON.parse(readFileSync(configPath, 'utf8'));
      if (isValidConfig(raw)) return raw;
    } catch {
      // Fall through to regenerate
    }
  }

  const config: AppConfig = {
    jwtSecret: randomBytes(32).toString('hex'),
  };

  mkdirSync(userData, { recursive: true });
  writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
  console.log(`[app-config] Generated new config at ${configPath}`);
  return config;
}
