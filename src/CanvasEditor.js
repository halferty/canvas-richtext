import { Chain } from './Chain.js';
import { FontProperties } from './FontProperties.js';
import { TextLink, CursorLink, NewlineLink } from './ChainLink.js';

/**
 * CanvasEditor - Main editor class that manages the canvas, rendering, and user interactions
 */
export class CanvasEditor {
    constructor(canvas, options = {}) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        
        // Options with defaults
        this.options = {
            backgroundColor: options.backgroundColor || '#ffffff',
            cursorColor: options.cursorColor || '#000000',
            cursorWidth: options.cursorWidth || 2,
            cursorBlinkRate: options.cursorBlinkRate || 530,
            padding: options.padding || 10,
            defaultFontSize: options.defaultFontSize || 16,
            defaultFontFamily: options.defaultFontFamily || 'Arial',
            defaultFontWeight: options.defaultFontWeight || 'normal',
            defaultFontStyle: options.defaultFontStyle || 'normal',
            debug: options.debug || false
        };

        // Initialize font properties
        this.defaultFontProperties = new FontProperties(
            this.options.defaultFontSize,
            this.options.defaultFontFamily,
            this.options.defaultFontWeight,
            this.options.defaultFontStyle
        );

        // Calculate editor width
        this.editorWidth = this.canvas.width - (this.options.padding * 2);

        // Initialize the chain
        this.chain = new Chain(this.editorWidth, this.ctx, this.defaultFontProperties);

        // Cursor blink state
        this.cursorVisible = true;
        this.lastBlinkTime = Date.now();
        this.blinkCycleStartTime = Date.now();
        this.animationFrameId = null;

        // Selection state
        this.isMouseDown = false;
        this.mouseDownPos = null;
        
        // Click tracking for double/triple click
        this.lastClickTime = 0;
        this.clickCount = 0;
        this.clickResetTimeout = null;

        // Event listeners
        this.setupEventListeners();

        // Initial render
        this.render();
        this.startAnimationLoop();
    }

    setupEventListeners() {
        // Bind event handlers to maintain context
        this.boundHandleKeyDown = (e) => this.handleKeyDown(e);
        this.boundHandleMouseDown = (e) => this.handleMouseDown(e);
        this.boundHandleMouseMove = (e) => this.handleMouseMove(e);
        this.boundHandleMouseUp = (e) => this.handleMouseUp(e);

        // Skip event listeners if canvas doesn't support them (e.g., node-canvas in tests)
        if (typeof this.canvas.addEventListener === 'function') {
            // Keyboard events
            this.canvas.addEventListener('keydown', this.boundHandleKeyDown);
            
            // Mouse events
            this.canvas.addEventListener('mousedown', this.boundHandleMouseDown);
            this.canvas.addEventListener('mousemove', this.boundHandleMouseMove);
            this.canvas.addEventListener('mouseup', this.boundHandleMouseUp);

            // Make canvas focusable
            this.canvas.tabIndex = 1;
        }
    }

    handleKeyDown(e) {
        const key = e.key;

        // Handle editor keys
        if (key === 'Backspace') {
            e.preventDefault();
            if (this.chain.hasSelection()) {
                this.deleteSelection();
            } else {
                this.chain.backspacePressed();
            }
            this.render();
        } else if (key === 'Enter') {
            e.preventDefault();
            if (this.chain.hasSelection()) {
                this.deleteSelection();
            }
            this.chain.enterPressed();
            this.render();
        } else if (key === 'ArrowLeft') {
            e.preventDefault();
            // leftArrowPressed handles selection internally
            this.chain.leftArrowPressed();
            this.render();
        } else if (key === 'ArrowRight') {
            e.preventDefault();
            // rightArrowPressed handles selection internally
            this.chain.rightArrowPressed();
            this.render();
        } else if (key === 'ArrowUp') {
            e.preventDefault();
            this.chain.clearSelection();
            this.chain.upArrowPressed();
            this.render();
        } else if (key === 'ArrowDown') {
            e.preventDefault();
            this.chain.clearSelection();
            this.chain.downArrowPressed();
            this.render();
        } else if (key.length === 1 && !e.ctrlKey && !e.metaKey) {
            // Printable character - prevent default to stop page scrolling
            e.preventDefault();
            // Delete selection first if exists
            if (this.chain.hasSelection()) {
                this.deleteSelection();
            }
            this.chain.printableKeyPressed(key);
            this.render();
        }

        // Reset cursor blink to stay visible for full cycle
        this.resetCursorBlink();
    }

    deleteSelection() {
        if (!this.chain.hasSelection()) return;

        const selStart = this.chain.selectionStart;
        const selEnd = this.chain.selectionEnd;
        
        // Remove all items in selection range
        const items = this.chain.getItems();
        let pos = 0;
        let itemsToRemove = [];
        
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            
            if (item instanceof TextLink) {
                const itemStart = pos;
                const itemEnd = pos + item.text.length;
                
                if (itemEnd > selStart && itemStart < selEnd) {
                    const startOffset = Math.max(0, selStart - itemStart);
                    const endOffset = Math.min(item.text.length, selEnd - itemStart);
                    
                    if (startOffset === 0 && endOffset === item.text.length) {
                        // Remove entire item
                        itemsToRemove.push(i);
                    } else if (startOffset === 0) {
                        // Remove from start
                        item.text = item.text.substring(endOffset);
                    } else if (endOffset === item.text.length) {
                        // Remove to end
                        item.text = item.text.substring(0, startOffset);
                    } else {
                        // Remove from middle
                        item.text = item.text.substring(0, startOffset) + item.text.substring(endOffset);
                    }
                }
                pos += item.text.length;
            } else if (item instanceof NewlineLink) {
                if (pos >= selStart && pos < selEnd) {
                    itemsToRemove.push(i);
                }
                pos += 1;
            }
        }
        
        // Remove items in reverse order to maintain indices
        for (let i = itemsToRemove.length - 1; i >= 0; i--) {
            this.chain.items.splice(itemsToRemove[i], 1);
        }
        
        this.chain.clearSelection();
        this.chain.recalc();
    }

    handleMouseDown(e) {
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left - this.options.padding;
        const y = e.clientY - rect.top - this.options.padding;

        // Track click count for double/triple click
        const now = Date.now();
        if (now - this.lastClickTime < 500) {
            this.clickCount++;
        } else {
            this.clickCount = 1;
        }
        this.lastClickTime = now;
        
        // Reset click count after delay
        if (this.clickResetTimeout) {
            clearTimeout(this.clickResetTimeout);
        }
        this.clickResetTimeout = setTimeout(() => {
            this.clickCount = 0;
        }, 500);
        
        this.isMouseDown = true;
        this.mouseDownX = x;
        this.mouseDownY = y;
        
        // Store the character position where mouse went down
        const startPos = this.getCharacterAtPosition(x, y);
        this.mouseDownCharPos = startPos;
        
        // Handle multi-clicks
        if (this.clickCount === 2) {
            // Double-click: select word (don't move cursor first!)
            this.chain.clearSelection();
            this.selectWord(startPos);
        } else if (this.clickCount >= 3) {
            // Triple-click: select line (don't move cursor first!)
            this.chain.clearSelection();
            this.selectLine(startPos);
        } else {
            // Single click: clear selection and position cursor
            this.chain.clearSelection();
            this.chain.clicked(x, y);
            console.log('Single click - cursor repositioned');
        }
        
        this.render();

        // Reset cursor blink to stay visible for full cycle
        this.resetCursorBlink();

        // Focus the canvas
        this.canvas.focus();
    }

    handleMouseMove(e) {
        if (!this.isMouseDown || !this.mouseDownCharPos) return;

        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left - this.options.padding;
        const y = e.clientY - rect.top - this.options.padding;

        // Require minimum drag distance to start selection (prevent accidental selection on click)
        const dragDistance = Math.sqrt(Math.pow(x - this.mouseDownX, 2) + Math.pow(y - this.mouseDownY, 2));
        if (dragDistance < 3) return; // 3 pixel threshold

        // Find character position for current mouse position
        const endPos = this.getCharacterAtPosition(x, y);

        if (this.mouseDownCharPos && endPos) {
            this.chain.setSelection(
                this.mouseDownCharPos.itemIdx, this.mouseDownCharPos.charOffset,
                endPos.itemIdx, endPos.charOffset
            );
            this.render();
        }
    }

    handleMouseUp(e) {
        this.isMouseDown = false;
        this.mouseDownCharPos = null;
    }

    // Helper to find character position at x, y coordinates
    getCharacterAtPosition(x, y) {
        const items = this.chain.getItems();
        
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            if (item instanceof TextLink && item.clickHits(this.ctx, x, y)) {
                const charOffset = item.getCharIdxFromX(this.ctx, x);
                return { itemIdx: i, charOffset };
            }
        }
        
        // If not found, return end of document
        for (let i = items.length - 1; i >= 0; i--) {
            if (items[i] instanceof TextLink) {
                return { itemIdx: i, charOffset: items[i].text.length };
            }
        }
        
        return null;
    }

    selectWord(pos) {
        if (!pos) return;
        
        const items = this.chain.getItems();
        let item = items[pos.itemIdx];
        
        console.log('=== SELECT WORD DEBUG ===');
        console.log('Clicked item index:', pos.itemIdx);
        console.log('Clicked char offset:', pos.charOffset);
        console.log('Clicked item text:', item instanceof TextLink ? `"${item.text}"` : 'not TextLink');
        
        if (!(item instanceof TextLink)) {
            console.log('Not a TextLink, aborting');
            return;
        }
        
        // Skip cursor links when scanning
        const isCursorOrWhitespace = (item) => {
            return !(item instanceof TextLink) || !/^\S+$/.test(item.text);
        };
        
        // Text has been chunked, so we need to expand across multiple TextLink items
        // to select the whole word (all adjacent non-whitespace TextLinks)
        
        let startIdx = pos.itemIdx;
        let endIdx = pos.itemIdx;
        
        console.log('Scanning left from', pos.itemIdx - 1);
        // Expand left to include adjacent non-whitespace TextLinks (skip cursors)
        for (let i = pos.itemIdx - 1; i >= 0; i--) {
            const itemType = items[i].constructor.name;
            const itemText = items[i] instanceof TextLink ? `"${items[i].text}"` : 'N/A';
            const isCursor = items[i] instanceof CursorLink;
            const isNonWhitespace = items[i] instanceof TextLink && /^\S+$/.test(items[i].text);
            console.log(`  Item ${i}: type=${itemType}, text=${itemText}, isCursor=${isCursor}, isNonWhitespace=${isNonWhitespace}`);
            
            // Skip cursor links
            if (items[i] instanceof CursorLink) {
                continue;
            }
            
            if (items[i] instanceof TextLink && /^\S+$/.test(items[i].text)) {
                startIdx = i;
            } else {
                break;
            }
        }
        
        console.log('Scanning right from', pos.itemIdx + 1);
        // Expand right to include adjacent non-whitespace TextLinks (skip cursors)
        for (let i = pos.itemIdx + 1; i < items.length; i++) {
            const itemType = items[i].constructor.name;
            const itemText = items[i] instanceof TextLink ? `"${items[i].text}"` : 'N/A';
            const isCursor = items[i] instanceof CursorLink;
            const isNonWhitespace = items[i] instanceof TextLink && /^\S+$/.test(items[i].text);
            console.log(`  Item ${i}: type=${itemType}, text=${itemText}, isCursor=${isCursor}, isNonWhitespace=${isNonWhitespace}`);
            
            // Skip cursor links
            if (items[i] instanceof CursorLink) {
                continue;
            }
            
            if (items[i] instanceof TextLink && /^\S+$/.test(items[i].text)) {
                endIdx = i;
            } else {
                break;
            }
        }
        
        console.log('Final selection range: startIdx=', startIdx, 'endIdx=', endIdx);
        console.log('Start item text:', items[startIdx] instanceof TextLink ? `"${items[startIdx].text}"` : 'N/A');
        console.log('End item text:', items[endIdx] instanceof TextLink ? `"${items[endIdx].text}"` : 'N/A');
        
        // Set selection from start of first item to end of last item
        this.chain.setSelection(startIdx, 0, endIdx, items[endIdx].text.length);
        
        console.log('Selection set:', this.chain.selectionStart, 'to', this.chain.selectionEnd);
        
        // Move cursor to end of word
        const cursorIdx = this.chain.cursorIdx();
        this.chain.items.splice(cursorIdx, 1);
        this.chain.items.splice(endIdx + 1, 0, new CursorLink());
        
        this.chain.recalc();
    }

    selectLine(pos) {
        if (!pos) return;
        
        const items = this.chain.getItems();
        
        // Find start of line (previous newline or start of document)
        let startIdx = 0;
        let startOffset = 0;
        for (let i = pos.itemIdx; i >= 0; i--) {
            if (items[i] instanceof NewlineLink) {
                // Start after this newline
                if (i + 1 < items.length && items[i + 1] instanceof TextLink) {
                    startIdx = i + 1;
                    startOffset = 0;
                } else {
                    startIdx = i;
                    startOffset = 0;
                }
                break;
            } else if (i === 0 && items[i] instanceof TextLink) {
                startIdx = 0;
                startOffset = 0;
                break;
            }
        }
        
        // Find end of line (next newline or end of document)
        let endIdx = items.length - 1;
        let endOffset = 0;
        for (let i = pos.itemIdx; i < items.length; i++) {
            if (items[i] instanceof NewlineLink) {
                // End at this newline (include it)
                endIdx = i;
                endOffset = 0;
                break;
            } else if (items[i] instanceof TextLink) {
                endIdx = i;
                endOffset = items[i].text.length;
            }
        }
        
        // Set selection
        this.chain.setSelection(startIdx, startOffset, endIdx, endOffset);
        
        // Move cursor to end of line
        const cursorIdx = this.chain.cursorIdx();
        this.chain.items.splice(cursorIdx, 1);
        
        if (items[endIdx] instanceof NewlineLink) {
            this.chain.items.splice(endIdx + 1, 0, new CursorLink());
        } else if (items[endIdx] instanceof TextLink) {
            this.chain.items.splice(endIdx + 1, 0, new CursorLink());
        }
        
        this.chain.recalc();
    }

    startAnimationLoop() {
        const animate = () => {
            const now = Date.now();
            const timeSinceCycleStart = now - this.blinkCycleStartTime;
            let needsRender = false;
            
            // During first full cycle (2 blink periods), keep cursor visible
            if (timeSinceCycleStart < this.options.cursorBlinkRate * 2) {
                if (!this.cursorVisible) {
                    this.cursorVisible = true;
                    needsRender = true;
                }
            } else if (now - this.lastBlinkTime > this.options.cursorBlinkRate) {
                // Normal blinking after first full cycle
                this.cursorVisible = !this.cursorVisible;
                this.lastBlinkTime = now;
                needsRender = true;
            }

            if (needsRender) {
                this.render();
            }
            
            this.animationFrameId = requestAnimationFrame(animate);
        };
        this.animationFrameId = requestAnimationFrame(animate);
    }

    resetCursorBlink() {
        this.cursorVisible = true;
        this.lastBlinkTime = Date.now();
        this.blinkCycleStartTime = Date.now();
    }

    render() {
        // Clear canvas
        this.ctx.fillStyle = this.options.backgroundColor;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Translate for padding
        this.ctx.save();
        this.ctx.translate(this.options.padding, this.options.padding);

        // Render selection highlight first
        if (this.chain.hasSelection()) {
            this.renderSelection();
        }

        // Render all items in the chain
        const items = this.chain.getItems();
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            
            if (item instanceof TextLink) {
                this.renderTextLink(item);
            } else if (item instanceof CursorLink) {
                this.renderCursor(item);
            }
        }

        this.ctx.restore();
    }

    renderSelection() {
        const items = this.chain.getItems();
        let pos = 0;
        const selStart = this.chain.selectionStart;
        const selEnd = this.chain.selectionEnd;

        this.ctx.fillStyle = 'rgba(0, 120, 215, 0.3)'; // Blue highlight

        for (let item of items) {
            if (item instanceof TextLink) {
                const itemStart = pos;
                const itemEnd = pos + item.text.length;

                if (itemEnd > selStart && itemStart < selEnd) {
                    const startOffset = Math.max(0, selStart - itemStart);
                    const endOffset = Math.min(item.text.length, selEnd - itemStart);

                    // Measure text positions
                    const beforeText = item.text.substring(0, startOffset);
                    const selectedText = item.text.substring(startOffset, endOffset);
                    
                    const beforeWidth = startOffset > 0 ? item.measureText(this.ctx, beforeText).width : 0;
                    const selectedWidth = item.measureText(this.ctx, selectedText).width;

                    const x = item.getPosX() + beforeWidth;
                    const y = item.getPosY() - (item.getAscent() || 0);
                    const height = (item.getAscent() || 0) + (item.getDescent() || 0);

                    this.ctx.fillRect(x, y, selectedWidth, height);
                }
                pos += item.text.length;
            } else if (item instanceof NewlineLink) {
                pos += 1;
            }
        }
    }

    renderTextLink(textLink) {
        const posX = textLink.getPosX();
        const posY = textLink.getPosY();
        const fontProps = textLink.getFontProperties();

        this.ctx.font = fontProps.toFontString();
        this.ctx.fillStyle = '#000000';
        this.ctx.fillText(textLink.text, posX, posY);
    }

    renderCursor(cursor) {
        // Don't show cursor if there's a selection
        if (!this.cursorVisible || this.chain.hasSelection()) return;

        const posX = cursor.computed.posX;
        const posY = cursor.computed.posY;
        const height = cursor.computed.height || this.options.defaultFontSize;

        this.ctx.fillStyle = this.options.cursorColor;
        this.ctx.fillRect(posX, posY - height, this.options.cursorWidth, height);
    }

    // Public API methods
    setFontSize(size) {
        this.chain.setFontSize(size);
        
        // Apply to selected text if there's a selection
        if (this.chain.hasSelection()) {
            this.applyFontSizeToSelection(size);
        }
        
        this.render();
    }

    setFontFamily(family) {
        this.chain.setFontFamily(family);
        
        // Apply to selected text if there's a selection
        if (this.chain.hasSelection()) {
            this.applyFontFamilyToSelection(family);
        }
        
        this.render();
    }

    applyFontSizeToSelection(size) {
        const items = this.chain.getItems();
        let pos = 0;
        const selStart = this.chain.selectionStart;
        const selEnd = this.chain.selectionEnd;

        for (let item of items) {
            if (item instanceof TextLink) {
                const itemStart = pos;
                const itemEnd = pos + item.text.length;

                // If this item overlaps with the selection, update its font size
                if (itemEnd > selStart && itemStart < selEnd) {
                    item.intrinsic.fontProperties.size = size;
                }
                pos += item.text.length;
            } else if (item instanceof NewlineLink) {
                pos += 1;
            }
        }
        
        this.chain.recalc();
    }

    applyFontFamilyToSelection(family) {
        const items = this.chain.getItems();
        let pos = 0;
        const selStart = this.chain.selectionStart;
        const selEnd = this.chain.selectionEnd;

        for (let item of items) {
            if (item instanceof TextLink) {
                const itemStart = pos;
                const itemEnd = pos + item.text.length;

                // If this item overlaps with the selection, update its font family
                if (itemEnd > selStart && itemStart < selEnd) {
                    item.intrinsic.fontProperties.family = family;
                }
                pos += item.text.length;
            } else if (item instanceof NewlineLink) {
                pos += 1;
            }
        }
        
        this.chain.recalc();
    }

    getText() {
        const items = this.chain.getItems();
        let text = '';
        for (let item of items) {
            if (item instanceof TextLink) {
                text += item.text;
            } else if (item instanceof NewlineLink) {
                text += '\n';
            }
        }
        return text;
    }

    setText(text) {
        // Clear the chain and insert text
        this.chain.items = [new CursorLink()];
        for (let char of text) {
            if (char === '\n') {
                this.chain.enterPressed();
            } else {
                this.chain.printableKeyPressed(char);
            }
        }
        this.render();
    }

    clear() {
        this.chain.items = [new CursorLink()];
        this.chain.recalc();
        this.render();
    }

    resize(width, height) {
        this.canvas.width = width;
        this.canvas.height = height;
        this.editorWidth = width - (this.options.padding * 2);
        this.chain.setWidth(this.editorWidth);
        this.render();
    }

    destroy() {
        // Stop animation loop
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }

        // Clean up event listeners
        this.canvas.removeEventListener('keydown', this.boundHandleKeyDown);
        this.canvas.removeEventListener('mousedown', this.boundHandleMouseDown);
        this.canvas.removeEventListener('mousemove', this.boundHandleMouseMove);
        this.canvas.removeEventListener('mouseup', this.boundHandleMouseUp);
    }

    // Debug method to dump full editor state
    dumpState() {
        return {
            canvasSize: {
                width: this.canvas.width,
                height: this.canvas.height
            },
            editorWidth: this.editorWidth,
            options: this.options,
            currentFontProperties: {
                size: this.chain.currentFontProperties.size,
                family: this.chain.currentFontProperties.family,
                weight: this.chain.currentFontProperties.weight,
                style: this.chain.currentFontProperties.style
            },
            chainState: this.chain.dumpChainState(),
            text: this.getText()
        };
    }
}

