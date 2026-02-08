import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { CanvasEditor } from '../src/CanvasEditor.js';

function createTestCanvas() {
    const eventListeners = new Map();
    const canvas = {
        width: 800,
        height: 600,
        tabIndex: 0,
        style: {},
        addEventListener: (event, handler) => {
            if (!eventListeners.has(event)) {
                eventListeners.set(event, []);
            }
            eventListeners.get(event).push(handler);
        },
        removeEventListener: (event, handler) => {
            if (eventListeners.has(event)) {
                const handlers = eventListeners.get(event);
                const index = handlers.indexOf(handler);
                if (index > -1) {
                    handlers.splice(index, 1);
                }
            }
        },
        focus: () => {},
        getContext: (type) => {
            let currentFont = '16px Arial';
            return {
                font: currentFont,
                fillStyle: '#000000',
                strokeStyle: '#000000',
                lineWidth: 1,
                save: () => {},
                restore: () => {},
                clearRect: () => {},
                fillRect: () => {},
                strokeRect: () => {},
                fillText: () => {},
                translate: () => {},
                scale: () => {},
                rotate: () => {},
                beginPath: () => {},
                moveTo: () => {},
                lineTo: () => {},
                stroke: () => {},
                fill: () => {},
                arc: () => {},
                measureText(text) {
                    const fontSizeMatch = currentFont.match(/(\d+)px/);
                    const fontSize = fontSizeMatch ? parseInt(fontSizeMatch[1]) : 16;
                    const charWidth = fontSize * 0.5;
                    return {
                        width: text.length * charWidth,
                        actualBoundingBoxAscent: fontSize * 0.75,
                        actualBoundingBoxDescent: fontSize * 0.25
                    };
                },
                set font(value) {
                    currentFont = value;
                },
                get font() {
                    return currentFont;
                }
            };
        }
    };
    canvas.eventListeners = eventListeners;
    return canvas;
}

// Mock requestAnimationFrame and cancelAnimationFrame
let animationFrameId = 0;
const animationFrameCallbacks = new Map();

global.requestAnimationFrame = (callback) => {
    const id = ++animationFrameId;
    animationFrameCallbacks.set(id, callback);
    return id;
};

global.cancelAnimationFrame = (id) => {
    animationFrameCallbacks.delete(id);
};

describe('Undo/Redo System', () => {
    let canvas;
    let editor;

    beforeEach(() => {
        canvas = createTestCanvas();
        editor = new CanvasEditor(canvas, {
            backgroundColor: '#ffffff',
            padding: 10
        });
    });

    it('should take initial snapshot', () => {
        assert.strictEqual(editor.history.length, 1);
        assert.strictEqual(editor.historyIndex, 0);
    });

    it('should undo typing', () => {
        // Type some text
        editor.chain.printableKeyPressed('H');
        editor.chain.printableKeyPressed('i');
        editor.takeSnapshot();

        assert.strictEqual(editor.getText(), 'Hi');

        // Undo
        editor.undo();

        assert.strictEqual(editor.getText(), '');
        assert.strictEqual(editor.historyIndex, 0);
    });

    it('should redo after undo', () => {
        // Type text
        editor.chain.printableKeyPressed('A');
        editor.takeSnapshot();

        // Undo
        editor.undo();
        assert.strictEqual(editor.getText(), '');

        // Redo
        editor.redo();
        assert.strictEqual(editor.getText(), 'A');
    });

    it('should clear redo history after new edit', () => {
        // Type text
        editor.chain.printableKeyPressed('A');
        editor.takeSnapshot();

        editor.chain.printableKeyPressed('B');
        editor.takeSnapshot();

        // Undo once
        editor.undo();
        assert.strictEqual(editor.getText(), 'A');
        assert.strictEqual(editor.history.length, 3);

        // Type new text (should clear redo)
        editor.chain.printableKeyPressed('C');
        editor.takeSnapshot();

        assert.strictEqual(editor.getText(), 'AC');
        assert.strictEqual(editor.history.length, 3); // Initial + A + AC
        assert.strictEqual(editor.historyIndex, 2);

        // Redo should do nothing
        const textBefore = editor.getText();
        editor.redo();
        assert.strictEqual(editor.getText(), textBefore);
    });

    it('should handle multiple undos', () => {
        // Type multiple characters
        editor.chain.printableKeyPressed('A');
        editor.takeSnapshot();

        editor.chain.printableKeyPressed('B');
        editor.takeSnapshot();

        editor.chain.printableKeyPressed('C');
        editor.takeSnapshot();

        assert.strictEqual(editor.getText(), 'ABC');

        // Undo 3 times
        editor.undo();
        assert.strictEqual(editor.getText(), 'AB');

        editor.undo();
        assert.strictEqual(editor.getText(), 'A');

        editor.undo();
        assert.strictEqual(editor.getText(), '');
    });

    it('should not undo beyond initial state', () => {
        editor.undo(); // Try to undo initial state
        assert.strictEqual(editor.historyIndex, 0);
        assert.strictEqual(editor.getText(), '');
    });

    it('should not redo beyond latest state', () => {
        editor.chain.printableKeyPressed('X');
        editor.takeSnapshot();

        const text = editor.getText();
        editor.redo(); // Already at latest
        assert.strictEqual(editor.getText(), text);
    });

    it('should handle undo/redo with newlines', () => {
        // Type text with newline
        editor.chain.printableKeyPressed('H');
        editor.chain.printableKeyPressed('i');
        editor.takeSnapshot();

        editor.chain.enterPressed();
        editor.takeSnapshot();

        editor.chain.printableKeyPressed('B');
        editor.chain.printableKeyPressed('y');
        editor.chain.printableKeyPressed('e');
        editor.takeSnapshot();

        assert.strictEqual(editor.getText(), 'Hi\nBye');

        // Undo
        editor.undo();
        assert.strictEqual(editor.getText(), 'Hi\n');

        editor.undo();
        assert.strictEqual(editor.getText(), 'Hi');

        // Redo
        editor.redo();
        assert.strictEqual(editor.getText(), 'Hi\n');

        editor.redo();
        assert.strictEqual(editor.getText(), 'Hi\nBye');
    });

    it('should preserve font properties in undo/redo', () => {
        // Type with default font
        editor.chain.printableKeyPressed('A');
        const fontBefore = editor.chain.currentFontProperties.size;
        editor.takeSnapshot();

        // Change font size
        editor.chain.setFontSize(24);
        editor.chain.printableKeyPressed('B');
        editor.takeSnapshot();

        // Undo
        editor.undo();

        // Check that we're back to original
        const items = editor.chain.getItems();
        const textLinks = items.filter(item => item.constructor.name === 'TextLink');
        assert.strictEqual(textLinks.length, 1);
        assert.strictEqual(textLinks[0].text, 'A');
        assert.strictEqual(textLinks[0].intrinsic.fontProperties.size, fontBefore);
    });

    it('should handle backspace in undo/redo', () => {
        // Type text
        editor.chain.printableKeyPressed('H');
        editor.chain.printableKeyPressed('e');
        editor.chain.printableKeyPressed('l');
        editor.chain.printableKeyPressed('l');
        editor.chain.printableKeyPressed('o');
        editor.takeSnapshot();

        assert.strictEqual(editor.getText(), 'Hello');

        // Backspace
        editor.takeSnapshot();
        editor.chain.backspacePressed();
        editor.takeSnapshot();

        assert.strictEqual(editor.getText(), 'Hell');

        // Undo backspace
        editor.undo();
        editor.undo();
        assert.strictEqual(editor.getText(), 'Hello');

        // Redo backspace
        editor.redo();
        editor.redo();
        assert.strictEqual(editor.getText(), 'Hell');
    });

    it('should limit history size', () => {
        // Set small max history for testing
        editor.maxHistorySize = 5;
        editor.history = [editor.history[0]]; // Reset to initial
        editor.historyIndex = 0;

        // Add more than maxHistorySize snapshots
        for (let i = 0; i < 10; i++) {
            editor.chain.printableKeyPressed('A');
            editor.takeSnapshot();
        }

        // History should be capped at maxHistorySize
        assert.ok(editor.history.length <= editor.maxHistorySize);
    });
});
