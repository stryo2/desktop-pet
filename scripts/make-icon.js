// Draws the app icon (build/icon.png, 256x256) from the cat sprite.
// Run: npx electron scripts/make-icon.js   (after npm run build)
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const pet = JSON.parse(fs.readFileSync(path.join(root, 'pets', 'cat', 'pet.json'), 'utf8'));
const spritesUrl = 'file:///' + path.join(root, 'dist', 'renderer', 'sprites.js').replace(/\\/g, '/');

setTimeout(() => {
  console.error('make-icon: timed out');
  app.exit(1);
}, 30000);

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 256, height: 256, show: false });
  // A local page, so it's allowed to import the sprite code from disk.
  const page = path.join(app.getPath('temp'), 'desktop-pet-icon.html');
  fs.writeFileSync(page, '<!doctype html><meta charset="utf-8">');
  await win.loadFile(page);
  const dataUrl = await win.webContents.executeJavaScript(`(async () => {
    const { composeFrame, drawGrid } = await import(${JSON.stringify(spritesUrl)});
    const pet = ${JSON.stringify(pet)};
    const grid = composeFrame(pet, 'sit', 'happy');
    // Crop to the drawn pixels so the cat fills the icon.
    let minX = Infinity, maxX = -1, minY = Infinity, maxY = -1;
    grid.forEach((row, y) => row.forEach((c, x) => { if (c) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); } }));
    const cropped = grid.slice(minY, maxY + 1).map((row) => row.slice(minX, maxX + 1));
    const w = cropped[0].length, h = cropped.length;
    const size = Math.floor(232 / Math.max(w, h));
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const ctx = c.getContext('2d');
    drawGrid(ctx, cropped, Math.floor((256 - w * size) / 2), Math.floor((256 - h * size) / 2), size);
    return c.toDataURL('image/png');
  })()`);
  fs.mkdirSync(path.join(root, 'build'), { recursive: true });
  fs.writeFileSync(path.join(root, 'build', 'icon.png'), Buffer.from(dataUrl.split(',')[1], 'base64'));
  console.log('wrote build/icon.png');
  app.exit(0);
}).catch((err) => {
  console.error('make-icon failed:', err);
  app.exit(1);
});
