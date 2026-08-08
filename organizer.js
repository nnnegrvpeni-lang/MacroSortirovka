const fs = require('fs');
const path = require('path');
const chokidar = require('chokidar');

class Organizer {
  constructor(store, sendToRenderer) {
    this.store = store;
    this.sendToRenderer = sendToRenderer;
    this.watchers = new Map(); // path -> chokidar watcher instance
    this.pendingFiles = new Map(); // path -> array of pending file objects
  }

  // Get extension mappings
  getCategory(fileName) {
    const ext = path.extname(fileName).toLowerCase();
    const rules = this.store.get('rules');
    
    for (const [category, extensions] of Object.entries(rules)) {
      if (extensions.includes(ext)) {
        return category;
      }
    }
    return 'Others';
  }

  // Generate a unique file path if it already exists
  getUniquePath(destPath) {
    const dir = path.dirname(destPath);
    const ext = path.extname(destPath);
    const name = path.basename(destPath, ext);
    let count = 1;
    let finalPath = destPath;
    
    while (fs.existsSync(finalPath)) {
      finalPath = path.join(dir, `${name} (${count})${ext}`);
      count++;
    }
    return finalPath;
  }

  // Organize a single file
  organizeFile(sourcePath, targetFolder) {
    try {
      if (!fs.existsSync(sourcePath)) {
        return { error: 'Файл не найден' };
      }
      const stats = fs.statSync(sourcePath);
      if (!stats.isFile()) {
        return { error: 'Это не файл (возможно, папка)' };
      }

      const fileName = path.basename(sourcePath);
      const category = this.getCategory(fileName);
      
      const destDir = path.join(targetFolder, category);
      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
      }

      const destPath = this.getUniquePath(path.join(destDir, fileName));
      
      try {
        fs.renameSync(sourcePath, destPath);
      } catch (renameError) {
        if (renameError.code === 'EXDEV') {
          // Cross-device fallback copy & unlink
          fs.copyFileSync(sourcePath, destPath);
          fs.unlinkSync(sourcePath);
        } else {
          throw renameError;
        }
      }

      return {
        original: sourcePath,
        current: destPath,
        size: stats.size,
        category: category,
        fileName: fileName
      };
    } catch (error) {
      console.error(`Error organizing file ${sourcePath}:`, error);
      return { error: error.message };
    }
  }

  // Scan and sort folder manually (or return preview items)
  scanFolder(folderPath, previewOnly = false) {
    const results = [];
    try {
      const items = fs.readdirSync(folderPath);
      
      for (const item of items) {
        const fullPath = path.join(folderPath, item);
        let stats;
        try {
          stats = fs.statSync(fullPath);
        } catch (e) {
          continue; // Skip files we cannot access
        }
        
        if (stats.isFile()) {
          const ext = path.extname(item).toLowerCase();
          if (ext === '.crdownload' || ext === '.download' || ext === '.tmp' || ext === '.part') {
            continue;
          }
          
          const category = this.getCategory(item);
          
          results.push({
            fileName: item,
            fullPath: fullPath,
            size: stats.size,
            category: category
          });
        }
      }

      if (previewOnly) {
        const pending = this.pendingFiles.get(folderPath) || [];
        for (const file of results) {
          if (!pending.some(f => f.fullPath === file.fullPath)) {
            pending.push({
              fileName: file.fileName,
              fullPath: file.fullPath,
              size: file.size,
              category: file.category,
              folderPath: folderPath,
              timestamp: Date.now()
            });
          }
        }
        this.pendingFiles.set(folderPath, pending);
        this.sendToRenderer('pending-files-updated', this.getFlattenedPending());
        return results;
      }

      // Perform manual sorting
      const sortedFiles = [];
      let totalBytes = 0;
      const categoryCounts = {};

      for (const file of results) {
        const res = this.organizeFile(file.fullPath, folderPath);
        if (res && !res.error) {
          sortedFiles.push(res);
          totalBytes += res.size;
          categoryCounts[res.category] = (categoryCounts[res.category] || 0) + 1;
        }
      }

      if (sortedFiles.length > 0) {
        const transaction = {
          id: 'manual-' + Date.now(),
          timestamp: Date.now(),
          folder: folderPath,
          files: sortedFiles
        };
        this.store.addHistory(transaction);
        this.store.updateStats(sortedFiles.length, totalBytes, categoryCounts);
        this.sendToRenderer('stats-updated', this.store.get('stats'));
        this.sendToRenderer('history-updated', this.store.get('history'));
      }

      return sortedFiles;
    } catch (error) {
      console.error(`Error scanning folder ${folderPath}:`, error);
      return [];
    }
  }

  // Setup watchers for all configured folders
  initWatchers() {
    const folders = this.store.get('folders') || [];
    for (const folder of folders) {
      this.startWatching(folder.path, folder.autoSort);
    }
  }

  // Start watching a folder
  startWatching(folderPath, autoSort) {
    if (this.watchers.has(folderPath)) {
      this.stopWatching(folderPath);
    }

    // Set up pending queue for this folder
    this.pendingFiles.set(folderPath, []);

    const watcher = chokidar.watch(folderPath, {
      depth: 0,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 1000,
        pollInterval: 100
      },
      ignored: (filePath) => {
        // Prevent watching inside category subfolders
        const relative = path.relative(folderPath, filePath);
        if (relative.includes(path.sep)) {
          return true; // it's in a subdirectory
        }
        
        // Ignore temporary downloading files
        const ext = path.extname(filePath).toLowerCase();
        if (ext === '.crdownload' || ext === '.download' || ext === '.tmp' || ext === '.part') {
          return true;
        }
        return false;
      }
    });

    watcher.on('add', (filePath) => {
      // Small timeout to ensure file isn't locked by OS (useful for Windows copy operations)
      setTimeout(() => {
        try {
          if (!fs.existsSync(filePath)) return;
          const stats = fs.statSync(filePath);
          if (!stats.isFile()) return;

          const fileName = path.basename(filePath);
          const category = this.getCategory(fileName);

          if (autoSort) {
            // Instant sorting
            const res = this.organizeFile(filePath, folderPath);
            if (res) {
              const transaction = {
                id: 'auto-' + Date.now(),
                timestamp: Date.now(),
                folder: folderPath,
                files: [res]
              };
              this.store.addHistory(transaction);
              this.store.updateStats(1, res.size, { [res.category]: 1 });
              this.sendToRenderer('stats-updated', this.store.get('stats'));
              this.sendToRenderer('history-updated', this.store.get('history'));
              this.sendToRenderer('file-autosorted', { fileName, category, folderPath });
            }
          } else {
            // Preview / Pending confirmation
            const pending = this.pendingFiles.get(folderPath) || [];
            // Prevent duplicates in pending list
            if (!pending.some(f => f.fullPath === filePath)) {
              const fileObj = {
                fileName,
                fullPath: filePath,
                size: stats.size,
                category,
                folderPath,
                timestamp: Date.now()
              };
              pending.push(fileObj);
              this.pendingFiles.set(folderPath, pending);
              this.sendToRenderer('pending-files-updated', this.getFlattenedPending());
            }
          }
        } catch (err) {
          console.error('Error handling added file:', err);
        }
      }, 500);
    });

    this.watchers.set(folderPath, watcher);
    console.log(`Started watching folder: ${folderPath} (AutoSort: ${autoSort})`);
  }

  // Stop watching a folder
  stopWatching(folderPath) {
    const watcher = this.watchers.get(folderPath);
    if (watcher) {
      watcher.close();
      this.watchers.delete(folderPath);
      this.pendingFiles.delete(folderPath);
      this.sendToRenderer('pending-files-updated', this.getFlattenedPending());
      console.log(`Stopped watching folder: ${folderPath}`);
    }
  }

  // Get all pending files across all folders
  getFlattenedPending() {
    const allPending = [];
    for (const [folderPath, files] of this.pendingFiles.entries()) {
      allPending.push(...files);
    }
    return allPending;
  }

  // Sort files from the pending queue
  sortPendingFiles(filesToSort) {
    const sortedFiles = [];
    const failedFiles = [];
    let totalBytes = 0;
    const categoryCounts = {};

    for (const fileObj of filesToSort) {
      const res = this.organizeFile(fileObj.fullPath, fileObj.folderPath);
      if (res && !res.error) {
        sortedFiles.push(res);
        totalBytes += res.size;
        categoryCounts[res.category] = (categoryCounts[res.category] || 0) + 1;

        // Remove from pending queue only on success!
        const pending = this.pendingFiles.get(fileObj.folderPath) || [];
        const index = pending.findIndex(f => f.fullPath === fileObj.fullPath);
        if (index > -1) {
          pending.splice(index, 1);
          this.pendingFiles.set(fileObj.folderPath, pending);
        }
      } else {
        failedFiles.push({
          fileName: fileObj.fileName,
          error: res ? res.error : 'Неизвестная ошибка'
        });
      }
    }

    if (sortedFiles.length > 0) {
      const transaction = {
        id: 'confirm-' + Date.now(),
        timestamp: Date.now(),
        files: sortedFiles
      };
      this.store.addHistory(transaction);
      this.store.updateStats(sortedFiles.length, totalBytes, categoryCounts);
      this.sendToRenderer('stats-updated', this.store.get('stats'));
      this.sendToRenderer('history-updated', this.store.get('history'));
    }

    this.sendToRenderer('pending-files-updated', this.getFlattenedPending());
    return {
      sorted: sortedFiles,
      failed: failedFiles
    };
  }

  // Dismiss files from the pending queue
  dismissPendingFiles(filesToDismiss) {
    for (const fileObj of filesToDismiss) {
      const pending = this.pendingFiles.get(fileObj.folderPath) || [];
      const index = pending.findIndex(f => f.fullPath === fileObj.fullPath);
      if (index > -1) {
        pending.splice(index, 1);
        this.pendingFiles.set(fileObj.folderPath, pending);
      }
    }
    this.sendToRenderer('pending-files-updated', this.getFlattenedPending());
  }

  // Undo a specific transaction
  undoTransaction(transactionId) {
    const history = this.store.get('history') || [];
    const index = history.findIndex(t => t.id === transactionId);
    
    if (index === -1) {
      throw new Error('Transaction not found');
    }

    const transaction = history[index];
    const restoredFiles = [];
    let restoredBytes = 0;
    const categoryCounts = {};

    for (const file of transaction.files) {
      try {
        if (fs.existsSync(file.current)) {
          // Resolve original destination conflict if there is one
          const origDir = path.dirname(file.original);
          if (!fs.existsSync(origDir)) {
            fs.mkdirSync(origDir, { recursive: true });
          }

          const rollbackPath = this.getUniquePath(file.original);
          fs.renameSync(file.current, rollbackPath);
          restoredFiles.push(file);
          restoredBytes += file.size;
          categoryCounts[file.category] = (categoryCounts[file.category] || 0) + 1;

          // If the folder we moved it to is now empty, let's remove it
          const currentDir = path.dirname(file.current);
          if (fs.existsSync(currentDir) && fs.readdirSync(currentDir).length === 0) {
            fs.rmdirSync(currentDir);
          }
        }
      } catch (err) {
        console.error(`Failed to undo file ${file.current}:`, err);
      }
    }

    // Remove transaction from history
    history.splice(index, 1);
    this.store.set('history', history);

    // Subtract from statistics
    const stats = this.store.get('stats');
    stats.totalFiles = Math.max(0, stats.totalFiles - restoredFiles.length);
    stats.totalBytes = Math.max(0, stats.totalBytes - restoredBytes);
    for (const [cat, count] of Object.entries(categoryCounts)) {
      stats.categoryCounts[cat] = Math.max(0, (stats.categoryCounts[cat] || 0) - count);
    }
    this.store.set('stats', stats);

    this.sendToRenderer('stats-updated', this.store.get('stats'));
    this.sendToRenderer('history-updated', this.store.get('history'));

    return restoredFiles;
  }

  // Scan monitored folders for idle/forgotten files older than thresholdDays
  scanIdleFiles(thresholdDays) {
    const folders = this.store.get('folders') || [];
    const idleFiles = [];
    const thresholdMs = thresholdDays * 24 * 60 * 60 * 1000;
    const now = Date.now();

    for (const folder of folders) {
      const folderPath = folder.path;
      if (!fs.existsSync(folderPath)) continue;

      try {
        const categories = ['Images', 'Documents', 'Audio', 'Video', 'Archives', 'Applications', 'Code', 'Others'];
        
        // 1. Scan files directly in monitored folder root
        const rootItems = fs.readdirSync(folderPath);
        for (const item of rootItems) {
          const fullPath = path.join(folderPath, item);
          try {
            const stats = fs.statSync(fullPath);
            if (stats.isFile()) {
              // Ignore temporary download files
              const ext = path.extname(item).toLowerCase();
              if (ext === '.crdownload' || ext === '.download' || ext === '.tmp' || ext === '.part') continue;

              const idleTime = now - stats.mtimeMs;
              if (idleTime >= thresholdMs) {
                idleFiles.push({
                  fileName: item,
                  fullPath: fullPath,
                  size: stats.size,
                  category: this.getCategory(item),
                  daysIdle: Math.floor(idleTime / (24 * 60 * 60 * 1000)),
                  folderPath: folderPath
                });
              }
            }
          } catch (e) {
            // Ignore locked or inaccessible files
          }
        }

        // 2. Scan files inside category directories
        for (const cat of categories) {
          const catDir = path.join(folderPath, cat);
          if (fs.existsSync(catDir)) {
            const catItems = fs.readdirSync(catDir);
            for (const item of catItems) {
              const fullPath = path.join(catDir, item);
              try {
                const stats = fs.statSync(fullPath);
                if (stats.isFile()) {
                  const idleTime = now - stats.mtimeMs;
                  if (idleTime >= thresholdMs) {
                    idleFiles.push({
                      fileName: item,
                      fullPath: fullPath,
                      size: stats.size,
                      category: cat,
                      daysIdle: Math.floor(idleTime / (24 * 60 * 60 * 1000)),
                      folderPath: folderPath
                    });
                  }
                }
              } catch (e) {
                // Ignore
              }
            }
          }
        }
      } catch (err) {
        console.error(`Error scanning idle files in ${folderPath}:`, err);
      }
    }
    return idleFiles;
  }

  // Clean the selected idle files by moving to Recycle Bin or Archive subfolder
  async cleanIdleFiles(files, action) {
    const { shell } = require('electron');
    const results = { success: 0, failed: 0, freedSize: 0 };

    for (const file of files) {
      if (!fs.existsSync(file.fullPath)) {
        results.failed++;
        continue;
      }

      try {
        if (action === 'delete') {
          // Move to Recycle Bin
          await shell.trashItem(file.fullPath);
          results.success++;
          results.freedSize += file.size;
        } else if (action === 'destroy') {
          // Permanent delete
          fs.unlinkSync(file.fullPath);
          results.success++;
          results.freedSize += file.size;
        } else if (action === 'archive') {
          // Move to monitored folder's Archive subfolder
          const archiveDir = path.join(file.folderPath, 'Archive');
          if (!fs.existsSync(archiveDir)) {
            fs.mkdirSync(archiveDir, { recursive: true });
          }
          const destPath = this.getUniquePath(path.join(archiveDir, file.fileName));
          fs.renameSync(file.fullPath, destPath);
          results.success++;
          results.freedSize += file.size;
        }
      } catch (err) {
        console.error(`Failed to clean file ${file.fullPath}:`, err);
        results.failed++;
      }
    }

    // Refresh pending files in case any deleted file was in the pending queue
    this.refreshPendingQueuesAfterCleanup(files);

    return results;
  }

  // Refresh pending queues if files in preview were deleted
  refreshPendingQueuesAfterCleanup(cleanedFiles) {
    const cleanedPaths = new Set(cleanedFiles.map(f => f.fullPath));
    let updated = false;

    for (const [folderPath, pending] of this.pendingFiles.entries()) {
      const filtered = pending.filter(f => !cleanedPaths.has(f.fullPath));
      if (filtered.length !== pending.length) {
        this.pendingFiles.set(folderPath, filtered);
        updated = true;
      }
    }

    if (updated) {
      this.sendToRenderer('pending-files-updated', this.getFlattenedPending());
    }
  }
}

module.exports = Organizer;
