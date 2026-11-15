import * as fs from 'node:fs';
import * as path from 'node:path';

export interface Settings {
  version: 1;
  breakReminders: boolean;
  waterReminders: boolean;
  lateNightNudges: boolean;
  breakMinutes: number; // active minutes before suggesting a break
  waterMinutes: number; // active minutes between water reminders
  catScale: number; // screen pixels per sprite pixel (cat size)
  /** Git repos to watch. null = not set up yet (we look for repos on first run). */
  repos: string[] | null;
}

export const DEFAULT_SETTINGS: Settings = {
  version: 1,
  breakReminders: true,
  waterReminders: true,
  lateNightNudges: true,
  breakMinutes: 50,
  waterMinutes: 75,
  catScale: 5,
  repos: null,
};

export const LIMITS = {
  breakMinutes: [15, 180],
  waterMinutes: [15, 240],
  catScale: [3, 8],
} as const;

const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);
const ranged = (v: unknown, d: number, [min, max]: readonly [number, number]) =>
  Number.isFinite(v) ? Math.round(Math.min(max, Math.max(min, v as number))) : d;

/** Applies a partial update from the settings window, keeping every value in range. */
export function mergeSettings(s: Settings, patch: Record<string, unknown>): Settings {
  return {
    ...s,
    breakReminders: bool(patch.breakReminders, s.breakReminders),
    waterReminders: bool(patch.waterReminders, s.waterReminders),
    lateNightNudges: bool(patch.lateNightNudges, s.lateNightNudges),
    breakMinutes: ranged(patch.breakMinutes, s.breakMinutes, LIMITS.breakMinutes),
    waterMinutes: ranged(patch.waterMinutes, s.waterMinutes, LIMITS.waterMinutes),
    catScale: ranged(patch.catScale, s.catScale, LIMITS.catScale),
  };
}

export function readSettings(file: string): Settings {
  let raw: Partial<Settings> = {};
  try {
    raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    // first run or unreadable: defaults
  }
  const d = DEFAULT_SETTINGS;
  return {
    version: 1,
    breakReminders: bool(raw.breakReminders, d.breakReminders),
    waterReminders: bool(raw.waterReminders, d.waterReminders),
    lateNightNudges: bool(raw.lateNightNudges, d.lateNightNudges),
    breakMinutes: ranged(raw.breakMinutes, d.breakMinutes, LIMITS.breakMinutes),
    waterMinutes: ranged(raw.waterMinutes, d.waterMinutes, LIMITS.waterMinutes),
    catScale: ranged(raw.catScale, d.catScale, LIMITS.catScale),
    repos: Array.isArray(raw.repos) ? raw.repos.filter((r): r is string => typeof r === 'string') : null,
  };
}

export function writeSettings(file: string, s: Settings): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(s, null, 2));
  fs.renameSync(tmp, file);
}
