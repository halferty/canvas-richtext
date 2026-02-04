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

describe('Text Wrapping Click Tests', () => {
    let chain;
    let ctx;

    it('should handle clicking on wrapped text (line becomes multiple visual lines)', () => {
        ctx = createMockContext();
        const fontProps = new FontProperties(16, 'Arial');
        chain = new Chain(100, ctx, fontProps); // Narrow width to force wrapping
        
        // Create a long line that should wrap
        const longText = "This is a very long line that will wrap";
        const items = [];
        for (const char of longText) {
            items.push(new TextLink(char, fontProps.clone()));
        }
        items.push(new NewlineLink());
        items.push(new CursorLink());
        
        chain.items = items;
        chain.recalc();
        
        // Click somewhere in the middle
        chain.clicked(50, 10);
        
        const cursorIdx = chain.cursorIdx();
        // Cursor should be placed somewhere valid
        assert.ok(cursorIdx >= 0 && cursorIdx <= longText.length, 
            `Cursor at index ${cursorIdx} should be within text bounds (0-${longText.length})`);
    });

    it('should handle clicking between wrapped lines', () => {
        ctx = createMockContext();
        const fontProps = new FontProperties(16, 'Arial');
        chain = new Chain(80, ctx, fontProps); // Very narrow to force wrapping
        
        const text = "ABCDEFGHIJKLMNOP";
        const items = [];
        for (const char of text) {
            items.push(new TextLink(char, fontProps.clone()));
        }
        items.push(new NewlineLink());
        items.push(new CursorLink());
        
        chain.items = items;
        chain.recalc();
        
        // Click on what should be the second visual line
        chain.clicked(20, 30);
        
        const cursorIdx = chain.cursorIdx();
        assert.ok(cursorIdx >= 0 && cursorIdx <= text.length, 
            'Cursor should be placed within text bounds');
    });

    it('should handle clicking at end of wrapped text', () => {
        ctx = createMockContext();
        const fontProps = new FontProperties(16, 'Arial');
        chain = new Chain(120, ctx, fontProps);
        
        const text = "Short line that wraps around";
        const items = [];
        for (const char of text) {
            items.push(new TextLink(char, fontProps.clone()));
        }
        items.push(new NewlineLink());
        items.push(new CursorLink());
        
        chain.items = items;
        chain.recalc();

        // Click way to the right on the last visual line
        chain.clicked(200, 48);

        const cursorIdx = chain.cursorIdx();
        const items2 = chain.getItems();
        // Should place cursor at or near the end (after recalc, items are chunked/wrapped)
        assert.ok(cursorIdx >= items2.length - 3,
            `Cursor should be near end of items array (total ${items2.length} items), got index ${cursorIdx}`);
    });
});
