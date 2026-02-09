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
    // Don't actually call the callback - we don't need animation in tests
    return id;
};

global.cancelAnimationFrame = (id) => {
    animationFrameCallbacks.delete(id);
};

describe('Text Formatting', () => {
    describe('Bold', () => {
        it('should toggle bold on selected text', () => {
            const canvas = createCanvas(800, 600);
            const editor = new CanvasEditor(canvas);
            editor.setText('Hello World');

            // Select all text
            editor.selectAll();

            // Toggle bold
            editor.toggleBold();

            const items = editor.chain.getItems();
            const textItems = items.filter(item => item.text && item.text.trim().length > 0);
            // All text items should be bold
            textItems.forEach(item => {
                assert.strictEqual(item.intrinsic.fontProperties.weight, 'bold');
            });
        });

        it('should set bold for next typed text when no selection', () => {
            const canvas = createCanvas(800, 600);
            const editor = new CanvasEditor(canvas);

            editor.toggleBold();

            assert.strictEqual(editor.chain.currentFontProperties.weight, 'bold');
        });

        it('should toggle bold off when already bold', () => {
            const canvas = createCanvas(800, 600);
            const editor = new CanvasEditor(canvas);
            editor.setText('Hello');

            editor.selectAll();
            editor.toggleBold();
            assert.strictEqual(editor.chain.getItems()[0].intrinsic.fontProperties.weight, 'bold');

            editor.toggleBold();
            assert.strictEqual(editor.chain.getItems()[0].intrinsic.fontProperties.weight, 'normal');
        });
    });

    describe('Italic', () => {
        it('should toggle italic on selected text', () => {
            const canvas = createCanvas(800, 600);
            const editor = new CanvasEditor(canvas);
            editor.setText('Hello World');

            editor.selectAll();
            editor.toggleItalic();

            const items = editor.chain.getItems();
            const textItems = items.filter(item => item.text && item.text.trim().length > 0);
            textItems.forEach(item => {
                assert.strictEqual(item.intrinsic.fontProperties.style, 'italic');
            });
        });

        it('should set italic for next typed text when no selection', () => {
            const canvas = createCanvas(800, 600);
            const editor = new CanvasEditor(canvas);

            editor.toggleItalic();

            assert.strictEqual(editor.chain.currentFontProperties.style, 'italic');
        });
    });

    describe('Underline', () => {
        it('should toggle underline on selected text', () => {
            const canvas = createCanvas(800, 600);
            const editor = new CanvasEditor(canvas);
            editor.setText('Hello World');

            editor.selectAll();
            editor.toggleUnderline();

            const items = editor.chain.getItems();
            const textItems = items.filter(item => item.text && item.text.trim().length > 0);
            textItems.forEach(item => {
                assert.strictEqual(item.intrinsic.fontProperties.underline, true);
            });
        });

        it('should set underline for next typed text when no selection', () => {
            const canvas = createCanvas(800, 600);
            const editor = new CanvasEditor(canvas);

            editor.toggleUnderline();

            assert.strictEqual(editor.chain.currentFontProperties.underline, true);
        });
    });

    describe('Strikethrough', () => {
        it('should toggle strikethrough on selected text', () => {
            const canvas = createCanvas(800, 600);
            const editor = new CanvasEditor(canvas);
            editor.setText('Hello World');

            editor.selectAll();
            editor.toggleStrikethrough();

            const items = editor.chain.getItems();
            const textItems = items.filter(item => item.text && item.text.trim().length > 0);
            textItems.forEach(item => {
                assert.strictEqual(item.intrinsic.fontProperties.strikethrough, true);
            });
        });
    });

    describe('Superscript', () => {
        it('should toggle superscript on selected text', () => {
            const canvas = createCanvas(800, 600);
            const editor = new CanvasEditor(canvas);
            editor.setText('Hello World');

            editor.selectAll();
            editor.toggleSuperscript();

            const items = editor.chain.getItems();
            const textItems = items.filter(item => item.text && item.text.trim().length > 0);
            textItems.forEach(item => {
                assert.strictEqual(item.intrinsic.fontProperties.superscript, true);
            });
        });

        it('should disable subscript when enabling superscript', () => {
            const canvas = createCanvas(800, 600);
            const editor = new CanvasEditor(canvas);
            editor.setText('Hello');

            editor.selectAll();
            editor.toggleSubscript();
            assert.strictEqual(editor.chain.getItems()[0].intrinsic.fontProperties.subscript, true);

            editor.toggleSuperscript();
            assert.strictEqual(editor.chain.getItems()[0].intrinsic.fontProperties.superscript, true);
            assert.strictEqual(editor.chain.getItems()[0].intrinsic.fontProperties.subscript, false);
        });
    });

    describe('Subscript', () => {
        it('should toggle subscript on selected text', () => {
            const canvas = createCanvas(800, 600);
            const editor = new CanvasEditor(canvas);
            editor.setText('Hello World');

            editor.selectAll();
            editor.toggleSubscript();

            const items = editor.chain.getItems();
            const textItems = items.filter(item => item.text && item.text.trim().length > 0);
            textItems.forEach(item => {
                assert.strictEqual(item.intrinsic.fontProperties.subscript, true);
            });
        });

        it('should disable superscript when enabling subscript', () => {
            const canvas = createCanvas(800, 600);
            const editor = new CanvasEditor(canvas);
            editor.setText('Hello');

            editor.selectAll();
            editor.toggleSuperscript();
            assert.strictEqual(editor.chain.getItems()[0].intrinsic.fontProperties.superscript, true);

            editor.toggleSubscript();
            assert.strictEqual(editor.chain.getItems()[0].intrinsic.fontProperties.subscript, true);
            assert.strictEqual(editor.chain.getItems()[0].intrinsic.fontProperties.superscript, false);
        });
    });

    describe('Text Color', () => {
        it('should set text color on selected text', () => {
            const canvas = createCanvas(800, 600);
            const editor = new CanvasEditor(canvas);
            editor.setText('Hello World');

            editor.selectAll();
            editor.setTextColor('#ff0000');

            const items = editor.chain.getItems();
            const textItems = items.filter(item => item.text && item.text.trim().length > 0);
            textItems.forEach(item => {
                assert.strictEqual(item.intrinsic.fontProperties.color, '#ff0000');
            });
        });

        it('should set color for next typed text when no selection', () => {
            const canvas = createCanvas(800, 600);
            const editor = new CanvasEditor(canvas);

            editor.setTextColor('#00ff00');

            assert.strictEqual(editor.chain.currentFontProperties.color, '#00ff00');
        });
    });

    describe('Font Size Controls', () => {
        it('should increase font size by 2px', () => {
            const canvas = createCanvas(800, 600);
            const editor = new CanvasEditor(canvas);

            const initialSize = editor.chain.currentFontProperties.size;
            editor.increaseFontSize();

            assert.strictEqual(editor.chain.currentFontProperties.size, initialSize + 2);
        });

        it('should not increase font size beyond 72px', () => {
            const canvas = createCanvas(800, 600);
            const editor = new CanvasEditor(canvas);

            editor.setFontSize(72);
            editor.increaseFontSize();

            assert.strictEqual(editor.chain.currentFontProperties.size, 72);
        });

        it('should decrease font size by 2px', () => {
            const canvas = createCanvas(800, 600);
            const editor = new CanvasEditor(canvas);

            editor.setFontSize(16);
            editor.decreaseFontSize();

            assert.strictEqual(editor.chain.currentFontProperties.size, 14);
        });

        it('should not decrease font size below 8px', () => {
            const canvas = createCanvas(800, 600);
            const editor = new CanvasEditor(canvas);

            editor.setFontSize(8);
            editor.decreaseFontSize();

            assert.strictEqual(editor.chain.currentFontProperties.size, 8);
        });

        it('should increase font size on selected text', () => {
            const canvas = createCanvas(800, 600);
            const editor = new CanvasEditor(canvas);
            editor.setText('Hello');

            editor.selectAll();
            editor.increaseFontSize();

            const textItem = editor.chain.getItems()[0];
            assert.strictEqual(textItem.intrinsic.fontProperties.size, 18);
        });
    });

    describe('Clear Formatting', () => {
        it('should clear all formatting from selected text', () => {
            const canvas = createCanvas(800, 600);
            const editor = new CanvasEditor(canvas);
            editor.setText('Hello World');

            editor.selectAll();
            editor.toggleBold();
            editor.toggleItalic();
            editor.toggleUnderline();
            editor.setTextColor('#ff0000');

            editor.clearFormatting();

            const items = editor.chain.getItems();
            const textItems = items.filter(item => item.text && item.text.trim().length > 0);
            textItems.forEach(item => {
                assert.strictEqual(item.intrinsic.fontProperties.weight, 'normal');
                assert.strictEqual(item.intrinsic.fontProperties.style, 'normal');
                assert.strictEqual(item.intrinsic.fontProperties.underline, false);
                assert.strictEqual(item.intrinsic.fontProperties.color, '#000000');
            });
        });

        it('should preserve text content when clearing formatting', () => {
            const canvas = createCanvas(800, 600);
            const editor = new CanvasEditor(canvas);
            editor.setText('Hello World');

            editor.selectAll();
            editor.toggleBold();
            editor.clearFormatting();

            assert.strictEqual(editor.getText(), 'Hello World');
        });

        it('should do nothing when no selection', () => {
            const canvas = createCanvas(800, 600);
            const editor = new CanvasEditor(canvas);
            editor.setText('Hello');

            const itemsBefore = editor.chain.getItems().length;
            editor.clearFormatting();
            const itemsAfter = editor.chain.getItems().length;

            assert.strictEqual(itemsBefore, itemsAfter);
        });
    });

    describe('Combined Formatting', () => {
        it('should apply multiple formats to text', () => {
            const canvas = createCanvas(800, 600);
            const editor = new CanvasEditor(canvas);
            editor.setText('Hello');

            editor.selectAll();
            editor.toggleBold();
            editor.toggleItalic();
            editor.toggleUnderline();
            editor.setTextColor('#0000ff');

            const textItem = editor.chain.getItems()[0];
            assert.strictEqual(textItem.intrinsic.fontProperties.weight, 'bold');
            assert.strictEqual(textItem.intrinsic.fontProperties.style, 'italic');
            assert.strictEqual(textItem.intrinsic.fontProperties.underline, true);
            assert.strictEqual(textItem.intrinsic.fontProperties.color, '#0000ff');
        });

        it('should apply formatting to partial selection', () => {
            const canvas = createCanvas(800, 600);
            const editor = new CanvasEditor(canvas);
            editor.setText('Hello World');

            // Select "Hello" (first 5 characters)
            editor.chain.setSelection(0, 0, 0, 5);
            editor.toggleBold();

            const items = editor.chain.getItems();
            const helloItem = items.find(item => item.text && item.text.includes('Hello'));
            assert.strictEqual(helloItem.intrinsic.fontProperties.weight, 'bold');
        });
    });
});

describe('Text Alignment', () => {
    it('should set paragraph alignment to center', () => {
        const canvas = createCanvas(800, 600);
        const editor = new CanvasEditor(canvas);
        editor.setText('Hello World');

        editor.setAlignment('center');

        const paragraphIndex = editor.getCurrentParagraphIndex();
        assert.strictEqual(editor.paragraphAlignments.get(paragraphIndex), 'center');
    });

    it('should set paragraph alignment to left', () => {
        const canvas = createCanvas(800, 600);
        const editor = new CanvasEditor(canvas);
        editor.setText('Hello World');

        editor.setAlignment('center');
        editor.setAlignment('left');

        const paragraphIndex = editor.getCurrentParagraphIndex();
        assert.strictEqual(editor.paragraphAlignments.get(paragraphIndex), undefined);
    });

    it('should track different alignments for different paragraphs', () => {
        const canvas = createCanvas(800, 600);
        const editor = new CanvasEditor(canvas);
        editor.setText('First\nSecond\nThird');

        // Set first paragraph to center (cursor at position 0)
        editor.chain.moveCursorToCharPosition(0);
        editor.setAlignment('center');

        // Move to second paragraph (after "First\n", position 6) and set to left
        editor.chain.moveCursorToCharPosition(7);
        editor.setAlignment('left');

        assert.strictEqual(editor.paragraphAlignments.get(0), 'center');
        assert.strictEqual(editor.paragraphAlignments.get(1), undefined);
    });

    it('should get current paragraph index correctly', () => {
        const canvas = createCanvas(800, 600);
        const editor = new CanvasEditor(canvas);
        editor.setText('First\nSecond\nThird');

        editor.chain.moveCursorToCharPosition(0);
        assert.strictEqual(editor.getCurrentParagraphIndex(), 0);

        // Move to second paragraph (position 7 is after "First\n")
        editor.chain.moveCursorToCharPosition(7);
        assert.strictEqual(editor.getCurrentParagraphIndex(), 1);

        // Move to third paragraph (position 14 is after "First\nSecond\n")
        editor.chain.moveCursorToCharPosition(14);
        assert.strictEqual(editor.getCurrentParagraphIndex(), 2);
    });

    it('should toggle center alignment', () => {
        const canvas = createCanvas(800, 600);
        const editor = new CanvasEditor(canvas);
        editor.setText('Hello');

        editor.toggleCenterAlign();
        assert.strictEqual(editor.paragraphAlignments.get(0), 'center');

        editor.toggleCenterAlign();
        assert.strictEqual(editor.paragraphAlignments.get(0), undefined);
    });
});

describe('Line Spacing', () => {
    it('should set line spacing', () => {
        const canvas = createCanvas(800, 600);
        const editor = new CanvasEditor(canvas);

        editor.setLineSpacing(2.0);

        assert.strictEqual(editor.chain.LINE_SPACING_MULT, 2.0);
    });

    it('should get line spacing', () => {
        const canvas = createCanvas(800, 600);
        const editor = new CanvasEditor(canvas);

        editor.setLineSpacing(1.15);

        assert.strictEqual(editor.getLineSpacing(), 1.15);
    });

    it('should have default line spacing of 1.5', () => {
        const canvas = createCanvas(800, 600);
        const editor = new CanvasEditor(canvas);

        assert.strictEqual(editor.getLineSpacing(), 1.5);
    });

    it('should apply line spacing to all lines', () => {
        const canvas = createCanvas(800, 600);
        const editor = new CanvasEditor(canvas);
        editor.setText('Line 1\nLine 2\nLine 3');

        const spacing = 2.5;
        editor.setLineSpacing(spacing);

        assert.strictEqual(editor.chain.LINE_SPACING_MULT, spacing);
    });
});
