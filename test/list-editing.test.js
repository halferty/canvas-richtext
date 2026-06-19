import { describe, it } from 'node:test';
import assert from 'node:assert';
import { createCanvas } from 'canvas';
import { CanvasEditor } from '../src/CanvasEditor.js';

// Mock requestAnimationFrame and cancelAnimationFrame for Node.js environment
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

function press(editor, key, opts = {}) {
    editor.handleKeyDown({
        key,
        preventDefault() {},
        ctrlKey: opts.ctrl || false,
        metaKey: false,
        shiftKey: opts.shift || false
    });
}

// Flattened character position resolved by a content-space hit test.
function hitPos(editor, x, y) {
    const r = editor.getCharacterAtPosition(x, y);
    return r ? editor.chain.getCharPosition(r.itemIdx, r.charOffset) : null;
}

function firstTextLink(editor) {
    return editor.chain.getItems().find(i => i.constructor.name === 'TextLink');
}

describe('List editing', () => {
    describe('Enter exits an empty list item', () => {
        it('should break out of the list on a second Enter (empty item)', () => {
            const canvas = createCanvas(800, 600);
            const editor = new CanvasEditor(canvas);
            editor.setText('Item one');
            editor.toggleBulletList();

            press(editor, 'Enter'); // new empty bullet at paragraph 1
            assert.strictEqual(editor.getText(), 'Item one\n');
            assert.strictEqual(editor.paragraphLists.get(1), 'bullet');

            press(editor, 'Enter'); // on the empty item -> exit the list
            assert.strictEqual(editor.getText(), 'Item one\n'); // no extra newline added
            assert.strictEqual(editor.paragraphLists.has(1), false);
            assert.strictEqual(editor.chain.getParagraphIndent(1), 0);
        });

        it('should still continue the list from a non-empty item', () => {
            const canvas = createCanvas(800, 600);
            const editor = new CanvasEditor(canvas);
            editor.setText('a');
            editor.toggleBulletList();

            press(editor, 'Enter');

            assert.strictEqual(editor.getText(), 'a\n');
            assert.strictEqual(editor.paragraphLists.get(0), 'bullet');
            assert.strictEqual(editor.paragraphLists.get(1), 'bullet');
        });

        it('should not break out when the list item has text', () => {
            const canvas = createCanvas(800, 600);
            const editor = new CanvasEditor(canvas);
            editor.setText('hello');
            editor.toggleBulletList();
            editor.chain.moveCursorToCharPosition(5); // end of "hello"

            press(editor, 'Enter');

            assert.strictEqual(editor.getText(), 'hello\n');
            assert.strictEqual(editor.paragraphLists.get(1), 'bullet');
        });
    });

    describe('Hit testing on indented list lines', () => {
        it('should resolve a point right of a list item to end of that line', () => {
            const canvas = createCanvas(800, 600);
            const editor = new CanvasEditor(canvas);
            editor.setText('Item\nSecond paragraph here');
            editor.chain.selectionStart = 0;
            editor.chain.selectionEnd = 4;
            editor.toggleBulletList();
            editor.chain.clearSelection();
            editor.render();

            const line0Y = firstTextLink(editor).computed.posY;
            // Far to the right of the short "Item" line.
            assert.strictEqual(hitPos(editor, 400, line0Y), 4);
        });

        it('should resolve a point in the list gutter to the line start', () => {
            const canvas = createCanvas(800, 600);
            const editor = new CanvasEditor(canvas);
            editor.setText('Item\nmore');
            editor.chain.selectionStart = 0;
            editor.chain.selectionEnd = 4;
            editor.toggleBulletList();
            editor.chain.clearSelection();
            editor.render();

            const line0Y = firstTextLink(editor).computed.posY;
            // x=5 is inside the 32px indent gutter, left of the text.
            assert.strictEqual(hitPos(editor, 5, line0Y), 0);
        });

        it('should resolve a point on an empty line to that line', () => {
            const canvas = createCanvas(800, 600);
            const editor = new CanvasEditor(canvas);
            editor.setText('A\n\nB'); // paragraph 1 is empty
            editor.render();

            // A newline's posY is the next line's baseline, so the empty line
            // (paragraph 1) sits at the *first* newline's posY.
            const items = editor.chain.getItems();
            const newlines = items.filter(i => i.constructor.name === 'NewlineLink');
            const emptyLineY = newlines[0].computed.posY;

            assert.strictEqual(hitPos(editor, 50, emptyLineY), 2);
        });

        it('should still resolve a direct hit on the text', () => {
            const canvas = createCanvas(800, 600);
            const editor = new CanvasEditor(canvas);
            editor.setText('Item');
            editor.toggleBulletList();
            editor.render();

            const tl = firstTextLink(editor);
            // Start of the first character.
            assert.strictEqual(hitPos(editor, tl.computed.posX + 0.5, tl.computed.posY), 0);
        });
    });
});
