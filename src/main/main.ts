import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, powerMonitor, screen, Tray } from 'electron';
import * as path from 'node:path';
import { ActivityMonitor } from './activity.js';
import type { PetEvent } from './events.js';
import { defaultRepoRoots, findRepos, GitWatcher } from './gitWatcher.js';
import { listPets, loadPet, petPreview, type PetDef } from './petLoader.js';
import { parseSave, readSave, writeSave, type SaveData } from './save.js';
import { LIMITS, mergeSettings, readSettings, writeSettings, type Settings } from './settings.js';

// Keep the same data folder whether running from source or installed (the installed app's
// name is "Desktop Pet", which would otherwise give it a different folder and lose your cat's save).
// Test scripts (PET_DEBUG) choose their own folder.
if (!process.env.PET_DEBUG) app.setPath('userData', path.join(app.getPath('appData'), 'desktop-pet'));

const DEFAULT_PET = 'cat';

const rootDir = path.join(__dirname, '..', '..');
const petsDir = path.join(rootDir, 'pets');

let win: BrowserWindow | null = null;
let settingsWin: BrowserWindow | null = null;
let tray: Tray | null = null;
let petDef: PetDef;
const pets = new Map<string, PetDef>(); // every valid pet in pets/, by id

/** Loads every pet once. A broken pet is skipped with a clear error instead of stopping the app. */
function loadPets(): void {
  for (const id of listPets(petsDir)) {
    try {
      pets.set(id, loadPet(petsDir, id));
    } catch (err) {
      console.error(err instanceof Error ? err.message : err);
    }
  }
  const chosen = pets.get(settings.petId) ?? pets.get(DEFAULT_PET) ?? [...pets.values()][0];
  if (!chosen) throw new Error(`No valid pets found in ${petsDir}`);
  petDef = chosen;
}

// The window is a little bigger than the cat, leaving room above it for hops, hearts and speech bubbles.
const MARGIN_W = 60;
const MARGIN_H = 75;
function winSize(scale = settings.catScale): { w: number; h: number } {
  return { w: petDef.width * scale + MARGIN_W, h: petDef.height * scale + MARGIN_H };
}

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
  return { x: Math.round(wa.x + wa.width * 0.75), y: wa.y + wa.height - winSize().h };
}

function moveTo(x: number, y: number): void {
  // setBounds (not setPosition) keeps the size fixed when crossing monitors with different scaling.
  const { w, h } = winSize();
  win?.setBounds({ x: Math.round(x), y: Math.round(y), width: w, height: h });
}

/** Resizes the cat, keeping its feet and center where they are. */
function applyScale(oldScale: number): void {
  if (!win || oldScale === settings.catScale) return;
  const b = win.getBounds();
  const old = winSize(oldScale);
  const next = winSize();
  const x = b.x + old.w / 2 - next.w / 2;
  const y = b.y + old.h - next.h;
  moveTo(x, y);
  win.webContents.send('pet:scale', { scale: settings.catScale, bounds: win.getBounds() });
}

/** Swaps in another pet. It stays where it is, and keeps its stats and streak. */
function setPet(id: string): void {
  const next = pets.get(id);
  if (!next || next.id === petDef.id) return;
  const old = winSize();
  petDef = next;
  settings.petId = next.id;
  saveSettings();
  if (!win) return;

  const b = win.getBounds();
  const size = winSize();
  const x = Math.round(b.x + old.w / 2 - size.w / 2);
  moveTo(x, b.y + old.h - size.h);
  if (lastSave) {
    // The page starts again from the save, so make sure it has the spot the pet is in right now.
    lastSave = { ...lastSave, petId: next.id, x, lastSeen: Date.now() };
    try {
      writeSave(savePath(), lastSave);
    } catch (err) {
      console.error('Could not save pet state:', err);
    }
  }
  rendererReady = false;
  win.webContents.reload();
}

// ---------- start with Windows ----------

// One fixed entry name, so the installed app replaces an entry made while running from source.
const LOGIN_NAME = process.env.PET_LOGIN_NAME || 'DesktopPet';
function loginItemOptions() {
  return app.isPackaged
    ? { name: LOGIN_NAME }
    : { name: LOGIN_NAME, path: process.execPath, args: [app.getAppPath()] };
}
function getStartWithWindows(): boolean {
  // On Windows, openAtLogin stays false for named entries; launchItems has the real answer
  // (and "enabled" is false if you turned it off in Task Manager's Startup apps).
  const s = app.getLoginItemSettings(loginItemOptions());
  const item = s.launchItems?.find((i) => i.name === LOGIN_NAME);
  return item ? item.enabled : s.openAtLogin;
}
function setStartWithWindows(on: boolean): void {
  app.setLoginItemSettings({ openAtLogin: on, ...loginItemOptions() });
}

const savePath = () => path.join(app.getPath('userData'), 'save.json');
let lastSave: SaveData | null = null;

function sendAction(action: 'water' | 'treat' | 'play' | 'nap'): void {
  win?.webContents.send('pet:action', action);
}

// ---------- your day: activity, reminders, git ----------

const ACTIVITY_TICK_MS = 5000;
const settingsPath = () => path.join(app.getPath('userData'), 'settings.json');
let settings: Settings;
let activity: ActivityMonitor;
let git: GitWatcher;

// Events wait here until the page says it's ready, so none are lost at startup.
let rendererReady = false;
const pendingEvents: PetEvent[] = [];
function sendEvent(e: PetEvent): void {
  if (rendererReady && win) win.webContents.send('pet:event', e);
  else pendingEvents.push(e);
}

function saveSettings(): void {
  try {
    writeSettings(settingsPath(), settings);
  } catch (err) {
    console.error('Could not save settings:', err);
  }
  refreshTrayMenu();
  pushSettingsView();
}

function setRepos(repos: string[]): void {
  settings.repos = [...new Set(repos)];
  git.setRepos(settings.repos);
  saveSettings();
}

async function addRepoFolder(): Promise<void> {
  const result = await dialog.showOpenDialog({
    title: 'Pick a git repo, or a folder that contains repos',
    properties: ['openDirectory'],
  });
  if (result.canceled || !result.filePaths[0]) return;
  const found = findRepos([result.filePaths[0]]);
  const before = settings.repos?.length ?? 0;
  setRepos([...(settings.repos ?? []), ...found]);
  sendEvent({ type: 'reposFound', count: (settings.repos?.length ?? 0) - before });
}

function startDayWatchers(): void {
  activity = new ActivityMonitor(() => settings, sendEvent);
  activity.idleSeconds = () => powerMonitor.getSystemIdleTime();
  setInterval(() => activity.tick(), ACTIVITY_TICK_MS);
  powerMonitor.on('lock-screen', () => activity.setLocked(true));
  powerMonitor.on('unlock-screen', () => activity.setLocked(false));

  git = new GitWatcher(sendEvent);
  if (settings.repos === null) {
    // First run: look for repos in the usual places.
    const found = findRepos(defaultRepoRoots());
    setRepos(found);
    sendEvent({ type: 'reposFound', count: found.length });
  } else {
    git.setRepos(settings.repos);
  }
}

// ---------- menu ----------

function statsLine(): string {
  if (!lastSave) return 'Waking up…';
  const s = lastSave.stats;
  return `⚡ ${Math.round(s.energy)}   ❤ ${Math.round(s.happiness)}   💧 ${Math.round(s.hydration)}`;
}

function localDay(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function streakLine(): string {
  if (!lastSave) return '';
  const today = localDay();
  const y = new Date();
  y.setDate(y.getDate() - 1);
  const alive = lastSave.streakDay === today || lastSave.streakDay === localDay(y);
  const streak = alive ? lastSave.streakCount : 0;
  const commits = lastSave.commitsDay === today ? lastSave.commitsToday : 0;
  const commitText = commits === 0 ? 'no commits yet today' : `${commits} commit${commits === 1 ? '' : 's'} today`;
  return streak > 0 ? `🔥 ${streak}-day streak · ${commitText}` : `No streak yet · ${commitText}`;
}

function toggle(key: 'breakReminders' | 'waterReminders' | 'lateNightNudges'): void {
  settings[key] = !settings[key];
  activity.resetTimers();
  saveSettings();
}

// ---------- settings window ----------

function settingsView() {
  return {
    ...settings,
    petId: petDef.id,
    pets: [...pets.values()].map(petPreview),
    repos: git?.watching ?? [],
    startWithWindows: getStartWithWindows(),
    limits: LIMITS,
  };
}

/** Keeps an open settings window in sync with changes made elsewhere (e.g. the tray menu). */
function pushSettingsView(): void {
  settingsWin?.webContents.send('settings:changed', settingsView());
}

function openSettings(): void {
  if (settingsWin) {
    settingsWin.show();
    settingsWin.focus();
    return;
  }
  settingsWin = new BrowserWindow({
    width: 440,
    // Tall enough for everything; smaller screens get a scrollbar instead.
    height: Math.min(880, screen.getPrimaryDisplay().workArea.height - 60),
    useContentSize: true, // size the page area, not the outer frame
    title: 'Desktop Pet settings',
    resizable: false,
    maximizable: false,
    minimizable: false,
    autoHideMenuBar: true,
    show: false,
    backgroundColor: '#fffaf2',
    webPreferences: {
      preload: path.join(__dirname, 'settingsPreload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  settingsWin.setMenu(null);
  settingsWin.loadFile(path.join(rootDir, 'static', 'settings.html'));
  settingsWin.once('ready-to-show', () => settingsWin?.show());
  settingsWin.on('closed', () => (settingsWin = null));
}

function registerSettingsIpc(): void {
  ipcMain.handle('settings:get', () => settingsView());

  ipcMain.handle('settings:update', (_e, patch: unknown) => {
    if (!patch || typeof patch !== 'object') return settingsView();
    const p = patch as Record<string, unknown>;
    if (typeof p.startWithWindows === 'boolean') setStartWithWindows(p.startWithWindows);
    const oldScale = settings.catScale;
    const before = JSON.stringify([settings.breakMinutes, settings.waterMinutes, settings.breakReminders, settings.waterReminders]);
    settings = mergeSettings(settings, p);
    if (JSON.stringify([settings.breakMinutes, settings.waterMinutes, settings.breakReminders, settings.waterReminders]) !== before) {
      activity.resetTimers();
    }
    saveSettings();
    applyScale(oldScale);
    if (typeof p.petId === 'string') setPet(p.petId);
    return settingsView();
  });

  ipcMain.handle('settings:addRepos', async () => {
    await addRepoFolder();
    return settingsView();
  });

  ipcMain.handle('settings:rescanRepos', () => {
    const before = git.watching.length;
    setRepos([...(settings.repos ?? []), ...findRepos(defaultRepoRoots())]);
    sendEvent({ type: 'reposFound', count: git.watching.length - before });
    return settingsView();
  });

  ipcMain.handle('settings:removeRepo', (_e, repo: unknown) => {
    if (typeof repo === 'string') setRepos((settings.repos ?? []).filter((r) => r !== repo));
    return settingsView();
  });
}

function buildMenu(): Menu {
  const repos = git?.watching ?? [];
  return Menu.buildFromTemplate([
    { label: statsLine(), enabled: false },
    { label: streakLine(), enabled: false, visible: !!lastSave },
    { type: 'separator' },
    { label: 'Give water', click: () => sendAction('water') },
    { label: 'Give a treat', click: () => sendAction('treat') },
    { label: 'Play', click: () => sendAction('play') },
    { label: 'Nap time', click: () => sendAction('nap') },
    { type: 'separator' },
    {
      label: 'Reminders',
      submenu: [
        {
          label: `Break every ${settings?.breakMinutes ?? 50} min`,
          type: 'checkbox',
          checked: settings?.breakReminders ?? true,
          click: () => toggle('breakReminders'),
        },
        {
          label: `Water every ${settings?.waterMinutes ?? 75} min`,
          type: 'checkbox',
          checked: settings?.waterReminders ?? true,
          click: () => toggle('waterReminders'),
        },
        {
          label: 'Late-night bedtime nudges',
          type: 'checkbox',
          checked: settings?.lateNightNudges ?? true,
          click: () => toggle('lateNightNudges'),
        },
      ],
    },
    {
      label: `Watched repos (${repos.length})`,
      submenu: [
        ...repos.map((r) => ({
          label: path.basename(r),
          toolTip: r,
          submenu: [{ label: 'Stop watching', click: () => setRepos((settings.repos ?? []).filter((x) => x !== r)) }],
        })),
        ...(repos.length ? [{ type: 'separator' as const }] : []),
        { label: 'Add a repo or folder of repos…', click: () => void addRepoFolder() },
        {
          label: 'Look again in the usual folders',
          click: () => {
            const before = repos.length;
            setRepos([...(settings.repos ?? []), ...findRepos(defaultRepoRoots())]);
            sendEvent({ type: 'reposFound', count: (settings.repos?.length ?? 0) - before });
          },
        },
      ],
    },
    {
      label: 'Pet',
      visible: pets.size > 1,
      submenu: [...pets.values()].map((p) => ({
        label: p.name,
        type: 'radio' as const,
        checked: p.id === petDef?.id,
        click: () => setPet(p.id),
      })),
    },
    { label: 'Settings…', click: () => openSettings() },
    { type: 'separator' },
    {
      label: 'Bring pet back',
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

function refreshTrayMenu(): void {
  tray?.setContextMenu(buildMenu());
}

function createWindow(): void {
  const home = homePosition();
  const { w, h } = winSize();
  win = new BrowserWindow({
    width: w,
    height: h,
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
  win.webContents.on('did-start-loading', () => (rendererReady = false));
}

function registerIpc(): void {
  ipcMain.handle('pet:load', () => petDef);
  ipcMain.handle('pet:getScale', () => settings.catScale);
  ipcMain.handle('pet:list', () => [...pets.keys()]);

  ipcMain.handle('pet:getState', () => {
    const bounds = win ? win.getBounds() : { ...homePosition(), width: winSize().w, height: winSize().h };
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
    refreshTrayMenu(); // keep the stats line fresh
  });

  ipcMain.on('pet:ready', () => {
    rendererReady = true;
    for (const e of pendingEvents.splice(0)) win?.webContents.send('pet:event', e);
  });

  // You clicked the cat when it reminded you to drink water.
  ipcMain.on('pet:waterAck', () => activity?.waterAck());

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
  // Opening the app again (e.g. from the Start menu) while it's running opens settings.
  app.on('second-instance', () => openSettings());

  app.whenReady().then(() => {
    settings = readSettings(settingsPath());
    loadPets();
    registerIpc();
    registerSettingsIpc();
    createWindow();
    setInterval(pollCursor, HOVER_POLL_MS);
    startDayWatchers();
    // Test scripts (PET_DEBUG=1) can reach the watchers to fake idle time and repos.
    if (process.env.PET_DEBUG) {
      Object.assign(globalThis, {
        petMain: { activity, git, setRepos, sendEvent, openSettings, getStartWithWindows, setStartWithWindows,
          get settings() { return settings; }, get settingsWin() { return settingsWin; }, get win() { return win; } },
      });
    }
    const notify = () => win?.webContents.send('pet:displayChanged');
    screen.on('display-metrics-changed', notify);
    screen.on('display-added', notify);
    screen.on('display-removed', notify);
  });
  app.on('window-all-closed', () => app.quit());
}
