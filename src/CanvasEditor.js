import { Chain } from './Chain.js';
import { FontProperties } from './FontProperties.js';
import { TextLink, CursorLink, NewlineLink, VirtualNewlineLink } from './ChainLink.js';

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

        // Drag and drop state
        this.isDragging = false;
        this.dragStartX = 0;
        this.dragStartY = 0;
        this.draggedText = '';

        // Click tracking for double/triple click
        this.lastClickTime = 0;
        this.clickCount = 0;
        this.clickResetTimeout = null;

        // Undo/Redo history
        this.history = [];
        this.historyIndex = -1;
        this.maxHistorySize = 100;

        // Paragraph alignment (keyed by paragraph index)
        this.paragraphAlignments = new Map();

        // Take initial snapshot
        this.takeSnapshot();

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
        this.boundHandleMouseOver = (e) => this.handleMouseOver(e);

        // Skip event listeners if canvas doesn't support them (e.g., node-canvas in tests)
        if (typeof this.canvas.addEventListener === 'function') {
            // Keyboard events
            this.canvas.addEventListener('keydown', this.boundHandleKeyDown);

            // Mouse events
            this.canvas.addEventListener('mousedown', this.boundHandleMouseDown);
            this.canvas.addEventListener('mousemove', this.boundHandleMouseMove);
            this.canvas.addEventListener('mouseup', this.boundHandleMouseUp);
            this.canvas.addEventListener('mouseover', this.boundHandleMouseOver);

            // Make canvas focusable and set initial cursor
            this.canvas.tabIndex = 1;
            if (this.canvas.style) {
                this.canvas.style.cursor = 'text';
            }
        }
    }

    handleMouseOver(e) {
        // Update cursor style when hovering over selection
        if (!this.canvas.style) return; // No style property in test environment
        if (this.isDragging) return; // Keep grabbing cursor while dragging

        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left - this.options.padding;
        const y = e.clientY - rect.top - this.options.padding;

        const pos = this.getCharacterAtPosition(x, y);
        if (this.isPositionInSelection(pos)) {
            this.canvas.style.cursor = 'grab';
        } else {
            this.canvas.style.cursor = 'text';
        }
    }

    handleKeyDown(e) {
        const key = e.key;
        const ctrl = e.ctrlKey || e.metaKey;

        // Undo/Redo shortcuts
        if (ctrl && key === 'z' && !e.shiftKey) {
            e.preventDefault();
            this.undo();
            this.resetCursorBlink();
            return;
        } else if (ctrl && (key === 'y' || (key === 'z' && e.shiftKey))) {
            e.preventDefault();
            this.redo();
            this.resetCursorBlink();
            return;
        }

        // Select All
        if (ctrl && key === 'a') {
            e.preventDefault();
            this.selectAll();
            this.render();
            this.resetCursorBlink();
            return;
        }

        // Copy
        if (ctrl && key === 'c') {
            e.preventDefault();
            this.copy();
            this.resetCursorBlink();
            return;
        }

        // Cut
        if (ctrl && key === 'x') {
            e.preventDefault();
            this.cut();
            this.resetCursorBlink();
            return;
        }

        // Paste
        if (ctrl && key === 'v') {
            e.preventDefault();
            this.paste();
            this.resetCursorBlink();
            return;
        }

        // Text formatting shortcuts
        if (ctrl && key === 'b') {
            e.preventDefault();
            this.toggleBold();
            this.resetCursorBlink();
            return;
        }

        if (ctrl && key === 'i') {
            e.preventDefault();
            this.toggleItalic();
            this.resetCursorBlink();
            return;
        }

        if (ctrl && key === 'u') {
            e.preventDefault();
            this.toggleUnderline();
            this.resetCursorBlink();
            return;
        }

        // Handle editor keys
        if (key === 'Backspace') {
            e.preventDefault();
            this.takeSnapshot();
            if (this.chain.hasSelection()) {
                this.deleteSelection();
            } else {
                this.chain.backspacePressed();
            }
            this.render();
        } else if (key === 'Enter') {
            e.preventDefault();
            this.takeSnapshot();
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
        } else if (key.length === 1 && !ctrl) {
            // Printable character - prevent default to stop page scrolling
            e.preventDefault();
            this.takeSnapshot();
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

    // Clipboard operations
    selectAll() {
        const items = this.chain.getItems();
        let totalChars = 0;

        for (let item of items) {
            if (item instanceof TextLink) {
                totalChars += item.text.length;
            } else if (item instanceof NewlineLink) {
                totalChars += 1;
            }
        }

        if (totalChars > 0) {
            this.chain.selectionStart = 0;
            this.chain.selectionEnd = totalChars;
        }
    }

    copy() {
        if (!this.chain.hasSelection()) return;

        const selectedText = this.chain.getSelectedText();

        // Use Clipboard API if available
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(selectedText).catch(err => {
                console.error('Failed to copy text: ', err);
            });
        }
    }

    cut() {
        if (!this.chain.hasSelection()) return;

        this.takeSnapshot();
        this.copy();
        this.deleteSelection();
        this.render();
    }

    paste() {
        // Use Clipboard API if available
        if (navigator.clipboard && navigator.clipboard.readText) {
            navigator.clipboard.readText().then(text => {
                this.takeSnapshot();

                // Delete selection if exists
                if (this.chain.hasSelection()) {
                    this.deleteSelection();
                }

                // Insert pasted text
                for (let char of text) {
                    if (char === '\n') {
                        this.chain.enterPressed();
                    } else {
                        this.chain.printableKeyPressed(char);
                    }
                }

                this.render();
            }).catch(err => {
                console.error('Failed to paste text: ', err);
            });
        }
    }

    // Get font properties at cursor position
    getFontAtCursor() {
        const items = this.chain.getItems();
        const cursorIdx = this.chain.cursorIdx();

        // Look backwards from cursor to find the most recent TextLink
        for (let i = cursorIdx - 1; i >= 0; i--) {
            if (items[i] instanceof TextLink) {
                return {
                    size: items[i].intrinsic.fontProperties.size,
                    family: items[i].intrinsic.fontProperties.family,
                    weight: items[i].intrinsic.fontProperties.weight,
                    style: items[i].intrinsic.fontProperties.style
                };
            }
        }

        // No text before cursor, return current default
        return {
            size: this.chain.currentFontProperties.size,
            family: this.chain.currentFontProperties.family,
            weight: this.chain.currentFontProperties.weight,
            style: this.chain.currentFontProperties.style
        };
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

        // Check if clicking within existing selection (for drag and drop)
        const clickedInSelection = this.isPositionInSelection(startPos);

        // Handle multi-clicks
        if (this.clickCount === 2) {
            // Double-click: select word (don't move cursor first!)
            this.chain.clearSelection();
            this.selectWord(startPos);
        } else if (this.clickCount >= 3) {
            // Triple-click: select line (don't move cursor first!)
            this.chain.clearSelection();
            this.selectLine(startPos);
        } else if (clickedInSelection && this.chain.hasSelection()) {
            // Single click within selection: prepare for potential drag
            // Don't clear selection yet - wait to see if user drags
            this.dragStartX = x;
            this.dragStartY = y;
            this.draggedText = this.chain.getSelectedText();
        } else {
            // Single click outside selection: clear selection and position cursor
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
        if (!this.isMouseDown) return;

        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left - this.options.padding;
        const y = e.clientY - rect.top - this.options.padding;

        // Calculate drag distance
        const dragDistance = Math.sqrt(Math.pow(x - this.mouseDownX, 2) + Math.pow(y - this.mouseDownY, 2));

        // Check if we should start dragging selected text
        if (this.draggedText && !this.isDragging && dragDistance >= 5) {
            // Start drag operation
            this.isDragging = true;
            if (this.canvas.style) {
                this.canvas.style.cursor = 'grabbing';
            }
            console.log('Started dragging selected text');
            return;
        }

        // If we're dragging, just update cursor (actual drop happens in mouseup)
        if (this.isDragging) {
            return;
        }

        // Normal selection behavior (not dragging)
        if (!this.mouseDownCharPos) return;

        // Require minimum drag distance to start selection (prevent accidental selection on click)
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
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left - this.options.padding;
        const y = e.clientY - rect.top - this.options.padding;

        // Handle drag and drop completion
        if (this.isDragging && this.draggedText) {
            console.log('Completing drag and drop operation');

            // Find drop position
            const dropPos = this.getCharacterAtPosition(x, y);

            if (dropPos) {
                const dropCharIdx = this.chain.getCharPosition(dropPos.itemIdx, dropPos.charOffset);

                // Only perform move if dropping outside the current selection
                if (dropCharIdx < this.chain.selectionStart || dropCharIdx > this.chain.selectionEnd) {
                    this.takeSnapshot();

                    // Get the text being moved
                    const movedText = this.draggedText;

                    // Delete text from original position
                    this.deleteSelection();

                    // Adjust drop position if it was after the deleted text
                    let adjustedDropCharIdx = dropCharIdx;
                    if (dropCharIdx > this.chain.selectionEnd) {
                        // Drop was after selection, need to adjust for deleted text
                        adjustedDropCharIdx -= (this.chain.selectionEnd - this.chain.selectionStart);
                    }

                    // Convert adjusted character index back to item/offset position
                    const finalDropPos = this.chain.getItemFromCharPosition(adjustedDropCharIdx);

                    // Move cursor to drop position
                    const cursorIdx = this.chain.cursorIdx();
                    this.chain.items.splice(cursorIdx, 1);
                    this.chain.items.splice(finalDropPos.itemIdx, 0, new CursorLink());
                    this.chain.recalc();

                    // Insert the moved text at cursor position
                    for (let char of movedText) {
                        if (char === '\n') {
                            this.chain.enterPressed();
                        } else {
                            this.chain.printableKeyPressed(char);
                        }
                    }

                    this.render();
                }
            }

            // Reset drag state
            this.isDragging = false;
            this.draggedText = '';
            if (this.canvas.style) {
                this.canvas.style.cursor = 'text';
            }
        }

        this.isMouseDown = false;
        this.mouseDownCharPos = null;
        this.draggedText = '';
    }

    // Helper to check if a character position is within current selection
    isPositionInSelection(pos) {
        if (!pos || !this.chain.hasSelection()) return false;

        const posCharIdx = this.chain.getCharPosition(pos.itemIdx, pos.charOffset);
        return posCharIdx >= this.chain.selectionStart && posCharIdx < this.chain.selectionEnd;
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
        // Apply alignment adjustments before rendering
        this.adjustForAlignment();

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
        let posX = textLink.getPosX();
        let posY = textLink.getPosY();
        const fontProps = textLink.getFontProperties();

        // Apply superscript/subscript offset and size adjustment
        let fontSize = fontProps.size;
        if (fontProps.superscript) {
            fontSize = fontProps.size * 0.7;
            posY -= fontProps.size * 0.4;
        } else if (fontProps.subscript) {
            fontSize = fontProps.size * 0.7;
            posY += fontProps.size * 0.2;
        }

        // Create adjusted font string for super/subscript
        const fontString = fontProps.superscript || fontProps.subscript
            ? `${fontProps.style} ${fontProps.weight} ${fontSize}px ${fontProps.family}`
            : fontProps.toFontString();

        this.ctx.font = fontString;
        this.ctx.fillStyle = fontProps.color || '#000000';
        this.ctx.fillText(textLink.text, posX, posY);

        // Measure text for decoration lines
        const metrics = this.ctx.measureText(textLink.text);
        const textWidth = metrics.width;

        // Draw underline
        if (fontProps.underline) {
            this.ctx.strokeStyle = fontProps.color || '#000000';
            this.ctx.lineWidth = Math.max(1, fontSize * 0.05);
            this.ctx.beginPath();
            const underlineY = posY + fontSize * 0.1;
            this.ctx.moveTo(posX, underlineY);
            this.ctx.lineTo(posX + textWidth, underlineY);
            this.ctx.stroke();
        }

        // Draw strikethrough
        if (fontProps.strikethrough) {
            this.ctx.strokeStyle = fontProps.color || '#000000';
            this.ctx.lineWidth = Math.max(1, fontSize * 0.05);
            this.ctx.beginPath();
            const strikeY = posY - fontSize * 0.3;
            this.ctx.moveTo(posX, strikeY);
            this.ctx.lineTo(posX + textWidth, strikeY);
            this.ctx.stroke();
        }
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

    // Text formatting methods
    toggleBold() {
        if (this.chain.hasSelection()) {
            this.takeSnapshot();
            this.applyFormattingToSelection('weight', (current) => current === 'bold' ? 'normal' : 'bold');
            this.render();
        } else {
            // Toggle for next typed text
            this.chain.currentFontProperties.toggleBold();
        }
    }

    toggleItalic() {
        if (this.chain.hasSelection()) {
            this.takeSnapshot();
            this.applyFormattingToSelection('style', (current) => current === 'italic' ? 'normal' : 'italic');
            this.render();
        } else {
            // Toggle for next typed text
            this.chain.currentFontProperties.toggleItalic();
        }
    }

    toggleUnderline() {
        if (this.chain.hasSelection()) {
            this.takeSnapshot();
            this.applyFormattingToSelection('underline', (current) => !current);
            this.render();
        } else {
            // Toggle for next typed text
            this.chain.currentFontProperties.toggleUnderline();
        }
    }

    toggleStrikethrough() {
        if (this.chain.hasSelection()) {
            this.takeSnapshot();
            this.applyFormattingToSelection('strikethrough', (current) => !current);
            this.render();
        } else {
            // Toggle for next typed text
            this.chain.currentFontProperties.toggleStrikethrough();
        }
    }

    toggleSuperscript() {
        if (this.chain.hasSelection()) {
            this.takeSnapshot();
            // Superscript and subscript are mutually exclusive
            this.applyFormattingToSelection('subscript', () => false);
            this.applyFormattingToSelection('superscript', (current) => !current);
            this.render();
        } else {
            // Toggle for next typed text
            this.chain.currentFontProperties.toggleSuperscript();
        }
    }

    toggleSubscript() {
        if (this.chain.hasSelection()) {
            this.takeSnapshot();
            // Superscript and subscript are mutually exclusive
            this.applyFormattingToSelection('superscript', () => false);
            this.applyFormattingToSelection('subscript', (current) => !current);
            this.render();
        } else {
            // Toggle for next typed text
            this.chain.currentFontProperties.toggleSubscript();
        }
    }

    setTextColor(color) {
        if (this.chain.hasSelection()) {
            this.takeSnapshot();
            this.applyFormattingToSelection('color', () => color);
            this.render();
        } else {
            // Set for next typed text
            this.chain.currentFontProperties.color = color;
        }
    }

    // Text alignment methods
    getCurrentParagraphIndex() {
        const items = this.chain.getItems();
        const cursorIdx = this.chain.cursorIdx();
        let paragraphIndex = 0;

        // Count newlines before cursor to determine paragraph
        for (let i = 0; i < cursorIdx; i++) {
            if (items[i] instanceof NewlineLink) {
                paragraphIndex++;
            }
        }

        return paragraphIndex;
    }

    setAlignment(alignment) {
        this.takeSnapshot();
        const paragraphIndex = this.getCurrentParagraphIndex();

        if (alignment === 'left') {
            // Remove alignment (default is left)
            this.paragraphAlignments.delete(paragraphIndex);
        } else {
            this.paragraphAlignments.set(paragraphIndex, alignment);
        }

        this.chain.recalc();
        this.render();
    }

    toggleCenterAlign() {
        const paragraphIndex = this.getCurrentParagraphIndex();
        const currentAlign = this.paragraphAlignments.get(paragraphIndex) || 'left';

        if (currentAlign === 'center') {
            this.setAlignment('left');
        } else {
            this.setAlignment('center');
        }
    }

    adjustForAlignment() {
        const items = this.chain.getItems();
        let currentParagraph = 0;
        let lineStartIdx = 0;

        for (let i = 0; i <= items.length; i++) {
            const isLineEnd = i === items.length ||
                            items[i] instanceof NewlineLink ||
                            items[i] instanceof VirtualNewlineLink;

            if (isLineEnd) {
                const alignment = this.paragraphAlignments.get(currentParagraph) || 'left';

                if (alignment === 'center') {
                    // Calculate line width
                    let lineWidth = 0;
                    for (let j = lineStartIdx; j < i; j++) {
                        if (items[j] instanceof TextLink) {
                            const text = items[j].text;
                            const metrics = items[j].measureText(this.ctx, text);
                            lineWidth += metrics.width;
                        }
                    }

                    // Calculate offset to center the line
                    const offset = Math.max(0, (this.editorWidth - lineWidth) / 2);

                    // Apply offset to all items on this line
                    for (let j = lineStartIdx; j < i; j++) {
                        if (items[j].computed && items[j].computed.posX !== undefined) {
                            items[j].computed.posX += offset;
                        }
                    }
                }

                // Move to next line
                lineStartIdx = i + 1;

                // Track paragraph boundaries
                if (i < items.length && items[i] instanceof NewlineLink) {
                    currentParagraph++;
                }
            }
        }
    }

    applyFormattingToSelection(property, valueFn) {
        const items = this.chain.getItems();
        let pos = 0;
        const selStart = this.chain.selectionStart;
        const selEnd = this.chain.selectionEnd;

        for (let item of items) {
            if (item instanceof TextLink) {
                const itemStart = pos;
                const itemEnd = pos + item.text.length;

                // If this item overlaps with the selection, update its property
                if (itemEnd > selStart && itemStart < selEnd) {
                    const currentValue = item.intrinsic.fontProperties[property];
                    item.intrinsic.fontProperties[property] = valueFn(currentValue);
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
        this.takeSnapshot();
        this.chain.items = [new CursorLink()];
        this.chain.recalc();
        this.render();
    }

    // Undo/Redo System
    takeSnapshot() {
        // Remove any history after current index (when user makes new edit after undo)
        if (this.historyIndex < this.history.length - 1) {
            this.history = this.history.slice(0, this.historyIndex + 1);
        }

        // Create a deep copy of the chain state
        const snapshot = {
            items: this.chain.items.map(item => {
                if (item instanceof TextLink) {
                    return {
                        type: 'TextLink',
                        text: item.text,
                        fontProperties: {
                            size: item.intrinsic.fontProperties.size,
                            family: item.intrinsic.fontProperties.family,
                            weight: item.intrinsic.fontProperties.weight,
                            style: item.intrinsic.fontProperties.style
                        }
                    };
                } else if (item instanceof CursorLink) {
                    return { type: 'CursorLink' };
                } else if (item instanceof NewlineLink) {
                    return { type: 'NewlineLink' };
                }
                return null;
            }).filter(item => item !== null),
            selectionStart: this.chain.selectionStart,
            selectionEnd: this.chain.selectionEnd
        };

        this.history.push(snapshot);

        // Limit history size
        if (this.history.length > this.maxHistorySize) {
            this.history.shift();
        } else {
            this.historyIndex++;
        }
    }

    restoreSnapshot(snapshot) {
        if (!snapshot) return;

        // Restore chain items
        this.chain.items = snapshot.items.map(item => {
            if (item.type === 'TextLink') {
                const fontProps = new FontProperties(
                    item.fontProperties.size,
                    item.fontProperties.family,
                    item.fontProperties.weight,
                    item.fontProperties.style
                );
                return new TextLink(item.text, fontProps);
            } else if (item.type === 'CursorLink') {
                return new CursorLink();
            } else if (item.type === 'NewlineLink') {
                return new NewlineLink();
            }
            return null;
        }).filter(item => item !== null);

        // Restore selection
        this.chain.selectionStart = snapshot.selectionStart;
        this.chain.selectionEnd = snapshot.selectionEnd;

        this.chain.recalc();
        this.render();
    }

    undo() {
        if (this.historyIndex <= 0) return; // Nothing to undo

        this.historyIndex--;
        this.restoreSnapshot(this.history[this.historyIndex]);
    }

    redo() {
        if (this.historyIndex >= this.history.length - 1) return; // Nothing to redo

        this.historyIndex++;
        this.restoreSnapshot(this.history[this.historyIndex]);
    }

    canUndo() {
        return this.historyIndex > 0;
    }

    canRedo() {
        return this.historyIndex < this.history.length - 1;
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
        this.canvas.removeEventListener('mouseover', this.boundHandleMouseOver);
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

