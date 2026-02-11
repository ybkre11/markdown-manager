const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const mammoth = require('mammoth');
const { execSync } = require('child_process');

let mainWindow;
let pendingFile = null; // File to open on launch

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#1e1e1e',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile('renderer/index.html');
  
  // Send pending file once window is ready
  mainWindow.webContents.on('did-finish-load', () => {
    if (pendingFile) {
      mainWindow.webContents.send('open-file', pendingFile);
      pendingFile = null;
    }
  });

  // Handle drag & drop onto window
  mainWindow.webContents.on('will-navigate', (event) => {
    event.preventDefault();
  });
}

// macOS: Handle file open via Finder (double-click, "Open With", drag to dock icon)
app.on('open-file', (event, filePath) => {
  event.preventDefault();
  
  if (mainWindow && mainWindow.webContents) {
    mainWindow.webContents.send('open-file', filePath);
  } else {
    // App not ready yet, store for later
    pendingFile = filePath;
  }
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// === IPC Handlers ===

// Open folder dialog
ipcMain.handle('open-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  });
  if (result.canceled) return null;
  return result.filePaths[0];
});

// List .md files in folder
ipcMain.handle('list-md-files', async (event, folderPath) => {
  try {
    const files = fs.readdirSync(folderPath, { withFileTypes: true });
    const mdFiles = [];
    
    for (const file of files) {
      if (file.isFile() && file.name.endsWith('.md')) {
        const filePath = path.join(folderPath, file.name);
        const stats = fs.statSync(filePath);
        mdFiles.push({
          name: file.name,
          path: filePath,
          modified: stats.mtime
        });
      }
    }
    
    return mdFiles.sort((a, b) => a.name.localeCompare(b.name));
  } catch (err) {
    console.error('Error listing files:', err);
    return [];
  }
});

// Read file content
ipcMain.handle('read-file', async (event, filePath) => {
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch (err) {
    console.error('Error reading file:', err);
    return null;
  }
});

// Save file content
ipcMain.handle('save-file', async (event, filePath, content) => {
  try {
    fs.writeFileSync(filePath, content, 'utf-8');
    return true;
  } catch (err) {
    console.error('Error saving file:', err);
    return false;
  }
});

// Create new .md file
ipcMain.handle('create-file', async (event, folderPath, fileName) => {
  try {
    const filePath = path.join(folderPath, fileName.endsWith('.md') ? fileName : `${fileName}.md`);
    if (fs.existsSync(filePath)) {
      return { success: false, error: 'File already exists' };
    }
    fs.writeFileSync(filePath, `# ${fileName.replace('.md', '')}\n\n`, 'utf-8');
    return { success: true, path: filePath };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Delete file
ipcMain.handle('delete-file', async (event, filePath) => {
  try {
    fs.unlinkSync(filePath);
    return true;
  } catch (err) {
    console.error('Error deleting file:', err);
    return false;
  }
});

// Import .docx or .rtf file - saves in SAME folder as source file
ipcMain.handle('import-file', async (event, currentFolderPath) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: 'Documents', extensions: ['docx', 'rtf'] }
    ]
  });
  
  if (result.canceled) return null;
  
  const sourcePath = result.filePaths[0];
  const sourceFolder = path.dirname(sourcePath); // Save in same folder as source!
  const ext = path.extname(sourcePath).toLowerCase();
  const baseName = path.basename(sourcePath, ext);
  const targetPath = path.join(sourceFolder, `${baseName}.md`);
  
  try {
    let markdown = '';
    
    if (ext === '.docx') {
      // Convert .docx to HTML first (better table support), then to Markdown
      const docxBuffer = fs.readFileSync(sourcePath);
      const convertResult = await mammoth.convertToHtml(docxBuffer);
      markdown = htmlToMarkdown(convertResult.value);
      markdown = cleanupMarkdown(markdown);
      
    } else if (ext === '.rtf') {
      // Use macOS native textutil for RTF conversion (much better!)
      markdown = convertRtfWithTextutil(sourcePath);
    }
    
    fs.writeFileSync(targetPath, markdown, 'utf-8');
    
    return {
      success: true,
      path: targetPath,
      folder: sourceFolder,
      name: `${baseName}.md`
    };
    
  } catch (err) {
    console.error('Error converting file:', err);
    return {
      success: false,
      error: err.message
    };
  }
});

// Open a single .md file (not a folder)
ipcMain.handle('open-single-file', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: 'Markdown', extensions: ['md', 'markdown'] }
    ]
  });
  
  if (result.canceled) return null;
  
  const filePath = result.filePaths[0];
  const folderPath = path.dirname(filePath);
  
  return {
    filePath,
    folderPath
  };
});

// Import a dropped .docx or .rtf file (no dialog needed)
ipcMain.handle('import-dropped-file', async (event, sourcePath) => {
  const sourceFolder = path.dirname(sourcePath);
  const ext = path.extname(sourcePath).toLowerCase();
  const baseName = path.basename(sourcePath, ext);
  const targetPath = path.join(sourceFolder, `${baseName}.md`);
  
  try {
    let markdown = '';
    
    if (ext === '.docx') {
      const docxBuffer = fs.readFileSync(sourcePath);
      const convertResult = await mammoth.convertToHtml(docxBuffer);
      markdown = htmlToMarkdown(convertResult.value);
      markdown = cleanupMarkdown(markdown);
      
    } else if (ext === '.rtf') {
      markdown = convertRtfWithTextutil(sourcePath);
    }
    
    fs.writeFileSync(targetPath, markdown, 'utf-8');
    
    return {
      success: true,
      path: targetPath,
      folder: sourceFolder,
      name: `${baseName}.md`
    };
    
  } catch (err) {
    console.error('Error converting dropped file:', err);
    return {
      success: false,
      error: err.message
    };
  }
});

// Cleanup markdown output
function cleanupMarkdown(md) {
  return md
    // Fix multiple blank lines
    .replace(/\n{3,}/g, '\n\n')
    // Ensure headers have blank line before
    .replace(/([^\n])\n(#{1,6}\s)/g, '$1\n\n$2')
    // Ensure lists are properly formatted
    .replace(/([^\n])\n([*-]\s)/g, '$1\n\n$2')
    // Trim
    .trim();
}

// Convert RTF using macOS textutil (native tool, handles RTF perfectly)
function convertRtfWithTextutil(rtfPath) {
  try {
    // Step 1: Convert RTF to HTML using textutil
    const html = execSync(`textutil -convert html -stdout "${rtfPath}"`, {
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024 // 10MB
    });
    
    // Step 2: Convert HTML to Markdown
    return htmlToMarkdown(html);
    
  } catch (err) {
    console.error('textutil conversion failed:', err);
    // Fallback: try to extract plain text
    try {
      const txt = execSync(`textutil -convert txt -stdout "${rtfPath}"`, {
        encoding: 'utf-8'
      });
      return txt.trim();
    } catch (e) {
      throw new Error('Conversion RTF échouée. Vérifiez que le fichier est valide.');
    }
  }
}

// Simple HTML to Markdown converter
function htmlToMarkdown(html) {
  // First: convert tables to markdown tables
  html = convertTables(html);
  
  // Second pass: convert HTML structure
  let md = html
    // Remove doctype and html/head/body tags
    .replace(/<!DOCTYPE[^>]*>/gi, '')
    .replace(/<html[^>]*>/gi, '')
    .replace(/<\/html>/gi, '')
    .replace(/<head>[\s\S]*?<\/head>/gi, '')
    .replace(/<body[^>]*>/gi, '')
    .replace(/<\/body>/gi, '')
    
    // Existing headers (rare in RTF but just in case)
    .replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, (m, p1) => '\n# ' + stripTags(p1).trim() + '\n')
    .replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, (m, p1) => '\n## ' + stripTags(p1).trim() + '\n')
    .replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, (m, p1) => '\n### ' + stripTags(p1).trim() + '\n')
    .replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, (m, p1) => '\n#### ' + stripTags(p1).trim() + '\n')
    
    // Links - preserve them
    .replace(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, '[$2]($1)')
    
    // Lists
    .replace(/<ul[^>]*>/gi, '\n')
    .replace(/<\/ul>/gi, '\n')
    .replace(/<ol[^>]*>/gi, '\n')
    .replace(/<\/ol>/gi, '\n')
    .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (m, p1) => '- ' + processInlineFormatting(p1).trim() + '\n')
    
    // Paragraphs - process each one to detect titles
    .replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, (m, p1) => {
      return processParagraph(p1) + '\n\n';
    })
    
    // Line breaks
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<div[^>]*>([\s\S]*?)<\/div>/gi, (m, p1) => processParagraph(p1) + '\n')
    
    // Remove remaining HTML tags
    .replace(/<[^>]+>/g, '')
    
    // Decode HTML entities
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&rsquo;/g, "'")
    .replace(/&lsquo;/g, "'")
    .replace(/&rdquo;/g, '"')
    .replace(/&ldquo;/g, '"')
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&hellip;/g, '...');
  
  // Post-processing cleanup
  md = md
    // Remove orphan asterisks on their own line
    .replace(/^\s*\*{1,4}\s*$/gm, '')
    // Remove double spaces
    .replace(/  +/g, ' ')
    // Clean up whitespace
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  
  return md;
}

// Convert HTML tables to Markdown tables
function convertTables(html) {
  // Match each table
  return html.replace(/<table[^>]*>([\s\S]*?)<\/table>/gi, (match, tableContent) => {
    const rows = [];
    
    // Extract all rows (tr)
    const rowMatches = tableContent.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || [];
    
    for (const rowHtml of rowMatches) {
      const cells = [];
      
      // Extract cells (th or td)
      const cellMatches = rowHtml.match(/<(th|td)[^>]*>([\s\S]*?)<\/\1>/gi) || [];
      
      for (const cellHtml of cellMatches) {
        // Get cell content, strip tags, clean up
        const cellContent = cellHtml
          .replace(/<(th|td)[^>]*>/gi, '')
          .replace(/<\/(th|td)>/gi, '');
        
        // Process the cell: convert paragraphs to line breaks
        let text = cellContent
          // Convert paragraph breaks to <br>
          .replace(/<\/p>\s*<p[^>]*>/gi, '<br><br>')
          .replace(/<p[^>]*>/gi, '')
          .replace(/<\/p>/gi, '')
          // Convert explicit br tags
          .replace(/<br\s*\/?>/gi, '<br>')
          // Strip remaining HTML tags
          .replace(/<[^>]+>/g, '')
          // Decode entities
          .replace(/&nbsp;/g, ' ')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          // Clean up whitespace around br
          .replace(/\s*<br>\s*/g, '<br>')
          // Escape pipe characters
          .replace(/\|/g, '\\|')
          // Trim
          .trim();
        
        cells.push(text);
      }
      
      if (cells.length > 0) {
        rows.push(cells);
      }
    }
    
    if (rows.length === 0) return '';
    
    // Build markdown table
    let mdTable = '\n';
    
    // Determine max columns
    const maxCols = Math.max(...rows.map(r => r.length));
    
    // First row is header
    const headerRow = rows[0];
    while (headerRow.length < maxCols) headerRow.push(''); // Pad if needed
    mdTable += '| ' + headerRow.join(' | ') + ' |\n';
    
    // Separator row
    mdTable += '| ' + headerRow.map(() => '---').join(' | ') + ' |\n';
    
    // Data rows
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      while (row.length < maxCols) row.push(''); // Pad if needed
      mdTable += '| ' + row.join(' | ') + ' |\n';
    }
    
    return mdTable + '\n';
  });
}

// Process a paragraph to detect if it's a title or regular text
function processParagraph(html) {
  const text = stripTags(html).trim();
  
  // Check if the paragraph is entirely bold (potential title)
  const isBoldParagraph = (
    (html.includes('<b>') || html.includes('<b ') || html.includes('<strong')) &&
    isEntirelyWrapped(html, ['b', 'strong'])
  );
  
  // Check if it looks like a title
  const looksLikeTitle = (
    text.length < 100 &&  // Short enough
    text.length > 0 &&    // Not empty
    !text.endsWith('.') && // Doesn't end with period
    !text.endsWith(',') && // Doesn't end with comma
    !text.endsWith(':') && // Doesn't end with colon (debatable)
    !text.includes('\n')   // Single line
  );
  
  // Pattern matching for common title formats
  const titlePatterns = [
    /^(Tip|Step|Part|Chapter|Section)\s*\d+/i,  // "Tip 1", "Step 2", etc.
    /^[A-Z][^a-z]*$/,  // ALL CAPS
    /^V\d+$/i,  // Version numbers like "V3"
  ];
  
  const matchesTitlePattern = titlePatterns.some(p => p.test(text));
  
  if (isBoldParagraph && looksLikeTitle) {
    // Determine heading level
    if (text.length < 20 || matchesTitlePattern) {
      // Very short or matches pattern -> H2
      return '\n## ' + text;
    } else {
      // Longer title-like text -> H3
      return '\n### ' + text;
    }
  }
  
  // Regular paragraph - process inline formatting
  return processInlineFormatting(html);
}

// Process inline bold/italic within text
function processInlineFormatting(html) {
  let result = html
    // Bold
    .replace(/<b[^>]*>([\s\S]*?)<\/b>/gi, (m, p1) => {
      const content = stripTags(p1).trim();
      return content ? '**' + content + '**' : '';
    })
    .replace(/<strong[^>]*>([\s\S]*?)<\/strong>/gi, (m, p1) => {
      const content = stripTags(p1).trim();
      return content ? '**' + content + '**' : '';
    })
    // Italic
    .replace(/<i[^>]*>([\s\S]*?)<\/i>/gi, (m, p1) => {
      const content = stripTags(p1).trim();
      return content ? '*' + content + '*' : '';
    })
    .replace(/<em[^>]*>([\s\S]*?)<\/em>/gi, (m, p1) => {
      const content = stripTags(p1).trim();
      return content ? '*' + content + '*' : '';
    })
    // Remove other tags
    .replace(/<[^>]+>/g, '');
  
  // Clean up multiple asterisks
  result = result
    .replace(/\*{3,}([^*]+)\*{3,}/g, '**$1**')
    .replace(/\*\*([^*]+)\*{3,}/g, '**$1**')
    .replace(/\*{3,}([^*]+)\*\*/g, '**$1**');
  
  return result;
}

// Check if content is entirely wrapped in specified tags
function isEntirelyWrapped(html, tags) {
  const cleaned = html.trim();
  
  for (const tag of tags) {
    const openTag = new RegExp(`^<${tag}[^>]*>`, 'i');
    const closeTag = new RegExp(`</${tag}>$`, 'i');
    
    if (openTag.test(cleaned) && closeTag.test(cleaned)) {
      // Check that there's no significant text outside the tags
      const stripped = cleaned
        .replace(openTag, '')
        .replace(closeTag, '')
        .trim();
      
      // If after removing the outer tags we still have mostly the same content, it's wrapped
      const innerText = stripTags(stripped);
      const outerText = stripTags(cleaned);
      
      if (innerText === outerText) {
        return true;
      }
    }
  }
  
  // Also check if the paragraph starts with bold and the bold contains most of the text
  const boldMatch = html.match(/<b[^>]*>([\s\S]*?)<\/b>/i) || html.match(/<strong[^>]*>([\s\S]*?)<\/strong>/i);
  if (boldMatch) {
    const boldText = stripTags(boldMatch[1]).trim();
    const fullText = stripTags(html).trim();
    // If bold text is 90%+ of the full text, consider it entirely bold
    if (boldText.length >= fullText.length * 0.9) {
      return true;
    }
  }
  
  return false;
}

// Helper to strip HTML tags
function stripTags(html) {
  return html.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
}
