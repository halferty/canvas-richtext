import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { Chain } from '../src/Chain.js';
import { FontProperties } from '../src/FontProperties.js';
import { TextLink } from '../src/ChainLink.js';
import { NewlineLink } from '../src/ChainLink.js';
import { CursorLink } from '../src/ChainLink.js';

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

describe('Click Positioning Tests', () => {
    let chain;
    let mockCtx;

    beforeEach(() => {
        mockCtx = createMockContext();
        const fontProps = new FontProperties(16, 'Arial');
        chain = new Chain(800, mockCtx, fontProps);
        
        // Build content: "Hello World" + newline + empty line + "Line 3"
        chain.items = [
            new TextLink('Hello', fontProps.clone()),
            new TextLink(' ', fontProps.clone()),
            new TextLink('World', fontProps.clone()),
            new NewlineLink(),
            new NewlineLink(),  // Empty line
            new TextLink('Line', fontProps.clone()),
            new TextLink(' ', fontProps.clone()),
            new TextLink('3', fontProps.clone()),
            new NewlineLink(),
            new CursorLink()
        ];
        
        chain.recalc();
    });

    it('should place cursor at end of line when clicking after text', () => {
        // Line 1 is "Hello World"
        // With 8px char width, "Hello World" = 11 chars * 8 = 88px
        // Click at x=150 (well after the text)
        chain.clicked(150, 0);
        
        const cursorIdx = chain.cursorIdx();
        // Cursor should be after "World" (index 3, before the newline at index 3)
        assert.ok(cursorIdx >= 2 && cursorIdx <= 4, `Cursor should be near end of line 1, got index ${cursorIdx}`);
    });

    it('should place cursor at start of line when clicking before text', () => {
        // Click at x=2 (before "Hello")
        chain.clicked(2, 0);
        
        const cursorIdx = chain.cursorIdx();
        // Cursor should be at start (index 0)
        assert.strictEqual(cursorIdx, 0, 'Cursor should be at start of line 1');
    });

    it('should place cursor on empty line when clicking on it', () => {
        // Empty line is at index 4 (second newline)
        // Line 1 at y=0, line 2 (empty) at y=24
        chain.clicked(50, 24);
        
        const cursorIdx = chain.cursorIdx();
        // Cursor should be at the empty line (index 4)
        assert.strictEqual(cursorIdx, 4, `Cursor should be at empty line, got index ${cursorIdx}`);
    });

    it('should place cursor on line 3 when clicking on it', () => {
        // Line 3 starts at y=48
        // Click somewhere on line 3
        chain.clicked(5, 48);
        
        const cursorIdx = chain.cursorIdx();
        // Cursor should be somewhere on line 3 (indices 5-8)
        assert.ok(cursorIdx >= 5 && cursorIdx <= 8, `Cursor should be on line 3 (index 5-8), got index ${cursorIdx}`);
    });

    it('should handle clicks in gaps between lines', () => {
        // Click between line 1 and line 2 (y=15)
        chain.clicked(50, 15);
        
        const cursorIdx = chain.cursorIdx();
        // Should place cursor on one of the nearby lines
        assert.ok(cursorIdx >= 0 && cursorIdx < chain.items.length, 'Cursor should be at a valid position');
    });
});
