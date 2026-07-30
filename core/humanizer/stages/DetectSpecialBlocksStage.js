'use strict';

/**
 * DetectSpecialBlocksStage — Stage 6 of the Humanizer pipeline.
 *
 * Responsibilities:
 * - Detect URLs, prices, tables, code blocks, quoted blocks
 * - Return metadata for DecorateStage: specialBlocks[] with lineIndex, type, content
 *
 * Does NOT modify text.
 * Does NOT decorate.
 */
class DetectSpecialBlocksStage {
  constructor(options = {}) {
    this.name = 'DetectSpecialBlocksStage';
  }

  /**
   * @param {string} text
   * @param {Object} meta — from previous stages
   * @returns {{ text: string, meta: { specialBlocks: Array } }}
   */
  process(text, meta = {}) {
    const specialBlocks = [];
    if (!text) return { text, meta: { ...meta, specialBlocks } };

    const lines = text.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      if (!trimmed) continue;

      // URL detection
      if (this._isUrl(trimmed)) {
        specialBlocks.push({ lineIndex: i, type: 'url', content: trimmed });
        continue;
      }

      // Price detection (standalone price line)
      if (this._isPrice(trimmed)) {
        specialBlocks.push({ lineIndex: i, type: 'price', content: trimmed });
        continue;
      }

      // Table detection
      if (this._isTable(trimmed, lines, i)) {
        specialBlocks.push({ lineIndex: i, type: 'table', content: trimmed });
        continue;
      }

      // Code block detection (backtick fence or indented code)
      if (this._isCodeBlock(trimmed, lines, i)) {
        specialBlocks.push({ lineIndex: i, type: 'code', content: trimmed });
        continue;
      }

      // Quoted block detection
      if (this._isQuote(trimmed)) {
        specialBlocks.push({ lineIndex: i, type: 'quote', content: trimmed });
        continue;
      }
    }

    return { text, meta: { ...meta, specialBlocks } };
  }

  /** Detect URL lines */
  _isUrl(trimmed) {
    return /^https?:\/\//i.test(trimmed) ||
           /^wa\.me\//i.test(trimmed) ||
           /^t\.me\//i.test(trimmed) ||
           /^[^\s]+\.[a-zA-Z]{2,}(\s|$)/.test(trimmed) ||
           /^@\w+/.test(trimmed);
  }

  /** Detect standalone price lines */
  _isPrice(trimmed) {
    return /^rp\s?\d/i.test(trimmed) && trimmed.length < 100;
  }

  /** Detect markdown table rows */
  _isTable(trimmed, lines, i) {
    if (!trimmed.includes('|')) return false;
    const pipes = trimmed.split('|').length - 1;
    if (pipes < 2) return false;
    // Check if next line is also a table (separator or data)
    if (i + 1 < lines.length) {
      const next = lines[i + 1].trim();
      if (next.includes('|') || /^[-| ]+$/.test(next)) return true;
    }
    return pipes >= 3; // Single row with many columns is likely a table
  }

  /** Detect code blocks (fenced or indented) */
  _isCodeBlock(trimmed, lines, i) {
    // Fenced code block marker
    if (/^```/.test(trimmed)) return true;
    if (/^~~~/.test(trimmed)) return true;
    return false;
  }

  /** Detect quoted lines */
  _isQuote(trimmed) {
    return /^>\s/.test(trimmed) || /^>/.test(trimmed);
  }
}

module.exports = DetectSpecialBlocksStage;
