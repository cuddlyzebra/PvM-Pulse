const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('tracker', {
  getProfile: () => ipcRenderer.invoke('profile:get'),
  // profileId is which saved profile the renderer believed was active when
  // this save was queued - see the staleness check in electron/main.js's
  // profile:save handler for why that matters (a debounced auto-save can
  // otherwise land after a profile switch and get applied to the wrong
  // profile).
  saveProfile: (profile, profileId) => ipcRenderer.invoke('profile:save', profile, profileId),
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
  },
  exportProfile: () => ipcRenderer.invoke('profile:export'),
  importProfile: () => ipcRenderer.invoke('profile:import'),
  // Multiple named saved profiles, switchable from inside the app - see the
  // "Multiple saved profiles" note in electron/profileStore.js. Distinct
  // from exportProfile/importProfile above, which move a profile to/from a
  // file rather than switching between profiles already saved locally.
  listSavedProfiles: () => ipcRenderer.invoke('profiles:list'),
  switchSavedProfile: (id) => ipcRenderer.invoke('profiles:switch', id),
  createSavedProfile: (name) => ipcRenderer.invoke('profiles:create', name),
  duplicateSavedProfile: (id, name) => ipcRenderer.invoke('profiles:duplicate', { id, name }),
  renameSavedProfile: (id, name) => ipcRenderer.invoke('profiles:rename', { id, name }),
  deleteSavedProfile: (id) => ipcRenderer.invoke('profiles:delete', id)
});
