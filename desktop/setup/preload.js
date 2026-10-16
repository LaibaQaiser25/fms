// Bridge for setup/index.html only (the dashboard window gets no preload).
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('fmsSetup', {
  defaults: () => ipcRenderer.invoke('setup:defaults'),
  importFromServer: (serverUrl, code) => ipcRenderer.invoke('setup:import', { serverUrl, code }),
  startEmpty: () => ipcRenderer.invoke('setup:empty'),
  onProgress: (fn) => ipcRenderer.on('setup:progress', (_e, msg) => fn(msg)),
});
