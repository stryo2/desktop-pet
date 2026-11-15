// Decides what the pet feels like doing next, based on its personality, how it's doing and the time of day.

export type Choice =
  | 'idle' | 'walk' | 'sit' | 'groom' | 'stretch' | 'yawn' | 'sleep' | 'play' | 'look' | 'sneak'
  | 'sad' | 'thirsty';

export type TimeOfDay = 'night' | 'midday' | 'day';

/** 1 AM – 5 AM: you should be asleep (and so should a pet that isn't nocturnal). */
export function isLateNight(now = new Date()): boolean {
  const h = now.getHours();
  return h >= 1 && h < 5;
}

export function timeOfDay(now = new Date()): TimeOfDay {
  if (isLateNight(now)) return 'night';
  const h = now.getHours();
  return h >= 11 && h < 16 ? 'midday' : 'day';
}

/** The pet's own weights, adjusted for the time of day and then for how it's feeling. */
export function choiceWeights(s: PetStats, p: Personality, time: TimeOfDay): Record<Choice, number> {
  const base = p.weights;
  const w: Record<Choice, number> = {
    idle: base.idle,
    walk: base.walk,
    sit: base.sit,
    groom: base.groom,
    stretch: base.stretch,
    yawn: base.yawn,
    sleep: base.sleep,
    play: base.play,
    look: base.look,
    sneak: base.sneak,
    sad: 0,
    thirsty: 0,
  };

  const mods = time === 'night' ? p.night : time === 'midday' ? p.midday : {};
  for (const [k, v] of Object.entries(mods.add ?? {})) w[k as Choice] += v;
  for (const [k, v] of Object.entries(mods.scale ?? {})) w[k as Choice] *= v;

  if (s.energy < 40) {
    w.sleep += 25;
    w.yawn += 10;
    w.walk /= 2;
    w.sneak /= 2;
    w.play = 0;
  }
  if (s.energy < 15) w.sleep += 80;
  if (s.happiness > 70 && s.energy > 40) w.play += 8;
  if (s.happiness < 30) w.sad += 20;
  if (s.hydration < 30) w.thirsty += 20;
  return w;
}

export function chooseNext(s: PetStats, p: Personality, time: TimeOfDay = 'day'): Choice {
  const w = choiceWeights(s, p, time);
  const total = Object.values(w).reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (const [choice, weight] of Object.entries(w) as [Choice, number][]) {
    r -= weight;
    if (r <= 0) return choice;
  }
  return 'idle';
}

/** The pet's resting face when it isn't doing anything special. */
export function restingMood(s: PetStats, sleepyHour = false): 'neutral' | 'sleepy' | 'sad' {
  if (s.energy < 25 || sleepyHour) return 'sleepy';
  if (s.happiness < 25) return 'sad';
  return 'neutral';
}

export const pick = <T>(items: T[]): T => items[Math.floor(Math.random() * items.length)];
