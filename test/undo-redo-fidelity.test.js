import { describe, it } from 'node:test';
import assert from 'node:assert';
import { createCanvas } from 'canvas';
import { CanvasEditor } from '../src/CanvasEditor.js';
import { HorizontalRuleLink } from '../src/ChainLink.js';

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

function firstTextProps(editor) {
    const item = editor.chain.getItems().find(i => i.constructor.name === 'TextLink');
    return item ? item.intrinsic.fontProperties : null;
}

// Snapshot-after convention (matching the existing undo tests): mutate the
// chain directly, then takeSnapshot() so history[index] holds the new state.
describe('Undo/redo fidelity', () => {
    it('should restore highlight color', () => {
        const canvas = createCanvas(800, 600);
        const editor = new CanvasEditor(canvas);
        editor.setText('hello');
        editor.takeSnapshot();

        editor.chain.selectionStart = 0;
        editor.chain.selectionEnd = 5;
        editor.applyFormattingToSelection('backgroundColor', () => '#ffff00');
        editor.takeSnapshot();

        assert.strictEqual(firstTextProps(editor).backgroundColor, '#ffff00');
        editor.undo();
        assert.strictEqual(firstTextProps(editor).backgroundColor, null);
        editor.redo();
        assert.strictEqual(firstTextProps(editor).backgroundColor, '#ffff00');
    });

    it('should restore text color and underline', () => {
        const canvas = createCanvas(800, 600);
        const editor = new CanvasEditor(canvas);
        editor.setText('hello');
        editor.takeSnapshot();

        editor.chain.selectionStart = 0;
        editor.chain.selectionEnd = 5;
        editor.applyFormattingToSelection('color', () => '#ff0000');
        editor.applyFormattingToSelection('underline', () => true);
        editor.takeSnapshot();

        editor.undo();
        assert.strictEqual(firstTextProps(editor).color, '#000000');
        assert.strictEqual(firstTextProps(editor).underline, false);
        editor.redo();
        assert.strictEqual(firstTextProps(editor).color, '#ff0000');
        assert.strictEqual(firstTextProps(editor).underline, true);
    });

    it('should restore a hyperlink', () => {
        const canvas = createCanvas(800, 600);
        const editor = new CanvasEditor(canvas);
        editor.setText('docs');
        editor.takeSnapshot();

        editor.chain.selectionStart = 0;
        editor.chain.selectionEnd = 4;
        editor.applyFormattingToSelection('link', () => 'https://docs.test');
        editor.takeSnapshot();

        editor.undo();
        assert.strictEqual(firstTextProps(editor).link, null);
        editor.redo();
        assert.strictEqual(firstTextProps(editor).link, 'https://docs.test');
    });

    it('should restore a list type', () => {
        const canvas = createCanvas(800, 600);
        const editor = new CanvasEditor(canvas);
        editor.setText('item');
        editor.takeSnapshot();

        editor.paragraphLists.set(0, 'bullet');
        editor.syncParagraphIndents();
        editor.takeSnapshot();

        editor.undo();
        assert.strictEqual(editor.paragraphLists.has(0), false);
        editor.redo();
        assert.strictEqual(editor.paragraphLists.get(0), 'bullet');
    });

    it('should restore paragraph alignment', () => {
        const canvas = createCanvas(800, 600);
        const editor = new CanvasEditor(canvas);
        editor.setText('centered');
        editor.takeSnapshot();

        editor.paragraphAlignments.set(0, 'center');
        editor.takeSnapshot();

        editor.undo();
        assert.strictEqual(editor.paragraphAlignments.has(0), false);
        editor.redo();
        assert.strictEqual(editor.paragraphAlignments.get(0), 'center');
    });

    it('should restore a horizontal rule', () => {
        const canvas = createCanvas(800, 600);
        const editor = new CanvasEditor(canvas);
        editor.setText('above');
        editor.takeSnapshot();

        editor.chain.insertHorizontalRule();
        editor.takeSnapshot();

        const count = () => editor.chain.getItems().filter(i => i instanceof HorizontalRuleLink).length;
        assert.strictEqual(count(), 1);
        editor.undo();
        assert.strictEqual(count(), 0);
        editor.redo();
        assert.strictEqual(count(), 1);
    });

    it('should restore the cursor position', () => {
        const canvas = createCanvas(800, 600);
        const editor = new CanvasEditor(canvas);
        editor.setText('hello');
        editor.chain.moveCursorToCharPosition(2);
        editor.takeSnapshot();

        editor.chain.moveCursorToCharPosition(5);
        editor.takeSnapshot();

        editor.undo();
        assert.strictEqual(editor.chain.getCursorCharPosition(), 2);
        editor.redo();
        assert.strictEqual(editor.chain.getCursorCharPosition(), 5);
    });

    it('should restore font size and family (regression)', () => {
        const canvas = createCanvas(800, 600);
        const editor = new CanvasEditor(canvas);
        editor.setText('text');
        editor.takeSnapshot();

        editor.chain.selectionStart = 0;
        editor.chain.selectionEnd = 4;
        editor.applyFormattingToSelection('size', () => 32);
        editor.takeSnapshot();

        editor.undo();
        assert.strictEqual(firstTextProps(editor).size, 16);
        editor.redo();
        assert.strictEqual(firstTextProps(editor).size, 32);
    });
});
