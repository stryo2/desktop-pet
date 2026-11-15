import { app, BrowserWindow, ipcMain, Menu, nativeImage, screen, Tray } from 'electron';
import * as path from 'node:path';
import { listPets, loadPet } from './petLoader.js';

// The window is a little bigger than the cat, leaving room above it for hops and hearts.
const WIN_W = 160;
const WIN_H = 130;

// v2: read this from settings and let the user pick from listPets().
const PET_ID = 'cat';

const rootDir = path.join(__dirname, '..', '..');
const petsDir = path.join(rootDir, 'pets');

let win: BrowserWindow | null = null;
let tray: Tray | null = null;

function isPoint(p: unknown): p is { x: number; y: number } {
  const o = p as { x?: unknown; y?: unknown } | null;
  return !!o && Number.isFinite(o.x) && Number.isFinite(o.y);
}

/** Bottom-right of the primary screen, sitting on the taskbar. */
function homePosition(): { x: number; y: number } {
  const wa = screen.getPrimaryDisplay().workArea;
  return { x: Math.round(wa.x + wa.width * 0.75), y: wa.y + wa.height - WIN_H };
}

function moveTo(x: number, y: number): void {
  // setBounds (not setPosition) keeps the size fixed when crossing monitors with different scaling.
  win?.setBounds({ x: Math.round(x), y: Math.round(y), width: WIN_W, height: WIN_H });
}

function buildMenu(): Menu {
  return Menu.buildFromTemplate([
    {
      label: 'Bring cat back',
      click: () => {
        const p = homePosition();
        moveTo(p.x, p.y);
        win?.webContents.send('pet:displayChanged');
      },
    },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() },
  ]);
}

function createWindow(): void {
  const home = homePosition();
  win = new BrowserWindow({
    width: WIN_W,
    height: WIN_H,
    x: home.x,
    y: home.y,
    transparent: true,
    backgroundColor: '#00000000',
    frame: false,
    thickFrame: false,
    hasShadow: false,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    focusable: false, // never steal focus from what you're typing in
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false, // keep the cat moving when other apps are focused
    },
  });

  // Clicks pass through to whatever is behind the window, but mouse moves are still
  // forwarded so the page can notice when the cursor is over the cat.
  win.setIgnoreMouseEvents(true, { forward: true });
  win.loadFile(path.join(rootDir, 'static', 'index.html'));
  win.once('ready-to-show', () => win?.showInactive());
  win.on('closed', () => (win = null));
}

function registerIpc(): void {
  ipcMain.handle('pet:load', () => loadPet(petsDir, PET_ID));
  ipcMain.handle('pet:list', () => listPets(petsDir));

  ipcMain.handle('pet:getState', () => {
    const bounds = win ? win.getBounds() : { ...homePosition(), width: WIN_W, height: WIN_H };
    return { bounds, workArea: screen.getDisplayMatching(bounds).workArea };
  });

  ipcMain.handle('pet:workAreaAt', (_e, p: unknown) => {
    if (!isPoint(p)) return screen.getPrimaryDisplay().workArea;
    return screen.getDisplayNearestPoint({ x: Math.round(p.x), y: Math.round(p.y) }).workArea;
  });

  ipcMain.on('pet:setPosition', (_e, p: unknown) => {
    if (isPoint(p)) moveTo(p.x, p.y);
  });

  ipcMain.on('pet:setIgnoreMouse', (_e, ignore: unknown) => {
    if (typeof ignore === 'boolean') win?.setIgnoreMouseEvents(ignore, { forward: true });
  });

  ipcMain.on('pet:showMenu', () => {
    if (win) buildMenu().popup({ window: win });
  });

  // The page draws the cat and hands us a PNG for the tray icon, so each pet gets its own icon.
  ipcMain.on('pet:setTrayIcon', (_e, dataUrl: unknown) => {
    if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/png;base64,')) return;
    const img = nativeImage.createFromDataURL(dataUrl);
    if (img.isEmpty()) return;
    if (tray) {
      tray.setImage(img);
      return;
    }
    tray = new Tray(img);
    tray.setToolTip('Desktop Pet');
    tray.setContextMenu(buildMenu());
  });
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.whenReady().then(() => {
    registerIpc();
    createWindow();
    const notify = () => win?.webContents.send('pet:displayChanged');
    screen.on('display-metrics-changed', notify);
    screen.on('display-added', notify);
    screen.on('display-removed', notify);
  });
  app.on('window-all-closed', () => app.quit());
}
