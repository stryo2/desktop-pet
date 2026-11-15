// Validates every pet in pets/ (run: npm run check-pets, after npm run build).
const path = require('node:path');
const { listPets, loadPet } = require('../dist/main/petLoader.js');

const petsDir = path.join(__dirname, '..', 'pets');
let failed = false;
for (const id of listPets(petsDir)) {
  try {
    const pet = loadPet(petsDir, id);
    console.log(`ok   ${id} (${Object.keys(pet.frames).length} frames)`);
  } catch (err) {
    failed = true;
    console.error(`FAIL ${err.message}`);
  }
}
process.exit(failed ? 1 : 0);
