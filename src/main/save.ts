import * as fs from 'node:fs';
import * as path from 'node:path';

export interface SaveData {
  version: 1;
  petId: string;
  stats: { energy: number; happiness: number; hydration: number };
  x: number | null;
  lastSeen: number;
  timesPetted: number;
}

const pct = (v: unknown) => (Number.isFinite(v) ? Math.max(0, Math.min(100, v as number)) : 50);

/** Accepts only well-formed saves (the file could be hand-edited or corrupted). */
export function parseSave(raw: unknown): SaveData | null {
  const o = raw as Partial<SaveData> | null;
  if (!o || o.version !== 1 || typeof o.petId !== 'string' || !o.stats) return null;
  return {
    version: 1,
    petId: o.petId,
    stats: { energy: pct(o.stats.energy), happiness: pct(o.stats.happiness), hydration: pct(o.stats.hydration) },
    x: Number.isFinite(o.x) ? (o.x as number) : null,
    lastSeen: Number.isFinite(o.lastSeen) ? (o.lastSeen as number) : Date.now(),
    timesPetted: Number.isFinite(o.timesPetted) ? Math.max(0, Math.floor(o.timesPetted as number)) : 0,
  };
}

export function readSave(file: string): SaveData | null {
  try {
    return parseSave(JSON.parse(fs.readFileSync(file, 'utf8')));
  } catch {
    return null; // first run, or unreadable: start fresh
  }
}

/** Writes to a temp file and renames, so a crash mid-write can't leave a half-written save. */
export function writeSave(file: string, data: SaveData): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
}
