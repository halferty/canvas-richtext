import { TextLink, CursorLink, VirtualNewlineLink, NewlineLink } from './ChainLink.js';

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
        this.printItems();
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

    leftArrowPressed() {
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

    enterPressed() {
        this.items.splice(this.cursorIdx(), 0, new NewlineLink());
        this.recalc();
    }

    clicked(x, y) {
        let hitTextLink = false;
        for (let i = 0; i < this.items.length; i++) {
            const item = this.items[i];
            if (item instanceof TextLink && item.clickHits(this.ctx, x, y)) {
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
            let foundTextLink = false;
            for (let i = this.items.length - 1; i >= 0; i--) {
                if (this.items[i] instanceof TextLink) {
                    const lineHeight = this.items[i].computed.lineHeight;
                    if (y >= this.items[i].computed.posY - lineHeight && y <= this.items[i].computed.posY + lineHeight) {
                        this.items.splice(this.cursorIdx(), 1);
                        this.items.splice(i + 1, 0, new CursorLink());
                        foundTextLink = true;
                        break;
                    }
                }
            }
            if (!foundTextLink) {
                this.items.splice(this.cursorIdx(), 1);
                this.items.push(new CursorLink());
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

