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

  createTray();

  try {
    const url = await startServer();
    setTrayStatus('running');
    // Open the system browser once the backend is ready
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
