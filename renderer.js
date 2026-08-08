// Global state variables
let appFolders = [];
let pendingFiles = [];
let selectedFiles = new Set();
let cleanerFoundFiles = [];
let cleanerSelectedPaths = new Set();
let activeHoverPath = null;
let appStats = {};
let appRules = {};
let activeTab = 'dashboard';
let currentBgImageDataUrl = null;

// Category color mappings
const categoryDetails = {
  Images: { label: 'Изображения', color: '#8b5cf6', class: 'cat-images' },
  Documents: { label: 'Документы', color: '#3b82f6', class: 'cat-documents' },
  Audio: { label: 'Аудио', color: '#10b981', class: 'cat-audio' },
  Video: { label: 'Видео', color: '#06b6d4', class: 'cat-video' },
  Archives: { label: 'Архивы', color: '#f97316', class: 'cat-archives' },
  Applications: { label: 'Программы', color: '#ec4899', class: 'cat-applications' },
  Code: { label: 'Код', color: '#eab308', class: 'cat-code' },
  Others: { label: 'Другое', color: '#6b7280', class: 'cat-others' }
};

// --- DOM elements ---
const navButtons = document.querySelectorAll('.nav-btn');
const tabContents = document.querySelectorAll('.tab-content');
const pageTitle = document.getElementById('page-title');
const pageSubtitle = document.getElementById('page-subtitle');
const btnAddFolder = document.getElementById('btn-add-folder');
const btnAddFolderEmpty = document.getElementById('btn-add-folder-empty');
const toastContainer = document.getElementById('toast-container');

// Tab titles and subtitles
const tabDetails = {
  dashboard: { title: 'Панель управления', subtitle: 'Управление отслеживаемыми папками и автосортировкой' },
  preview: { title: 'Очередь превью', subtitle: 'Просмотр и подтверждение найденных файлов перед сортировкой' },
  history: { title: 'История операций', subtitle: 'Логи переносов файлов и отмена последних действий' },
  stats: { title: 'Аналитика и статистика', subtitle: 'Статистика по типам файлов и сохраненному дисковому пространству' },
  settings: { title: 'Настройки правил', subtitle: 'Настройка связей между расширениями файлов и папками категорий' },
  customization: { title: 'Кастомизация внешнего вида', subtitle: 'Настройка цветовой гаммы интерфейса и готовые темы' },
  cleaner: { title: 'Умная очистка диска', subtitle: 'Поиск и безопасное удаление или архивация забытых файлов' }
};

// --- Initial setup ---
document.addEventListener('DOMContentLoaded', async () => {
  initNavigation();
  initEventHandlers();
  await loadAppData();
  setupWatchersListeners();
});

// --- Navigation ---
function initNavigation() {
  navButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const tabId = btn.getAttribute('data-tab');
      switchTab(tabId);
    });
  });
}

function switchTab(tabId) {
  activeTab = tabId;
  
  // Update navigation buttons active state
  navButtons.forEach(btn => {
    if (btn.getAttribute('data-tab') === tabId) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  // Update tabs content visibility
  tabContents.forEach(tab => {
    if (tab.id === `tab-${tabId}`) {
      tab.classList.add('active');
    } else {
      tab.classList.remove('active');
    }
  });

  // Update page headers
  const details = tabDetails[tabId];
  if (details) {
    pageTitle.textContent = details.title;
    pageSubtitle.textContent = details.subtitle;
  }

  // Hide or show folder add button and clear history button in header
  const btnClearHistory = document.getElementById('btn-clear-history');
  if (tabId === 'dashboard') {
    btnAddFolder.style.display = 'inline-flex';
    if (btnClearHistory) btnClearHistory.style.display = 'none';
  } else if (tabId === 'history') {
    btnAddFolder.style.display = 'none';
    if (btnClearHistory) btnClearHistory.style.display = 'inline-flex';
  } else {
    btnAddFolder.style.display = 'none';
    if (btnClearHistory) btnClearHistory.style.display = 'none';
  }

  // Trigger animations/renders specific to the tab
  if (tabId === 'stats') {
    renderStatsCharts();
  }
}

// --- Load Data ---
async function loadAppData() {
  try {
    appFolders = await window.electronAPI.getFolders();
    appStats = await window.electronAPI.getStats();
    appRules = await window.electronAPI.getRules();
    
    renderFoldersGrid();
    renderStatsSummary();
    renderHistoryTab();
    renderSettingsTab();
    updatePreviewBadge();

    // Load and populate system settings & theme
    const sysSettings = await window.electronAPI.getSystemSettings();
    
    // Apply theme on load
    // Apply theme on load
    applyTheme(sysSettings.theme || { preset: 'space', colors: themePresets.space });
    
    const chkAutostart = document.getElementById('chk-autostart');
    const autostartModeContainer = document.getElementById('autostart-mode-container');
    const selAutostartMode = document.getElementById('sel-autostart-mode');
    const chkMinimizeToTray = document.getElementById('chk-minimize-to-tray');
    
    if (chkAutostart && autostartModeContainer && selAutostartMode && chkMinimizeToTray) {
      chkAutostart.checked = sysSettings.autostart || false;
      const autostartVal = sysSettings.autostartHidden ? 'hidden' : 'normal';
      selAutostartMode.value = autostartVal;
      
      // Sync custom select UI
      const customSelect = document.getElementById('autostart-mode-select');
      if (customSelect) {
        const selectedText = customSelect.querySelector('.select-selected-value');
        const optionElements = customSelect.querySelectorAll('.select-option');
        if (selectedText && optionElements.length > 0) {
          optionElements.forEach(opt => {
            if (opt.getAttribute('data-value') === autostartVal) {
              opt.classList.add('active');
              selectedText.textContent = opt.textContent;
            } else {
              opt.classList.remove('active');
            }
          });
        }
      }
      
      chkMinimizeToTray.checked = sysSettings.minimizeToTray !== false; // default true
      
      // Show/hide autostart mode container
      autostartModeContainer.style.display = chkAutostart.checked ? 'flex' : 'none';
      chkAutostart.addEventListener('change', () => {
        autostartModeContainer.style.display = chkAutostart.checked ? 'flex' : 'none';
      });
    }
    
    // Populate theme customization
    const currentTheme = sysSettings.theme || { preset: 'space', colors: themePresets.space };
    const colors = currentTheme.colors;
    const presetId = currentTheme.preset || 'custom';
    const bgImage = currentTheme.bgImage;
    
    // Set color values
    const colPrimary = document.getElementById('col-primary');
    if (colPrimary) {
      colPrimary.value = colors.primary;
      document.getElementById('col-bg-app').value = colors.bgApp;
      document.getElementById('col-bg-sidebar').value = colors.bgSidebar;
      document.getElementById('col-bg-card').value = colors.bgCard;
      document.getElementById('col-text-main').value = colors.textMain;
      
      // Set hex labels
      document.getElementById('lbl-primary').textContent = colors.primary;
      document.getElementById('lbl-bg-app').textContent = colors.bgApp;
      document.getElementById('lbl-bg-sidebar').textContent = colors.bgSidebar;
      document.getElementById('lbl-bg-card').textContent = colors.bgCard;
      document.getElementById('lbl-text-main').textContent = colors.textMain;
      
      // Set active preset button
      const presetBtns = document.querySelectorAll('.theme-preset-btn');
      presetBtns.forEach(btn => {
        if (btn.getAttribute('data-preset') === presetId) {
          btn.classList.add('active');
        } else {
          btn.classList.remove('active');
        }
      });
      
      // Initialize preview
      if (bgImage) {
        window.electronAPI.getFilePreview(bgImage).then(dataUrl => {
          if (dataUrl) updatePreview(colors, dataUrl);
        }).catch(() => updatePreview(colors));
      } else {
        updatePreview(colors);
      }
    }

    // Fetch and display app version
    const versionEl = document.getElementById('app-version');
    if (versionEl) {
      try {
        const ver = await window.electronAPI.getAppVersion();
        versionEl.textContent = `Версия ${ver}`;
      } catch (err) {
        console.error('Failed to get app version:', err);
      }
    }
  } catch (error) {
    showToast('Ошибка', 'Не удалось загрузить настройки приложения', 'warning');
    console.error(error);
  }
}

// --- Watcher Listeners ---
function setupWatchersListeners() {
  // Listen for real-time pending queue changes
  window.electronAPI.onPendingFilesUpdated((updatedPending) => {
    pendingFiles = updatedPending;
    renderPendingTable();
    updatePreviewBadge();
  });

  // Listen for real-time stats updates
  window.electronAPI.onStatsUpdated((updatedStats) => {
    appStats = updatedStats;
    renderStatsSummary();
    if (activeTab === 'stats') {
      renderStatsCharts();
    }
  });

  // Listen for history updates
  window.electronAPI.onHistoryUpdated(() => {
    renderHistoryTab();
  });

  // Listen for auto-sort notify
  window.electronAPI.onFileAutosorted(({ fileName, category, folderPath }) => {
    const catLabel = categoryDetails[category]?.label || category;
    showToast(
      'Файл отсортирован',
      `«${fileName}» перемещен в папку ${catLabel}`,
      'success'
    );
  });

  // Listen for auto-updater events
  window.electronAPI.onUpdateAvailable(() => {
    showToast('Обновление доступно', 'Найдена новая версия! Скачивание обновления запущено в фоне...', 'info');
  });

  window.electronAPI.onUpdateDownloaded(async () => {
    const confirmUpdate = await showConfirm(
      'Доступно обновление',
      'Новая версия Macro Sorter успешно скачана! Установить и перезапустить приложение сейчас?',
      'Обновить',
      'Позже'
    );
    if (confirmUpdate) {
      window.electronAPI.installUpdate();
    }
  });
}

// --- Render Watched Folders Grid ---
function renderFoldersGrid() {
  const foldersGrid = document.getElementById('folders-grid');
  const emptyState = document.getElementById('folders-empty-state');
  const countSpan = document.getElementById('folders-count');

  // Clear existing items but preserve empty state
  const folderCards = foldersGrid.querySelectorAll('.folder-card');
  folderCards.forEach(card => card.remove());

  countSpan.textContent = `${appFolders.length} папок`;

  if (appFolders.length === 0) {
    emptyState.style.display = 'flex';
    return;
  }

  emptyState.style.display = 'none';

  appFolders.forEach(folder => {
    const card = document.createElement('div');
    card.className = 'folder-card';
    
    // Extracted directory name
    const folderName = folder.path.split(/[\\/]/).pop() || folder.path;

    card.innerHTML = `
      <div class="folder-header">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
        </svg>
        <div class="folder-info">
          <div class="folder-name" title="${folderName}">${folderName}</div>
          <div class="folder-path" title="${folder.path}">${folder.path}</div>
        </div>
      </div>
      <div class="folder-settings">
        <div class="toggle-label">
          Автосортировка
          <span class="mode-desc">${folder.autoSort ? 'Фоновый авторежим' : 'Режим превью'}</span>
        </div>
        <label class="switch">
          <input type="checkbox" class="toggle-autosort-chk" ${folder.autoSort ? 'checked' : ''}>
          <span class="slider"></span>
        </label>
      </div>
      <div class="folder-actions-row">
        <button class="btn btn-secondary btn-sm btn-scan-folder">Сканировать</button>
        <button class="btn btn-danger btn-sm btn-remove-folder">Удалить</button>
      </div>
    `;

    // Toggle auto-sort listener
    const toggleChk = card.querySelector('.toggle-autosort-chk');
    toggleChk.addEventListener('change', async (e) => {
      const checked = e.target.checked;
      try {
        appFolders = await window.electronAPI.toggleAutoSort(folder.path, checked);
        const modeDesc = card.querySelector('.mode-desc');
        modeDesc.textContent = checked ? 'Фоновый авторежим' : 'Режим превью';
        showToast(
          'Настройки изменены',
          `Режим папки «${folderName}» изменен на ${checked ? 'автоматический' : 'ручное превью'}`,
          'info'
        );
      } catch (err) {
        showToast('Ошибка', 'Не удалось изменить режим папки', 'warning');
        toggleChk.checked = !checked; // revert
      }
    });

    // Manual scan listener
    const btnScan = card.querySelector('.btn-scan-folder');
    btnScan.addEventListener('click', async () => {
      btnScan.disabled = true;
      btnScan.textContent = 'Сканирование...';
      try {
        // If folders autoSort is false, we scan for preview only.
        // If true, it actually sorts right away.
        if (folder.autoSort) {
          const sorted = await window.electronAPI.scanFolder(folder.path, false);
          showToast(
            'Сканирование завершено',
            `Успешно отсортировано файлов: ${sorted.length}`,
            'success'
          );
        } else {
          // Scan for preview (pending files will update via events)
          await window.electronAPI.scanFolder(folder.path, true);
          showToast(
            'Сканирование завершено',
            'Новые файлы добавлены в очередь превью',
            'info'
          );
          switchTab('preview');
        }
      } catch (err) {
        showToast('Ошибка', 'Не удалось завершить сканирование папки', 'warning');
      } finally {
        btnScan.disabled = false;
        btnScan.textContent = 'Сканировать';
      }
    });

    // Remove folder listener
    const btnRemove = card.querySelector('.btn-remove-folder');
    btnRemove.addEventListener('click', async () => {
      const confirmed = await showConfirm(
        'Прекратить слежение',
        `Вы уверены, что хотите прекратить слежение за папкой «${folderName}»?`,
        'Удалить',
        'Отмена'
      );
      if (confirmed) {
        try {
          appFolders = await window.electronAPI.removeFolder(folder.path);
          renderFoldersGrid();
          showToast('Папка удалена', `Слежение за «${folderName}» прекращено`, 'info');
        } catch (err) {
          showToast('Ошибка', 'Не удалось удалить папку', 'warning');
        }
      }
    });

    foldersGrid.appendChild(card);
  });
}

// --- Render Pending Table ---
function renderPendingTable() {
  const container = document.getElementById('pending-list');
  const btnSort = document.getElementById('btn-sort-selected');
  const btnDismiss = document.getElementById('btn-dismiss-selected');
  const selectAllChk = document.getElementById('select-all-pending');
  const selectionText = document.getElementById('selection-text');

  // Clear list
  container.innerHTML = '';
  
  if (pendingFiles.length === 0) {
    selectedFiles.clear();
    selectAllChk.checked = false;
    btnSort.disabled = true;
    btnDismiss.disabled = true;
    selectionText.textContent = 'Выбрано: 0 из 0 файлов';
    
    container.innerHTML = `
      <div class="empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <circle cx="12" cy="12" r="10"></circle>
          <path d="M12 8v4"></path>
          <path d="M12 16h.01"></path>
        </svg>
        <p>Нет файлов, ожидающих ручной сортировки</p>
        <p class="sub-text">Переведите отслеживаемые папки в режим «Превью», чтобы файлы ожидали здесь вашего подтверждения.</p>
      </div>
    `;
    return;
  }

  // Render rows
  pendingFiles.forEach(file => {
    const row = document.createElement('div');
    row.className = 'pending-row';
    
    const cat = categoryDetails[file.category] || categoryDetails.Others;
    const isChecked = selectedFiles.has(file.fullPath);

    row.innerHTML = `
      <div class="col-check">
        <label class="custom-checkbox">
          <input type="checkbox" class="pending-row-chk" data-path="${file.fullPath}" ${isChecked ? 'checked' : ''}>
          <span class="checkmark"></span>
        </label>
      </div>
      <div class="col-name" title="${file.fileName}">${file.fileName}</div>
      <div class="col-source" title="${file.folderPath}">${pathBasename(file.folderPath)}</div>
      <div class="col-category">
        <span class="category-badge ${cat.class}">${cat.label}</span>
      </div>
      <div class="col-size">${formatBytes(file.size)}</div>
    `;

    // Row checkbox listener
    const chk = row.querySelector('.pending-row-chk');
    chk.addEventListener('change', (e) => {
      if (e.target.checked) {
        selectedFiles.add(file.fullPath);
      } else {
        selectedFiles.delete(file.fullPath);
      }
      updateSelectionUI();
    });

    container.appendChild(row);
  });

  updateSelectionUI();
}

function updateSelectionUI() {
  const btnSort = document.getElementById('btn-sort-selected');
  const btnDismiss = document.getElementById('btn-dismiss-selected');
  const selectAllChk = document.getElementById('select-all-pending');
  const selectionText = document.getElementById('selection-text');

  const selectedCount = selectedFiles.size;
  const totalCount = pendingFiles.length;

  selectionText.textContent = `Выбрано: ${selectedCount} из ${totalCount} файлов`;
  
  if (selectedCount > 0) {
    btnSort.disabled = false;
    btnDismiss.disabled = false;
  } else {
    btnSort.disabled = true;
    btnDismiss.disabled = true;
  }

  selectAllChk.checked = (selectedCount === totalCount && totalCount > 0);
}

function updatePreviewBadge() {
  const badge = document.getElementById('preview-badge');
  const count = pendingFiles.length;
  if (count > 0) {
    badge.textContent = count;
    badge.style.display = 'inline-block';
  } else {
    badge.style.display = 'none';
  }
}

// --- Render History Tab ---
async function renderHistoryTab() {
  const container = document.getElementById('history-timeline');
  let history = [];
  try {
    history = await window.electronAPI.getHistory();
  } catch (err) {
    console.error(err);
  }

  container.innerHTML = '';

  if (history.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <circle cx="12" cy="12" r="10"></circle>
          <polyline points="12 6 12 12 16 14"></polyline>
        </svg>
        <p>История сортировок пуста</p>
        <p class="sub-text">Здесь будут отображаться выполненные действия, с возможностью отмены.</p>
      </div>
    `;
    return;
  }

  history.forEach(item => {
    const card = document.createElement('div');
    card.className = 'history-card';

    // Format type
    let typeClass = 'manual';
    let typeText = 'Ручная сортировка';
    let iconSvg = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="23 4 23 10 17 10"></polyline>
        <polyline points="1 20 1 14 7 14"></polyline>
        <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
      </svg>
    `;

    if (item.id.startsWith('auto-')) {
      typeClass = 'auto';
      typeText = 'Автоматическая сортировка';
      iconSvg = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
        </svg>
      `;
    } else if (item.id.startsWith('confirm-')) {
      typeClass = 'confirm';
      typeText = 'Групповое подтверждение';
      iconSvg = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
      `;
    }

    const filesCount = item.files.length;
    const timeFormatted = formatTimestamp(item.timestamp);

    // Build files details list
    let detailsHtml = '';
    item.files.forEach(file => {
      const origName = file.fileName;
      // Get base destination path
      const destDirName = pathBasename(file.current.replace(file.fileName, ''));
      detailsHtml += `
        <div class="history-detail-item">
          <div class="file-move-paths">
            <span class="file-orig-name">${origName}</span>
            <span class="file-move-arrow">→</span>
            <span class="file-new-path" title="${file.current}">${file.category}/${origName}</span>
          </div>
          <span class="file-size-badge">${formatBytes(file.size)}</span>
        </div>
      `;
    });

    card.innerHTML = `
      <div class="history-card-header">
        <div class="history-title-block">
          <div class="history-icon-wrapper ${typeClass}">
            ${iconSvg}
          </div>
          <div class="history-main-info">
            <span class="history-action-text">${typeText} (${filesCount} ф.)</span>
            <span class="history-time">${timeFormatted}</span>
          </div>
        </div>
        <div class="history-card-actions">
          <button class="history-toggle-details">Подробнее</button>
          <button class="btn btn-secondary btn-sm btn-undo-action">Отменить</button>
        </div>
      </div>
      <div class="history-details-list">
        ${detailsHtml}
      </div>
    `;

    // Toggle details expand/collapse
    const btnDetails = card.querySelector('.history-toggle-details');
    const detailsList = card.querySelector('.history-details-list');
    btnDetails.addEventListener('click', () => {
      const isOpen = detailsList.classList.contains('open');
      if (isOpen) {
        detailsList.classList.remove('open');
        btnDetails.textContent = 'Подробнее';
      } else {
        detailsList.classList.add('open');
        btnDetails.textContent = 'Свернуть';
      }
    });

    // Undo action listener
    const btnUndo = card.querySelector('.btn-undo-action');
    btnUndo.addEventListener('click', async () => {
      btnUndo.disabled = true;
      btnUndo.textContent = 'Отмена...';
      try {
        const undone = await window.electronAPI.undoTransaction(item.id);
        showToast(
          'Операция отменена',
          `Успешно возвращено файлов: ${undone.length}`,
          'info'
        );
        // Refresh of history and stats will be triggered by events from main process!
      } catch (err) {
        showToast('Ошибка', 'Не удалось отменить операцию', 'warning');
        btnUndo.disabled = false;
        btnUndo.textContent = 'Отменить';
      }
    });

    container.appendChild(card);
  });
}

// --- Render Stats Tab & Charts ---
function renderStatsSummary() {
  const quickFiles = document.getElementById('quick-total-files');
  const quickSize = document.getElementById('quick-total-size');
  const statsFiles = document.getElementById('stats-total-files');
  const statsSize = document.getElementById('stats-total-size');

  const count = appStats.totalFiles || 0;
  const bytes = appStats.totalBytes || 0;

  if (quickFiles) quickFiles.textContent = count;
  if (quickSize) quickSize.textContent = formatBytes(bytes);
  if (statsFiles) statsFiles.textContent = count;
  if (statsSize) statsSize.textContent = formatBytes(bytes);
}

function renderStatsCharts() {
  const barsContainer = document.getElementById('category-bars-container');
  const donutCenterFiles = document.getElementById('donut-center-files');
  const donutSegment = document.getElementById('donut-segment-main');

  barsContainer.innerHTML = '';
  
  const total = appStats.totalFiles || 0;
  donutCenterFiles.textContent = total;

  // Donut chart stroke math
  // Circumference is 2 * PI * r (r=85) = ~534
  const circumference = 534;
  if (total === 0) {
    donutSegment.style.strokeDashoffset = circumference;
  } else {
    // Fill the donut with 100% since it represents all sorted files
    donutSegment.style.strokeDashoffset = 0;
  }

  // Get category distributions
  const counts = appStats.categoryCounts || {};
  
  // Sort categories by file count descending
  const sortedCategories = Object.keys(categoryDetails).sort((a, b) => {
    return (counts[b] || 0) - (counts[a] || 0);
  });

  sortedCategories.forEach(catKey => {
    const count = counts[catKey] || 0;
    const cat = categoryDetails[catKey];
    
    // Percent math
    const percent = total > 0 ? Math.round((count / total) * 100) : 0;

    const barItem = document.createElement('div');
    barItem.className = 'category-bar-item';
    barItem.innerHTML = `
      <div class="category-bar-info">
        <span class="category-bar-name">
          <span class="category-bar-dot" style="background-color: ${cat.color};"></span>
          ${cat.label}
        </span>
        <span class="category-bar-value">${count} ф. (${percent}%)</span>
      </div>
      <div class="bar-track">
        <div class="bar-fill" style="width: 0%; background-color: ${cat.color};"></div>
      </div>
    `;

    barsContainer.appendChild(barItem);

    // Animate bar width fill after append
    setTimeout(() => {
      const fill = barItem.querySelector('.bar-fill');
      if (fill) fill.style.width = `${percent}%`;
    }, 50);
  });
}

// --- Render Settings Tab ---
function renderSettingsTab() {
  const form = document.getElementById('settings-rules-form');
  
  // Find current input groups and remove them (keep actions section)
  const existingGroups = form.querySelectorAll('.form-group');
  existingGroups.forEach(g => g.remove());

  const actions = form.querySelector('.form-actions');

  // Generate input fields for rules categories
  for (const [category, extensions] of Object.entries(appRules)) {
    const group = document.createElement('div');
    group.className = 'form-group';

    const cat = categoryDetails[category] || { label: category };
    const extStr = extensions.join(', ');

    group.innerHTML = `
      <label for="rule-input-${category}">${cat.label}</label>
      <input type="text" id="rule-input-${category}" name="${category}" value="${extStr}">
    `;

    form.insertBefore(group, actions);
  }
}

// --- Event Handlers ---
function initEventHandlers() {
  // Folder Add click
  const selectAndAddFolder = async () => {
    try {
      const folderPath = await window.electronAPI.selectFolder();
      if (folderPath) {
        // By default, set autoSort to false (Preview Mode) to protect user files until they toggle it
        appFolders = await window.electronAPI.addFolder(folderPath, false);
        renderFoldersGrid();
        showToast('Папка добавлена', `Слежение за папкой настроено в режиме превью`, 'success');
      }
    } catch (err) {
      showToast('Ошибка', 'Не удалось добавить папку для слежения', 'warning');
    }
  };

  btnAddFolder.addEventListener('click', selectAndAddFolder);
  btnAddFolderEmpty.addEventListener('click', selectAndAddFolder);

  // Select all pending checkbox
  const selectAllChk = document.getElementById('select-all-pending');
  selectAllChk.addEventListener('change', (e) => {
    const checked = e.target.checked;
    const rowChks = document.querySelectorAll('.pending-row-chk');
    
    if (checked) {
      pendingFiles.forEach(file => selectedFiles.add(file.fullPath));
      rowChks.forEach(chk => chk.checked = true);
    } else {
      selectedFiles.clear();
      rowChks.forEach(chk => chk.checked = false);
    }
    updateSelectionUI();
  });

  // Sort selected pending button
  const btnSort = document.getElementById('btn-sort-selected');
  btnSort.addEventListener('click', async () => {
    btnSort.disabled = true;
    btnSort.textContent = 'Обработка...';
    try {
      // Filter pending list by selections
      const filesToSort = pendingFiles.filter(f => selectedFiles.has(f.fullPath));
      const result = await window.electronAPI.sortPending(filesToSort);
      
      selectedFiles.clear();
      
      if (result.sorted && result.sorted.length > 0) {
        showToast(
          'Файлы отсортированы',
          `Успешно перемещено файлов: ${result.sorted.length}`,
          'success'
        );
      }
      
      if (result.failed && result.failed.length > 0) {
        const failedNames = result.failed.map(f => f.fileName).slice(0, 3).join(', ') + 
                            (result.failed.length > 3 ? ` и еще ${result.failed.length - 3} ф.` : '');
        showToast(
          'Ошибка сортировки',
          `Не удалось перенести: ${failedNames}. Возможно, файлы открыты в другой программе.`,
          'warning'
        );
      }
    } catch (err) {
      showToast('Ошибка', 'Не удалось выполнить ручную сортировку', 'warning');
    } finally {
      btnSort.disabled = false;
      btnSort.textContent = 'Сортировать выбранное';
    }
  });

  // Dismiss selected pending button
  const btnDismiss = document.getElementById('btn-dismiss-selected');
  btnDismiss.addEventListener('click', async () => {
    try {
      const filesToDismiss = pendingFiles.filter(f => selectedFiles.has(f.fullPath));
      await window.electronAPI.dismissPending(filesToDismiss);
      selectedFiles.clear();
      showToast('Очередь очищена', 'Выбранные файлы удалены из списка ожидания', 'info');
    } catch (err) {
      showToast('Ошибка', 'Не удалось очистить очередь файлов', 'warning');
    }
  });

  // Rules form save submit
  const formRules = document.getElementById('settings-rules-form');
  formRules.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const formData = new FormData(formRules);
    const newRules = {};
    
    for (const [key, value] of formData.entries()) {
      // Split by comma, trim whitespace, filter empty, ensure starting dot
      newRules[key] = value.split(',')
        .map(ext => ext.trim().toLowerCase())
        .filter(ext => ext.length > 0)
        .map(ext => ext.startsWith('.') ? ext : '.' + ext);
    }

    try {
      appRules = await window.electronAPI.saveRules(newRules);
      showToast('Настройки сохранены', 'Новые правила распределения успешно применены', 'success');
    } catch (err) {
      showToast('Ошибка', 'Не удалось сохранить правила', 'warning');
    }
  });

  // Rules form reset to default button
  const btnResetRules = document.getElementById('btn-reset-rules');
  btnResetRules.addEventListener('click', () => {
    if (confirm('Сбросить правила к настройкам по умолчанию?')) {
      // Standard rules mapping
      const defaultRules = {
        Images: ['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp', '.bmp', '.ico', '.heic', '.tiff'],
        Documents: ['.pdf', '.docx', '.doc', '.xlsx', '.xls', '.pptx', '.ppt', '.txt', '.rtf', '.odt', '.csv', '.md'],
        Audio: ['.mp3', '.wav', '.wma', '.ogg', '.m4a', '.flac', '.aac'],
        Video: ['.mp4', '.mkv', '.avi', '.mov', '.wmv', '.flv', '.webm'],
        Archives: ['.zip', '.rar', '.tar', '.gz', '.7z', '.iso'],
        Applications: ['.exe', '.msi', '.bat', '.cmd', '.sh'],
        Code: ['.js', '.ts', '.html', '.css', '.json', '.py', '.cpp', '.h', '.java', '.go', '.cs', '.php']
      };
      
      // Populate fields
      for (const [category, extensions] of Object.entries(defaultRules)) {
        const input = document.getElementById(`rule-input-${category}`);
        if (input) {
          input.value = extensions.join(', ');
        }
      }
    }
  });

  // Save system settings click handler
  const btnSaveSystem = document.getElementById('btn-save-system-settings');
  if (btnSaveSystem) {
    btnSaveSystem.addEventListener('click', async () => {
      btnSaveSystem.disabled = true;
      btnSaveSystem.textContent = 'Сохранение...';
      
      try {
        const sysSettings = await window.electronAPI.getSystemSettings();
        const settings = {
          ...sysSettings,
          autostart: document.getElementById('chk-autostart').checked,
          autostartHidden: document.getElementById('sel-autostart-mode').value === 'hidden',
          minimizeToTray: document.getElementById('chk-minimize-to-tray').checked
        };
        
        await window.electronAPI.saveSystemSettings(settings);
        showToast('Настройки сохранены', 'Системные настройки успешно обновлены', 'success');
      } catch (err) {
        showToast('Ошибка', 'Не удалось сохранить системные настройки', 'warning');
      } finally {
        btnSaveSystem.disabled = false;
        btnSaveSystem.textContent = 'Сохранить системные настройки';
      }
    });
  }

  // Preset buttons click handler
  const presetBtns = document.querySelectorAll('.theme-preset-btn');
  presetBtns.forEach(btn => {
    btn.addEventListener('click', async () => {
      presetBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      const presetId = btn.getAttribute('data-preset');
      const colors = themePresets[presetId];
      if (colors) {
        // Update color pickers
        document.getElementById('col-primary').value = colors.primary;
        document.getElementById('col-bg-app').value = colors.bgApp;
        document.getElementById('col-bg-sidebar').value = colors.bgSidebar;
        document.getElementById('col-bg-card').value = colors.bgCard;
        document.getElementById('col-text-main').value = colors.textMain;
        
        // Update hex labels
        document.getElementById('lbl-primary').textContent = colors.primary;
        document.getElementById('lbl-bg-app').textContent = colors.bgApp;
        document.getElementById('lbl-bg-sidebar').textContent = colors.bgSidebar;
        document.getElementById('lbl-bg-card').textContent = colors.bgCard;
        document.getElementById('lbl-text-main').textContent = colors.textMain;
        
        // Remove custom background image if any and apply preset
        const sysSettings = await window.electronAPI.getSystemSettings();
        if (sysSettings.theme) {
          delete sysSettings.theme.bgImage;
          sysSettings.theme.preset = presetId;
          sysSettings.theme.colors = colors;
        } else {
          sysSettings.theme = { preset: presetId, colors: colors };
        }
        await window.electronAPI.saveSystemSettings(sysSettings);
        applyTheme(sysSettings.theme);
        updatePreview(colors, null);
      }
    });
  });

  // Individual color pickers inputs
  const colorInputs = ['col-primary', 'col-bg-app', 'col-bg-sidebar', 'col-bg-card', 'col-text-main'];
  colorInputs.forEach(id => {
    const input = document.getElementById(id);
    if (input) {
      input.addEventListener('input', async () => {
        // Remove active class from presets since it's now custom
        presetBtns.forEach(b => b.classList.remove('active'));
        
        const labelId = 'lbl-' + id.replace('col-', '');
        const label = document.getElementById(labelId);
        if (label) {
          label.textContent = input.value;
        }
        
        // Read all values and update preview
        const colors = {
          primary: document.getElementById('col-primary').value,
          bgApp: document.getElementById('col-bg-app').value,
          bgSidebar: document.getElementById('col-bg-sidebar').value,
          bgCard: document.getElementById('col-bg-card').value,
          textMain: document.getElementById('col-text-main').value
        };
        
        const sysSettings = await window.electronAPI.getSystemSettings();
        const currentBgImage = sysSettings.theme ? sysSettings.theme.bgImage : null;
        if (currentBgImage) {
          window.electronAPI.getFilePreview(currentBgImage).then(dataUrl => {
            updatePreview(colors, dataUrl);
          });
        } else {
          updatePreview(colors, null);
        }
      });
    }
  });

  // Save theme click
  const btnSaveTheme = document.getElementById('btn-save-theme');
  if (btnSaveTheme) {
    btnSaveTheme.addEventListener('click', async () => {
      btnSaveTheme.disabled = true;
      btnSaveTheme.textContent = 'Сохранение...';
      
      const activePresetBtn = document.querySelector('.theme-preset-btn.active');
      const presetId = activePresetBtn ? activePresetBtn.getAttribute('data-preset') : 'custom';
      
      const themeColors = {
        primary: document.getElementById('col-primary').value,
        bgApp: document.getElementById('col-bg-app').value,
        bgSidebar: document.getElementById('col-bg-sidebar').value,
        bgCard: document.getElementById('col-bg-card').value,
        textMain: document.getElementById('col-text-main').value
      };
      
      try {
        const sysSettings = await window.electronAPI.getSystemSettings();
        const currentBgImage = sysSettings.theme ? sysSettings.theme.bgImage : null;
        sysSettings.theme = {
          preset: presetId,
          colors: themeColors,
          bgImage: currentBgImage
        };
        
        await window.electronAPI.saveSystemSettings(sysSettings);
        applyTheme(sysSettings.theme);
        showToast('Тема обновлена', 'Цветовая схема успешно применена ко всему приложению', 'success');
      } catch (err) {
        showToast('Ошибка', 'Не удалось сохранить тему', 'warning');
      } finally {
        btnSaveTheme.disabled = false;
        btnSaveTheme.textContent = 'Применить и сохранить';
      }
    });
  }

  // Reset theme click
  const btnResetTheme = document.getElementById('btn-reset-theme');
  if (btnResetTheme) {
    btnResetTheme.addEventListener('click', () => {
      const spacePreset = document.querySelector('.theme-preset-btn[data-preset="space"]');
      if (spacePreset) {
        spacePreset.click();
      }
    });
  }

  // Background Image Select Click
  const btnSelectBg = document.getElementById('btn-select-bg-image');
  if (btnSelectBg) {
    btnSelectBg.addEventListener('click', async () => {
      try {
        const selectedPath = await window.electronAPI.selectImage();
        if (!selectedPath) return;
        
        btnSelectBg.disabled = true;
        btnSelectBg.textContent = 'Обработка...';
        
        const savedPath = await window.electronAPI.saveBackgroundImage(selectedPath);
        if (!savedPath) {
          showToast('Ошибка', 'Не удалось сохранить изображение', 'warning');
          return;
        }
        
        const dataUrl = await window.electronAPI.getFilePreview(savedPath);
        if (!dataUrl) {
          showToast('Ошибка', 'Не удалось загрузить изображение', 'warning');
          return;
        }
        
        const tempImg = new Image();
        tempImg.src = dataUrl;
        tempImg.onload = async () => {
          currentBgImageDataUrl = dataUrl;
          const extractedColors = extractThemeFromImage(tempImg);
          
          document.getElementById('col-primary').value = extractedColors.primary;
          document.getElementById('col-bg-app').value = extractedColors.bgApp;
          document.getElementById('col-bg-sidebar').value = extractedColors.bgSidebar;
          document.getElementById('col-bg-card').value = extractedColors.bgCard;
          document.getElementById('col-text-main').value = extractedColors.textMain;
          
          document.getElementById('lbl-primary').textContent = extractedColors.primary;
          document.getElementById('lbl-bg-app').textContent = extractedColors.bgApp;
          document.getElementById('lbl-bg-sidebar').textContent = extractedColors.bgSidebar;
          document.getElementById('lbl-bg-card').textContent = extractedColors.bgCard;
          document.getElementById('lbl-text-main').textContent = extractedColors.textMain;
          
          presetBtns.forEach(b => b.classList.remove('active'));
          
          const sysSettings = await window.electronAPI.getSystemSettings();
          sysSettings.theme = {
            preset: 'custom',
            colors: extractedColors,
            bgImage: savedPath
          };
          
          await window.electronAPI.saveSystemSettings(sysSettings);
          applyTheme(sysSettings.theme);
          updatePreview(extractedColors, dataUrl);
          
          showToast('Тема создана по фото', 'Цвета интерфейса идеально адаптированы под изображение!', 'success');
        };
      } catch (err) {
        console.error(err);
        showToast('Ошибка', 'Не удалось обработать изображение', 'warning');
      } finally {
        btnSelectBg.disabled = false;
        btnSelectBg.innerHTML = `
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 16px; height: 16px; margin-right: 6px;">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
            <circle cx="8.5" cy="8.5" r="1.5"></circle>
            <polyline points="21 15 16 10 5 21"></polyline>
          </svg>
          Выбрать фото
        `;
      }
    });
  }

  // Background Image Remove Click
  const btnRemoveBg = document.getElementById('btn-remove-bg-image');
  if (btnRemoveBg) {
    btnRemoveBg.addEventListener('click', async () => {
      try {
        const sysSettings = await window.electronAPI.getSystemSettings();
        if (sysSettings.theme) {
          delete sysSettings.theme.bgImage;
        }
        
        await window.electronAPI.saveSystemSettings(sysSettings);
        applyTheme(sysSettings.theme);
        
        const colors = sysSettings.theme ? sysSettings.theme.colors : themePresets.space;
        updatePreview(colors, null);
        
        showToast('Изображение удалено', 'Фон приложения сброшен к стандартному цвету', 'info');
      } catch (err) {
        console.error(err);
        showToast('Ошибка', 'Не удалось удалить фоновое изображение', 'warning');
      }
    });
  }

  // Custom dropdown behavior
  const customSelect = document.getElementById('autostart-mode-select');
  if (customSelect) {
    const trigger = customSelect.querySelector('.select-trigger');
    const optionsContainer = customSelect.querySelector('.select-options');
    const selectedText = customSelect.querySelector('.select-selected-value');
    const hiddenInput = document.getElementById('sel-autostart-mode');
    const optionElements = customSelect.querySelectorAll('.select-option');
    
    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      customSelect.classList.toggle('open');
      optionsContainer.style.display = customSelect.classList.contains('open') ? 'block' : 'none';
    });
    
    optionElements.forEach(opt => {
      opt.addEventListener('click', (e) => {
        e.stopPropagation();
        const val = opt.getAttribute('data-value');
        hiddenInput.value = val;
        selectedText.textContent = opt.textContent;
        
        optionElements.forEach(o => o.classList.remove('active'));
        opt.classList.add('active');
        
        customSelect.classList.remove('open');
        optionsContainer.style.display = 'none';
      });
    });
    
    window.addEventListener('click', () => {
      customSelect.classList.remove('open');
      optionsContainer.style.display = 'none';
    });
  }

  // Clear history click handler
  const btnClearHistory = document.getElementById('btn-clear-history');
  if (btnClearHistory) {
    btnClearHistory.addEventListener('click', async () => {
      const confirmClear = await showConfirm(
        'Очистка истории',
        'Вы уверены, что хотите полностью очистить историю операций? Это действие нельзя отменить.',
        'Очистить',
        'Отмена'
      );
      if (!confirmClear) return;
      
      btnClearHistory.disabled = true;
      btnClearHistory.textContent = 'Очистка...';
      
      try {
        await window.electronAPI.clearHistory();
        showToast('История очищена', 'Все логи операций были успешно удалены', 'success');
        // Refresh the history tab display
        renderHistoryTab();
      } catch (err) {
        showToast('Ошибка', 'Не удалось очистить историю операций', 'warning');
      } finally {
        btnClearHistory.disabled = false;
        btnClearHistory.innerHTML = `
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 16px; height: 16px; margin-right: 6px; vertical-align: middle;">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          </svg>
          Очистить логи
        `;
      }
    });
  }

  // Cleaner threshold select
  const cleanerThresholdSelect = document.getElementById('cleaner-threshold-select');
  if (cleanerThresholdSelect) {
    const trigger = cleanerThresholdSelect.querySelector('.select-trigger');
    const optionsContainer = cleanerThresholdSelect.querySelector('.select-options');
    const selectedText = cleanerThresholdSelect.querySelector('.select-selected-value');
    const hiddenInput = document.getElementById('sel-cleaner-threshold');
    const optionElements = cleanerThresholdSelect.querySelectorAll('.select-option');
    
    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      cleanerThresholdSelect.classList.toggle('open');
      optionsContainer.style.display = cleanerThresholdSelect.classList.contains('open') ? 'block' : 'none';
    });
    
    optionElements.forEach(opt => {
      opt.addEventListener('click', (e) => {
        e.stopPropagation();
        const val = opt.getAttribute('data-value');
        hiddenInput.value = val;
        selectedText.textContent = opt.textContent;
        
        optionElements.forEach(o => o.classList.remove('active'));
        opt.classList.add('active');
        
        cleanerThresholdSelect.classList.remove('open');
        optionsContainer.style.display = 'none';
      });
    });
    
    window.addEventListener('click', () => {
      cleanerThresholdSelect.classList.remove('open');
      optionsContainer.style.display = 'none';
    });
  }

  // Cleaner action select
  const cleanerActionSelect = document.getElementById('cleaner-action-select');
  if (cleanerActionSelect) {
    const trigger = cleanerActionSelect.querySelector('.select-trigger');
    const optionsContainer = cleanerActionSelect.querySelector('.select-options');
    const selectedText = cleanerActionSelect.querySelector('.select-selected-value');
    const hiddenInput = document.getElementById('sel-cleaner-action');
    const optionElements = cleanerActionSelect.querySelectorAll('.select-option');
    
    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      cleanerActionSelect.classList.toggle('open');
      optionsContainer.style.display = cleanerActionSelect.classList.contains('open') ? 'block' : 'none';
    });
    
    optionElements.forEach(opt => {
      opt.addEventListener('click', (e) => {
        e.stopPropagation();
        const val = opt.getAttribute('data-value');
        hiddenInput.value = val;
        selectedText.textContent = opt.textContent;
        
        optionElements.forEach(o => o.classList.remove('active'));
        opt.classList.add('active');
        
        cleanerActionSelect.classList.remove('open');
        optionsContainer.style.display = 'none';
      });
    });
    
    window.addEventListener('click', () => {
      cleanerActionSelect.classList.remove('open');
      optionsContainer.style.display = 'none';
    });
  }

  // Scan Cleaner Button
  const btnScanClean = document.getElementById('btn-start-clean-scan');
  if (btnScanClean) {
    btnScanClean.addEventListener('click', async () => {
      btnScanClean.disabled = true;
      btnScanClean.innerHTML = `
        <svg class="spinner" viewBox="0 0 50 50" style="width: 18px; height: 18px; margin-right: 8px; animation: rotate 2s linear infinite; vertical-align: middle;">
          <circle cx="25" cy="25" r="20" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" style="stroke-dasharray: 1, 150; stroke-dashoffset: 0; animation: dash 1.5s ease-in-out infinite;"></circle>
        </svg>
        Сканирование...
      `;
      
      const percentLbl = document.getElementById('cleaner-percent');
      const progressRing = document.getElementById('cleaner-progress-ring');
      const foundLbl = document.getElementById('lbl-cleaner-found-count');
      
      percentLbl.textContent = '0%';
      progressRing.style.strokeDashoffset = '364.4';
      foundLbl.textContent = 'Сканирование...';
      
      let progress = 0;
      const progressInterval = setInterval(() => {
        progress += Math.floor(Math.random() * 15) + 5;
        if (progress > 85) {
          clearInterval(progressInterval);
        } else {
          percentLbl.textContent = `${progress}%`;
          const offset = 364.4 - (364.4 * progress) / 100;
          progressRing.style.strokeDashoffset = offset;
        }
      }, 55);

      try {
        const thresholdDays = parseInt(document.getElementById('sel-cleaner-threshold').value);
        cleanerFoundFiles = await window.electronAPI.scanIdleFiles(thresholdDays);
        cleanerSelectedPaths.clear();

        clearInterval(progressInterval);
        percentLbl.textContent = '100%';
        progressRing.style.strokeDashoffset = '0';
        foundLbl.textContent = `${cleanerFoundFiles.length} файлов`;
        
        renderCleanerResults();
        
        showToast('Сканирование завершено', `Найдено неиспользуемых файлов: ${cleanerFoundFiles.length}`, 'success');
      } catch (err) {
        clearInterval(progressInterval);
        percentLbl.textContent = 'Ошибка';
        foundLbl.textContent = 'Ошибка';
        showToast('Ошибка', 'Не удалось просканировать папки', 'warning');
      } finally {
        btnScanClean.disabled = false;
        btnScanClean.innerHTML = `
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 18px; height: 18px; margin-right: 8px; vertical-align: middle;">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          Начать сканирование
        `;
      }
    });
  }

  // Select all checkbox handler
  const chkCleanSelectAll = document.getElementById('chk-clean-select-all');
  if (chkCleanSelectAll) {
    chkCleanSelectAll.addEventListener('change', (e) => {
      const checked = e.target.checked;
      const checkboxes = document.querySelectorAll('.cleaner-row-chk');
      
      if (checked) {
        cleanerFoundFiles.forEach(f => cleanerSelectedPaths.add(f.fullPath));
        checkboxes.forEach(c => c.checked = true);
      } else {
        cleanerSelectedPaths.clear();
        checkboxes.forEach(c => c.checked = false);
      }
      updateCleanerSelectionUI();
    });
  }

  // Execute clean click
  const btnExecuteClean = document.getElementById('btn-execute-clean');
  if (btnExecuteClean) {
    btnExecuteClean.addEventListener('click', async () => {
      const action = document.getElementById('sel-cleaner-action').value;
      const filesToClean = cleanerFoundFiles.filter(f => cleanerSelectedPaths.has(f.fullPath));
      
      const count = filesToClean.length;
      const totalSize = filesToClean.reduce((acc, f) => acc + f.size, 0);
      const sizeStr = formatBytes(totalSize);
      
      const actionTitle = action === 'delete' ? 'Безопасное удаление' : action === 'destroy' ? 'Безвозвратное удаление' : 'Архивация файлов';
      const actionMsg = action === 'delete'
        ? `Вы уверены, что хотите переместить выбранные файлы (${count} ф., ${sizeStr}) в Корзину? Вы сможете восстановить их оттуда.`
        : action === 'destroy'
        ? `ВНИМАНИЕ: Вы действительно хотите навсегда безвозвратно удалить выбранные файлы (${count} ф., ${sizeStr}) с диска? Это действие нельзя отменить!`
        : `Вы уверены, что хотите переместить выбранные файлы (${count} ф., ${sizeStr}) в архивную папку?`;
      const actionConfirmText = action === 'delete' ? 'В корзину' : action === 'destroy' ? 'Удалить навсегда' : 'В архив';

      const confirmed = await showConfirm(actionTitle, actionMsg, actionConfirmText, 'Отмена');
      if (confirmed) {
        btnExecuteClean.disabled = true;
        btnExecuteClean.textContent = 'Очистка...';
        
        try {
          const result = await window.electronAPI.cleanIdleFiles(filesToClean, action);
          showToast(
            'Очистка завершена',
            `Обработано файлов: ${result.success} из ${count}. Свободно: ${formatBytes(result.freedSize)}`,
            'success'
          );
          
          cleanerFoundFiles = cleanerFoundFiles.filter(f => !cleanerSelectedPaths.has(f.fullPath));
          cleanerSelectedPaths.clear();
          
          document.getElementById('lbl-cleaner-found-count').textContent = `${cleanerFoundFiles.length} файлов`;
          
          renderCleanerResults();
        } catch (err) {
          showToast('Ошибка', 'Не удалось завершить очистку файлов', 'warning');
        } finally {
          btnExecuteClean.disabled = false;
        }
      }
    });
  }
}

// --- Helper Functions ---

// Custom Glassmorphic Confirmation Modal Promise
function showConfirm(title, message, confirmText = 'Очистить', cancelText = 'Отмена') {
  return new Promise((resolve) => {
    const overlay = document.getElementById('confirm-modal');
    const modalTitle = document.getElementById('confirm-modal-title');
    const modalMessage = document.getElementById('confirm-modal-message');
    const btnOk = document.getElementById('confirm-modal-ok');
    const btnCancel = document.getElementById('confirm-modal-cancel');
    
    if (!overlay || !btnOk || !btnCancel) {
      resolve(false);
      return;
    }
    
    modalTitle.textContent = title;
    modalMessage.textContent = message;
    btnOk.textContent = confirmText;
    btnCancel.textContent = cancelText;
    
    // Set appropriate colors depending on confirmation action
    if (confirmText === 'Удалить') {
      btnOk.style.background = '#ef4444';
      btnOk.style.boxShadow = '0 0 10px rgba(239, 68, 68, 0.2)';
    } else {
      btnOk.style.background = 'var(--primary)';
      btnOk.style.boxShadow = '0 0 10px var(--primary-glow)';
    }
    
    // Show modal with transition
    overlay.style.display = 'flex';
    // Reflow for transition
    overlay.offsetHeight;
    overlay.style.opacity = '1';
    overlay.querySelector('.custom-modal-card').style.transform = 'scale(1)';
    
    const cleanup = (result) => {
      overlay.style.opacity = '0';
      overlay.querySelector('.custom-modal-card').style.transform = 'scale(0.9)';
      
      const transitionEndHandler = () => {
        overlay.style.display = 'none';
        overlay.removeEventListener('transitionend', transitionEndHandler);
        resolve(result);
      };
      overlay.addEventListener('transitionend', transitionEndHandler);
    };
    
    // Remove old event listeners by cloning
    const newBtnOk = btnOk.cloneNode(true);
    const newBtnCancel = btnCancel.cloneNode(true);
    btnOk.parentNode.replaceChild(newBtnOk, btnOk);
    btnCancel.parentNode.replaceChild(newBtnCancel, btnCancel);
    
    newBtnOk.addEventListener('click', () => cleanup(true));
    newBtnCancel.addEventListener('click', () => cleanup(false));
  });
}

// Get path basename
function pathBasename(fullPath) {
  return fullPath.split(/[\\/]/).pop() || fullPath;
}

// Size formatter
function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// Timestamp formatter
function formatTimestamp(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    day: '2-digit',
    month: '2-digit',
    year: '2-digit'
  });
}

// Show Custom Toast notification
function showToast(title, message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;

  let icon = `
    <svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <circle cx="12" cy="12" r="10"></circle>
      <line x1="12" y1="16" x2="12" y2="12"></line>
      <line x1="12" y1="8" x2="12.01" y2="8"></line>
    </svg>
  `; // info default

  if (type === 'success') {
    icon = `
      <svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
        <polyline points="22 4 12 14.01 9 11.01"></polyline>
      </svg>
    `;
  } else if (type === 'warning') {
    icon = `
      <svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
        <line x1="12" y1="9" x2="12" y2="13"></line>
        <line x1="12" y1="17" x2="12.01" y2="17"></line>
      </svg>
    `;
  }

  toast.innerHTML = `
    ${icon}
    <div class="toast-body">
      <div class="toast-title">${title}</div>
      <div>${message}</div>
    </div>
  `;

  toastContainer.appendChild(toast);

  // Trigger layout reflow for animation
  toast.offsetHeight;

  toast.classList.add('show');

  // Auto remove after 4 seconds
  setTimeout(() => {
    toast.classList.remove('show');
    // Remove from DOM when fade finishes
    toast.addEventListener('transitionend', () => {
      toast.remove();
    });
  }, 4000);
}

// --- Theme Customization Helpers ---

const themePresets = {
  space: {
    primary: '#a78bfa',
    bgApp: '#090916',
    bgSidebar: '#101026',
    bgCard: '#1a1a3a',
    textMain: '#f3f4f6'
  },
  midnight: {
    primary: '#60a5fa',
    bgApp: '#080c14',
    bgSidebar: '#0e1624',
    bgCard: '#1c283c',
    textMain: '#f8fafc'
  },
  emerald: {
    primary: '#34d399',
    bgApp: '#060b09',
    bgSidebar: '#0d1713',
    bgCard: '#1a2c26',
    textMain: '#ecfdf5'
  },
  sunset: {
    primary: '#f472b6',
    bgApp: '#0a050f',
    bgSidebar: '#140921',
    bgCard: '#241238',
    textMain: '#fff5f7'
  },
  amber: {
    primary: '#f59e0b',
    bgApp: '#0c0a05',
    bgSidebar: '#141108',
    bgCard: '#221e10',
    textMain: '#fefcf0'
  }
};

function hexToRgbA(hex, alpha) {
  let c;
  if (/^#([A-Fa-f0-9]{3}){1,2}$/.test(hex)) {
    c = hex.substring(1).split('');
    if (c.length == 3) {
      c = [c[0], c[0], c[1], c[1], c[2], c[2]];
    }
    c = '0x' + c.join('');
    return 'rgba(' + [(c >> 16) & 255, (c >> 8) & 255, c & 255].join(',') + ',' + alpha + ')';
  }
  return hex;
}

function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null;
}

function applyTheme(theme) {
  if (!theme || !theme.colors) return;
  const colors = theme.colors;
  const root = document.documentElement;
  
  root.style.setProperty('--primary', colors.primary);
  root.style.setProperty('--primary-glow', hexToRgbA(colors.primary, 0.3));
  root.style.setProperty('--primary-hover', colors.primary);
  root.style.setProperty('--bg-app', colors.bgApp);
  root.style.setProperty('--bg-sidebar', colors.bgSidebar);
  root.style.setProperty('--bg-card', hexToRgbA(colors.bgCard, 0.5));
  root.style.setProperty('--bg-card-hover', hexToRgbA(colors.bgCard, 0.65));
  root.style.setProperty('--bg-panel', hexToRgbA(colors.bgCard, 0.65));
  root.style.setProperty('--text-main', colors.textMain);
  root.style.setProperty('--text-muted', hexToRgbA(colors.textMain, 0.6));

  const bgImage = theme.bgImage;
  const thumbnail = document.getElementById('bg-image-thumbnail');
  const thumbnailContainer = document.getElementById('bg-image-thumbnail-container');
  const removeBtn = document.getElementById('btn-remove-bg-image');
  
  if (bgImage) {
    const applyBg = (dataUrl) => {
      const bgRgb = hexToRgb(colors.bgApp) || { r: 9, g: 9, b: 22 };
      root.style.setProperty('--bg-image-url', `url("${dataUrl}")`);
      root.style.setProperty('--bg-image-overlay', `linear-gradient(rgba(${bgRgb.r}, ${bgRgb.g}, ${bgRgb.b}, 0.82), rgba(${bgRgb.r}, ${bgRgb.g}, ${bgRgb.b}, 0.88))`);
      
      if (thumbnail && thumbnailContainer && removeBtn) {
        thumbnail.src = dataUrl;
        thumbnailContainer.style.display = 'block';
        removeBtn.style.display = 'inline-flex';
      }
    };

    if (currentBgImageDataUrl) {
      applyBg(currentBgImageDataUrl);
    } else {
      window.electronAPI.getFilePreview(bgImage).then(dataUrl => {
        if (dataUrl) {
          currentBgImageDataUrl = dataUrl;
          applyBg(dataUrl);
        }
      }).catch(e => console.error(e));
    }
  } else {
    currentBgImageDataUrl = null;
    root.style.removeProperty('--bg-image-url');
    root.style.removeProperty('--bg-image-overlay');
    
    if (thumbnail && thumbnailContainer && removeBtn) {
      thumbnail.src = '';
      thumbnailContainer.style.display = 'none';
      removeBtn.style.display = 'none';
    }
  }
}

function updatePreview(colors, bgImageUrl = null) {
  const frame = document.getElementById('theme-preview-frame');
  if (!frame) return;
  
  frame.style.setProperty('--primary-preview', colors.primary);
  frame.style.setProperty('--primary-glow-preview', hexToRgbA(colors.primary, 0.3));
  frame.style.setProperty('--bg-app-preview', colors.bgApp);
  frame.style.setProperty('--bg-sidebar-preview', colors.bgSidebar);
  frame.style.setProperty('--bg-card-preview', hexToRgbA(colors.bgCard, 0.5));
  frame.style.setProperty('--text-main-preview', colors.textMain);

  const bgRgb = hexToRgb(colors.bgApp) || { r: 9, g: 9, b: 22 };
  if (bgImageUrl) {
    frame.style.backgroundImage = `linear-gradient(rgba(${bgRgb.r}, ${bgRgb.g}, ${bgRgb.b}, 0.82), rgba(${bgRgb.r}, ${bgRgb.g}, ${bgRgb.b}, 0.88)), url("${bgImageUrl}")`;
    frame.style.backgroundSize = 'cover';
    frame.style.backgroundPosition = 'center';
  } else {
    frame.style.backgroundImage = 'none';
  }
}

function extractThemeFromImage(imgElement) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  
  canvas.width = 30;
  canvas.height = 30;
  ctx.drawImage(imgElement, 0, 0, 30, 30);
  
  const imgData = ctx.getImageData(0, 0, 30, 30).data;
  
  const colors = [];
  for (let i = 0; i < imgData.length; i += 4) {
    const r = imgData[i];
    const g = imgData[i+1];
    const b = imgData[i+2];
    const a = imgData[i+3];
    
    if (a < 200) continue;
    
    const hsl = rgbToHsl(r, g, b);
    colors.push(hsl);
  }
  
  const buckets = Array.from({ length: 12 }, () => []);
  colors.forEach(c => {
    const bucketIndex = Math.floor(c.h / 30) % 12;
    buckets[bucketIndex].push(c);
  });
  
  let bestBucket = [];
  let maxVibrantCount = 0;
  
  buckets.forEach(b => {
    const vibrantCount = b.filter(c => c.s > 0.15 && c.l > 0.15 && c.l < 0.85).length;
    if (vibrantCount > maxVibrantCount) {
      maxVibrantCount = vibrantCount;
      bestBucket = b;
    }
  });
  
  if (bestBucket.length === 0) {
    let maxCount = 0;
    buckets.forEach(b => {
      if (b.length > maxCount) {
        maxCount = b.length;
        bestBucket = b;
      }
    });
  }
  
  let avgH = 260, avgS = 0.5, avgL = 0.5;
  if (bestBucket.length > 0) {
    let sumH = 0, sumS = 0, sumL = 0;
    bestBucket.forEach(c => {
      sumH += c.h;
      sumS += c.s;
      sumL += c.l;
    });
    avgH = sumH / bestBucket.length;
    avgS = sumS / bestBucket.length;
    avgL = sumL / bestBucket.length;
  }
  
  const primaryH = avgH;
  const primaryS = Math.max(0.6, Math.min(avgS * 1.2, 0.85));
  const primaryL = 0.6;
  
  const bgAppH = avgH;
  const bgAppS = Math.min(avgS * 0.4, 0.15);
  const bgAppL = 0.05;
  
  const bgSidebarH = avgH;
  const bgSidebarS = Math.min(avgS * 0.4, 0.15);
  const bgSidebarL = 0.08;
  
  const bgCardH = avgH;
  const bgCardS = Math.min(avgS * 0.5, 0.20);
  const bgCardL = 0.12;
  
  const textH = avgH;
  const textS = 0.10;
  const textL = 0.95;
  
  return {
    primary: hslToHex(primaryH, primaryS, primaryL),
    bgApp: hslToHex(bgAppH, bgAppS, bgAppL),
    bgSidebar: hslToHex(bgSidebarH, bgSidebarS, bgSidebarL),
    bgCard: hslToHex(bgCardH, bgCardS, bgCardL),
    textMain: hslToHex(textH, textS, textL)
  };
}

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h, s, l = (max + min) / 2;
  if (max === min) {
    h = s = 0;
  } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return { h: h * 360, s, l };
}

function hslToHex(h, s, l) {
  let r, g, b;
  h /= 360;
  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1/3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1/3);
  }
  const toHex = x => {
    const hex = Math.round(x * 255).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  };
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

// --- Smart Cleaner Rendering Helpers ---
function renderCleanerResults() {
  const container = document.getElementById('cleaner-results-list');
  const btnClean = document.getElementById('btn-execute-clean');
  const selectAllContainer = document.getElementById('lbl-clean-select-all');
  const selectAllChk = document.getElementById('chk-clean-select-all');
  const tableHeader = document.getElementById('cleaner-table-header');
  
  container.innerHTML = '';
  
  if (cleanerFoundFiles.length === 0) {
    cleanerSelectedPaths.clear();
    selectAllContainer.style.display = 'none';
    selectAllChk.checked = false;
    btnClean.disabled = true;
    if (tableHeader) tableHeader.style.display = 'none';
    document.getElementById('lbl-clean-selection-text').textContent = 'Не найдено файлов, соответствующих критериям.';
    
    container.innerHTML = `
      <div class="empty-state" style="padding: 60px 24px; text-align: center;">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 48px; height: 48px; opacity: 0.3; margin-bottom: 16px; display: inline-block;">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
          <polyline points="22 4 12 14.01 9 11.01"></polyline>
        </svg>
        <p style="font-size: 14px; color: var(--text-main); margin-bottom: 8px; font-weight: 500;">Неиспользуемых файлов не найдено</p>
        <p style="font-size: 13px; color: var(--text-muted); max-width: 320px; margin: 0 auto; line-height: 1.4;">Отлично! Все файлы в отслеживаемых папках были недавно изменены.</p>
      </div>
    `;
    return;
  }
  
  if (tableHeader) tableHeader.style.display = 'grid';
  selectAllContainer.style.display = 'inline-block';
  selectAllChk.checked = cleanerFoundFiles.every(f => cleanerSelectedPaths.has(f.fullPath));
  updateCleanerSelectionUI();
  
  cleanerFoundFiles.forEach(file => {
    const row = document.createElement('div');
    row.className = 'cleaner-file-row';
    
    const isChecked = cleanerSelectedPaths.has(file.fullPath);
    const categoryName = categoryDetails[file.category]?.label || file.category;
    
    row.innerHTML = `
      <div class="col-check">
        <label class="custom-checkbox">
          <input type="checkbox" class="cleaner-row-chk" ${isChecked ? 'checked' : ''}>
          <span class="checkmark"></span>
        </label>
      </div>
      <div class="col-name" title="${file.fileName}">${file.fileName}</div>
      <div class="col-path" title="${file.fullPath}">${categoryName}</div>
      <div class="col-idle">${file.daysIdle} дн. без изм.</div>
      <div class="col-size">${formatBytes(file.size)}</div>
      <div class="col-action" style="text-align: center;">
        <button class="btn-open-folder" title="Открыть расположение файла" style="background: none; border: none; color: var(--text-muted); cursor: pointer; padding: 4px; display: inline-flex; align-items: center; justify-content: center; transition: var(--transition-fast); border-radius: var(--radius-sm);">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 16px; height: 16px;">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
            <circle cx="12" cy="13" r="3"></circle>
            <line x1="12" y1="13" x2="15" y2="16"></line>
          </svg>
        </button>
      </div>
    `;
    
    const chk = row.querySelector('.cleaner-row-chk');
    chk.addEventListener('change', (e) => {
      if (e.target.checked) {
        cleanerSelectedPaths.add(file.fullPath);
      } else {
        cleanerSelectedPaths.delete(file.fullPath);
      }
      selectAllChk.checked = cleanerFoundFiles.every(f => cleanerSelectedPaths.has(f.fullPath));
      updateCleanerSelectionUI();
    });
    
    row.addEventListener('click', (e) => {
      if (e.target.closest('.custom-checkbox') || e.target.closest('input') || e.target.closest('.btn-open-folder')) return;
      chk.checked = !chk.checked;
      chk.dispatchEvent(new Event('change'));
    });

    const btnOpenFolder = row.querySelector('.btn-open-folder');
    btnOpenFolder.addEventListener('click', (e) => {
      e.stopPropagation();
      window.electronAPI.showItemInFolder(file.fullPath);
    });

    const ext = file.fileName.split('.').pop().toLowerCase();
    const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'ico', 'jfif'].includes(ext);

    if (isImage) {
      row.addEventListener('mouseenter', async (e) => {
        const tooltip = document.getElementById('cleaner-preview-tooltip');
        const previewImg = document.getElementById('cleaner-preview-img');
        const previewLoading = document.getElementById('cleaner-preview-loading');
        
        tooltip.style.display = 'block';
        tooltip.style.opacity = '1';
        previewImg.style.display = 'none';
        previewLoading.style.display = 'block';
        
        tooltip.style.left = (e.clientX + 15) + 'px';
        tooltip.style.top = (e.clientY + 15) + 'px';
        
        const path = file.fullPath;
        activeHoverPath = path;
        
        try {
          const dataUrl = await window.electronAPI.getFilePreview(path);
          if (activeHoverPath === path && dataUrl) {
            previewImg.src = dataUrl;
            previewLoading.style.display = 'none';
            previewImg.style.display = 'block';
          } else if (activeHoverPath === path && !dataUrl) {
            tooltip.style.display = 'none';
          }
        } catch (err) {
          console.error(err);
          if (activeHoverPath === path) {
            tooltip.style.display = 'none';
          }
        }
      });
      
      row.addEventListener('mousemove', (e) => {
        const tooltip = document.getElementById('cleaner-preview-tooltip');
        tooltip.style.left = (e.clientX + 15) + 'px';
        tooltip.style.top = (e.clientY + 15) + 'px';
      });
      
      row.addEventListener('mouseleave', () => {
        const tooltip = document.getElementById('cleaner-preview-tooltip');
        const previewImg = document.getElementById('cleaner-preview-img');
        activeHoverPath = null;
        tooltip.style.display = 'none';
        tooltip.style.opacity = '0';
        previewImg.src = '';
      });
    }
    
    container.appendChild(row);
  });
}

function updateCleanerSelectionUI() {
  const btnClean = document.getElementById('btn-execute-clean');
  const count = cleanerSelectedPaths.size;
  const selectionText = document.getElementById('lbl-clean-selection-text');
  
  if (count === 0) {
    btnClean.disabled = true;
    selectionText.textContent = `Найдено файлов: ${cleanerFoundFiles.length}. Выберите файлы для очистки.`;
  } else {
    btnClean.disabled = false;
    
    const selectedFilesList = cleanerFoundFiles.filter(f => cleanerSelectedPaths.has(f.fullPath));
    const totalSize = selectedFilesList.reduce((acc, f) => acc + f.size, 0);
    const sizeStr = formatBytes(totalSize);
    
    selectionText.textContent = `Выбрано: ${count} из ${cleanerFoundFiles.length} файлов (${sizeStr})`;
  }
}
