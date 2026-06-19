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

// First TextLink belonging to a given paragraph index (paragraphs are
// delimited by '\n' in document order).
function firstTextLinkOfParagraph(editor, paragraphIndex) {
    const items = editor.chain.getItems();
    let para = 0;
    for (const item of items) {
        if (item.constructor.name === 'TextLink') {
            if (para === paragraphIndex) return item;
        } else if (item.constructor.name === 'NewlineLink') {
            para++;
        }
    }
    return null;
}

describe('Lists', () => {
    describe('Toggling', () => {
        it('should apply a bullet list to the current paragraph', () => {
            const canvas = createCanvas(800, 600);
            const editor = new CanvasEditor(canvas);
            editor.setText('Item one');

            editor.toggleBulletList();

            assert.strictEqual(editor.paragraphLists.get(0), 'bullet');
        });

        it('should apply a numbered list to the current paragraph', () => {
            const canvas = createCanvas(800, 600);
            const editor = new CanvasEditor(canvas);
            editor.setText('Step one');

            editor.toggleNumberedList();

            assert.strictEqual(editor.paragraphLists.get(0), 'number');
        });

        it('should toggle a list off when applied again', () => {
            const canvas = createCanvas(800, 600);
            const editor = new CanvasEditor(canvas);
            editor.setText('Item');

            editor.toggleBulletList();
            editor.toggleBulletList();

            assert.strictEqual(editor.paragraphLists.has(0), false);
        });

        it('should switch bullet to numbered', () => {
            const canvas = createCanvas(800, 600);
            const editor = new CanvasEditor(canvas);
            editor.setText('Item');

            editor.toggleBulletList();
            editor.toggleNumberedList();

            assert.strictEqual(editor.paragraphLists.get(0), 'number');
        });

        it('should apply a list across every paragraph in a selection', () => {
            const canvas = createCanvas(800, 600);
            const editor = new CanvasEditor(canvas);
            editor.setText('one\ntwo\nthree');

            // Select across all three paragraphs.
            editor.chain.selectionStart = 0;
            editor.chain.selectionEnd = editor.getText().length;
            editor.toggleBulletList();

            assert.strictEqual(editor.paragraphLists.get(0), 'bullet');
            assert.strictEqual(editor.paragraphLists.get(1), 'bullet');
            assert.strictEqual(editor.paragraphLists.get(2), 'bullet');
        });

        it('should only affect the selected paragraph range', () => {
            const canvas = createCanvas(800, 600);
            const editor = new CanvasEditor(canvas);
            editor.setText('one\ntwo\nthree');

            // Select only the second paragraph ("two": chars 4..7).
            editor.chain.selectionStart = 4;
            editor.chain.selectionEnd = 7;
            editor.toggleNumberedList();

            assert.strictEqual(editor.paragraphLists.has(0), false);
            assert.strictEqual(editor.paragraphLists.get(1), 'number');
            assert.strictEqual(editor.paragraphLists.has(2), false);
        });
    });

    describe('Layout', () => {
        it('should indent list paragraph text by LIST_INDENT', () => {
            const canvas = createCanvas(800, 600);
            const editor = new CanvasEditor(canvas);
            editor.setText('Item');

            const before = firstTextLinkOfParagraph(editor, 0).computed.posX;
            assert.strictEqual(before, 0);

            editor.toggleBulletList();

            const after = firstTextLinkOfParagraph(editor, 0).computed.posX;
            assert.strictEqual(after, editor.LIST_INDENT);
        });

        it('should sync the chain wrap indents when a list is applied', () => {
            const canvas = createCanvas(800, 600);
            const editor = new CanvasEditor(canvas);
            editor.setText('Item');

            editor.toggleBulletList();

            assert.strictEqual(editor.chain.paragraphIndents.get(0), editor.LIST_INDENT);
            assert.strictEqual(editor.chain.getParagraphIndent(0), editor.LIST_INDENT);
        });

        it('should remove the wrap indent when a list is toggled off', () => {
            const canvas = createCanvas(800, 600);
            const editor = new CanvasEditor(canvas);
            editor.setText('Item');

            editor.toggleBulletList();
            editor.toggleBulletList();

            assert.strictEqual(editor.chain.getParagraphIndent(0), 0);
        });

        it('should render bullet and numbered lists without error', () => {
            const canvas = createCanvas(800, 600);
            const editor = new CanvasEditor(canvas);
            editor.setText('one\ntwo\nthree');

            editor.chain.selectionStart = 0;
            editor.chain.selectionEnd = editor.getText().length;
            editor.toggleNumberedList();

            assert.doesNotThrow(() => editor.render());
        });
    });

    describe('Serialization', () => {
        it('should round-trip list types through toJSON/fromJSON', () => {
            const canvas = createCanvas(800, 600);
            const editor = new CanvasEditor(canvas);
            editor.setText('a\nb\nc');

            editor.chain.selectionStart = 0;
            editor.chain.selectionEnd = 1;
            editor.toggleBulletList();
            editor.chain.clearSelection();
            // Numbered list on the third paragraph (chars 4..5).
            editor.chain.selectionStart = 4;
            editor.chain.selectionEnd = 5;
            editor.toggleNumberedList();

            const data = editor.toJSON();
            assert.strictEqual(data.lists['0'], 'bullet');
            assert.strictEqual(data.lists['2'], 'number');

            const editor2 = new CanvasEditor(createCanvas(800, 600));
            editor2.fromJSON(data);

            assert.strictEqual(editor2.paragraphLists.get(0), 'bullet');
            assert.strictEqual(editor2.paragraphLists.get(2), 'number');
            // Indents are re-synced on load.
            assert.strictEqual(editor2.chain.getParagraphIndent(0), editor2.LIST_INDENT);
        });
    });
});
