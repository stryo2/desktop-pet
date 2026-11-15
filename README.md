# Desktop Pet 🐱

A pixel cat that lives on your Windows taskbar. It walks, sits, grooms, stretches, yawns, naps, pounces, and talks in little speech bubbles. It has moods driven by its energy, happiness and hydration, and it remembers them between runs.

## Run it

```bash
npm install
npm start
```

- **Click** the cat to pet it (hearts, purrs; click a sleeping cat and it wakes up startled).
- **Drag** it anywhere; it falls back onto the taskbar of that screen. Drop it from high up and it's surprised.
- **Right-click** the cat (or the tray icon) to see its stats and to **Give water**, **Give a treat**, **Play**, **Nap time**, **Bring cat back** or **Quit**.

Clicks on the empty space around the cat pass straight through to the window behind it.

## Moods and stats

| Stat | Goes down | Goes up |
|---|---|---|
| ⚡ Energy | slowly while awake, faster when walking/playing | napping |
| ❤ Happiness | slowly over time | petting, treats, playing |
| 💧 Hydration | slowly over time | water |

Low energy → more yawns and naps, sleepy face. Low happiness → sits looking sad, asks for pets. Low hydration → asks for water.
Emotions are face overlays (neutral, blink, happy, content, sleepy, sad, surprised, love, yawn) drawn on top of any pose.

State is saved to `save.json` in the app's user-data folder. While the app is closed the cat naps (energy refills) but gets a bit lonely and thirsty; it greets you when you come back.

## How it's built

| Part | File |
|---|---|
| Window, tray, menu, cursor tracking (Electron main process) | `src/main/main.ts` |
| Loading and validating pets | `src/main/petLoader.ts` |
| Saving state safely | `src/main/save.ts` |
| Bridge between page and main process | `src/main/preload.ts` |
| State machine, drawing, mouse, menu actions | `src/renderer/app.ts` |
| What to do next, resting mood | `src/renderer/brain.ts` |
| Stats and how they change | `src/renderer/stats.ts` |
| Face overlays, sprite drawing, props | `src/renderer/sprites.ts` |
| Speech bubbles, hearts, Zzz's, notes | `src/renderer/effects.ts` |
| Pet sprites, faces, animations | `pets/<id>/pet.json` |

Set `PET_DEBUG=1` to expose `window.petDebug` in the page for test scripts.

The window *is* the pet: walking and falling move the window itself. It ignores the mouse except when the cursor is over the cat.

## Adding a new pet

Each pet is one folder with a `pet.json`. No code changes needed.

1. Copy `pets/cat` to `pets/<your-pet>`.
2. Edit `palette` (one character per color, `.` = transparent) and draw the `frames` as text rows.
   Every frame must be exactly `width` × `height` characters. Sprites face **right**; they're mirrored when walking left.
   Draw poses **without eyes**: each frame's `face: [x, y]` says where the face overlay goes.
3. Provide `faces` (`neutral`, `blink`, `happy`, `content`, `sleepy`, `sad`, `surprised`, `love`, `yawn`; `.` keeps the pixel underneath)
   and animations `idle`, `walk`, `sit`, `groom`, `sleep`, `stretch`, `crouch`, `leap`, `eat`, `dragged`, `fall`.
4. Check it with:

```bash
npm run build && npm run check-pets
```

Choosing which pet to show from a menu is planned for v2 (`PET_ID` in `src/main/main.ts` for now).

## Roadmap

- ~~**Week 2:** poses and emotions, stats, speech bubbles, saved state~~ ✅
- **Week 3:** reactions to your day: late night, breaks, water, idle sleep, git commits
- **Week 4:** tray settings, start with Windows, `.exe` installer
- **v2:** pet picker, accessories, Pomodoro mode, visiting friends' pets
