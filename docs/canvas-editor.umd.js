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
            let posX = 0;
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
                            posX = 0;
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
                        posX = 0;
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
                    posX = 0;
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

        enterPressed() {
            this.items.splice(this.cursorIdx(), 0, new NewlineLink());
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
                    color = '#000000') {
            this.size = size;
            this.family = family;
            this.weight = weight;
            this.style = style;
            this.underline = underline;
            this.strikethrough = strikethrough;
            this.superscript = superscript;
            this.subscript = subscript;
            this.color = color;
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
                   this.color === other.color;
        }

        clone() {
            return new FontProperties(this.size, this.family, this.weight, this.style,
                                       this.underline, this.strikethrough, this.superscript, this.subscript,
                                       this.color);
        }

        toFontString() {
            return `${this.style} ${this.weight} ${this.size}px ${this.family}`;
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

    exports.CanvasEditor = CanvasEditor;
    exports.Chain = Chain;
    exports.ChainLink = ChainLink;
    exports.CursorLink = CursorLink;
    exports.FontProperties = FontProperties;
    exports.NewlineLink = NewlineLink;
    exports.TextLink = TextLink;
    exports.VirtualNewlineLink = VirtualNewlineLink;

}));
