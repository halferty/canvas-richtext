/**
 * FontProperties - Manages font styling properties for text
 */
export class FontProperties {
    constructor(size = 16, family = 'Arial', weight = 'normal', style = 'normal') {
        this.size = size;
        this.family = family;
        this.weight = weight;
        this.style = style;
    }

    doPropertiesMatch(other) {
        return this.size === other.size &&
               this.family === other.family &&
               this.weight === other.weight &&
               this.style === other.style;
    }

    clone() {
        return new FontProperties(this.size, this.family, this.weight, this.style);
    }

    toFontString() {
        return `${this.style} ${this.weight} ${this.size}px ${this.family}`;
    }
}
