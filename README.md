# canvas-richtext

A canvas-based rich-text editor for the web, inspired by Google Docs' rendering approach. This library provides a powerful, flexible text editing experience rendered entirely on HTML5 Canvas.

**[🚀 Live Demo](https://halferty.github.io/canvas-richtext/)** | **[📦 npm package](https://www.npmjs.com/package/canvas-richtext)**

![Tests](https://img.shields.io/badge/tests-429%20passing-brightgreen) ![Coverage](https://img.shields.io/badge/coverage-100%25-brightgreen) ![License](https://img.shields.io/badge/license-MIT-blue)

## Features

- 🎨 **Canvas-based rendering** - Smooth, high-performance text rendering
- ⌨️ **Full keyboard support** - Natural text editing with cursor movement, backspace, enter
- 🖱️ **Mouse interaction** - Click to position cursor anywhere in the text
- 📱 **Touch support** - Tap to position the cursor and drag to scroll on touch devices
- 📝 **Rich text support** - Multiple font sizes, families, weights, styles, text color, and highlight color
- 📋 **Lists** - Bulleted and numbered lists with hanging indents and automatic numbering
- ➖ **Horizontal rules** - Insert dividers that render on their own row
- 💾 **Save & load** - Serialize the full formatted document to/from JSON for persistence and autosave
- 🔄 **Automatic text wrapping** - Smart word-based line breaking
- 📜 **Scrolling** - Mouse-wheel, draggable scrollbar, and PageUp/PageDown with cursor auto-scroll for long documents
- 🎯 **Cursor management** - Blinking cursor with customizable appearance
- 🧩 **Modular architecture** - Clean separation of concerns with Chain/Link pattern

## Testing

This library features **100% synthetic testing** - all 429 tests run in Node.js without requiring a browser!

```bash
npm test
```

Our test suite includes:
- 📝 **Font property tests** - Constructor, cloning, matching, formatting
- 🔗 **Chain link tests** - All link types and their interactions
- ⌨️ **Keyboard input tests** - Typing, backspace, enter key handling
- ➡️ **Arrow navigation tests** - Left, right, up, down cursor movement
- 🖱️ **Click positioning tests** - Precise cursor placement via mouse
- ✂️ **Selection tests** - Text selection and manipulation
- 📐 **Text wrapping tests** - Word wrapping and line breaking
- 🎯 **Edge case tests** - Boundary conditions and error handling

**No Selenium, no Puppeteer, no headless browser needed** - just pure Node.js with synthetic canvas mocking!

## Installation

```bash
npm install canvas-richtext
```

## Quick Start

```javascript
import { CanvasEditor } from 'canvas-richtext';

// Get your canvas element
const canvas = document.getElementById('editor');

// Create the editor
const editor = new CanvasEditor(canvas, {
    backgroundColor: '#ffffff',
    cursorColor: '#000000',
    defaultFontSize: 16,
    defaultFontFamily: 'Arial',
    padding: 10
});

// Focus the canvas to start typing
canvas.focus();
```

## Basic Usage

### HTML Setup

```html
<!DOCTYPE html>
<html>
<head>
    <title>Canvas Editor Demo</title>
    <style>
        #editor {
            border: 1px solid #ccc;
            cursor: text;
        }
    </style>
</head>
<body>
    <canvas id="editor" width="800" height="600"></canvas>
    <script type="module" src="app.js"></script>
</body>
</html>
```

### JavaScript Setup

```javascript
import { CanvasEditor } from 'canvas-richtext';

const canvas = document.getElementById('editor');
const editor = new CanvasEditor(canvas);

// Set initial text
editor.setText('Hello, World!');

// Get current text
console.log(editor.getText());

// Change font size
editor.setFontSize(20);

// Change font family
editor.setFontFamily('Georgia');

// Clear the editor
editor.clear();

// Resize the canvas
editor.resize(1000, 800);
```

## Configuration Options

```javascript
const editor = new CanvasEditor(canvas, {
    // Background color of the canvas
    backgroundColor: '#ffffff',
    
    // Cursor appearance
    cursorColor: '#000000',
    cursorWidth: 2,
    cursorBlinkRate: 530, // milliseconds
    
    // Editor padding (pixels from edges)
    padding: 10,
    
    // Default font settings
    defaultFontSize: 16,
    defaultFontFamily: 'Arial',
    defaultFontWeight: 'normal',
    defaultFontStyle: 'normal',
    
    // Scrollbar appearance (shown only when content overflows)
    scrollbarWidth: 10,
    scrollbarTrackColor: 'rgba(0, 0, 0, 0.05)',
    scrollbarThumbColor: 'rgba(0, 0, 0, 0.3)',
    minScrollbarThumbHeight: 24,
    
    // Number of spaces inserted by the Tab key
    tabSize: 4,
    
    // Enable debug logging
    debug: false
});
```

## API Reference

### CanvasEditor

The main editor class that manages the canvas and user interactions.

#### Constructor

```javascript
new CanvasEditor(canvas: HTMLCanvasElement, options?: CanvasEditorOptions)
```

#### Methods

- **`getText(): string`** - Returns the current text content
- **`setText(text: string): void`** - Sets the text content
- **`clear(): void`** - Clears all content
- **`setFontSize(size: number): void`** - Changes the font size for new text
- **`setFontFamily(family: string): void`** - Changes the font family for new text
- **`setTextColor(color: string): void`** - Sets the text color (applies to the selection, or to new text)
- **`setHighlightColor(color: string | null): void`** - Sets the highlight/background color (pass `null` to clear)
- **`toggleBulletList(): void`** - Toggles a bulleted list across the selected paragraph(s)
- **`toggleNumberedList(): void`** - Toggles a numbered list across the selected paragraph(s)
- **`insertHorizontalRule(): void`** - Inserts a horizontal rule (divider) on its own line at the cursor
- **`toJSON(): object`** - Serializes the full document — text, per-run formatting, and paragraph alignment — to a plain, JSON-stringifiable object
- **`fromJSON(data: object | string): void`** - Restores a document previously produced by `toJSON()` (accepts the object or its JSON string)
- **`resize(width: number, height: number): void`** - Resizes the canvas
- **`destroy(): void`** - Cleans up event listeners and resources

#### Saving and loading documents

`toJSON()` / `fromJSON()` preserve rich formatting that plain `getText()`/`setText()` cannot — making them ideal for autosave and persistence:

```javascript
// Save (e.g. to localStorage or your backend)
const doc = editor.toJSON();
localStorage.setItem('myDoc', JSON.stringify(doc));

// Load later — restores text, fonts, colors, highlights, and alignment
editor.fromJSON(localStorage.getItem('myDoc'));
```

### Advanced Usage

#### Working with the Chain

For advanced use cases, you can access the underlying Chain structure:

```javascript
const chain = editor.chain;
const items = chain.getItems();

// Iterate through all text links
items.forEach(item => {
    if (item instanceof TextLink) {
        console.log('Text:', item.text);
        console.log('Position:', item.getPosX(), item.getPosY());
        console.log('Font:', item.getFontProperties());
    }
});
```

#### Custom Rendering

You can extend the CanvasEditor class to customize rendering:

```javascript
class CustomEditor extends CanvasEditor {
    renderTextLink(textLink) {
        // Custom rendering logic
        const ctx = this.ctx;
        const posX = textLink.getPosX();
        const posY = textLink.getPosY();
        
        // Add custom effects
        ctx.shadowBlur = 2;
        ctx.shadowColor = 'rgba(0,0,0,0.1)';
        
        super.renderTextLink(textLink);
        
        ctx.shadowBlur = 0;
    }
}
```

## Architecture

The library uses a chain-based architecture inspired by linked lists:

- **Chain**: Manages the sequence of text, cursor, and newline elements
- **ChainLink**: Base class for all elements in the chain
- **TextLink**: Represents a piece of text with specific font properties
- **CursorLink**: Represents the cursor position
- **NewlineLink**: Represents user-created line breaks
- **VirtualNewlineLink**: Represents automatic line wraps
- **FontProperties**: Encapsulates font styling information

This architecture allows for efficient text manipulation, smart word wrapping, and precise cursor positioning.

## Browser Support

- Chrome/Edge (latest)
- Firefox (latest)
- Safari (latest)
- Any browser with Canvas 2D context support

## Contributing

Contributions are welcome! Please feel free to submit issues or pull requests.

## License

BSD License - feel free to use this in your projects!

## Roadmap

Implemented:

- [x] Text selection and copy/paste
- [x] Undo/redo functionality
- [x] Bold, italic, underline formatting (plus strikethrough, super/subscript)
- [x] Multiple font colors
- [x] Text alignment (left, center, right)
- [x] Line height customization
- [x] Keyboard navigation (Home/End, word-wise Ctrl+Arrows, PageUp/PageDown)
- [x] Vertical scrolling for long documents
- [x] Touch device support

Still planned:

- [ ] Justified text alignment
- [ ] Canvas-based toolbar buttons

## Acknowledgments

Inspired by Google Docs' canvas-based text rendering approach, which provides smooth performance even with large documents.
