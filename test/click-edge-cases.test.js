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

describe('Edge Case Click Tests', () => {
    let chain;
    let ctx;

    it('should handle clicking on document with only cursor (empty document)', () => {
        ctx = createMockContext();
        const fontProps = new FontProperties(16, 'Arial');
        chain = new Chain(800, ctx, fontProps);
        
        // Just a cursor, nothing else
        chain.items = [new CursorLink()];
        chain.recalc();
        
        // Click anywhere
        chain.clicked(100, 50);
        
        const cursorIdx = chain.cursorIdx();
        assert.strictEqual(cursorIdx, 0, 'Cursor should remain at position 0');
    });

    it('should handle clicking on document with single character', () => {
        ctx = createMockContext();
        const fontProps = new FontProperties(16, 'Arial');
        chain = new Chain(800, ctx, fontProps);
        
        chain.items = [
            new TextLink('A', fontProps.clone()),
            new NewlineLink(),
            new CursorLink()
        ];
        chain.recalc();
        
        // Click on the character
        chain.clicked(5, 0);
        
        const cursorIdx = chain.cursorIdx();
        assert.ok(cursorIdx >= 0 && cursorIdx <= 1, 
            'Cursor should be at start or after the single character');
    });

    it('should handle extremely large X coordinate', () => {
        ctx = createMockContext();
        const fontProps = new FontProperties(16, 'Arial');
        chain = new Chain(800, ctx, fontProps);
        
        chain.items = [
            new TextLink('T', fontProps.clone()),
            new TextLink('e', fontProps.clone()),
            new TextLink('s', fontProps.clone()),
            new TextLink('t', fontProps.clone()),
            new NewlineLink(),
            new CursorLink()
        ];
        chain.recalc();
        
        // Click with huge X
        chain.clicked(99999, 0);
        
        const cursorIdx = chain.cursorIdx();
        assert.ok(cursorIdx >= 4, 'Cursor should be at end of line');
    });

    it('should handle extremely large Y coordinate', () => {
        ctx = createMockContext();
        const fontProps = new FontProperties(16, 'Arial');
        chain = new Chain(800, ctx, fontProps);
        
        chain.items = [
            new TextLink('L', fontProps.clone()),
            new TextLink('i', fontProps.clone()),
            new TextLink('n', fontProps.clone()),
            new TextLink('e', fontProps.clone()),
            new TextLink('1', fontProps.clone()),
            new NewlineLink(),
            new TextLink('L', fontProps.clone()),
            new TextLink('i', fontProps.clone()),
            new TextLink('n', fontProps.clone()),
            new TextLink('e', fontProps.clone()),
            new TextLink('2', fontProps.clone()),
            new NewlineLink(),
            new CursorLink()
        ];
        chain.recalc();
        
        // Click with huge Y
        chain.clicked(10, 99999);
        
        const cursorIdx = chain.cursorIdx();
        assert.ok(cursorIdx >= 10, 'Cursor should be near end of document');
    });

    it('should handle extremely negative X coordinate', () => {
        ctx = createMockContext();
        const fontProps = new FontProperties(16, 'Arial');
        chain = new Chain(800, ctx, fontProps);
        
        chain.items = [
            new TextLink('T', fontProps.clone()),
            new TextLink('e', fontProps.clone()),
            new TextLink('x', fontProps.clone()),
            new TextLink('t', fontProps.clone()),
            new NewlineLink(),
            new CursorLink()
        ];
        chain.recalc();
        
        // Click with very negative X
        chain.clicked(-99999, 0);
        
        const cursorIdx = chain.cursorIdx();
        assert.strictEqual(cursorIdx, 0, 'Cursor should be at start of line');
    });

    it('should handle extremely negative Y coordinate', () => {
        ctx = createMockContext();
        const fontProps = new FontProperties(16, 'Arial');
        chain = new Chain(800, ctx, fontProps);
        
        chain.items = [
            new TextLink('A', fontProps.clone()),
            new NewlineLink(),
            new TextLink('B', fontProps.clone()),
            new NewlineLink(),
            new TextLink('C', fontProps.clone()),
            new NewlineLink(),
            new CursorLink()
        ];
        chain.recalc();
        
        // Click with very negative Y
        chain.clicked(5, -99999);
        
        const cursorIdx = chain.cursorIdx();
        assert.ok(cursorIdx <= 1, 'Cursor should be on first line');
    });

    it('should handle clicking at exact boundary between characters', () => {
        ctx = createMockContext();
        const fontProps = new FontProperties(16, 'Arial');
        chain = new Chain(800, ctx, fontProps);
        
        // Each character is 8px wide (16px font * 0.5)
        chain.items = [
            new TextLink('A', fontProps.clone()), // 0-8px
            new TextLink('B', fontProps.clone()), // 8-16px
            new TextLink('C', fontProps.clone()), // 16-24px
            new TextLink('D', fontProps.clone()), // 24-32px
            new NewlineLink(),
            new CursorLink()
        ];
        chain.recalc();
        
        // Click exactly at 8px (boundary between A and B)
        chain.clicked(8, 0);
        
        const cursorIdx = chain.cursorIdx();
        assert.ok(cursorIdx >= 0 && cursorIdx <= 2, 
            'Cursor should be near the A-B boundary');
    });

    it('should handle clicking with floating point coordinates', () => {
        ctx = createMockContext();
        const fontProps = new FontProperties(16, 'Arial');
        chain = new Chain(800, ctx, fontProps);
        
        chain.items = [
            new TextLink('F', fontProps.clone()),
            new TextLink('l', fontProps.clone()),
            new TextLink('o', fontProps.clone()),
            new TextLink('a', fontProps.clone()),
            new TextLink('t', fontProps.clone()),
            new NewlineLink(),
            new CursorLink()
        ];
        chain.recalc();
        
        // Click with floating point
        chain.clicked(12.7891, 3.1415);
        
        const cursorIdx = chain.cursorIdx();
        assert.ok(cursorIdx >= 0 && cursorIdx <= 5, 
            'Should handle floating point coordinates');
    });

    it('should handle very narrow canvas width', () => {
        ctx = createMockContext();
        const fontProps = new FontProperties(16, 'Arial');
        chain = new Chain(10, ctx, fontProps); // Extremely narrow!
        
        chain.items = [
            new TextLink('W', fontProps.clone()),
            new TextLink('o', fontProps.clone()),
            new TextLink('r', fontProps.clone()),
            new TextLink('d', fontProps.clone()),
            new NewlineLink(),
            new CursorLink()
        ];
        chain.recalc();
        
        // Click in the narrow space
        chain.clicked(5, 10);
        
        const cursorIdx = chain.cursorIdx();
        assert.ok(cursorIdx >= 0 && cursorIdx <= 5, 
            'Should handle narrow canvas width gracefully');
    });

    it('should handle clicking at exactly (0, 0)', () => {
        ctx = createMockContext();
        const fontProps = new FontProperties(16, 'Arial');
        chain = new Chain(800, ctx, fontProps);
        
        chain.items = [
            new TextLink('O', fontProps.clone()),
            new TextLink('r', fontProps.clone()),
            new TextLink('i', fontProps.clone()),
            new TextLink('g', fontProps.clone()),
            new TextLink('i', fontProps.clone()),
            new TextLink('n', fontProps.clone()),
            new NewlineLink(),
            new CursorLink()
        ];
        chain.recalc();
        
        // Click at exact origin
        chain.clicked(0, 0);
        
        const cursorIdx = chain.cursorIdx();
        assert.strictEqual(cursorIdx, 0, 
            'Click at origin should place cursor at start');
    });
});
