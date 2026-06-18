import { describe, it } from 'node:test';
import assert from 'node:assert';
import { createCanvas } from 'canvas';
import { CanvasEditor } from '../src/CanvasEditor.js';
import { TextLink } from '../src/ChainLink.js';

global.requestAnimationFrame = global.requestAnimationFrame || (() => 0);
global.cancelAnimationFrame = global.cancelAnimationFrame || (() => {});

function key(k, opts = {}) {
    return { key: k, ctrlKey: opts.ctrl || false, metaKey: false, shiftKey: opts.shift || false, preventDefault() {} };
}

// Smallest posX among the text on the (single) line, after alignment.
function minTextPosX(editor) {
    editor.adjustForAlignment();
    let min = Infinity;
    for (const item of editor.chain.getItems()) {
        if (item instanceof TextLink && item.computed && item.computed.posX !== undefined) {
            min = Math.min(min, item.computed.posX);
        }
    }
    return min;
}

describe('Right alignment', () => {

    it('pushes a short line toward the right edge', () => {
        const canvas = createCanvas(800, 600);
        const editor = new CanvasEditor(canvas);
        editor.setText('Hello');

        const leftX = minTextPosX(editor);

        editor.setAlignment('right');
        const rightX = minTextPosX(editor);

        assert.ok(rightX > leftX, 'right-aligned text should start further right');
    });

    it('places center alignment between left and right', () => {
        const canvas = createCanvas(800, 600);
        const editor = new CanvasEditor(canvas);
        editor.setText('Hello');

        editor.setAlignment('left');
        const leftX = minTextPosX(editor);
        editor.setAlignment('center');
        const centerX = minTextPosX(editor);
        editor.setAlignment('right');
        const rightX = minTextPosX(editor);

        assert.ok(leftX < centerX && centerX < rightX);
    });

    it('reverts to the left when set back', () => {
        const canvas = createCanvas(800, 600);
        const editor = new CanvasEditor(canvas);
        editor.setText('Hello');

        const leftX = minTextPosX(editor);
        editor.setAlignment('right');
        editor.setAlignment('left');
        assert.strictEqual(minTextPosX(editor), leftX);
    });

    it('does not drift across repeated renders (idempotent)', () => {
        const canvas = createCanvas(800, 600);
        const editor = new CanvasEditor(canvas);
        editor.setText('Centered');
        editor.setAlignment('center');

        editor.render();
        const x1 = minTextPosX(editor);
        editor.render();
        editor.render();
        const x2 = minTextPosX(editor);

        assert.strictEqual(x1, x2);
    });
});

describe('Tab key', () => {

    it('inserts tabSize spaces', () => {
        const canvas = createCanvas(800, 600);
        const editor = new CanvasEditor(canvas);
        editor.handleKeyDown(key('a'));

        editor.handleKeyDown(key('Tab'));

        assert.strictEqual(editor.getText(), 'a' + ' '.repeat(editor.options.tabSize));
    });

    it('honors a custom tabSize', () => {
        const canvas = createCanvas(800, 600);
        const editor = new CanvasEditor(canvas, { tabSize: 2 });
        editor.handleKeyDown(key('Tab'));
        assert.strictEqual(editor.getText(), '  ');
    });

    it('replaces a selection', () => {
        const canvas = createCanvas(800, 600);
        const editor = new CanvasEditor(canvas);
        editor.setText('hello');
        editor.selectAll();

        editor.handleKeyDown(key('Tab'));

        assert.strictEqual(editor.getText(), ' '.repeat(editor.options.tabSize));
    });
});

describe('Escape key', () => {

    it('clears an active selection', () => {
        const canvas = createCanvas(800, 600);
        const editor = new CanvasEditor(canvas);
        editor.setText('hello');
        editor.selectAll();
        assert.ok(editor.chain.hasSelection());

        editor.handleKeyDown(key('Escape'));

        assert.ok(!editor.chain.hasSelection());
    });
});
