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

function mouse(clientX, clientY) {
    return { clientX, clientY, preventDefault() {} };
}

function cursorCharPos(editor) {
    return editor.chain.getCursorCharPosition();
}

describe('Scrollbar geometry', () => {

    it('is hidden when content fits', () => {
        const editor = new CanvasEditor(createTestCanvas(800, 600));
        typeLines(editor, 2);
        assert.strictEqual(editor.getScrollbarMetrics(), null);
    });

    it('is shown when the content is scrollable', () => {
        const editor = new CanvasEditor(createTestCanvas(800, 120));
        typeLines(editor, 30);
        const m = editor.getScrollbarMetrics();
        assert.ok(m);
        assert.strictEqual(m.trackX, 800 - editor.options.scrollbarWidth);
        assert.ok(m.thumbHeight >= editor.options.minScrollbarThumbHeight);
        assert.ok(m.thumbHeight <= m.trackHeight);
    });

    it('thumb sits at the top at scroll 0 and the bottom at max scroll', () => {
        const editor = new CanvasEditor(createTestCanvas(800, 120));
        typeLines(editor, 30);

        editor.scrollY = 0;
        assert.strictEqual(editor.getScrollbarMetrics().thumbY, 0);

        editor.scrollY = editor.getMaxScroll();
        const m = editor.getScrollbarMetrics();
        assert.ok(Math.abs(m.thumbY - (m.trackHeight - m.thumbHeight)) < 1e-6);
    });
});

describe('Scrollbar dragging', () => {

    it('clicking the track does not move the text cursor', () => {
        const editor = new CanvasEditor(createTestCanvas(800, 120));
        typeLines(editor, 30);
        editor.handleKeyDown(key('Home', { ctrl: true })); // cursor at doc start
        const before = cursorCharPos(editor);

        const trackX = editor.getScrollbarMetrics().trackX;
        editor.handleMouseDown(mouse(trackX + 2, 100)); // click low on the track

        assert.strictEqual(cursorCharPos(editor), before);
        assert.ok(editor.isScrollbarDragging);
        editor.handleMouseUp(mouse(trackX + 2, 100));
        assert.ok(!editor.isScrollbarDragging);
    });

    it('clicking low on the track scrolls down', () => {
        const editor = new CanvasEditor(createTestCanvas(800, 120));
        typeLines(editor, 30);
        editor.scrollY = 0;

        const m = editor.getScrollbarMetrics();
        editor.handleMouseDown(mouse(m.trackX + 2, m.trackHeight)); // bottom of track
        assert.ok(editor.scrollY > 0);
        editor.handleMouseUp(mouse(m.trackX + 2, m.trackHeight));
    });

    it('dragging the thumb maps position to scroll offset', () => {
        const editor = new CanvasEditor(createTestCanvas(800, 120));
        typeLines(editor, 30);
        editor.scrollY = 0;

        const m = editor.getScrollbarMetrics();
        // Grab the thumb at its top, then drag to the bottom of its travel.
        editor.handleMouseDown(mouse(m.trackX + 2, m.thumbY));
        assert.ok(editor.isScrollbarDragging);

        editor.handleMouseMove(mouse(m.trackX + 2, m.trackHeight - m.thumbHeight));
        assert.strictEqual(editor.scrollY, editor.getMaxScroll());

        // Drag back to the top.
        editor.handleMouseMove(mouse(m.trackX + 2, 0));
        assert.strictEqual(editor.scrollY, 0);

        editor.handleMouseUp(mouse(m.trackX + 2, 0));
        assert.ok(!editor.isScrollbarDragging);
    });

    it('a mousedown off the scrollbar still positions the cursor', () => {
        const editor = new CanvasEditor(createTestCanvas(800, 120));
        typeLines(editor, 30);

        // Click well left of the scrollbar; should not start a scrollbar drag.
        editor.handleMouseDown(mouse(50, 30));
        assert.ok(!editor.isScrollbarDragging);
        editor.handleMouseUp(mouse(50, 30));
    });
});
