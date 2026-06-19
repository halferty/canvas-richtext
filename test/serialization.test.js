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

describe('Document Serialization', () => {
    describe('toJSON', () => {
        it('should produce a versioned object with content and alignments', () => {
            const canvas = createCanvas(800, 600);
            const editor = new CanvasEditor(canvas);
            editor.setText('Hello');

            const data = editor.toJSON();

            assert.strictEqual(data.version, 1);
            assert.ok(Array.isArray(data.content));
            assert.ok(typeof data.alignments === 'object');
        });

        it('should serialize text runs with font properties', () => {
            const canvas = createCanvas(800, 600);
            const editor = new CanvasEditor(canvas);
            editor.setText('Hi');

            const data = editor.toJSON();
            const textRuns = data.content.filter(c => c.type === 'text');

            assert.ok(textRuns.length > 0);
            const joined = textRuns.map(r => r.text).join('');
            assert.strictEqual(joined, 'Hi');
            assert.ok(textRuns[0].font);
            assert.strictEqual(typeof textRuns[0].font.size, 'number');
        });

        it('should serialize newlines as their own entries', () => {
            const canvas = createCanvas(800, 600);
            const editor = new CanvasEditor(canvas);
            editor.setText('a\nb');

            const data = editor.toJSON();
            const newlines = data.content.filter(c => c.type === 'newline');

            assert.strictEqual(newlines.length, 1);
        });

        it('should not serialize cursor or virtual newline links', () => {
            const canvas = createCanvas(800, 600);
            const editor = new CanvasEditor(canvas);
            editor.setText('Hello World');

            const data = editor.toJSON();
            const types = new Set(data.content.map(c => c.type));

            assert.ok(!types.has('cursor'));
            assert.ok(!types.has('virtualNewline'));
        });

        it('should be JSON-stringifiable', () => {
            const canvas = createCanvas(800, 600);
            const editor = new CanvasEditor(canvas);
            editor.setText('Round trip');

            assert.doesNotThrow(() => JSON.stringify(editor.toJSON()));
        });
    });

    describe('fromJSON', () => {
        it('should round-trip plain text', () => {
            const canvas = createCanvas(800, 600);
            const editor = new CanvasEditor(canvas);
            editor.setText('Hello World');

            const data = editor.toJSON();

            const editor2 = new CanvasEditor(createCanvas(800, 600));
            editor2.fromJSON(data);

            assert.strictEqual(editor2.getText(), 'Hello World');
        });

        it('should round-trip multi-line text', () => {
            const canvas = createCanvas(800, 600);
            const editor = new CanvasEditor(canvas);
            editor.setText('Line one\nLine two\nLine three');

            const editor2 = new CanvasEditor(createCanvas(800, 600));
            editor2.fromJSON(editor.toJSON());

            assert.strictEqual(editor2.getText(), 'Line one\nLine two\nLine three');
        });

        it('should round-trip font formatting', () => {
            const canvas = createCanvas(800, 600);
            const editor = new CanvasEditor(canvas);
            editor.setText('Bold text');
            editor.selectAll();
            editor.toggleBold();
            editor.selectAll();
            editor.setHighlightColor('#ffff00');

            const editor2 = new CanvasEditor(createCanvas(800, 600));
            editor2.fromJSON(editor.toJSON());

            const textItems = editor2.chain.getItems().filter(
                item => item.text && item.text.trim().length > 0
            );
            assert.ok(textItems.length > 0);
            textItems.forEach(item => {
                assert.strictEqual(item.intrinsic.fontProperties.weight, 'bold');
                assert.strictEqual(item.intrinsic.fontProperties.backgroundColor, '#ffff00');
            });
        });

        it('should round-trip paragraph alignment', () => {
            const canvas = createCanvas(800, 600);
            const editor = new CanvasEditor(canvas);
            editor.setText('Centered');
            editor.setAlignment('center');

            const editor2 = new CanvasEditor(createCanvas(800, 600));
            editor2.fromJSON(editor.toJSON());

            assert.strictEqual(editor2.paragraphAlignments.get(0), 'center');
        });

        it('should accept a JSON string', () => {
            const canvas = createCanvas(800, 600);
            const editor = new CanvasEditor(canvas);
            editor.setText('From string');

            const json = JSON.stringify(editor.toJSON());
            const editor2 = new CanvasEditor(createCanvas(800, 600));
            editor2.fromJSON(json);

            assert.strictEqual(editor2.getText(), 'From string');
        });

        it('should replace existing content', () => {
            const canvas = createCanvas(800, 600);
            const editor = new CanvasEditor(canvas);
            editor.setText('Original content here');

            const source = new CanvasEditor(createCanvas(800, 600));
            source.setText('New');
            editor.fromJSON(source.toJSON());

            assert.strictEqual(editor.getText(), 'New');
        });

        it('should leave exactly one cursor link in the chain', () => {
            const canvas = createCanvas(800, 600);
            const editor = new CanvasEditor(canvas);
            editor.setText('Hello');

            const editor2 = new CanvasEditor(createCanvas(800, 600));
            editor2.fromJSON(editor.toJSON());

            const cursorCount = editor2.chain.getItems().filter(
                item => item.constructor.name === 'CursorLink'
            ).length;
            assert.strictEqual(cursorCount, 1);
        });

        it('should reset undo history to the loaded baseline', () => {
            const canvas = createCanvas(800, 600);
            const editor = new CanvasEditor(canvas);
            editor.setText('Hello');

            editor.fromJSON(editor.toJSON());

            assert.strictEqual(editor.history.length, 0);
            assert.strictEqual(editor.historyIndex, -1);
        });

        it('should handle an empty document', () => {
            const canvas = createCanvas(800, 600);
            const editor = new CanvasEditor(canvas);

            const data = editor.toJSON();
            const editor2 = new CanvasEditor(createCanvas(800, 600));
            editor2.fromJSON(data);

            assert.strictEqual(editor2.getText(), '');
        });

        it('should tolerate font fields missing from older documents', () => {
            const canvas = createCanvas(800, 600);
            const editor = new CanvasEditor(canvas);

            // Simulate a document saved before backgroundColor existed.
            editor.fromJSON({
                version: 1,
                content: [{ type: 'text', text: 'Legacy', font: { size: 20, family: 'Arial' } }],
                alignments: {}
            });

            assert.strictEqual(editor.getText(), 'Legacy');
            const textItem = editor.chain.getItems().find(item => item.text === 'Legacy');
            assert.strictEqual(textItem.intrinsic.fontProperties.size, 20);
            assert.strictEqual(textItem.intrinsic.fontProperties.backgroundColor, null);
        });

        it('should throw on invalid data', () => {
            const canvas = createCanvas(800, 600);
            const editor = new CanvasEditor(canvas);

            assert.throws(() => editor.fromJSON({ version: 1 }));
            assert.throws(() => editor.fromJSON(null));
        });
    });
});
