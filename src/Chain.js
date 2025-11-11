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
        console.log(s, ...colors);
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
        throw new Error("CursorLink not found!");
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
            let lineHeight = Math.max(currentLineMaxAscent + currentLineMaxDescent, currentLineMaxFontSize) * ((currentLineNum !== 0) ? this.LINE_SPACING_MULT : 1);
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
        this.chunkTextLinks();
        this.recalcXPositions();
        this.recalcYPositions();
        this.printItems();
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
                        this.items.splice(this.cursorIdx(), 1);
                        const text = this.items[i].text;
                        this.items[i].text = text.substring(0, text.length - 1);
                        this.items.splice(i + 1, 0, new TextLink(text.substring(text.length - 1), this.items[i].intrinsic.fontProperties.clone()));
                        this.items.splice(i + 1, 0, new CursorLink());
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
                    if (this.items[i].text.length === 1) {
                        this.items.splice(this.cursorIdx(), 1);
                        this.items.splice(i + 1, 0, new CursorLink());
                    } else {
                        this.items.splice(this.cursorIdx(), 1);
                        const text = this.items[i - 1].text;
                        this.items[i - 1].text = text.substring(1);
                        this.items.splice(i - 1, 0, new TextLink(text.substring(0, 1), this.items[i - 1].intrinsic.fontProperties.clone()));
                        this.items.splice(i, 0, new CursorLink());
                    }
                    break;
                } else if (this.items[i] instanceof NewlineLink) {
                    this.items.splice(this.cursorIdx(), 1);
                    this.items.splice(i + 1, 0, new CursorLink());
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
                let charIdx = item.getCharIdxFromX(this.ctx, x);
                if (charIdx !== null) {
                    const cursorIdx = this.cursorIdx();
                    this.items.splice(cursorIdx, 1);
                    const text = item.text;
                    item.text = text.substring(0, charIdx);
                    this.items.splice(i + 1, 0, new TextLink(text.substring(charIdx, text.length), item.intrinsic.fontProperties.clone()));
                    this.items.splice(i + 1, 0, new CursorLink());
                    hitTextLink = true;
                }
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
}
