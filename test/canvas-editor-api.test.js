import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { CanvasEditor } from '../src/CanvasEditor.js';

// Mock requestAnimationFrame and cancelAnimationFrame for Node.js environment
let animationFrameId = 0;
const animationFrameCallbacks = new Map();

global.requestAnimationFrame = (callback) => {
    const id = ++animationFrameId;
    animationFrameCallbacks.set(id, callback);
    // Don't actually call the callback - we don't need animation in tests
    return id;
};

global.cancelAnimationFrame = (id) => {
    animationFrameCallbacks.delete(id);
};

describe('CanvasEditor API', () => {

    function createTestCanvas() {
        // Create a mock canvas object
        const eventListeners = new Map();
        const canvas = {
            width: 800,
            height: 600,
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
            getContext: (type) => {
                let currentFont = '16px Arial';
                let currentFillStyle = '#000000';
                return {
                    get font() {
                        return currentFont;
                    },
                    set font(value) {
                        currentFont = value;
                    },
                    get fillStyle() {
                        return currentFillStyle;
                    },
                    set fillStyle(value) {
                        currentFillStyle = value;
                    },
                    save() {},
                    restore() {},
                    translate() {},
                    scale() {},
                    rotate() {},
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
                    clearRect() {},
                    fillRect() {},
                    fillText() {},
                    strokeRect() {},
                    strokeText() {},
                    beginPath() {},
                    moveTo() {},
                    lineTo() {},
                    stroke() {},
                    fill() {},
                    clip() {},
                    setLineDash() {},
                    getLineDash() { return []; }
                };
            }
        };
        return canvas;
    }

    describe('Constructor', () => {

        it('should create editor with canvas', () => {
            const canvas = createTestCanvas();
            const editor = new CanvasEditor(canvas);

            assert.ok(editor);
            assert.strictEqual(editor.canvas, canvas);
        });

        it('should use default options', () => {
            const canvas = createTestCanvas();
            const editor = new CanvasEditor(canvas);

            assert.strictEqual(editor.options.backgroundColor, '#ffffff');
            assert.strictEqual(editor.options.cursorColor, '#000000');
            assert.strictEqual(editor.options.defaultFontSize, 16);
            assert.strictEqual(editor.options.defaultFontFamily, 'Arial');
        });

        it('should accept custom options', () => {
            const canvas = createTestCanvas();
            const editor = new CanvasEditor(canvas, {
                backgroundColor: '#f0f0f0',
                cursorColor: '#ff0000',
                defaultFontSize: 20,
                defaultFontFamily: 'Georgia',
                padding: 20
            });

            assert.strictEqual(editor.options.backgroundColor, '#f0f0f0');
            assert.strictEqual(editor.options.cursorColor, '#ff0000');
            assert.strictEqual(editor.options.defaultFontSize, 20);
            assert.strictEqual(editor.options.defaultFontFamily, 'Georgia');
            assert.strictEqual(editor.options.padding, 20);
        });

        it('should initialize with empty content', () => {
            const canvas = createTestCanvas();
            const editor = new CanvasEditor(canvas);

            assert.strictEqual(editor.getText(), '');
        });

        it('should calculate editor width correctly', () => {
            const canvas = createTestCanvas();
            const editor = new CanvasEditor(canvas, { padding: 10 });

            assert.strictEqual(editor.editorWidth, 780); // 800 - 20
        });
    });

    describe('getText', () => {

        it('should return empty string for new editor', () => {
            const canvas = createTestCanvas();
            const editor = new CanvasEditor(canvas);

            assert.strictEqual(editor.getText(), '');
        });

        it('should return text after typing', () => {
            const canvas = createTestCanvas();
            const editor = new CanvasEditor(canvas);

            editor.chain.printableKeyPressed('H');
            editor.chain.printableKeyPressed('i');

            assert.strictEqual(editor.getText(), 'Hi');
        });

        it('should include newlines', () => {
            const canvas = createTestCanvas();
            const editor = new CanvasEditor(canvas);

            editor.chain.printableKeyPressed('A');
            editor.chain.enterPressed();
            editor.chain.printableKeyPressed('B');

            assert.strictEqual(editor.getText(), 'A\nB');
        });

        it('should handle multiple newlines', () => {
            const canvas = createTestCanvas();
            const editor = new CanvasEditor(canvas);

            editor.chain.printableKeyPressed('A');
            editor.chain.enterPressed();
            editor.chain.enterPressed();
            editor.chain.printableKeyPressed('B');

            assert.strictEqual(editor.getText(), 'A\n\nB');
        });
    });

    describe('setText', () => {

        it('should set simple text', () => {
            const canvas = createTestCanvas();
            const editor = new CanvasEditor(canvas);

            editor.setText('Hello');

            assert.strictEqual(editor.getText(), 'Hello');
        });

        it('should set text with newlines', () => {
            const canvas = createTestCanvas();
            const editor = new CanvasEditor(canvas);

            editor.setText('Line 1\nLine 2\nLine 3');

            assert.strictEqual(editor.getText(), 'Line 1\nLine 2\nLine 3');
        });

        it('should replace existing text', () => {
            const canvas = createTestCanvas();
            const editor = new CanvasEditor(canvas);

            editor.setText('First');
            assert.strictEqual(editor.getText(), 'First');

            editor.setText('Second');
            assert.strictEqual(editor.getText(), 'Second');
        });

        it('should handle empty string', () => {
            const canvas = createTestCanvas();
            const editor = new CanvasEditor(canvas);

            editor.setText('Hello');
            editor.setText('');

            assert.strictEqual(editor.getText(), '');
        });

        it('should handle special characters', () => {
            const canvas = createTestCanvas();
            const editor = new CanvasEditor(canvas);

            editor.setText('Hello! @#$%^&*()');

            assert.strictEqual(editor.getText(), 'Hello! @#$%^&*()');
        });

        it('should handle long text', () => {
            const canvas = createTestCanvas();
            const editor = new CanvasEditor(canvas);

            const longText = 'A'.repeat(1000);
            editor.setText(longText);

            assert.strictEqual(editor.getText(), longText);
        });
    });

    describe('clear', () => {

        it('should clear empty editor', () => {
            const canvas = createTestCanvas();
            const editor = new CanvasEditor(canvas);

            editor.clear();

            assert.strictEqual(editor.getText(), '');
        });

        it('should clear text', () => {
            const canvas = createTestCanvas();
            const editor = new CanvasEditor(canvas);

            editor.setText('Hello World');
            editor.clear();

            assert.strictEqual(editor.getText(), '');
        });

        it('should clear multiple lines', () => {
            const canvas = createTestCanvas();
            const editor = new CanvasEditor(canvas);

            editor.setText('Line 1\nLine 2\nLine 3');
            editor.clear();

            assert.strictEqual(editor.getText(), '');
        });

        it('should allow typing after clear', () => {
            const canvas = createTestCanvas();
            const editor = new CanvasEditor(canvas);

            editor.setText('Hello');
            editor.clear();
            editor.chain.printableKeyPressed('N');
            editor.chain.printableKeyPressed('e');
            editor.chain.printableKeyPressed('w');

            assert.strictEqual(editor.getText(), 'New');
        });
    });

    describe('resize', () => {

        it('should update canvas dimensions', () => {
            const canvas = createTestCanvas();
            const editor = new CanvasEditor(canvas);

            editor.resize(1000, 800);

            assert.strictEqual(editor.canvas.width, 1000);
            assert.strictEqual(editor.canvas.height, 800);
        });

        it('should update editor width', () => {
            const canvas = createTestCanvas();
            const editor = new CanvasEditor(canvas, { padding: 10 });

            editor.resize(1000, 800);

            assert.strictEqual(editor.editorWidth, 980); // 1000 - 20
        });

        it('should preserve text after resize', () => {
            const canvas = createTestCanvas();
            const editor = new CanvasEditor(canvas);

            editor.setText('Hello World');
            editor.resize(1000, 800);

            assert.strictEqual(editor.getText(), 'Hello World');
        });

        it('should handle small canvas', () => {
            const canvas = createTestCanvas();
            const editor = new CanvasEditor(canvas);

            editor.setText('Hello');
            editor.resize(200, 100);

            assert.strictEqual(editor.canvas.width, 200);
            assert.strictEqual(editor.canvas.height, 100);
        });

        it('should handle large canvas', () => {
            const canvas = createTestCanvas();
            const editor = new CanvasEditor(canvas);

            editor.setText('Hello');
            editor.resize(2000, 1500);

            assert.strictEqual(editor.canvas.width, 2000);
            assert.strictEqual(editor.canvas.height, 1500);
        });
    });

    describe('setFontSize', () => {

        it('should change font size for future typing', () => {
            const canvas = createTestCanvas();
            const editor = new CanvasEditor(canvas);

            editor.setFontSize(24);

            assert.strictEqual(editor.chain.currentFontProperties.size, 24);
        });

        it('should handle various font sizes', () => {
            const canvas = createTestCanvas();
            const editor = new CanvasEditor(canvas);

            editor.setFontSize(12);
            assert.strictEqual(editor.chain.currentFontProperties.size, 12);

            editor.setFontSize(48);
            assert.strictEqual(editor.chain.currentFontProperties.size, 48);
        });

        it('should not affect existing text', () => {
            const canvas = createTestCanvas();
            const editor = new CanvasEditor(canvas);

            editor.setText('Hello');
            const items1 = editor.chain.getItems();

            editor.setFontSize(24);
            const items2 = editor.chain.getItems();

            // Existing text should maintain original font size
            assert.strictEqual(items1.length, items2.length);
        });
    });

    describe('setFontFamily', () => {

        it('should change font family for future typing', () => {
            const canvas = createTestCanvas();
            const editor = new CanvasEditor(canvas);

            editor.setFontFamily('Georgia');

            assert.strictEqual(editor.chain.currentFontProperties.family, 'Georgia');
        });

        it('should handle various font families', () => {
            const canvas = createTestCanvas();
            const editor = new CanvasEditor(canvas);

            editor.setFontFamily('Times New Roman');
            assert.strictEqual(editor.chain.currentFontProperties.family, 'Times New Roman');

            editor.setFontFamily('Courier');
            assert.strictEqual(editor.chain.currentFontProperties.family, 'Courier');
        });

        it('should not affect existing text', () => {
            const canvas = createTestCanvas();
            const editor = new CanvasEditor(canvas);

            editor.setText('Hello');
            const items1 = editor.chain.getItems();

            editor.setFontFamily('Georgia');
            const items2 = editor.chain.getItems();

            // Existing text should maintain original font family
            assert.strictEqual(items1.length, items2.length);
        });
    });

    describe('destroy', () => {

        it('should clean up resources', () => {
            const canvas = createTestCanvas();
            const editor = new CanvasEditor(canvas);

            editor.destroy();

            // Animation frame should be cancelled
            assert.strictEqual(editor.animationFrameId, null);
        });

        it('should be safe to call multiple times', () => {
            const canvas = createTestCanvas();
            const editor = new CanvasEditor(canvas);

            editor.destroy();
            editor.destroy();

            assert.strictEqual(editor.animationFrameId, null);
        });
    });

    describe('dumpState', () => {

        it('should return state object', () => {
            const canvas = createTestCanvas();
            const editor = new CanvasEditor(canvas);

            const state = editor.dumpState();

            assert.ok(state.canvasSize);
            assert.ok(state.options);
            assert.ok(state.currentFontProperties);
            assert.ok(state.chainState);
            assert.ok(typeof state.text === 'string');
        });

        it('should include canvas dimensions', () => {
            const canvas = createTestCanvas();
            const editor = new CanvasEditor(canvas);

            const state = editor.dumpState();

            assert.strictEqual(state.canvasSize.width, 800);
            assert.strictEqual(state.canvasSize.height, 600);
        });

        it('should include current text', () => {
            const canvas = createTestCanvas();
            const editor = new CanvasEditor(canvas);

            editor.setText('Hello World');
            const state = editor.dumpState();

            assert.strictEqual(state.text, 'Hello World');
        });

        it('should include editor width', () => {
            const canvas = createTestCanvas();
            const editor = new CanvasEditor(canvas, { padding: 10 });

            const state = editor.dumpState();

            assert.strictEqual(state.editorWidth, 780);
        });
    });

    describe('Integration scenarios', () => {

        it('should handle complete workflow', () => {
            const canvas = createTestCanvas();
            const editor = new CanvasEditor(canvas);

            editor.setText('Initial text');
            assert.strictEqual(editor.getText(), 'Initial text');

            editor.setFontSize(20);
            editor.chain.printableKeyPressed('!');

            editor.clear();
            assert.strictEqual(editor.getText(), '');

            editor.setText('New text');
            assert.strictEqual(editor.getText(), 'New text');
        });

        it('should handle resize and text operations', () => {
            const canvas = createTestCanvas();
            const editor = new CanvasEditor(canvas);

            editor.setText('Hello');
            editor.resize(1000, 800);
            editor.setText('World');

            assert.strictEqual(editor.getText(), 'World');
            assert.strictEqual(editor.canvas.width, 1000);
        });

        it('should handle font changes and text operations', () => {
            const canvas = createTestCanvas();
            const editor = new CanvasEditor(canvas);

            editor.setFontSize(16);
            editor.setText('Small');

            editor.setFontSize(24);
            editor.clear();
            editor.setText('Large');

            assert.strictEqual(editor.getText(), 'Large');
        });
    });
});
