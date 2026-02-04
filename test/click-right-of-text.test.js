import { describe, it, beforeEach } from 'node:test';
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
            const fontSizeMatch = currentFont.match(/(\d+)px/);
            const fontSize = fontSizeMatch ? parseInt(fontSizeMatch[1]) : 16;
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

describe('Clicking Right of Text Tests', () => {
    let chain;
    let ctx;

    beforeEach(() => {
        ctx = createMockContext();
    });

    describe('Single line - click right of text at different Y positions', () => {

        it('should place cursor at END when clicking right of "Hello" at Y=0 (text baseline)', () => {
            const fontProps = new FontProperties(16, 'Arial');
            chain = new Chain(800, ctx, fontProps);

            chain.items = [
                new TextLink('Hello', fontProps.clone()),
                new CursorLink()
            ];
            chain.recalc();

            // Text "Hello" is 5 chars * 8px = 40px wide
            // Click at X=100 (well past the text), Y=0 (at baseline)
            chain.clicked(100, 0);

            const cursorIdx = chain.cursorIdx();
            const items = chain.getItems();

            // Cursor should be after "Hello"
            let charsBefore = 0;
            for (let i = 0; i < cursorIdx; i++) {
                if (items[i] instanceof TextLink) {
                    charsBefore += items[i].text.length;
                }
            }

            assert.strictEqual(charsBefore, 5, `Cursor should be after all 5 chars, got ${charsBefore}`);
        });

        it('should place cursor at END when clicking right of "Hello" at Y=4 (slightly below baseline)', () => {
            const fontProps = new FontProperties(16, 'Arial');
            chain = new Chain(800, ctx, fontProps);

            chain.items = [
                new TextLink('Hello', fontProps.clone()),
                new CursorLink()
            ];
            chain.recalc();

            chain.clicked(100, 4);

            const cursorIdx = chain.cursorIdx();
            const items = chain.getItems();

            let charsBefore = 0;
            for (let i = 0; i < cursorIdx; i++) {
                if (items[i] instanceof TextLink) {
                    charsBefore += items[i].text.length;
                }
            }

            assert.strictEqual(charsBefore, 5, `Cursor should be after all 5 chars at Y=4, got ${charsBefore}`);
        });

        it('should place cursor at END when clicking right of "Hello" at Y=-8 (above baseline)', () => {
            const fontProps = new FontProperties(16, 'Arial');
            chain = new Chain(800, ctx, fontProps);

            chain.items = [
                new TextLink('Hello', fontProps.clone()),
                new CursorLink()
            ];
            chain.recalc();

            chain.clicked(100, -8);

            const cursorIdx = chain.cursorIdx();
            const items = chain.getItems();

            let charsBefore = 0;
            for (let i = 0; i < cursorIdx; i++) {
                if (items[i] instanceof TextLink) {
                    charsBefore += items[i].text.length;
                }
            }

            assert.strictEqual(charsBefore, 5, `Cursor should be after all 5 chars at Y=-8, got ${charsBefore}`);
        });

        it('should place cursor at END when clicking right of "Hello" at Y=12 (well below baseline)', () => {
            const fontProps = new FontProperties(16, 'Arial');
            chain = new Chain(800, ctx, fontProps);

            chain.items = [
                new TextLink('Hello', fontProps.clone()),
                new CursorLink()
            ];
            chain.recalc();

            chain.clicked(100, 12);

            const cursorIdx = chain.cursorIdx();
            const items = chain.getItems();

            let charsBefore = 0;
            for (let i = 0; i < cursorIdx; i++) {
                if (items[i] instanceof TextLink) {
                    charsBefore += items[i].text.length;
                }
            }

            assert.strictEqual(charsBefore, 5, `Cursor should be after all 5 chars at Y=12, got ${charsBefore}`);
        });
    });

    describe('Multiple lines - click right of text on different lines', () => {

        it('should place cursor at END of line 1 when clicking right at various Y values', () => {
            const fontProps = new FontProperties(16, 'Arial');
            chain = new Chain(800, ctx, fontProps);

            chain.items = [
                new TextLink('Line1', fontProps.clone()),
                new NewlineLink(),
                new TextLink('Line2', fontProps.clone()),
                new NewlineLink(),
                new TextLink('Line3', fontProps.clone()),
                new CursorLink()
            ];
            chain.recalc();

            // Test clicking right of Line1 at different Y positions
            const testCases = [
                { y: -10, desc: 'above line 1' },
                { y: 0, desc: 'at baseline of line 1' },
                { y: 4, desc: 'slightly below baseline' },
                { y: 10, desc: 'below line 1 but before gap' }
            ];

            for (const testCase of testCases) {
                // Reset
                const fontProps2 = new FontProperties(16, 'Arial');
                chain = new Chain(800, ctx, fontProps2);
                chain.items = [
                    new TextLink('Line1', fontProps2.clone()),
                    new NewlineLink(),
                    new TextLink('Line2', fontProps2.clone()),
                    new NewlineLink(),
                    new TextLink('Line3', fontProps2.clone()),
                    new CursorLink()
                ];
                chain.recalc();

                chain.clicked(200, testCase.y);

                const cursorIdx = chain.cursorIdx();
                const items = chain.getItems();

                let charsBefore = 0;
                for (let i = 0; i < cursorIdx; i++) {
                    if (items[i] instanceof TextLink) {
                        charsBefore += items[i].text.length;
                    } else if (items[i] instanceof NewlineLink) {
                        charsBefore += 1;
                    }
                }

                assert.ok(charsBefore === 5,
                    `At Y=${testCase.y} (${testCase.desc}), cursor should be after "Line1" (5 chars), got ${charsBefore}`);
            }
        });

        it('should place cursor at END of line 2 when clicking right at line 2 Y position', () => {
            const fontProps = new FontProperties(16, 'Arial');
            chain = new Chain(800, ctx, fontProps);

            chain.items = [
                new TextLink('Line1', fontProps.clone()),
                new NewlineLink(),
                new TextLink('Line2', fontProps.clone()),
                new NewlineLink(),
                new TextLink('Line3', fontProps.clone()),
                new CursorLink()
            ];
            chain.recalc();

            // Line 2 is at posY=24 (assuming 24px line height)
            // Test various Y positions around line 2
            const testCases = [
                { y: 20, desc: 'just above line 2' },
                { y: 24, desc: 'at baseline of line 2' },
                { y: 28, desc: 'slightly below line 2' },
                { y: 32, desc: 'below line 2' }
            ];

            for (const testCase of testCases) {
                // Reset
                const fontProps2 = new FontProperties(16, 'Arial');
                chain = new Chain(800, ctx, fontProps2);
                chain.items = [
                    new TextLink('Line1', fontProps2.clone()),
                    new NewlineLink(),
                    new TextLink('Line2', fontProps2.clone()),
                    new NewlineLink(),
                    new TextLink('Line3', fontProps2.clone()),
                    new CursorLink()
                ];
                chain.recalc();

                chain.clicked(200, testCase.y);

                const cursorIdx = chain.cursorIdx();
                const items = chain.getItems();

                let charsBefore = 0;
                for (let i = 0; i < cursorIdx; i++) {
                    if (items[i] instanceof TextLink) {
                        charsBefore += items[i].text.length;
                    } else if (items[i] instanceof NewlineLink) {
                        charsBefore += 1;
                    }
                }

                // Should be after "Line1\nLine2" = 11 chars
                assert.ok(charsBefore === 11,
                    `At Y=${testCase.y} (${testCase.desc}), cursor should be after "Line1\\nLine2" (11 chars), got ${charsBefore}`);
            }
        });
    });

    describe('Edge cases - very far right clicks', () => {

        it('should handle clicking extremely far right (X=9999)', () => {
            const fontProps = new FontProperties(16, 'Arial');
            chain = new Chain(800, ctx, fontProps);

            chain.items = [
                new TextLink('Test', fontProps.clone()),
                new CursorLink()
            ];
            chain.recalc();

            chain.clicked(9999, 0);

            const cursorIdx = chain.cursorIdx();
            const items = chain.getItems();

            let charsBefore = 0;
            for (let i = 0; i < cursorIdx; i++) {
                if (items[i] instanceof TextLink) {
                    charsBefore += items[i].text.length;
                }
            }

            assert.strictEqual(charsBefore, 4, 'Cursor should be after all text even with huge X');
        });

        it('should handle clicking just past the end of text', () => {
            const fontProps = new FontProperties(16, 'Arial');
            chain = new Chain(800, ctx, fontProps);

            chain.items = [
                new TextLink('Hello', fontProps.clone()),
                new CursorLink()
            ];
            chain.recalc();

            // "Hello" = 5 chars * 8px = 40px
            // Click at 45px (just past the end)
            chain.clicked(45, 0);

            const cursorIdx = chain.cursorIdx();
            const items = chain.getItems();

            let charsBefore = 0;
            for (let i = 0; i < cursorIdx; i++) {
                if (items[i] instanceof TextLink) {
                    charsBefore += items[i].text.length;
                }
            }

            assert.strictEqual(charsBefore, 5, 'Cursor should be after all text when clicking just past end');
        });
    });

    describe('Reproducing the reported bug', () => {

        it('REPRODUCTION: clicking right of text at different Y should always place at END', () => {
            const fontProps = new FontProperties(16, 'Arial');
            chain = new Chain(800, ctx, fontProps);

            chain.items = [
                new TextLink('Hello', fontProps.clone()),
                new TextLink(' ', fontProps.clone()),
                new TextLink('World', fontProps.clone()),
                new CursorLink()
            ];
            chain.recalc();

            // "Hello World" = 11 chars * 8px = 88px wide
            // Text baseline is at Y=0, ascent goes up to Y=-12, descent goes down to Y=4

            const farRightX = 500; // Far past the text

            const testYPositions = [
                -15, // Above text
                -12, // Top of text (ascent)
                -6,  // Middle upper
                0,   // Baseline
                2,   // Middle lower
                4,   // Bottom of text (descent)
                8,   // Just below text
                12,  // Further below
            ];

            for (const y of testYPositions) {
                // Reset for each test
                const fontProps2 = new FontProperties(16, 'Arial');
                chain = new Chain(800, ctx, fontProps2);
                chain.items = [
                    new TextLink('Hello', fontProps2.clone()),
                    new TextLink(' ', fontProps2.clone()),
                    new TextLink('World', fontProps2.clone()),
                    new CursorLink()
                ];
                chain.recalc();

                chain.clicked(farRightX, y);

                const cursorIdx = chain.cursorIdx();
                const items = chain.getItems();

                let charsBefore = 0;
                for (let i = 0; i < cursorIdx; i++) {
                    if (items[i] instanceof TextLink) {
                        charsBefore += items[i].text.length;
                    }
                }

                assert.strictEqual(charsBefore, 11,
                    `BUG REPRODUCTION: At Y=${y}, clicking far right should place cursor after all 11 chars, but got ${charsBefore}`);
            }
        });
    });
});
