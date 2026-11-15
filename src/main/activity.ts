// Watches how you're using the PC (idle time, screen lock, the clock) and decides
// when to send the cat "away", "back", "break", "water" and "late night" events.
// Only active time counts toward reminders: time you're idle doesn't nag you.

import type { PetEvent } from './events.js';
import type { Settings } from './settings.js';

const AWAY_SECONDS = 10 * 60; // idle this long (or locked) = you're away
const BREAK_SECONDS = 5 * 60; // idle this long = you took a break
const ACTIVE_IDLE_LIMIT = 60; // idle less than this = you're actively using the PC
const BREAK_REPEAT_SECONDS = 10 * 60; // nudge again if a break reminder was ignored
const WATER_REPEAT_SECONDS = 20 * 60;
const LATE_NIGHT_REPEAT_MS = 30 * 60 * 1000;
const LATE_NIGHT_FROM = 1; // 1 AM
const LATE_NIGHT_TO = 5; // until 5 AM

export class ActivityMonitor {
  // Swappable for tests.
  idleSeconds: () => number = () => 0;
  now: () => number = () => Date.now();

  private last = 0;
  private locked = false;
  private away = false;
  private awaySince = 0;
  private onBreak = false;
  private breakPending = false;
  private breakActive = 0; // active seconds since your last break
  private waterActive = 0; // active seconds since your last water
  private nextBreakAt: number;
  private nextWaterAt: number;
  private nextLateNight = 0;

  constructor(
    private settings: () => Settings,
    private emit: (e: PetEvent) => void,
  ) {
    this.nextBreakAt = settings().breakMinutes * 60;
    this.nextWaterAt = settings().waterMinutes * 60;
  }

  setLocked(locked: boolean): void {
    this.locked = locked;
    this.tick();
  }

  /** You drank water (clicked the cat when it reminded you). */
  waterAck(): void {
    this.waterActive = 0;
    this.nextWaterAt = this.settings().waterMinutes * 60;
  }

  /** The reminder settings changed: restart the countdowns. */
  resetTimers(): void {
    const s = this.settings();
    this.nextBreakAt = this.breakActive + s.breakMinutes * 60;
    this.nextWaterAt = this.waterActive + s.waterMinutes * 60;
  }

  tick(): void {
    const s = this.settings();
    const now = this.now();
    const dt = this.last ? Math.min(60, Math.max(0, (now - this.last) / 1000)) : 0;
    this.last = now;
    const idle = this.locked ? Infinity : this.idleSeconds();

    // Away and back.
    if (!this.away && idle >= AWAY_SECONDS) {
      this.away = true;
      this.awaySince = Number.isFinite(idle) ? now - idle * 1000 : now;
      this.emit({ type: 'away' });
    }

    // Breaks: a long enough idle stretch counts as a break and resets the countdown.
    if (idle >= BREAK_SECONDS && !this.onBreak) {
      this.onBreak = true;
      this.breakActive = 0;
      this.nextBreakAt = s.breakMinutes * 60;
    }

    if (idle < ACTIVE_IDLE_LIMIT) {
      if (this.away) {
        this.away = false;
        this.emit({ type: 'back', minutes: Math.round((now - this.awaySince) / 60000) });
      } else if (this.onBreak && this.breakPending) {
        this.emit({ type: 'breakTaken' });
      }
      if (this.onBreak) {
        this.onBreak = false;
        this.breakPending = false;
      }

      this.breakActive += dt;
      this.waterActive += dt;

      if (s.breakReminders && this.breakActive >= this.nextBreakAt) {
        this.breakPending = true;
        this.nextBreakAt = this.breakActive + BREAK_REPEAT_SECONDS;
        this.emit({ type: 'breakDue', activeMinutes: Math.round(this.breakActive / 60) });
      }
      if (s.waterReminders && this.waterActive >= this.nextWaterAt) {
        this.nextWaterAt = this.waterActive + WATER_REPEAT_SECONDS;
        this.emit({ type: 'waterDue' });
      }

      const hour = new Date(now).getHours();
      if (s.lateNightNudges && hour >= LATE_NIGHT_FROM && hour < LATE_NIGHT_TO && now >= this.nextLateNight) {
        this.nextLateNight = now + LATE_NIGHT_REPEAT_MS;
        this.emit({ type: 'lateNight' });
      }
    }
  }
}
