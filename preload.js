const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // Folder operations
  openFolder: () => ipcRenderer.invoke('open-folder'),
  listMdFiles: (folderPath) => ipcRenderer.invoke('list-md-files', folderPath),
  
  // File operations
  readFile: (filePath) => ipcRenderer.invoke('read-file', filePath),
  saveFile: (filePath, content) => ipcRenderer.invoke('save-file', filePath, content),
  createFile: (folderPath, fileName) => ipcRenderer.invoke('create-file', folderPath, fileName),
  deleteFile: (filePath) => ipcRenderer.invoke('delete-file', filePath),
  
  // Open single file
  openSingleFile: () => ipcRenderer.invoke('open-single-file'),
  
  // Import
  importFile: (folderPath) => ipcRenderer.invoke('import-file', folderPath),
  importDroppedFile: (filePath) => ipcRenderer.invoke('import-dropped-file', filePath),
  
  // Event listeners for file opening from Finder
  onOpenFile: (callback) => {
    ipcRenderer.on('open-file', (event, filePath) => callback(filePath));
  }
});
