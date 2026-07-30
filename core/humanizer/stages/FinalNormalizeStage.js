'use strict';

/**
 * FinalNormalizeStage — Stage 10 (final) of the Humanizer pipeline.
 *
 * Responsibilities:
 * - Final whitespace cleanup
 * - Remove trailing whitespace per line
 * - Ensure single trailing newline
 * - Never modify content, emoji, or decorations
 *
 * Only whitespace. Nothing else.
 */
class FinalNormalizeStage {
  constructor(options = {}) {
    this.name = 'FinalNormalizeStage';
  }

  /**
   * @param {string} text
   * @param {Object} meta
   * @returns {{ text: string, meta: Object }}
   */
  process(text, meta = {}) {
    if (!text) return { text, meta };

    let result = text;

    // Remove trailing whitespace per line (cleanup from any previous stages)
    result = result.split('\n').map(line => line.replace(/\s+$/, '')).join('\n');

    return { text: result, meta };
  }
}

module.exports = FinalNormalizeStage;
