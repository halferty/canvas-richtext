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

describe('Mixed Font Size Click Tests', () => {
    let chain;
    let ctx;

    it('should handle clicking on text with different font sizes on same line', () => {
        ctx = createMockContext();
        const smallFont = new FontProperties(12, 'Arial');
        const largeFont = new FontProperties(24, 'Arial');
        chain = new Chain(800, ctx, smallFont);
        
        // Build: "Small" (12px) + "LARGE" (24px) + "Small" (12px)
        const items = [
            new TextLink('S', smallFont.clone()),
            new TextLink('m', smallFont.clone()),
            new TextLink('a', smallFont.clone()),
            new TextLink('l', smallFont.clone()),
            new TextLink('l', smallFont.clone()),
            new TextLink('L', largeFont.clone()),
            new TextLink('A', largeFont.clone()),
            new TextLink('R', largeFont.clone()),
            new TextLink('G', largeFont.clone()),
            new TextLink('E', largeFont.clone()),
            new TextLink('s', smallFont.clone()),
            new TextLink('m', smallFont.clone()),
            new TextLink('a', smallFont.clone()),
            new TextLink('l', smallFont.clone()),
            new TextLink('l', smallFont.clone()),
            new NewlineLink(),
            new CursorLink()
        ];
        
        chain.items = items;
        chain.recalc();
        
        // Click in the middle of the large text
        chain.clicked(50, 0);
        
        const cursorIdx = chain.cursorIdx();
        assert.ok(cursorIdx >= 0 && cursorIdx <= 15, 
            `Cursor should be within text bounds, got ${cursorIdx}`);
    });

    it('should handle clicking between lines with different font sizes', () => {
        ctx = createMockContext();
        const smallFont = new FontProperties(10, 'Arial');
        const mediumFont = new FontProperties(16, 'Arial');
        const largeFont = new FontProperties(32, 'Arial');
        chain = new Chain(800, ctx, mediumFont);
        
        // Build three lines with different sizes
        const items = [
            // Line 1: small
            new TextLink('s', smallFont.clone()),
            new TextLink('m', smallFont.clone()),
            new TextLink('a', smallFont.clone()),
            new TextLink('l', smallFont.clone()),
            new TextLink('l', smallFont.clone()),
            new NewlineLink(),
            // Line 2: large
            new TextLink('L', largeFont.clone()),
            new TextLink('A', largeFont.clone()),
            new TextLink('R', largeFont.clone()),
            new TextLink('G', largeFont.clone()),
            new TextLink('E', largeFont.clone()),
            new NewlineLink(),
            // Line 3: medium
            new TextLink('m', mediumFont.clone()),
            new TextLink('e', mediumFont.clone()),
            new TextLink('d', mediumFont.clone()),
            new NewlineLink(),
            new CursorLink()
        ];
        
        chain.items = items;
        chain.recalc();
        
        // Click somewhere in the middle Y coordinate
        chain.clicked(50, 30);
        
        const cursorIdx = chain.cursorIdx();
        assert.ok(cursorIdx >= 0 && cursorIdx <= 15, 
            'Cursor should be placed somewhere valid');
    });

    it('should place cursor correctly when clicking on tall characters', () => {
        ctx = createMockContext();
        const normalFont = new FontProperties(16, 'Arial');
        const hugeFont = new FontProperties(48, 'Arial');
        chain = new Chain(800, ctx, normalFont);
        
        const items = [
            new TextLink('H', hugeFont.clone()),
            new TextLink('U', hugeFont.clone()),
            new TextLink('G', hugeFont.clone()),
            new TextLink('E', hugeFont.clone()),
            new NewlineLink(),
            new TextLink('t', normalFont.clone()),
            new TextLink('i', normalFont.clone()),
            new TextLink('n', normalFont.clone()),
            new TextLink('y', normalFont.clone()),
            new NewlineLink(),
            new CursorLink()
        ];
        
        chain.items = items;
        chain.recalc();
        
        // Click on the huge text
        chain.clicked(50, 10);
        
        const cursorIdx = chain.cursorIdx();
        assert.ok(cursorIdx >= 0 && cursorIdx <= 4, 
            'Cursor should be on first line with huge text');
    });

    it('should handle clicking between different-height lines in gap', () => {
        ctx = createMockContext();
        const smallFont = new FontProperties(12, 'Arial');
        const largeFont = new FontProperties(36, 'Arial');
        chain = new Chain(800, ctx, smallFont);
        
        const items = [
            new TextLink('t', smallFont.clone()),
            new TextLink('i', smallFont.clone()),
            new TextLink('n', smallFont.clone()),
            new TextLink('y', smallFont.clone()),
            new NewlineLink(),
            new TextLink('H', largeFont.clone()),
            new TextLink('U', largeFont.clone()),
            new TextLink('G', largeFont.clone()),
            new TextLink('E', largeFont.clone()),
            new NewlineLink(),
            new CursorLink()
        ];
        
        chain.items = items;
        chain.recalc();
        
        // Click in the gap between the two lines
        chain.clicked(20, 20);
        
        const cursorIdx = chain.cursorIdx();
        assert.ok(cursorIdx >= 0 && cursorIdx <= 9, 
            'Cursor should be placed on one of the lines');
    });
});
