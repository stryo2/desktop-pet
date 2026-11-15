# Desktop Pet 🐱

A pixel cat that lives on your Windows taskbar. It walks around, sits, blinks, and hops with a heart when you pet it. You can pick it up and drop it anywhere.

## Run it

```bash
npm install
npm start
```

- **Click** the cat to pet it.
- **Drag** it anywhere; it falls back onto the taskbar of that screen.
- **Right-click** the cat (or the tray icon) for **Bring cat back** and **Quit**.

Clicks on the empty space around the cat pass straight through to the window behind it.

## How it's built

| Part | File |
|---|---|
| Window, tray, menu (Electron main process) | `src/main/main.ts` |
| Loading and validating pets | `src/main/petLoader.ts` |
| Bridge between page and main process | `src/main/preload.ts` |
| Behaviour, drawing, mouse handling | `src/renderer/app.ts` |
| Pet sprites and animations | `pets/<id>/pet.json` |

The window *is* the pet: walking and falling move the window itself. It ignores the mouse except when the cursor is over the cat.

## Adding a new pet

Each pet is one folder with a `pet.json`. No code changes needed.

1. Copy `pets/cat` to `pets/<your-pet>`.
2. Edit `palette` (one character per color, `.` = transparent) and draw the `frames` as text rows.
   Every frame must be exactly `width` × `height` characters. Sprites face **right**; they're mirrored when walking left.
3. Provide these animations: `idle`, `walk`, `dragged`, `fall`, `happy`.
4. Check it with:

```bash
npm run build && npm run check-pets
```

Choosing which pet to show from a menu is planned for v2 (`PET_ID` in `src/main/main.ts` for now).

## Roadmap

- **Week 2:** state machine polish, stats (energy, happiness, hydration), speech bubbles, saved state
- **Week 3:** reactions to your day: late night, breaks, water, idle sleep, git commits
- **Week 4:** tray settings, start with Windows, `.exe` installer
- **v2:** pet picker, accessories, Pomodoro mode, visiting friends' pets
