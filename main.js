const { app, BrowserWindow, ipcMain, dialog, Tray, Menu, nativeImage, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const Store = require('./store');
const Organizer = require('./organizer');
const { autoUpdater } = require('electron-updater');

let mainWindow;
let store;
let organizer;
let tray; // Global tray reference to prevent garbage collection

// Default sorting rules
const defaultRules = {
  Images: ['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp', '.bmp', '.ico', '.heic', '.tiff', '.jfif'],
  Documents: ['.pdf', '.docx', '.doc', '.xlsx', '.xls', '.pptx', '.ppt', '.txt', '.rtf', '.odt', '.csv', '.md'],
  Audio: ['.mp3', '.wav', '.wma', '.ogg', '.m4a', '.flac', '.aac'],
  Video: ['.mp4', '.mkv', '.avi', '.mov', '.wmv', '.flv', '.webm'],
  Archives: ['.zip', '.rar', '.tar', '.gz', '.7z', '.iso'],
  Applications: ['.exe', '.msi', '.bat', '.cmd', '.sh'],
  Code: ['.js', '.ts', '.html', '.css', '.json', '.py', '.cpp', '.h', '.java', '.go', '.cs', '.php']
};

const defaultStats = {
  totalFiles: 0,
  totalBytes: 0,
  categoryCounts: {
    Images: 0,
    Documents: 0,
    Audio: 0,
    Video: 0,
    Archives: 0,
    Applications: 0,
    Code: 0,
    Others: 0
  }
};

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 750,
    minWidth: 900,
    minHeight: 600,
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    title: 'Macro Sorter Pro',
    backgroundColor: '#0b0f19',
    show: false
  });

  // Remove default menu bar for a cleaner look
  mainWindow.removeMenu();

  mainWindow.loadFile('index.html');

  // Support opening developer tools with F12 or Ctrl+Shift+I
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F12' || (input.control && input.shift && input.key.toLowerCase() === 'i')) {
      mainWindow.webContents.openDevTools();
      event.preventDefault();
    }
  });

  const isHidden = process.argv.includes('--hidden');

  mainWindow.once('ready-to-show', () => {
    if (!isHidden) {
      mainWindow.show();
    }
  });

  mainWindow.on('close', (event) => {
    const sysSettings = store.get('systemSettings') || { minimizeToTray: true };
    if (sysSettings.minimizeToTray && !app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', function () {
    mainWindow = null;
  });
}

// IPC event sender helper
function sendToRenderer(channel, data) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, data);
  }
}

function setAutostartConfig(enabled, hidden) {
  try {
    const exePath = process.env.PORTABLE_EXECUTABLE_PATH || app.getPath('exe');
    app.setLoginItemSettings({
      openAtLogin: enabled,
      path: exePath,
      args: enabled && hidden ? ['--hidden'] : []
    });
  } catch (err) {
    console.error('Failed to set autostart settings:', err);
  }
}

function createTray() {
  try {
    const iconPath = path.join(__dirname, 'icon.png');
    tray = new Tray(iconPath);
    
    const contextMenu = Menu.buildFromTemplate([
      { 
        label: 'Открыть Macro Sorter', 
        click: () => {
          if (mainWindow) {
            mainWindow.show();
          }
        } 
      },
      { type: 'separator' },
      { 
        label: 'Выход', 
        click: () => {
          app.isQuitting = true;
          app.quit();
        } 
      }
    ]);
    
    tray.setToolTip('Macro Sorter');
    tray.setContextMenu(contextMenu);
    
    tray.on('double-click', () => {
      if (mainWindow) {
        mainWindow.show();
      }
    });
  } catch (err) {
    console.error('Failed to create tray:', err);
  }
}

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
  // Initialize config store
  store = new Store({
    configName: 'user-settings',
    defaults: {
      folders: [],
      rules: defaultRules,
      stats: defaultStats,
      history: [],
      systemSettings: {
        autostart: false,
        autostartHidden: false,
        minimizeToTray: true,
        theme: {
          preset: 'space',
          colors: {
            primary: '#a78bfa',
            bgApp: '#090916',
            bgSidebar: '#101026',
            bgCard: '#1a1a3a',
            textMain: '#f3f4f6'
          }
        }
      }
    }
  });

  // Create tray icon
  createTray();

  // Initialize organizer engine
  organizer = new Organizer(store, sendToRenderer);
  organizer.initWatchers();

  // Sync autostart config with registry on startup to handle path updates
  const sysSettings = store.get('systemSettings');
  if (sysSettings) {
    setAutostartConfig(sysSettings.autostart || false, sysSettings.autostartHidden || false);
  }

  // Auto-updater setup and listeners
  autoUpdater.on('update-available', () => {
    sendToRenderer('update-available');
  });

  autoUpdater.on('update-downloaded', () => {
    sendToRenderer('update-downloaded');
  });

  ipcMain.on('install-update', () => {
    autoUpdater.quitAndInstall();
  });

  // Check for updates shortly after startup
  setTimeout(() => {
    autoUpdater.checkForUpdatesAndNotify().catch(err => console.error('AutoUpdate check failed:', err));
  }, 5000);

  // Handle IPC calls
  ipcMain.handle('get-system-settings', () => {
    return store.get('systemSettings') || { autostart: false, autostartHidden: false, minimizeToTray: true };
  });

  ipcMain.handle('save-system-settings', (event, settings) => {
    store.set('systemSettings', settings);
    setAutostartConfig(settings.autostart, settings.autostartHidden);
    return settings;
  });
  ipcMain.handle('select-folder', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory']
    });
    if (canceled) {
      return null;
    } else {
      return filePaths[0];
    }
  });

  ipcMain.handle('get-folders', () => {
    return store.get('folders');
  });

  ipcMain.handle('add-folder', (event, folderPath, autoSort) => {
    const folders = store.get('folders') || [];
    if (!folders.some(f => f.path === folderPath)) {
      folders.push({ path: folderPath, autoSort: autoSort });
      store.set('folders', folders);
      organizer.startWatching(folderPath, autoSort);
    }
    return folders;
  });

  ipcMain.handle('remove-folder', (event, folderPath) => {
    let folders = store.get('folders') || [];
    folders = folders.filter(f => f.path !== folderPath);
    store.set('folders', folders);
    organizer.stopWatching(folderPath);
    return folders;
  });

  ipcMain.handle('toggle-autosort', (event, folderPath, autoSort) => {
    const folders = store.get('folders') || [];
    const folder = folders.find(f => f.path === folderPath);
    if (folder) {
      folder.autoSort = autoSort;
      store.set('folders', folders);
      // Restart watcher with new autoSort setting
      organizer.startWatching(folderPath, autoSort);
    }
    return folders;
  });

  ipcMain.handle('get-stats', () => {
    return store.get('stats');
  });

  ipcMain.handle('get-history', () => {
    return store.get('history');
  });

  ipcMain.handle('get-rules', () => {
    return store.get('rules');
  });

  ipcMain.handle('save-rules', (event, newRules) => {
    store.set('rules', newRules);
    // Restart all watchers to apply new category rules
    organizer.initWatchers();
    return newRules;
  });

  ipcMain.handle('scan-folder', (event, folderPath, previewOnly) => {
    return organizer.scanFolder(folderPath, previewOnly);
  });

  ipcMain.handle('sort-pending', (event, files) => {
    return organizer.sortPendingFiles(files);
  });

  ipcMain.handle('dismiss-pending', (event, files) => {
    organizer.dismissPendingFiles(files);
    return true;
  });

  ipcMain.handle('undo-transaction', (event, transactionId) => {
    return organizer.undoTransaction(transactionId);
  });

  ipcMain.handle('clear-history', () => {
    store.set('history', []);
    sendToRenderer('history-updated', []);
    return [];
  });

  ipcMain.handle('scan-idle-files', (event, thresholdDays) => {
    return organizer.scanIdleFiles(thresholdDays);
  });

  ipcMain.handle('clean-idle-files', (event, files, action) => {
    return organizer.cleanIdleFiles(files, action);
  });

  ipcMain.handle('show-item-in-folder', (event, filePath) => {
    if (fs.existsSync(filePath)) {
      shell.showItemInFolder(filePath);
      return true;
    }
    return false;
  });

  ipcMain.handle('select-image', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp', 'bmp'] }]
    });
    if (canceled) return null;
    return filePaths[0];
  });

  ipcMain.handle('save-background-image', (event, filePath) => {
    try {
      const destDir = path.join(app.getPath('userData'), 'backgrounds');
      if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
      const destPath = path.join(destDir, 'current_bg' + path.extname(filePath));
      fs.copyFileSync(filePath, destPath);
      return destPath;
    } catch (e) {
      console.error('Failed to copy background image:', e);
      return null;
    }
  });

  ipcMain.handle('get-file-preview', (event, filePath) => {
    if (!fs.existsSync(filePath)) return null;
    try {
      const stats = fs.statSync(filePath);
      if (stats.size > 25 * 1024 * 1024) return null;

      const ext = path.extname(filePath).toLowerCase();
      const imageExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.ico', '.jfif'];
      if (!imageExts.includes(ext)) return null;

      const mimeTypes = {
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.jfif': 'image/jpeg',
        '.png': 'image/png',
        '.gif': 'image/gif',
        '.webp': 'image/webp',
        '.bmp': 'image/bmp',
        '.ico': 'image/x-icon'
      };

      const data = fs.readFileSync(filePath);
      const mime = mimeTypes[ext] || 'image/jpeg';
      return `data:${mime};base64,${data.toString('base64')}`;
    } catch (e) {
      console.error('Error loading image preview:', e);
      return null;
    }
  });

  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});
}
