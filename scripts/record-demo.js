// Records docs/demo.gif: the cat walking, being petted, grooming, celebrating a commit,
// drinking water with you and napping. Runs an invisible copy of the app with its own data folder.
// Run: npm run demo-gif
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { GIFEncoder, quantize, applyPalette } = require('gifenc');

const root = path.join(__dirname, '..');
const FPS = 8;
const UPSCALE = 2; // crisp, bigger pixels in the README
const BG = [244, 239, 230]; // warm paper background

const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'desktop-pet-demo-'));
fs.writeFileSync(path.join(userData, 'settings.json'), JSON.stringify({ repos: [] })); // skip repo discovery
app.setPath('userData', userData);
process.env.PET_DEBUG = '1';
app.on('browser-window-created', (_e, w) => w.setOpacity(0)); // nobody sees the recording cat
require(path.join(root, 'dist', 'main', 'main.js'));

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
setTimeout(() => {
  console.error('record-demo: timed out');
  app.exit(1);
}, 120000);

app.whenReady().then(async () => {
  try {
    await wait(2500);
    const win = BrowserWindow.getAllWindows()[0];
    const pet = (code) => win.webContents.executeJavaScript(`petDebug.${code}`);
    await win.webContents.executeJavaScript('petDebug.setStats({ energy: 80, happiness: 70, hydration: 70 })');

    const frames = [];
    const record = async (seconds) => {
      const end = Date.now() + seconds * 1000;
      while (Date.now() < end) {
        const t = Date.now();
        const img = await win.webContents.capturePage();
        frames.push({ size: img.getSize(), bgra: img.toBitmap() });
        await wait(Math.max(0, 1000 / FPS - (Date.now() - t)));
      }
    };

    await pet("setState('idle', 999)");
    await wait(4000); // let the greeting bubble finish
    await pet("setState('walk', 999)");
    await record(2);
    await pet('petTheCat()');
    await record(1.4);
    await pet("setState('groom', 999)");
    await record(1.6);
    await pet("handleEvent({ type: 'commit', repo: 'my-app', kind: 'commit' })");
    await record(2.4);
    await pet("handleEvent({ type: 'waterDue' })");
    await record(1.8);
    await pet('petTheCat()'); // you drink, the cat drinks with you
    await record(1.8);
    await pet("setState('sleep', 999)");
    await record(2.6);

    // Encode: put each frame on the background, upscale with hard pixel edges, write the GIF.
    const gif = GIFEncoder();
    for (const { size, bgra } of frames) {
      const w = size.width * UPSCALE;
      const h = size.height * UPSCALE;
      const rgba = new Uint8Array(w * h * 4);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const s = (Math.floor(y / UPSCALE) * size.width + Math.floor(x / UPSCALE)) * 4;
          const a = bgra[s + 3] / 255;
          const d = (y * w + x) * 4;
          rgba[d] = Math.round(bgra[s + 2] * a + BG[0] * (1 - a));
          rgba[d + 1] = Math.round(bgra[s + 1] * a + BG[1] * (1 - a));
          rgba[d + 2] = Math.round(bgra[s] * a + BG[2] * (1 - a));
          rgba[d + 3] = 255;
        }
      }
      const palette = quantize(rgba, 64);
      gif.writeFrame(applyPalette(rgba, palette), w, h, { palette, delay: 1000 / FPS });
    }
    gif.finish();
    fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
    const out = path.join(root, 'docs', 'demo.gif');
    fs.writeFileSync(out, gif.bytes());
    console.log(`wrote docs/demo.gif (${frames.length} frames, ${(fs.statSync(out).size / 1024).toFixed(0)} KB)`);
    done(0);
  } catch (err) {
    console.error('record-demo failed:', err);
    done(1);
  }
});

function done(code) {
  try {
    fs.rmSync(userData, { recursive: true, force: true });
  } catch {
    // temp folder; Windows may still hold a file open
  }
  app.exit(code);
}
