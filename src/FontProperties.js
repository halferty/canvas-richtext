/**
 * FontProperties - Manages font styling properties for text
 */
export class FontProperties {
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
