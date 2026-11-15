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

## Reacting to your day

| What happens | How it's detected | The cat |
|---|---|---|
| 50 min of active use without a break | Windows idle time | stretches: "time to stretch! 🧘" (again every 10 min if ignored) |
| You take a 5+ min break after that | idle time | "nice break! ✨" |
| 75 min of active use | idle time | sits with a water bowl: "water break? 💧 click me when you drink!" — click it and you drink together |
| You're away 10+ min or lock the screen | idle time, lock events | falls asleep; wakes up and greets you when you're back |
| 1–5 AM and you're still on the PC | clock | yawns: "bedtime, human 🌙" (every 30 min) and looks sleepy |
| You commit | `.git/logs/HEAD` in watched repos | jumps with confetti; first commit of the day grows your 🔥 streak |
| You push | `.git/logs/refs/remotes/**` | bigger confetti: "pushed! 🚀" |

Only *active* time counts toward reminders. Reminders can be switched off under **Reminders** in the menu.
On first run it looks for git repos in `~/projects`, `~/code`, `~/repos`, `~/src`, `~/dev`, `~/git` and `~/Documents/GitHub`; add or remove repos under **Watched repos**. Nothing is installed into your repos and nothing leaves your PC.
Settings live in `settings.json` next to `save.json`.

## How it's built

| Part | File |
|---|---|
| Window, tray, menu, cursor tracking (Electron main process) | `src/main/main.ts` |
| Loading and validating pets | `src/main/petLoader.ts` |
| Saving state safely | `src/main/save.ts` |
| Idle/away/break/water/late-night detection | `src/main/activity.ts` |
| Watching repos for commits and pushes | `src/main/gitWatcher.ts` |
| Reminder and repo settings | `src/main/settings.ts` |
| Daily commit streak | `src/renderer/streak.ts` |
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
- ~~**Week 3:** reactions to your day: late night, breaks, water, idle sleep, git commits~~ ✅
- **Week 4:** tray settings, start with Windows, `.exe` installer
- **v2:** pet picker, accessories, Pomodoro mode, visiting friends' pets
