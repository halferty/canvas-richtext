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
    return { key: k, ctrlKey: opts.ctrl || false, metaKey: false, shiftKey: opts.shift || false, preventDefault() {} };
}

function typeLines(editor, n) {
    for (let i = 0; i < n; i++) {
        for (const ch of 'aaaa') editor.handleKeyDown(key(ch));
        if (i < n - 1) editor.handleKeyDown(key('Enter'));
    }
}

// Touch event with one touch point. touchend uses changedTouches in browsers,
// but the implementation reads stored touchStart coords, so touches is enough.
function touch(clientX, clientY) {
    return {
        touches: [{ clientX, clientY }],
        changedTouches: [{ clientX, clientY }],
        preventDefault() {}
    };
}

function endTouch() {
    return { touches: [], changedTouches: [], preventDefault() {} };
}

describe('Touch support', () => {

    it('a tap positions the cursor without scrolling', () => {
        const editor = new CanvasEditor(createTestCanvas(800, 600));
        for (const ch of 'hello world') editor.handleKeyDown(key(ch));
        editor.handleKeyDown(key('Home', { ctrl: true })); // cursor at 0

        // Tap near the start of the text.
        editor.handleTouchStart(touch(40, 20));
        editor.handleTouchEnd(endTouch());

        // The cursor moved away from position 0 to where we tapped.
        assert.ok(editor.chain.getCursorCharPosition() > 0);
        assert.strictEqual(editor.scrollY, 0);
    });

    it('a vertical drag scrolls the content', () => {
        const editor = new CanvasEditor(createTestCanvas(800, 120));
        typeLines(editor, 30);
        editor.handleKeyDown(key('Home', { ctrl: true })); // top
        assert.strictEqual(editor.scrollY, 0);

        // Finger goes down the screen by 50px -> content scrolls down.
        editor.handleTouchStart(touch(100, 100));
        editor.handleTouchMove(touch(100, 50));
        editor.handleTouchEnd(endTouch());

        assert.ok(editor.scrollY > 0);
    });

    it('a drag does not place the cursor (treated as scroll, not tap)', () => {
        const editor = new CanvasEditor(createTestCanvas(800, 120));
        typeLines(editor, 30);
        editor.handleKeyDown(key('Home', { ctrl: true }));
        const before = editor.chain.getCursorCharPosition();

        editor.handleTouchStart(touch(100, 100));
        editor.handleTouchMove(touch(100, 40));
        editor.handleTouchEnd(endTouch());

        assert.strictEqual(editor.chain.getCursorCharPosition(), before);
    });

    it('drag-to-scroll clamps within bounds', () => {
        const editor = new CanvasEditor(createTestCanvas(800, 120));
        typeLines(editor, 30);

        // Huge upward finger movement -> clamp at max scroll.
        editor.handleTouchStart(touch(100, 1000));
        editor.handleTouchMove(touch(100, 0));
        editor.handleTouchEnd(endTouch());
        assert.strictEqual(editor.scrollY, editor.getMaxScroll());

        // Huge downward movement -> clamp at 0.
        editor.handleTouchStart(touch(100, 0));
        editor.handleTouchMove(touch(100, 1000));
        editor.handleTouchEnd(endTouch());
        assert.strictEqual(editor.scrollY, 0);
    });

    it('touching the scrollbar drives it', () => {
        const editor = new CanvasEditor(createTestCanvas(800, 120));
        typeLines(editor, 30);
        editor.scrollY = 0;

        const m = editor.getScrollbarMetrics();
        editor.handleTouchStart(touch(m.trackX + 2, m.thumbY));
        assert.ok(editor.isScrollbarDragging);

        editor.handleTouchMove(touch(m.trackX + 2, m.trackHeight - m.thumbHeight));
        assert.strictEqual(editor.scrollY, editor.getMaxScroll());

        editor.handleTouchEnd(endTouch());
        assert.ok(!editor.isScrollbarDragging);
    });

    it('does not scroll a document that fits', () => {
        const editor = new CanvasEditor(createTestCanvas(800, 600));
        typeLines(editor, 2);

        editor.handleTouchStart(touch(100, 100));
        editor.handleTouchMove(touch(100, 20));
        editor.handleTouchEnd(endTouch());

        assert.strictEqual(editor.scrollY, 0);
    });

    it('ignores multi-touch gestures', () => {
        const editor = new CanvasEditor(createTestCanvas(800, 120));
        typeLines(editor, 30);
        const before = editor.scrollY;

        const multi = {
            touches: [{ clientX: 100, clientY: 100 }, { clientX: 200, clientY: 100 }],
            changedTouches: [],
            preventDefault() {}
        };
        editor.handleTouchStart(multi);
        editor.handleTouchMove({ ...multi, touches: [{ clientX: 100, clientY: 50 }, { clientX: 200, clientY: 50 }] });

        assert.strictEqual(editor.scrollY, before);
    });
});
