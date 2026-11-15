import { app, BrowserWindow, ipcMain, Menu, nativeImage, screen, Tray } from 'electron';
import * as path from 'node:path';
import { listPets, loadPet } from './petLoader.js';
import { parseSave, readSave, writeSave, type SaveData } from './save.js';

// The window is a little bigger than the cat, leaving room above it for hops, hearts and speech bubbles.
const WIN_W = 160;
const WIN_H = 150;

// v2: read this from settings and let the user pick from listPets().
const PET_ID = 'cat';

const rootDir = path.join(__dirname, '..', '..');
const petsDir = path.join(rootDir, 'pets');

let win: BrowserWindow | null = null;
let tray: Tray | null = null;

// Mouse handling. The window ignores the mouse (clicks go to the app behind it) except
// while the cursor is over the cat. Windows doesn't reliably forward mouse moves to an
// ignoring window, so we watch the cursor position from here instead.
const HOVER_POLL_MS = 33;
let hitRect = { x: 0, y: 0, width: 0, height: 0 }; // the cat's area inside the window
let dragging = false;
let interactive = false;

function setInteractive(next: boolean): void {
  if (!win || next === interactive) return;
  interactive = next;
  win.setIgnoreMouseEvents(!next, { forward: true });
  win.webContents.send('pet:hover', next);
}

function pollCursor(): void {
  if (!win) return;
  const c = screen.getCursorScreenPoint();
  const b = win.getBounds();
  const x = c.x - b.x;
  const y = c.y - b.y;
  const over =
    x >= hitRect.x && x <= hitRect.x + hitRect.width && y >= hitRect.y && y <= hitRect.y + hitRect.height;
  setInteractive(dragging || over);
}

function isRect(r: unknown): r is { x: number; y: number; width: number; height: number } {
  const o = r as { width?: unknown; height?: unknown } | null;
  return isPoint(r) && Number.isFinite(o?.width) && Number.isFinite(o?.height);
}

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

const savePath = () => path.join(app.getPath('userData'), 'save.json');
let lastSave: SaveData | null = null;

function sendAction(action: 'water' | 'treat' | 'play' | 'nap'): void {
  win?.webContents.send('pet:action', action);
}

function statsLine(): string {
  if (!lastSave) return 'Waking up…';
  const s = lastSave.stats;
  return `⚡ ${Math.round(s.energy)}   ❤ ${Math.round(s.happiness)}   💧 ${Math.round(s.hydration)}`;
}

function buildMenu(): Menu {
  return Menu.buildFromTemplate([
    { label: statsLine(), enabled: false },
    { type: 'separator' },
    { label: 'Give water', click: () => sendAction('water') },
    { label: 'Give a treat', click: () => sendAction('treat') },
    { label: 'Play', click: () => sendAction('play') },
    { label: 'Nap time', click: () => sendAction('nap') },
    { type: 'separator' },
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
  // PET_DEBUG=1 exposes a test hook in the page (window.petDebug).
  win.loadFile(path.join(rootDir, 'static', 'index.html'), process.env.PET_DEBUG ? { query: { debug: '1' } } : {});
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

  ipcMain.on('pet:setHitRect', (_e, r: unknown) => {
    if (isRect(r)) hitRect = r;
  });

  // While dragging, keep taking mouse input even if the cursor outruns the window.
  ipcMain.on('pet:setDragging', (_e, d: unknown) => {
    if (typeof d !== 'boolean') return;
    dragging = d;
    pollCursor();
  });

  ipcMain.handle('pet:loadSave', () => {
    lastSave = readSave(savePath());
    return lastSave;
  });

  ipcMain.on('pet:save', (_e, raw: unknown) => {
    const data = parseSave(raw);
    if (!data) return;
    lastSave = data;
    try {
      writeSave(savePath(), data);
    } catch (err) {
      console.error('Could not save pet state:', err);
    }
    tray?.setContextMenu(buildMenu()); // keep the stats line fresh
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
    setInterval(pollCursor, HOVER_POLL_MS);
    const notify = () => win?.webContents.send('pet:displayChanged');
    screen.on('display-metrics-changed', notify);
    screen.on('display-added', notify);
    screen.on('display-removed', notify);
  });
  app.on('window-all-closed', () => app.quit());
}
