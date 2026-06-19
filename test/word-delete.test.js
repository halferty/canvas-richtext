import { describe, it } from 'node:test';
import assert from 'node:assert';
import { Chain } from '../src/Chain.js';
import { FontProperties } from '../src/FontProperties.js';
import { TextLink, NewlineLink, CursorLink } from '../src/ChainLink.js';

function createMockContext() {
    let currentFont = '16px Arial';
    return {
        get font() { return currentFont; },
        set font(value) { currentFont = value; },
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
}

function makeChain(width = 800) {
    const ctx = createMockContext();
    const fontProps = new FontProperties(16, 'Arial');
    return new Chain(width, ctx, fontProps);
}

function typeText(chain, text) {
    for (const char of text) {
        if (char === '\n') chain.enterPressed();
        else chain.printableKeyPressed(char);
    }
}

// Flatten visible text from the chain (TextLink + hard newlines).
function flat(chain) {
    return chain.getFlatText();
}

describe('Forward delete (Delete key)', () => {

    it('deletes the character after the cursor', () => {
        const chain = makeChain();
        typeText(chain, 'abc');
        chain.documentStartPressed();
        chain.deleteForward();
        assert.strictEqual(flat(chain), 'bc');
        assert.strictEqual(chain.getCursorCharPosition(), 0);
    });

    it('is a no-op at the end of the document', () => {
        const chain = makeChain();
        typeText(chain, 'abc');
        chain.deleteForward();
        assert.strictEqual(flat(chain), 'abc');
        assert.strictEqual(chain.getCursorCharPosition(), 3);
    });

    it('deletes a newline, joining two lines', () => {
        const chain = makeChain();
        typeText(chain, 'ab\ncd');
        chain.documentStartPressed();
        chain.deleteForward(); // remove 'a'
        chain.deleteForward(); // remove 'b'
        chain.deleteForward(); // remove newline
        assert.strictEqual(flat(chain), 'cd');
    });
});

describe('Ctrl+Backspace (deleteWordLeft)', () => {

    it('deletes the word before the cursor', () => {
        const chain = makeChain();
        typeText(chain, 'foo bar baz');
        chain.deleteWordLeft();
        assert.strictEqual(flat(chain), 'foo bar ');
        assert.strictEqual(chain.getCursorCharPosition(), 8);
    });

    it('deletes trailing whitespace plus the preceding word', () => {
        const chain = makeChain();
        typeText(chain, 'foo bar   ');
        chain.deleteWordLeft();
        assert.strictEqual(flat(chain), 'foo ');
        assert.strictEqual(chain.getCursorCharPosition(), 4);
    });

    it('can delete the whole document word by word', () => {
        const chain = makeChain();
        typeText(chain, 'foo bar');
        chain.deleteWordLeft();
        assert.strictEqual(flat(chain), 'foo ');
        chain.deleteWordLeft();
        assert.strictEqual(flat(chain), '');
        assert.strictEqual(chain.getCursorCharPosition(), 0);
    });

    it('is a no-op at the start of the document', () => {
        const chain = makeChain();
        typeText(chain, 'foo');
        chain.documentStartPressed();
        chain.deleteWordLeft();
        assert.strictEqual(flat(chain), 'foo');
    });
});

describe('Ctrl+Delete (deleteWordRight)', () => {

    it('deletes the word after the cursor', () => {
        const chain = makeChain();
        typeText(chain, 'foo bar baz');
        chain.documentStartPressed();
        chain.deleteWordRight();
        assert.strictEqual(flat(chain), ' bar baz');
        assert.strictEqual(chain.getCursorCharPosition(), 0);
    });

    it('deletes a word plus following whitespace', () => {
        const chain = makeChain();
        typeText(chain, 'foo   bar');
        chain.documentStartPressed();
        chain.wordRightPressed(); // cursor after "foo" (pos 3)
        chain.deleteWordRight();
        assert.strictEqual(flat(chain), 'foo');
    });

    it('is a no-op at the end of the document', () => {
        const chain = makeChain();
        typeText(chain, 'foo');
        chain.deleteWordRight();
        assert.strictEqual(flat(chain), 'foo');
    });
});

describe('deleteCharRange edge cases', () => {

    it('clamps an out-of-range end', () => {
        const chain = makeChain();
        typeText(chain, 'abc');
        chain.documentStartPressed();
        chain.deleteCharRange(0, 999);
        assert.strictEqual(flat(chain), '');
        assert.strictEqual(chain.getCursorCharPosition(), 0);
    });

    it('normalizes a reversed range', () => {
        const chain = makeChain();
        typeText(chain, 'abcdef');
        chain.deleteCharRange(4, 2);
        assert.strictEqual(flat(chain), 'abef');
        assert.strictEqual(chain.getCursorCharPosition(), 2);
    });

    it('leaves a single cursor link in the items', () => {
        const chain = makeChain();
        typeText(chain, 'abc');
        chain.deleteCharRange(0, 3);
        const cursors = chain.getItems().filter(i => i instanceof CursorLink);
        assert.strictEqual(cursors.length, 1);
    });
});
