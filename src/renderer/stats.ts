// Energy, happiness and hydration (0–100). They drift slowly over time and change
// with what the cat does and what you do for it.

export type Activity = 'awake' | 'active' | 'sleeping';

const clamp = (v: number) => Math.max(0, Math.min(100, v));

// Change per minute.
const RATES: Record<Activity, PetStats> = {
  awake: { energy: -0.5, happiness: -0.25, hydration: -0.4 },
  active: { energy: -1.5, happiness: -0.25, hydration: -0.6 },
  sleeping: { energy: 20, happiness: -0.1, hydration: -0.15 }, // a nap is a quick recharge
};

export function freshStats(): PetStats {
  return { energy: 90, happiness: 75, hydration: 80 };
}

export function tickStats(s: PetStats, dtSeconds: number, activity: Activity): void {
  const m = dtSeconds / 60;
  const r = RATES[activity];
  s.energy = clamp(s.energy + r.energy * m);
  s.happiness = clamp(s.happiness + r.happiness * m);
  s.hydration = clamp(s.hydration + r.hydration * m);
}

export function addStats(s: PetStats, delta: Partial<PetStats>): void {
  s.energy = clamp(s.energy + (delta.energy ?? 0));
  s.happiness = clamp(s.happiness + (delta.happiness ?? 0));
  s.hydration = clamp(s.hydration + (delta.hydration ?? 0));
}

/** While the app was closed the cat napped, but also missed you a little. */
export function applyTimeAway(s: PetStats, minutes: number): void {
  if (minutes <= 0) return;
  addStats(s, {
    energy: Math.min(minutes * 2, 100),
    happiness: -Math.min(minutes * 0.1, 30),
    hydration: -Math.min(minutes * 0.2, 50),
  });
}
