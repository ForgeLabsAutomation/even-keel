'use strict';
/**
 * The only bridge between the UI and the computer. It exposes a handful of
 * narrow functions (load/save data, save/open a file, updates) and nothing else.
 */
const { contextBridge, ipcRenderer } = require('electron');

const fakeTodayArg = process.argv.find((a) => a.startsWith('--even-keel-fake-today='));

contextBridge.exposeInMainWorld('budgetApi', {
  loadData: () => ipcRenderer.invoke('data:load'),
  saveData: (json) => ipcRenderer.invoke('data:save', json),
  saveDataSync: (json) => ipcRenderer.sendSync('data:save-sync', json),
  saveFile: (options) => ipcRenderer.invoke('file:save', options),
  openFile: (options) => ipcRenderer.invoke('file:open', options),
  showDataFolder: () => ipcRenderer.invoke('app:show-data-folder'),
  getInfo: () => ipcRenderer.invoke('app:info'),
  updates: {
    getState: () => ipcRenderer.invoke('updates:get-state'),
    check: () => ipcRenderer.invoke('updates:check'),
    download: () => ipcRenderer.invoke('updates:download'),
    install: () => ipcRenderer.invoke('updates:install'),
    onState: (callback) => {
      const listener = (_event, state) => callback(state);
      ipcRenderer.on('updates:state', listener);
      return () => ipcRenderer.removeListener('updates:state', listener);
    },
  },
  fakeToday: fakeTodayArg ? fakeTodayArg.split('=')[1] : undefined,
});
