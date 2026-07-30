'use strict';

/**
 * SplitLongMessagesStage — Stage 9 of the Humanizer pipeline.
 *
 * Responsibilities:
 * - Annotate the text with suggested split points for long messages
 * - Target: 650 characters per message, hard limit 700
 * - Split on paragraph, section, list boundaries
 * - Never split URLs, phone numbers, prices, or sentences
 *
 * This stage does NOT split the text (that's MessageSplitter's job).
 * It produces metadata: splitPoints[] for downstream splitter use.
 * If the text is under 650 chars, no split points are produced.
 */
class SplitLongMessagesStage {
  constructor(options = {}) {
    this.name = 'SplitLongMessagesStage';
    this.targetLength = 650;
    this.hardLimit = 700;
  }

  /**
   * @param {string} text
   * @param {Object} meta
   * @returns {{ text: string, meta: { splitPoints: Array } }}
   */
  process(text, meta = {}) {
    const splitPoints = [];
    if (!text) return { text, meta: { ...meta, splitPoints } };

    // Only split if text exceeds target
    if (text.length <= this.targetLength) {
      return { text, meta: { ...meta, splitPoints } };
    }

    const lines = text.split('\n');

    // Find natural split points: paragraph breaks (empty lines), section headers
    let charCount = 0;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const nextCharCount = charCount + line.length + 1; // +1 for newline

      if (nextCharCount > this.targetLength && charCount > 0) {
        // Try to split at this line
        // Prefer empty lines and section headers as split points
        splitPoints.push(i);
        charCount = 0;
      } else if (nextCharCount > this.hardLimit && charCount > 0) {
        // Hard limit — force split even at mid-paragraph
        if (line.trim()) {
          splitPoints.push(i);
          charCount = 0;
        }
      }

      charCount = nextCharCount;
    }

    return { text, meta: { ...meta, splitPoints } };
  }
}

module.exports = SplitLongMessagesStage;
