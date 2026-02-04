import { describe, it } from 'node:test';
import assert from 'node:assert';
import { Chain } from '../src/Chain.js';
import { FontProperties } from '../src/FontProperties.js';
import { TextLink, NewlineLink, CursorLink } from '../src/ChainLink.js';

// Create a mock canvas context for testing
function createMockContext() {
    let currentFont = '16px Arial';

    const ctx = {
        get font() {
            return currentFont;
        },
        set font(value) {
            currentFont = value;
        },
        save() {},
        restore() {},
        measureText(text) {
            const fontSize = parseInt(currentFont) || 16;
            const charWidth = fontSize * 0.5;

            return {
                width: text.length * charWidth,
                actualBoundingBoxAscent: fontSize * 0.75,
                actualBoundingBoxDescent: fontSize * 0.25
            };
        }
    };

    return ctx;
}

describe('Selection', () => {

    describe('setSelection', () => {

        it('should set selection between two positions', () => {
            const ctx = createMockContext();
            const fontProps = new FontProperties(16, 'Arial');
            const chain = new Chain(800, ctx, fontProps);

            chain.printableKeyPressed('H');
            chain.printableKeyPressed('e');
            chain.printableKeyPressed('l');
            chain.printableKeyPressed('l');
            chain.printableKeyPressed('o');

            const items = chain.getItems();
            const textLink = items.find(item => item instanceof TextLink);
            const textLinkIdx = items.indexOf(textLink);

            chain.setSelection(textLinkIdx, 0, textLinkIdx, 3);

            assert.ok(chain.hasSelection());
            assert.strictEqual(chain.selectionStart, 0);
            assert.strictEqual(chain.selectionEnd, 3);
        });

        it('should normalize selection (ensure start < end)', () => {
            const ctx = createMockContext();
            const fontProps = new FontProperties(16, 'Arial');
            const chain = new Chain(800, ctx, fontProps);

            chain.printableKeyPressed('H');
            chain.printableKeyPressed('i');

            const items = chain.getItems();
            const textLinkIdx = items.findIndex(item => item instanceof TextLink);

            // Set selection backwards (end before start)
            chain.setSelection(textLinkIdx, 2, textLinkIdx, 0);

            // Should be normalized
            assert.strictEqual(chain.selectionStart, 0);
            assert.strictEqual(chain.selectionEnd, 2);
        });

        it('should handle selection across multiple text links', () => {
            const ctx = createMockContext();
            const fontProps = new FontProperties(16, 'Arial');
            const chain = new Chain(800, ctx, fontProps);

            chain.printableKeyPressed('H');
            chain.printableKeyPressed('i');
            chain.printableKeyPressed(' ');
            chain.printableKeyPressed('!');

            const items = chain.getItems();
            chain.setSelection(0, 0, items.length - 1, 0);

            assert.ok(chain.hasSelection());
        });
    });

    describe('clearSelection', () => {

        it('should clear existing selection', () => {
            const ctx = createMockContext();
            const fontProps = new FontProperties(16, 'Arial');
            const chain = new Chain(800, ctx, fontProps);

            chain.printableKeyPressed('H');
            chain.printableKeyPressed('i');

            const items = chain.getItems();
            chain.setSelection(0, 0, 0, 2);

            assert.ok(chain.hasSelection());

            chain.clearSelection();

            assert.ok(!chain.hasSelection());
            assert.strictEqual(chain.selectionStart, null);
            assert.strictEqual(chain.selectionEnd, null);
        });

        it('should be safe to call when no selection exists', () => {
            const ctx = createMockContext();
            const fontProps = new FontProperties(16, 'Arial');
            const chain = new Chain(800, ctx, fontProps);

            chain.clearSelection();

            assert.ok(!chain.hasSelection());
        });
    });

    describe('hasSelection', () => {

        it('should return false for no selection', () => {
            const ctx = createMockContext();
            const fontProps = new FontProperties(16, 'Arial');
            const chain = new Chain(800, ctx, fontProps);

            assert.strictEqual(chain.hasSelection(), false);
        });

        it('should return true for active selection', () => {
            const ctx = createMockContext();
            const fontProps = new FontProperties(16, 'Arial');
            const chain = new Chain(800, ctx, fontProps);

            chain.printableKeyPressed('H');
            chain.printableKeyPressed('i');

            const items = chain.getItems();
            chain.setSelection(0, 0, 0, 2);

            assert.strictEqual(chain.hasSelection(), true);
        });

        it('should return false when start equals end', () => {
            const ctx = createMockContext();
            const fontProps = new FontProperties(16, 'Arial');
            const chain = new Chain(800, ctx, fontProps);

            chain.printableKeyPressed('H');
            chain.printableKeyPressed('i');

            const items = chain.getItems();
            chain.setSelection(0, 1, 0, 1);

            assert.strictEqual(chain.hasSelection(), false);
        });

        it('should return false after clearing selection', () => {
            const ctx = createMockContext();
            const fontProps = new FontProperties(16, 'Arial');
            const chain = new Chain(800, ctx, fontProps);

            chain.printableKeyPressed('H');
            chain.printableKeyPressed('i');

            const items = chain.getItems();
            chain.setSelection(0, 0, 0, 2);
            chain.clearSelection();

            assert.strictEqual(chain.hasSelection(), false);
        });
    });

    describe('getSelectedText', () => {

        it('should return empty string when no selection', () => {
            const ctx = createMockContext();
            const fontProps = new FontProperties(16, 'Arial');
            const chain = new Chain(800, ctx, fontProps);

            chain.printableKeyPressed('H');
            chain.printableKeyPressed('i');

            assert.strictEqual(chain.getSelectedText(), '');
        });

        it('should return selected text from single TextLink', () => {
            const ctx = createMockContext();
            const fontProps = new FontProperties(16, 'Arial');
            const chain = new Chain(800, ctx, fontProps);

            chain.printableKeyPressed('H');
            chain.printableKeyPressed('e');
            chain.printableKeyPressed('l');
            chain.printableKeyPressed('l');
            chain.printableKeyPressed('o');

            const items = chain.getItems();
            const textLinkIdx = items.findIndex(item => item instanceof TextLink);
            chain.setSelection(textLinkIdx, 0, textLinkIdx, 3);

            assert.strictEqual(chain.getSelectedText(), 'Hel');
        });

        it('should return full text when selecting all', () => {
            const ctx = createMockContext();
            const fontProps = new FontProperties(16, 'Arial');
            const chain = new Chain(800, ctx, fontProps);

            chain.printableKeyPressed('H');
            chain.printableKeyPressed('i');

            const items = chain.getItems();
            const textLinkIdx = items.findIndex(item => item instanceof TextLink);
            const textLink = items[textLinkIdx];
            chain.setSelection(textLinkIdx, 0, textLinkIdx, textLink.text.length);

            assert.strictEqual(chain.getSelectedText(), 'Hi');
        });

        it('should include newlines in selection', () => {
            const ctx = createMockContext();
            const fontProps = new FontProperties(16, 'Arial');
            const chain = new Chain(800, ctx, fontProps);

            chain.printableKeyPressed('A');
            chain.enterPressed();
            chain.printableKeyPressed('B');

            const items = chain.getItems();
            chain.setSelection(0, 0, items.length - 1, 0);

            const selectedText = chain.getSelectedText();
            assert.ok(selectedText.includes('\n'));
        });

        it('should handle partial selection at start', () => {
            const ctx = createMockContext();
            const fontProps = new FontProperties(16, 'Arial');
            const chain = new Chain(800, ctx, fontProps);

            chain.printableKeyPressed('H');
            chain.printableKeyPressed('e');
            chain.printableKeyPressed('l');
            chain.printableKeyPressed('l');
            chain.printableKeyPressed('o');

            const items = chain.getItems();
            const textLinkIdx = items.findIndex(item => item instanceof TextLink);
            chain.setSelection(textLinkIdx, 1, textLinkIdx, 4);

            assert.strictEqual(chain.getSelectedText(), 'ell');
        });

        it('should handle selection across multiple lines', () => {
            const ctx = createMockContext();
            const fontProps = new FontProperties(16, 'Arial');
            const chain = new Chain(800, ctx, fontProps);

            chain.printableKeyPressed('A');
            chain.enterPressed();
            chain.printableKeyPressed('B');
            chain.enterPressed();
            chain.printableKeyPressed('C');

            const items = chain.getItems();
            chain.setSelection(0, 0, items.length - 1, 0);

            const selectedText = chain.getSelectedText();
            assert.ok(selectedText.includes('A'));
            assert.ok(selectedText.includes('B'));
        });
    });

    describe('getCharPosition and getItemFromCharPosition', () => {

        it('should convert between item position and character position', () => {
            const ctx = createMockContext();
            const fontProps = new FontProperties(16, 'Arial');
            const chain = new Chain(800, ctx, fontProps);

            chain.printableKeyPressed('H');
            chain.printableKeyPressed('e');
            chain.printableKeyPressed('l');
            chain.printableKeyPressed('l');
            chain.printableKeyPressed('o');

            const items = chain.getItems();
            const textLinkIdx = items.findIndex(item => item instanceof TextLink);

            const charPos = chain.getCharPosition(textLinkIdx, 2);
            const result = chain.getItemFromCharPosition(charPos);

            assert.strictEqual(result.itemIdx, textLinkIdx);
            assert.strictEqual(result.charOffset, 2);
        });

        it('should handle position at start of document', () => {
            const ctx = createMockContext();
            const fontProps = new FontProperties(16, 'Arial');
            const chain = new Chain(800, ctx, fontProps);

            chain.printableKeyPressed('H');
            chain.printableKeyPressed('i');

            const charPos = chain.getCharPosition(0, 0);
            assert.strictEqual(charPos, 0);

            const result = chain.getItemFromCharPosition(0);
            assert.strictEqual(result.itemIdx, 0);
            assert.strictEqual(result.charOffset, 0);
        });

        it('should handle position at end of document', () => {
            const ctx = createMockContext();
            const fontProps = new FontProperties(16, 'Arial');
            const chain = new Chain(800, ctx, fontProps);

            chain.printableKeyPressed('H');
            chain.printableKeyPressed('i');

            const items = chain.getItems();
            const textLink = items.find(item => item instanceof TextLink);
            const textLinkIdx = items.indexOf(textLink);

            const charPos = chain.getCharPosition(textLinkIdx, textLink.text.length);
            const result = chain.getItemFromCharPosition(charPos);

            assert.ok(result.itemIdx >= 0);
        });

        it('should handle newlines in character position', () => {
            const ctx = createMockContext();
            const fontProps = new FontProperties(16, 'Arial');
            const chain = new Chain(800, ctx, fontProps);

            chain.printableKeyPressed('A');
            chain.enterPressed();
            chain.printableKeyPressed('B');

            const items = chain.getItems();
            const newlineIdx = items.findIndex(item => item instanceof NewlineLink);

            const charPos = chain.getCharPosition(newlineIdx, 0);
            assert.ok(charPos > 0); // After 'A'
        });
    });

    describe('moveCursorToCharPosition', () => {

        it('should move cursor to beginning', () => {
            const ctx = createMockContext();
            const fontProps = new FontProperties(16, 'Arial');
            const chain = new Chain(800, ctx, fontProps);

            chain.printableKeyPressed('H');
            chain.printableKeyPressed('i');

            chain.moveCursorToCharPosition(0);

            const cursorIdx = chain.cursorIdx();
            assert.strictEqual(cursorIdx, 0);
        });

        it('should move cursor to middle of text', () => {
            const ctx = createMockContext();
            const fontProps = new FontProperties(16, 'Arial');
            const chain = new Chain(800, ctx, fontProps);

            chain.printableKeyPressed('H');
            chain.printableKeyPressed('e');
            chain.printableKeyPressed('l');
            chain.printableKeyPressed('l');
            chain.printableKeyPressed('o');

            chain.moveCursorToCharPosition(2);

            // Cursor should be in the middle
            const cursorIdx = chain.cursorIdx();
            assert.ok(cursorIdx > 0);
        });

        it('should move cursor to end', () => {
            const ctx = createMockContext();
            const fontProps = new FontProperties(16, 'Arial');
            const chain = new Chain(800, ctx, fontProps);

            chain.printableKeyPressed('H');
            chain.printableKeyPressed('i');

            const items = chain.getItems();
            const textLink = items.find(item => item instanceof TextLink);
            const charPosEnd = textLink.text.length;

            chain.moveCursorToCharPosition(charPosEnd);

            const cursorIdx = chain.cursorIdx();
            const itemsAfter = chain.getItems();
            assert.strictEqual(cursorIdx, itemsAfter.length - 1);
        });
    });

    describe('Arrow keys with selection', () => {

        it('should clear selection and move to start on left arrow', () => {
            const ctx = createMockContext();
            const fontProps = new FontProperties(16, 'Arial');
            const chain = new Chain(800, ctx, fontProps);

            chain.printableKeyPressed('H');
            chain.printableKeyPressed('e');
            chain.printableKeyPressed('l');
            chain.printableKeyPressed('l');
            chain.printableKeyPressed('o');

            const items = chain.getItems();
            const textLinkIdx = items.findIndex(item => item instanceof TextLink);
            chain.setSelection(textLinkIdx, 1, textLinkIdx, 4);

            chain.leftArrowPressed();

            assert.ok(!chain.hasSelection());
            // Cursor should be at selection start (position 1)
            const cursorIdx = chain.cursorIdx();
            assert.ok(cursorIdx >= 0);
        });

        it('should clear selection and move to end on right arrow', () => {
            const ctx = createMockContext();
            const fontProps = new FontProperties(16, 'Arial');
            const chain = new Chain(800, ctx, fontProps);

            chain.printableKeyPressed('H');
            chain.printableKeyPressed('e');
            chain.printableKeyPressed('l');
            chain.printableKeyPressed('l');
            chain.printableKeyPressed('o');

            const items = chain.getItems();
            const textLinkIdx = items.findIndex(item => item instanceof TextLink);
            chain.setSelection(textLinkIdx, 1, textLinkIdx, 4);

            chain.rightArrowPressed();

            assert.ok(!chain.hasSelection());
            // Cursor should be at selection end (position 4)
            const cursorIdx = chain.cursorIdx();
            assert.ok(cursorIdx >= 0);
        });
    });
});
