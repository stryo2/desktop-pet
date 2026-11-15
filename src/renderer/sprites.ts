// Turning text-art sprites into colored pixel grids, and drawing them.

export type Emotion = 'neutral' | 'blink' | 'happy' | 'content' | 'sleepy' | 'sad' | 'surprised' | 'love' | 'yawn';

/** A sprite as a grid of CSS colors (null = transparent). */
export type Grid = (string | null)[][];

export function gridFromRows(rows: string[], palette: Record<string, string | null>): Grid {
  return rows.map((row) => [...row].map((ch) => palette[ch] ?? null));
}

const cache = new Map<string, Grid>();

/** A pose with an emotion's face drawn on top ('.' in a face keeps what's underneath). */
export function composeFrame(pet: PetDef, frameName: string, emotion: Emotion): Grid {
  const key = `${pet.id}:${frameName}:${emotion}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const frame = pet.frames[frameName];
  const grid = gridFromRows(frame.rows, pet.palette);
  if (frame.face) {
    const [fx, fy] = frame.face;
    const face = pet.faces[emotion] ?? pet.faces.neutral;
    face.forEach((row, y) => {
      [...row].forEach((ch, x) => {
        if (ch !== '.') grid[fy + y][fx + x] = pet.palette[ch] ?? null;
      });
    });
  }
  cache.set(key, grid);
  return grid;
}

/** Draws a grid with its top-left at (ox, oy), in device pixels. */
export function drawGrid(
  ctx: CanvasRenderingContext2D,
  grid: Grid,
  ox: number,
  oy: number,
  size: number,
  mirror = false,
): void {
  const w = grid[0]?.length ?? 0;
  grid.forEach((row, y) => {
    row.forEach((color, x) => {
      if (!color) return;
      ctx.fillStyle = color;
      const dx = mirror ? w - 1 - x : x;
      ctx.fillRect(ox + dx * size, oy + y * size, size, size);
    });
  });
}

// Small props shared by every pet.
const OUTLINE = '#2b2233';
export const PROPS = {
  heart: gridFromRows(['.KK.KK.', 'KPPKPPK', 'KPPPPPK', '.KPPPK.', '..KPK..', '...K...'], {
    '.': null, K: OUTLINE, P: '#ff5c8a',
  }),
  waterBowl: gridFromRows(['KSSSSSK', 'KBBBBBK', '.KKKKK.'], {
    '.': null, K: OUTLINE, S: '#bfe6ff', B: '#5b8def',
  }),
  foodBowl: gridFromRows(['KCFCFCK', 'KRRRRRK', '.KKKKK.'], {
    '.': null, K: OUTLINE, C: '#a8693a', F: '#d99a5b', R: '#e0565b',
  }),
};
