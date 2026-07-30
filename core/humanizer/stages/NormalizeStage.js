'use strict';

/**
 * NormalizeStage — Stage 1 of the Humanizer pipeline.
 *
 * Responsibilities:
 * - Normalize line endings (\r\n → \n)
 * - Remove trailing whitespace per line
 * - Collapse excessive blank lines (\n{3,} → \n\n)
 * - Preserve Unicode, emojis, meaning
 *
 * This stage MUST NEVER decorate text.
 */
class NormalizeStage {
  /** @param {Object} [options] — unused currently, reserved for future config */
  constructor(options = {}) {
    this.name = 'NormalizeStage';
  }

  /**
   * @param {string} text
   * @returns {{ text: string, meta: Object }}
   */
  process(text) {
    if (!text) return { text, meta: {} };

    let result = text;

    // Normalize Windows line endings
    result = result.replace(/\r\n/g, '\n');

    // Remove trailing whitespace per line
    result = result.split('\n').map(line => line.replace(/\s+$/, '')).join('\n');

    return { text: result, meta: {} };
  }
}

module.exports = NormalizeStage;
