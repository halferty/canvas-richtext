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

describe('Keyboard Input', () => {

    describe('printableKeyPressed', () => {

        it('should insert character at cursor position in empty document', () => {
            const ctx = createMockContext();
            const fontProps = new FontProperties(16, 'Arial');
            const chain = new Chain(800, ctx, fontProps);

            chain.printableKeyPressed('A');

            const items = chain.getItems();
            assert.strictEqual(items.length, 2); // TextLink + CursorLink
            assert.ok(items[0] instanceof TextLink);
            assert.strictEqual(items[0].text, 'A');
            assert.ok(items[1] instanceof CursorLink);
        });

        it('should append character to existing text with same font', () => {
            const ctx = createMockContext();
            const fontProps = new FontProperties(16, 'Arial');
            const chain = new Chain(800, ctx, fontProps);

            chain.printableKeyPressed('H');
            chain.printableKeyPressed('i');

            const items = chain.getItems();
            assert.strictEqual(items.length, 2);
            assert.strictEqual(items[0].text, 'Hi');
        });

        it('should build multiple characters into one TextLink', () => {
            const ctx = createMockContext();
            const fontProps = new FontProperties(16, 'Arial');
            const chain = new Chain(800, ctx, fontProps);

            chain.printableKeyPressed('H');
            chain.printableKeyPressed('e');
            chain.printableKeyPressed('l');
            chain.printableKeyPressed('l');
            chain.printableKeyPressed('o');

            const items = chain.getItems();
            assert.strictEqual(items.length, 2);
            assert.strictEqual(items[0].text, 'Hello');
        });

        it('should handle spaces', () => {
            const ctx = createMockContext();
            const fontProps = new FontProperties(16, 'Arial');
            const chain = new Chain(800, ctx, fontProps);

            chain.printableKeyPressed('H');
            chain.printableKeyPressed('i');
            chain.printableKeyPressed(' ');
            chain.printableKeyPressed('!');

            const items = chain.getItems();
            // Text should be chunked by whitespace
            assert.ok(items.some(item => item instanceof TextLink));
        });

        it('should handle special characters', () => {
            const ctx = createMockContext();
            const fontProps = new FontProperties(16, 'Arial');
            const chain = new Chain(800, ctx, fontProps);

            chain.printableKeyPressed('!');
            chain.printableKeyPressed('@');
            chain.printableKeyPressed('#');

            const items = chain.getItems();
            assert.ok(items.some(item => item instanceof TextLink && item.text.includes('!')));
        });

        it('should type after newline', () => {
            const ctx = createMockContext();
            const fontProps = new FontProperties(16, 'Arial');
            const chain = new Chain(800, ctx, fontProps);

            chain.printableKeyPressed('A');
            chain.enterPressed();
            chain.printableKeyPressed('B');

            const items = chain.getItems();
            // Should have: TextLink('A'), NewlineLink, TextLink('B'), CursorLink
            assert.ok(items.some(item => item instanceof NewlineLink));
        });
    });

    describe('backspacePressed', () => {

        it('should do nothing on empty document', () => {
            const ctx = createMockContext();
            const fontProps = new FontProperties(16, 'Arial');
            const chain = new Chain(800, ctx, fontProps);

            chain.backspacePressed();

            const items = chain.getItems();
            assert.strictEqual(items.length, 1);
            assert.ok(items[0] instanceof CursorLink);
        });

        it('should delete last character', () => {
            const ctx = createMockContext();
            const fontProps = new FontProperties(16, 'Arial');
            const chain = new Chain(800, ctx, fontProps);

            chain.printableKeyPressed('A');
            chain.printableKeyPressed('B');
            chain.backspacePressed();

            const items = chain.getItems();
            const textLink = items.find(item => item instanceof TextLink);
            assert.strictEqual(textLink.text, 'A');
        });

        it('should delete entire word character by character', () => {
            const ctx = createMockContext();
            const fontProps = new FontProperties(16, 'Arial');
            const chain = new Chain(800, ctx, fontProps);

            chain.printableKeyPressed('H');
            chain.printableKeyPressed('i');

            chain.backspacePressed();
            let items = chain.getItems();
            let textLink = items.find(item => item instanceof TextLink);
            assert.strictEqual(textLink.text, 'H');

            chain.backspacePressed();
            items = chain.getItems();
            textLink = items.find(item => item instanceof TextLink);
            assert.strictEqual(textLink, undefined);
        });

        it('should delete newline', () => {
            const ctx = createMockContext();
            const fontProps = new FontProperties(16, 'Arial');
            const chain = new Chain(800, ctx, fontProps);

            chain.printableKeyPressed('A');
            chain.enterPressed();
            chain.backspacePressed();

            const items = chain.getItems();
            assert.ok(!items.some(item => item instanceof NewlineLink));
        });

        it('should handle backspace on second line', () => {
            const ctx = createMockContext();
            const fontProps = new FontProperties(16, 'Arial');
            const chain = new Chain(800, ctx, fontProps);

            chain.printableKeyPressed('A');
            chain.enterPressed();
            chain.printableKeyPressed('B');
            chain.backspacePressed();

            const items = chain.getItems();
            // Should have deleted 'B', leaving 'A' and newline
            assert.ok(items.some(item => item instanceof NewlineLink));
        });
    });

    describe('enterPressed', () => {

        it('should insert newline in empty document', () => {
            const ctx = createMockContext();
            const fontProps = new FontProperties(16, 'Arial');
            const chain = new Chain(800, ctx, fontProps);

            chain.enterPressed();

            const items = chain.getItems();
            assert.ok(items.some(item => item instanceof NewlineLink));
            assert.ok(items.some(item => item instanceof CursorLink));
        });

        it('should insert newline after text', () => {
            const ctx = createMockContext();
            const fontProps = new FontProperties(16, 'Arial');
            const chain = new Chain(800, ctx, fontProps);

            chain.printableKeyPressed('H');
            chain.printableKeyPressed('i');
            chain.enterPressed();

            const items = chain.getItems();
            assert.ok(items.some(item => item instanceof TextLink && item.text.includes('H')));
            assert.ok(items.some(item => item instanceof NewlineLink));
        });

        it('should create multiple lines', () => {
            const ctx = createMockContext();
            const fontProps = new FontProperties(16, 'Arial');
            const chain = new Chain(800, ctx, fontProps);

            chain.printableKeyPressed('A');
            chain.enterPressed();
            chain.printableKeyPressed('B');
            chain.enterPressed();
            chain.printableKeyPressed('C');

            const items = chain.getItems();
            const newlines = items.filter(item => item instanceof NewlineLink);
            assert.strictEqual(newlines.length, 2);
        });

        it('should create empty lines', () => {
            const ctx = createMockContext();
            const fontProps = new FontProperties(16, 'Arial');
            const chain = new Chain(800, ctx, fontProps);

            chain.enterPressed();
            chain.enterPressed();
            chain.enterPressed();

            const items = chain.getItems();
            const newlines = items.filter(item => item instanceof NewlineLink);
            assert.strictEqual(newlines.length, 3);
        });
    });

    describe('Complex typing scenarios', () => {

        it('should handle typing a sentence', () => {
            const ctx = createMockContext();
            const fontProps = new FontProperties(16, 'Arial');
            const chain = new Chain(800, ctx, fontProps);

            'Hello World!'.split('').forEach(char => {
                chain.printableKeyPressed(char);
            });

            const items = chain.getItems();
            assert.ok(items.some(item => item instanceof TextLink));
        });

        it('should handle typing multiple paragraphs', () => {
            const ctx = createMockContext();
            const fontProps = new FontProperties(16, 'Arial');
            const chain = new Chain(800, ctx, fontProps);

            chain.printableKeyPressed('A');
            chain.enterPressed();
            chain.printableKeyPressed('B');
            chain.enterPressed();
            chain.printableKeyPressed('C');

            const items = chain.getItems();
            const newlines = items.filter(item => item instanceof NewlineLink);
            assert.strictEqual(newlines.length, 2);
        });

        it('should handle alternating typing and backspace', () => {
            const ctx = createMockContext();
            const fontProps = new FontProperties(16, 'Arial');
            const chain = new Chain(800, ctx, fontProps);

            chain.printableKeyPressed('A');
            chain.printableKeyPressed('B');
            chain.backspacePressed();
            chain.printableKeyPressed('C');

            const items = chain.getItems();
            const textLink = items.find(item => item instanceof TextLink);
            assert.ok(textLink.text.includes('A'));
            assert.ok(textLink.text.includes('C'));
        });

        it('should handle typing numbers', () => {
            const ctx = createMockContext();
            const fontProps = new FontProperties(16, 'Arial');
            const chain = new Chain(800, ctx, fontProps);

            '1234567890'.split('').forEach(char => {
                chain.printableKeyPressed(char);
            });

            const items = chain.getItems();
            assert.ok(items.some(item => item instanceof TextLink));
        });

        it('should maintain cursor at end after typing', () => {
            const ctx = createMockContext();
            const fontProps = new FontProperties(16, 'Arial');
            const chain = new Chain(800, ctx, fontProps);

            chain.printableKeyPressed('H');
            chain.printableKeyPressed('i');

            const cursorIdx = chain.cursorIdx();
            const items = chain.getItems();
            assert.strictEqual(cursorIdx, items.length - 1);
        });

        it('should handle typing after backspacing everything', () => {
            const ctx = createMockContext();
            const fontProps = new FontProperties(16, 'Arial');
            const chain = new Chain(800, ctx, fontProps);

            chain.printableKeyPressed('A');
            chain.printableKeyPressed('B');
            chain.backspacePressed();
            chain.backspacePressed();
            chain.printableKeyPressed('C');

            const items = chain.getItems();
            const textLink = items.find(item => item instanceof TextLink);
            assert.strictEqual(textLink.text, 'C');
        });
    });

    describe('Font property handling', () => {

        it('should use current font properties for new text', () => {
            const ctx = createMockContext();
            const fontProps = new FontProperties(16, 'Arial');
            const chain = new Chain(800, ctx, fontProps);

            chain.printableKeyPressed('A');

            const items = chain.getItems();
            const textLink = items.find(item => item instanceof TextLink);
            assert.strictEqual(textLink.intrinsic.fontProperties.size, 16);
            assert.strictEqual(textLink.intrinsic.fontProperties.family, 'Arial');
        });

        it('should create new TextLink when font changes', () => {
            const ctx = createMockContext();
            const fontProps = new FontProperties(16, 'Arial');
            const chain = new Chain(800, ctx, fontProps);

            chain.printableKeyPressed('A');
            chain.setFontSize(20);
            chain.printableKeyPressed('B');

            const items = chain.getItems();
            const textLinks = items.filter(item => item instanceof TextLink);
            // Should have separate TextLinks for different font sizes
            assert.ok(textLinks.length >= 2);
        });
    });
});
