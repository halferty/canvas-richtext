import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { createCanvas } from 'canvas';
import { CanvasEditor } from '../src/index.js';

describe('Click Positioning Tests', () => {
    let canvas;
    let editor;
    let chain;

    beforeEach(() => {
        // Create a mock canvas using node-canvas
        canvas = createCanvas(800, 600);
        editor = new CanvasEditor(canvas);
        chain = editor.chain;
        
        // Load test content: 3 lines
        // Line 1: "Welcome to Canvas Editor!" at posY=0
        // Line 2: empty at posY=24
        // Line 3: "Click anywhere to start typing..." at posY=48
        editor.loadHTML(`Welcome to Canvas Editor!

Click anywhere to start typing. Try changing the font and size from the toolbar above.`);
    });

    function getCursorInfo() {
        const cursorIdx = chain.cursorIdx();
        const cursor = chain.items[cursorIdx];
        
        // Count characters before cursor
        let charCount = 0;
        for (let i = 0; i < cursorIdx; i++) {
            if (chain.items[i].text) {
                charCount += chain.items[i].text.length;
            } else if (chain.items[i].constructor.name === 'NewlineLink') {
                charCount += 1;
            }
        }
        
        // Determine which line cursor is on by posY
        const posY = cursor.computed?.posY || 0;
        const lineNum = Math.round(posY / 24) + 1;
        
        return {
            index: cursorIdx,
            charCount,
            posY,
            lineNum,
            cursor
        };
    }

    describe('Clicking after text on a line', () => {
        it('should place cursor at END of line 1 when clicking after "Editor!"', () => {
            // Line 1 text ends around x=180, click at x=250
            chain.clicked(250, 0);
            
            const info = getCursorInfo();
            assert.strictEqual(info.lineNum, 1, 'Cursor should be on line 1');
            assert.strictEqual(info.charCount, 27, 'Cursor should be at char 27 (end of line 1)');
        });

        it('should place cursor at END of line 3 when clicking far right', () => {
            // Click way to the right on line 3
            chain.clicked(700, 48);
            
            const info = getCursorInfo();
            assert.strictEqual(info.lineNum, 3, 'Cursor should be on line 3');
            // Line 3 has all the text, should be at the end
            assert.ok(info.charCount > 90, 'Cursor should be near end of line 3');
        });
    });

    describe('Clicking before text on a line', () => {
        it('should place cursor at START of line 1 when clicking before "Welcome"', () => {
            // Click at x=5 (before first character)
            chain.clicked(5, 0);
            
            const info = getCursorInfo();
            assert.strictEqual(info.lineNum, 1, 'Cursor should be on line 1');
            assert.strictEqual(info.charCount, 0, 'Cursor should be at char 0 (start of line 1)');
        });

        it('should place cursor at START of line 3 when clicking before "Click"', () => {
            // Click at x=5 on line 3
            chain.clicked(5, 48);
            
            const info = getCursorInfo();
            assert.strictEqual(info.lineNum, 3, 'Cursor should be on line 3');
            assert.strictEqual(info.charCount, 28, 'Cursor should be at char 28 (start of line 3)');
        });
    });

    describe('Clicking on empty lines', () => {
        it('should place cursor on empty line 2', () => {
            // Click on the empty line
            chain.clicked(50, 24);
            
            const info = getCursorInfo();
            assert.strictEqual(info.lineNum, 2, 'Cursor should be on line 2');
            assert.strictEqual(info.charCount, 28, 'Cursor should be at char 28 (the newline position)');
        });
    });

    describe('Clicking in gaps between lines', () => {
        it('should place cursor on line 2 when clicking just below line 1', () => {
            // Click in gap between line 1 and empty line 2 (y=12-20)
            chain.clicked(50, 15);
            
            const info = getCursorInfo();
            assert.ok(info.lineNum === 1 || info.lineNum === 2, 'Cursor should be on line 1 or 2');
        });

        it('should place cursor appropriately when clicking between empty line 2 and line 3', () => {
            // Click in gap just above line 3 text (y=30)
            chain.clicked(50, 30);
            
            const info = getCursorInfo();
            assert.ok(info.lineNum === 2 || info.lineNum === 3, 'Cursor should be on line 2 or 3');
            
            // If on line 3, should be at start
            if (info.lineNum === 3) {
                assert.strictEqual(info.charCount, 28, 'If on line 3, cursor should be at start');
            }
        });
    });

    describe('Clicking on actual text characters', () => {
        it('should place cursor within "Welcome" when clicking on that word', () => {
            // Click on "Welcome" (approximately x=20-60)
            chain.clicked(40, 0);
            
            const info = getCursorInfo();
            assert.strictEqual(info.lineNum, 1, 'Cursor should be on line 1');
            assert.ok(info.charCount >= 0 && info.charCount <= 7, 'Cursor should be within "Welcome"');
        });

        it('should place cursor within line 3 when clicking on middle of text', () => {
            // Click somewhere in the middle of line 3
            chain.clicked(100, 48);
            
            const info = getCursorInfo();
            assert.strictEqual(info.lineNum, 3, 'Cursor should be on line 3');
            assert.ok(info.charCount >= 28, 'Cursor should be on line 3 (char >= 28)');
        });
    });

    describe('Edge cases', () => {
        it('should handle negative Y coordinates (above line 1)', () => {
            // Click above the canvas
            chain.clicked(100, -10);
            
            const info = getCursorInfo();
            assert.strictEqual(info.lineNum, 1, 'Cursor should be on line 1');
        });

        it('should handle very large Y coordinates (below last line)', () => {
            // Click way below line 3
            chain.clicked(100, 200);
            
            const info = getCursorInfo();
            // Should place cursor at the end of document
            assert.ok(info.charCount > 90, 'Cursor should be near end of document');
        });

        it('should handle negative X coordinates (left of text)', () => {
            // Click to the left of the canvas
            chain.clicked(-10, 0);
            
            const info = getCursorInfo();
            assert.strictEqual(info.lineNum, 1, 'Cursor should be on line 1');
            assert.strictEqual(info.charCount, 0, 'Cursor should be at start of line');
        });
    });

    describe('Sequential clicks', () => {
        it('should move cursor correctly through multiple clicks', () => {
            // Click at end of line 1
            chain.clicked(250, 0);
            let info = getCursorInfo();
            const line1End = info.charCount;
            
            // Click on empty line 2
            chain.clicked(50, 24);
            info = getCursorInfo();
            assert.strictEqual(info.lineNum, 2, 'Second click should move to line 2');
            
            // Click at start of line 3
            chain.clicked(5, 48);
            info = getCursorInfo();
            assert.strictEqual(info.lineNum, 3, 'Third click should move to line 3');
            assert.strictEqual(info.charCount, 28, 'Should be at start of line 3');
            
            // Click back to start of line 1
            chain.clicked(5, 0);
            info = getCursorInfo();
            assert.strictEqual(info.lineNum, 1, 'Fourth click should return to line 1');
            assert.strictEqual(info.charCount, 0, 'Should be at start of line 1');
        });
    });
});
