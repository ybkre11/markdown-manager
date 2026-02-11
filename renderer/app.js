// State
let currentFolder = null;
let currentFile = null;
let files = [];
let saveTimeout = null;
let hasUnsavedChanges = false;

// DOM Elements
const btnOpenFolder = document.getElementById('btn-open-folder');
const btnNewFile = document.getElementById('btn-new-file');
const btnImport = document.getElementById('btn-import');
const folderPathEl = document.getElementById('folder-path');
const fileListEl = document.getElementById('file-list');
const editor = document.getElementById('editor');
const preview = document.getElementById('preview');
const saveStatus = document.getElementById('save-status');
const modalNewFile = document.getElementById('modal-new-file');
const newFileNameInput = document.getElementById('new-file-name');
const btnCancelNew = document.getElementById('btn-cancel-new');
const btnConfirmNew = document.getElementById('btn-confirm-new');
const btnToggleEditor = document.getElementById('btn-toggle-editor');
const editorPanel = document.getElementById('editor-panel');
const previewPanel = document.getElementById('preview-panel');
const resizeHandle = document.getElementById('resize-handle');

// Editor visibility state
let editorVisible = true;

// Initialize
document.addEventListener('DOMContentLoaded', init);

function init() {
  // Configure marked for GitHub-flavored markdown
  marked.setOptions({
    gfm: true,
    breaks: true,
    headerIds: true
  });

  // Event listeners
  btnOpenFolder.addEventListener('click', openFolder);
  btnNewFile.addEventListener('click', showNewFileModal);
  btnImport.addEventListener('click', importFile);
  editor.addEventListener('input', onEditorChange);
  
  btnCancelNew.addEventListener('click', hideNewFileModal);
  btnConfirmNew.addEventListener('click', createNewFile);
  newFileNameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') createNewFile();
    if (e.key === 'Escape') hideNewFileModal();
  });

  // Close modal on backdrop click
  modalNewFile.addEventListener('click', (e) => {
    if (e.target === modalNewFile) hideNewFileModal();
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey) {
      if (e.key === 's') {
        e.preventDefault();
        saveCurrentFile();
      }
      if (e.key === 'n' && currentFolder) {
        e.preventDefault();
        showNewFileModal();
      }
      if (e.key === 'e') {
        // Cmd+E = Toggle editor
        e.preventDefault();
        toggleEditor();
      }
      if (e.key === 'o' && e.shiftKey) {
        // Cmd+Shift+O = Open single file
        e.preventDefault();
        openSingleFile();
      } else if (e.key === 'o') {
        // Cmd+O = Open folder
        e.preventDefault();
        openFolder();
      }
    }
  });

  // Handle file open from Finder (double-click, "Open With", drag to dock)
  window.api.onOpenFile((filePath) => {
    handleExternalFileOpen(filePath);
  });

  // Setup drag & drop on the window
  setupDragAndDrop();
  
  // Setup panel resize
  setupPanelResize();
  
  // Toggle editor button
  btnToggleEditor.addEventListener('click', toggleEditor);
}

// Toggle editor panel visibility
function toggleEditor() {
  editorVisible = !editorVisible;
  
  if (editorVisible) {
    editorPanel.classList.remove('hidden');
    editorPanel.style.flex = '1 1 50%';
    btnToggleEditor.title = 'Masquer l\'éditeur (⌘E)';
  } else {
    editorPanel.classList.add('hidden');
    btnToggleEditor.title = 'Afficher l\'éditeur (⌘E)';
  }
}

// Setup resizable panels
function setupPanelResize() {
  let isResizing = false;
  let startX;
  let startEditorWidth;
  let startPreviewWidth;
  
  resizeHandle.addEventListener('mousedown', (e) => {
    isResizing = true;
    startX = e.clientX;
    startEditorWidth = editorPanel.offsetWidth;
    startPreviewWidth = previewPanel.offsetWidth;
    resizeHandle.classList.add('dragging');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  });
  
  document.addEventListener('mousemove', (e) => {
    if (!isResizing) return;
    
    const delta = e.clientX - startX;
    const totalWidth = startEditorWidth + startPreviewWidth;
    
    // Calculate new widths
    let newEditorWidth = startEditorWidth + delta;
    let newPreviewWidth = startPreviewWidth - delta;
    
    // Enforce minimum widths
    if (newEditorWidth < 200) {
      newEditorWidth = 200;
      newPreviewWidth = totalWidth - 200;
    }
    if (newPreviewWidth < 300) {
      newPreviewWidth = 300;
      newEditorWidth = totalWidth - 300;
    }
    
    // Apply as flex basis
    const editorPercent = (newEditorWidth / totalWidth) * 100;
    const previewPercent = (newPreviewWidth / totalWidth) * 100;
    
    editorPanel.style.flex = `1 1 ${editorPercent}%`;
    previewPanel.style.flex = `1 1 ${previewPercent}%`;
  });
  
  document.addEventListener('mouseup', () => {
    if (isResizing) {
      isResizing = false;
      resizeHandle.classList.remove('dragging');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
  });
}

// Handle file opened from Finder
async function handleExternalFileOpen(filePath) {
  if (!filePath) return;
  
  const ext = filePath.split('.').pop().toLowerCase();
  
  if (ext === 'md' || ext === 'markdown') {
    // Open the folder containing the file, then select the file
    const folderPath = filePath.substring(0, filePath.lastIndexOf('/'));
    
    currentFolder = folderPath;
    folderPathEl.innerHTML = `<span title="${folderPath}">${folderPath.split('/').pop()}</span>`;
    btnNewFile.disabled = false;
    btnImport.disabled = false;
    
    await refreshFileList();
    await loadFile(filePath);
  }
}

// Setup drag & drop
function setupDragAndDrop() {
  const body = document.body;
  
  // Prevent default drag behaviors
  ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    body.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
    });
  });

  // Highlight drop zone
  ['dragenter', 'dragover'].forEach(eventName => {
    body.addEventListener(eventName, () => {
      body.classList.add('drag-over');
    });
  });

  ['dragleave', 'drop'].forEach(eventName => {
    body.addEventListener(eventName, () => {
      body.classList.remove('drag-over');
    });
  });

  // Handle drop
  body.addEventListener('drop', async (e) => {
    const files = Array.from(e.dataTransfer.files);
    
    for (const file of files) {
      const filePath = file.path;
      if (!filePath) continue;
      
      const ext = filePath.split('.').pop().toLowerCase();
      
      if (ext === 'md' || ext === 'markdown') {
        // Open .md file directly
        await handleExternalFileOpen(filePath);
        break;
      } else if (ext === 'rtf' || ext === 'docx') {
        // Convert and open .rtf or .docx
        await handleImportDrop(filePath);
        break;
      }
    }
  });
}

// Handle dropped .rtf or .docx file
async function handleImportDrop(filePath) {
  const result = await window.api.importDroppedFile(filePath);
  if (!result) return;
  
  if (result.success) {
    // Switch to the folder containing the converted file
    currentFolder = result.folder;
    folderPathEl.innerHTML = `<span title="${result.folder}">${result.folder.split('/').pop()}</span>`;
    btnNewFile.disabled = false;
    
    await refreshFileList();
    await loadFile(result.path);
  } else {
    alert(`Erreur lors de la conversion: ${result.error}`);
  }
}

// Open a single .md file
async function openSingleFile() {
  const result = await window.api.openSingleFile();
  if (!result) return;
  
  currentFolder = result.folderPath;
  folderPathEl.innerHTML = `<span title="${result.folderPath}">${result.folderPath.split('/').pop()}</span>`;
  btnNewFile.disabled = false;
  btnImport.disabled = false;
  
  await refreshFileList();
  await loadFile(result.filePath);
}

// Open folder
async function openFolder() {
  const folder = await window.api.openFolder();
  if (!folder) return;
  
  currentFolder = folder;
  folderPathEl.innerHTML = `<span title="${folder}">${folder.split('/').pop()}</span>`;
  
  // Enable buttons
  btnNewFile.disabled = false;
  btnImport.disabled = false;
  
  await refreshFileList();
}

// Refresh file list
async function refreshFileList() {
  if (!currentFolder) return;
  
  files = await window.api.listMdFiles(currentFolder);
  renderFileList();
}

// Render file list
function renderFileList() {
  if (files.length === 0) {
    fileListEl.innerHTML = `
      <div style="padding: 20px; text-align: center; color: var(--text-muted); font-size: 12px;">
        Aucun fichier .md<br>
        <span style="font-size: 11px;">Créez-en un ou importez un document</span>
      </div>
    `;
    return;
  }

  fileListEl.innerHTML = files.map(file => `
    <div class="file-item ${currentFile === file.path ? 'active' : ''}" data-path="${file.path}">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
      </svg>
      <span class="file-name">${file.name}</span>
      <button class="btn-delete" data-path="${file.path}" title="Supprimer">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="3 6 5 6 21 6"/>
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
        </svg>
      </button>
    </div>
  `).join('');

  // Add click listeners
  fileListEl.querySelectorAll('.file-item').forEach(item => {
    item.addEventListener('click', (e) => {
      if (!e.target.closest('.btn-delete')) {
        loadFile(item.dataset.path);
      }
    });
  });

  fileListEl.querySelectorAll('.btn-delete').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteFile(btn.dataset.path);
    });
  });
}

// Load file
async function loadFile(filePath) {
  // Save current file first if needed
  if (hasUnsavedChanges && currentFile) {
    await saveCurrentFile();
  }

  const content = await window.api.readFile(filePath);
  if (content === null) return;

  currentFile = filePath;
  editor.value = content;
  editor.disabled = false;
  hasUnsavedChanges = false;
  
  updatePreview(content);
  renderFileList(); // Update active state
  saveStatus.textContent = '';
}

// Save current file
async function saveCurrentFile() {
  if (!currentFile || !hasUnsavedChanges) return;
  
  const success = await window.api.saveFile(currentFile, editor.value);
  if (success) {
    hasUnsavedChanges = false;
    saveStatus.textContent = 'Enregistré ✓';
    setTimeout(() => {
      if (!hasUnsavedChanges) saveStatus.textContent = '';
    }, 2000);
  }
}

// Editor change handler
function onEditorChange() {
  hasUnsavedChanges = true;
  saveStatus.textContent = 'Non enregistré...';
  
  // Update preview
  updatePreview(editor.value);
  
  // Auto-save after 1 second of inactivity
  clearTimeout(saveTimeout);
  saveTimeout = setTimeout(saveCurrentFile, 1000);
}

// Update preview
function updatePreview(content) {
  if (!content.trim()) {
    preview.innerHTML = `
      <div class="empty-state">
        <p>Commencez à écrire...</p>
      </div>
    `;
    return;
  }
  
  preview.innerHTML = marked.parse(content);
}

// New file modal
function showNewFileModal() {
  newFileNameInput.value = '';
  modalNewFile.classList.add('active');
  newFileNameInput.focus();
}

function hideNewFileModal() {
  modalNewFile.classList.remove('active');
}

async function createNewFile() {
  const fileName = newFileNameInput.value.trim();
  if (!fileName) return;
  
  const result = await window.api.createFile(currentFolder, fileName);
  if (result.success) {
    hideNewFileModal();
    await refreshFileList();
    await loadFile(result.path);
  } else {
    alert(`Erreur: ${result.error}`);
  }
}

// Delete file
async function deleteFile(filePath) {
  const fileName = filePath.split('/').pop();
  if (!confirm(`Supprimer "${fileName}" ?`)) return;
  
  const success = await window.api.deleteFile(filePath);
  if (success) {
    if (currentFile === filePath) {
      currentFile = null;
      editor.value = '';
      editor.disabled = true;
      preview.innerHTML = `
        <div class="empty-state">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.5">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
            <line x1="16" y1="13" x2="8" y2="13"/>
            <line x1="16" y1="17" x2="8" y2="17"/>
            <polyline points="10 9 9 9 8 9"/>
          </svg>
          <p>Sélectionnez un fichier .md<br>ou importez un document</p>
        </div>
      `;
    }
    await refreshFileList();
  }
}

// Import file
async function importFile() {
  const result = await window.api.importFile(currentFolder);
  if (!result) return;
  
  if (result.success) {
    // If imported file is in a different folder, switch to that folder
    if (result.folder && result.folder !== currentFolder) {
      currentFolder = result.folder;
      folderPathEl.innerHTML = `<span title="${result.folder}">${result.folder.split('/').pop()}</span>`;
      btnNewFile.disabled = false;
      btnImport.disabled = false;
    }
    
    await refreshFileList();
    await loadFile(result.path);
  } else {
    alert(`Erreur lors de l'import: ${result.error}`);
  }
}
