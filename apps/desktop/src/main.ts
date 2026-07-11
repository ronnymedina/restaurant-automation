// Load .env before any other module reads process.env
import { resolve } from 'path';
import { config } from 'dotenv';
config({ path: resolve(__dirname, '..', '.env') });

import { app, shell } from 'electron';
import { startServer, stopServer } from './server/spawn';
import { createTray, setTrayStatus } from './tray/tray';

// Prevent multiple instances
if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

// Hide from macOS Dock — this is a tray-only app
if (process.platform === 'darwin') {
  app.dock?.hide();
}

app.whenReady().then(async () => {
  // Register auto-start on boot (login item)
  app.setLoginItemSettings({
    openAtLogin: true,
    openAsHidden: true,
  });

  // Load or generate persistent app config
  const { getOrCreateAppConfig } = await import('./config/app-config');
  const appConfig = getOrCreateAppConfig();
  // Only set if not already provided via .env (dev mode override)
  if (!process.env.JWT_SECRET) {
    process.env.JWT_SECRET = appConfig.jwtSecret;
  }

  createTray();

  try {
    const url = await startServer();
    setTrayStatus('running');
    await shell.openExternal(url);
  } catch (err) {
    console.error('[main] Failed to start server:', err);
    stopServer();
    app.quit();
  }
});

// Keep the process alive even when no windows are open (tray-only app)
app.on('window-all-closed', () => {
  // Do not quit — the process lives in the tray
});
