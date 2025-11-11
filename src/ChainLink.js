/**
 * Base class for all chain links
 */
export class ChainLink {
    constructor() {
        this.intrinsic = {};
        this.computed = {};
    }
}

/**
 * TextLink - Represents a piece of text with specific font properties
 */
export class TextLink extends ChainLink {
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
            if (y >= this.computed.posY && y <= this.computed.posY + this.computed.lineHeight) {
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
        return null;
    }
}

/**
 * CursorLink - Represents the text cursor position
 */
export class CursorLink extends ChainLink {}

/**
 * VirtualNewlineLink - Represents a line wrap (not user-created)
 */
export class VirtualNewlineLink extends ChainLink {}

/**
 * NewlineLink - Represents an actual newline character (user-created)
 */
export class NewlineLink extends ChainLink {}
