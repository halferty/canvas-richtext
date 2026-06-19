import { describe, it } from 'node:test';
import assert from 'node:assert';
import { createCanvas } from 'canvas';
import { CanvasEditor } from '../src/CanvasEditor.js';
import { HorizontalRuleLink, NewlineLink, TextLink } from '../src/ChainLink.js';

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

function countType(editor, Type) {
    return editor.chain.getItems().filter(item => item instanceof Type).length;
}

describe('Horizontal Rule', () => {
    it('should insert a horizontal rule into the chain', () => {
        const canvas = createCanvas(800, 600);
        const editor = new CanvasEditor(canvas);
        editor.setText('Above');

        editor.insertHorizontalRule();

        assert.strictEqual(countType(editor, HorizontalRuleLink), 1);
    });

    it('should break the current line so the rule sits on its own row', () => {
        const canvas = createCanvas(800, 600);
        const editor = new CanvasEditor(canvas);
        editor.setText('Above');

        // Cursor is at end of "Above" (mid-line), so a newline is inserted
        // before the rule.
        editor.insertHorizontalRule();

        const items = editor.chain.getItems();
        const hrIdx = items.findIndex(item => item instanceof HorizontalRuleLink);
        assert.ok(hrIdx > 0);
        // The item just before the rule is a line break (newline).
        assert.ok(items[hrIdx - 1] instanceof NewlineLink);
    });

    it('should not add a leading newline when already at the start of a line', () => {
        const canvas = createCanvas(800, 600);
        const editor = new CanvasEditor(canvas);
        // Empty document: cursor is at the start of the first line.
        editor.insertHorizontalRule();

        const items = editor.chain.getItems();
        const hrIdx = items.findIndex(item => item instanceof HorizontalRuleLink);
        // Rule is the very first item (no preceding newline was added).
        assert.strictEqual(hrIdx, 0);
        assert.strictEqual(countType(editor, NewlineLink), 1); // only the rule itself
    });

    it('should behave like a line break for the cursor (lands below the rule)', () => {
        const canvas = createCanvas(800, 600);
        const editor = new CanvasEditor(canvas);
        editor.insertHorizontalRule();
        editor.chain.printableKeyPressed('X');

        // The rule precedes the typed character in document order.
        const items = editor.chain.getItems();
        const hrIdx = items.findIndex(item => item instanceof HorizontalRuleLink);
        const textIdx = items.findIndex(item => item instanceof TextLink && item.text.includes('X'));
        assert.ok(hrIdx < textIdx);
    });

    it('should be a NewlineLink subclass so layout/navigation treat it as a break', () => {
        const rule = new HorizontalRuleLink();
        assert.ok(rule instanceof NewlineLink);
    });

    it('should render without error', () => {
        const canvas = createCanvas(800, 600);
        const editor = new CanvasEditor(canvas);
        editor.setText('Above');
        editor.insertHorizontalRule();
        editor.chain.printableKeyPressed('B');

        assert.doesNotThrow(() => editor.render());
    });

    it('should round-trip through toJSON/fromJSON', () => {
        const canvas = createCanvas(800, 600);
        const editor = new CanvasEditor(canvas);
        editor.setText('Above');
        editor.insertHorizontalRule();

        const data = editor.toJSON();
        assert.ok(data.content.some(entry => entry.type === 'hr'));

        const editor2 = new CanvasEditor(createCanvas(800, 600));
        editor2.fromJSON(data);

        assert.strictEqual(countType(editor2, HorizontalRuleLink), 1);
    });

    it('should be removable with backspace', () => {
        const canvas = createCanvas(800, 600);
        const editor = new CanvasEditor(canvas);
        editor.insertHorizontalRule();
        assert.strictEqual(countType(editor, HorizontalRuleLink), 1);

        // Cursor is immediately after the rule; backspace deletes it.
        editor.chain.backspacePressed();
        assert.strictEqual(countType(editor, HorizontalRuleLink), 0);
    });
});
