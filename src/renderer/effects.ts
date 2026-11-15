// Speech bubbles and little floating things: hearts, Zzz's, music notes.

import { drawGrid, PROPS } from './sprites.js';

type ParticleKind = 'heart' | 'z' | 'note';

interface Particle {
  kind: ParticleKind;
  x: number; // CSS px inside the window
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
}

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

  say(text: string, seconds = 2.5): void {
    this.bubble = { text, age: 0, life: seconds };
  }

  get saying(): string | null {
    return this.bubble?.text ?? null;
  }

  spawn(kind: ParticleKind, x: number, y: number): void {
    const drift = kind === 'z' ? 8 : (Math.random() - 0.5) * 16;
    const life = kind === 'z' ? 2.2 : 1.3;
    this.particles.push({ kind, x, y, vx: drift, vy: -22, age: 0, life });
  }

  update(dt: number): void {
    for (const p of this.particles) {
      p.age += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    this.particles = this.particles.filter((p) => p.age < p.life);
    if (this.bubble) {
      this.bubble.age += dt;
      if (this.bubble.age > this.bubble.life) this.bubble = null;
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
    ctx.font = 'bold 11px "Segoe UI", sans-serif';
    const textW = ctx.measureText(b.text).width;
    const w = Math.ceil(textW + 14);
    const h = 20;
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
    ctx.fillText(b.text, x + 7, y + h / 2 + 0.5);
    ctx.restore();
  }
}
