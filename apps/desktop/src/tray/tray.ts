import { app, Menu, Tray, nativeImage, shell } from 'electron';
import { join } from 'path';
import { stopServer, getServerUrl } from '../server/spawn';

let tray: Tray | null = null;

function loadIcon(): Electron.NativeImage {
  const base = app.isPackaged ? join(process.resourcesPath, 'resources') : join(app.getAppPath(), 'resources');
  const icon1x = join(base, 'icon.png');
  const icon2x = join(base, 'icon@2x.png');

  const img = nativeImage.createFromPath(icon1x);
  if (!img.isEmpty()) {
    const img2x = nativeImage.createFromPath(icon2x);
    if (!img2x.isEmpty()) img.addRepresentation({ scaleFactor: 2, buffer: img2x.toPNG() });
    img.setTemplateImage(true); // macOS: auto-adapts to light/dark mode
  }
  return img;
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
