import * as fs from 'node:fs';
import * as path from 'node:path';

export interface PetFrame {
  rows: string[];
  /** Top-left of where face overlays (eyes, tears, blush, mouth) are drawn. */
  face?: [number, number];
  /** Top-left of where a small held prop (a found treasure) is drawn. */
  hold?: [number, number];
}

export interface PetStats {
  energy: number;
  happiness: number;
  hydration: number;
}

/** Changes to the action weights at a time of day: added first, then multiplied. */
export interface TimeMods {
  add?: Record<string, number>;
  scale?: Record<string, number>;
}

/** What makes one pet behave differently from another. All of it is data. */
export interface Personality {
  walkSpeed: number; // px/s
  sneakSpeed: number; // px/s
  /** What "play" means: a crouch-and-leap pounce, or digging up a treasure. */
  play: 'pounce' | 'rummage';
  washesFood: boolean;
  /** Extra energy lost per minute while awake between 1 and 5 AM. */
  nightEnergyDrain: number;
  sleepyAtNight: boolean;
  /** How much it feels like doing each thing, before stats and time of day adjust it. */
  weights: Record<string, number>;
  night: TimeMods; // 1 AM – 5 AM
  midday: TimeMods; // 11 AM – 4 PM
  /** Stat change per minute. */
  rates: Record<'awake' | 'active' | 'sleeping', PetStats>;
  /** What it says, grouped by moment. {repo}, {n} and {minutes} are filled in. */
  lines: Record<string, string[]>;
}

export interface PetDef {
  id: string;
  name: string;
  width: number;
  height: number;
  palette: Record<string, string | null>;
  frames: Record<string, PetFrame>;
  faces: Record<string, string[]>;
  animations: Record<string, { frames: string[]; fps: number }>;
  /** Optional: a different animation for a state, e.g. { "surprised": "upright" }. */
  poses?: Record<string, string>;
  personality: Personality;
}

/** Every pet must provide these; the renderer relies on them. */
export const REQUIRED_ANIMATIONS = [
  'idle', 'walk', 'sit', 'groom', 'sleep', 'stretch', 'crouch', 'leap', 'eat', 'dragged', 'fall',
];
export const REQUIRED_FACES = [
  'neutral', 'blink', 'happy', 'content', 'sleepy', 'sad', 'surprised', 'love', 'yawn',
];

/** Frames the renderer asks for by name (hearts, z's and the tray icon are placed from them). */
export const REQUIRED_FRAMES = ['stand', 'sit', 'lie'];
export const WEIGHTS = ['idle', 'walk', 'sit', 'groom', 'stretch', 'yawn', 'sleep', 'play', 'look', 'sneak'];
export const REQUIRED_LINES = [
  'hello', 'missedYou', 'sleepy', 'yawn', 'groom', 'sad', 'thirsty', 'dragged', 'wokeUp', 'played',
  'drank', 'ate', 'poked', 'cheers', 'pettedLots', 'petted', 'tooTired', 'napTime', 'amended', 'commit',
  'merged', 'push', 'back', 'backLong', 'breakDue', 'breakTaken', 'waterDue', 'lateNight',
];
const STATS = ['energy', 'happiness', 'hydration'] as const;

/** Checks the personality block; returns what is wrong with it. */
function personalityProblems(pet: PetDef): string[] {
  const p = pet.personality;
  if (!p || typeof p !== 'object') return ['missing "personality"'];
  const problems: string[] = [];
  const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
  const has = (anim: string) => !!pet.animations?.[anim];

  for (const key of ['walkSpeed', 'sneakSpeed', 'nightEnergyDrain'] as const) {
    if (!num(p[key]) || p[key] < 0) problems.push(`personality.${key} must be a number, 0 or more`);
  }
  for (const key of ['washesFood', 'sleepyAtNight'] as const) {
    if (typeof p[key] !== 'boolean') problems.push(`personality.${key} must be true or false`);
  }
  if (p.play !== 'pounce' && p.play !== 'rummage') problems.push('personality.play must be "pounce" or "rummage"');

  for (const w of WEIGHTS) {
    const v = p.weights?.[w];
    if (!num(v) || v < 0) problems.push(`personality.weights.${w} must be a number, 0 or more`);
  }
  for (const time of ['night', 'midday'] as const) {
    const mods = p[time];
    if (!mods || typeof mods !== 'object') {
      problems.push(`personality.${time} is missing (use {} for no change)`);
      continue;
    }
    for (const kind of ['add', 'scale'] as const) {
      for (const [k, v] of Object.entries(mods[kind] ?? {})) {
        if (!WEIGHTS.includes(k)) problems.push(`personality.${time}.${kind} has unknown action "${k}"`);
        if (!num(v)) problems.push(`personality.${time}.${kind}.${k} must be a number`);
      }
    }
  }
  for (const activity of ['awake', 'active', 'sleeping'] as const) {
    for (const s of STATS) {
      if (!num(p.rates?.[activity]?.[s])) problems.push(`personality.rates.${activity}.${s} must be a number`);
    }
  }

  const lines = p.lines ?? {};
  const extra = [
    ...(p.play === 'rummage' ? ['treasure'] : []),
    ...(p.washesFood ? ['washFood'] : []),
    ...((p.weights?.look ?? 0) > 0 ? ['look'] : []),
    ...((p.weights?.sneak ?? 0) > 0 ? ['sneak'] : []),
  ];
  for (const group of [...REQUIRED_LINES, ...extra]) {
    if (!lines[group]) problems.push(`missing lines "${group}"`);
  }
  for (const [group, list] of Object.entries(lines)) {
    if (!Array.isArray(list) || list.length === 0 || list.some((l) => typeof l !== 'string' || !l)) {
      problems.push(`lines "${group}" must be a list with at least one line`);
    }
  }

  // Behaviours that need their own art.
  if (p.play === 'rummage' && !(has('rummage') && has('upright'))) {
    problems.push('play "rummage" needs "rummage" and "upright" animations');
  }
  if (p.washesFood && !has('wash')) problems.push('washesFood needs a "wash" animation');
  if ((p.weights?.look ?? 0) > 0 && !has('upright')) problems.push('weights.look needs an "upright" animation');
  if ((p.weights?.sneak ?? 0) > 0 && !has('sneak')) problems.push('weights.sneak needs a "sneak" animation');
  return problems;
}

export interface PetPreview {
  id: string;
  name: string;
  palette: Record<string, string | null>;
  rows: string[];
}

/** A pet's happy sitting pose as plain rows, for the pet picker. */
export function petPreview(pet: PetDef): PetPreview {
  const frame = pet.frames.sit;
  const grid = frame.rows.map((row) => [...row]);
  if (frame.face) {
    const [fx, fy] = frame.face;
    pet.faces.happy.forEach((row, y) => {
      [...row].forEach((ch, x) => {
        if (ch !== '.') grid[fy + y][fx + x] = ch;
      });
    });
  }
  return { id: pet.id, name: pet.name, palette: pet.palette, rows: grid.map((r) => r.join('')) };
}

/** Lists the pets found in pets/<id>/pet.json. Used later by the pet picker. */
export function listPets(petsDir: string): string[] {
  return fs
    .readdirSync(petsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && fs.existsSync(path.join(petsDir, d.name, 'pet.json')))
    .map((d) => d.name);
}

/** Loads a pet and checks it, so a typo in a sprite gives a clear error instead of a broken cat. */
export function loadPet(petsDir: string, id: string): PetDef {
  const file = path.join(petsDir, id, 'pet.json');
  const pet = JSON.parse(fs.readFileSync(file, 'utf8')) as PetDef;
  const problems: string[] = [];
  const checkChars = (where: string, row: string) => {
    for (const ch of row) if (!(ch in pet.palette)) problems.push(`${where} uses "${ch}", not in palette`);
  };

  const faces = pet.faces ?? {};
  const faceWidth = Object.values(faces)[0]?.[0]?.length ?? 0;
  const faceHeight = Math.max(0, ...Object.values(faces).map((f) => f.length));
  for (const [name, rows] of Object.entries(faces)) {
    rows.forEach((row, i) => {
      if (row.length !== faceWidth) problems.push(`face "${name}" row ${i} is ${row.length} wide, expected ${faceWidth}`);
      checkChars(`face "${name}" row ${i}`, row);
    });
  }
  for (const f of REQUIRED_FACES) if (!faces[f]) problems.push(`missing face "${f}"`);

  for (const [name, frame] of Object.entries(pet.frames)) {
    const rows = frame.rows ?? [];
    if (rows.length !== pet.height) problems.push(`frame "${name}" has ${rows.length} rows, expected ${pet.height}`);
    rows.forEach((row, i) => {
      if (row.length !== pet.width) problems.push(`frame "${name}" row ${i} is ${row.length} wide, expected ${pet.width}`);
      checkChars(`frame "${name}" row ${i}`, row);
    });
    if (frame.face) {
      const [fx, fy] = frame.face;
      if (fx < 0 || fy < 0 || fx + faceWidth > pet.width || fy + faceHeight > pet.height) {
        problems.push(`frame "${name}" face position [${fx}, ${fy}] doesn't fit the face overlays`);
      }
    }
    if (frame.hold) {
      const [hx, hy] = frame.hold;
      if (!(hx >= 0 && hy >= 0 && hx < pet.width && hy < pet.height)) {
        problems.push(`frame "${name}" hold position [${hx}, ${hy}] is outside the frame`);
      }
    }
  }
  for (const f of REQUIRED_FRAMES) if (!pet.frames[f]) problems.push(`missing frame "${f}"`);
  if (pet.id !== id) problems.push(`id is "${pet.id}" but the folder is "${id}"`);

  for (const anim of REQUIRED_ANIMATIONS) if (!pet.animations[anim]) problems.push(`missing animation "${anim}"`);
  for (const [name, anim] of Object.entries(pet.animations)) {
    for (const f of anim.frames) if (!pet.frames[f]) problems.push(`animation "${name}" uses unknown frame "${f}"`);
  }

  for (const [state, anim] of Object.entries(pet.poses ?? {})) {
    if (!pet.animations[anim]) problems.push(`pose for "${state}" uses unknown animation "${anim}"`);
  }
  problems.push(...personalityProblems(pet));

  if (problems.length > 0) {
    throw new Error(`Pet "${id}" (${file}) is invalid:\n  - ${problems.join('\n  - ')}`);
  }
  return pet;
}
