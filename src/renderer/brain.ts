// Decides what the cat feels like doing next, based on how it's doing and the time of day.

export type Choice = 'idle' | 'walk' | 'sit' | 'groom' | 'stretch' | 'yawn' | 'sleep' | 'play' | 'sad' | 'thirsty';

/** 1 AM – 5 AM: the cat (and you) should be asleep. */
export function isLateNight(now = new Date()): boolean {
  const h = now.getHours();
  return h >= 1 && h < 5;
}

export function chooseNext(s: PetStats, lateNight = false): Choice {
  const w: Record<Choice, number> = {
    idle: 15,
    walk: 30,
    sit: 20,
    groom: 10,
    stretch: 6,
    yawn: 3,
    sleep: 3,
    play: 8,
    sad: 0,
    thirsty: 0,
  };

  if (s.energy < 40) {
    w.sleep += 25;
    w.yawn += 10;
    w.walk /= 2;
    w.play = 0;
  }
  if (s.energy < 15) w.sleep += 80;
  if (lateNight) {
    w.sleep += 15;
    w.yawn += 8;
    w.play /= 2;
  }
  if (s.happiness > 70 && s.energy > 40) w.play += 8;
  if (s.happiness < 30) w.sad += 20;
  if (s.hydration < 30) w.thirsty += 20;

  const total = Object.values(w).reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (const [choice, weight] of Object.entries(w) as [Choice, number][]) {
    r -= weight;
    if (r <= 0) return choice;
  }
  return 'idle';
}

/** The cat's resting face when it isn't doing anything special. */
export function restingMood(s: PetStats, lateNight = false): 'neutral' | 'sleepy' | 'sad' {
  if (s.energy < 25 || lateNight) return 'sleepy';
  if (s.happiness < 25) return 'sad';
  return 'neutral';
}

export const pick = <T>(items: T[]): T => items[Math.floor(Math.random() * items.length)];
