(function (global, factory) {
    typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports) :
    typeof define === 'function' && define.amd ? define(['exports'], factory) :
    (global = typeof globalThis !== 'undefined' ? globalThis : global || self, factory(global.CanvasEditor = {}));
})(this, (function (exports) { 'use strict';

    /**
     * Base class for all chain links
     */
    class ChainLink {
        constructor() {
            this.intrinsic = {};
            this.computed = {};
        }
    }

    /**
     * TextLink - Represents a piece of text with specific font properties
     */
    class TextLink extends ChainLink {
        constructor(text, fontProperties) {
            super();
            this.text = text;
            this.intrinsic = {
                ...this.intrinsic,
                fontProperties
            };
        }

        getPosX() {
            return this.computed.posX;
        }

        getPosY() {
            return this.computed.posY;
        }

        getAscent() {
            return this.computed.ascent;
        }

        getDescent() {
            return this.computed.descent;
        }

        getLineHeight() {
            return this.computed.lineHeight;
        }

        getFontProperties() {
            return this.intrinsic.fontProperties;
        }

        measureText(ctx, textOverride = null) {
            const savedFont = ctx.font;
            ctx.font = this.intrinsic.fontProperties.toFontString();
            const measures = ctx.measureText(textOverride ? textOverride : this.text);
            ctx.font = savedFont;
            return measures;
        }

        doFontPropertiesMatch(other) {
            return this.intrinsic.fontProperties.doPropertiesMatch(other.intrinsic.fontProperties);
        }

        clickHits(ctx, x, y) {
            if (x >= this.computed.posX && x <= this.computed.posX + this.measureText(ctx).width) {
                // Text baseline is at posY, text extends up by ascent and down by descent
                // Each line owns half the gap space above and below
                const lineHeight = this.computed.lineHeight || 0;
                const textHeight = (this.computed.ascent || 0) + (this.computed.descent || 0);
                const gapSpace = lineHeight - textHeight;
                
                const topY = this.computed.posY - (this.computed.ascent || 0) - (gapSpace / 2);
                const bottomY = this.computed.posY + (this.computed.descent || 0) + (gapSpace / 2);
                
                if (y >= topY && y <= bottomY) {
                    return true;
                }
            }
            return false;
        }

        getCharIdxFromX(ctx, x) {
            let charIdx = 0;
            let charPosX = this.computed.posX;
            while (charIdx < this.text.length) {
                const charWidth = this.measureText(ctx, this.text.substring(charIdx, charIdx + 1)).width;
                if (x >= charPosX && x <= charPosX + charWidth) {
                    return ((x > charPosX + charWidth / 2) ? charIdx + 1 : charIdx);
                }
                charIdx++;
                charPosX += charWidth;
            }
            // If we get here, the click was after the last character
            return this.text.length;
        }
    }

    /**
     * CursorLink - Represents the text cursor position
     */
    class CursorLink extends ChainLink {}

    /**
     * VirtualNewlineLink - Represents a line wrap (not user-created)
     */
    class VirtualNewlineLink extends ChainLink {}

    /**
     * NewlineLink - Represents an actual newline character (user-created)
     */
    class NewlineLink extends ChainLink {}

    /**
     * HorizontalRuleLink - A divider rendered as a horizontal line on its own row.
     * It extends NewlineLink so that all line-breaking, character-counting,
     * navigation, and selection logic treats it like a line break; only its
     * rendering and serialization differ.
     */
    class HorizontalRuleLink extends NewlineLink {}

    /**
     * Chain - Manages the linked list of text, cursor, and newline elements
     */
    class Chain {
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
        }

        // Left indent (px) for a given paragraph index; 0 when not indented.
        getParagraphIndent(paragraphIndex) {
            return this.paragraphIndents.get(paragraphIndex) || 0;
        }

        printItems() {
            let s = "";
            this.items.forEach(function (item) {
                const posX = (typeof item.computed.posX !== 'undefined' && item.computed.posX !== null) ? item.computed.posX.toFixed(2) : 'null';
                const posY = (typeof item.computed.posY !== 'undefined' && item.computed.posY !== null) ? item.computed.posY.toFixed(2) : 'null';
                const coords = posX + ',' + posY;
                if (item instanceof TextLink) {
                    s += '%c<t|' + coords + '|' + item.intrinsic.fontProperties.size.toFixed(0) + '>%c' + item.text + '%c</t>';
                } else if (item instanceof VirtualNewlineLink) {
                    s += '%c<vn>';
                } else if (item instanceof NewlineLink) {
                    s += '%c<\\n>';
                } else if (item instanceof CursorLink) {
                    s += '%c<c|' + coords + '>';
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
                
                for (let j = currentLineStartIdx; j < i; j++) {
                    this.items[j].computed.lineHeight = lineHeight;
                }
                
                if ((this.items[i] instanceof VirtualNewlineLink) || (this.items[i] instanceof NewlineLink) || (i === this.items.length)) {
                    posY += lineHeight;
                    currentLineStartIdx = i + 1;
                    currentLineMaxAscent = 0;
                    currentLineMaxDescent = 0;
                    currentLineMaxFontSize = 0;
                    if (i !== this.items.length) {
                        this.items[i].computed = {
                            ...this.items[i].computed,
                            posY
                        };
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

        // Insert a horizontal rule on its own line, with the cursor left below it.
        insertHorizontalRule() {
            const idx = this.cursorIdx();

            // Determine whether the cursor already sits at the start of a line.
            // If not, break the current line first so the rule gets its own row.
            let atLineStart = true;
            for (let j = idx - 1; j >= 0; j--) {
                if (this.items[j] instanceof CursorLink) continue;
                // HorizontalRuleLink/NewlineLink both count as a preceding break.
                atLineStart = this.items[j] instanceof NewlineLink;
                break;
            }

            const toInsert = [];
            if (!atLineStart) toInsert.push(new NewlineLink());
            toInsert.push(new HorizontalRuleLink());
            this.items.splice(idx, 0, ...toInsert);
            this.recalc();
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

    /**
     * FontProperties - Manages font styling properties for text
     */
    class FontProperties {
        constructor(size = 16, family = 'Arial', weight = 'normal', style = 'normal',
                    underline = false, strikethrough = false, superscript = false, subscript = false,
                    color = '#000000', backgroundColor = null, link = null) {
            this.size = size;
            this.family = family;
            this.weight = weight;
            this.style = style;
            this.underline = underline;
            this.strikethrough = strikethrough;
            this.superscript = superscript;
            this.subscript = subscript;
            this.color = color;
            // Highlight color drawn behind the glyphs. null means no highlight.
            this.backgroundColor = backgroundColor;
            // Hyperlink target (URL). null means the run is not a link.
            this.link = link;
        }

        doPropertiesMatch(other) {
            return this.size === other.size &&
                   this.family === other.family &&
                   this.weight === other.weight &&
                   this.style === other.style &&
                   this.underline === other.underline &&
                   this.strikethrough === other.strikethrough &&
                   this.superscript === other.superscript &&
                   this.subscript === other.subscript &&
                   this.color === other.color &&
                   this.backgroundColor === other.backgroundColor &&
                   this.link === other.link;
        }

        clone() {
            return new FontProperties(this.size, this.family, this.weight, this.style,
                                       this.underline, this.strikethrough, this.superscript, this.subscript,
                                       this.color, this.backgroundColor, this.link);
        }

        toFontString() {
            return `${this.style} ${this.weight} ${this.size}px ${this.family}`;
        }

        // Serialize to a plain object (for JSON document export).
        toObject() {
            return {
                size: this.size,
                family: this.family,
                weight: this.weight,
                style: this.style,
                underline: this.underline,
                strikethrough: this.strikethrough,
                superscript: this.superscript,
                subscript: this.subscript,
                color: this.color,
                backgroundColor: this.backgroundColor,
                link: this.link
            };
        }

        // Rebuild a FontProperties from a plain object produced by toObject().
        // Missing fields fall back to constructor defaults so older documents
        // (saved before a field existed) still load cleanly.
        static fromObject(obj = {}) {
            const d = new FontProperties();
            return new FontProperties(
                obj.size ?? d.size,
                obj.family ?? d.family,
                obj.weight ?? d.weight,
                obj.style ?? d.style,
                obj.underline ?? d.underline,
                obj.strikethrough ?? d.strikethrough,
                obj.superscript ?? d.superscript,
                obj.subscript ?? d.subscript,
                obj.color ?? d.color,
                obj.backgroundColor ?? d.backgroundColor,
                obj.link ?? d.link
            );
        }

        // Toggle formatting
        toggleBold() {
            this.weight = this.weight === 'bold' ? 'normal' : 'bold';
        }

        toggleItalic() {
            this.style = this.style === 'italic' ? 'normal' : 'italic';
        }

        toggleUnderline() {
            this.underline = !this.underline;
        }

        toggleStrikethrough() {
            this.strikethrough = !this.strikethrough;
        }

        toggleSuperscript() {
            // Superscript and subscript are mutually exclusive
            if (this.subscript) this.subscript = false;
            this.superscript = !this.superscript;
        }

        toggleSubscript() {
            // Superscript and subscript are mutually exclusive
            if (this.superscript) this.superscript = false;
            this.subscript = !this.subscript;
        }
    }

    /**
     * CanvasEditor - Main editor class that manages the canvas, rendering, and user interactions
     */
    class CanvasEditor {
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
            // Counter for stable paragraph-boundary ids (see boundaryKey).
            this._pidCounter = 0;

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
                    this.remapAroundEdit(() => this.chain.deleteWordLeft());
                } else {
                    this.remapAroundEdit(() => this.chain.backspacePressed());
                }
                this.render();
            } else if (key === 'Delete') {
                e.preventDefault();
                this.takeSnapshot();
                if (this.chain.hasSelection()) {
                    this.deleteSelection();
                } else if (ctrl) {
                    this.remapAroundEdit(() => this.chain.deleteWordRight());
                } else {
                    this.remapAroundEdit(() => this.chain.deleteForward());
                }
                this.render();
            } else if (key === 'Enter') {
                e.preventDefault();
                this.takeSnapshot();
                if (this.chain.hasSelection()) {
                    this.deleteSelection();
                }
                const splitPara = this.getCurrentParagraphIndex();
                if (this.paragraphLists.has(splitPara) && this.isParagraphEmpty(splitPara)) {
                    // Enter on an empty list item exits the list (removes the bullet
                    // and indent) rather than adding another empty item.
                    this.paragraphLists.delete(splitPara);
                    this.syncParagraphIndents();
                    this.chain.recalc();
                } else {
                    // Split the current paragraph and carry its list/alignment onto
                    // the new line (auto-continue), shifting following paragraphs.
                    this.remapAroundEdit(() => this.chain.enterPressed());
                    this.continueParagraphAttributes(splitPara);
                }
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

                    // Insert pasted text, keeping existing paragraphs' attributes
                    // attached as newlines shift their indices.
                    this.remapAroundEdit(() => {
                        for (let char of text) {
                            if (char === '\n') {
                                this.chain.enterPressed();
                            } else {
                                this.chain.printableKeyPressed(char);
                            }
                        }
                    });

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
            // Deleting a selection can remove newlines (merging paragraphs); keep
            // paragraph attributes attached to their boundaries across the edit.
            this.remapAroundEdit(() => this._deleteSelectionRaw());
        }

        _deleteSelectionRaw() {
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
            let openLinkPopupAfterRender = false;

            // Scrollbar interaction takes precedence over text positioning.
            if (this.startScrollbarDragIfHit(e.clientX - rect.left, e.clientY - rect.top)) {
                return;
            }

            // Any click on the canvas dismisses an open link editor; it reopens
            // below if the click lands inside a link.
            this.closeLinkPopup();

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

                // If the click landed inside a link, either follow it
                // (Ctrl/Cmd-click) or surface the link editor.
                const href = this.getLinkAtCursor();
                if (href) {
                    if (e.metaKey || e.ctrlKey) {
                        this.openLink(href);
                    } else {
                        openLinkPopupAfterRender = true;
                    }
                }
            }

            this.render();

            // Reset cursor blink to stay visible for full cycle
            this.resetCursorBlink();

            // Focus the canvas
            this.canvas.focus();

            // Open the link editor after the canvas regains focus so the popup's
            // URL field keeps focus.
            if (openLinkPopupAfterRender) {
                this.openLinkPopup();
            }
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

            // No text at all: keep the previous "nothing to select" behavior.
            if (!items.some(item => item instanceof TextLink)) {
                return null;
            }

            // Line-aware resolution handles clicks in a list's gutter, past the end
            // of a line, and on empty lines (where no text run is directly hit).
            const pos = this.chain.charPositionAtXY(x, y);
            return this.chain.getItemFromCharPosition(pos);
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
                } else if (item instanceof HorizontalRuleLink) {
                    this.renderHorizontalRule(item);
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

        renderHorizontalRule(rule) {
            // rule.computed.posY is the bottom of the (empty) line the rule owns;
            // draw the line through the vertical middle of that line's text slot.
            const posY = (rule.computed && rule.computed.posY) || 0;
            const midOffset = this.defaultFontProperties.size * 0.75;
            const y = posY - midOffset;

            this.ctx.strokeStyle = this.options.horizontalRuleColor || 'rgba(0, 0, 0, 0.35)';
            this.ctx.lineWidth = 1;
            this.ctx.beginPath();
            this.ctx.moveTo(0, y);
            this.ctx.lineTo(this.editorWidth, y);
            this.ctx.stroke();
        }

        // Compute where each list paragraph's marker should be drawn. Returned as
        // { paragraph, marker, x, y } in paragraph order. Separated from drawing so
        // marker placement can be tested without a real canvas.
        getListMarkerPositions() {
            const positions = [];
            if (this.paragraphLists.size === 0) return positions;
            const items = this.chain.getItems();

            // Total paragraph count (newlines + 1) so numbering can be computed for
            // every paragraph, then look up each list paragraph's marker text.
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

            // Baseline Y of each paragraph's first line. A newline's posY is the
            // *next* line's baseline, so the newline ending paragraph k gives the
            // first-line baseline of paragraph k+1 — which is the only reliable
            // source for an empty paragraph (it has no text run of its own).
            const baselineByPara = new Map();
            let paragraphIdx = 0;
            for (const item of items) {
                if (item instanceof NewlineLink) {
                    if (item.computed && typeof item.computed.posY === 'number') {
                        baselineByPara.set(paragraphIdx + 1, item.computed.posY);
                    }
                    paragraphIdx++;
                } else if (item instanceof TextLink || item instanceof CursorLink) {
                    if (!baselineByPara.has(paragraphIdx) &&
                        item.computed && typeof item.computed.posY === 'number') {
                        baselineByPara.set(paragraphIdx, item.computed.posY);
                    }
                }
            }

            const gap = 8;
            this.ctx.font = `${this.defaultFontProperties.size}px ${this.defaultFontProperties.family}`;
            for (const [p, marker] of markerText) {
                const y = baselineByPara.get(p);
                if (typeof y !== 'number') continue;
                const width = this.ctx.measureText(marker).width;
                positions.push({ paragraph: p, marker, x: this.LIST_INDENT - gap - width, y });
            }
            return positions;
        }

        renderListMarkers() {
            const positions = this.getListMarkerPositions();
            if (positions.length === 0) return;
            this.ctx.font = `${this.defaultFontProperties.size}px ${this.defaultFontProperties.family}`;
            this.ctx.fillStyle = this.defaultFontProperties.color || '#000000';
            for (const pos of positions) {
                this.ctx.fillText(pos.marker, pos.x, pos.y);
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

            // Link runs render in the link color and are always underlined,
            // overriding the run's own text color.
            const isLink = !!fontProps.link;
            const drawColor = isLink
                ? (this.options.linkColor || '#1a0dab')
                : (fontProps.color || '#000000');

            this.ctx.fillStyle = drawColor;
            this.ctx.fillText(textLink.text, posX, posY);

            // Draw underline (explicit underline, or implied by a link)
            if (fontProps.underline || isLink) {
                this.ctx.strokeStyle = drawColor;
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

        // True when the paragraph at the given index contains no text characters.
        isParagraphEmpty(paragraphIndex) {
            const items = this.chain.getItems();
            let para = 0;
            for (const item of items) {
                if (item instanceof NewlineLink) {
                    if (para === paragraphIndex) return true;
                    para++;
                } else if (item instanceof TextLink) {
                    if (para === paragraphIndex && item.text.length > 0) return false;
                }
            }
            return para === paragraphIndex;
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

        // --- Stable paragraph attributes across structural edits ---------------
        //
        // Paragraph alignment and list type are stored by paragraph index, but
        // paragraph indices shift when newlines are inserted or removed. To keep
        // attributes attached to the right paragraph, each paragraph is identified
        // by the *boundary* that starts it: the 'START' sentinel for paragraph 0,
        // or the NewlineLink object preceding it otherwise. Those boundary objects
        // survive edits, so capturing attributes by boundary identity and rebuilding
        // the index maps afterwards is self-correcting for any edit.

        // Stable id for a paragraph boundary (sentinel or a NewlineLink object).
        boundaryKey(boundary) {
            if (boundary === 'START') return 'START';
            if (boundary._pid === undefined) {
                boundary._pid = ++this._pidCounter;
            }
            return boundary._pid;
        }

        // Boundary that starts each paragraph, indexed by paragraph number.
        paragraphBoundaries() {
            const boundaries = ['START'];
            for (const item of this.chain.getItems()) {
                if (item instanceof NewlineLink) boundaries.push(item);
            }
            return boundaries;
        }

        // Snapshot the current attributes keyed by boundary identity.
        captureParagraphAttributes() {
            const boundaries = this.paragraphBoundaries();
            const align = new Map();
            const list = new Map();
            for (const [idx, v] of this.paragraphAlignments) {
                if (idx < boundaries.length) align.set(this.boundaryKey(boundaries[idx]), v);
            }
            for (const [idx, v] of this.paragraphLists) {
                if (idx < boundaries.length) list.set(this.boundaryKey(boundaries[idx]), v);
            }
            return { align, list };
        }

        // Rebuild the index maps from a boundary-keyed snapshot after an edit.
        restoreParagraphAttributes(saved) {
            const boundaries = this.paragraphBoundaries();
            const align = new Map();
            const list = new Map();
            for (let i = 0; i < boundaries.length; i++) {
                const key = this.boundaryKey(boundaries[i]);
                if (saved.align.has(key)) align.set(i, saved.align.get(key));
                if (saved.list.has(key)) list.set(i, saved.list.get(key));
            }
            this.paragraphAlignments = align;
            this.paragraphLists = list;
            this.syncParagraphIndents();
        }

        // Run a structural edit while preserving paragraph attributes by identity.
        remapAroundEdit(editFn) {
            const saved = this.captureParagraphAttributes();
            editFn();
            this.restoreParagraphAttributes(saved);
        }

        // After splitting paragraph P (Enter), carry its attributes to the new
        // paragraph P+1 so lists and alignment continue onto the next line.
        continueParagraphAttributes(p) {
            const align = this.paragraphAlignments.get(p);
            if (align !== undefined) this.paragraphAlignments.set(p + 1, align);
            const list = this.paragraphLists.get(p);
            if (list !== undefined) this.paragraphLists.set(p + 1, list);
            this.syncParagraphIndents();
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

        // Insert a horizontal rule (divider) on its own line at the cursor.
        insertHorizontalRule() {
            this.takeSnapshot();
            this.chain.insertHorizontalRule();
            this.scrollToCursorOnNextRender = true;
            this.render();
        }

        // --- Hyperlinks -------------------------------------------------------

        // The actual FontProperties active at the cursor (cloneable), as opposed
        // to getFontAtCursor() which returns a plain display subset.
        getFontPropertiesAtCursor() {
            const items = this.chain.getItems();
            const cursorIdx = this.chain.cursorIdx();
            for (let i = cursorIdx - 1; i >= 0; i--) {
                if (items[i] instanceof TextLink) {
                    return items[i].intrinsic.fontProperties.clone();
                }
            }
            return this.chain.currentFontProperties.clone();
        }

        // Extract the plain text within a flattened [start, end) range.
        getTextInRange(start, end) {
            const items = this.chain.getItems();
            let pos = 0;
            let out = '';
            for (const item of items) {
                if (item instanceof TextLink) {
                    const s = Math.max(0, start - pos);
                    const e = Math.min(item.text.length, end - pos);
                    if (e > s) out += item.text.substring(s, e);
                    pos += item.text.length;
                } else if (item instanceof NewlineLink) {
                    if (pos >= start && pos < end) out += '\n';
                    pos += 1;
                }
            }
            return out;
        }

        // The contiguous link run at the cursor, or null. Expands across adjacent
        // runs (e.g. chunked words) that share the exact same href.
        getLinkRangeAtCursor() {
            const items = this.chain.getItems();
            const links = [];
            for (const item of items) {
                if (item instanceof TextLink) {
                    for (let i = 0; i < item.text.length; i++) {
                        links.push(item.intrinsic.fontProperties.link || null);
                    }
                } else if (item instanceof NewlineLink) {
                    links.push(null);
                }
            }

            const cursorPos = this.chain.getCursorCharPosition();
            // Prefer the link of the character before the cursor, then the one
            // after it (matches how formatting-at-cursor is usually resolved).
            let idx = cursorPos - 1;
            let href = (idx >= 0 && idx < links.length) ? links[idx] : null;
            if (!href) {
                idx = cursorPos;
                href = (idx >= 0 && idx < links.length) ? links[idx] : null;
            }
            if (!href) return null;

            let start = idx;
            let end = idx + 1;
            while (start > 0 && links[start - 1] === href) start--;
            while (end < links.length && links[end] === href) end++;
            return { href, start, end, text: this.getTextInRange(start, end) };
        }

        // The href at the cursor, or null when the cursor is not within a link.
        getLinkAtCursor() {
            const range = this.getLinkRangeAtCursor();
            return range ? range.href : null;
        }

        // Insert text carrying the given FontProperties at the cursor.
        insertTextWithProperties(text, props) {
            const saved = this.chain.currentFontProperties;
            this.chain.currentFontProperties = props;
            for (const ch of text) {
                if (ch === '\n') {
                    this.chain.enterPressed();
                } else {
                    this.chain.printableKeyPressed(ch);
                }
            }
            this.chain.currentFontProperties = saved;
        }

        // Set (or clear, when url is falsy) the link on the current selection,
        // preserving the existing text and per-character formatting.
        setLink(url) {
            if (!this.chain.hasSelection()) return;
            this.takeSnapshot();
            this.applyFormattingToSelection('link', () => url || null);
            this.render();
        }

        // Remove the link from the link run at the cursor, keeping its text.
        removeLink() {
            const range = this.getLinkRangeAtCursor();
            if (!range) return;
            this.takeSnapshot();
            this.chain.selectionStart = range.start;
            this.chain.selectionEnd = range.end;
            this.applyFormattingToSelection('link', () => null);
            this.chain.clearSelection();
            this.render();
        }

        // Create or update a link with explicit display text and URL. Replaces the
        // existing link run at the cursor (if any), otherwise the current
        // selection, otherwise inserts at the cursor. An empty url clears the link
        // while keeping the text.
        applyLink(text, url) {
            this.takeSnapshot();
            const href = url ? url : null;

            const existing = this.getLinkRangeAtCursor();
            let start;
            let end;
            if (existing) {
                start = existing.start;
                end = existing.end;
            } else if (this.chain.hasSelection()) {
                start = this.chain.selectionStart;
                end = this.chain.selectionEnd;
            } else {
                start = end = this.chain.getCursorCharPosition();
            }

            const props = this.getFontPropertiesAtCursor();
            props.link = href;

            this.remapAroundEdit(() => {
                if (end > start) {
                    this.chain.deleteCharRange(start, end);
                }
                if (text && text.length > 0) {
                    this.insertTextWithProperties(text, props);
                }
            });
            this.chain.clearSelection();
            this.render();
        }

        // Open a link URL in a new tab (browser only).
        openLink(href) {
            if (href && typeof window !== 'undefined' && typeof window.open === 'function') {
                window.open(href, '_blank', 'noopener');
            }
        }

        // Lazily build the link-editing overlay (a real DOM element). Returns null
        // in non-browser environments so the data API stays usable in Node.
        ensureLinkPopup() {
            if (typeof document === 'undefined') return null;
            if (this.linkPopup) return this.linkPopup;

            const el = document.createElement('div');
            el.className = 'canvas-richtext-link-popup';
            Object.assign(el.style, {
                position: 'absolute',
                display: 'none',
                zIndex: '10000',
                background: '#ffffff',
                border: '1px solid #ccc',
                borderRadius: '6px',
                boxShadow: '0 2px 12px rgba(0,0,0,0.18)',
                padding: '8px',
                font: '13px sans-serif',
                width: '240px',
                boxSizing: 'border-box'
            });
            const inputStyle = 'width:100%;box-sizing:border-box;padding:4px;margin-top:2px;border:1px solid #ccc;border-radius:4px;';
            el.innerHTML =
                '<div style="display:flex;flex-direction:column;gap:6px;">' +
                '<label style="display:flex;flex-direction:column;font-size:11px;color:#555;">Text' +
                '<input type="text" class="crt-link-text" style="' + inputStyle + '"></label>' +
                '<label style="display:flex;flex-direction:column;font-size:11px;color:#555;">URL' +
                '<input type="text" class="crt-link-url" placeholder="https://" style="' + inputStyle + '"></label>' +
                '<div style="display:flex;gap:6px;justify-content:flex-end;">' +
                '<button type="button" class="crt-link-open">Open</button>' +
                '<button type="button" class="crt-link-remove">Remove</button>' +
                '<button type="button" class="crt-link-cancel">Cancel</button>' +
                '<button type="button" class="crt-link-apply">Apply</button>' +
                '</div></div>';

            const textInput = el.querySelector('.crt-link-text');
            const urlInput = el.querySelector('.crt-link-url');

            el.querySelector('.crt-link-apply').addEventListener('click', () => {
                const url = urlInput.value.trim();
                const text = textInput.value.length > 0 ? textInput.value : url;
                this.applyLink(text, url);
                this.closeLinkPopup();
                this.canvas.focus();
            });
            el.querySelector('.crt-link-cancel').addEventListener('click', () => {
                this.closeLinkPopup();
                this.canvas.focus();
            });
            el.querySelector('.crt-link-remove').addEventListener('click', () => {
                this.removeLink();
                this.closeLinkPopup();
                this.canvas.focus();
            });
            el.querySelector('.crt-link-open').addEventListener('click', () => {
                this.openLink(urlInput.value.trim());
            });
            // Keep clicks inside the popup from reaching the canvas (which would
            // reposition the cursor or dismiss the popup).
            el.addEventListener('mousedown', (e) => e.stopPropagation());

            document.body.appendChild(el);
            this.linkPopup = el;
            this.linkPopupText = textInput;
            this.linkPopupUrl = urlInput;
            return el;
        }

        // Open the link editor, seeded from the link at the cursor, the current
        // selection, or empty. Positioned over the canvas near the cursor.
        openLinkPopup() {
            const el = this.ensureLinkPopup();
            if (!el) return;

            const existing = this.getLinkRangeAtCursor();
            let text = '';
            let url = '';
            if (existing) {
                text = existing.text;
                url = existing.href;
            } else if (this.chain.hasSelection()) {
                text = this.getTextInRange(this.chain.selectionStart, this.chain.selectionEnd);
            }

            this.linkPopupText.value = text;
            this.linkPopupUrl.value = url;
            el.style.display = 'block';
            this.positionLinkPopup();
            this.linkPopupUrl.focus();
        }

        closeLinkPopup() {
            if (this.linkPopup) this.linkPopup.style.display = 'none';
        }

        // Place the popup near the cursor, flipping/clamping to stay within the
        // canvas bounds (below the line by default, above if it would overflow).
        positionLinkPopup() {
            const el = this.linkPopup;
            if (!el || typeof window === 'undefined' || !this.canvas.getBoundingClientRect) return;

            const rect = this.canvas.getBoundingClientRect();
            const cursor = this.chain.getCursor();
            const cx = (cursor.computed && cursor.computed.posX) || 0;
            const cy = (cursor.computed && cursor.computed.posY) || 0;

            const originX = rect.left + (window.scrollX || 0);
            const originY = rect.top + (window.scrollY || 0);

            const pw = el.offsetWidth || 240;
            const ph = el.offsetHeight || 110;

            let left = originX + this.options.padding + cx;
            let top = originY + this.options.padding + cy - this.scrollY + 6;

            // Clamp horizontally within the canvas.
            const minLeft = originX;
            const maxLeft = originX + this.canvas.width - pw;
            if (left > maxLeft) left = maxLeft;
            if (left < minLeft) left = minLeft;

            // Flip above the line if the popup would overflow the canvas bottom.
            const canvasBottom = originY + this.canvas.height;
            if (top + ph > canvasBottom) {
                top = top - ph - 12 - 6;
            }
            if (top < originY) top = originY;

            el.style.left = `${left}px`;
            el.style.top = `${top}px`;
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
            // A fresh plain-text document has no paragraph-level attributes.
            this.paragraphAlignments = new Map();
            this.paragraphLists = new Map();
            this.syncParagraphIndents();
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
                } else if (item instanceof HorizontalRuleLink) {
                    // Must precede NewlineLink: HorizontalRuleLink extends it.
                    content.push({ type: 'hr' });
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

        // Rebuild the chain and paragraph attributes from a parsed document object,
        // placing the cursor at the end. Does not touch undo history, selection, or
        // trigger a render; callers handle those. Shared by fromJSON() and undo
        // snapshot restore.
        loadDocumentData(data) {
            const items = [];
            for (let entry of data.content) {
                if (entry.type === 'text') {
                    items.push(new TextLink(entry.text, FontProperties.fromObject(entry.font)));
                } else if (entry.type === 'hr') {
                    items.push(new HorizontalRuleLink());
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

            this.loadDocumentData(data);

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

            // Capture the full document (rich runs, paragraph attributes, rules,
            // links) plus cursor and selection so undo/redo are lossless.
            const snapshot = {
                doc: this.toJSON(),
                cursorPos: this.chain.getCursorCharPosition(),
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

            // Rebuild the document, then restore cursor and selection. Does not
            // touch the history stack (unlike fromJSON).
            this.loadDocumentData(snapshot.doc);
            this.chain.moveCursorToCharPosition(snapshot.cursorPos);
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

            // Remove the link-editor overlay if one was created.
            if (this.linkPopup && this.linkPopup.parentNode) {
                this.linkPopup.parentNode.removeChild(this.linkPopup);
                this.linkPopup = null;
            }
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

    exports.CanvasEditor = CanvasEditor;
    exports.Chain = Chain;
    exports.ChainLink = ChainLink;
    exports.CursorLink = CursorLink;
    exports.FontProperties = FontProperties;
    exports.NewlineLink = NewlineLink;
    exports.TextLink = TextLink;
    exports.VirtualNewlineLink = VirtualNewlineLink;

}));
