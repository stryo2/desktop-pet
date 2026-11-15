// Daily coding streak: days in a row with at least one commit.

export interface StreakState {
  streakCount: number;
  streakDay: string | null; // last day with a commit (YYYY-MM-DD, local time)
  commitsToday: number;
  commitsDay: string | null;
}

export function localDay(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function yesterday(now = new Date()): string {
  const d = new Date(now);
  d.setDate(d.getDate() - 1);
  return localDay(d);
}

/** The streak as of today: still alive if you committed today or yesterday. */
export function currentStreak(s: StreakState, now = new Date()): number {
  return s.streakDay === localDay(now) || s.streakDay === yesterday(now) ? s.streakCount : 0;
}

/** Records a new commit. Returns true if it was the first commit today (the streak grew). */
export function recordCommit(s: StreakState, now = new Date()): boolean {
  const today = localDay(now);
  if (s.commitsDay !== today) {
    s.commitsDay = today;
    s.commitsToday = 0;
  }
  s.commitsToday++;
  if (s.streakDay === today) return false;
  s.streakCount = s.streakDay === yesterday(now) ? s.streakCount + 1 : 1;
  s.streakDay = today;
  return true;
}
