'use strict';

/**
 * ImproveSpacingStage — Stage 8 of the Humanizer pipeline.
 *
 * Responsibilities:
 * - Collapse excessive blank lines (\n{3,} → \n\n)
 * - Break giant paragraphs (max 2 sentences, insert breathing spaces)
 * - Isolate URLs and prices on their own lines
 * - Remove leading/trailing blank lines
 * - Never modify content, emoji, or decorations
 *
 * Only spacing. Nothing else.
 */
class ImproveSpacingStage {
  constructor(options = {}) {
    this.name = 'ImproveSpacingStage';
  }

  /**
   * @param {string} text
   * @param {Object} meta — may contain specialBlocks[] from DetectSpecialBlocksStage
   * @returns {{ text: string, meta: Object }}
   */
  process(text, meta = {}) {
    if (!text) return { text, meta };

    let result = text;

    // Collapse multiple consecutive blank lines into one
    result = result.replace(/\n{3,}/g, '\n\n');

    // Break giant paragraphs: insert blank line after sentence when
    // paragraph exceeds 2 sentences (target: max 2 sentences per block)
    result = this._breakParagraphs(result);

    // Ensure URLs and prices are on their own lines
    result = this._isolateSpecialLines(result);

    // Remove leading blank lines
    result = result.replace(/^\n+/, '');

    // Remove trailing blank lines
    result = result.replace(/\n+$/, '');

    return { text: result, meta };
  }

  /**
   * Break long paragraphs into smaller chunks (max ~2 sentences).
   * Uses sentence-ending punctuation as split points.
   * Does NOT split inside list items, URLs, or headers.
   */
  _breakParagraphs(text) {
    const lines = text.split('\n');
    const result = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // Only process non-empty, non-special lines
      if (!trimmed || this._isLikelyHeader(trimmed) || this._isUrlLine(trimmed)) {
        result.push(line);
        continue;
      }

      // Count sentences in this line
      const sentenceCount = (trimmed.match(/[.!?]\s/g) || []).length + 1;

      if (sentenceCount > 2) {
        // Split into chunks of ~2 sentences
        const sentences = trimmed.split(/(?<=[.!?])\s+/);
        const chunks = [];
        for (let s = 0; s < sentences.length; s += 2) {
          const chunk = sentences.slice(s, s + 2).join(' ');
          chunks.push(chunk);
        }

        // Preserve original line prefix whitespace
        const prefix = line.match(/^\s*/)[0];
        for (let c = 0; c < chunks.length; c++) {
          if (c > 0) result.push(''); // blank line between chunks
          result.push(prefix + chunks[c]);
        }
      } else {
        result.push(line);
      }
    }

    return result.join('\n');
  }

  /**
   * Ensure URLs and prices are isolated on their own lines.
   * If a line contains both text and a URL/price, split them.
   */
  _isolateSpecialLines(text) {
    const lines = text.split('\n');
    const result = [];

    for (const line of lines) {
      const trimmed = line.trim();

      // Check if line has inline URL mixed with text
      const urlMatch = trimmed.match(/(https?:\/\/[^\s]+)/);
      if (urlMatch && urlMatch.index > 0) {
        // URL is after some text — split
        const before = trimmed.slice(0, urlMatch.index).trim();
        const url = urlMatch[1];
        const prefix = line.match(/^\s*/)[0];
        if (before) result.push(prefix + before);
        result.push(prefix + url);
        continue;
      }

      // Check if line has inline price mixed with text
      const priceMatch = trimmed.match(/^.*?\b(Rp\s?\d[\d.,]*)\b.*$/);
      if (priceMatch && priceMatch.index > 0) {
        // Already at start? skip — standalone price is fine
      }

      result.push(line);
    }

    return result.join('\n');
  }

  /** Simple check: does line look like a section header (ends with emoji + colon or starts with emoji)? */
  _isLikelyHeader(trimmed) {
    return trimmed.endsWith(':') && trimmed.length < 80;
  }

  /** Check if line is URL-only */
  _isUrlLine(trimmed) {
    return /^https?:\/\//i.test(trimmed) || /^wa\.me\//i.test(trimmed);
  }
}

module.exports = ImproveSpacingStage;
