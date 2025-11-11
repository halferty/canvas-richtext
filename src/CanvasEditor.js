import { Chain } from './Chain.js';
import { FontProperties } from './FontProperties.js';
import { TextLink, CursorLink } from './ChainLink.js';

/**
 * CanvasEditor - Main editor class that manages the canvas, rendering, and user interactions
 */
export class CanvasEditor {
    constructor(canvas, options = {}) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        
        // Options with defaults
        this.options = {
            backgroundColor: options.backgroundColor || '#ffffff',
            cursorColor: options.cursorColor || '#000000',
            cursorWidth: options.cursorWidth || 2,
            cursorBlinkRate: options.cursorBlinkRate || 530,
            padding: options.padding || 10,
            defaultFontSize: options.defaultFontSize || 16,
            defaultFontFamily: options.defaultFontFamily || 'Arial',
            defaultFontWeight: options.defaultFontWeight || 'normal',
            defaultFontStyle: options.defaultFontStyle || 'normal',
            debug: options.debug || false
        };

        // Initialize font properties
        this.defaultFontProperties = new FontProperties(
            this.options.defaultFontSize,
            this.options.defaultFontFamily,
            this.options.defaultFontWeight,
            this.options.defaultFontStyle
        );

        // Calculate editor width
        this.editorWidth = this.canvas.width - (this.options.padding * 2);

        // Initialize the chain
        this.chain = new Chain(this.editorWidth, this.ctx, this.defaultFontProperties);

        // Cursor blink state
        this.cursorVisible = true;
        this.lastBlinkTime = Date.now();

        // Event listeners
        this.setupEventListeners();

        // Initial render
        this.render();
        this.startAnimationLoop();
    }

    setupEventListeners() {
        // Keyboard events
        this.canvas.addEventListener('keydown', (e) => this.handleKeyDown(e));
        
        // Mouse events
        this.canvas.addEventListener('click', (e) => this.handleClick(e));

        // Make canvas focusable
        this.canvas.tabIndex = 1;
    }

    handleKeyDown(e) {
        const key = e.key;

        // Prevent default for most editor keys
        if (key === 'Backspace' || key === 'Enter' || key === 'ArrowLeft' || key === 'ArrowRight') {
            e.preventDefault();
        }

        if (key === 'Backspace') {
            this.chain.backspacePressed();
            this.render();
        } else if (key === 'Enter') {
            this.chain.enterPressed();
            this.render();
        } else if (key === 'ArrowLeft') {
            this.chain.leftArrowPressed();
            this.render();
        } else if (key === 'ArrowRight') {
            this.chain.rightArrowPressed();
            this.render();
        } else if (key.length === 1 && !e.ctrlKey && !e.metaKey) {
            // Printable character
            this.chain.printableKeyPressed(key);
            this.render();
        }

        // Reset cursor blink
        this.cursorVisible = true;
        this.lastBlinkTime = Date.now();
    }

    handleClick(e) {
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left - this.options.padding;
        const y = e.clientY - rect.top - this.options.padding;
        
        this.chain.clicked(x, y);
        this.render();

        // Reset cursor blink
        this.cursorVisible = true;
        this.lastBlinkTime = Date.now();

        // Focus the canvas
        this.canvas.focus();
    }

    startAnimationLoop() {
        const animate = () => {
            const now = Date.now();
            if (now - this.lastBlinkTime > this.options.cursorBlinkRate) {
                this.cursorVisible = !this.cursorVisible;
                this.lastBlinkTime = now;
                this.render();
            }
            requestAnimationFrame(animate);
        };
        requestAnimationFrame(animate);
    }

    render() {
        // Clear canvas
        this.ctx.fillStyle = this.options.backgroundColor;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Translate for padding
        this.ctx.save();
        this.ctx.translate(this.options.padding, this.options.padding);

        // Render all items in the chain
        const items = this.chain.getItems();
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            
            if (item instanceof TextLink) {
                this.renderTextLink(item);
            } else if (item instanceof CursorLink) {
                this.renderCursor(item);
            }
        }

        this.ctx.restore();
    }

    renderTextLink(textLink) {
        const posX = textLink.getPosX();
        const posY = textLink.getPosY();
        const fontProps = textLink.getFontProperties();

        this.ctx.font = fontProps.toFontString();
        this.ctx.fillStyle = '#000000';
        this.ctx.fillText(textLink.text, posX, posY);
    }

    renderCursor(cursor) {
        if (!this.cursorVisible) return;

        const posX = cursor.computed.posX;
        const posY = cursor.computed.posY;
        const height = cursor.computed.height || this.options.defaultFontSize;

        this.ctx.fillStyle = this.options.cursorColor;
        this.ctx.fillRect(posX, posY - height, this.options.cursorWidth, height);
    }

    // Public API methods
    setFontSize(size) {
        this.chain.setFontSize(size);
        this.render();
    }

    setFontFamily(family) {
        this.chain.setFontFamily(family);
        this.render();
    }

    getText() {
        const items = this.chain.getItems();
        let text = '';
        for (let item of items) {
            if (item instanceof TextLink) {
                text += item.text;
            }
        }
        return text;
    }

    setText(text) {
        // Clear the chain and insert text
        this.chain.items = [new CursorLink()];
        for (let char of text) {
            if (char === '\n') {
                this.chain.enterPressed();
            } else {
                this.chain.printableKeyPressed(char);
            }
        }
        this.render();
    }

    clear() {
        this.chain.items = [new CursorLink()];
        this.chain.recalc();
        this.render();
    }

    resize(width, height) {
        this.canvas.width = width;
        this.canvas.height = height;
        this.editorWidth = width - (this.options.padding * 2);
        this.chain.setWidth(this.editorWidth);
        this.render();
    }

    destroy() {
        // Clean up event listeners
        this.canvas.removeEventListener('keydown', this.handleKeyDown);
        this.canvas.removeEventListener('click', this.handleClick);
    }
}
