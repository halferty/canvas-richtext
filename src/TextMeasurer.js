/**
 * Interface for measuring text dimensions
 * Can be implemented with real canvas context or mock for testing
 */
export class TextMeasurer {
    /**
     * Measure text with given font properties
     * @param {string} text - The text to measure
     * @param {FontProperties} fontProperties - Font properties
     * @returns {{width: number, ascent: number, descent: number}}
     */
    measureText(text, fontProperties) {
        throw new Error('measureText must be implemented');
    }
}

/**
 * Canvas-based text measurer using 2D context
 */
export class CanvasTextMeasurer extends TextMeasurer {
    constructor(ctx) {
        super();
        this.ctx = ctx;
    }
    
    measureText(text, fontProperties) {
        this.ctx.save();
        fontProperties.setOnContext(this.ctx);
        const metrics = this.ctx.measureText(text);
        this.ctx.restore();
        
        return {
            width: metrics.width,
            ascent: metrics.actualBoundingBoxAscent || fontProperties.size * 0.8,
            descent: metrics.actualBoundingBoxDescent || fontProperties.size * 0.2
        };
    }
}

/**
 * Mock text measurer for testing
 * Estimates text width based on character count
 */
export class MockTextMeasurer extends TextMeasurer {
    constructor(charWidth = 8, ascent = 12, descent = 4) {
        super();
        this.charWidth = charWidth;
        this.ascent = ascent;
        this.descent = descent;
    }
    
    measureText(text, fontProperties) {
        // Simple estimation: each character is charWidth pixels
        const width = text.length * this.charWidth;
        
        // Scale ascent/descent by font size
        const scale = fontProperties.size / 16;
        
        return {
            width,
            ascent: this.ascent * scale,
            descent: this.descent * scale
        };
    }
}
