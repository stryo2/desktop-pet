// The pet's body: draws the sprite, decides what to do next, and handles the mouse.
// The window itself is the pet's position on screen: walking and falling move the window.

const api = window.petApi;

const SCALE = 5; // each sprite pixel is 5x5 screen pixels
const TICK_MS = 33; // ~30 updates per second
const GRAVITY = 2400; // px/s^2
const WALK_SPEED = 45; // px/s
const DRAG_THRESHOLD = 4; // px of movement before a press counts as a drag
const HAPPY_SECONDS = 1.1;
const HEART_SECONDS = 1.2;

type State = 'idle' | 'walk' | 'dragged' | 'fall' | 'happy';

const HEART = ['.KK.KK.', 'KPPKPPK', 'KPPPPPK', '.KPPPK.', '..KPK..', '...K...'];
const HEART_PALETTE: Record<string, string | null> = { '.': null, K: '#2b2233', P: '#ff5c8a' };

const canvas = document.getElementById('stage') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
// Window size and display scaling. Read live: Windows display scaling can settle the
// window size after the page loads, and moving to another monitor can change the scaling.
let W = window.innerWidth;
let H = window.innerHeight;
let dpr = window.devicePixelRatio || 1;
// Size of one sprite pixel in real device pixels, rounded so the pixel art stays crisp.
let px = Math.max(1, Math.round(SCALE * dpr));

function syncSize(): void {
  W = window.innerWidth;
  H = window.innerHeight;
  dpr = window.devicePixelRatio || 1;
  px = Math.max(1, Math.round(SCALE * dpr));
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  ctx.imageSmoothingEnabled = false;
  sendHitRect();
}

let pet!: PetDef;
let workArea!: Rect;
const pos = { x: 0, y: 0 }; // window top-left, in screen coordinates
let lastSent = { x: NaN, y: NaN };

let state: State = 'idle';
let stateTime = 0;
let stateDuration = 3;
let animTime = 0;
let facing: 1 | -1 = 1; // the sprite faces right; -1 mirrors it
let vy = 0;

let overPet = false;
let press: { screenX: number; screenY: number; winX: number; winY: number; dragging: boolean } | null = null;
const hearts: { x: number; age: number }[] = [];

const rand = (min: number, max: number) => min + Math.random() * (max - min);
const groundY = () => workArea.y + workArea.height - H;
const minX = () => workArea.x;
const maxX = () => workArea.x + workArea.width - W;

/** Where the cat is drawn inside the window, in CSS pixels. */
function petRect(): Rect {
  const width = (pet.width * px) / dpr;
  const height = (pet.height * px) / dpr;
  return { x: (W - width) / 2, y: H - height, width, height };
}

function setState(next: State, duration = 0): void {
  state = next;
  stateTime = 0;
  animTime = 0;
  stateDuration = duration;
}

function moveWindow(): void {
  const x = Math.round(pos.x);
  const y = Math.round(pos.y);
  if (x === lastSent.x && y === lastSent.y) return;
  lastSent = { x, y };
  api.setPosition(x, y);
}

// ---------- behaviour ----------

function decideNext(): void {
  if (Math.random() < 0.55) {
    // Walk, preferring to head away from a nearby screen edge.
    const nearLeft = pos.x - minX() < 150;
    const nearRight = maxX() - pos.x < 150;
    facing = nearLeft ? 1 : nearRight ? -1 : Math.random() < 0.5 ? 1 : -1;
    setState('walk', rand(2, 6));
  } else {
    setState('idle', rand(3, 8));
  }
}

function update(dt: number): void {
  stateTime += dt;
  animTime += dt;

  // The taskbar moved, or the cat is somehow in the air: let it fall (or snap down).
  if (state === 'idle' || state === 'walk' || state === 'happy') {
    if (pos.y < groundY() - 1) {
      vy = 0;
      setState('fall');
    } else if (pos.y > groundY()) {
      pos.y = groundY();
    }
  }

  switch (state) {
    case 'idle':
      if (stateTime > stateDuration) decideNext();
      break;
    case 'walk':
      pos.x += facing * WALK_SPEED * dt;
      if (pos.x <= minX()) {
        pos.x = minX();
        facing = 1;
      } else if (pos.x >= maxX()) {
        pos.x = maxX();
        facing = -1;
      }
      if (stateTime > stateDuration) setState('idle', rand(3, 8));
      break;
    case 'fall':
      vy += GRAVITY * dt;
      pos.y += vy * dt;
      if (pos.y >= groundY()) {
        pos.y = groundY();
        vy = 0;
        setState('idle', rand(2, 5));
      }
      break;
    case 'happy':
      if (stateTime > HAPPY_SECONDS) setState('idle', rand(3, 8));
      break;
    case 'dragged':
      break; // the mouse moves the cat
  }

  for (let i = hearts.length - 1; i >= 0; i--) {
    hearts[i].age += dt;
    if (hearts[i].age > HEART_SECONDS) hearts.splice(i, 1);
  }

  if (state !== 'dragged') moveWindow();
}

// ---------- drawing ----------

function drawPixels(
  target: CanvasRenderingContext2D,
  rows: string[],
  palette: Record<string, string | null>,
  ox: number,
  oy: number,
  size: number,
  mirror: boolean,
): void {
  const w = rows[0].length;
  rows.forEach((row, y) => {
    for (let x = 0; x < w; x++) {
      const color = palette[row[x]];
      if (!color) continue;
      target.fillStyle = color;
      const dx = mirror ? w - 1 - x : x;
      target.fillRect(ox + dx * size, oy + y * size, size, size);
    }
  });
}

function currentFrame(): string[] {
  const anim = pet.animations[state] ?? pet.animations.idle;
  const index = Math.floor(animTime * anim.fps) % anim.frames.length;
  return pet.frames[anim.frames[index]];
}

function render(): void {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const rect = petRect();

  // A little double hop when petted.
  let hop = 0;
  if (state === 'happy') {
    const t = Math.min(stateTime / HAPPY_SECONDS, 1);
    hop = Math.abs(Math.sin(t * Math.PI * 2)) * 14 * (1 - t * 0.5);
  }

  const ox = Math.round(rect.x * dpr);
  const oy = Math.round((rect.y - hop) * dpr);
  drawPixels(ctx, currentFrame(), pet.palette, ox, oy, px, facing === -1);

  const heartPx = Math.max(1, Math.round(3 * dpr));
  for (const h of hearts) {
    const t = h.age / HEART_SECONDS;
    ctx.globalAlpha = 1 - t;
    const hx = Math.round(h.x * dpr - (HEART[0].length * heartPx) / 2);
    const hy = Math.round((rect.y - 22 - t * 30) * dpr);
    drawPixels(ctx, HEART, HEART_PALETTE, hx, hy, heartPx, false);
    ctx.globalAlpha = 1;
  }
}

// ---------- mouse ----------

function isOverPet(clientX: number, clientY: number): boolean {
  const r = petRect();
  return clientX >= r.x && clientX <= r.x + r.width && clientY >= r.y - 6 && clientY <= r.y + r.height;
}

/** Tells the main process where the cat is, so it knows when the cursor is over it. */
function sendHitRect(): void {
  if (!pet) return;
  const r = petRect();
  api.setHitRect({ x: r.x, y: r.y - 6, width: r.width, height: r.height + 6 });
}

// The main process watches the cursor and tells us when it is over the cat
// (at that moment the window starts taking clicks).
api.onHover((over) => {
  overPet = over;
  document.body.classList.toggle('over-pet', over);
});

function petTheCat(): void {
  setState('happy');
  hearts.push({ x: W / 2 + rand(-12, 12), age: 0 });
}

canvas.addEventListener('pointerdown', (e) => {
  if (e.button !== 0 || !isOverPet(e.clientX, e.clientY)) return;
  try {
    canvas.setPointerCapture(e.pointerId); // keep getting moves even if the cursor outruns the window
  } catch {
    // not an active pointer (e.g. synthetic event); dragging still works without capture
  }
  press = { screenX: e.screenX, screenY: e.screenY, winX: pos.x, winY: pos.y, dragging: false };
});

canvas.addEventListener('pointermove', (e) => {
  if (!press) return;
  const dx = e.screenX - press.screenX;
  const dy = e.screenY - press.screenY;
  if (!press.dragging && Math.hypot(dx, dy) > DRAG_THRESHOLD) {
    press.dragging = true;
    api.setDragging(true);
    document.body.classList.add('dragging');
    setState('dragged');
  }
  if (press.dragging) {
    pos.x = press.winX + dx;
    pos.y = press.winY + dy;
    moveWindow();
  }
});

async function endPress(e: PointerEvent): Promise<void> {
  if (!press) return;
  const wasDragging = press.dragging;
  press = null;
  document.body.classList.remove('dragging');
  if (wasDragging) api.setDragging(false);
  if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);

  if (wasDragging) {
    // Dropped: land on the taskbar of whichever screen it was dropped on.
    workArea = await api.workAreaAt(pos.x + W / 2, pos.y + H / 2);
    pos.x = Math.min(Math.max(pos.x, minX()), maxX());
    pos.y = Math.min(pos.y, groundY());
    vy = 0;
    setState('fall');
  } else {
    petTheCat();
  }
}

canvas.addEventListener('pointerup', (e) => void endPress(e));
canvas.addEventListener('pointercancel', (e) => void endPress(e));

canvas.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  api.showMenu();
});

// ---------- start ----------

function makeTrayIcon(): string {
  const size = 2;
  const icon = document.createElement('canvas');
  icon.width = pet.width * size;
  icon.height = pet.width * size; // square
  const ictx = icon.getContext('2d')!;
  const top = Math.floor((icon.height - pet.height * size) / 2);
  drawPixels(ictx, pet.frames[pet.animations.idle.frames[0]], pet.palette, 0, top, size, false);
  return icon.toDataURL('image/png');
}

async function refreshPlacement(): Promise<void> {
  const { bounds, workArea: wa } = await api.getState();
  workArea = wa;
  pos.x = Math.min(Math.max(bounds.x, minX()), maxX());
  pos.y = bounds.y;
  lastSent = { x: bounds.x, y: bounds.y };
}

async function start(): Promise<void> {
  syncSize();
  window.addEventListener('resize', syncSize);

  pet = await api.loadPet();
  sendHitRect();
  await refreshPlacement();
  pos.y = groundY();
  api.setTrayIcon(makeTrayIcon());
  api.onDisplayChanged(() => void refreshPlacement());

  setState('idle', 2);
  let last = performance.now();
  setInterval(() => {
    const now = performance.now();
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    update(dt);
    render();
  }, TICK_MS);
}

start().catch((err) => console.error('Pet failed to start:', err));
