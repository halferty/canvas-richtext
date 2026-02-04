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
            // Each character is ~8px for 16px font
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

describe('Single Line Click Tests', () => {
    let chain;
    let mockCtx;
    let fontProps;

    beforeEach(() => {
        mockCtx = createMockContext();
        fontProps = new FontProperties(16, 'Arial');
        chain = new Chain(800, mockCtx, fontProps);
        
        // Single line: "Hello"
        // Expected: "Hello" = 5 chars * 8px = 40px wide
        chain.items = [
            new TextLink('Hello', fontProps.clone()),
            new NewlineLink(),
            new CursorLink()
        ];
        
        chain.recalc();
        
        // Debug: print the structure
        console.log('\n=== Chain Structure ===');
        chain.items.forEach((item, idx) => {
            if (item instanceof TextLink) {
                console.log(`[${idx}] TextLink: "${item.text}" posX=${item.computed?.posX}, posY=${item.computed?.posY}, lineHeight=${item.computed?.lineHeight}`);
            } else if (item instanceof NewlineLink) {
                console.log(`[${idx}] NewlineLink: posY=${item.computed?.posY}, lineHeight=${item.computed?.lineHeight}`);
            } else if (item instanceof CursorLink) {
                console.log(`[${idx}] CursorLink: posX=${item.computed?.posX}, posY=${item.computed?.posY}`);
            }
        });
        console.log('======================\n');
    });

    describe('Clicking on the text itself', () => {
        it('should place cursor at beginning when clicking before first character', () => {
            // Click at x=1 (before "H")
            console.log('TEST: Click at (1, 0) - before "H"');
            chain.clicked(1, 0);
            
            const cursorIdx = chain.cursorIdx();
            console.log(`Result: Cursor at index ${cursorIdx}`);
            assert.strictEqual(cursorIdx, 0, 'Cursor should be at index 0 (before "Hello")');
        });

        it('should place cursor in middle when clicking in middle of text', () => {
            // Click at x=20 (middle of "Hello", should be between "He" and "llo")
            console.log('TEST: Click at (20, 0) - middle of "Hello"');
            chain.clicked(20, 0);
            
            const cursorIdx = chain.cursorIdx();
            console.log(`Result: Cursor at index ${cursorIdx}`);
            // Should split the TextLink, so cursor could be at various positions
            assert.ok(cursorIdx >= 0 && cursorIdx <= 2, `Cursor should be in first half of text, got index ${cursorIdx}`);
        });

        it('should place cursor at end when clicking after last character', () => {
            // Click at x=50 (after "Hello" which ends at ~40px)
            console.log('TEST: Click at (50, 0) - after "Hello"');
            chain.clicked(50, 0);
            
            const cursorIdx = chain.cursorIdx();
            console.log(`Result: Cursor at index ${cursorIdx}`);
            assert.strictEqual(cursorIdx, 1, 'Cursor should be at index 1 (after "Hello", before newline)');
        });
    });

    describe('Clicking above the line', () => {
        it('should place cursor on the line when clicking above (negative Y)', () => {
            // Click at y=-10 (above the line)
            console.log('TEST: Click at (20, -10) - above the line');
            chain.clicked(20, -10);
            
            const cursorIdx = chain.cursorIdx();
            console.log(`Result: Cursor at index ${cursorIdx}`);
            // Should still place cursor on the line
            assert.ok(cursorIdx >= 0 && cursorIdx <= 2, `Cursor should be on the line, got index ${cursorIdx}`);
        });
    });

    describe('Clicking below the line', () => {
        it('should place cursor at end when clicking below the line', () => {
            // Line 1 at y=0, click at y=30 (well below)
            console.log('TEST: Click at (20, 30) - below the line');
            chain.clicked(20, 30);
            
            const cursorIdx = chain.cursorIdx();
            console.log(`Result: Cursor at index ${cursorIdx}`);
            // Should place cursor at end of document
            assert.ok(cursorIdx >= 1, `Cursor should be near end of document, got index ${cursorIdx}`);
        });
    });

    describe('Clicking to the left', () => {
        it('should place cursor at beginning when clicking far to the left', () => {
            // Click at x=-10 (to the left of text)
            console.log('TEST: Click at (-10, 0) - to the left');
            chain.clicked(-10, 0);
            
            const cursorIdx = chain.cursorIdx();
            console.log(`Result: Cursor at index ${cursorIdx}`);
            assert.strictEqual(cursorIdx, 0, 'Cursor should be at start of line');
        });
    });

    describe('Clicking to the right', () => {
        it('should place cursor at end when clicking far to the right', () => {
            // Click at x=200 (way to the right of text)
            console.log('TEST: Click at (200, 0) - far to the right');
            chain.clicked(200, 0);
            
            const cursorIdx = chain.cursorIdx();
            console.log(`Result: Cursor at index ${cursorIdx}`);
            assert.strictEqual(cursorIdx, 1, 'Cursor should be at end of line (after "Hello")');
        });
    });

    describe('Corner cases', () => {
        it('should place cursor appropriately when clicking below and to the right', () => {
            // Click at x=200, y=30 (below and to the right)
            console.log('TEST: Click at (200, 30) - below and to the right');
            chain.clicked(200, 30);
            
            const cursorIdx = chain.cursorIdx();
            console.log(`Result: Cursor at index ${cursorIdx}`);
            // Should place at end of document
            assert.ok(cursorIdx >= 1, 'Cursor should be at or near end of document');
        });

        it('should place cursor appropriately when clicking above and to the left', () => {
            // Click at x=-10, y=-10 (above and to the left)
            console.log('TEST: Click at (-10, -10) - above and to the left');
            chain.clicked(-10, -10);
            
            const cursorIdx = chain.cursorIdx();
            console.log(`Result: Cursor at index ${cursorIdx}`);
            // Should place at beginning
            assert.strictEqual(cursorIdx, 0, 'Cursor should be at start of document');
        });
    });
});
