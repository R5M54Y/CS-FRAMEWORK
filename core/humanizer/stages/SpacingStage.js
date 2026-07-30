'use strict';

/**
 * SpacingStage — Stage 6 (final) of the Humanizer pipeline.
 *
 * Responsibilities:
 * - Improve WhatsApp readability via spacing
 * - Collapse excessive blank lines (\n{3,} → \n\n)
 * - Never modify content, emoji, or decorations
 *
 * Only spacing. Nothing else.
 */
class SpacingStage {
  constructor(options = {}) {
    this.name = 'SpacingStage';
  }

  /**
   * @param {string} text
   * @param {Object} meta
   * @returns {{ text: string, meta: Object }}
   */
  process(text, meta = {}) {
    if (!text) return { text, meta };

    let result = text;

    // Collapse multiple consecutive blank lines into one
    result = result.replace(/\n{3,}/g, '\n\n');

    // Remove leading blank lines
    result = result.replace(/^\n+/, '');

    // Remove trailing blank lines
    result = result.replace(/\n+$/, '');

    return { text: result, meta };
  }
}

module.exports = SpacingStage;
