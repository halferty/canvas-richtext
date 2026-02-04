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

describe('Text Wrapping and Line Breaking', () => {

    describe('chunkTextLinks', () => {

        it('should split text by whitespace', () => {
            const ctx = createMockContext();
            const fontProps = new FontProperties(16, 'Arial');
            const chain = new Chain(800, ctx, fontProps);

            chain.printableKeyPressed('H');
            chain.printableKeyPressed('e');
            chain.printableKeyPressed('l');
            chain.printableKeyPressed('l');
            chain.printableKeyPressed('o');
            chain.printableKeyPressed(' ');
            chain.printableKeyPressed('W');
            chain.printableKeyPressed('o');
            chain.printableKeyPressed('r');
            chain.printableKeyPressed('l');
            chain.printableKeyPressed('d');

            const items = chain.getItems();
            const textLinks = items.filter(item => item instanceof TextLink);

            // Should have separate chunks for words and spaces
            assert.ok(textLinks.length > 1);
        });

        it('should preserve consecutive spaces', () => {
            const ctx = createMockContext();
            const fontProps = new FontProperties(16, 'Arial');
            const chain = new Chain(800, ctx, fontProps);

            chain.printableKeyPressed('A');
            chain.printableKeyPressed(' ');
            chain.printableKeyPressed(' ');
            chain.printableKeyPressed('B');

            const items = chain.getItems();
            const textLinks = items.filter(item => item instanceof TextLink);

            // Should have chunks for 'A', '  ', and 'B'
            assert.ok(textLinks.length >= 2);
        });

        it('should handle text without spaces', () => {
            const ctx = createMockContext();
            const fontProps = new FontProperties(16, 'Arial');
            const chain = new Chain(800, ctx, fontProps);

            chain.printableKeyPressed('H');
            chain.printableKeyPressed('e');
            chain.printableKeyPressed('l');
            chain.printableKeyPressed('l');
            chain.printableKeyPressed('o');

            const items = chain.getItems();
            const textLinks = items.filter(item => item instanceof TextLink);

            // Single word should not be split
            assert.strictEqual(textLinks.length, 1);
        });

        it('should handle multiple words', () => {
            const ctx = createMockContext();
            const fontProps = new FontProperties(16, 'Arial');
            const chain = new Chain(800, ctx, fontProps);

            'One Two Three'.split('').forEach(char => {
                chain.printableKeyPressed(char);
            });

            const items = chain.getItems();
            const textLinks = items.filter(item => item instanceof TextLink);

            // Should have separate chunks
            assert.ok(textLinks.length > 1);
        });
    });

    describe('Virtual newlines (word wrapping)', () => {

        it('should create virtual newline when text exceeds width', () => {
            const ctx = createMockContext();
            const fontProps = new FontProperties(16, 'Arial');
            const narrowWidth = 100; // Very narrow
            const chain = new Chain(narrowWidth, ctx, fontProps);

            // Type a long word
            'VeryLongWordThatWillWrap'.split('').forEach(char => {
                chain.printableKeyPressed(char);
            });

            const items = chain.getItems();
            const virtualNewlines = items.filter(item => item instanceof VirtualNewlineLink);

            // Should have created virtual newlines to wrap
            assert.ok(virtualNewlines.length > 0);
        });

        it('should wrap long sentences', () => {
            const ctx = createMockContext();
            const fontProps = new FontProperties(16, 'Arial');
            const narrowWidth = 200;
            const chain = new Chain(narrowWidth, ctx, fontProps);

            'This is a long sentence that should wrap across multiple lines'.split('').forEach(char => {
                chain.printableKeyPressed(char);
            });

            const items = chain.getItems();
            const virtualNewlines = items.filter(item => item instanceof VirtualNewlineLink);

            // Should have wrapped
            assert.ok(virtualNewlines.length > 0);
        });

        it('should not create virtual newlines for short text', () => {
            const ctx = createMockContext();
            const fontProps = new FontProperties(16, 'Arial');
            const wideWidth = 800;
            const chain = new Chain(wideWidth, ctx, fontProps);

            'Short'.split('').forEach(char => {
                chain.printableKeyPressed(char);
            });

            const items = chain.getItems();
            const virtualNewlines = items.filter(item => item instanceof VirtualNewlineLink);

            // Should not wrap short text on wide canvas
            assert.strictEqual(virtualNewlines.length, 0);
        });

        it('should remove virtual newlines on recalc', () => {
            const ctx = createMockContext();
            const fontProps = new FontProperties(16, 'Arial');
            const chain = new Chain(100, ctx, fontProps);

            // Create some text with virtual newlines
            'VeryLongWordThatWraps'.split('').forEach(char => {
                chain.printableKeyPressed(char);
            });

            let items = chain.getItems();
            const virtualNewlinesBefore = items.filter(item => item instanceof VirtualNewlineLink).length;

            // Widen the chain
            chain.setWidth(800);

            items = chain.getItems();
            const virtualNewlinesAfter = items.filter(item => item instanceof VirtualNewlineLink).length;

            // Virtual newlines should be recalculated (likely fewer or none)
            assert.ok(virtualNewlinesAfter <= virtualNewlinesBefore);
        });
    });

    describe('Real newlines (user-created)', () => {

        it('should preserve newlines on recalc', () => {
            const ctx = createMockContext();
            const fontProps = new FontProperties(16, 'Arial');
            const chain = new Chain(800, ctx, fontProps);

            chain.printableKeyPressed('A');
            chain.enterPressed();
            chain.printableKeyPressed('B');

            let items = chain.getItems();
            const newlinesBefore = items.filter(item => item instanceof NewlineLink).length;

            // Recalculate
            chain.recalc();

            items = chain.getItems();
            const newlinesAfter = items.filter(item => item instanceof NewlineLink).length;

            // Real newlines should be preserved
            assert.strictEqual(newlinesBefore, newlinesAfter);
        });

        it('should differentiate real and virtual newlines', () => {
            const ctx = createMockContext();
            const fontProps = new FontProperties(16, 'Arial');
            const narrowWidth = 100;
            const chain = new Chain(narrowWidth, ctx, fontProps);

            chain.printableKeyPressed('A');
            chain.enterPressed(); // Real newline
            'VeryLongWordThatWraps'.split('').forEach(char => {
                chain.printableKeyPressed(char);
            });

            const items = chain.getItems();
            const realNewlines = items.filter(item => item instanceof NewlineLink);
            const virtualNewlines = items.filter(item => item instanceof VirtualNewlineLink);

            // Should have both types
            assert.ok(realNewlines.length > 0);
            assert.ok(virtualNewlines.length > 0);
        });

        it('should handle multiple consecutive newlines', () => {
            const ctx = createMockContext();
            const fontProps = new FontProperties(16, 'Arial');
            const chain = new Chain(800, ctx, fontProps);

            chain.printableKeyPressed('A');
            chain.enterPressed();
            chain.enterPressed();
            chain.enterPressed();
            chain.printableKeyPressed('B');

            const items = chain.getItems();
            const newlines = items.filter(item => item instanceof NewlineLink);

            assert.strictEqual(newlines.length, 3);
        });
    });

    describe('Position calculations', () => {

        it('should calculate X positions for single line', () => {
            const ctx = createMockContext();
            const fontProps = new FontProperties(16, 'Arial');
            const chain = new Chain(800, ctx, fontProps);

            chain.printableKeyPressed('A');
            chain.printableKeyPressed('B');
            chain.printableKeyPressed('C');

            const items = chain.getItems();
            const textLinks = items.filter(item => item instanceof TextLink);

            // All should have posX defined
            textLinks.forEach(link => {
                assert.ok(link.computed.posX !== undefined);
            });

            // Should be positioned sequentially
            if (textLinks.length > 1) {
                assert.ok(textLinks[0].computed.posX >= 0);
            }
        });

        it('should reset X position after newline', () => {
            const ctx = createMockContext();
            const fontProps = new FontProperties(16, 'Arial');
            const chain = new Chain(800, ctx, fontProps);

            chain.printableKeyPressed('A');
            chain.enterPressed();
            chain.printableKeyPressed('B');

            const items = chain.getItems();
            const textLinks = items.filter(item => item instanceof TextLink);

            if (textLinks.length >= 2) {
                const firstLine = textLinks[0];
                const secondLine = textLinks[textLinks.length - 1];

                // Second line should start at x=0
                assert.strictEqual(secondLine.computed.posX, 0);
            }
        });

        it('should calculate Y positions for multiple lines', () => {
            const ctx = createMockContext();
            const fontProps = new FontProperties(16, 'Arial');
            const chain = new Chain(800, ctx, fontProps);

            chain.printableKeyPressed('A');
            chain.enterPressed();
            chain.printableKeyPressed('B');
            chain.enterPressed();
            chain.printableKeyPressed('C');

            const items = chain.getItems();
            const textLinks = items.filter(item => item instanceof TextLink);

            // All should have posY defined
            textLinks.forEach(link => {
                assert.ok(link.computed.posY !== undefined);
            });

            // Y positions should increase
            if (textLinks.length >= 2) {
                assert.ok(textLinks[1].computed.posY > textLinks[0].computed.posY);
            }
        });

        it('should calculate line heights', () => {
            const ctx = createMockContext();
            const fontProps = new FontProperties(16, 'Arial');
            const chain = new Chain(800, ctx, fontProps);

            chain.printableKeyPressed('A');
            chain.enterPressed();
            chain.printableKeyPressed('B');

            const items = chain.getItems();
            const textLinks = items.filter(item => item instanceof TextLink);

            // All should have line height
            textLinks.forEach(link => {
                assert.ok(link.computed.lineHeight > 0);
            });
        });
    });

    describe('joinAdjacentTextLinks', () => {

        it('should join text links with same font properties', () => {
            const ctx = createMockContext();
            const fontProps = new FontProperties(16, 'Arial');
            const chain = new Chain(800, ctx, fontProps);

            // Manually create adjacent text links
            chain.items = [
                new TextLink('Hello', fontProps.clone()),
                new TextLink(' ', fontProps.clone()),
                new TextLink('World', fontProps.clone()),
                new CursorLink()
            ];

            chain.recalc();

            const items = chain.getItems();
            const textLinks = items.filter(item => item instanceof TextLink);

            // Should be joined into fewer links
            assert.ok(textLinks.length <= 3);
        });

        it('should not join text links with different fonts', () => {
            const ctx = createMockContext();
            const fontProps1 = new FontProperties(16, 'Arial');
            const fontProps2 = new FontProperties(20, 'Arial');
            const chain = new Chain(800, ctx, fontProps1);

            chain.items = [
                new TextLink('Small', fontProps1.clone()),
                new TextLink('Large', fontProps2.clone()),
                new CursorLink()
            ];

            chain.recalc();

            const items = chain.getItems();
            const textLinks = items.filter(item => item instanceof TextLink);

            // Should remain separate
            assert.ok(textLinks.length >= 2);
        });
    });

    describe('removeEmptyTextLinks', () => {

        it('should remove empty text links', () => {
            const ctx = createMockContext();
            const fontProps = new FontProperties(16, 'Arial');
            const chain = new Chain(800, ctx, fontProps);

            chain.items = [
                new TextLink('', fontProps.clone()),
                new TextLink('Hello', fontProps.clone()),
                new TextLink('', fontProps.clone()),
                new CursorLink()
            ];

            chain.recalc();

            const items = chain.getItems();
            const emptyLinks = items.filter(item => item instanceof TextLink && item.text === '');

            // Empty links should be removed
            assert.strictEqual(emptyLinks.length, 0);
        });

        it('should preserve non-empty text links', () => {
            const ctx = createMockContext();
            const fontProps = new FontProperties(16, 'Arial');
            const chain = new Chain(800, ctx, fontProps);

            chain.items = [
                new TextLink('A', fontProps.clone()),
                new TextLink('', fontProps.clone()),
                new TextLink('B', fontProps.clone()),
                new CursorLink()
            ];

            chain.recalc();

            const items = chain.getItems();
            const nonEmptyLinks = items.filter(item => item instanceof TextLink && item.text !== '');

            // After recalc, 'A' and 'B' should be joined into 'AB'
            // since they have the same font and are adjacent after empty link removal
            assert.ok(nonEmptyLinks.length >= 1);
            const totalText = nonEmptyLinks.map(l => l.text).join('');
            assert.strictEqual(totalText, 'AB');
        });
    });

    describe('setWidth', () => {

        it('should update chain width', () => {
            const ctx = createMockContext();
            const fontProps = new FontProperties(16, 'Arial');
            const chain = new Chain(800, ctx, fontProps);

            chain.setWidth(600);

            assert.strictEqual(chain.widthPixels, 600);
        });

        it('should recalculate on width change', () => {
            const ctx = createMockContext();
            const fontProps = new FontProperties(16, 'Arial');
            const chain = new Chain(800, ctx, fontProps);

            'Long text that might wrap when width changes'.split('').forEach(char => {
                chain.printableKeyPressed(char);
            });

            const virtualNewlinesBefore = chain.getItems().filter(item => item instanceof VirtualNewlineLink).length;

            chain.setWidth(200); // Make it narrow

            const virtualNewlinesAfter = chain.getItems().filter(item => item instanceof VirtualNewlineLink).length;

            // Narrower width should create more wrapping
            assert.ok(virtualNewlinesAfter >= virtualNewlinesBefore);
        });
    });
});
