const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('tracker', {
  getProfile: () => ipcRenderer.invoke('profile:get'),
  saveProfile: (profile) => ipcRenderer.invoke('profile:save', profile),
  getOverlayUrl: () => ipcRenderer.invoke('overlay:get-url'),
  listAbilities: () => ipcRenderer.invoke('abilities:list'),
  pause: () => ipcRenderer.invoke('tracker:pause'),
  resume: () => ipcRenderer.invoke('tracker:resume'),
  onCastEvent: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('cast-event', listener);
    return () => ipcRenderer.removeListener('cast-event', listener);
  },
  setActiveStyleBar: (barId) => ipcRenderer.invoke('style-bar:set-active', barId),
  onStyleBarChanged: (callback) => {
    const listener = (_event, barId) => callback(barId);
    ipcRenderer.on('style-bar-changed', listener);
    return () => ipcRenderer.removeListener('style-bar-changed', listener);
  }
});
