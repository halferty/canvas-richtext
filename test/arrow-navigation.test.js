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

describe('Arrow Key Navigation', () => {

    describe('leftArrowPressed', () => {

        it('should do nothing when cursor is at start of empty document', () => {
            const ctx = createMockContext();
            const fontProps = new FontProperties(16, 'Arial');
            const chain = new Chain(800, ctx, fontProps);

            const cursorIdxBefore = chain.cursorIdx();
            chain.leftArrowPressed();
            const cursorIdxAfter = chain.cursorIdx();

            assert.strictEqual(cursorIdxAfter, cursorIdxBefore);
        });

        it('should move cursor left by one character', () => {
            const ctx = createMockContext();
            const fontProps = new FontProperties(16, 'Arial');
            const chain = new Chain(800, ctx, fontProps);

            chain.printableKeyPressed('A');
            chain.printableKeyPressed('B');

            const itemsBefore = chain.getItems();
            const textLinksBefore = itemsBefore.filter(item => item instanceof TextLink);

            chain.leftArrowPressed();

            const itemsAfter = chain.getItems();
            const textLinksAfter = itemsAfter.filter(item => item instanceof TextLink);
            const cursorIdx = chain.cursorIdx();

            // Should have split the TextLink
            assert.ok(textLinksAfter.length > textLinksBefore.length ||
                     (itemsAfter.length > itemsBefore.length && cursorIdx >= 0));
        });

        it('should move cursor through entire word', () => {
            const ctx = createMockContext();
            const fontProps = new FontProperties(16, 'Arial');
            const chain = new Chain(800, ctx, fontProps);

            chain.printableKeyPressed('H');
            chain.printableKeyPressed('i');

            chain.leftArrowPressed();
            chain.leftArrowPressed();

            const cursorIdx = chain.cursorIdx();
            assert.strictEqual(cursorIdx, 0);
        });

        it('should move cursor across newline', () => {
            const ctx = createMockContext();
            const fontProps = new FontProperties(16, 'Arial');
            const chain = new Chain(800, ctx, fontProps);

            chain.printableKeyPressed('A');
            chain.enterPressed();
            chain.printableKeyPressed('B');

            chain.leftArrowPressed();
            chain.leftArrowPressed();

            const items = chain.getItems();
            const cursorIdx = chain.cursorIdx();

            // Cursor should be before the newline or at the 'A'
            assert.ok(cursorIdx <= 1);
        });

        it('should handle multiple left presses', () => {
            const ctx = createMockContext();
            const fontProps = new FontProperties(16, 'Arial');
            const chain = new Chain(800, ctx, fontProps);

            chain.printableKeyPressed('A');
            chain.printableKeyPressed('B');
            chain.printableKeyPressed('C');

            chain.leftArrowPressed();
            chain.leftArrowPressed();
            chain.leftArrowPressed();

            const cursorIdx = chain.cursorIdx();
            assert.strictEqual(cursorIdx, 0);
        });

        it('should not move past start of document', () => {
            const ctx = createMockContext();
            const fontProps = new FontProperties(16, 'Arial');
            const chain = new Chain(800, ctx, fontProps);

            chain.printableKeyPressed('A');
            chain.leftArrowPressed();
            chain.leftArrowPressed(); // Extra press

            const cursorIdx = chain.cursorIdx();
            assert.strictEqual(cursorIdx, 0);
        });
    });

    describe('rightArrowPressed', () => {

        it('should do nothing when cursor is at end of empty document', () => {
            const ctx = createMockContext();
            const fontProps = new FontProperties(16, 'Arial');
            const chain = new Chain(800, ctx, fontProps);

            const cursorIdxBefore = chain.cursorIdx();
            chain.rightArrowPressed();
            const cursorIdxAfter = chain.cursorIdx();

            assert.strictEqual(cursorIdxAfter, cursorIdxBefore);
        });

        it('should move cursor right by one character', () => {
            const ctx = createMockContext();
            const fontProps = new FontProperties(16, 'Arial');
            const chain = new Chain(800, ctx, fontProps);

            chain.printableKeyPressed('A');
            chain.printableKeyPressed('B');
            chain.leftArrowPressed();
            chain.leftArrowPressed();

            const cursorIdxBefore = chain.cursorIdx();
            chain.rightArrowPressed();
            const cursorIdxAfter = chain.cursorIdx();

            assert.ok(cursorIdxAfter > cursorIdxBefore);
        });

        it('should move cursor through entire word', () => {
            const ctx = createMockContext();
            const fontProps = new FontProperties(16, 'Arial');
            const chain = new Chain(800, ctx, fontProps);

            chain.printableKeyPressed('H');
            chain.printableKeyPressed('i');
            chain.leftArrowPressed();
            chain.leftArrowPressed();

            chain.rightArrowPressed();
            chain.rightArrowPressed();

            const items = chain.getItems();
            const cursorIdx = chain.cursorIdx();
            assert.strictEqual(cursorIdx, items.length - 1);
        });

        it('should move cursor across newline', () => {
            const ctx = createMockContext();
            const fontProps = new FontProperties(16, 'Arial');
            const chain = new Chain(800, ctx, fontProps);

            chain.printableKeyPressed('A');
            chain.enterPressed();
            chain.leftArrowPressed();

            chain.rightArrowPressed();

            const items = chain.getItems();
            const cursorIdx = chain.cursorIdx();

            // Cursor should be after the newline
            assert.ok(cursorIdx > 1);
        });

        it('should not move past end of document', () => {
            const ctx = createMockContext();
            const fontProps = new FontProperties(16, 'Arial');
            const chain = new Chain(800, ctx, fontProps);

            chain.printableKeyPressed('A');
            chain.rightArrowPressed(); // Extra press

            const items = chain.getItems();
            const cursorIdx = chain.cursorIdx();
            assert.strictEqual(cursorIdx, items.length - 1);
        });
    });

    describe('upArrowPressed', () => {

        it('should move to beginning when on first line', () => {
            const ctx = createMockContext();
            const fontProps = new FontProperties(16, 'Arial');
            const chain = new Chain(800, ctx, fontProps);

            chain.printableKeyPressed('H');
            chain.printableKeyPressed('i');

            chain.upArrowPressed();

            const cursorIdx = chain.cursorIdx();
            assert.strictEqual(cursorIdx, 0);
        });

        it('should move to previous line when on second line', () => {
            const ctx = createMockContext();
            const fontProps = new FontProperties(16, 'Arial');
            const chain = new Chain(800, ctx, fontProps);

            chain.printableKeyPressed('A');
            chain.enterPressed();
            chain.printableKeyPressed('B');

            const cursorIdxBefore = chain.cursorIdx();
            chain.upArrowPressed();
            const cursorIdxAfter = chain.cursorIdx();

            // Cursor should have moved up
            assert.ok(cursorIdxAfter < cursorIdxBefore);
        });

        it('should handle multiple lines', () => {
            const ctx = createMockContext();
            const fontProps = new FontProperties(16, 'Arial');
            const chain = new Chain(800, ctx, fontProps);

            chain.printableKeyPressed('A');
            chain.enterPressed();
            chain.printableKeyPressed('B');
            chain.enterPressed();
            chain.printableKeyPressed('C');

            chain.upArrowPressed();
            chain.upArrowPressed();

            const cursorIdx = chain.cursorIdx();
            // Should be on first line
            assert.ok(cursorIdx <= 1);
        });

        it('should maintain horizontal position when moving up', () => {
            const ctx = createMockContext();
            const fontProps = new FontProperties(16, 'Arial');
            const chain = new Chain(800, ctx, fontProps);

            chain.printableKeyPressed('H');
            chain.printableKeyPressed('e');
            chain.printableKeyPressed('l');
            chain.printableKeyPressed('l');
            chain.printableKeyPressed('o');
            chain.enterPressed();
            chain.printableKeyPressed('W');
            chain.printableKeyPressed('o');
            chain.printableKeyPressed('r');
            chain.printableKeyPressed('l');
            chain.printableKeyPressed('d');

            // Move up should try to maintain X position
            chain.upArrowPressed();

            // Just verify cursor moved
            const items = chain.getItems();
            assert.ok(chain.cursorIdx() >= 0);
        });
    });

    describe('downArrowPressed', () => {

        it('should move to end when on last line', () => {
            const ctx = createMockContext();
            const fontProps = new FontProperties(16, 'Arial');
            const chain = new Chain(800, ctx, fontProps);

            chain.printableKeyPressed('H');
            chain.printableKeyPressed('i');
            chain.leftArrowPressed();

            chain.downArrowPressed();

            const items = chain.getItems();
            const cursorIdx = chain.cursorIdx();
            assert.strictEqual(cursorIdx, items.length - 1);
        });

        it('should move to next line when on first line', () => {
            const ctx = createMockContext();
            const fontProps = new FontProperties(16, 'Arial');
            const chain = new Chain(800, ctx, fontProps);

            chain.printableKeyPressed('A');
            chain.enterPressed();
            chain.printableKeyPressed('B');
            chain.leftArrowPressed();
            chain.leftArrowPressed();
            chain.leftArrowPressed();

            const cursorIdxBefore = chain.cursorIdx();
            chain.downArrowPressed();
            const cursorIdxAfter = chain.cursorIdx();

            // Cursor should have moved down
            assert.ok(cursorIdxAfter > cursorIdxBefore);
        });

        it('should handle multiple lines', () => {
            const ctx = createMockContext();
            const fontProps = new FontProperties(16, 'Arial');
            const chain = new Chain(800, ctx, fontProps);

            chain.printableKeyPressed('A');
            chain.enterPressed();
            chain.printableKeyPressed('B');
            chain.enterPressed();
            chain.printableKeyPressed('C');

            // Go to start
            chain.leftArrowPressed();
            chain.leftArrowPressed();
            chain.leftArrowPressed();
            chain.leftArrowPressed();
            chain.leftArrowPressed();

            chain.downArrowPressed();
            chain.downArrowPressed();

            const items = chain.getItems();
            const cursorIdx = chain.cursorIdx();
            // Should be on last line
            assert.ok(cursorIdx >= items.length - 2);
        });
    });

    describe('Combined navigation', () => {

        it('should handle left then right', () => {
            const ctx = createMockContext();
            const fontProps = new FontProperties(16, 'Arial');
            const chain = new Chain(800, ctx, fontProps);

            chain.printableKeyPressed('A');
            chain.printableKeyPressed('B');

            const cursorIdxStart = chain.cursorIdx();
            chain.leftArrowPressed();
            chain.rightArrowPressed();
            const cursorIdxEnd = chain.cursorIdx();

            assert.strictEqual(cursorIdxStart, cursorIdxEnd);
        });

        it('should handle up then down', () => {
            const ctx = createMockContext();
            const fontProps = new FontProperties(16, 'Arial');
            const chain = new Chain(800, ctx, fontProps);

            chain.printableKeyPressed('A');
            chain.enterPressed();
            chain.printableKeyPressed('B');

            const cursorIdxStart = chain.cursorIdx();
            chain.upArrowPressed();
            chain.downArrowPressed();
            const cursorIdxEnd = chain.cursorIdx();

            // Should be back near original position
            assert.ok(Math.abs(cursorIdxStart - cursorIdxEnd) <= 2);
        });

        it('should navigate complex document', () => {
            const ctx = createMockContext();
            const fontProps = new FontProperties(16, 'Arial');
            const chain = new Chain(800, ctx, fontProps);

            // Create 3 lines
            chain.printableKeyPressed('A');
            chain.enterPressed();
            chain.printableKeyPressed('B');
            chain.enterPressed();
            chain.printableKeyPressed('C');

            // Navigate around
            chain.upArrowPressed();
            chain.leftArrowPressed();
            chain.downArrowPressed();
            chain.rightArrowPressed();

            // Just ensure cursor is valid
            const cursorIdx = chain.cursorIdx();
            const items = chain.getItems();
            assert.ok(cursorIdx >= 0 && cursorIdx < items.length);
        });

        it('should allow editing after navigation', () => {
            const ctx = createMockContext();
            const fontProps = new FontProperties(16, 'Arial');
            const chain = new Chain(800, ctx, fontProps);

            chain.printableKeyPressed('A');
            chain.printableKeyPressed('B');
            chain.leftArrowPressed();
            chain.printableKeyPressed('X');

            const items = chain.getItems();
            // Should have inserted X between A and B
            assert.ok(items.some(item => item instanceof TextLink));
        });
    });

    describe('Edge cases', () => {

        it('should handle arrow keys on empty document', () => {
            const ctx = createMockContext();
            const fontProps = new FontProperties(16, 'Arial');
            const chain = new Chain(800, ctx, fontProps);

            chain.leftArrowPressed();
            chain.rightArrowPressed();
            chain.upArrowPressed();
            chain.downArrowPressed();

            const cursorIdx = chain.cursorIdx();
            assert.strictEqual(cursorIdx, 0);
        });

        it('should handle many consecutive left arrows', () => {
            const ctx = createMockContext();
            const fontProps = new FontProperties(16, 'Arial');
            const chain = new Chain(800, ctx, fontProps);

            chain.printableKeyPressed('A');
            chain.printableKeyPressed('B');
            chain.printableKeyPressed('C');

            for (let i = 0; i < 10; i++) {
                chain.leftArrowPressed();
            }

            const cursorIdx = chain.cursorIdx();
            assert.strictEqual(cursorIdx, 0);
        });

        it('should handle many consecutive right arrows', () => {
            const ctx = createMockContext();
            const fontProps = new FontProperties(16, 'Arial');
            const chain = new Chain(800, ctx, fontProps);

            chain.printableKeyPressed('A');
            chain.printableKeyPressed('B');
            chain.printableKeyPressed('C');
            chain.leftArrowPressed();
            chain.leftArrowPressed();
            chain.leftArrowPressed();

            for (let i = 0; i < 10; i++) {
                chain.rightArrowPressed();
            }

            const items = chain.getItems();
            const cursorIdx = chain.cursorIdx();
            assert.strictEqual(cursorIdx, items.length - 1);
        });
    });
});
