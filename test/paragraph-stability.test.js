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

describe('Paragraph attribute stability', () => {
    describe('Enter (split / auto-continue)', () => {
        it('should continue a bullet list onto the new line', () => {
            const canvas = createCanvas(800, 600);
            const editor = new CanvasEditor(canvas);
            editor.setText('Item one');
            editor.toggleBulletList(); // cursor is at end of paragraph 0

            press(editor, 'Enter');

            assert.strictEqual(editor.paragraphLists.get(0), 'bullet');
            assert.strictEqual(editor.paragraphLists.get(1), 'bullet');
        });

        it('should keep both halves as list items when splitting mid-paragraph', () => {
            const canvas = createCanvas(800, 600);
            const editor = new CanvasEditor(canvas);
            editor.setText('abcdef');
            editor.toggleNumberedList();
            editor.chain.moveCursorToCharPosition(3);

            press(editor, 'Enter');

            assert.strictEqual(editor.getText(), 'abc\ndef');
            assert.strictEqual(editor.paragraphLists.get(0), 'number');
            assert.strictEqual(editor.paragraphLists.get(1), 'number');
        });

        it('should not drift attributes of paragraphs below the split', () => {
            const canvas = createCanvas(800, 600);
            const editor = new CanvasEditor(canvas);
            editor.setText('first\nsecond');
            // Number the second paragraph.
            editor.chain.selectionStart = 6;
            editor.chain.selectionEnd = 12;
            editor.toggleNumberedList();
            editor.chain.clearSelection();
            assert.strictEqual(editor.paragraphLists.get(1), 'number');

            // Split the first paragraph; "second" shifts to index 2.
            editor.chain.moveCursorToCharPosition(2);
            press(editor, 'Enter');

            assert.strictEqual(editor.paragraphLists.get(2), 'number');
            assert.strictEqual(editor.paragraphLists.has(0), false);
            assert.strictEqual(editor.paragraphLists.has(1), false);
        });

        it('should continue alignment onto the new paragraph', () => {
            const canvas = createCanvas(800, 600);
            const editor = new CanvasEditor(canvas);
            editor.setText('centered');
            editor.setAlignment('center');

            press(editor, 'Enter');

            assert.strictEqual(editor.paragraphAlignments.get(0), 'center');
            assert.strictEqual(editor.paragraphAlignments.get(1), 'center');
        });
    });

    describe('Backspace / Delete (merge)', () => {
        it('should keep the surviving paragraph\'s list when merging', () => {
            const canvas = createCanvas(800, 600);
            const editor = new CanvasEditor(canvas);
            editor.setText('one\ntwo');
            editor.chain.selectionStart = 0;
            editor.chain.selectionEnd = 3;
            editor.toggleBulletList(); // paragraph 0 is a bullet
            editor.chain.clearSelection();

            // Backspace at the start of paragraph 1 merges it into paragraph 0.
            editor.chain.moveCursorToCharPosition(4);
            press(editor, 'Backspace');

            assert.strictEqual(editor.getText(), 'onetwo');
            assert.strictEqual(editor.paragraphLists.get(0), 'bullet');
        });

        it('should drop the merged-away paragraph\'s attribute', () => {
            const canvas = createCanvas(800, 600);
            const editor = new CanvasEditor(canvas);
            editor.setText('one\ntwo');
            // Number the SECOND paragraph only.
            editor.chain.selectionStart = 4;
            editor.chain.selectionEnd = 7;
            editor.toggleNumberedList();
            editor.chain.clearSelection();

            editor.chain.moveCursorToCharPosition(4);
            press(editor, 'Backspace'); // merge "two" into "one"

            assert.strictEqual(editor.getText(), 'onetwo');
            assert.strictEqual(editor.paragraphLists.has(0), false);
        });

        it('should shift lower paragraphs up when a paragraph above is deleted', () => {
            const canvas = createCanvas(800, 600);
            const editor = new CanvasEditor(canvas);
            editor.setText('a\nb\nc');
            // Center the third paragraph.
            editor.chain.moveCursorToCharPosition(4);
            editor.setAlignment('center');
            assert.strictEqual(editor.paragraphAlignments.get(2), 'center');

            // Delete "a\n" (paragraph 0 plus its boundary), merging into "b".
            editor.chain.selectionStart = 0;
            editor.chain.selectionEnd = 2;
            press(editor, 'Backspace');

            assert.strictEqual(editor.getText(), 'b\nc');
            assert.strictEqual(editor.paragraphAlignments.get(1), 'center');
            assert.strictEqual(editor.paragraphAlignments.has(2), false);
        });
    });

    describe('setText', () => {
        it('should clear paragraph attributes for a fresh document', () => {
            const canvas = createCanvas(800, 600);
            const editor = new CanvasEditor(canvas);
            editor.setText('x');
            editor.toggleBulletList();
            editor.setAlignment('center');

            editor.setText('brand new');

            assert.strictEqual(editor.paragraphLists.size, 0);
            assert.strictEqual(editor.paragraphAlignments.size, 0);
        });
    });
});
