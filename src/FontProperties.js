/**
 * FontProperties - Manages font styling properties for text
 */
export class FontProperties {
    constructor(size = 16, family = 'Arial', weight = 'normal', style = 'normal',
                underline = false, strikethrough = false, superscript = false, subscript = false) {
        this.size = size;
        this.family = family;
        this.weight = weight;
        this.style = style;
        this.underline = underline;
        this.strikethrough = strikethrough;
        this.superscript = superscript;
        this.subscript = subscript;
    }

    doPropertiesMatch(other) {
        return this.size === other.size &&
               this.family === other.family &&
               this.weight === other.weight &&
               this.style === other.style &&
               this.underline === other.underline &&
               this.strikethrough === other.strikethrough &&
               this.superscript === other.superscript &&
               this.subscript === other.subscript;
    }

    clone() {
        return new FontProperties(this.size, this.family, this.weight, this.style,
                                   this.underline, this.strikethrough, this.superscript, this.subscript);
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
