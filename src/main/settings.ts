import * as fs from 'node:fs';
import * as path from 'node:path';

export interface Settings {
  version: 1;
  breakReminders: boolean;
  waterReminders: boolean;
  lateNightNudges: boolean;
  breakMinutes: number; // active minutes before suggesting a break
  waterMinutes: number; // active minutes between water reminders
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
  repos: null,
};

const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);
const minutes = (v: unknown, d: number) => (Number.isFinite(v) && (v as number) >= 1 ? (v as number) : d);

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
    breakMinutes: minutes(raw.breakMinutes, d.breakMinutes),
    waterMinutes: minutes(raw.waterMinutes, d.waterMinutes),
    repos: Array.isArray(raw.repos) ? raw.repos.filter((r): r is string => typeof r === 'string') : null,
  };
}

export function writeSettings(file: string, s: Settings): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(s, null, 2));
  fs.renameSync(tmp, file);
}
