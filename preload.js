const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  getFolders: () => ipcRenderer.invoke('get-folders'),
  addFolder: (folderPath, autoSort) => ipcRenderer.invoke('add-folder', folderPath, autoSort),
  removeFolder: (folderPath) => ipcRenderer.invoke('remove-folder', folderPath),
  toggleAutoSort: (folderPath, autoSort) => ipcRenderer.invoke('toggle-autosort', folderPath, autoSort),
  
  getStats: () => ipcRenderer.invoke('get-stats'),
  getHistory: () => ipcRenderer.invoke('get-history'),
  getRules: () => ipcRenderer.invoke('get-rules'),
  saveRules: (rules) => ipcRenderer.invoke('save-rules', rules),
  
  getSystemSettings: () => ipcRenderer.invoke('get-system-settings'),
  saveSystemSettings: (settings) => ipcRenderer.invoke('save-system-settings', settings),
  
  scanFolder: (folderPath, previewOnly) => ipcRenderer.invoke('scan-folder', folderPath, previewOnly),
  sortPending: (files) => ipcRenderer.invoke('sort-pending', files),
  dismissPending: (files) => ipcRenderer.invoke('dismiss-pending', files),
  undoTransaction: (id) => ipcRenderer.invoke('undo-transaction', id),
  clearHistory: () => ipcRenderer.invoke('clear-history'),
  scanIdleFiles: (thresholdDays) => ipcRenderer.invoke('scan-idle-files', thresholdDays),
  cleanIdleFiles: (files, action) => ipcRenderer.invoke('clean-idle-files', files, action),
  showItemInFolder: (filePath) => ipcRenderer.invoke('show-item-in-folder', filePath),
  getFilePreview: (filePath) => ipcRenderer.invoke('get-file-preview', filePath),
  selectImage: () => ipcRenderer.invoke('select-image'),
  saveBackgroundImage: (filePath) => ipcRenderer.invoke('save-background-image', filePath),
  
  // Event listeners
  onPendingFilesUpdated: (callback) => ipcRenderer.on('pending-files-updated', (event, value) => callback(value)),
  onStatsUpdated: (callback) => ipcRenderer.on('stats-updated', (event, value) => callback(value)),
  onHistoryUpdated: (callback) => ipcRenderer.on('history-updated', (event, value) => callback(value)),
  onFileAutosorted: (callback) => ipcRenderer.on('file-autosorted', (event, value) => callback(value)),
  
  installUpdate: () => ipcRenderer.send('install-update'),
  onUpdateAvailable: (callback) => ipcRenderer.on('update-available', () => callback()),
  onUpdateDownloaded: (callback) => ipcRenderer.on('update-downloaded', () => callback())
});
