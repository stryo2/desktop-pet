import { contextBridge, ipcRenderer } from 'electron';

// Bridge for the settings window only.
contextBridge.exposeInMainWorld('settingsApi', {
  get: () => ipcRenderer.invoke('settings:get'),
  update: (patch: Record<string, unknown>) => ipcRenderer.invoke('settings:update', patch),
  addRepos: () => ipcRenderer.invoke('settings:addRepos'),
  rescanRepos: () => ipcRenderer.invoke('settings:rescanRepos'),
  removeRepo: (repo: string) => ipcRenderer.invoke('settings:removeRepo', repo),
  onChanged: (cb: (view: unknown) => void) => {
    ipcRenderer.on('settings:changed', (_e, view: unknown) => cb(view));
  },
});
