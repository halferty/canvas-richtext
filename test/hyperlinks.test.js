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

function linkedRuns(editor) {
    return editor.chain.getItems().filter(
        item => item.constructor.name === 'TextLink' && item.intrinsic.fontProperties.link
    );
}

describe('Hyperlinks', () => {
    describe('setLink (on a selection)', () => {
        it('should set the link on the selected text', () => {
            const canvas = createCanvas(800, 600);
            const editor = new CanvasEditor(canvas);
            editor.setText('click here now');

            // Select "here" (chars 6..10).
            editor.chain.selectionStart = 6;
            editor.chain.selectionEnd = 10;
            editor.setLink('https://example.com');

            const runs = linkedRuns(editor);
            assert.ok(runs.length > 0);
            const text = runs.map(r => r.text).join('');
            assert.strictEqual(text, 'here');
            runs.forEach(r => assert.strictEqual(r.intrinsic.fontProperties.link, 'https://example.com'));
        });

        it('should do nothing without a selection', () => {
            const canvas = createCanvas(800, 600);
            const editor = new CanvasEditor(canvas);
            editor.setText('no selection');

            editor.setLink('https://example.com');

            assert.strictEqual(linkedRuns(editor).length, 0);
        });

        it('should not link text outside the selection', () => {
            const canvas = createCanvas(800, 600);
            const editor = new CanvasEditor(canvas);
            editor.setText('abcdef');

            editor.chain.selectionStart = 2;
            editor.chain.selectionEnd = 4;
            editor.setLink('https://x.com');

            const linkedText = linkedRuns(editor).map(r => r.text).join('');
            assert.strictEqual(linkedText, 'cd');
        });
    });

    describe('getLinkAtCursor', () => {
        it('should report the href when the cursor is inside a link', () => {
            const canvas = createCanvas(800, 600);
            const editor = new CanvasEditor(canvas);
            editor.setText('go home');
            editor.chain.selectionStart = 3;
            editor.chain.selectionEnd = 7;
            editor.setLink('https://home.test');

            // Move cursor into the linked word.
            editor.chain.moveCursorToCharPosition(5);
            assert.strictEqual(editor.getLinkAtCursor(), 'https://home.test');
        });

        it('should return null outside a link', () => {
            const canvas = createCanvas(800, 600);
            const editor = new CanvasEditor(canvas);
            editor.setText('plain text');
            editor.chain.moveCursorToCharPosition(3);
            assert.strictEqual(editor.getLinkAtCursor(), null);
        });
    });

    describe('applyLink (explicit text + url)', () => {
        it('should insert a new link at the cursor', () => {
            const canvas = createCanvas(800, 600);
            const editor = new CanvasEditor(canvas);

            editor.applyLink('Anthropic', 'https://anthropic.com');

            assert.strictEqual(editor.getText(), 'Anthropic');
            const runs = linkedRuns(editor);
            assert.strictEqual(runs.map(r => r.text).join(''), 'Anthropic');
            runs.forEach(r => assert.strictEqual(r.intrinsic.fontProperties.link, 'https://anthropic.com'));
        });

        it('should replace an existing link run when editing it', () => {
            const canvas = createCanvas(800, 600);
            const editor = new CanvasEditor(canvas);
            editor.applyLink('old', 'https://old.com');
            editor.chain.moveCursorToCharPosition(2); // inside "old"

            editor.applyLink('new site', 'https://new.com');

            assert.strictEqual(editor.getText(), 'new site');
            assert.strictEqual(editor.getLinkAtCursor(), 'https://new.com');
        });

        it('should clear the link but keep the text when url is empty', () => {
            const canvas = createCanvas(800, 600);
            const editor = new CanvasEditor(canvas);
            editor.applyLink('keep me', 'https://x.com');
            editor.chain.moveCursorToCharPosition(3);

            editor.applyLink('keep me', '');

            assert.strictEqual(editor.getText(), 'keep me');
            assert.strictEqual(linkedRuns(editor).length, 0);
        });
    });

    describe('removeLink', () => {
        it('should remove the link while preserving the text', () => {
            const canvas = createCanvas(800, 600);
            const editor = new CanvasEditor(canvas);
            editor.setText('visit site today');
            editor.chain.selectionStart = 6;
            editor.chain.selectionEnd = 10;
            editor.setLink('https://site.test');

            editor.chain.moveCursorToCharPosition(8); // inside "site"
            editor.removeLink();

            assert.strictEqual(editor.getText(), 'visit site today');
            assert.strictEqual(linkedRuns(editor).length, 0);
        });
    });

    describe('rendering & serialization', () => {
        it('should render linked text without error', () => {
            const canvas = createCanvas(800, 600);
            const editor = new CanvasEditor(canvas);
            editor.applyLink('link', 'https://example.com');
            assert.doesNotThrow(() => editor.render());
        });

        it('should treat the popup API as a safe no-op without a DOM', () => {
            const canvas = createCanvas(800, 600);
            const editor = new CanvasEditor(canvas);
            editor.applyLink('link', 'https://example.com');

            // No global document in the Node test environment.
            assert.strictEqual(editor.ensureLinkPopup(), null);
            assert.doesNotThrow(() => editor.openLinkPopup());
            assert.doesNotThrow(() => editor.closeLinkPopup());
            assert.doesNotThrow(() => editor.openLink('https://example.com'));
        });

        it('should extract text within a range', () => {
            const canvas = createCanvas(800, 600);
            const editor = new CanvasEditor(canvas);
            editor.setText('hello world');
            assert.strictEqual(editor.getTextInRange(0, 5), 'hello');
            assert.strictEqual(editor.getTextInRange(6, 11), 'world');
        });

        it('should round-trip links through toJSON/fromJSON', () => {
            const canvas = createCanvas(800, 600);
            const editor = new CanvasEditor(canvas);
            editor.setText('see docs here');
            editor.chain.selectionStart = 9;
            editor.chain.selectionEnd = 13;
            editor.setLink('https://docs.test');

            const data = editor.toJSON();
            const editor2 = new CanvasEditor(createCanvas(800, 600));
            editor2.fromJSON(data);

            const runs = editor2.chain.getItems().filter(
                item => item.constructor.name === 'TextLink' && item.intrinsic.fontProperties.link
            );
            assert.strictEqual(runs.map(r => r.text).join(''), 'here');
            runs.forEach(r => assert.strictEqual(r.intrinsic.fontProperties.link, 'https://docs.test'));
        });
    });
});
