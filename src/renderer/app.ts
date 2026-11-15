// The pet's body: runs its behaviour, draws it, and handles the mouse and menu.
// The window itself is the pet's position on screen: walking, leaping and falling move the window.

import { chooseNext, isLateNight, pick, restingMood, type Choice } from './brain.js';
import { Effects } from './effects.js';
import { composeFrame, drawGrid, PROPS, type Emotion, type Grid } from './sprites.js';
import { addStats, applyTimeAway, freshStats, tickStats, type Activity } from './stats.js';
import { currentStreak, recordCommit, type StreakState } from './streak.js';

const api = window.petApi;

let scale = 5; // each sprite pixel is scale x scale screen pixels (cat size; set in Settings)
const TICK_MS = 33; // ~30 updates per second
const GRAVITY = 2400; // px/s^2
const WALK_SPEED = 45; // px/s
const LEAP_SPEED = 140; // px/s
const DRAG_THRESHOLD = 4; // px of movement before a press counts as a drag
const SAVE_EVERY = 15; // seconds

type State =
  | 'idle' | 'walk' | 'sit' | 'groom' | 'stretch' | 'yawn' | 'sleep' | 'crouch' | 'leap'
  | 'sad' | 'thirsty' | 'eat' | 'happy' | 'surprised' | 'dragged' | 'fall'
  | 'celebrate' | 'remindWater';

/** Which of the pet's animations each state uses. */
const ANIM: Record<State, string> = {
  idle: 'idle', walk: 'walk', sit: 'sit', groom: 'groom', stretch: 'stretch', yawn: 'sit',
  sleep: 'sleep', crouch: 'crouch', leap: 'leap', sad: 'sit', thirsty: 'sit', eat: 'eat',
  happy: 'idle', surprised: 'idle', dragged: 'dragged', fall: 'fall',
  celebrate: 'idle', remindWater: 'sit',
};

const ACTIVITY: Partial<Record<State, Activity>> = { sleep: 'sleeping', walk: 'active', crouch: 'active', leap: 'active' };

const canvas = document.getElementById('stage') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const effects = new Effects();

// Window size and display scaling. Read live: Windows display scaling can settle the
// window size after the page loads, and moving to another monitor can change the scaling.
let W = window.innerWidth;
let H = window.innerHeight;
let dpr = window.devicePixelRatio || 1;
let px = Math.max(1, Math.round(scale * dpr)); // one sprite pixel, in device pixels

let pet!: PetDef;
let workArea!: Rect;
let stats: PetStats = freshStats();
let timesPetted = 0;
const streak: StreakState = { streakCount: 0, streakDay: null, commitsToday: 0, commitsDay: null };
let awayNap = false; // asleep because you're away from the PC: wakes when you're back
const pos = { x: 0, y: 0 }; // window top-left, in screen coordinates
let lastSent = { x: NaN, y: NaN };

let state: State = 'idle';
let stateTime = 0;
let stateDuration = 3;
let animTime = 0;
let facing: 1 | -1 = 1; // sprites face right; -1 mirrors them
let vy = 0;
let fallFrom = 0;
let food: 'water' | 'treat' = 'water';
let blinkIn = 3;
let blinkLeft = 0;
let zTimer = 0;
let saveTimer = 0;
let recentPets: number[] = [];

let press: { screenX: number; screenY: number; winX: number; winY: number; dragging: boolean } | null = null;

const rand = (min: number, max: number) => min + Math.random() * (max - min);
const groundY = () => workArea.y + workArea.height - H;
const minX = () => workArea.x;
const maxX = () => workArea.x + workArea.width - W;
const clampX = (x: number) => Math.min(Math.max(x, minX()), maxX());

function syncSize(): void {
  W = window.innerWidth;
  H = window.innerHeight;
  dpr = window.devicePixelRatio || 1;
  px = Math.max(1, Math.round(scale * dpr));
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  ctx.imageSmoothingEnabled = false;
  sendHitRect();
}

/** Where the cat's sprite sits inside the window, in CSS pixels. */
function petRect(): Rect {
  const width = (pet.width * px) / dpr;
  const height = (pet.height * px) / dpr;
  return { x: (W - width) / 2, y: H - height, width, height };
}

function moveWindow(): void {
  const x = Math.round(pos.x);
  const y = Math.round(pos.y);
  if (x === lastSent.x && y === lastSent.y) return;
  lastSent = { x, y };
  api.setPosition(x, y);
}

function saveNow(): void {
  saveTimer = 0;
  api.save({
    version: 1,
    petId: pet.id,
    stats: { ...stats },
    x: Math.round(pos.x),
    lastSeen: Date.now(),
    timesPetted,
    ...streak,
  });
}

// ---------- states ----------

function setState(next: State, duration = 0): void {
  state = next;
  stateTime = 0;
  animTime = 0;
  stateDuration = duration;

  switch (next) {
    case 'sleep':
      zTimer = 0.4;
      if (stats.energy < 30 && Math.random() < 0.5) effects.say('so sleepy…');
      break;
    case 'yawn':
      if (Math.random() < 0.3) effects.say('*yawn*', 1.5);
      break;
    case 'groom':
      if (Math.random() < 0.25) effects.say('*lick lick*', 1.8);
      break;
    case 'sad':
      effects.say(pick(['pet me…?', 'feeling lonely', '…']), 3);
      break;
    case 'thirsty':
      effects.say(pick(['water? 💧', 'so thirsty…']), 3);
      break;
    case 'surprised':
      if (!effects.saying) effects.say('!', 1);
      break;
    case 'dragged':
      if (Math.random() < 0.6) effects.say(pick(['hey!', 'whoa!', 'wheee', 'put me down!']), 1.8);
      break;
  }
}

/** Turns the brain's choice into a state with a sensible duration. */
function doChoice(choice: Choice): void {
  switch (choice) {
    case 'walk': {
      const nearLeft = pos.x - minX() < 150;
      const nearRight = maxX() - pos.x < 150;
      facing = nearLeft ? 1 : nearRight ? -1 : Math.random() < 0.5 ? 1 : -1;
      return setState('walk', rand(2, 6));
    }
    case 'play':
      return setState('crouch', 1);
    case 'sit':
      return setState('sit', rand(4, 10));
    case 'groom':
      return setState('groom', rand(3, 6));
    case 'stretch':
      return setState('stretch', rand(1.5, 2.5));
    case 'yawn':
      return setState('yawn', 1.8);
    case 'sleep':
      return setState('sleep', rand(30, 90));
    case 'sad':
      return setState('sad', 4);
    case 'thirsty':
      return setState('thirsty', 3.5);
    default:
      return setState('idle', rand(3, 8));
  }
}

function headPoint(grid: Grid): { x: number; y: number } {
  const r = petRect();
  const cell = px / dpr;
  const top = grid.findIndex((row) => row.some(Boolean));
  const col = facing === 1 ? pet.width - 5 : 4;
  return { x: r.x + col * cell, y: r.y + Math.max(0, top) * cell };
}

function update(dt: number): void {
  stateTime += dt;
  animTime += dt;
  const late = isLateNight();
  tickStats(stats, dt, ACTIVITY[state] ?? 'awake');
  if (late && state !== 'sleep') addStats(stats, { energy: (-0.5 * dt) / 60 }); // tired faster at night

  // Standing on something? If the taskbar moved or the cat is in the air, fall or snap down.
  if (state !== 'dragged' && state !== 'fall' && state !== 'leap') {
    if (pos.y < groundY() - 1) {
      vy = 0;
      fallFrom = pos.y;
      setState('fall');
    } else if (pos.y > groundY()) {
      pos.y = groundY();
    }
  }

  const done = stateTime > stateDuration;
  switch (state) {
    case 'idle':
    case 'sit':
      if (done) doChoice(chooseNext(stats, late));
      break;
    case 'walk':
      pos.x += facing * WALK_SPEED * dt;
      if (pos.x <= minX()) facing = 1;
      if (pos.x >= maxX()) facing = -1;
      pos.x = clampX(pos.x);
      if (done) setState('idle', rand(3, 8));
      break;
    case 'groom':
    case 'stretch':
    case 'sad':
    case 'thirsty':
      if (done) setState(Math.random() < 0.5 ? 'sit' : 'idle', rand(3, 6));
      break;
    case 'yawn':
      if (done) setState('sit', rand(3, 6));
      break;
    case 'sleep':
      zTimer -= dt;
      if (zTimer <= 0) {
        zTimer = 1.3;
        const head = headPoint(composeFrame(pet, 'lie', 'content'));
        effects.spawn('z', head.x, head.y - 4);
      }
      if (!awayNap && ((done && stats.energy > 85) || stateTime > 180)) {
        effects.say(pick(['good nap!', '*stretch*', 'mrrp']), 2);
        setState('stretch', 2);
      }
      break;
    case 'crouch':
      if (done) setState('leap', 0.55);
      break;
    case 'leap':
      pos.x += facing * LEAP_SPEED * dt;
      if (pos.x <= minX() || pos.x >= maxX()) facing = facing === 1 ? -1 : 1;
      pos.x = clampX(pos.x);
      if (done) {
        addStats(stats, { energy: -2, happiness: 2 });
        if (Math.random() < 0.3) effects.say(pick(['got it!', 'pounce!', 'hehe']), 1.5);
        setState('idle', rand(2, 5));
      }
      break;
    case 'eat':
      if (done) {
        if (food === 'water') {
          addStats(stats, { hydration: 45, happiness: 3 });
          effects.say(pick(['ahh~', 'refreshing!', 'thanks!']), 2);
        } else {
          addStats(stats, { happiness: 15, energy: 5 });
          effects.say(pick(['yum!', 'nom nom', 'more?']), 2);
        }
        const head = headPoint(composeFrame(pet, 'stand', 'happy'));
        effects.spawn('note', head.x, head.y);
        saveNow();
        setState('happy', 1.1);
      }
      break;
    case 'happy':
    case 'surprised':
    case 'celebrate':
    case 'remindWater':
      if (done) setState('idle', rand(3, 8));
      break;
    case 'fall':
      vy += GRAVITY * dt;
      pos.y += vy * dt;
      if (pos.y >= groundY()) {
        const height = groundY() - fallFrom;
        pos.y = groundY();
        vy = 0;
        if (height > 200) setState('surprised', 0.9);
        else setState('idle', rand(2, 5));
      }
      break;
    case 'dragged':
      break; // the mouse moves the cat
  }

  // Blinking.
  if (blinkLeft > 0) blinkLeft -= dt;
  else if ((blinkIn -= dt) <= 0) {
    blinkLeft = 0.15;
    blinkIn = rand(2.5, 6);
  }

  effects.update(dt);
  saveTimer += dt;
  if (saveTimer > SAVE_EVERY) saveNow();
  if (state !== 'dragged') moveWindow();
}

// ---------- drawing ----------

function currentEmotion(): Emotion {
  switch (state) {
    case 'groom':
    case 'stretch':
    case 'eat':
    case 'sleep':
      return 'content';
    case 'yawn':
      return stateTime < 1.3 ? 'yawn' : 'content';
    case 'happy':
    case 'celebrate':
      return stats.happiness > 80 ? 'love' : 'happy';
    case 'leap':
      return 'happy';
    case 'surprised':
    case 'fall':
      return 'surprised';
    case 'dragged':
      return stateTime < 1.5 ? 'surprised' : 'sad';
    case 'sad':
    case 'thirsty':
      return 'sad';
    case 'crouch':
      return 'neutral'; // focused, no blinking
    default:
      return blinkLeft > 0 ? 'blink' : restingMood(stats, isLateNight());
  }
}

function currentFrameName(): string {
  const anim = pet.animations[ANIM[state]] ?? pet.animations.idle;
  return anim.frames[Math.floor(animTime * anim.fps) % anim.frames.length];
}

/** Vertical bounce (CSS px, up is positive) and sideways wiggle for the current state. */
function motionOffsets(): { hop: number; wiggle: number } {
  const t = stateDuration > 0 ? Math.min(stateTime / stateDuration, 1) : 0;
  switch (state) {
    case 'happy':
      return { hop: Math.abs(Math.sin(t * Math.PI * 2)) * 14 * (1 - t * 0.5), wiggle: 0 };
    case 'celebrate':
      return { hop: Math.abs(Math.sin(t * Math.PI * 3)) * 18, wiggle: 0 };
    case 'leap':
      return { hop: Math.sin(t * Math.PI) * 30, wiggle: 0 };
    case 'surprised':
      return { hop: Math.max(0, Math.sin(Math.min(stateTime / 0.3, 1) * Math.PI)) * 10, wiggle: 0 };
    case 'crouch':
      return { hop: 0, wiggle: Math.sin(stateTime * 28) * 1.5 };
    default:
      return { hop: 0, wiggle: 0 };
  }
}

function render(): void {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const rect = petRect();
  const { hop, wiggle } = motionOffsets();
  const grid = composeFrame(pet, currentFrameName(), currentEmotion());

  const ox = Math.round((rect.x + wiggle) * dpr);
  const oy = Math.round((rect.y - hop) * dpr);
  drawGrid(ctx, grid, ox, oy, px, facing === -1);

  if (state === 'eat' || state === 'remindWater') {
    const bowl = food === 'water' || state === 'remindWater' ? PROPS.waterBowl : PROPS.foodBowl;
    const bw = bowl[0].length;
    const col = facing === 1 ? 15 : pet.width - 15 - bw;
    drawGrid(ctx, bowl, ox + col * px, Math.round(rect.y * dpr) + (pet.height - bowl.length) * px, px);
  }

  const head = headPoint(grid);
  effects.draw(ctx, dpr, W, head.x, head.y - hop);
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
api.onHover((over) => document.body.classList.toggle('over-pet', over));

function petTheCat(): void {
  const now = performance.now();
  recentPets = recentPets.filter((t) => now - t < 6000);
  const quickRepeat = recentPets.length > 0 && now - recentPets[recentPets.length - 1] < 1500;
  recentPets.push(now);
  timesPetted++;

  if (state === 'sleep') {
    awayNap = false;
    effects.say(pick(['mrrp?!', 'huh?!', '…5 more minutes']), 1.8);
    setState('surprised', 0.9);
    return;
  }

  if (state === 'remindWater') {
    // You drank water: the cat drinks with you, and the reminder timer restarts.
    api.waterAck();
    food = 'water';
    effects.say('cheers! 🥤', 2);
    setState('eat', 3);
    return;
  }

  addStats(stats, { happiness: quickRepeat ? 3 : 10 });
  const head = headPoint(composeFrame(pet, 'stand', 'happy'));
  effects.spawn('heart', head.x + rand(-8, 8), head.y - 22);
  if (recentPets.length >= 8) {
    effects.say(pick(['ok ok!', 'so much love!', 'purrrrr']), 2);
    recentPets = [];
  } else if (Math.random() < 0.3) {
    effects.spawn('note', head.x + 10, head.y);
    if (!effects.saying) effects.say('purr~', 1.5);
  }
  setState('happy', 1.1);
  saveNow();
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
  if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);

  if (wasDragging) {
    api.setDragging(false);
    // Dropped: land on the taskbar of whichever screen it was dropped on.
    workArea = await api.workAreaAt(pos.x + W / 2, pos.y + H / 2);
    pos.x = clampX(pos.x);
    pos.y = Math.min(pos.y, groundY());
    vy = 0;
    fallFrom = pos.y;
    setState('fall');
  } else {
    petTheCat();
  }
}

canvas.addEventListener('pointerup', (e) => void endPress(e));
canvas.addEventListener('pointercancel', (e) => void endPress(e));

canvas.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  saveNow(); // so the menu shows current stats
  api.showMenu();
});

// ---------- menu actions ----------

api.onAction((action) => handleAction(action));

function handleAction(action: MenuAction): void {
  if (state === 'dragged' || state === 'fall') return;
  switch (action) {
    case 'water':
      food = 'water';
      return setState('eat', 3);
    case 'treat':
      food = 'treat';
      return setState('eat', 2.5);
    case 'play':
      if (stats.energy < 15) {
        effects.say('too tired…', 2);
        return setState('yawn', 1.8);
      }
      return setState('crouch', 1);
    case 'nap':
      effects.say('nap time…', 2);
      return setState('sleep', rand(30, 90));
  }
}

// ---------- your day ----------

function celebrate(text: string, pieces: number, seconds: number): void {
  effects.say(text, 2.5);
  if (state === 'dragged' || state === 'fall') return;
  awayNap = false;
  setState('celebrate', seconds);
  const head = headPoint(composeFrame(pet, 'stand', 'happy'));
  effects.confetti(head.x, head.y - 8, pieces);
}

function handleEvent(e: PetEvent): void {
  const busy = state === 'dragged' || state === 'fall';
  switch (e.type) {
    case 'commit': {
      if (e.kind === 'amend') {
        effects.say('amended ✨', 1.8);
        if (!busy) setState('happy', 1.1);
        return;
      }
      const first = e.kind === 'commit' && recordCommit(streak);
      const days = currentStreak(streak);
      addStats(stats, { happiness: 5 });
      let text: string;
      if (first) text = days > 1 ? `🔥 ${days}-day streak!` : '🔥 first commit today!';
      else if (e.kind === 'merge') text = 'merged! 🎉';
      else text = pick(['nice commit!', 'ship it! 🚀', `${e.repo} +1!`, `commit #${streak.commitsToday} today!`]);
      celebrate(text, first ? 28 : 18, 2);
      saveNow();
      return;
    }
    case 'push':
      celebrate(pick(['pushed! 🚀', 'to the cloud! ☁️', 'shipped! 🎉']), 34, 2.4);
      return;
    case 'away':
      if (busy) return;
      awayNap = true;
      effects.hush(); // nobody's there to read it
      setState('sleep', Infinity);
      return;
    case 'back':
      if (!awayNap) return;
      awayNap = false;
      effects.say(e.minutes >= 60 ? 'welcome back!' : pick(['oh hi!', "you're back!", 'mrrp!']), 2.5);
      if (state === 'sleep') setState('stretch', 2);
      return;
    case 'breakDue':
      effects.say(
        pick([`${e.activeMinutes} min nonstop… stretch break? 🧘`, 'time to stretch! 🧘', 'rest your eyes a bit? 👀']),
        7,
      );
      if (!busy && !awayNap) setState('stretch', 3);
      return;
    case 'breakTaken':
      addStats(stats, { happiness: 5 });
      if (!busy) setState('happy', 1.1);
      effects.say(pick(['nice break! ✨', 'refreshed? 😺']), 2.5);
      return;
    case 'waterDue':
      if (busy || awayNap) return;
      setState('remindWater', 15);
      effects.say('water break? 💧 click me when you drink!', 15);
      return;
    case 'lateNight':
      if (!busy) setState('yawn', 1.8); // before the bubble, so the yawn's own "*yawn*" can't replace it
      effects.say(pick(["it's late… sleep? 😴", 'bedtime, human 🌙', 'go to sleep! 💤']), 5);
      return;
    case 'reposFound':
      effects.sayNext(
        e.count > 0 ? `watching ${e.count} repo${e.count === 1 ? '' : 's'} for commits 👀` : 'no new git repos found 🤔',
        4,
      );
      return;
  }
}

api.onEvent((e) => handleEvent(e));

// Developer hook for poking the cat from a test script (only with PET_DEBUG=1).
if (new URLSearchParams(location.search).has('debug')) {
  Object.assign(window, {
    petDebug: {
      get state() { return state; },
      get stats() { return { ...stats }; },
      get saying() { return effects.saying; },
      get emotion() { return currentEmotion(); },
      get frame() { return currentFrameName(); },
      get pos() { return { x: Math.round(pos.x), y: Math.round(pos.y), ground: Math.round(groundY()) }; },
      get streak() { return { ...streak, current: currentStreak(streak) }; },
      setState,
      doChoice,
      petTheCat,
      handleAction,
      handleEvent,
      setStats: (s: Partial<PetStats>) => Object.assign(stats, s),
    },
  });
}

// ---------- start ----------

function makeTrayIcon(): string {
  const size = 2;
  const icon = document.createElement('canvas');
  icon.width = pet.width * size;
  icon.height = pet.width * size; // square
  const ictx = icon.getContext('2d')!;
  const top = Math.floor((icon.height - pet.height * size) / 2);
  drawGrid(ictx, composeFrame(pet, 'sit', 'happy'), 0, top, size);
  return icon.toDataURL('image/png');
}

async function refreshPlacement(): Promise<void> {
  const { bounds, workArea: wa } = await api.getState();
  workArea = wa;
  pos.x = clampX(bounds.x);
  pos.y = bounds.y;
  lastSent = { x: bounds.x, y: bounds.y };
}

// Cat size changed in Settings: main has already resized the window around the cat's feet.
api.onScale(({ scale: next, bounds }) => {
  scale = next;
  pos.x = bounds.x;
  pos.y = bounds.y;
  lastSent = { x: bounds.x, y: bounds.y };
  syncSize();
});

async function start(): Promise<void> {
  scale = await api.getScale();
  syncSize();
  window.addEventListener('resize', syncSize);

  pet = await api.loadPet();
  sendHitRect();
  await refreshPlacement();

  const saved = await api.loadSave();
  if (saved) {
    stats = { ...saved.stats };
    timesPetted = saved.timesPetted;
    streak.streakCount = saved.streakCount ?? 0;
    streak.streakDay = saved.streakDay ?? null;
    streak.commitsToday = saved.commitsToday ?? 0;
    streak.commitsDay = saved.commitsDay ?? null;
    if (saved.x !== null) pos.x = clampX(saved.x);
    const awayMinutes = (Date.now() - saved.lastSeen) / 60000;
    applyTimeAway(stats, awayMinutes);
    if (awayMinutes > 8 * 60) effects.say('missed you!', 3.5);
    else if (awayMinutes > 60) effects.say('welcome back!', 3);
  } else {
    effects.say('hi! 👋', 3.5);
  }
  if (streak.streakCount > 1 && currentStreak(streak) === 0) {
    effects.sayNext(`your ${streak.streakCount}-day streak ended… start a new one today? 🔥`, 4);
    streak.streakCount = 0;
  }
  pos.y = groundY();
  saveNow();

  api.setTrayIcon(makeTrayIcon());
  api.onDisplayChanged(() => void refreshPlacement());

  setState('idle', 2);
  api.ready(); // now the main process can send us events
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
