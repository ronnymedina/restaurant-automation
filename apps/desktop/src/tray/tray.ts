import { app, Menu, Tray, nativeImage, shell } from 'electron';
import { join } from 'path';
import { stopServer, getServerUrl } from '../server/spawn';

let tray: Tray | null = null;

function loadIcon(): Electron.NativeImage {
  const iconPath = app.isPackaged
    ? join(process.resourcesPath, 'resources', 'icon.png')
    : join(app.getAppPath(), 'resources', 'icon.png');

  const img = nativeImage.createFromPath(iconPath);
  // Return empty image gracefully if file is missing in dev
  return img.isEmpty() ? nativeImage.createEmpty() : img.resize({ width: 16, height: 16 });
}

export function createTray(): void {
  tray = new Tray(loadIcon());
  tray.setToolTip('Restaurantes POS');
  setTrayStatus('starting');

  // Double-click opens browser (convenience on macOS/Windows)
  tray.on('double-click', () => {
    const url = getServerUrl();
    if (url) shell.openExternal(url);
  });
}

export function setTrayStatus(status: 'starting' | 'running'): void {
  if (!tray) return;

  const serverUrl = getServerUrl();

  const menu = Menu.buildFromTemplate([
    {
      label: 'Abrir dashboard',
      enabled: status === 'running',
      click: () => {
        if (serverUrl) shell.openExternal(serverUrl);
      },
    },
    {
      label: status === 'running' ? 'Servidor: corriendo ✓' : 'Servidor: iniciando…',
      enabled: false,
    },
    { type: 'separator' },
    {
      label: 'Salir',
      click: () => {
        stopServer();
        tray?.destroy();
        tray = null;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(menu);
}
