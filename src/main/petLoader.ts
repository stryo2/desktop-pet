import * as fs from 'node:fs';
import * as path from 'node:path';

export interface PetFrame {
  rows: string[];
  /** Top-left of where face overlays (eyes, tears, blush, mouth) are drawn. */
  face?: [number, number];
}

export interface PetDef {
  id: string;
  name: string;
  width: number;
  height: number;
  palette: Record<string, string | null>;
  frames: Record<string, PetFrame>;
  faces: Record<string, string[]>;
  animations: Record<string, { frames: string[]; fps: number }>;
}

/** Every pet must provide these; the renderer relies on them. */
export const REQUIRED_ANIMATIONS = [
  'idle', 'walk', 'sit', 'groom', 'sleep', 'stretch', 'crouch', 'leap', 'eat', 'dragged', 'fall',
];
export const REQUIRED_FACES = [
  'neutral', 'blink', 'happy', 'content', 'sleepy', 'sad', 'surprised', 'love', 'yawn',
];

/** Lists the pets found in pets/<id>/pet.json. Used later by the pet picker. */
export function listPets(petsDir: string): string[] {
  return fs
    .readdirSync(petsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && fs.existsSync(path.join(petsDir, d.name, 'pet.json')))
    .map((d) => d.name);
}

/** Loads a pet and checks it, so a typo in a sprite gives a clear error instead of a broken cat. */
export function loadPet(petsDir: string, id: string): PetDef {
  const file = path.join(petsDir, id, 'pet.json');
  const pet = JSON.parse(fs.readFileSync(file, 'utf8')) as PetDef;
  const problems: string[] = [];
  const checkChars = (where: string, row: string) => {
    for (const ch of row) if (!(ch in pet.palette)) problems.push(`${where} uses "${ch}", not in palette`);
  };

  const faces = pet.faces ?? {};
  const faceWidth = Object.values(faces)[0]?.[0]?.length ?? 0;
  const faceHeight = Math.max(0, ...Object.values(faces).map((f) => f.length));
  for (const [name, rows] of Object.entries(faces)) {
    rows.forEach((row, i) => {
      if (row.length !== faceWidth) problems.push(`face "${name}" row ${i} is ${row.length} wide, expected ${faceWidth}`);
      checkChars(`face "${name}" row ${i}`, row);
    });
  }
  for (const f of REQUIRED_FACES) if (!faces[f]) problems.push(`missing face "${f}"`);

  for (const [name, frame] of Object.entries(pet.frames)) {
    const rows = frame.rows ?? [];
    if (rows.length !== pet.height) problems.push(`frame "${name}" has ${rows.length} rows, expected ${pet.height}`);
    rows.forEach((row, i) => {
      if (row.length !== pet.width) problems.push(`frame "${name}" row ${i} is ${row.length} wide, expected ${pet.width}`);
      checkChars(`frame "${name}" row ${i}`, row);
    });
    if (frame.face) {
      const [fx, fy] = frame.face;
      if (fx < 0 || fy < 0 || fx + faceWidth > pet.width || fy + faceHeight > pet.height) {
        problems.push(`frame "${name}" face position [${fx}, ${fy}] doesn't fit the face overlays`);
      }
    }
  }

  for (const anim of REQUIRED_ANIMATIONS) if (!pet.animations[anim]) problems.push(`missing animation "${anim}"`);
  for (const [name, anim] of Object.entries(pet.animations)) {
    for (const f of anim.frames) if (!pet.frames[f]) problems.push(`animation "${name}" uses unknown frame "${f}"`);
  }

  if (problems.length > 0) {
    throw new Error(`Pet "${id}" (${file}) is invalid:\n  - ${problems.join('\n  - ')}`);
  }
  return pet;
}
