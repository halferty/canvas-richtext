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

// Mock clipboard API
let clipboardContent = '';

// Safely mock navigator.clipboard
if (!globalThis.navigator) {
    globalThis.navigator = {};
}
globalThis.navigator.clipboard = {
    writeText: async (text) => {
        clipboardContent = text;
    },
    readText: async () => {
        return clipboardContent;
    }
};

describe('Clipboard Operations', () => {
    let canvas;
    let editor;

    beforeEach(() => {
        canvas = createTestCanvas();
        editor = new CanvasEditor(canvas, {
            backgroundColor: '#ffffff',
            padding: 10
        });
        clipboardContent = ''; // Reset clipboard
    });

    describe('Select All', () => {
        it('should select all text', () => {
            // Type some text
            editor.chain.printableKeyPressed('H');
            editor.chain.printableKeyPressed('e');
            editor.chain.printableKeyPressed('l');
            editor.chain.printableKeyPressed('l');
            editor.chain.printableKeyPressed('o');

            // Select all
            editor.selectAll();

            assert.strictEqual(editor.chain.hasSelection(), true);
            assert.strictEqual(editor.chain.selectionStart, 0);
            assert.strictEqual(editor.chain.selectionEnd, 5);
        });

        it('should select all text including newlines', () => {
            // Type text with newlines
            editor.chain.printableKeyPressed('H');
            editor.chain.printableKeyPressed('i');
            editor.chain.enterPressed();
            editor.chain.printableKeyPressed('B');
            editor.chain.printableKeyPressed('y');
            editor.chain.printableKeyPressed('e');

            // Select all
            editor.selectAll();

            assert.strictEqual(editor.chain.hasSelection(), true);
            assert.strictEqual(editor.chain.selectionStart, 0);
            assert.strictEqual(editor.chain.selectionEnd, 6); // "Hi\nBye" = 6 chars
        });

        it('should handle empty editor', () => {
            // Try to select all on empty editor
            editor.selectAll();

            // Should not have selection (nothing to select)
            assert.strictEqual(editor.chain.hasSelection(), false);
        });
    });

    describe('Copy', () => {
        it('should copy selected text to clipboard', async () => {
            // Type and select text
            editor.chain.printableKeyPressed('H');
            editor.chain.printableKeyPressed('e');
            editor.chain.printableKeyPressed('l');
            editor.chain.printableKeyPressed('l');
            editor.chain.printableKeyPressed('o');
            editor.chain.selectionStart = 0;
            editor.chain.selectionEnd = 5;

            // Copy
            await editor.copy();

            // Wait a tick for async clipboard
            await new Promise(resolve => setTimeout(resolve, 10));

            assert.strictEqual(clipboardContent, 'Hello');
        });

        it('should copy partial selection', async () => {
            // Type text
            editor.chain.printableKeyPressed('H');
            editor.chain.printableKeyPressed('e');
            editor.chain.printableKeyPressed('l');
            editor.chain.printableKeyPressed('l');
            editor.chain.printableKeyPressed('o');

            // Select "ell"
            editor.chain.selectionStart = 1;
            editor.chain.selectionEnd = 4;

            // Copy
            await editor.copy();
            await new Promise(resolve => setTimeout(resolve, 10));

            assert.strictEqual(clipboardContent, 'ell');
        });

        it('should do nothing if no selection', async () => {
            // Type text without selection
            editor.chain.printableKeyPressed('H');
            editor.chain.printableKeyPressed('i');

            clipboardContent = 'previous';

            // Try to copy without selection
            await editor.copy();
            await new Promise(resolve => setTimeout(resolve, 10));

            // Clipboard should be unchanged
            assert.strictEqual(clipboardContent, 'previous');
        });

        it('should copy text with newlines', async () => {
            // Type multi-line text
            editor.chain.printableKeyPressed('A');
            editor.chain.enterPressed();
            editor.chain.printableKeyPressed('B');

            // Select all
            editor.selectAll();

            // Copy
            await editor.copy();
            await new Promise(resolve => setTimeout(resolve, 10));

            assert.strictEqual(clipboardContent, 'A\nB');
        });
    });

    describe('Cut', () => {
        it('should cut selected text', async () => {
            // Type text
            editor.chain.printableKeyPressed('H');
            editor.chain.printableKeyPressed('e');
            editor.chain.printableKeyPressed('l');
            editor.chain.printableKeyPressed('l');
            editor.chain.printableKeyPressed('o');

            // Select all
            editor.selectAll();

            // Cut
            await editor.cut();
            await new Promise(resolve => setTimeout(resolve, 10));

            // Text should be in clipboard
            assert.strictEqual(clipboardContent, 'Hello');

            // Text should be removed from editor
            assert.strictEqual(editor.getText(), '');
        });

        it('should cut partial selection', async () => {
            // Type text
            editor.chain.printableKeyPressed('H');
            editor.chain.printableKeyPressed('e');
            editor.chain.printableKeyPressed('l');
            editor.chain.printableKeyPressed('l');
            editor.chain.printableKeyPressed('o');

            // Select "ell"
            editor.chain.selectionStart = 1;
            editor.chain.selectionEnd = 4;

            // Cut
            await editor.cut();
            await new Promise(resolve => setTimeout(resolve, 10));

            assert.strictEqual(clipboardContent, 'ell');
            assert.strictEqual(editor.getText(), 'Ho');
        });

        it('should do nothing if no selection', async () => {
            // Type text
            editor.chain.printableKeyPressed('H');
            editor.chain.printableKeyPressed('i');

            const textBefore = editor.getText();

            // Try to cut without selection
            await editor.cut();

            // Text should be unchanged
            assert.strictEqual(editor.getText(), textBefore);
        });
    });

    describe('Paste', () => {
        it('should paste text from clipboard', async () => {
            // Set clipboard content
            clipboardContent = 'World';

            // Type initial text
            editor.chain.printableKeyPressed('H');
            editor.chain.printableKeyPressed('e');
            editor.chain.printableKeyPressed('l');
            editor.chain.printableKeyPressed('l');
            editor.chain.printableKeyPressed('o');
            editor.chain.printableKeyPressed(' ');

            // Paste
            await editor.paste();
            await new Promise(resolve => setTimeout(resolve, 10));

            assert.strictEqual(editor.getText(), 'Hello World');
        });

        it('should replace selection with pasted text', async () => {
            // Set clipboard content
            clipboardContent = 'Goodbye';

            // Type and select text
            editor.chain.printableKeyPressed('H');
            editor.chain.printableKeyPressed('e');
            editor.chain.printableKeyPressed('l');
            editor.chain.printableKeyPressed('l');
            editor.chain.printableKeyPressed('o');
            editor.selectAll();

            // Paste (should replace selection)
            await editor.paste();
            await new Promise(resolve => setTimeout(resolve, 10));

            assert.strictEqual(editor.getText(), 'Goodbye');
        });

        it('should paste multi-line text', async () => {
            // Set multi-line clipboard content
            clipboardContent = 'Line1\nLine2\nLine3';

            // Paste
            await editor.paste();
            await new Promise(resolve => setTimeout(resolve, 10));

            assert.strictEqual(editor.getText(), 'Line1\nLine2\nLine3');
        });

        it('should handle empty clipboard', async () => {
            // Set empty clipboard
            clipboardContent = '';

            // Type text
            editor.chain.printableKeyPressed('H');
            editor.chain.printableKeyPressed('i');

            const textBefore = editor.getText();

            // Paste empty clipboard
            await editor.paste();
            await new Promise(resolve => setTimeout(resolve, 10));

            // Text should be unchanged
            assert.strictEqual(editor.getText(), textBefore);
        });
    });

    describe('Integration: Copy and Paste', () => {
        it('should copy from one editor and paste to same location', async () => {
            // Type text
            editor.chain.printableKeyPressed('T');
            editor.chain.printableKeyPressed('e');
            editor.chain.printableKeyPressed('s');
            editor.chain.printableKeyPressed('t');

            // Select all and copy
            editor.selectAll();
            await editor.copy();
            await new Promise(resolve => setTimeout(resolve, 10));

            // Clear editor
            editor.chain.clearSelection();
            editor.selectAll();
            editor.chain.backspacePressed();

            // Paste back
            await editor.paste();
            await new Promise(resolve => setTimeout(resolve, 10));

            assert.strictEqual(editor.getText(), 'Test');
        });

        it('should handle copy, cut, paste workflow', async () => {
            // Type text
            editor.setText('Hello World');

            // Select "Hello"
            editor.chain.selectionStart = 0;
            editor.chain.selectionEnd = 5;

            // Copy
            await editor.copy();
            await new Promise(resolve => setTimeout(resolve, 10));
            assert.strictEqual(clipboardContent, 'Hello');

            // Select " World"
            editor.chain.selectionStart = 5;
            editor.chain.selectionEnd = 11;

            // Cut
            await editor.cut();
            await new Promise(resolve => setTimeout(resolve, 10));
            assert.strictEqual(clipboardContent, ' World');
            assert.strictEqual(editor.getText(), 'Hello');

            // Paste back
            await editor.paste();
            await new Promise(resolve => setTimeout(resolve, 10));
            assert.strictEqual(editor.getText(), 'Hello World');
        });
    });
});
