import { describe, it } from 'node:test';
import assert from 'node:assert';
import { FontProperties } from '../src/FontProperties.js';

describe('FontProperties', () => {

    describe('Constructor and basic properties', () => {
        it('should create with default values', () => {
            const font = new FontProperties();
            assert.strictEqual(font.size, 16);
            assert.strictEqual(font.family, 'Arial');
            assert.strictEqual(font.weight, 'normal');
            assert.strictEqual(font.style, 'normal');
        });

        it('should create with custom values', () => {
            const font = new FontProperties(24, 'Georgia', 'bold', 'italic');
            assert.strictEqual(font.size, 24);
            assert.strictEqual(font.family, 'Georgia');
            assert.strictEqual(font.weight, 'bold');
            assert.strictEqual(font.style, 'italic');
        });

        it('should create with partial custom values', () => {
            const font = new FontProperties(20);
            assert.strictEqual(font.size, 20);
            assert.strictEqual(font.family, 'Arial');
            assert.strictEqual(font.weight, 'normal');
            assert.strictEqual(font.style, 'normal');
        });
    });

    describe('doPropertiesMatch', () => {
        it('should return true for identical properties', () => {
            const font1 = new FontProperties(16, 'Arial', 'normal', 'normal');
            const font2 = new FontProperties(16, 'Arial', 'normal', 'normal');
            assert.strictEqual(font1.doPropertiesMatch(font2), true);
        });

        it('should return false for different size', () => {
            const font1 = new FontProperties(16, 'Arial');
            const font2 = new FontProperties(20, 'Arial');
            assert.strictEqual(font1.doPropertiesMatch(font2), false);
        });

        it('should return false for different family', () => {
            const font1 = new FontProperties(16, 'Arial');
            const font2 = new FontProperties(16, 'Georgia');
            assert.strictEqual(font1.doPropertiesMatch(font2), false);
        });

        it('should return false for different weight', () => {
            const font1 = new FontProperties(16, 'Arial', 'normal');
            const font2 = new FontProperties(16, 'Arial', 'bold');
            assert.strictEqual(font1.doPropertiesMatch(font2), false);
        });

        it('should return false for different style', () => {
            const font1 = new FontProperties(16, 'Arial', 'normal', 'normal');
            const font2 = new FontProperties(16, 'Arial', 'normal', 'italic');
            assert.strictEqual(font1.doPropertiesMatch(font2), false);
        });

        it('should return true for matching complex properties', () => {
            const font1 = new FontProperties(24, 'Courier New', 'bold', 'italic');
            const font2 = new FontProperties(24, 'Courier New', 'bold', 'italic');
            assert.strictEqual(font1.doPropertiesMatch(font2), true);
        });
    });

    describe('clone', () => {
        it('should create an independent copy', () => {
            const font1 = new FontProperties(18, 'Times', 'bold', 'italic');
            const font2 = font1.clone();

            assert.strictEqual(font2.size, 18);
            assert.strictEqual(font2.family, 'Times');
            assert.strictEqual(font2.weight, 'bold');
            assert.strictEqual(font2.style, 'italic');
        });

        it('should not share reference with original', () => {
            const font1 = new FontProperties(16, 'Arial');
            const font2 = font1.clone();

            font2.size = 20;
            font2.family = 'Georgia';

            assert.strictEqual(font1.size, 16);
            assert.strictEqual(font1.family, 'Arial');
        });

        it('should create equal but not identical object', () => {
            const font1 = new FontProperties(16, 'Arial');
            const font2 = font1.clone();

            assert.notStrictEqual(font1, font2);
            assert.strictEqual(font1.doPropertiesMatch(font2), true);
        });
    });

    describe('toFontString', () => {
        it('should format basic font string correctly', () => {
            const font = new FontProperties(16, 'Arial', 'normal', 'normal');
            assert.strictEqual(font.toFontString(), 'normal normal 16px Arial');
        });

        it('should format bold font string correctly', () => {
            const font = new FontProperties(20, 'Georgia', 'bold', 'normal');
            assert.strictEqual(font.toFontString(), 'normal bold 20px Georgia');
        });

        it('should format italic font string correctly', () => {
            const font = new FontProperties(14, 'Times', 'normal', 'italic');
            assert.strictEqual(font.toFontString(), 'italic normal 14px Times');
        });

        it('should format bold italic font string correctly', () => {
            const font = new FontProperties(24, 'Courier', 'bold', 'italic');
            assert.strictEqual(font.toFontString(), 'italic bold 24px Courier');
        });

        it('should handle font families with spaces', () => {
            const font = new FontProperties(16, 'Times New Roman', 'normal', 'normal');
            assert.strictEqual(font.toFontString(), 'normal normal 16px Times New Roman');
        });

        it('should handle various font sizes', () => {
            const font1 = new FontProperties(12, 'Arial');
            const font2 = new FontProperties(48, 'Arial');
            assert.strictEqual(font1.toFontString(), 'normal normal 12px Arial');
            assert.strictEqual(font2.toFontString(), 'normal normal 48px Arial');
        });
    });

    describe('Property modification', () => {
        it('should allow modifying size', () => {
            const font = new FontProperties(16, 'Arial');
            font.size = 24;
            assert.strictEqual(font.size, 24);
            assert.strictEqual(font.toFontString(), 'normal normal 24px Arial');
        });

        it('should allow modifying family', () => {
            const font = new FontProperties(16, 'Arial');
            font.family = 'Georgia';
            assert.strictEqual(font.family, 'Georgia');
            assert.strictEqual(font.toFontString(), 'normal normal 16px Georgia');
        });

        it('should allow modifying weight', () => {
            const font = new FontProperties(16, 'Arial');
            font.weight = 'bold';
            assert.strictEqual(font.weight, 'bold');
            assert.strictEqual(font.toFontString(), 'normal bold 16px Arial');
        });

        it('should allow modifying style', () => {
            const font = new FontProperties(16, 'Arial');
            font.style = 'italic';
            assert.strictEqual(font.style, 'italic');
            assert.strictEqual(font.toFontString(), 'italic normal 16px Arial');
        });
    });
});
