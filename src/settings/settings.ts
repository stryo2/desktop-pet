// The settings window. Every change saves immediately (no Save button).

interface SettingsView {
  breakReminders: boolean;
  waterReminders: boolean;
  lateNightNudges: boolean;
  breakMinutes: number;
  waterMinutes: number;
  catScale: number;
  petId: string;
  pets: PetPreview[];
  repos: string[];
  startWithWindows: boolean;
  limits: { breakMinutes: [number, number]; waterMinutes: [number, number]; catScale: [number, number] };
}

/** A pet's sitting pose as text rows, drawn as a thumbnail in the picker. */
interface PetPreview {
  id: string;
  name: string;
  palette: Record<string, string | null>;
  rows: string[];
}

interface SettingsApi {
  get(): Promise<SettingsView>;
  update(patch: Partial<SettingsView>): Promise<SettingsView>;
  addRepos(): Promise<SettingsView>;
  rescanRepos(): Promise<SettingsView>;
  removeRepo(repo: string): Promise<SettingsView>;
  onChanged(cb: (view: SettingsView) => void): void;
}

const api = (window as unknown as { settingsApi: SettingsApi }).settingsApi;
const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const SIZE_NAMES: Record<number, string> = { 3: 'Tiny', 4: 'Small', 5: 'Normal', 6: 'Big', 7: 'Bigger', 8: 'Huge' };

const catScale = el<HTMLInputElement>('catScale');
const catScaleLabel = el<HTMLSpanElement>('catScaleLabel');
const checks = ['breakReminders', 'waterReminders', 'lateNightNudges', 'startWithWindows'] as const;
const numbers = ['breakMinutes', 'waterMinutes'] as const;
const status = el<HTMLSpanElement>('status');
const repoList = el<HTMLUListElement>('repos');
const petList = el<HTMLDivElement>('pets');
const THUMB_SCALE = 3;

function petButton(p: PetPreview, chosen: boolean): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.setAttribute('aria-pressed', String(chosen));
  const canvas = document.createElement('canvas');
  canvas.width = (p.rows[0]?.length ?? 0) * THUMB_SCALE;
  canvas.height = p.rows.length * THUMB_SCALE;
  const ctx = canvas.getContext('2d')!;
  p.rows.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      const color = p.palette[ch];
      if (!color) return;
      ctx.fillStyle = color;
      ctx.fillRect(x * THUMB_SCALE, y * THUMB_SCALE, THUMB_SCALE, THUMB_SCALE);
    });
  });
  const name = document.createElement('span');
  name.textContent = p.name;
  button.append(canvas, name);
  button.addEventListener('click', () => {
    if (!chosen) void update({ petId: p.id });
  });
  return button;
}

let statusTimer = 0;
function saved(): void {
  status.textContent = 'Saved ✓';
  status.classList.add('show');
  clearTimeout(statusTimer);
  statusTimer = window.setTimeout(() => status.classList.remove('show'), 1200);
}

const basename = (p: string) => p.split(/[\\/]/).filter(Boolean).pop() ?? p;

function render(v: SettingsView): void {
  // An older running app sends no pets; show no picker rather than breaking the page.
  const pets = v.pets ?? [];
  petList.replaceChildren(...(pets.length > 1 ? pets.map((p) => petButton(p, p.id === v.petId)) : []));

  catScale.min = String(v.limits.catScale[0]);
  catScale.max = String(v.limits.catScale[1]);
  catScale.value = String(v.catScale);
  catScaleLabel.textContent = SIZE_NAMES[v.catScale] ?? `${v.catScale}×`;

  for (const id of checks) el<HTMLInputElement>(id).checked = v[id];
  for (const id of numbers) {
    const input = el<HTMLInputElement>(id);
    input.min = String(v.limits[id][0]);
    input.max = String(v.limits[id][1]);
    if (document.activeElement !== input) input.value = String(v[id]);
  }
  el<HTMLInputElement>('breakMinutes').disabled = !v.breakReminders;
  el<HTMLInputElement>('waterMinutes').disabled = !v.waterReminders;

  el<HTMLSpanElement>('repoCount').textContent = `(${v.repos.length})`;
  repoList.replaceChildren(
    ...v.repos.map((repo) => {
      const li = document.createElement('li');
      li.title = repo;
      const name = document.createElement('span');
      name.className = 'name';
      name.textContent = basename(repo);
      const remove = document.createElement('button');
      remove.className = 'remove';
      remove.textContent = '✕';
      remove.title = `Stop watching ${basename(repo)}`;
      remove.setAttribute('aria-label', remove.title);
      remove.addEventListener('click', async () => {
        render(await api.removeRepo(repo));
        saved();
      });
      li.append(name, remove);
      return li;
    }),
  );
}

async function update(patch: Partial<SettingsView>): Promise<void> {
  render(await api.update(patch));
  saved();
}

// Size: the pet on your desktop resizes live as you drag.
let sizeTimer = 0;
catScale.addEventListener('input', () => {
  const v = Number(catScale.value);
  catScaleLabel.textContent = SIZE_NAMES[v] ?? `${v}×`;
  clearTimeout(sizeTimer);
  sizeTimer = window.setTimeout(() => void update({ catScale: v }), 80);
});

for (const id of checks) {
  el<HTMLInputElement>(id).addEventListener('change', (e) => {
    void update({ [id]: (e.target as HTMLInputElement).checked });
  });
}

for (const id of numbers) {
  const input = el<HTMLInputElement>(id);
  input.addEventListener('change', () => {
    const v = Number(input.value);
    if (Number.isFinite(v)) void update({ [id]: v });
  });
  input.addEventListener('blur', () => void api.get().then(render)); // show the clamped value
}

el('addRepos').addEventListener('click', async () => {
  render(await api.addRepos());
  saved();
});
el('rescanRepos').addEventListener('click', async () => {
  render(await api.rescanRepos());
  saved();
});

api.onChanged(render);
api.get().then(render);

export {};
