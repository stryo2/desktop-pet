interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface PetDef {
  id: string;
  name: string;
  width: number;
  height: number;
  palette: Record<string, string | null>;
  frames: Record<string, string[]>;
  animations: Record<string, { frames: string[]; fps: number }>;
}

interface PetApi {
  loadPet(): Promise<PetDef>;
  listPets(): Promise<string[]>;
  getState(): Promise<{ bounds: Rect; workArea: Rect }>;
  workAreaAt(x: number, y: number): Promise<Rect>;
  setPosition(x: number, y: number): void;
  setIgnoreMouse(ignore: boolean): void;
  showMenu(): void;
  setTrayIcon(dataUrl: string): void;
  onDisplayChanged(cb: () => void): void;
}

interface Window {
  petApi: PetApi;
}
