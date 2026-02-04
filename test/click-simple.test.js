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
            // Simple character-based width estimation
            // Average character width ~8px for 16px font
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

describe('Click Positioning - Simplified Tests', () => {
    
    it('clicking after text should place cursor at end of line', () => {
        const ctx = createMockContext();
        const fontProps = new FontProperties(16, 'Arial');
        const chain = new Chain(800, ctx, fontProps);
        
        // Manually construct: "Hello" + newline
        chain.items = [
            new TextLink('Hello', fontProps.clone()),
            new NewlineLink(),
            new CursorLink()
        ];
        chain.recalc();
        
        // Click after "Hello" (x=100, y=0)
        chain.clicked(100, 0);
        
        const cursorIdx = chain.cursorIdx();
        assert.strictEqual(cursorIdx, 1, 'Cursor should be after "Hello" (index 1)');
    });
    
    it('clicking before text should place cursor at start of line', () => {
        const ctx = createMockContext();
        const fontProps = new FontProperties(16, 'Arial');
        const chain = new Chain(800, ctx, fontProps);
        
        // Manually construct: "Hello" + newline
        chain.items = [
            new TextLink('Hello', fontProps.clone()),
            new NewlineLink(),
            new CursorLink()
        ];
        chain.recalc();
        
        // Click before "Hello" (x=1, y=0)
        chain.clicked(1, 0);
        
        const cursorIdx = chain.cursorIdx();
        assert.strictEqual(cursorIdx, 0, 'Cursor should be before "Hello" (index 0)');
    });
    
    it('clicking on empty line should place cursor on that line', () => {
        const ctx = createMockContext();
        const fontProps = new FontProperties(16, 'Arial');
        const chain = new Chain(800, ctx, fontProps);
        
        // Manually construct: "Line1" + newline + newline + "Line3"
        chain.items = [
            new TextLink('Line1', fontProps.clone()),
            new NewlineLink(),
            new NewlineLink(),  // Empty line
            new TextLink('Line3', fontProps.clone()),
            new NewlineLink(),
            new CursorLink()
        ];
        chain.recalc();
        
        // Click on empty line (y=24, which is line 2)
        chain.clicked(50, 24);
        
        const cursorIdx = chain.cursorIdx();
        assert.ok(cursorIdx === 2, 'Cursor should be at the empty line (index 2)');
    });
    
    it('clicking in gap between lines should place cursor appropriately', () => {
        const ctx = createMockContext();
        const fontProps = new FontProperties(16, 'Arial');
        const chain = new Chain(800, ctx, fontProps);
        
        // Manually construct: "Line1" + newline + "Line2"
        chain.items = [
            new TextLink('Line1', fontProps.clone()),
            new NewlineLink(),
            new TextLink('Line2', fontProps.clone()),
            new NewlineLink(),
            new CursorLink()
        ];
        chain.recalc();
        
        // Click in gap between lines (y=15, between line 1 and line 2)
        chain.clicked(50, 15);
        
        const cursorIdx = chain.cursorIdx();
        // Should be on one of the two lines
        assert.ok(cursorIdx >= 0 && cursorIdx <= 3, 'Cursor should be placed on a valid line');
    });
    
    console.log('All simplified click tests completed!');
});
