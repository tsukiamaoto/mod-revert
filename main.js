const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 650,
    minWidth: 700,
    minHeight: 500,
    frame: false,
    transparent: false,
    backgroundColor: '#1a1a2e',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    icon: path.join(__dirname, 'icon.png')
  });

  mainWindow.loadFile('index.html');
  // mainWindow.webContents.openDevTools();
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  app.quit();
});

// ─── IPC Handlers ─────────────────────────────────────────

// Open folder dialog
ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: '選擇 Mod 資料夾'
  });
  if (result.canceled) return null;
  return result.filePaths[0];
});

// Window controls
ipcMain.on('window-minimize', () => mainWindow.minimize());
ipcMain.on('window-maximize', () => {
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow.maximize();
  }
});
ipcMain.on('window-close', () => mainWindow.close());

// Scan state
let isScanning = false;
let cancelScanFlag = false;

ipcMain.on('cancel-scan', () => {
  cancelScanFlag = true;
});

// Scan for mod.ini and backup files
ipcMain.handle('scan-folder', async (event, folderPath) => {
  const results = [];
  isScanning = true;
  cancelScanFlag = false;

  async function scanDir(dir) {
    if (cancelScanFlag) return;
    try {
      const entries = await fs.promises.readdir(dir, { withFileTypes: true });
      const files = entries.filter(e => e.isFile()).map(e => e.name);
      const hasModIni = files.some(f => f.toLowerCase() === 'mod.ini');

      if (hasModIni) {
        // Find backup files specifically related to mod.ini
        let backupFiles = files.filter(f => {
          const lower = f.toLowerCase();
          return lower !== 'mod.ini' && lower.startsWith('mod.ini') && (
            lower.includes('bak') ||
            lower.includes('backup') ||
            lower.includes('.orig') ||
            lower.includes('.old')
          );
        });

        if (backupFiles.length > 0) {
          // Read mod.ini content once for comparison
          const modIniPath = path.join(dir, 'mod.ini');
          let modIniBuffer = null;
          try {
            modIniBuffer = fs.readFileSync(modIniPath);
          } catch (e) {}

          const backupsData = backupFiles.map(b => {
            let identical = false;
            let mtime = 0;
            try {
              const bPath = path.join(dir, b);
              const statB = fs.statSync(bPath);
              mtime = statB.mtimeMs;
              
              if (modIniBuffer) {
                const statMod = fs.statSync(modIniPath);
                // Fast path: if sizes differ, they are definitely different
                if (statMod.size === statB.size) {
                  // Deep comparison
                  const bBuffer = fs.readFileSync(bPath);
                  identical = modIniBuffer.equals(bBuffer);
                }
              }
            } catch (e) {}
            return { name: b, isIdentical: identical, mtimeMs: mtime };
          });

          // Sort backups by modification time (newest first)
          backupsData.sort((a, b) => b.mtimeMs - a.mtimeMs);

          results.push({
            folder: dir,
            modIni: 'mod.ini',
            backups: backupsData
          });
        }
      } // Close the outer hasModIni check
    
    // Recurse into subdirectories
      for (const entry of entries) {
        if (cancelScanFlag) return;
        if (entry.isDirectory()) {
          await scanDir(path.join(dir, entry.name));
        }
      }
    } catch (err) {
      // Skip directories we can't read
    }
  }

  await scanDir(folderPath);
  isScanning = false;
  return { results, cancelled: cancelScanFlag };
});

// Revert: replace mod.ini with backup content
ipcMain.handle('revert-mods', async (event, items) => {
  const logs = [];

  for (const item of items) {
    const modIniPath = path.join(item.folder, 'mod.ini');
    // Pick the selected backup file, or fallback
    const backupFile = item.selectedBackup || item.backups[0].name;
    const backupPath = path.join(item.folder, backupFile);

    try {
      // Read backup content
      const backupContent = fs.readFileSync(backupPath);
      // Write to mod.ini
      fs.writeFileSync(modIniPath, backupContent);
      logs.push({
        success: true,
        folder: item.folder,
        message: `✅ 已還原: ${backupFile} → mod.ini`
      });
    } catch (err) {
      logs.push({
        success: false,
        folder: item.folder,
        message: `❌ 還原失敗: ${err.message}`
      });
    }
  }

  return logs;
});
