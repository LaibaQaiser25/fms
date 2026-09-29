// Bridge for setup/index.html only (the dashboard window gets no preload).
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('fmsSetup', {
  defaults: () => ipcRenderer.invoke('setup:defaults'),
  importFromServer: (serverUrl, token) => ipcRenderer.invoke('setup:import', { serverUrl, token }),
  startEmpty: () => ipcRenderer.invoke('setup:empty'),
  onProgress: (fn) => ipcRenderer.on('setup:progress', (_e, msg) => fn(msg)),
});
