# Markdown Manager

> A simple macOS app to manage Markdown files — perfect for AI knowledge bases (Claude, ChatGPT, etc.)

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Platform](https://img.shields.io/badge/platform-macOS-lightgrey.svg)
![Electron](https://img.shields.io/badge/electron-28.x-47848F.svg)

## Why?

If you work with LLMs like Claude or ChatGPT, you probably manage **knowledge bases** — collections of `.md` files that give context to your AI assistants.

Existing Markdown editors are either too complex (Obsidian) or don't handle `.docx`/`.rtf` conversion well. **Markdown Manager** is built specifically for this use case:

- ✅ Simple preview & edit
- ✅ Convert Word/RTF docs to clean Markdown
- ✅ Preserve tables with line breaks
- ✅ No bloat, just what you need

## Features

| Feature | Description |
|---------|-------------|
| 📁 **File Browser** | Navigate your .md files easily |
| 👁️ **Live Preview** | Real-time Markdown rendering |
| ✏️ **Simple Editor** | Edit with auto-save |
| 📥 **Import .docx/.rtf** | Convert Word & RTF to Markdown |
| 📊 **Table Support** | Word tables → Markdown tables (with line breaks!) |
| 🖱️ **Drag & Drop** | Drop .md, .rtf, or .docx files |
| 🔲 **Resizable Panels** | Adjust editor/preview width |
| 📖 **Reader Mode** | Hide editor for comfortable reading |

## Screenshots

![Editor and Preview](screenshots/editor.png)
![Import Feature](screenshots/viewer.png)

## Installation

### Prerequisites

```bash
# Install Node.js via Homebrew
brew install node
```

### Build the App

```bash
# Clone the repo
git clone https://github.com/Lolicht/markdown-manager.git
cd markdown-manager

# Install dependencies
npm install

# Build for macOS
npm run build-mac
```

> ⚠️ **Before publishing:** Replace `YOUR_USERNAME` with your GitHub username in this README and in `package.json`

The app will be in `dist/Markdown Manager.app` — drag it to your Applications folder.

### First Launch (Unsigned App)

Since this isn't signed with an Apple Developer certificate:
1. Right-click the app → "Open"
2. Click "Open" in the security dialog

After the first time, it will open normally.

## Keyboard Shortcuts

| Action | Shortcut |
|--------|----------|
| Open folder | `⌘ + O` |
| Open file | `⌘ + ⇧ + O` |
| New file | `⌘ + N` |
| Save | `⌘ + S` |
| Toggle reader mode | `⌘ + E` |

## Word/RTF Conversion

The converter preserves:
- ✅ Headings (H1 → H6)
- ✅ Bold / Italic
- ✅ Bullet & numbered lists
- ✅ Links
- ✅ **Tables** (with line breaks via `<br>`)

**Note:** Converted `.md` files are saved in the same folder as the source file.

## Tech Stack

- **Electron** — Cross-platform desktop app
- **Mammoth.js** — Word document conversion
- **Marked** — Markdown parsing
- **textutil** — macOS native RTF conversion

## Contributing

Contributions welcome! Feel free to:
- 🐛 Report bugs
- 💡 Suggest features
- 🔧 Submit PRs

## License

MIT License — do whatever you want with it! See [LICENSE](LICENSE) for details.

---

Made with ❤️ for the AI community
