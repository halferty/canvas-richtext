import { describe, it } from 'node:test';
import assert from 'node:assert';
import { CanvasEditor } from '../src/CanvasEditor.js';
import { CursorLink } from '../src/ChainLink.js';

global.requestAnimationFrame = global.requestAnimationFrame || (() => 0);
global.cancelAnimationFrame = global.cancelAnimationFrame || (() => {});

function createTestCanvas(width = 800, height = 120) {
    const eventListeners = new Map();
    return {
        width,
        height,
        style: {},
        tabIndex: 0,
        focus() {},
        getBoundingClientRect() { return { left: 0, top: 0, width, height }; },
        addEventListener(event, handler) {
            if (!eventListeners.has(event)) eventListeners.set(event, []);
            eventListeners.get(event).push(handler);
        },
        removeEventListener() {},
        getContext() {
            let currentFont = '16px Arial';
            let currentFillStyle = '#000000';
            return {
                get font() { return currentFont; },
                set font(v) { currentFont = v; },
                get fillStyle() { return currentFillStyle; },
                set fillStyle(v) { currentFillStyle = v; },
                save() {}, restore() {}, translate() {}, scale() {}, rotate() {},
                measureText(text) {
                    const m = currentFont.match(/(\d+)px/);
                    const fontSize = m ? parseInt(m[1]) : 16;
                    return {
                        width: text.length * fontSize * 0.5,
                        actualBoundingBoxAscent: fontSize * 0.75,
                        actualBoundingBoxDescent: fontSize * 0.25
                    };
                },
                clearRect() {}, fillRect() {}, fillText() {}, strokeRect() {},
                strokeText() {}, beginPath() {}, moveTo() {}, lineTo() {},
                stroke() {}, fill() {}, clip() {}, setLineDash() {}, getLineDash() { return []; }
            };
        }
    };
}

function key(k, opts = {}) {
    return {
        key: k,
        ctrlKey: opts.ctrl || false,
        metaKey: false,
        shiftKey: opts.shift || false,
        preventDefault() {}
    };
}

// Type n lines of "aaaa" separated by Enter via the real key handler.
function typeLines(editor, n) {
    for (let i = 0; i < n; i++) {
        for (const ch of 'aaaa') editor.handleKeyDown(key(ch));
        if (i < n - 1) editor.handleKeyDown(key('Enter'));
    }
}

function cursorPosY(editor) {
    const c = editor.chain.getItems().find(i => i instanceof CursorLink);
    return c.computed.posY;
}

describe('Vertical scrolling', () => {

    it('a short document does not scroll', () => {
        const editor = new CanvasEditor(createTestCanvas(800, 600));
        typeLines(editor, 2);
        assert.strictEqual(editor.getMaxScroll(), 0);
        editor.handleWheel({ deltaY: 500, preventDefault() {} });
        assert.strictEqual(editor.scrollY, 0);
    });

    it('a long document becomes scrollable', () => {
        const editor = new CanvasEditor(createTestCanvas(800, 120));
        typeLines(editor, 30);
        assert.ok(editor.chain.contentHeight > editor.getViewportHeight());
        assert.ok(editor.getMaxScroll() > 0);
    });

    it('wheel scrolls and clamps within bounds', () => {
        const editor = new CanvasEditor(createTestCanvas(800, 120));
        typeLines(editor, 30);

        editor.handleWheel({ deltaY: 1e6, preventDefault() {} });
        assert.strictEqual(editor.scrollY, editor.getMaxScroll());

        editor.handleWheel({ deltaY: -1e6, preventDefault() {} });
        assert.strictEqual(editor.scrollY, 0);
    });

    it('typing auto-scrolls to keep the cursor visible', () => {
        const editor = new CanvasEditor(createTestCanvas(800, 120));
        typeLines(editor, 30);

        // Cursor is at the end of the document, which must be within the viewport.
        const viewport = editor.getViewportHeight();
        assert.ok(editor.scrollY > 0);
        assert.ok(cursorPosY(editor) <= editor.scrollY + viewport + 1);
    });

    it('moving to document start scrolls back to the top', () => {
        const editor = new CanvasEditor(createTestCanvas(800, 120));
        typeLines(editor, 30);
        assert.ok(editor.scrollY > 0);

        editor.handleKeyDown(key('Home', { ctrl: true })); // Ctrl+Home
        assert.strictEqual(editor.scrollY, 0);
    });

    it('wheel scrolling is not yanked back by a plain render', () => {
        const editor = new CanvasEditor(createTestCanvas(800, 120));
        typeLines(editor, 30);

        // Scroll up to the top while the cursor stays at the bottom.
        editor.handleWheel({ deltaY: -1e6, preventDefault() {} });
        assert.strictEqual(editor.scrollY, 0);

        // A render triggered by, e.g., cursor blink must not jump to the cursor.
        editor.render();
        assert.strictEqual(editor.scrollY, 0);
    });
});

describe('PageUp / PageDown', () => {

    it('PageDown moves the cursor down and scrolls', () => {
        const editor = new CanvasEditor(createTestCanvas(800, 120));
        typeLines(editor, 30);
        editor.handleKeyDown(key('Home', { ctrl: true })); // top
        assert.strictEqual(editor.scrollY, 0);
        const yBefore = cursorPosY(editor);

        editor.handleKeyDown(key('PageDown'));

        assert.ok(cursorPosY(editor) > yBefore);
        assert.ok(editor.scrollY > 0);
    });

    it('PageUp moves the cursor up and scrolls toward the top', () => {
        const editor = new CanvasEditor(createTestCanvas(800, 120));
        typeLines(editor, 30);
        const yBefore = cursorPosY(editor); // at bottom
        const scrollBefore = editor.scrollY;

        editor.handleKeyDown(key('PageUp'));

        assert.ok(cursorPosY(editor) < yBefore);
        assert.ok(editor.scrollY < scrollBefore);
    });

    it('Shift+PageDown extends a selection', () => {
        const editor = new CanvasEditor(createTestCanvas(800, 120));
        typeLines(editor, 30);
        editor.handleKeyDown(key('Home', { ctrl: true })); // top, no selection

        editor.handleKeyDown(key('PageDown', { shift: true }));

        assert.ok(editor.chain.hasSelection());
        assert.strictEqual(editor.chain.selectionStart, 0);
    });

    it('PageDown clamps at the end of the document', () => {
        const editor = new CanvasEditor(createTestCanvas(800, 120));
        typeLines(editor, 5);
        // Repeated PageDown should never push scroll past the max.
        editor.handleKeyDown(key('PageDown'));
        editor.handleKeyDown(key('PageDown'));
        editor.handleKeyDown(key('PageDown'));
        assert.ok(editor.scrollY <= editor.getMaxScroll());
        assert.ok(editor.scrollY >= 0);
    });
});
