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

function makeChain() {
    const ctx = createMockContext();
    const fontProps = new FontProperties(16, 'Arial');
    return new Chain(800, ctx, fontProps);
}

function typeText(chain, text) {
    for (const char of text) {
        chain.printableKeyPressed(char);
    }
}

describe('Shift+Arrow Selection', () => {

    describe('shiftLeftArrowPressed', () => {

        it('should start a selection of one character', () => {
            const chain = makeChain();
            typeText(chain, 'Hello');

            chain.shiftLeftArrowPressed();

            assert.ok(chain.hasSelection());
            assert.strictEqual(chain.selectionStart, 4);
            assert.strictEqual(chain.selectionEnd, 5);
            assert.strictEqual(chain.getSelectedText(), 'o');
        });

        it('should extend the selection across multiple presses', () => {
            const chain = makeChain();
            typeText(chain, 'Hello');

            chain.shiftLeftArrowPressed();
            chain.shiftLeftArrowPressed();
            chain.shiftLeftArrowPressed();

            assert.strictEqual(chain.selectionStart, 2);
            assert.strictEqual(chain.selectionEnd, 5);
            assert.strictEqual(chain.getSelectedText(), 'llo');
        });

        it('should do nothing destructive at the start of the document', () => {
            const chain = makeChain();
            typeText(chain, 'Hi');
            // Move cursor to the very start
            chain.leftArrowPressed();
            chain.leftArrowPressed();

            chain.shiftLeftArrowPressed();

            assert.ok(!chain.hasSelection());
            assert.strictEqual(chain.getCursorCharPosition(), 0);
        });
    });

    describe('shiftRightArrowPressed', () => {

        it('should select forward from the start of the document', () => {
            const chain = makeChain();
            typeText(chain, 'Hello');
            chain.leftArrowPressed();
            chain.leftArrowPressed();
            chain.leftArrowPressed();
            chain.leftArrowPressed();
            chain.leftArrowPressed(); // cursor at position 0

            chain.shiftRightArrowPressed();
            chain.shiftRightArrowPressed();

            assert.strictEqual(chain.selectionStart, 0);
            assert.strictEqual(chain.selectionEnd, 2);
            assert.strictEqual(chain.getSelectedText(), 'He');
        });

        it('should shrink a left-extended selection when reversing direction', () => {
            const chain = makeChain();
            typeText(chain, 'Hello');

            chain.shiftLeftArrowPressed();
            chain.shiftLeftArrowPressed(); // selects "lo" (3..5)
            assert.strictEqual(chain.getSelectedText(), 'lo');

            chain.shiftRightArrowPressed(); // shrink back to "o" (4..5)
            assert.strictEqual(chain.selectionStart, 4);
            assert.strictEqual(chain.selectionEnd, 5);
            assert.strictEqual(chain.getSelectedText(), 'o');
        });

        it('should collapse the selection when returning to the anchor', () => {
            const chain = makeChain();
            typeText(chain, 'Hello');

            chain.shiftLeftArrowPressed(); // anchor 5, focus 4
            chain.shiftRightArrowPressed(); // focus back to 5

            assert.ok(!chain.hasSelection());
            assert.strictEqual(chain.getCursorCharPosition(), 5);
        });

        it('should cross over the anchor and select in the other direction', () => {
            const chain = makeChain();
            typeText(chain, 'Hello');
            // Put cursor in the middle (position 2)
            chain.leftArrowPressed();
            chain.leftArrowPressed();
            chain.leftArrowPressed(); // cursor at 2

            chain.shiftLeftArrowPressed(); // select 1..2
            assert.strictEqual(chain.selectionStart, 1);
            assert.strictEqual(chain.selectionEnd, 2);

            chain.shiftRightArrowPressed(); // collapse at 2
            assert.ok(!chain.hasSelection());

            chain.shiftRightArrowPressed(); // now select 2..3 forward
            assert.strictEqual(chain.selectionStart, 2);
            assert.strictEqual(chain.selectionEnd, 3);
        });
    });

    describe('shift + vertical arrows', () => {

        it('should extend selection down across a line', () => {
            const chain = makeChain();
            typeText(chain, 'abc');
            chain.enterPressed();
            typeText(chain, 'def');
            // cursor is at end of second line (position 7: "abc\ndef")
            // Move to start of document
            for (let i = 0; i < 7; i++) chain.leftArrowPressed();
            assert.strictEqual(chain.getCursorCharPosition(), 0);

            chain.shiftDownArrowPressed();

            assert.ok(chain.hasSelection());
            assert.strictEqual(chain.selectionStart, 0);
            assert.ok(chain.selectionEnd >= 3); // at least the first line + newline
        });

        it('should extend selection up across a line', () => {
            const chain = makeChain();
            typeText(chain, 'abc');
            chain.enterPressed();
            typeText(chain, 'def');
            // cursor at end (position 7)

            chain.shiftUpArrowPressed();

            assert.ok(chain.hasSelection());
            assert.strictEqual(chain.selectionEnd, 7);
            assert.ok(chain.selectionStart <= 4);
        });
    });

    describe('interaction with plain arrows', () => {

        it('plain left arrow should collapse a shift selection to its start', () => {
            const chain = makeChain();
            typeText(chain, 'Hello');

            chain.shiftLeftArrowPressed();
            chain.shiftLeftArrowPressed(); // select "lo" (3..5)

            chain.leftArrowPressed();

            assert.ok(!chain.hasSelection());
            assert.strictEqual(chain.getCursorCharPosition(), 3);
            assert.strictEqual(chain.selectionAnchor, null);
        });

        it('plain right arrow should collapse a shift selection to its end', () => {
            const chain = makeChain();
            typeText(chain, 'Hello');

            chain.shiftLeftArrowPressed();
            chain.shiftLeftArrowPressed(); // select "lo" (3..5)

            chain.rightArrowPressed();

            assert.ok(!chain.hasSelection());
            assert.strictEqual(chain.getCursorCharPosition(), 5);
            assert.strictEqual(chain.selectionAnchor, null);
        });

        it('clearSelection should reset the anchor', () => {
            const chain = makeChain();
            typeText(chain, 'Hello');

            chain.shiftLeftArrowPressed();
            assert.notStrictEqual(chain.selectionAnchor, null);

            chain.clearSelection();
            assert.strictEqual(chain.selectionAnchor, null);
        });
    });
});
