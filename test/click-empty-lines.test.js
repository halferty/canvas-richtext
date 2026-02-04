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

describe('Multiple Empty Lines Click Tests', () => {
    let chain;
    let ctx;

    it('should handle clicking on first of multiple empty lines', () => {
        ctx = createMockContext();
        const fontProps = new FontProperties(16, 'Arial');
        chain = new Chain(800, ctx, fontProps);
        
        // Text + 3 empty lines + Text
        const items = [
            new TextLink('F', fontProps.clone()),
            new TextLink('i', fontProps.clone()),
            new TextLink('r', fontProps.clone()),
            new TextLink('s', fontProps.clone()),
            new TextLink('t', fontProps.clone()),
            new NewlineLink(),
            new NewlineLink(), // Empty line 1
            new NewlineLink(), // Empty line 2
            new NewlineLink(), // Empty line 3
            new TextLink('L', fontProps.clone()),
            new TextLink('a', fontProps.clone()),
            new TextLink('s', fontProps.clone()),
            new TextLink('t', fontProps.clone()),
            new NewlineLink(),
            new CursorLink()
        ];
        
        chain.items = items;
        chain.recalc();
        // After recalc: [TextLink('First'), NewlineLink, NewlineLink, NewlineLink, NewlineLink, TextLink('Last'), NewlineLink, CursorLink]

        // Click on first empty line (y=24)
        chain.clicked(50, 24);

        const cursorIdx = chain.cursorIdx();
        // Cursor should be positioned on one of the empty line positions (indices 2, 3, or 4)
        assert.ok(cursorIdx >= 2 && cursorIdx <= 4,
            `Cursor should be on one of the empty lines (2-4), got ${cursorIdx}`);
    });

    it('should handle clicking on middle of multiple empty lines', () => {
        ctx = createMockContext();
        const fontProps = new FontProperties(16, 'Arial');
        chain = new Chain(800, ctx, fontProps);
        
        const items = [
            new TextLink('A', fontProps.clone()),
            new NewlineLink(),
            new NewlineLink(), // Empty 1
            new NewlineLink(), // Empty 2
            new NewlineLink(), // Empty 3
            new NewlineLink(), // Empty 4
            new NewlineLink(), // Empty 5
            new TextLink('B', fontProps.clone()),
            new NewlineLink(),
            new CursorLink()
        ];
        
        chain.items = items;
        chain.recalc();
        
        // Click in the middle of the empty space (y=60, which should be around line 3)
        chain.clicked(50, 60);
        
        const cursorIdx = chain.cursorIdx();
        assert.ok(cursorIdx >= 1 && cursorIdx <= 7, 
            `Cursor should be on one of the empty lines or near them, got ${cursorIdx}`);
    });

    it('should handle clicking on last of multiple empty lines', () => {
        ctx = createMockContext();
        const fontProps = new FontProperties(16, 'Arial');
        chain = new Chain(800, ctx, fontProps);
        
        const items = [
            new TextLink('T', fontProps.clone()),
            new TextLink('o', fontProps.clone()),
            new TextLink('p', fontProps.clone()),
            new NewlineLink(),
            new NewlineLink(), // Empty 1
            new NewlineLink(), // Empty 2
            new NewlineLink(), // Empty 3
            new CursorLink()
        ];
        
        chain.items = items;
        chain.recalc();
        
        // Click on last empty line (y=72)
        chain.clicked(50, 72);
        
        const cursorIdx = chain.cursorIdx();
        assert.ok(cursorIdx >= 4 && cursorIdx <= 7, 
            `Cursor should be on one of the empty lines, got ${cursorIdx}`);
    });

    it('should handle document with only empty lines', () => {
        ctx = createMockContext();
        const fontProps = new FontProperties(16, 'Arial');
        chain = new Chain(800, ctx, fontProps);
        
        const items = [
            new NewlineLink(),
            new NewlineLink(),
            new NewlineLink(),
            new NewlineLink(),
            new CursorLink()
        ];
        
        chain.items = items;
        chain.recalc();
        
        // Click somewhere in the middle
        chain.clicked(100, 36);
        
        const cursorIdx = chain.cursorIdx();
        assert.ok(cursorIdx >= 0 && cursorIdx <= 4, 
            `Cursor should be placed on one of the lines, got ${cursorIdx}`);
    });

    it('should handle clicking far below multiple empty lines', () => {
        ctx = createMockContext();
        const fontProps = new FontProperties(16, 'Arial');
        chain = new Chain(800, ctx, fontProps);
        
        const items = [
            new TextLink('O', fontProps.clone()),
            new TextLink('n', fontProps.clone()),
            new TextLink('l', fontProps.clone()),
            new TextLink('y', fontProps.clone()),
            new NewlineLink(),
            new NewlineLink(), // Empty 1
            new NewlineLink(), // Empty 2
            new CursorLink()
        ];
        
        chain.items = items;
        chain.recalc();
        // After recalc: [TextLink('Only'), NewlineLink, NewlineLink, NewlineLink, CursorLink]

        // Click way below everything
        chain.clicked(50, 200);

        const cursorIdx = chain.cursorIdx();
        const items2 = chain.getItems();
        // Should place at end of document
        assert.ok(cursorIdx === items2.length - 1,
            `Cursor should be at end of document (index ${items2.length - 1}), got ${cursorIdx}`);
    });

    it('should distinguish between consecutive empty lines when clicking precisely', () => {
        ctx = createMockContext();
        const fontProps = new FontProperties(16, 'Arial');
        chain = new Chain(800, ctx, fontProps);
        
        const items = [
            new TextLink('X', fontProps.clone()),
            new NewlineLink(),
            new NewlineLink(), // Line 2 (empty) - should be at y=24
            new NewlineLink(), // Line 3 (empty) - should be at y=48
            new NewlineLink(), // Line 4 (empty) - should be at y=72
            new TextLink('Y', fontProps.clone()),
            new NewlineLink(),
            new CursorLink()
        ];
        
        chain.items = items;
        chain.recalc();
        
        // Click precisely on line 2 (y=24)
        chain.clicked(10, 24);
        const cursor1 = chain.cursorIdx();
        
        // Click precisely on line 3 (y=48)
        chain.clicked(10, 48);
        const cursor2 = chain.cursorIdx();
        
        // Click precisely on line 4 (y=72)
        chain.clicked(10, 72);
        const cursor3 = chain.cursorIdx();
        
        // Each click should potentially place cursor at different positions
        assert.ok(cursor1 >= 1 && cursor1 <= 5, 
            `First click should place cursor validly, got ${cursor1}`);
        assert.ok(cursor2 >= 1 && cursor2 <= 5, 
            `Second click should place cursor validly, got ${cursor2}`);
        assert.ok(cursor3 >= 1 && cursor3 <= 5, 
            `Third click should place cursor validly, got ${cursor3}`);
    });
});
