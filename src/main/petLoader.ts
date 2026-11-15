import * as fs from 'node:fs';
import * as path from 'node:path';

export interface PetDef {
  id: string;
  name: string;
  width: number;
  height: number;
  palette: Record<string, string | null>;
  frames: Record<string, string[]>;
  animations: Record<string, { frames: string[]; fps: number }>;
}

/** Every pet must provide these animations; the renderer relies on them. */
const REQUIRED_ANIMATIONS = ['idle', 'walk', 'dragged', 'fall', 'happy'];

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

  for (const [name, rows] of Object.entries(pet.frames)) {
    if (rows.length !== pet.height) {
      problems.push(`frame "${name}" has ${rows.length} rows, expected ${pet.height}`);
    }
    rows.forEach((row, i) => {
      if (row.length !== pet.width) {
        problems.push(`frame "${name}" row ${i} is ${row.length} wide, expected ${pet.width}`);
      }
      for (const ch of row) {
        if (!(ch in pet.palette)) problems.push(`frame "${name}" row ${i} uses "${ch}", not in palette`);
      }
    });
  }
  for (const anim of REQUIRED_ANIMATIONS) {
    if (!pet.animations[anim]) problems.push(`missing animation "${anim}"`);
  }
  for (const [name, anim] of Object.entries(pet.animations)) {
    for (const f of anim.frames) {
      if (!pet.frames[f]) problems.push(`animation "${name}" uses unknown frame "${f}"`);
    }
  }

  if (problems.length > 0) {
    throw new Error(`Pet "${id}" (${file}) is invalid:\n  - ${problems.join('\n  - ')}`);
  }
  return pet;
}
