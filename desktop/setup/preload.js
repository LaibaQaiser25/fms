// Bridge for setup/index.html only (the dashboard window gets no preload).
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('fmsSetup', {
  defaults: () => ipcRenderer.invoke('setup:defaults'),
  importFromServer: (serverUrl, code) => ipcRenderer.invoke('setup:import', { serverUrl, code }),
  startEmpty: () => ipcRenderer.invoke('setup:empty'),
  onProgress: (fn) => ipcRenderer.on('setup:progress', (_e, msg) => fn(msg)),
});

// Bridge for setup/rebuild.html only (T2.8: rebuild the online server).
contextBridge.exposeInMainWorld('fmsRebuild', {
  defaults: () => ipcRenderer.invoke('rebuild:defaults'),
  run: (serverUrl, code) => ipcRenderer.invoke('rebuild:run', { serverUrl, code }),
  onProgress: (fn) => ipcRenderer.on('rebuild:progress', (_e, msg) => fn(msg)),
});
