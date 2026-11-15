// Speech bubbles and little floating things: hearts, Zzz's, music notes.

import { drawGrid, PROPS } from './sprites.js';

type ParticleKind = 'heart' | 'z' | 'note' | 'confetti';

interface Particle {
  kind: ParticleKind;
  x: number; // CSS px inside the window
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  color?: string;
}

const CONFETTI = ['#ff5c8a', '#ffd23f', '#3fd2a0', '#5b8def', '#b57bff', '#ff9f43'];
const CONFETTI_GRAVITY = 260;
const BUBBLE_FONT = 'bold 11px "Segoe UI", sans-serif';
const LINE_HEIGHT = 14;

interface Bubble {
  text: string;
  age: number;
  life: number;
}

const INK = '#2b2233';
const PAPER = '#fffaf2';

export class Effects {
  private particles: Particle[] = [];
  private bubble: Bubble | null = null;

  private queue: Bubble[] = [];

  /** Says something right away, replacing the current bubble. */
  say(text: string, seconds = 2.5): void {
    this.bubble = { text, age: 0, life: seconds };
  }

  /** Stops talking (drops the current bubble and anything queued). */
  hush(): void {
    this.bubble = null;
    this.queue = [];
  }

  /** Says something after the current bubble (and anything already queued) is done. */
  sayNext(text: string, seconds = 2.5): void {
    if (!this.bubble) this.say(text, seconds);
    else this.queue.push({ text, age: 0, life: seconds });
  }

  get saying(): string | null {
    return this.bubble?.text ?? null;
  }

  spawn(kind: ParticleKind, x: number, y: number): void {
    const drift = kind === 'z' ? 8 : (Math.random() - 0.5) * 16;
    const life = kind === 'z' ? 2.2 : 1.3;
    this.particles.push({ kind, x, y, vx: drift, vy: -22, age: 0, life });
  }

  /** A burst of confetti from (x, y). */
  confetti(x: number, y: number, pieces = 20): void {
    for (let i = 0; i < pieces; i++) {
      this.particles.push({
        kind: 'confetti',
        x,
        y,
        vx: (Math.random() - 0.5) * 140,
        vy: -60 - Math.random() * 90,
        age: 0,
        life: 1.4 + Math.random() * 0.6,
        color: CONFETTI[i % CONFETTI.length],
      });
    }
  }

  update(dt: number): void {
    for (const p of this.particles) {
      if (p.kind === 'confetti') p.vy += CONFETTI_GRAVITY * dt;
      p.age += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    this.particles = this.particles.filter((p) => p.age < p.life);
    if (this.bubble) {
      this.bubble.age += dt;
      if (this.bubble.age > this.bubble.life) this.bubble = this.queue.shift() ?? null;
    }
  }

  /** headX/headY: where the bubble's tail should point, in CSS px. */
  draw(ctx: CanvasRenderingContext2D, dpr: number, windowW: number, headX: number, headY: number): void {
    for (const p of this.particles) {
      const t = p.age / p.life;
      ctx.globalAlpha = Math.max(0, 1 - t * t);
      if (p.kind === 'heart') {
        const size = Math.max(1, Math.round(3 * dpr));
        drawGrid(ctx, PROPS.heart, Math.round(p.x * dpr - 3.5 * size), Math.round(p.y * dpr), size);
      } else if (p.kind === 'confetti') {
        const size = Math.max(2, Math.round(3 * dpr));
        ctx.fillStyle = p.color!;
        // Flutter: alternate between a square and a thin sliver.
        const thin = Math.floor(p.age * 12 + p.vx) % 2 === 0;
        ctx.fillRect(Math.round(p.x * dpr), Math.round(p.y * dpr), size, thin ? Math.max(1, size / 3) : size);
      } else {
        ctx.save();
        ctx.scale(dpr, dpr);
        ctx.fillStyle = p.kind === 'z' ? '#6d7fd6' : '#ff5c8a';
        const px = p.kind === 'z' ? 10 + t * 6 : 13;
        ctx.font = `bold ${px}px "Segoe UI", sans-serif`;
        ctx.fillText(p.kind === 'z' ? 'z' : '♪', p.x, p.y);
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    }

    if (this.bubble) this.drawBubble(ctx, dpr, windowW, headX, headY);
  }

  private drawBubble(ctx: CanvasRenderingContext2D, dpr: number, windowW: number, headX: number, headY: number): void {
    const b = this.bubble!;
    // Pop in, fade out.
    const appear = Math.min(1, b.age / 0.12);
    const fade = Math.min(1, (b.life - b.age) / 0.3);
    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.globalAlpha = Math.max(0, fade);
    ctx.font = BUBBLE_FONT;
    const lines = wrap(ctx, b.text, windowW - 20);
    const textW = Math.max(...lines.map((l) => ctx.measureText(l).width));
    const w = Math.ceil(textW + 14);
    const h = 6 + lines.length * LINE_HEIGHT;
    const x = Math.min(Math.max(2, headX - w / 2), windowW - w - 2);
    const y = Math.max(2, headY - h - 8 - (1 - appear) * 4);

    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 7);
    ctx.fillStyle = PAPER;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = INK;
    ctx.stroke();

    // Tail pointing at the head.
    const tx = Math.min(Math.max(x + 8, headX), x + w - 8);
    ctx.beginPath();
    ctx.moveTo(tx - 4, y + h - 0.5);
    ctx.lineTo(tx, y + h + 6);
    ctx.lineTo(tx + 4, y + h - 0.5);
    ctx.fillStyle = PAPER;
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(tx - 4, y + h);
    ctx.lineTo(tx, y + h + 6);
    ctx.lineTo(tx + 4, y + h);
    ctx.stroke();

    ctx.fillStyle = INK;
    ctx.textBaseline = 'middle';
    lines.forEach((line, i) => ctx.fillText(line, x + 7, y + 3 + LINE_HEIGHT * (i + 0.5) + 0.5));
    ctx.restore();
  }
}

/** Splits text into lines that fit maxWidth (by words). */
function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}
