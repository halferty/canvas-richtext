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
            scrollbarWidth: options.scrollbarWidth || 10,
            scrollbarTrackColor: options.scrollbarTrackColor || 'rgba(0, 0, 0, 0.05)',
            scrollbarThumbColor: options.scrollbarThumbColor || 'rgba(0, 0, 0, 0.3)',
            minScrollbarThumbHeight: options.minScrollbarThumbHeight || 24,
            tabSize: options.tabSize || 4,
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

        // Vertical scroll state (content pixels scrolled off the top)
        this.scrollY = 0;
        // When set, the next render scrolls to keep the cursor visible. Set by
        // keyboard actions; deliberately NOT set by wheel scrolling so the user
        // can scroll away freely.
        this.scrollToCursorOnNextRender = false;
        // Scrollbar drag state
        this.isScrollbarDragging = false;
        this.scrollbarGrabOffset = 0;
        // Touch state (tap-to-place-cursor vs drag-to-scroll)
        this.touchStartX = 0;
        this.touchStartY = 0;
        this.touchLastY = 0;
        this.touchMoved = false;

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

        // Paragraph list type, 'bullet' | 'number' (keyed by paragraph index)
        this.paragraphLists = new Map();
        // Left indent applied to list paragraphs, in pixels.
        this.LIST_INDENT = 32;

        // Find/Replace state
        this.findMatches = [];
        this.currentMatchIndex = -1;
        this.findQuery = '';
        this.caseSensitive = false;

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
        this.boundHandleWheel = (e) => this.handleWheel(e);
        this.boundHandleTouchStart = (e) => this.handleTouchStart(e);
        this.boundHandleTouchMove = (e) => this.handleTouchMove(e);
        this.boundHandleTouchEnd = (e) => this.handleTouchEnd(e);

        // Skip event listeners if canvas doesn't support them (e.g., node-canvas in tests)
        if (typeof this.canvas.addEventListener === 'function') {
            // Keyboard events
            this.canvas.addEventListener('keydown', this.boundHandleKeyDown);

            // Mouse events
            this.canvas.addEventListener('mousedown', this.boundHandleMouseDown);
            this.canvas.addEventListener('mousemove', this.boundHandleMouseMove);
            this.canvas.addEventListener('mouseup', this.boundHandleMouseUp);
            this.canvas.addEventListener('mouseover', this.boundHandleMouseOver);
            this.canvas.addEventListener('wheel', this.boundHandleWheel, { passive: false });

            // Touch events (passive: false so we can preventDefault to scroll)
            this.canvas.addEventListener('touchstart', this.boundHandleTouchStart, { passive: false });
            this.canvas.addEventListener('touchmove', this.boundHandleTouchMove, { passive: false });
            this.canvas.addEventListener('touchend', this.boundHandleTouchEnd, { passive: false });

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
        const y = e.clientY - rect.top - this.options.padding + this.scrollY;

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

        // Any keyboard action should bring the cursor back into view on render.
        this.scrollToCursorOnNextRender = true;

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
            } else if (ctrl) {
                this.chain.deleteWordLeft();
            } else {
                this.chain.backspacePressed();
            }
            this.render();
        } else if (key === 'Delete') {
            e.preventDefault();
            this.takeSnapshot();
            if (this.chain.hasSelection()) {
                this.deleteSelection();
            } else if (ctrl) {
                this.chain.deleteWordRight();
            } else {
                this.chain.deleteForward();
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
            // Ctrl moves by whole words; Shift extends the selection.
            // Plain cursor movement collapses any existing selection internally.
            if (ctrl && e.shiftKey) {
                this.chain.shiftWordLeftPressed();
            } else if (ctrl) {
                this.chain.wordLeftPressed();
            } else if (e.shiftKey) {
                this.chain.shiftLeftArrowPressed();
            } else {
                this.chain.leftArrowPressed();
            }
            this.render();
        } else if (key === 'ArrowRight') {
            e.preventDefault();
            if (ctrl && e.shiftKey) {
                this.chain.shiftWordRightPressed();
            } else if (ctrl) {
                this.chain.wordRightPressed();
            } else if (e.shiftKey) {
                this.chain.shiftRightArrowPressed();
            } else {
                this.chain.rightArrowPressed();
            }
            this.render();
        } else if (key === 'Home') {
            e.preventDefault();
            // Ctrl jumps to document start; Shift extends the selection.
            if (ctrl && e.shiftKey) {
                this.chain.shiftDocumentStartPressed();
            } else if (ctrl) {
                this.chain.documentStartPressed();
            } else if (e.shiftKey) {
                this.chain.shiftHomePressed();
            } else {
                this.chain.homePressed();
            }
            this.render();
        } else if (key === 'End') {
            e.preventDefault();
            if (ctrl && e.shiftKey) {
                this.chain.shiftDocumentEndPressed();
            } else if (ctrl) {
                this.chain.documentEndPressed();
            } else if (e.shiftKey) {
                this.chain.shiftEndPressed();
            } else {
                this.chain.endPressed();
            }
            this.render();
        } else if (key === 'ArrowUp') {
            e.preventDefault();
            if (e.shiftKey) {
                this.chain.shiftUpArrowPressed();
            } else {
                this.chain.clearSelection();
                this.chain.upArrowPressed();
            }
            this.render();
        } else if (key === 'ArrowDown') {
            e.preventDefault();
            if (e.shiftKey) {
                this.chain.shiftDownArrowPressed();
            } else {
                this.chain.clearSelection();
                this.chain.downArrowPressed();
            }
            this.render();
        } else if (key === 'PageUp') {
            e.preventDefault();
            this.pageMove(-1, e.shiftKey);
            this.render();
        } else if (key === 'PageDown') {
            e.preventDefault();
            this.pageMove(1, e.shiftKey);
            this.render();
        } else if (key === 'Tab') {
            // Insert spaces instead of moving focus off the canvas.
            e.preventDefault();
            this.takeSnapshot();
            if (this.chain.hasSelection()) {
                this.deleteSelection();
            }
            for (let i = 0; i < this.options.tabSize; i++) {
                this.chain.printableKeyPressed(' ');
            }
            this.render();
        } else if (key === 'Escape') {
            // Clear any active selection.
            e.preventDefault();
            if (this.chain.hasSelection()) {
                this.chain.clearSelection();
                this.render();
            }
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

        // Scrollbar interaction takes precedence over text positioning.
        if (this.startScrollbarDragIfHit(e.clientX - rect.left, e.clientY - rect.top)) {
            return;
        }

        const x = e.clientX - rect.left - this.options.padding;
        const y = e.clientY - rect.top - this.options.padding + this.scrollY;

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
        // Dragging the scrollbar thumb.
        if (this.isScrollbarDragging) {
            const rect = this.canvas.getBoundingClientRect();
            const m = this.getScrollbarMetrics();
            if (m) {
                this.updateScrollFromThumb(e.clientY - rect.top, m);
                this.render();
            }
            return;
        }

        if (!this.isMouseDown) return;

        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left - this.options.padding;
        const y = e.clientY - rect.top - this.options.padding + this.scrollY;

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
        // End a scrollbar drag.
        if (this.isScrollbarDragging) {
            this.isScrollbarDragging = false;
            return;
        }

        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left - this.options.padding;
        const y = e.clientY - rect.top - this.options.padding + this.scrollY;

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

    // Height of the visible content area (canvas minus top/bottom padding).
    getViewportHeight() {
        return Math.max(0, this.canvas.height - this.options.padding * 2);
    }

    // Maximum vertical scroll offset given the current content.
    getMaxScroll() {
        return Math.max(0, this.chain.contentHeight - this.getViewportHeight());
    }

    // Keep scrollY within [0, maxScroll].
    clampScroll() {
        const max = this.getMaxScroll();
        if (this.scrollY > max) this.scrollY = max;
        if (this.scrollY < 0) this.scrollY = 0;
    }

    // Adjust scrollY so the cursor's vertical extent is within the viewport.
    scrollCursorIntoView() {
        const cursor = this.chain.getItems().find(item => item instanceof CursorLink);
        if (!cursor || !cursor.computed) return;

        const viewport = this.getViewportHeight();
        const height = cursor.computed.height || this.options.defaultFontSize;
        const top = cursor.computed.posY - height;
        const bottom = cursor.computed.posY;

        if (bottom > this.scrollY + viewport) {
            this.scrollY = bottom - viewport;
        }
        if (top < this.scrollY) {
            this.scrollY = top;
        }
        this.clampScroll();
    }

    handleWheel(e) {
        if (this.getMaxScroll() <= 0) return; // nothing to scroll
        if (e.preventDefault) e.preventDefault();
        this.scrollY += e.deltaY;
        this.clampScroll();
        this.render();
    }

    // Geometry of the scrollbar in canvas (screen) coordinates, or null when
    // the content fits and no scrollbar is shown. Thumb size/position are
    // independent of scrollY except for thumbY.
    getScrollbarMetrics() {
        const maxScroll = this.getMaxScroll();
        if (maxScroll <= 0) return null;

        const width = this.options.scrollbarWidth;
        const trackX = this.canvas.width - width;
        const trackHeight = this.canvas.height;
        const viewport = this.getViewportHeight();

        const visibleRatio = Math.min(1, viewport / this.chain.contentHeight);
        const thumbHeight = Math.max(
            this.options.minScrollbarThumbHeight,
            Math.min(trackHeight, trackHeight * visibleRatio)
        );
        const thumbY = (this.scrollY / maxScroll) * (trackHeight - thumbHeight);

        return { width, trackX, trackHeight, thumbHeight, thumbY };
    }

    // Set scrollY so the thumb's top lands at (rawY - grabOffset).
    updateScrollFromThumb(rawY, metrics) {
        const travel = metrics.trackHeight - metrics.thumbHeight;
        const newThumbY = rawY - this.scrollbarGrabOffset;
        const ratio = travel > 0 ? newThumbY / travel : 0;
        this.scrollY = ratio * this.getMaxScroll();
        this.clampScroll();
    }

    // If (rawX, rawY) is on the scrollbar, begin a drag and return true.
    // A click on the track (off the thumb) jumps the thumb under the cursor.
    startScrollbarDragIfHit(rawX, rawY) {
        const m = this.getScrollbarMetrics();
        if (!m || rawX < m.trackX) return false;

        this.isScrollbarDragging = true;
        if (rawY >= m.thumbY && rawY <= m.thumbY + m.thumbHeight) {
            this.scrollbarGrabOffset = rawY - m.thumbY;
        } else {
            this.scrollbarGrabOffset = m.thumbHeight / 2;
            this.updateScrollFromThumb(rawY, m);
        }
        this.render();
        return true;
    }

    renderScrollbar() {
        const m = this.getScrollbarMetrics();
        if (!m) return;

        this.ctx.fillStyle = this.options.scrollbarTrackColor;
        this.ctx.fillRect(m.trackX, 0, m.width, m.trackHeight);

        const inset = 2;
        this.ctx.fillStyle = this.options.scrollbarThumbColor;
        this.ctx.fillRect(
            m.trackX + inset,
            m.thumbY + inset,
            m.width - inset * 2,
            m.thumbHeight - inset * 2
        );
    }

    // Move the cursor by roughly one viewport of lines. direction is -1 (up)
    // or +1 (down). Extends the selection when extendSelection is true. Also
    // shifts the viewport by a page so the gesture scrolls even when the cursor
    // started near the target edge.
    pageMove(direction, extendSelection) {
        const viewport = this.getViewportHeight();
        const cursor = this.chain.getItems().find(item => item instanceof CursorLink);
        const lineHeight = (cursor && cursor.computed && cursor.computed.lineHeight)
            || this.options.defaultFontSize * 1.5;
        const lines = Math.max(1, Math.floor(viewport / lineHeight));

        if (!extendSelection) {
            this.chain.clearSelection();
        }

        for (let i = 0; i < lines; i++) {
            if (direction < 0) {
                if (extendSelection) this.chain.shiftUpArrowPressed();
                else this.chain.upArrowPressed();
            } else {
                if (extendSelection) this.chain.shiftDownArrowPressed();
                else this.chain.downArrowPressed();
            }
        }

        this.scrollY += direction * viewport;
        this.clampScroll();
    }

    // ----- Touch support -----

    handleTouchStart(e) {
        if (!e.touches || e.touches.length !== 1) return;
        const rect = this.canvas.getBoundingClientRect();
        const rawX = e.touches[0].clientX - rect.left;
        const rawY = e.touches[0].clientY - rect.top;

        this.touchStartX = rawX;
        this.touchStartY = rawY;
        this.touchLastY = rawY;
        this.touchMoved = false;

        // A touch on the scrollbar drives it directly.
        if (this.startScrollbarDragIfHit(rawX, rawY)) {
            if (e.preventDefault) e.preventDefault();
        }
    }

    handleTouchMove(e) {
        if (!e.touches || e.touches.length !== 1) return;
        const rect = this.canvas.getBoundingClientRect();
        const rawX = e.touches[0].clientX - rect.left;
        const rawY = e.touches[0].clientY - rect.top;

        if (this.isScrollbarDragging) {
            const m = this.getScrollbarMetrics();
            if (m) {
                this.updateScrollFromThumb(rawY, m);
                this.render();
            }
            if (e.preventDefault) e.preventDefault();
            return;
        }

        const TAP_THRESHOLD = 10;
        if (Math.abs(rawY - this.touchStartY) > TAP_THRESHOLD ||
            Math.abs(rawX - this.touchStartX) > TAP_THRESHOLD) {
            this.touchMoved = true;
        }

        // Drag to pan the content (content follows the finger).
        if (this.getMaxScroll() > 0) {
            this.scrollY += this.touchLastY - rawY;
            this.clampScroll();
            this.render();
            if (e.preventDefault) e.preventDefault();
        }
        this.touchLastY = rawY;
    }

    handleTouchEnd(e) {
        if (this.isScrollbarDragging) {
            this.isScrollbarDragging = false;
            return;
        }

        // A tap (negligible movement) positions the cursor.
        if (!this.touchMoved) {
            const x = this.touchStartX - this.options.padding;
            const y = this.touchStartY - this.options.padding + this.scrollY;
            this.chain.clearSelection();
            this.chain.clicked(x, y);
            this.scrollToCursorOnNextRender = true;
            this.render();
            if (typeof this.canvas.focus === 'function') this.canvas.focus();
            if (e.preventDefault) e.preventDefault();
        }
    }

    render() {
        // Apply alignment adjustments before rendering
        this.adjustForAlignment();

        // Auto-scroll to the cursor after keyboard-driven changes (but not
        // after wheel scrolling, which leaves the flag unset).
        if (this.scrollToCursorOnNextRender) {
            this.scrollCursorIntoView();
            this.scrollToCursorOnNextRender = false;
        }
        this.clampScroll();

        // Clear canvas
        this.ctx.fillStyle = this.options.backgroundColor;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Translate for padding and current scroll offset
        this.ctx.save();
        this.ctx.translate(this.options.padding, this.options.padding - this.scrollY);

        // Render find matches first
        if (this.findMatches.length > 0) {
            this.renderFindMatches();
        }

        // Render selection highlight
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

        // Draw bullet/number markers in the left gutter of list paragraphs.
        this.renderListMarkers();

        this.ctx.restore();

        // Scrollbar is drawn in screen space, on top of the content.
        this.renderScrollbar();
    }

    renderListMarkers() {
        if (this.paragraphLists.size === 0) return;
        const items = this.chain.getItems();

        // Total paragraph count (newlines + 1) so numbering can be computed
        // for every paragraph, then look up each list paragraph's marker text.
        let totalParagraphs = 1;
        for (const item of items) {
            if (item instanceof NewlineLink) totalParagraphs++;
        }

        // Sequential numbering: consecutive 'number' paragraphs count up; any
        // non-numbered paragraph (bullet or plain) restarts the sequence.
        const markerText = new Map();
        let counter = 0;
        for (let p = 0; p < totalParagraphs; p++) {
            const type = this.paragraphLists.get(p);
            if (type === 'number') {
                counter++;
                markerText.set(p, `${counter}.`);
            } else {
                counter = 0;
                if (type === 'bullet') markerText.set(p, '•');
            }
        }

        const gap = 8;
        this.ctx.font = `${this.defaultFontProperties.size}px ${this.defaultFontProperties.family}`;
        this.ctx.fillStyle = this.defaultFontProperties.color || '#000000';

        // Draw each list paragraph's marker once, aligned to the baseline of
        // its first visual line (the first item in the paragraph carrying a Y).
        const drawn = new Set();
        let paragraphIdx = 0;
        for (const item of items) {
            if (!drawn.has(paragraphIdx) && markerText.has(paragraphIdx) &&
                !(item instanceof VirtualNewlineLink) &&
                item.computed && typeof item.computed.posY === 'number') {
                const marker = markerText.get(paragraphIdx);
                const width = this.ctx.measureText(marker).width;
                this.ctx.fillText(marker, this.LIST_INDENT - gap - width, item.computed.posY);
                drawn.add(paragraphIdx);
            }
            if (item instanceof NewlineLink) {
                paragraphIdx++;
            }
        }
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

    renderFindMatches() {
        const items = this.chain.getItems();

        for (let matchIdx = 0; matchIdx < this.findMatches.length; matchIdx++) {
            const match = this.findMatches[matchIdx];
            const isCurrent = matchIdx === this.currentMatchIndex;

            // Use different colors for current vs other matches
            this.ctx.fillStyle = isCurrent ? 'rgba(255, 165, 0, 0.5)' : 'rgba(255, 255, 0, 0.4)';

            let pos = 0;
            for (let item of items) {
                if (item instanceof TextLink) {
                    const itemStart = pos;
                    const itemEnd = pos + item.text.length;

                    if (itemEnd > match.start && itemStart < match.end) {
                        const startOffset = Math.max(0, match.start - itemStart);
                        const endOffset = Math.min(item.text.length, match.end - itemStart);

                        // Measure text positions
                        const beforeText = item.text.substring(0, startOffset);
                        const matchedText = item.text.substring(startOffset, endOffset);

                        const beforeWidth = startOffset > 0 ? item.measureText(this.ctx, beforeText).width : 0;
                        const matchWidth = item.measureText(this.ctx, matchedText).width;

                        const x = item.getPosX() + beforeWidth;
                        const y = item.getPosY() - (item.getAscent() || 0);
                        const height = (item.getAscent() || 0) + (item.getDescent() || 0);

                        this.ctx.fillRect(x, y, matchWidth, height);
                    }
                    pos += item.text.length;
                } else if (item instanceof NewlineLink) {
                    pos += 1;
                }
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

        // Measure text once (used for the highlight box and decoration lines).
        const metrics = this.ctx.measureText(textLink.text);
        const textWidth = metrics.width;

        // Draw highlight background behind the glyphs, spanning the line's
        // ascent/descent so it reads like a marker stroke.
        if (fontProps.backgroundColor) {
            const ascent = textLink.getAscent() || fontSize * 0.8;
            const descent = textLink.getDescent() || fontSize * 0.2;
            this.ctx.fillStyle = fontProps.backgroundColor;
            this.ctx.fillRect(posX, posY - ascent, textWidth, ascent + descent);
        }

        this.ctx.fillStyle = fontProps.color || '#000000';
        this.ctx.fillText(textLink.text, posX, posY);

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

    increaseFontSize() {
        const currentSize = this.chain.currentFontProperties.size;
        const newSize = Math.min(currentSize + 2, 72); // Max 72px
        this.setFontSize(newSize);
    }

    decreaseFontSize() {
        const currentSize = this.chain.currentFontProperties.size;
        const newSize = Math.max(currentSize - 2, 8); // Min 8px
        this.setFontSize(newSize);
    }

    clearFormatting() {
        if (!this.chain.hasSelection()) {
            return;
        }

        this.takeSnapshot();

        const items = this.chain.getItems();
        let pos = 0;
        const selStart = this.chain.selectionStart;
        const selEnd = this.chain.selectionEnd;

        for (let item of items) {
            if (item instanceof TextLink) {
                const itemStart = pos;
                const itemEnd = pos + item.text.length;

                // If this item overlaps with the selection, reset to default formatting
                if (itemEnd > selStart && itemStart < selEnd) {
                    const defaultProps = this.defaultFontProperties;
                    item.intrinsic.fontProperties = new FontProperties(
                        defaultProps.size,
                        defaultProps.family,
                        'normal', // weight
                        'normal', // style
                        false,    // underline
                        false,    // strikethrough
                        false,    // superscript
                        false,    // subscript
                        '#000000' // color
                    );
                }
                pos += item.text.length;
            } else if (item instanceof NewlineLink) {
                pos += 1;
            }
        }

        this.chain.recalc();
        this.render();
    }

    setLineSpacing(spacing) {
        this.chain.LINE_SPACING_MULT = spacing;
        this.chain.recalc();
        this.render();
    }

    getLineSpacing() {
        return this.chain.LINE_SPACING_MULT;
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

    // Set the highlight (background) color. Pass null to clear the highlight.
    setHighlightColor(color) {
        if (this.chain.hasSelection()) {
            this.takeSnapshot();
            this.applyFormattingToSelection('backgroundColor', () => color);
            this.render();
        } else {
            // Set for next typed text
            this.chain.currentFontProperties.backgroundColor = color;
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

    // The paragraph index containing a given flattened character position
    // (the number of real newlines strictly before that position).
    paragraphIndexAtCharPos(target) {
        const items = this.chain.getItems();
        let para = 0;
        let pos = 0;
        for (const item of items) {
            if (item instanceof TextLink) {
                pos += item.text.length;
            } else if (item instanceof NewlineLink) {
                if (pos < target) para++;
                pos += 1;
            }
        }
        return para;
    }

    // Inclusive [start, end] paragraph range covered by the selection, or the
    // single paragraph at the cursor when there is no selection.
    getParagraphRange() {
        if (this.chain.hasSelection()) {
            const selStart = this.chain.selectionStart;
            const selEnd = this.chain.selectionEnd;
            const startPara = this.paragraphIndexAtCharPos(selStart);
            // Use selEnd - 1 so a selection ending exactly at a paragraph
            // boundary does not pull in the following paragraph.
            const endPara = this.paragraphIndexAtCharPos(Math.max(selStart, selEnd - 1));
            return [startPara, endPara];
        }
        const p = this.getCurrentParagraphIndex();
        return [p, p];
    }

    // List paragraphs reduce the chain's wrap width and gain a hanging indent.
    syncParagraphIndents() {
        const indents = new Map();
        for (const [paragraphIndex] of this.paragraphLists) {
            indents.set(paragraphIndex, this.LIST_INDENT);
        }
        this.chain.paragraphIndents = indents;
    }

    // Apply (or toggle off) a list type across the current paragraph range.
    setList(type) {
        this.takeSnapshot();
        const [startPara, endPara] = this.getParagraphRange();

        // If every paragraph in the range is already this type, toggle it off.
        let allSame = true;
        for (let p = startPara; p <= endPara; p++) {
            if (this.paragraphLists.get(p) !== type) {
                allSame = false;
                break;
            }
        }

        for (let p = startPara; p <= endPara; p++) {
            if (allSame) {
                this.paragraphLists.delete(p);
            } else {
                this.paragraphLists.set(p, type);
            }
        }

        this.syncParagraphIndents();
        this.chain.recalc();
        this.render();
    }

    toggleBulletList() {
        this.setList('bullet');
    }

    toggleNumberedList() {
        this.setList('number');
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
                const indent = this.paragraphLists.has(currentParagraph) ? this.LIST_INDENT : 0;

                // Recompute this visual line's base X layout from the paragraph
                // indent. Doing this every time keeps alignment idempotent
                // across renders (offsets must not accumulate frame to frame).
                let lineWidth = indent;
                for (let j = lineStartIdx; j < i; j++) {
                    if (items[j].computed) {
                        items[j].computed.posX = lineWidth;
                    }
                    if (items[j] instanceof TextLink) {
                        lineWidth += items[j].measureText(this.ctx).width;
                    }
                }

                if (alignment === 'center' || alignment === 'right') {
                    // Center splits the free space; right pushes it all left.
                    const freeSpace = Math.max(0, this.editorWidth - lineWidth);
                    const offset = alignment === 'center' ? freeSpace / 2 : freeSpace;

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
        const selStart = this.chain.selectionStart;
        const selEnd = this.chain.selectionEnd;
        const newItems = [];
        let pos = 0;

        for (let item of items) {
            if (item instanceof TextLink) {
                const itemStart = pos;
                const itemEnd = pos + item.text.length;
                pos = itemEnd;

                // No overlap with the selection: keep the run untouched.
                if (itemEnd <= selStart || itemStart >= selEnd) {
                    newItems.push(item);
                    continue;
                }

                // The run partially (or fully) overlaps the selection. Split it
                // at the selection boundaries so formatting applies only to the
                // selected characters. recalc() re-coalesces any runs that end
                // up adjacent with matching properties.
                const fontProps = item.intrinsic.fontProperties;
                const s = Math.max(0, selStart - itemStart);
                const e = Math.min(item.text.length, selEnd - itemStart);

                // Unselected head, if any.
                if (s > 0) {
                    newItems.push(new TextLink(item.text.substring(0, s), fontProps.clone()));
                }

                // Selected middle: apply the formatting change.
                const selectedProps = fontProps.clone();
                selectedProps[property] = valueFn(selectedProps[property]);
                newItems.push(new TextLink(item.text.substring(s, e), selectedProps));

                // Unselected tail, if any.
                if (e < item.text.length) {
                    newItems.push(new TextLink(item.text.substring(e), fontProps.clone()));
                }
            } else {
                if (item instanceof NewlineLink) {
                    pos += 1;
                }
                newItems.push(item);
            }
        }

        this.chain.items = newItems;
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

    // Serialize the full document (text, per-run formatting, and paragraph
    // alignment) to a plain object suitable for JSON.stringify. Cursor and
    // wrap (virtual newline) state are layout artifacts and are not included;
    // they are recomputed on load.
    toJSON() {
        const items = this.chain.getItems();
        const content = [];
        for (let item of items) {
            if (item instanceof TextLink) {
                content.push({
                    type: 'text',
                    text: item.text,
                    font: item.intrinsic.fontProperties.toObject()
                });
            } else if (item instanceof NewlineLink) {
                content.push({ type: 'newline' });
            }
        }

        const alignments = {};
        for (let [paragraphIndex, alignment] of this.paragraphAlignments) {
            alignments[paragraphIndex] = alignment;
        }

        const lists = {};
        for (let [paragraphIndex, type] of this.paragraphLists) {
            lists[paragraphIndex] = type;
        }

        return {
            version: 1,
            content,
            alignments,
            lists
        };
    }

    // Rebuild the document from an object produced by toJSON() (or its JSON
    // string form). Replaces the current document contents and resets undo
    // history so the loaded document is the new baseline.
    fromJSON(data) {
        if (typeof data === 'string') {
            data = JSON.parse(data);
        }
        if (!data || !Array.isArray(data.content)) {
            throw new Error('fromJSON: invalid document data');
        }

        // Rebuild the chain directly from the serialized runs, then place the
        // cursor at the end of the document.
        const items = [];
        for (let entry of data.content) {
            if (entry.type === 'text') {
                items.push(new TextLink(entry.text, FontProperties.fromObject(entry.font)));
            } else if (entry.type === 'newline') {
                items.push(new NewlineLink());
            }
        }
        items.push(new CursorLink());
        this.chain.items = items;

        // Restore paragraph alignments (keys are stringified in JSON objects).
        this.paragraphAlignments = new Map();
        if (data.alignments) {
            for (let key of Object.keys(data.alignments)) {
                this.paragraphAlignments.set(Number(key), data.alignments[key]);
            }
        }

        // Restore paragraph list types and the matching wrap indents.
        this.paragraphLists = new Map();
        if (data.lists) {
            for (let key of Object.keys(data.lists)) {
                this.paragraphLists.set(Number(key), data.lists[key]);
            }
        }
        this.syncParagraphIndents();

        // The loaded document becomes the new baseline.
        this.history = [];
        this.historyIndex = -1;

        this.chain.clearSelection();
        this.chain.recalc();
        this.render();
    }

    // Find/Replace functionality
    find(query, caseSensitive = false) {
        this.findQuery = query;
        this.caseSensitive = caseSensitive;
        this.findMatches = [];
        this.currentMatchIndex = -1;

        if (!query) {
            this.render();
            return { count: 0, current: -1 };
        }

        const text = this.getText();
        const searchText = caseSensitive ? text : text.toLowerCase();
        const searchQuery = caseSensitive ? query : query.toLowerCase();

        let index = 0;
        while (index < searchText.length) {
            const foundIndex = searchText.indexOf(searchQuery, index);
            if (foundIndex === -1) break;

            this.findMatches.push({
                start: foundIndex,
                end: foundIndex + query.length
            });

            index = foundIndex + 1;
        }

        if (this.findMatches.length > 0) {
            this.currentMatchIndex = 0;
            this.selectMatch(this.currentMatchIndex);
        }

        this.render();
        return { count: this.findMatches.length, current: this.currentMatchIndex + 1 };
    }

    findNext() {
        if (this.findMatches.length === 0) return;

        this.currentMatchIndex = (this.currentMatchIndex + 1) % this.findMatches.length;
        this.selectMatch(this.currentMatchIndex);
        this.render();
        return { count: this.findMatches.length, current: this.currentMatchIndex + 1 };
    }

    findPrevious() {
        if (this.findMatches.length === 0) return;

        this.currentMatchIndex = this.currentMatchIndex - 1;
        if (this.currentMatchIndex < 0) {
            this.currentMatchIndex = this.findMatches.length - 1;
        }
        this.selectMatch(this.currentMatchIndex);
        this.render();
        return { count: this.findMatches.length, current: this.currentMatchIndex + 1 };
    }

    selectMatch(matchIndex) {
        if (matchIndex < 0 || matchIndex >= this.findMatches.length) return;

        const match = this.findMatches[matchIndex];

        // Convert character position to item position
        const items = this.chain.getItems();
        let charPos = 0;
        let startItemIdx = -1, startOffset = 0;
        let endItemIdx = -1, endOffset = 0;

        for (let i = 0; i < items.length; i++) {
            if (items[i] instanceof TextLink) {
                const itemStart = charPos;
                const itemEnd = charPos + items[i].text.length;

                if (startItemIdx === -1 && match.start >= itemStart && match.start < itemEnd) {
                    startItemIdx = i;
                    startOffset = match.start - itemStart;
                }

                if (match.end > itemStart && match.end <= itemEnd) {
                    endItemIdx = i;
                    endOffset = match.end - itemStart;
                    break;
                }

                charPos += items[i].text.length;
            } else if (items[i] instanceof NewlineLink) {
                charPos += 1;
            }
        }

        if (startItemIdx !== -1 && endItemIdx !== -1) {
            this.chain.setSelection(startItemIdx, startOffset, endItemIdx, endOffset);
        }
    }

    replace(replacement) {
        if (this.currentMatchIndex < 0 || this.currentMatchIndex >= this.findMatches.length) {
            return;
        }

        this.takeSnapshot();

        const match = this.findMatches[this.currentMatchIndex];

        // Delete the matched text and insert replacement
        const text = this.getText();
        const newText = text.substring(0, match.start) + replacement + text.substring(match.end);

        this.setText(newText);

        // Recalculate matches with new text
        const lengthDiff = replacement.length - (match.end - match.start);

        // Update subsequent match positions
        for (let i = this.currentMatchIndex + 1; i < this.findMatches.length; i++) {
            this.findMatches[i].start += lengthDiff;
            this.findMatches[i].end += lengthDiff;
        }

        // Remove the replaced match
        this.findMatches.splice(this.currentMatchIndex, 1);

        // Move to next match or stay at current position
        if (this.currentMatchIndex >= this.findMatches.length) {
            this.currentMatchIndex = this.findMatches.length - 1;
        }

        if (this.findMatches.length > 0 && this.currentMatchIndex >= 0) {
            this.selectMatch(this.currentMatchIndex);
        } else {
            this.currentMatchIndex = -1;
        }

        this.render();
        return { count: this.findMatches.length, current: this.currentMatchIndex + 1 };
    }

    replaceAll(replacement) {
        if (this.findMatches.length === 0) {
            return { count: 0, replaced: 0 };
        }

        this.takeSnapshot();

        const replacedCount = this.findMatches.length;
        let text = this.getText();

        // Replace from end to beginning to maintain indices
        for (let i = this.findMatches.length - 1; i >= 0; i--) {
            const match = this.findMatches[i];
            text = text.substring(0, match.start) + replacement + text.substring(match.end);
        }

        this.setText(text);
        this.findMatches = [];
        this.currentMatchIndex = -1;
        this.render();

        return { count: 0, replaced: replacedCount };
    }

    closeFindReplace() {
        this.findMatches = [];
        this.currentMatchIndex = -1;
        this.findQuery = '';
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
        this.clampScroll();
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
        this.canvas.removeEventListener('wheel', this.boundHandleWheel);
        this.canvas.removeEventListener('touchstart', this.boundHandleTouchStart);
        this.canvas.removeEventListener('touchmove', this.boundHandleTouchMove);
        this.canvas.removeEventListener('touchend', this.boundHandleTouchEnd);
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

