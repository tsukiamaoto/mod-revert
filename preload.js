const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  selectFolder: (defaultPath) => ipcRenderer.invoke('select-folder', defaultPath),
  scanFolder: (folderPath) => ipcRenderer.invoke('scan-folder', folderPath),
  cancelScan: () => ipcRenderer.send('cancel-scan'),
  revertMods: (items) => ipcRenderer.invoke('revert-mods', items),
  minimizeWindow: () => ipcRenderer.send('window-minimize'),
  maximizeWindow: () => ipcRenderer.send('window-maximize'),
  closeWindow: () => ipcRenderer.send('window-close'),
});
