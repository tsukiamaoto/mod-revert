// ═══════════════════════════════════════════════════════════
// Mod Revert Tool - Renderer Process
// ═══════════════════════════════════════════════════════════

let scanResults = [];
let allSelected = false;
let isScanning = false;

// ─── Utility: Get timestamp ─────────────────────────────────
function getTimestamp() {
  const now = new Date();
  const h = String(now.getHours()).padStart(2, '0');
  const m = String(now.getMinutes()).padStart(2, '0');
  const s = String(now.getSeconds()).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

// ─── Log Functions ──────────────────────────────────────────
function addLog(message, type = 'info') {
  const logContent = document.getElementById('log-content');
  const entry = document.createElement('div');
  entry.className = 'log-entry';
  entry.innerHTML = `<span class="log-time">[${getTimestamp()}]</span> <span class="log-${type}">${message}</span>`;
  logContent.appendChild(entry);

  // Auto-scroll to bottom
  const container = document.getElementById('log-container');
  container.scrollTop = container.scrollHeight;
}

function clearLog() {
  document.getElementById('log-content').innerHTML = '';
}

// ─── Browse Folder ──────────────────────────────────────────
async function browseFolder() {
  const folderPath = await window.electronAPI.selectFolder();
  if (folderPath) {
    document.getElementById('folder-path').value = folderPath;
    document.getElementById('btn-scan').disabled = false;
    addLog(`已選擇資料夾: ${folderPath}`, 'info');
  }
}

// ─── Scan Folder ────────────────────────────────────────────
async function scanFolder() {
  const folderPath = document.getElementById('folder-path').value;
  if (!folderPath) {
    addLog('請先選擇資料夾', 'warning');
    return;
  }

  isScanning = true;
  const btnScan = document.getElementById('btn-scan');
  const btnStop = document.getElementById('btn-stop');
  const btnBrowse = document.getElementById('btn-browse');

  btnScan.style.display = 'none';
  btnStop.style.display = 'inline-flex';
  btnBrowse.disabled = true;

  clearLog();
  addLog('開始掃描資料夾...', 'info');

  try {
    const response = await window.electronAPI.scanFolder(folderPath);
    
    if (response.cancelled) {
      addLog('掃描已被手動終止', 'warning');
      document.getElementById('stats-text').textContent = '終止掃描';
      return;
    }

    scanResults = response.results;

    if (scanResults.length === 0) {
      addLog('未找到任何包含備份檔案的 mod.ini', 'warning');
      showPlaceholder('未找到可還原的 mod.ini 項目');
      document.getElementById('stats-text').textContent = '未找到項目';
    } else {
      addLog(`掃描完成！找到 ${scanResults.length} 個可還原項目`, 'success');
      renderResults(scanResults);
      document.getElementById('stats-text').textContent = `找到 ${scanResults.length} 個項目`;
      document.getElementById('btn-select-all').disabled = false;
      document.getElementById('btn-revert').disabled = false;
    }
  } catch (err) {
    addLog(`掃描失敗: ${err.message}`, 'error');
  } finally {
    isScanning = false;
    btnScan.style.display = 'inline-flex';
    btnStop.style.display = 'none';
    btnBrowse.disabled = false;
  }
}

// ─── Stop Scan ──────────────────────────────────────────────
function stopScan() {
  if (!isScanning) return;
  window.electronAPI.cancelScan();
  addLog('正在發送停止訊號...', 'warning');
}

// ─── Render Results ─────────────────────────────────────────
function renderResults(results) {
  const placeholder = document.getElementById('results-placeholder');
  const list = document.getElementById('results-list');

  placeholder.style.display = 'none';
  list.style.display = 'block';
  list.innerHTML = '';

  results.forEach((item, index) => {
    const div = document.createElement('div');
    div.className = 'result-item';
    div.style.animationDelay = `${index * 0.05}s`;

    // Shorten folder path for display
    const shortFolder = item.folder.length > 70
      ? '...' + item.folder.slice(-67)
      : item.folder;

    let backupSelector = '';
    if (item.backups.length === 1) {
      backupSelector = `<span class="result-backup-name">${item.backups[0]}</span>`;
    } else {
      const options = item.backups.map(b => `<option value="${b}">${b}</option>`).join('');
      backupSelector = `<select class="backup-select" data-index="${index}" onchange="updateSelectedBackup(${index}, this.value)">${options}</select>`;
    }

    div.innerHTML = `
      <input type="checkbox" class="result-checkbox" data-index="${index}" checked onchange="updateStats()">
      <div class="result-info">
        <div class="result-folder" title="${item.folder}">${shortFolder}</div>
        <div class="result-backup">備份: ${backupSelector}</div>
      </div>
    `;

    list.appendChild(div);

    // Set default selected backup
    item.selectedBackup = item.backups[0];
  });

  allSelected = true;
  updateStats();
}

function showPlaceholder(msg) {
  const placeholder = document.getElementById('results-placeholder');
  const list = document.getElementById('results-list');
  placeholder.style.display = 'flex';
  placeholder.innerHTML = `<span class="placeholder-icon">📭</span><span>${msg}</span>`;
  list.style.display = 'none';
}

// ─── Update Selected Backup ─────────────────────────────────
function updateSelectedBackup(index, value) {
  scanResults[index].selectedBackup = value;
}

// ─── Toggle Select All ─────────────────────────────────────
function toggleSelectAll() {
  allSelected = !allSelected;
  const checkboxes = document.querySelectorAll('.result-checkbox');
  checkboxes.forEach(cb => cb.checked = allSelected);
  document.getElementById('btn-select-all').textContent = allSelected ? '取消全選' : '全選';
  updateStats();
}

// ─── Update Stats ───────────────────────────────────────────
function updateStats() {
  const checkboxes = document.querySelectorAll('.result-checkbox');
  const checkedCount = Array.from(checkboxes).filter(cb => cb.checked).length;
  document.getElementById('stats-text').textContent = `已選擇 ${checkedCount} / ${scanResults.length} 個項目`;
  document.getElementById('btn-revert').disabled = checkedCount === 0;
}

// ─── Revert Selected ───────────────────────────────────────
async function revertSelected() {
  const checkboxes = document.querySelectorAll('.result-checkbox');
  const selectedItems = [];

  checkboxes.forEach((cb, i) => {
    if (cb.checked) {
      selectedItems.push(scanResults[i]);
    }
  });

  if (selectedItems.length === 0) {
    addLog('請先勾選要還原的項目', 'warning');
    return;
  }

  // Confirm
  const btnRevert = document.getElementById('btn-revert');
  btnRevert.disabled = true;
  btnRevert.innerHTML = '<span class="spinner"></span> 還原中...';

  addLog(`開始還原 ${selectedItems.length} 個項目...`, 'info');

  try {
    const logs = await window.electronAPI.revertMods(selectedItems);

    let successCount = 0;
    let failCount = 0;

    logs.forEach(log => {
      if (log.success) {
        successCount++;
        addLog(log.message, 'success');
      } else {
        failCount++;
        addLog(log.message, 'error');
      }
    });

    addLog(`還原完成！成功: ${successCount}, 失敗: ${failCount}`, successCount > 0 ? 'success' : 'error');
  } catch (err) {
    addLog(`還原過程發生錯誤: ${err.message}`, 'error');
  } finally {
    btnRevert.disabled = false;
    btnRevert.innerHTML = '<span class="btn-icon">↩</span> Revert';
  }
}

// ─── Initial Log ────────────────────────────────────────────
addLog('Mod Revert Tool 已啟動，請選擇資料夾開始操作', 'info');
