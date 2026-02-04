import { describe, it } from 'node:test';
import assert from 'node:assert';
import { ChainLink, TextLink, CursorLink, NewlineLink, VirtualNewlineLink } from '../src/ChainLink.js';
import { FontProperties } from '../src/FontProperties.js';

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
            // Simple character-based width estimation
            // Parse font size from currentFont string (e.g., "16px Arial" -> 16)
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

describe('ChainLink', () => {

    describe('Base ChainLink', () => {
        it('should create with empty intrinsic and computed objects', () => {
            const link = new ChainLink();
            assert.deepStrictEqual(link.intrinsic, {});
            assert.deepStrictEqual(link.computed, {});
        });
    });

    describe('TextLink', () => {

        describe('Constructor', () => {
            it('should create with text and font properties', () => {
                const fontProps = new FontProperties(16, 'Arial');
                const textLink = new TextLink('Hello', fontProps);

                assert.strictEqual(textLink.text, 'Hello');
                assert.strictEqual(textLink.intrinsic.fontProperties, fontProps);
            });

            it('should store font properties in intrinsic', () => {
                const fontProps = new FontProperties(20, 'Georgia', 'bold');
                const textLink = new TextLink('Test', fontProps);

                assert.strictEqual(textLink.intrinsic.fontProperties.size, 20);
                assert.strictEqual(textLink.intrinsic.fontProperties.family, 'Georgia');
                assert.strictEqual(textLink.intrinsic.fontProperties.weight, 'bold');
            });

            it('should handle empty text', () => {
                const fontProps = new FontProperties();
                const textLink = new TextLink('', fontProps);

                assert.strictEqual(textLink.text, '');
            });
        });

        describe('Position getters', () => {
            it('should return computed posX', () => {
                const fontProps = new FontProperties();
                const textLink = new TextLink('Test', fontProps);
                textLink.computed.posX = 100;

                assert.strictEqual(textLink.getPosX(), 100);
            });

            it('should return computed posY', () => {
                const fontProps = new FontProperties();
                const textLink = new TextLink('Test', fontProps);
                textLink.computed.posY = 50;

                assert.strictEqual(textLink.getPosY(), 50);
            });

            it('should return ascent', () => {
                const fontProps = new FontProperties();
                const textLink = new TextLink('Test', fontProps);
                textLink.computed.ascent = 12;

                assert.strictEqual(textLink.getAscent(), 12);
            });

            it('should return descent', () => {
                const fontProps = new FontProperties();
                const textLink = new TextLink('Test', fontProps);
                textLink.computed.descent = 4;

                assert.strictEqual(textLink.getDescent(), 4);
            });

            it('should return line height', () => {
                const fontProps = new FontProperties();
                const textLink = new TextLink('Test', fontProps);
                textLink.computed.lineHeight = 24;

                assert.strictEqual(textLink.getLineHeight(), 24);
            });
        });

        describe('getFontProperties', () => {
            it('should return intrinsic font properties', () => {
                const fontProps = new FontProperties(18, 'Times');
                const textLink = new TextLink('Test', fontProps);

                const retrieved = textLink.getFontProperties();
                assert.strictEqual(retrieved.size, 18);
                assert.strictEqual(retrieved.family, 'Times');
            });
        });

        describe('measureText', () => {
            it('should measure text using context', () => {
                const ctx = createMockContext();
                const fontProps = new FontProperties(16, 'Arial');
                const textLink = new TextLink('Hello', fontProps);

                const metrics = textLink.measureText(ctx);
                assert.ok(metrics.width > 0);
                assert.ok(metrics.actualBoundingBoxAscent > 0);
                assert.ok(metrics.actualBoundingBoxDescent > 0);
            });

            it('should measure with text override', () => {
                const ctx = createMockContext();
                const fontProps = new FontProperties(16, 'Arial');
                const textLink = new TextLink('Original', fontProps);

                const metrics1 = textLink.measureText(ctx, 'Short');
                const metrics2 = textLink.measureText(ctx, 'MuchLongerText');

                // Metrics should be different for different length text
                assert.notStrictEqual(metrics1.width, metrics2.width);
                assert.ok(metrics2.width > metrics1.width);
            });

            it('should use correct font properties', () => {
                const ctx = createMockContext();
                const fontProps1 = new FontProperties(16, 'Arial');
                const fontProps2 = new FontProperties(32, 'Arial');

                const textLink1 = new TextLink('Test', fontProps1);
                const textLink2 = new TextLink('Test', fontProps2);

                const metrics1 = textLink1.measureText(ctx);
                const metrics2 = textLink2.measureText(ctx);

                // Larger font should have larger measurements
                assert.ok(metrics2.width > metrics1.width);
                assert.ok(metrics2.actualBoundingBoxAscent > metrics1.actualBoundingBoxAscent);
            });
        });

        describe('doFontPropertiesMatch', () => {
            it('should return true for matching font properties', () => {
                const fontProps1 = new FontProperties(16, 'Arial');
                const fontProps2 = new FontProperties(16, 'Arial');

                const textLink1 = new TextLink('A', fontProps1);
                const textLink2 = new TextLink('B', fontProps2);

                assert.strictEqual(textLink1.doFontPropertiesMatch(textLink2), true);
            });

            it('should return false for different font properties', () => {
                const fontProps1 = new FontProperties(16, 'Arial');
                const fontProps2 = new FontProperties(20, 'Arial');

                const textLink1 = new TextLink('A', fontProps1);
                const textLink2 = new TextLink('B', fontProps2);

                assert.strictEqual(textLink1.doFontPropertiesMatch(textLink2), false);
            });
        });

        describe('clickHits', () => {
            it('should return true for click within text bounds', () => {
                const ctx = createMockContext();
                const fontProps = new FontProperties(16, 'Arial');
                const textLink = new TextLink('Test', fontProps);

                textLink.computed = {
                    posX: 0,
                    posY: 0,
                    ascent: 12,
                    descent: 4,
                    lineHeight: 24
                };

                // Click within text bounds
                assert.strictEqual(textLink.clickHits(ctx, 10, 0), true);
            });

            it('should return false for click outside horizontal bounds', () => {
                const ctx = createMockContext();
                const fontProps = new FontProperties(16, 'Arial');
                const textLink = new TextLink('Test', fontProps);

                textLink.computed = {
                    posX: 0,
                    posY: 0,
                    ascent: 12,
                    descent: 4,
                    lineHeight: 24
                };

                // Click far to the right
                assert.strictEqual(textLink.clickHits(ctx, 1000, 0), false);
            });

            it('should return false for click outside vertical bounds', () => {
                const ctx = createMockContext();
                const fontProps = new FontProperties(16, 'Arial');
                const textLink = new TextLink('Test', fontProps);

                textLink.computed = {
                    posX: 0,
                    posY: 0,
                    ascent: 12,
                    descent: 4,
                    lineHeight: 24
                };

                // Click far below
                assert.strictEqual(textLink.clickHits(ctx, 10, 100), false);
            });
        });

        describe('getCharIdxFromX', () => {
            it('should return 0 for click at start', () => {
                const ctx = createMockContext();
                const fontProps = new FontProperties(16, 'Arial');
                const textLink = new TextLink('Test', fontProps);

                textLink.computed = { posX: 0 };

                assert.strictEqual(textLink.getCharIdxFromX(ctx, 0), 0);
            });

            it('should return text.length for click at end', () => {
                const ctx = createMockContext();
                const fontProps = new FontProperties(16, 'Arial');
                const textLink = new TextLink('Test', fontProps);

                textLink.computed = { posX: 0 };

                const farX = 1000;
                assert.strictEqual(textLink.getCharIdxFromX(ctx, farX), 4);
            });

            it('should return middle index for click in middle', () => {
                const ctx = createMockContext();
                const fontProps = new FontProperties(16, 'Arial');
                const textLink = new TextLink('ABCDEF', fontProps);

                textLink.computed = { posX: 0 };

                // Click somewhere in the middle
                const middleX = 20;
                const charIdx = textLink.getCharIdxFromX(ctx, middleX);

                assert.ok(charIdx >= 0 && charIdx <= 6);
            });
        });
    });

    describe('CursorLink', () => {
        it('should create a cursor link', () => {
            const cursor = new CursorLink();
            assert.ok(cursor instanceof CursorLink);
            assert.ok(cursor instanceof ChainLink);
        });

        it('should have empty intrinsic and computed', () => {
            const cursor = new CursorLink();
            assert.deepStrictEqual(cursor.intrinsic, {});
            assert.deepStrictEqual(cursor.computed, {});
        });
    });

    describe('NewlineLink', () => {
        it('should create a newline link', () => {
            const newline = new NewlineLink();
            assert.ok(newline instanceof NewlineLink);
            assert.ok(newline instanceof ChainLink);
        });

        it('should have empty intrinsic and computed', () => {
            const newline = new NewlineLink();
            assert.deepStrictEqual(newline.intrinsic, {});
            assert.deepStrictEqual(newline.computed, {});
        });
    });

    describe('VirtualNewlineLink', () => {
        it('should create a virtual newline link', () => {
            const vNewline = new VirtualNewlineLink();
            assert.ok(vNewline instanceof VirtualNewlineLink);
            assert.ok(vNewline instanceof ChainLink);
        });

        it('should have empty intrinsic and computed', () => {
            const vNewline = new VirtualNewlineLink();
            assert.deepStrictEqual(vNewline.intrinsic, {});
            assert.deepStrictEqual(vNewline.computed, {});
        });
    });

    describe('Link type differentiation', () => {
        it('should be able to differentiate link types', () => {
            const fontProps = new FontProperties();
            const textLink = new TextLink('Test', fontProps);
            const cursor = new CursorLink();
            const newline = new NewlineLink();
            const vNewline = new VirtualNewlineLink();

            assert.ok(textLink instanceof TextLink);
            assert.ok(cursor instanceof CursorLink);
            assert.ok(newline instanceof NewlineLink);
            assert.ok(vNewline instanceof VirtualNewlineLink);

            assert.ok(!(textLink instanceof CursorLink));
            assert.ok(!(cursor instanceof TextLink));
            assert.ok(!(newline instanceof VirtualNewlineLink));
            assert.ok(!(vNewline instanceof NewlineLink));
        });
    });
});
