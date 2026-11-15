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
}

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
}

interface Window {
  petApi: PetApi;
}
