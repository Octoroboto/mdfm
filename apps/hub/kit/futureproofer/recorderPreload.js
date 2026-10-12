const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('recorder', {
  state: () => ipcRenderer.invoke('recorder:state'),
  skip: () => ipcRenderer.invoke('recorder:skip'),
  back: () => ipcRenderer.invoke('recorder:back'),
  finish: () => ipcRenderer.invoke('recorder:finish'),
  cancel: () => ipcRenderer.invoke('recorder:cancel'),
  reload: () => ipcRenderer.invoke('recorder:reload'),
  onUpdate: (cb) => ipcRenderer.on('recorder:update', (_e, s) => cb(s)),
});
