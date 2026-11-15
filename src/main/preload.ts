import { contextBridge, ipcRenderer } from 'electron';

// The only bridge between the page and the main process. Keep it small.
contextBridge.exposeInMainWorld('petApi', {
  loadPet: () => ipcRenderer.invoke('pet:load'),
  listPets: () => ipcRenderer.invoke('pet:list'),
  getState: () => ipcRenderer.invoke('pet:getState'),
  workAreaAt: (x: number, y: number) => ipcRenderer.invoke('pet:workAreaAt', { x, y }),
  setPosition: (x: number, y: number) => ipcRenderer.send('pet:setPosition', { x, y }),
  setIgnoreMouse: (ignore: boolean) => ipcRenderer.send('pet:setIgnoreMouse', ignore),
  showMenu: () => ipcRenderer.send('pet:showMenu'),
  setTrayIcon: (dataUrl: string) => ipcRenderer.send('pet:setTrayIcon', dataUrl),
  onDisplayChanged: (cb: () => void) => {
    ipcRenderer.on('pet:displayChanged', () => cb());
  },
});
