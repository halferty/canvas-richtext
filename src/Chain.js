import { TextLink, CursorLink, VirtualNewlineLink, NewlineLink, HorizontalRuleLink, ImageLink } from './ChainLink.js';

/**
 * Chain - Manages the linked list of text, cursor, and newline elements
 */
export class Chain {
    LINE_SPACING_MULT = 1.5;

    constructor(widthPixels, ctx, defaultFontProperties) {
        this.items = [new CursorLink()];
        this.ctx = ctx;
        this.widthPixels = widthPixels;
        this.currentFontProperties = defaultFontProperties;
        this.selectionStart = null;
        this.selectionEnd = null;
        // Fixed end of a keyboard (shift+arrow) selection. The cursor marks
        // the moving "focus" end; this marks the stationary "anchor" end.
        this.selectionAnchor = null;
        // Total vertical extent of the laid-out content (set by recalc).
        this.contentHeight = 0;
        // Per-paragraph left indent in pixels (keyed by paragraph index).
        // Populated by the editor for list paragraphs so wrapping and the
        // hanging indent are computed against the reduced content width.
        this.paragraphIndents = new Map();
        // Vertical margin above/below a block image, in pixels.
        this.IMAGE_VMARGIN = 8;
    }

    // Display size of a block image, scaled down to fit the content width
    // while preserving aspect ratio.
    imageDrawSize(image) {
        const iw = image.intrinsic.width || 1;
        const ih = image.intrinsic.height || 1;
        if (iw <= this.widthPixels) {
            return { drawWidth: iw, drawHeight: ih };
        }
        const scale = this.widthPixels / iw;
        return { drawWidth: this.widthPixels, drawHeight: ih * scale };
    }

    // Left indent (px) for a given paragraph index; 0 when not indented.
    getParagraphIndent(paragraphIndex) {
        return this.paragraphIndents.get(paragraphIndex) || 0;
    }

    printItems() {
        let s = "";
        let colors = [];
        this.items.forEach(function (item) {
            const posX = (typeof item.computed.posX !== 'undefined' && item.computed.posX !== null) ? item.computed.posX.toFixed(2) : 'null';
            const posY = (typeof item.computed.posY !== 'undefined' && item.computed.posY !== null) ? item.computed.posY.toFixed(2) : 'null';
            const coords = posX + ',' + posY;
            if (item instanceof TextLink) {
                s += '%c<t|' + coords + '|' + item.intrinsic.fontProperties.size.toFixed(0) + '>%c' + item.text + '%c</t>';
                colors.push('color: #555500');
                colors.push('color: #000000');
                colors.push('color: #555500');
            } else if (item instanceof VirtualNewlineLink) {
                s += '%c<vn>';
                colors.push('color: #0000ff');
            } else if (item instanceof NewlineLink) {
                s += '%c<\\n>';
                colors.push('color: #00ff00');
            } else if (item instanceof CursorLink) {
                s += '%c<c|' + coords + '>';
                colors.push('color: #ff0000');
            }
        });
    }

    getItems() {
        return this.items;
    }

    cursorIdx() {
        for (let i = 0; i < this.items.length; i++) {
            if (this.items[i] instanceof CursorLink) {
                return i;
            }
        }
        // Cursor not found - dump state for debugging
        console.error("CursorLink not found! Chain state:");
        console.error("Total items:", this.items.length);
        console.error("Chain dump:", this.dumpChainState());
        this.printItems();
        throw new Error("CursorLink not found! Check console for chain state dump.");
    }

    // Dump chain state as JSON for debugging
    dumpChainState() {
        return this.items.map((item, idx) => {
            let type = 'Unknown';
            if (item instanceof TextLink) type = 'TextLink';
            else if (item instanceof CursorLink) type = 'CursorLink';
            else if (item instanceof NewlineLink) type = 'NewlineLink';
            else if (item instanceof VirtualNewlineLink) type = 'VirtualNewlineLink';
            
            return {
                index: idx,
                type: type,
                text: item instanceof TextLink ? item.text : undefined,
                posX: item.computed?.posX,
                posY: item.computed?.posY,
                fontSize: item instanceof TextLink ? item.intrinsic.fontProperties?.size : undefined
            };
        });
    }

    getCursor() {
        return this.items[this.cursorIdx()];
    }

    clearComputed() {
        for (let i = 0; i < this.items.length; i++) {
            this.items[i].computed = {};
        }
    }

    removeVirtualNewlines() {
        for (let i = 0; i < this.items.length; i++) {
            if (this.items[i] instanceof VirtualNewlineLink) {
                this.items.splice(i, 1);
                i--;
            }
        }
    }

    joinAdjacentTextLinks() {
        for (let i = 0; i < this.items.length; i++) {
            if (this.items[i] instanceof TextLink) {
                if (i + 1 < this.items.length) {
                    if (this.items[i + 1] instanceof TextLink) {
                        if (this.items[i].doFontPropertiesMatch(this.items[i + 1])) {
                            this.items[i].text += this.items[i + 1].text;
                            this.items.splice(i + 1, 1);
                            i--;
                        }
                    }
                }
            }
        }
    }

    removeEmptyTextLinks() {
        for (let i = 0; i < this.items.length; i++) {
            if (this.items[i] instanceof TextLink && this.items[i].text.length === 0) {
                this.items.splice(i, 1);
                i--;
            }
        }
    }

    chunkTextLinks() {
        for (let i = 0; i < this.items.length; i++) {
            if (this.items[i] instanceof TextLink && this.items[i].text.match(/\s/) && this.items[i].text.match(/\S/)) {
                let text = this.items[i].text;
                let split = [];
                let inside = "none";
                for (let j = 0; j <= text.length; j++) {
                    if (inside === 'none') {
                        if (text[j].match(/\s/)) {
                            inside = 'whitespace';
                        } else {
                            inside = 'non-whitespace';
                        }
                    } else if (inside === 'whitespace') {
                        if (j === text.length || text[j].match(/\S/)) {
                            split.push(text.substring(0, j));
                            text = text.substring(j);
                            j = 0;
                            inside = 'non-whitespace';
                        }
                    } else if (inside === 'non-whitespace') {
                        if (j === text.length || text[j].match(/\s/)) {
                            split.push(text.substring(0, j));
                            text = text.substring(j);
                            j = 0;
                            inside = 'whitespace';
                        }
                    }
                }
                if (split.length > 1) {
                    this.items[i].text = split[0];
                    for (let j = 1; j < split.length; j++) {
                        this.items.splice(i + j, 0, new TextLink(split[j], this.items[i].intrinsic.fontProperties.clone()));
                    }
                }
            }
        }
    }

    recalcXPositions() {
        // Track the current paragraph so list paragraphs lay out (and wrap)
        // against their indented left margin. The actual posX values are
        // recomputed again by the editor's alignment pass; what matters here
        // is that wrap points are chosen for the reduced available width.
        let paragraphIdx = 0;
        let indent = this.getParagraphIndent(paragraphIdx);
        let posX = indent;
        for (let i = 0; i < this.items.length; i++) {
            if (this.items[i] instanceof TextLink) {
                const width = this.items[i].measureText(this.ctx).width;
                if (width > this.widthPixels) {
                    let isFirstTextLinkOnLine = true;
                    for (let j = i - 1; j >= 0; j--) {
                        if (this.items[j] instanceof TextLink) {
                            isFirstTextLinkOnLine = false;
                            break;
                        } else if ((this.items[j] instanceof NewlineLink) || (this.items[j] instanceof VirtualNewlineLink)) {
                            break;
                        }
                    }
                    if (!isFirstTextLinkOnLine) {
                        this.items.splice(i, 0, new VirtualNewlineLink());
                        i++;
                        posX = indent;
                    }
                    let newItems = [];
                    let remaining = this.items[i].text;
                    while (remaining.length > 0) {
                        const width = this.items[i].measureText(this.ctx, remaining).width;
                        if (width > this.widthPixels) {
                            let splitIdx = 0;
                            for (splitIdx = remaining.length - 1; splitIdx >= 0; splitIdx--) {
                                const textBounds = this.items[i].measureText(this.ctx, remaining.substring(0, splitIdx));
                                if (textBounds.width <= this.widthPixels) {
                                    const newTextLink = new TextLink(remaining.substring(0, splitIdx), this.items[i].intrinsic.fontProperties.clone());
                                    newTextLink.computed = {
                                        ...newTextLink.computed,
                                        posX
                                    };
                                    newItems.push(newTextLink);
                                    remaining = remaining.substring(splitIdx);
                                    break;
                                }
                            }
                            if (splitIdx === 0) {
                                if (remaining.length > 0 && newItems[newItems.length - 1].text.length > 0) {
                                    newItems[newItems.length - 1].text += remaining.substring(0, 1);
                                    remaining = remaining.substring(1);
                                } else {
                                    remaining = remaining.substring(1);
                                }
                            }
                            newItems.push(new VirtualNewlineLink());
                        } else {
                            const newTextLink = new TextLink(remaining, this.items[i].intrinsic.fontProperties);
                            newTextLink.computed = {
                                ...newTextLink.computed,
                                posX
                            };
                            posX += width;
                            newItems.push(newTextLink);
                            remaining = "";
                        }
                    }
                    this.items.splice(i, 1, ...newItems);
                    i += newItems.length - 1;
                } else if (posX + width > this.widthPixels) {
                    posX = indent;
                    this.items[i].computed = {
                        ...this.items[i].computed,
                        posX
                    };
                    this.items.splice(i, 0, new VirtualNewlineLink());
                    posX += width;
                    i++;
                } else {
                    this.items[i].computed = {
                        ...this.items[i].computed,
                        posX
                    };
                    posX += width;
                }
            } else if (this.items[i] instanceof NewlineLink) {
                // A real newline starts the next paragraph at its own indent.
                paragraphIdx++;
                indent = this.getParagraphIndent(paragraphIdx);
                posX = indent;
                this.items[i].computed = {
                    ...this.items[i].computed,
                    posX
                };
            } else if (this.items[i] instanceof CursorLink) {
                this.items[i].computed = {
                    ...this.items[i].computed,
                    posX
                };
            }
        }
    }

    recalcYPositions() {
        let posY = 0;
        let currentLineNum = 0;
        let currentLineStartIdx = 0;
        let currentLineMaxFontSize = 0;
        let currentLineMaxAscent = 0;
        let currentLineMaxDescent = 0;
        
        for (let i = 0; i < this.items.length + 1; i++) {
            // Calculate base line height
            let baseHeight = Math.max(currentLineMaxAscent + currentLineMaxDescent, currentLineMaxFontSize);
            
            // Ensure empty lines have a minimum height (use current font size)
            if (baseHeight === 0) {
                baseHeight = this.currentFontProperties.size;
            }
            
            // Apply consistent line spacing to all lines
            let lineHeight = baseHeight * this.LINE_SPACING_MULT;

            // A block image owns its line; size that line to the image.
            const isImageLine = i < this.items.length && this.items[i] instanceof ImageLink;
            if (isImageLine) {
                const { drawHeight } = this.imageDrawSize(this.items[i]);
                lineHeight = drawHeight + this.IMAGE_VMARGIN * 2;
            }

            for (let j = currentLineStartIdx; j < i; j++) {
                this.items[j].computed.lineHeight = lineHeight;
            }

            if ((this.items[i] instanceof VirtualNewlineLink) || (this.items[i] instanceof NewlineLink) || (i === this.items.length)) {
                posY += lineHeight;
                currentLineStartIdx = i + 1;
                currentLineMaxAscent = 0;
                currentLineMaxDescent = 0;
                currentLineMaxFontSize = 0;
                currentLineNum++;
                if (i !== this.items.length) {
                    this.items[i].computed = {
                        ...this.items[i].computed,
                        posY
                    };
                    if (isImageLine) {
                        // posY is the bottom of the line; x follows the image's
                        // justification within the content width.
                        const { drawWidth, drawHeight } = this.imageDrawSize(this.items[i]);
                        const align = this.items[i].intrinsic.align || 'center';
                        let x;
                        if (align === 'left') {
                            x = 0;
                        } else if (align === 'right') {
                            x = Math.max(0, this.widthPixels - drawWidth);
                        } else {
                            x = Math.max(0, (this.widthPixels - drawWidth) / 2);
                        }
                        this.items[i].computed.box = {
                            x,
                            y: posY - drawHeight - this.IMAGE_VMARGIN,
                            w: drawWidth,
                            h: drawHeight
                        };
                    }
                }
            } else if (this.items[i] instanceof TextLink) {
                const measured = this.items[i].measureText(this.ctx);
                const ascent = measured.actualBoundingBoxAscent;
                const descent = measured.actualBoundingBoxDescent;
                currentLineMaxAscent = Math.max(currentLineMaxAscent, ascent);
                currentLineMaxDescent = Math.max(currentLineMaxDescent, descent);
                currentLineMaxFontSize = Math.max(currentLineMaxFontSize, this.items[i].intrinsic.fontProperties.size);
                this.items[i].computed = {
                    ...this.items[i].computed,
                    posY,
                    ascent,
                    descent
                };
            } else if (this.items[i] instanceof CursorLink) {
                let cursorHeight = 0;
                let foundTextLink = false;
                for (let j = i - 1; j >= 0; j--) {
                    if (this.items[j] instanceof TextLink) {
                        const measured = this.items[j].measureText(this.ctx);
                        const ascent = measured.actualBoundingBoxAscent;
                        const descent = measured.actualBoundingBoxDescent;
                        currentLineMaxAscent = Math.max(currentLineMaxAscent, ascent);
                        currentLineMaxDescent = Math.max(currentLineMaxDescent, descent);
                        currentLineMaxFontSize = Math.max(currentLineMaxFontSize, this.items[j].intrinsic.fontProperties.size);
                        foundTextLink = true;
                        cursorHeight = Math.max(ascent + descent, this.items[j].intrinsic.fontProperties.size);
                        break;
                    } else if (this.items[j] instanceof NewlineLink) {
                        foundTextLink = true;
                        cursorHeight = lineHeight;
                        break;
                    }
                }
                if (!foundTextLink) {
                    cursorHeight = this.currentFontProperties.size;
                }
                this.items[i].computed = {
                    ...this.items[i].computed,
                    posY,
                    height: cursorHeight,
                    lineHeight
                };
            }
        }

        // Total vertical extent of the content (bottom of the last line),
        // used by the editor to bound scrolling.
        this.contentHeight = posY;
    }

    recalc() {
        this.clearComputed();
        this.removeVirtualNewlines();
        this.joinAdjacentTextLinks();
        this.removeEmptyTextLinks();
        
        // Safety check: ensure cursor still exists
        this.ensureCursorExists();
        
        this.chunkTextLinks();
        this.recalcXPositions();
        this.recalcYPositions();
        // this.printItems(); // Commented out for testing - causes issues with mock contexts
    }

    // Safety check to ensure a cursor always exists
    ensureCursorExists() {
        let hasCursor = false;
        for (let i = 0; i < this.items.length; i++) {
            if (this.items[i] instanceof CursorLink) {
                hasCursor = true;
                break;
            }
        }
        if (!hasCursor) {
            console.warn("Cursor was missing! Adding cursor to end of chain.");
            this.items.push(new CursorLink());
        }
    }

    printableKeyPressed(char) {
        if (this.cursorIdx() > 0) {
            for (let i = this.cursorIdx() - 1; i >= 0; i--) {
                if (this.items[i] instanceof TextLink) {
                    if (this.items[i].intrinsic.fontProperties.doPropertiesMatch(this.currentFontProperties)) {
                        this.items[i].text += char;
                    } else {
                        this.items.splice(this.cursorIdx(), 0, new TextLink(char, this.currentFontProperties.clone()));
                    }
                    break;
                } else if (this.items[i] instanceof VirtualNewlineLink || this.items[i] instanceof NewlineLink) {
                    this.items.splice(this.cursorIdx(), 0, new TextLink(char, this.currentFontProperties.clone()));
                    break;
                } else if (this.items[i] instanceof CursorLink) {
                    throw new Error("CursorLink found while searching before cursorIdx!");
                }
            }
        } else {
            this.items.unshift(new TextLink(char, this.currentFontProperties.clone()));
        }
        this.recalc();
    }

    backspacePressed() {
        if (this.cursorIdx() > 0) {
            for (let i = this.cursorIdx() - 1; i >= 0; i--) {
                if (this.items[i] instanceof TextLink && this.items[i].text.length > 0) {
                    this.items[i].text = this.items[i].text.substring(0, this.items[i].text.length - 1);
                    break;
                } else if (this.items[i] instanceof NewlineLink) {
                    this.items.splice(i, 1);
                    break;
                } else if (this.items[i] instanceof CursorLink) {
                    throw new Error("CursorLink found while searching before cursorIdx!");
                }
            }
        }
        this.recalc();
    }

    // Delete the characters in the flattened range [startPos, endPos) and
    // leave the cursor at startPos. Used by word/forward deletion.
    deleteCharRange(startPos, endPos) {
        if (startPos > endPos) {
            [startPos, endPos] = [endPos, startPos];
        }
        const total = this.getTotalChars();
        startPos = Math.max(0, startPos);
        endPos = Math.min(total, endPos);
        if (startPos === endPos) return;

        // Remove the cursor; it is reinserted at startPos afterwards.
        this.items.splice(this.cursorIdx(), 1);

        let pos = 0;
        const itemsToRemove = [];
        for (let i = 0; i < this.items.length; i++) {
            const item = this.items[i];
            if (item instanceof TextLink) {
                const itemStart = pos;
                const itemEnd = pos + item.text.length;
                if (itemEnd > startPos && itemStart < endPos) {
                    const s = Math.max(0, startPos - itemStart);
                    const e = Math.min(item.text.length, endPos - itemStart);
                    item.text = item.text.substring(0, s) + item.text.substring(e);
                    if (item.text.length === 0) {
                        itemsToRemove.push(i);
                    }
                }
                pos = itemEnd;
            } else if (item instanceof NewlineLink) {
                if (pos >= startPos && pos < endPos) {
                    itemsToRemove.push(i);
                }
                pos += 1;
            }
        }

        // Remove emptied/selected items in reverse order to keep indices valid.
        for (let i = itemsToRemove.length - 1; i >= 0; i--) {
            this.items.splice(itemsToRemove[i], 1);
        }

        // Reinsert the cursor at the start of the deleted range. Nothing before
        // startPos was removed, so its position is unchanged.
        this.items.unshift(new CursorLink());
        this.moveCursorToCharPosition(startPos);
    }

    // Forward delete (the Delete key): remove the character after the cursor.
    deleteForward() {
        const pos = this.getCursorCharPosition();
        this.deleteCharRange(pos, pos + 1);
    }

    // Ctrl+Backspace: delete from the previous word boundary to the cursor.
    deleteWordLeft() {
        const pos = this.getCursorCharPosition();
        this.deleteCharRange(this.prevWordBoundary(pos), pos);
    }

    // Ctrl+Delete: delete from the cursor to the next word boundary.
    deleteWordRight() {
        const pos = this.getCursorCharPosition();
        this.deleteCharRange(pos, this.nextWordBoundary(pos));
    }

    // Move cursor to a specific character position
    moveCursorToCharPosition(charPos) {
        const { itemIdx, charOffset } = this.getItemFromCharPosition(charPos);
        const cursorIdx = this.cursorIdx();
        
        // Remove current cursor
        this.items.splice(cursorIdx, 1);
        
        // Adjust index if cursor was before target position
        const adjustedIdx = (cursorIdx < itemIdx) ? itemIdx - 1 : itemIdx;
        
        if (adjustedIdx >= this.items.length) {
            // Position at end
            this.items.push(new CursorLink());
        } else if (this.items[adjustedIdx] instanceof TextLink && charOffset > 0) {
            // Split text link at the character offset
            const textLink = this.items[adjustedIdx];
            const text = textLink.text;
            const fontProps = textLink.intrinsic.fontProperties.clone();
            
            textLink.text = text.substring(0, charOffset);
            this.items.splice(adjustedIdx + 1, 0, new CursorLink());
            if (charOffset < text.length) {
                this.items.splice(adjustedIdx + 2, 0, new TextLink(text.substring(charOffset), fontProps));
            }
        } else {
            // Position before the item
            this.items.splice(adjustedIdx, 0, new CursorLink());
        }
        
        this.recalc();
    }

    leftArrowPressed() {
        // Clear target X when moving horizontally
        this.targetCursorX = undefined;

        // If there's a selection, move to the start of it
        if (this.hasSelection()) {
            this.moveCursorToCharPosition(this.selectionStart);
            this.clearSelection();
            return;
        }
        this.clearSelection();
        this.moveCursorLeftOneChar();
    }

    // Core "move cursor one character to the left" logic, shared by
    // leftArrowPressed and shiftLeftArrowPressed.
    moveCursorLeftOneChar() {
        this.targetCursorX = undefined;
        if (this.cursorIdx() > 0) {
            for (let i = this.cursorIdx() - 1; i >= 0; i--) {
                if (this.items[i] instanceof TextLink) {
                    if (this.items[i].text.length === 1) {
                        this.items.splice(this.cursorIdx(), 1);
                        this.items.splice(i, 0, new CursorLink());
                    } else {
                        const cursorIdx = this.cursorIdx();
                        this.items.splice(cursorIdx, 1);
                        const text = this.items[i].text;
                        this.items[i].text = text.substring(0, text.length - 1);
                        this.items.splice(i + 1, 0, new CursorLink());
                        this.items.splice(i + 2, 0, new TextLink(text.substring(text.length - 1), this.items[i].intrinsic.fontProperties.clone()));
                    }
                    break;
                } else if (this.items[i] instanceof NewlineLink) {
                    this.items.splice(this.cursorIdx(), 1);
                    this.items.splice(i, 0, new CursorLink());
                    break;
                } else if (this.items[i] instanceof CursorLink) {
                    throw new Error("CursorLink found while searching before cursorIdx!");
                }
            }
        }
        this.recalc();
    }

    rightArrowPressed() {
        // Clear target X when moving horizontally
        this.targetCursorX = undefined;

        // If there's a selection, move to the end of it
        if (this.hasSelection()) {
            this.moveCursorToCharPosition(this.selectionEnd);
            this.clearSelection();
            return;
        }
        this.clearSelection();
        this.moveCursorRightOneChar();
    }

    // Core "move cursor one character to the right" logic, shared by
    // rightArrowPressed and shiftRightArrowPressed.
    moveCursorRightOneChar() {
        this.targetCursorX = undefined;
        if (this.cursorIdx() < this.items.length - 1) {
            for (let i = this.cursorIdx() + 1; i < this.items.length; i++) {
                if (this.items[i] instanceof TextLink) {
                    const cursorIdx = this.cursorIdx();
                    const textLink = this.items[i];
                    this.items.splice(cursorIdx, 1);
                    // Adjust index if cursor was before this text link
                    const adjustedIdx = (cursorIdx < i) ? i - 1 : i;
                    
                    if (textLink.text.length === 1) {
                        // Single character - just move cursor after it
                        this.items.splice(adjustedIdx + 1, 0, new CursorLink());
                    } else {
                        // Multi-character - split off first character
                        const text = textLink.text;
                        const fontProps = textLink.intrinsic.fontProperties.clone();
                        this.items[adjustedIdx].text = text.substring(1);
                        this.items.splice(adjustedIdx, 0, new TextLink(text.substring(0, 1), fontProps));
                        this.items.splice(adjustedIdx + 1, 0, new CursorLink());
                    }
                    break;
                } else if (this.items[i] instanceof NewlineLink) {
                    const cursorIdx = this.cursorIdx();
                    this.items.splice(cursorIdx, 1);
                    // Adjust index if cursor was before the newline
                    const adjustedIdx = (cursorIdx < i) ? i - 1 : i;
                    this.items.splice(adjustedIdx + 1, 0, new CursorLink());
                    break;
                } else if (this.items[i] instanceof CursorLink) {
                    throw new Error("CursorLink found while searching after cursorIdx!");
                }
            }
        }
        this.recalc();
    }

    upArrowPressed() {
        const cursorIdx = this.cursorIdx();
        const cursor = this.items[cursorIdx];
        
        // Get current cursor X position (or use stored targetX if available)
        const currentX = this.targetCursorX !== undefined ? this.targetCursorX : cursor.computed.posX;
        const currentY = cursor.computed.posY;
        
        // Store the X position for future up/down movements
        this.targetCursorX = currentX;
        
        // Find the previous line by looking for items with lower Y positions
        let targetY = null;
        for (let i = cursorIdx - 1; i >= 0; i--) {
            const item = this.items[i];
            if (item.computed && item.computed.posY !== undefined && item.computed.posY < currentY) {
                targetY = item.computed.posY;
                break;
            }
        }
        
        if (targetY === null) {
            // Already on first line, move to beginning
            this.items.splice(cursorIdx, 1);
            this.items.unshift(new CursorLink());
            this.recalc();
            return;
        }
        
        // Find the best position on the target line (closest X to currentX)
        this.clicked(currentX, targetY);
    }

    downArrowPressed() {
        const cursorIdx = this.cursorIdx();
        const cursor = this.items[cursorIdx];
        
        // Get current cursor X position (or use stored targetX if available)
        const currentX = this.targetCursorX !== undefined ? this.targetCursorX : cursor.computed.posX;
        const currentY = cursor.computed.posY;
        
        // Store the X position for future up/down movements
        this.targetCursorX = currentX;
        
        // Find the next line by looking for items with higher Y positions
        let targetY = null;
        for (let i = cursorIdx + 1; i < this.items.length; i++) {
            const item = this.items[i];
            if (item.computed && item.computed.posY !== undefined && item.computed.posY > currentY) {
                targetY = item.computed.posY;
                break;
            }
        }
        
        if (targetY === null) {
            // Already on last line, move to end
            this.items.splice(cursorIdx, 1);
            this.items.push(new CursorLink());
            this.recalc();
            return;
        }

        // Find the best position on the target line (closest X to currentX)
        this.clicked(currentX, targetY);
    }

    // Character position of the cursor in the flattened text.
    getCursorCharPosition() {
        return this.getCharPosition(this.cursorIdx(), 0);
    }

    // Ensure a selection anchor exists, defaulting to the current cursor
    // position. Called when a shift+arrow gesture begins.
    beginSelectionIfNeeded() {
        if (this.selectionAnchor === null) {
            this.selectionAnchor = this.getCursorCharPosition();
        }
    }

    // After the cursor has moved, recompute the selection range from the
    // fixed anchor to the new cursor (focus) position.
    updateSelectionFromAnchor() {
        const focus = this.getCursorCharPosition();
        if (focus === this.selectionAnchor) {
            // Collapsed back onto the anchor: no visible selection, but keep
            // the anchor so further shift+arrows continue from here.
            this.selectionStart = null;
            this.selectionEnd = null;
        } else {
            this.selectionStart = Math.min(this.selectionAnchor, focus);
            this.selectionEnd = Math.max(this.selectionAnchor, focus);
        }
    }

    shiftLeftArrowPressed() {
        this.beginSelectionIfNeeded();
        this.moveCursorLeftOneChar();
        this.updateSelectionFromAnchor();
    }

    shiftRightArrowPressed() {
        this.beginSelectionIfNeeded();
        this.moveCursorRightOneChar();
        this.updateSelectionFromAnchor();
    }

    shiftUpArrowPressed() {
        this.beginSelectionIfNeeded();
        this.upArrowPressed();
        this.updateSelectionFromAnchor();
    }

    shiftDownArrowPressed() {
        this.beginSelectionIfNeeded();
        this.downArrowPressed();
        this.updateSelectionFromAnchor();
    }

    // ----- Home / End (visual line) -----

    // Character positions of the start and end of the visual line the cursor
    // is currently on. Visual lines are delimited by hard newlines and by the
    // virtual newlines inserted by word wrapping.
    getLineBounds() {
        const cursorIdx = this.cursorIdx();

        let startIdx = 0;
        for (let i = cursorIdx - 1; i >= 0; i--) {
            if (this.items[i] instanceof NewlineLink || this.items[i] instanceof VirtualNewlineLink) {
                startIdx = i + 1;
                break;
            }
        }

        let endIdx = this.items.length;
        for (let i = cursorIdx + 1; i < this.items.length; i++) {
            if (this.items[i] instanceof NewlineLink || this.items[i] instanceof VirtualNewlineLink) {
                endIdx = i;
                break;
            }
        }

        return {
            startPos: this.getCharPosition(startIdx, 0),
            endPos: this.getCharPosition(endIdx, 0)
        };
    }

    homePressed() {
        this.targetCursorX = undefined;
        this.clearSelection();
        this.moveCursorToCharPosition(this.getLineBounds().startPos);
    }

    endPressed() {
        this.targetCursorX = undefined;
        this.clearSelection();
        this.moveCursorToCharPosition(this.getLineBounds().endPos);
    }

    shiftHomePressed() {
        this.targetCursorX = undefined;
        this.beginSelectionIfNeeded();
        this.moveCursorToCharPosition(this.getLineBounds().startPos);
        this.updateSelectionFromAnchor();
    }

    shiftEndPressed() {
        this.targetCursorX = undefined;
        this.beginSelectionIfNeeded();
        this.moveCursorToCharPosition(this.getLineBounds().endPos);
        this.updateSelectionFromAnchor();
    }

    // ----- Document start / end (Ctrl+Home / Ctrl+End) -----

    // Total number of characters in the flattened text.
    getTotalChars() {
        let total = 0;
        for (const item of this.items) {
            if (item instanceof TextLink) {
                total += item.text.length;
            } else if (item instanceof NewlineLink) {
                total += 1;
            }
        }
        return total;
    }

    documentStartPressed() {
        this.targetCursorX = undefined;
        this.clearSelection();
        this.moveCursorToCharPosition(0);
    }

    documentEndPressed() {
        this.targetCursorX = undefined;
        this.clearSelection();
        this.moveCursorToCharPosition(this.getTotalChars());
    }

    shiftDocumentStartPressed() {
        this.targetCursorX = undefined;
        this.beginSelectionIfNeeded();
        this.moveCursorToCharPosition(0);
        this.updateSelectionFromAnchor();
    }

    shiftDocumentEndPressed() {
        this.targetCursorX = undefined;
        this.beginSelectionIfNeeded();
        this.moveCursorToCharPosition(this.getTotalChars());
        this.updateSelectionFromAnchor();
    }

    // ----- Word-wise navigation (Ctrl+Left / Ctrl+Right) -----

    // Flattened text, aligned with getCharPosition's character counting
    // (TextLink characters plus one '\n' per hard newline; virtual newlines
    // and the cursor contribute nothing).
    getFlatText() {
        let text = '';
        for (const item of this.items) {
            if (item instanceof TextLink) {
                text += item.text;
            } else if (item instanceof NewlineLink) {
                text += '\n';
            }
        }
        return text;
    }

    // Word boundary to the left of pos: skip any whitespace, then skip the
    // run of word characters, landing at the start of that word.
    prevWordBoundary(pos) {
        const text = this.getFlatText();
        let i = pos;
        while (i > 0 && /\s/.test(text[i - 1])) i--;
        while (i > 0 && !/\s/.test(text[i - 1])) i--;
        return i;
    }

    // Word boundary to the right of pos: skip any whitespace, then skip the
    // run of word characters, landing just after that word.
    nextWordBoundary(pos) {
        const text = this.getFlatText();
        const len = text.length;
        let i = pos;
        while (i < len && /\s/.test(text[i])) i++;
        while (i < len && !/\s/.test(text[i])) i++;
        return i;
    }

    wordLeftPressed() {
        this.targetCursorX = undefined;
        this.clearSelection();
        this.moveCursorToCharPosition(this.prevWordBoundary(this.getCursorCharPosition()));
    }

    wordRightPressed() {
        this.targetCursorX = undefined;
        this.clearSelection();
        this.moveCursorToCharPosition(this.nextWordBoundary(this.getCursorCharPosition()));
    }

    shiftWordLeftPressed() {
        this.targetCursorX = undefined;
        this.beginSelectionIfNeeded();
        this.moveCursorToCharPosition(this.prevWordBoundary(this.getCursorCharPosition()));
        this.updateSelectionFromAnchor();
    }

    shiftWordRightPressed() {
        this.targetCursorX = undefined;
        this.beginSelectionIfNeeded();
        this.moveCursorToCharPosition(this.nextWordBoundary(this.getCursorCharPosition()));
        this.updateSelectionFromAnchor();
    }

    enterPressed() {
        this.items.splice(this.cursorIdx(), 0, new NewlineLink());
        this.recalc();
    }

    // Insert a block-level link (rule, image, …) on its own line, leaving the
    // cursor just below it. Breaks the current line first when the cursor is
    // mid-line so the block gets its own row.
    insertBlock(link) {
        const idx = this.cursorIdx();

        let atLineStart = true;
        for (let j = idx - 1; j >= 0; j--) {
            if (this.items[j] instanceof CursorLink) continue;
            // Any NewlineLink subclass (rule/image included) counts as a break.
            atLineStart = this.items[j] instanceof NewlineLink;
            break;
        }

        const toInsert = [];
        if (!atLineStart) toInsert.push(new NewlineLink());
        toInsert.push(link);
        this.items.splice(idx, 0, ...toInsert);
        this.recalc();
    }

    insertHorizontalRule() {
        this.insertBlock(new HorizontalRuleLink());
    }

    clicked(x, y) {
        // Clear target X when clicking
        this.targetCursorX = undefined;
        
        console.log(`clicked(${x.toFixed(2)}, ${y.toFixed(2)})`);
        
        let hitTextLink = false;
        for (let i = 0; i < this.items.length; i++) {
            const item = this.items[i];
            if (item instanceof TextLink && item.clickHits(this.ctx, x, y)) {
                console.log(`  Hit TextLink[${i}]: "${item.text}" at posY=${item.computed.posY.toFixed(2)}, ascent=${item.computed.ascent.toFixed(2)}, descent=${item.computed.descent.toFixed(2)}`);

                const charIdx = item.getCharIdxFromX(this.ctx, x);
                const cursorIdx = this.cursorIdx();
                const text = item.text;
                const fontProps = item.intrinsic.fontProperties.clone();
                
                this.items.splice(cursorIdx, 1);
                // Adjust index if cursor was before this text link
                const adjustedIdx = (cursorIdx < i) ? i - 1 : i;
                
                this.items[adjustedIdx].text = text.substring(0, charIdx);
                this.items.splice(adjustedIdx + 1, 0, new CursorLink());
                this.items.splice(adjustedIdx + 2, 0, new TextLink(text.substring(charIdx, text.length), fontProps));
                hitTextLink = true;
                break;
            }
        }
        if (!hitTextLink) {
            console.log(`  No text hit, checking fallback...`);
            
            // First, find ALL text lines that contain this Y coordinate, then pick the closest one
            let candidateLines = [];
            console.log(`  Searching for text lines containing Y=${y.toFixed(2)}...`);

            for (let i = this.items.length - 1; i >= 0; i--) {
                if (this.items[i] instanceof TextLink) {
                    const item = this.items[i];
                    const lineHeight = item.computed.lineHeight || this.currentFontProperties.size * this.LINE_SPACING_MULT;
                    const textHeight = (item.computed.ascent || 0) + (item.computed.descent || 0);
                    const gapSpace = lineHeight - textHeight;

                    // Default: Each line owns half the gap above and half the gap below
                    let topY = item.computed.posY - (item.computed.ascent || 0) - (gapSpace / 2);
                    let bottomY = item.computed.posY + (item.computed.descent || 0) + (gapSpace / 2);

                    // Check if there's a newline before this text - if so, extend to midpoint with that newline
                    const originalTopY = topY;
                    for (let j = i - 1; j >= 0; j--) {
                        if (this.items[j] instanceof NewlineLink || this.items[j] instanceof VirtualNewlineLink) {
                            // Only use newlines on PREVIOUS lines (posY < current line posY)
                            if (this.items[j].computed.posY < item.computed.posY) {
                                // Found the newline above this line - extend to midpoint
                                const midpoint = (this.items[j].computed.posY + originalTopY) / 2;
                                topY = midpoint;
                                break;
                            }
                        } else if (this.items[j] instanceof TextLink) {
                            // Hit another text item, stop searching
                            break;
                        }
                    }

                    // Check if there's a newline or next line after this text - extend to midpoint
                    const originalBottomY = bottomY;
                    for (let j = i + 1; j < this.items.length; j++) {
                        if (this.items[j] instanceof TextLink) {
                            // Found next line - extend to midpoint with its topY
                            const nextLineTopY = this.items[j].computed.posY - (this.items[j].computed.ascent || 0) - (gapSpace / 2);
                            const midpoint = (originalBottomY + nextLineTopY) / 2;
                            bottomY = midpoint;
                            break;
                        } else if (this.items[j] instanceof NewlineLink || this.items[j] instanceof VirtualNewlineLink) {
                            // Only use newlines on NEXT lines (posY > current line posY)
                            if (this.items[j].computed.posY > item.computed.posY) {
                                // Found newline on next line - extend to midpoint
                                const midpoint = (originalBottomY + this.items[j].computed.posY) / 2;
                                bottomY = midpoint;
                                break;
                            }
                        }
                    }

                    console.log(`  TextLink[${i}]: "${item.text}" at posY=${item.computed.posY.toFixed(2)}, range=[${topY.toFixed(2)}, ${bottomY.toFixed(2)}]`);

                    // Check if click Y is within this text's line
                    if (y >= topY && y <= bottomY) {
                        // Check if we already have this posY in candidates
                        if (!candidateLines.find(c => c.posY === item.computed.posY)) {
                            candidateLines.push({
                                posY: item.computed.posY,
                                distance: Math.abs(y - item.computed.posY)
                            });
                            console.log(`  -> Added candidate line at posY=${item.computed.posY.toFixed(2)}, distance=${Math.abs(y - item.computed.posY).toFixed(2)}`);
                        }
                    }
                }
            }

            // Pick the line closest to the clicked Y coordinate
            let matchingLinePosY = null;
            let foundTextLink = false;

            if (candidateLines.length > 0) {
                // Sort by distance and pick the closest
                candidateLines.sort((a, b) => a.distance - b.distance);
                matchingLinePosY = candidateLines[0].posY;
                console.log(`  -> Selected closest line at posY=${matchingLinePosY.toFixed(2)} (distance=${candidateLines[0].distance.toFixed(2)})`);

                // Find the first and last text items on this line to determine X bounds
                let firstTextIdx = -1;
                let lastTextIdx = -1;
                let lastTextEndX = 0;

                for (let k = 0; k < this.items.length; k++) {
                    if (this.items[k] instanceof TextLink && this.items[k].computed.posY === matchingLinePosY) {
                        if (firstTextIdx === -1) firstTextIdx = k;
                        lastTextIdx = k;
                        // Measure the text width using the canvas context
                        const textItem = this.items[k];
                        const metrics = textItem.measureText(this.ctx);
                        lastTextEndX = textItem.computed.posX + metrics.width;
                    }
                }

                console.log(`  -> First text at index ${firstTextIdx}, last text at index ${lastTextIdx}, lastTextEndX=${lastTextEndX.toFixed(2)}, clickX=${x.toFixed(2)}`);

                // If X is beyond the last text, place cursor at END of line
                if (x >= lastTextEndX) {
                    console.log(`  -> Click X is beyond last text, placing cursor at end of line`);

                    // First remove the cursor from wherever it is
                    const oldCursorIdx = this.cursorIdx();
                    this.items.splice(oldCursorIdx, 1);

                    // Adjust lastTextIdx if cursor was before it
                    let adjustedLastTextIdx = lastTextIdx;
                    if (oldCursorIdx <= lastTextIdx) {
                        adjustedLastTextIdx--;
                    }

                    // Check if there's a NewlineLink right after the last text
                    // If so, place cursor BEFORE it (not after)
                    let insertIdx = adjustedLastTextIdx + 1;
                    if (insertIdx < this.items.length &&
                        (this.items[insertIdx] instanceof NewlineLink ||
                         this.items[insertIdx] instanceof VirtualNewlineLink)) {
                        // Place cursor before the newline
                        console.log(`  -> Found newline at index ${insertIdx}, placing cursor before it`);
                    }

                    this.items.splice(insertIdx, 0, new CursorLink());
                } else {
                    // Otherwise, place cursor at BEGINNING of line
                    console.log(`  -> Click X is before/within text, placing cursor at start of line`);
                    this.items.splice(this.cursorIdx(), 1);
                    this.items.splice(firstTextIdx, 0, new CursorLink());
                }

                foundTextLink = true;

                // Debug: log cursor position after recalc
                this.recalc();
                const newCursor = this.items[this.cursorIdx()];
                console.log(`  Cursor placed at index ${this.cursorIdx()}, will have posY=${newCursor.computed?.posY?.toFixed(2) || 'pending'}, height=${newCursor.computed?.height?.toFixed(2) || 'pending'}`);
                return; // Skip the recalc at the end
            }

            // If no text link found, check if we clicked on an empty line
            let foundEmptyLine = false;
            if (!foundTextLink) {
                console.log(`  No text on line, checking empty lines...`);
            for (let i = 0; i < this.items.length; i++) {
                const item = this.items[i];
                if ((item instanceof NewlineLink || item instanceof VirtualNewlineLink) && 
                    item.computed && item.computed.posY !== undefined) {
                    // Check if this is the start of an empty line (next item is also newline or VirtualNewlineLink or end)
                    const nextItem = this.items[i + 1];
                    const isEmptyLine = !nextItem || nextItem instanceof NewlineLink || 
                                       nextItem instanceof VirtualNewlineLink || nextItem instanceof CursorLink;
                    
                    if (isEmptyLine) {
                        // Empty line spans from end of previous line to halfway to next line
                        const lineHeight = item.computed.lineHeight || this.currentFontProperties.size * this.LINE_SPACING_MULT;
                        let topY = item.computed.posY - lineHeight;
                        let bottomY = item.computed.posY;
                        
                        // Find the next line to determine where our bottom boundary should be
                        for (let j = i + 1; j < this.items.length; j++) {
                            if (this.items[j] instanceof TextLink) {
                                // Next line has text - extend to midpoint
                                const nextLineTop = this.items[j].computed.posY - (this.items[j].computed.ascent || 0) - 
                                    ((this.items[j].computed.lineHeight - (this.items[j].computed.ascent + this.items[j].computed.descent)) / 2);
                                bottomY = (item.computed.posY + nextLineTop) / 2;
                                break;
                            }
                        }
                        
                        const itemType = item instanceof NewlineLink ? 'NewlineLink' : 'VirtualNewlineLink';
                        console.log(`  Checking ${itemType}[${i}] at posY=${item.computed.posY.toFixed(2)}, lineHeight=${lineHeight.toFixed(2)}, isEmptyLine=${isEmptyLine}, range=[${topY.toFixed(2)}, ${bottomY.toFixed(2)}]`);
                        
                        if (y >= topY && y <= bottomY) {
                            console.log(`  -> Found empty line at index ${i}`);
                            // Place cursor right after this newline (at the start of the empty line)
                            const cursorIdx = this.cursorIdx();
                            this.items.splice(cursorIdx, 1);
                            // Adjust index if cursor was before target position
                            const adjustedIdx = (cursorIdx <= i) ? i : i + 1;
                            this.items.splice(adjustedIdx, 0, new CursorLink());
                            foundEmptyLine = true;
                            
                            // Debug: log cursor position after recalc
                            this.recalc();
                            const newCursor = this.items[this.cursorIdx()];
                            console.log(`  Cursor placed at index ${this.cursorIdx()}, will have posY=${newCursor.computed?.posY?.toFixed(2) || 'pending'}, height=${newCursor.computed?.height?.toFixed(2) || 'pending'}`);
                            return; // Skip the recalc at the end
                        }
                    }
                }
            }
            
            if (!foundEmptyLine && !foundTextLink) {
                // Check if Y is before the first line - if so, place at beginning
                let firstLineY = Infinity;
                for (let i = 0; i < this.items.length; i++) {
                    if (this.items[i] instanceof TextLink && this.items[i].computed && this.items[i].computed.posY !== undefined) {
                        firstLineY = Math.min(firstLineY, this.items[i].computed.posY);
                    }
                }

                if (y < firstLineY - 50) { // If clicking well above first line
                    console.log(`  -> Click is above first line (y=${y.toFixed(2)} < firstLineY=${firstLineY.toFixed(2)}), placing cursor at start`);
                    this.items.splice(this.cursorIdx(), 1);
                    this.items.unshift(new CursorLink());
                } else {
                    console.log(`  -> No match found, placing cursor at end`);
                    // Default: move to end
                    this.items.splice(this.cursorIdx(), 1);
                    this.items.push(new CursorLink());
                }
            }
            }
        }
        this.recalc();
    }

    setFontSize(size) {
        this.currentFontProperties.size = size;
    }

    setFontFamily(family) {
        this.currentFontProperties.family = family;
    }

    setWidth(widthPixels) {
        this.widthPixels = widthPixels;
        this.recalc();
    }

    // Get character position in the flattened text (for selection)
    getCharPosition(itemIdx, charOffset) {
        let pos = 0;
        for (let i = 0; i < itemIdx && i < this.items.length; i++) {
            if (this.items[i] instanceof TextLink) {
                pos += this.items[i].text.length;
            } else if (this.items[i] instanceof NewlineLink) {
                pos += 1;
            }
        }
        if (itemIdx < this.items.length && this.items[itemIdx] instanceof TextLink) {
            pos += Math.min(charOffset, this.items[itemIdx].text.length);
        }
        return pos;
    }

    // Convert character position to item index and offset
    getItemFromCharPosition(charPos) {
        let pos = 0;
        for (let i = 0; i < this.items.length; i++) {
            if (this.items[i] instanceof TextLink) {
                if (pos + this.items[i].text.length >= charPos) {
                    return { itemIdx: i, charOffset: charPos - pos };
                }
                pos += this.items[i].text.length;
            } else if (this.items[i] instanceof NewlineLink) {
                if (pos >= charPos) {
                    return { itemIdx: i, charOffset: 0 };
                }
                pos += 1;
            }
        }
        return { itemIdx: this.items.length - 1, charOffset: 0 };
    }

    // Resolve a content-space (x, y) to a flattened character position, with
    // line-aware fallback when the point is in a list's left gutter, past the
    // end of a line, or on an empty line. Used for click and drag-selection
    // hit testing so indented lines resolve to the correct character.
    charPositionAtXY(x, y) {
        const items = this.items;

        // 1) Direct hit on a text run.
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            if (item instanceof TextLink && item.clickHits(this.ctx, x, y)) {
                return this.getCharPosition(i, item.getCharIdxFromX(this.ctx, x));
            }
        }

        // 2) Otherwise pick the visual line (distinct posY) nearest the clicked
        //    Y. Both text runs and newlines carry a posY for their line.
        let bestPosY = null;
        let bestDist = Infinity;
        for (const item of items) {
            if ((item instanceof TextLink || item instanceof NewlineLink) &&
                item.computed && typeof item.computed.posY === 'number') {
                const d = Math.abs(y - item.computed.posY);
                if (d < bestDist) {
                    bestDist = d;
                    bestPosY = item.computed.posY;
                }
            }
        }
        if (bestPosY === null) return 0; // empty document

        // Text runs on the chosen line, and that line's X bounds.
        let firstTextIdx = -1;
        let lastTextIdx = -1;
        let firstStartX = Infinity;
        let lastEndX = -Infinity;
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            if (item instanceof TextLink && item.computed && item.computed.posY === bestPosY) {
                if (firstTextIdx === -1) firstTextIdx = i;
                lastTextIdx = i;
                const startX = item.computed.posX;
                const endX = startX + item.measureText(this.ctx).width;
                if (startX < firstStartX) firstStartX = startX;
                if (endX > lastEndX) lastEndX = endX;
            }
        }

        // Empty line (no text runs): a newline's posY is the *next* line's
        // baseline, so the newline carrying this line's Y is the one that
        // terminates the previous line; the empty line begins just after it.
        if (firstTextIdx === -1) {
            for (let i = 0; i < items.length; i++) {
                if (items[i] instanceof NewlineLink && items[i].computed &&
                    items[i].computed.posY === bestPosY) {
                    return this.getCharPosition(i, 0) + 1;
                }
            }
            return this.getTotalChars();
        }

        // Left of the line's text (e.g. list gutter) → start of line.
        if (x <= firstStartX) {
            return this.getCharPosition(firstTextIdx, 0);
        }
        // Right of the line's text → end of line.
        if (x >= lastEndX) {
            return this.getCharPosition(lastTextIdx, items[lastTextIdx].text.length);
        }

        // Within the line: find the run containing x.
        for (let i = firstTextIdx; i <= lastTextIdx; i++) {
            const item = items[i];
            if (!(item instanceof TextLink) || !item.computed || item.computed.posY !== bestPosY) continue;
            const startX = item.computed.posX;
            const endX = startX + item.measureText(this.ctx).width;
            if (x >= startX && x <= endX) {
                return this.getCharPosition(i, item.getCharIdxFromX(this.ctx, x));
            }
        }
        // Between runs → end of line.
        return this.getCharPosition(lastTextIdx, items[lastTextIdx].text.length);
    }

    setSelection(startItemIdx, startCharOffset, endItemIdx, endCharOffset) {
        this.selectionStart = this.getCharPosition(startItemIdx, startCharOffset);
        this.selectionEnd = this.getCharPosition(endItemIdx, endCharOffset);
        
        // Ensure start < end
        if (this.selectionStart > this.selectionEnd) {
            [this.selectionStart, this.selectionEnd] = [this.selectionEnd, this.selectionStart];
        }
    }

    clearSelection() {
        this.selectionStart = null;
        this.selectionEnd = null;
        this.selectionAnchor = null;
    }

    hasSelection() {
        return this.selectionStart !== null && this.selectionEnd !== null && this.selectionStart !== this.selectionEnd;
    }

    // Get selected text
    getSelectedText() {
        if (!this.hasSelection()) return '';
        
        let text = '';
        let pos = 0;
        for (let item of this.items) {
            if (item instanceof TextLink) {
                const itemStart = pos;
                const itemEnd = pos + item.text.length;
                
                if (itemEnd > this.selectionStart && itemStart < this.selectionEnd) {
                    const start = Math.max(0, this.selectionStart - itemStart);
                    const end = Math.min(item.text.length, this.selectionEnd - itemStart);
                    text += item.text.substring(start, end);
                }
                pos += item.text.length;
            } else if (item instanceof NewlineLink) {
                if (pos >= this.selectionStart && pos < this.selectionEnd) {
                    text += '\n';
                }
                pos += 1;
            }
        }
        return text;
    }
}

