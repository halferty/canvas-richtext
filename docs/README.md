# Canvas RichText Editor - Live Demo

This directory contains the GitHub Pages demo for the Canvas RichText Editor.

## View Live Demo

🚀 **[Live Demo](https://halferty.github.io/canvas-richtext/)**

## Local Development

To run the demo locally:

1. Build the project:
   ```bash
   npm run build
   ```

2. Open `index.html` in your browser, or use a local server:
   ```bash
   # Using Python
   python -m http.server 8000

   # Using Node.js
   npx http-server
   ```

3. Navigate to `http://localhost:8000` in your browser

## GitHub Pages Setup

To enable GitHub Pages for this repository:

1. Go to your repository Settings
2. Navigate to "Pages" in the left sidebar
3. Under "Source", select:
   - **Source:** Deploy from a branch
   - **Branch:** Your main branch (or the branch with docs/)
   - **Folder:** `/docs`
4. Click "Save"

GitHub Pages will automatically deploy your site to:
`https://[username].github.io/[repository-name]/`

## Files

- `index.html` - Main demo page with interactive editor
- `canvas-editor.umd.js` - UMD build of the library (browser-compatible)
- `.nojekyll` - Prevents GitHub Pages from using Jekyll processing

## Features Demonstrated

- ✨ Real-time canvas-based text editing
- ⌨️ Full keyboard support (typing, arrows, backspace, enter)
- 🖱️ Click-to-position cursor placement
- 🎨 Dynamic font size and family changes
- 📝 Word wrapping and line breaking
- 🎯 Professional UI with gradient design
- 📊 Statistics showing 236 passing tests

## Customization

Feel free to customize the demo by editing `index.html`. The editor is initialized with:

```javascript
const editor = new CanvasEditor.CanvasEditor(canvas, {
    backgroundColor: '#ffffff',
    cursorColor: '#667eea',
    defaultFontSize: 16,
    defaultFontFamily: 'Arial',
    padding: 20
});
```

Modify these options to change the editor's appearance and behavior!
