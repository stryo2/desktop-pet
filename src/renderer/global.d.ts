interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface PetFrame {
  rows: string[];
  face?: [number, number];
}

interface PetDef {
  id: string;
  name: string;
  width: number;
  height: number;
  palette: Record<string, string | null>;
  frames: Record<string, PetFrame>;
  faces: Record<string, string[]>;
  animations: Record<string, { frames: string[]; fps: number }>;
}

/** 0–100 each. */
interface PetStats {
  energy: number;
  happiness: number;
  hydration: number;
}

interface SaveData {
  version: 1;
  petId: string;
  stats: PetStats;
  x: number | null;
  lastSeen: number; // ms timestamp
  timesPetted: number;
  streakCount: number;
  streakDay: string | null; // YYYY-MM-DD, local
  commitsToday: number;
  commitsDay: string | null;
}

/** Things happening in your day, sent by the main process. */
type PetEvent =
  | { type: 'away' }
  | { type: 'back'; minutes: number }
  | { type: 'breakDue'; activeMinutes: number }
  | { type: 'breakTaken' }
  | { type: 'waterDue' }
  | { type: 'lateNight' }
  | { type: 'commit'; repo: string; kind: 'commit' | 'amend' | 'merge' }
  | { type: 'push'; repo: string }
  | { type: 'reposFound'; count: number };

/** Things you can ask the cat to do from the tray / right-click menu. */
type MenuAction = 'water' | 'treat' | 'play' | 'nap';

interface PetApi {
  loadPet(): Promise<PetDef>;
  listPets(): Promise<string[]>;
  getState(): Promise<{ bounds: Rect; workArea: Rect }>;
  workAreaAt(x: number, y: number): Promise<Rect>;
  setPosition(x: number, y: number): void;
  setHitRect(r: Rect): void;
  setDragging(dragging: boolean): void;
  onHover(cb: (over: boolean) => void): void;
  showMenu(): void;
  setTrayIcon(dataUrl: string): void;
  onDisplayChanged(cb: () => void): void;
  loadSave(): Promise<SaveData | null>;
  save(data: SaveData): void;
  onAction(cb: (action: MenuAction) => void): void;
  onEvent(cb: (event: PetEvent) => void): void;
  ready(): void;
  waterAck(): void;
  getScale(): Promise<number>;
  onScale(cb: (msg: { scale: number; bounds: Rect }) => void): void;
}

interface Window {
  petApi: PetApi;
}
