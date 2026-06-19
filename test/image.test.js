import { describe, it } from 'node:test';
import assert from 'node:assert';
import { createCanvas } from 'canvas';
import { CanvasEditor } from '../src/CanvasEditor.js';
import { ImageLink } from '../src/ChainLink.js';

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

function imageLinks(editor) {
    return editor.chain.getItems().filter(i => i instanceof ImageLink);
}

const SAMPLE = { src: 'https://cdn/thumb.jpg', full: 'https://cdn/full.jpg', width: 400, height: 300, alt: 'A cat' };

describe('Images', () => {
    describe('Insertion & layout', () => {
        it('should insert a block image on its own line', () => {
            const canvas = createCanvas(800, 600);
            const editor = new CanvasEditor(canvas);
            editor.setText('Before');
            editor.insertImage(SAMPLE);
            editor.render();

            const imgs = imageLinks(editor);
            assert.strictEqual(imgs.length, 1);
            assert.strictEqual(imgs[0].intrinsic.full, 'https://cdn/full.jpg');
        });

        it('should give the image a centered, sized draw box', () => {
            const canvas = createCanvas(800, 600);
            const editor = new CanvasEditor(canvas);
            editor.insertImage(SAMPLE);
            editor.render();

            const box = imageLinks(editor)[0].computed.box;
            assert.strictEqual(box.w, 400);
            assert.strictEqual(box.h, 300);
            // Centered within the content width (editorWidth = 800 - 2*padding).
            assert.strictEqual(box.x, (editor.editorWidth - 400) / 2);
        });

        it('should scale a too-wide image down to the content width', () => {
            const canvas = createCanvas(800, 600);
            const editor = new CanvasEditor(canvas);
            editor.insertImage({ src: 'x', width: 2000, height: 1000 });
            editor.render();

            const box = imageLinks(editor)[0].computed.box;
            assert.strictEqual(box.w, editor.editorWidth);
            // Aspect ratio preserved (2000x1000 -> editorWidth x editorWidth/2).
            assert.ok(Math.abs(box.h - editor.editorWidth / 2) < 0.001);
        });

        it('should contribute its height to the content height', () => {
            const canvas = createCanvas(800, 600);
            const editor = new CanvasEditor(canvas);
            const textOnly = (() => {
                const e = new CanvasEditor(createCanvas(800, 600));
                e.setText('x');
                e.render();
                return e.chain.contentHeight;
            })();

            editor.setText('x');
            editor.insertImage(SAMPLE);
            editor.render();
            assert.ok(editor.chain.contentHeight > textOnly + 200);
        });

        it('should count as one character in the flattened text', () => {
            const canvas = createCanvas(800, 600);
            const editor = new CanvasEditor(canvas);
            editor.setText('AB');
            editor.chain.moveCursorToCharPosition(2);
            editor.insertImage(SAMPLE);
            // "AB", a break newline, then the image (one char), so length grows.
            assert.strictEqual(editor.getText(), 'AB\n\n');
        });
    });

    describe('Interaction', () => {
        it('should hit-test the image box', () => {
            const canvas = createCanvas(800, 600);
            const editor = new CanvasEditor(canvas);
            editor.insertImage(SAMPLE);
            editor.render();

            const b = imageLinks(editor)[0].computed.box;
            assert.ok(editor.imageAt(b.x + b.w / 2, b.y + b.h / 2));
            assert.strictEqual(editor.imageAt(b.x - 20, b.y - 20), null);
        });

        it('should be removable with backspace', () => {
            const canvas = createCanvas(800, 600);
            const editor = new CanvasEditor(canvas);
            editor.setText('x');
            editor.insertImage(SAMPLE); // cursor ends up after the image
            assert.strictEqual(imageLinks(editor).length, 1);

            editor.chain.backspacePressed();
            assert.strictEqual(imageLinks(editor).length, 0);
        });

        it('should render without error (placeholder path, no decode)', () => {
            const canvas = createCanvas(800, 600);
            const editor = new CanvasEditor(canvas);
            editor.insertImage(SAMPLE);
            assert.doesNotThrow(() => editor.render());
        });

        it('should treat the popup/lightbox API as a no-op without a DOM', () => {
            const canvas = createCanvas(800, 600);
            const editor = new CanvasEditor(canvas);
            editor.insertImage(SAMPLE);
            assert.doesNotThrow(() => editor.openImageLightbox('https://cdn/full.jpg', 'alt'));
            assert.doesNotThrow(() => editor.closeImageLightbox());
        });
    });

    describe('Serialization & undo', () => {
        it('should round-trip through toJSON/fromJSON', () => {
            const canvas = createCanvas(800, 600);
            const editor = new CanvasEditor(canvas);
            editor.setText('Caption above');
            editor.insertImage(SAMPLE);

            const data = editor.toJSON();
            const entry = data.content.find(c => c.type === 'image');
            assert.deepStrictEqual(entry, { type: 'image', ...SAMPLE });

            const editor2 = new CanvasEditor(createCanvas(800, 600));
            editor2.fromJSON(data);
            const restored = imageLinks(editor2);
            assert.strictEqual(restored.length, 1);
            assert.strictEqual(restored[0].intrinsic.src, SAMPLE.src);
            assert.strictEqual(restored[0].intrinsic.full, SAMPLE.full);
        });

        it('should restore an image through undo/redo', () => {
            const canvas = createCanvas(800, 600);
            const editor = new CanvasEditor(canvas);
            editor.setText('x');
            editor.takeSnapshot();

            editor.chain.insertBlock(new ImageLink(SAMPLE));
            editor.takeSnapshot();

            assert.strictEqual(imageLinks(editor).length, 1);
            editor.undo();
            assert.strictEqual(imageLinks(editor).length, 0);
            editor.redo();
            assert.strictEqual(imageLinks(editor).length, 1);
            assert.strictEqual(imageLinks(editor)[0].intrinsic.full, SAMPLE.full);
        });
    });
});
