import { describe, it } from 'node:test';
import assert from 'node:assert';
import { Chain } from '../src/Chain.js';
import { FontProperties } from '../src/FontProperties.js';
import { TextLink, NewlineLink, CursorLink, VirtualNewlineLink } from '../src/ChainLink.js';

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

function makeChain(width = 800) {
    const ctx = createMockContext();
    const fontProps = new FontProperties(16, 'Arial');
    return new Chain(width, ctx, fontProps);
}

function typeText(chain, text) {
    for (const char of text) {
        if (char === '\n') {
            chain.enterPressed();
        } else {
            chain.printableKeyPressed(char);
        }
    }
}

describe('Home / End navigation', () => {

    it('Home should move to the start of the current line', () => {
        const chain = makeChain();
        typeText(chain, 'abc\ndef');
        // cursor at end (position 7)
        chain.homePressed();
        assert.strictEqual(chain.getCursorCharPosition(), 4); // start of "def"
        assert.ok(!chain.hasSelection());
    });

    it('End should move to the end of the current line', () => {
        const chain = makeChain();
        typeText(chain, 'abc\ndef');
        chain.homePressed(); // now at start of line 2 (pos 4)
        chain.endPressed();
        assert.strictEqual(chain.getCursorCharPosition(), 7); // end of "def"
    });

    it('Home on the first line should move to document start', () => {
        const chain = makeChain();
        typeText(chain, 'abc\ndef');
        // move cursor up to first line
        chain.upArrowPressed();
        chain.homePressed();
        assert.strictEqual(chain.getCursorCharPosition(), 0);
    });

    it('Shift+Home should select to the start of the line', () => {
        const chain = makeChain();
        typeText(chain, 'abc\ndef');
        chain.shiftHomePressed();
        assert.ok(chain.hasSelection());
        assert.strictEqual(chain.selectionStart, 4);
        assert.strictEqual(chain.selectionEnd, 7);
        assert.strictEqual(chain.getSelectedText(), 'def');
    });

    it('Shift+End should select to the end of the line', () => {
        const chain = makeChain();
        typeText(chain, 'abc\ndef');
        chain.homePressed(); // pos 4
        chain.shiftEndPressed();
        assert.strictEqual(chain.selectionStart, 4);
        assert.strictEqual(chain.selectionEnd, 7);
        assert.strictEqual(chain.getSelectedText(), 'def');
    });

    it('Home should respect wrapped (virtual) line boundaries', () => {
        const chain = makeChain(100); // narrow, forces wrapping
        typeText(chain, 'aaaa bbbb cccc dddd eeee');
        const items = chain.getItems();
        const hasVirtual = items.some(i => i instanceof VirtualNewlineLink);
        assert.ok(hasVirtual, 'expected wrapping to produce virtual newlines');

        const before = chain.getCursorCharPosition();
        chain.homePressed();
        const after = chain.getCursorCharPosition();
        // Home never moves the cursor forward, and the start of the last
        // visual line is past the document start when wrapping has occurred.
        assert.ok(after <= before);
        assert.ok(after > 0);
    });
});

describe('Document start / end (Ctrl+Home / Ctrl+End)', () => {

    it('documentStart should move to position 0', () => {
        const chain = makeChain();
        typeText(chain, 'abc\ndef');
        chain.documentStartPressed();
        assert.strictEqual(chain.getCursorCharPosition(), 0);
    });

    it('documentEnd should move to the last character position', () => {
        const chain = makeChain();
        typeText(chain, 'abc\ndef');
        chain.documentStartPressed();
        chain.documentEndPressed();
        assert.strictEqual(chain.getCursorCharPosition(), 7);
    });

    it('Shift+Ctrl+Home should select to document start', () => {
        const chain = makeChain();
        typeText(chain, 'abc\ndef');
        chain.shiftDocumentStartPressed();
        assert.strictEqual(chain.selectionStart, 0);
        assert.strictEqual(chain.selectionEnd, 7);
        assert.strictEqual(chain.getSelectedText(), 'abc\ndef');
    });

    it('Shift+Ctrl+End should select to document end', () => {
        const chain = makeChain();
        typeText(chain, 'abc\ndef');
        chain.documentStartPressed();
        chain.shiftDocumentEndPressed();
        assert.strictEqual(chain.selectionStart, 0);
        assert.strictEqual(chain.selectionEnd, 7);
    });
});

describe('Word-wise navigation (Ctrl+Left / Ctrl+Right)', () => {

    it('wordLeft should jump to the start of the previous word', () => {
        const chain = makeChain();
        typeText(chain, 'foo bar baz');
        chain.wordLeftPressed();
        assert.strictEqual(chain.getCursorCharPosition(), 8); // start of "baz"
        chain.wordLeftPressed();
        assert.strictEqual(chain.getCursorCharPosition(), 4); // start of "bar"
        chain.wordLeftPressed();
        assert.strictEqual(chain.getCursorCharPosition(), 0); // start of "foo"
    });

    it('wordRight should jump to the end of the next word', () => {
        const chain = makeChain();
        typeText(chain, 'foo bar baz');
        chain.documentStartPressed();
        chain.wordRightPressed();
        assert.strictEqual(chain.getCursorCharPosition(), 3); // after "foo"
        chain.wordRightPressed();
        assert.strictEqual(chain.getCursorCharPosition(), 7); // after "bar"
        chain.wordRightPressed();
        assert.strictEqual(chain.getCursorCharPosition(), 11); // after "baz"
    });

    it('word navigation skips runs of whitespace', () => {
        const chain = makeChain();
        typeText(chain, 'foo    bar');
        chain.documentStartPressed();
        chain.wordRightPressed();
        assert.strictEqual(chain.getCursorCharPosition(), 3); // after "foo"
        chain.wordRightPressed();
        assert.strictEqual(chain.getCursorCharPosition(), 10); // after "bar"
    });

    it('Shift+Ctrl+Left should select the previous word', () => {
        const chain = makeChain();
        typeText(chain, 'foo bar baz');
        chain.shiftWordLeftPressed();
        assert.ok(chain.hasSelection());
        assert.strictEqual(chain.selectionStart, 8);
        assert.strictEqual(chain.selectionEnd, 11);
        assert.strictEqual(chain.getSelectedText(), 'baz');
    });

    it('Shift+Ctrl+Right should extend the selection word by word', () => {
        const chain = makeChain();
        typeText(chain, 'foo bar baz');
        chain.documentStartPressed();
        chain.shiftWordRightPressed();
        chain.shiftWordRightPressed();
        assert.strictEqual(chain.selectionStart, 0);
        assert.strictEqual(chain.selectionEnd, 7);
        assert.strictEqual(chain.getSelectedText(), 'foo bar');
    });

    it('wordLeft at document start is a no-op', () => {
        const chain = makeChain();
        typeText(chain, 'foo');
        chain.documentStartPressed();
        chain.wordLeftPressed();
        assert.strictEqual(chain.getCursorCharPosition(), 0);
    });

    it('wordRight at document end is a no-op', () => {
        const chain = makeChain();
        typeText(chain, 'foo');
        chain.wordRightPressed();
        assert.strictEqual(chain.getCursorCharPosition(), 3);
    });
});
