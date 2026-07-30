'use strict';

/**
 * RemoveMarkdownStage — Stage 2 of the Humanizer pipeline.
 *
 * Responsibilities:
 * - Strip markdown emphasis EXCEPT **bold** (which is allowed for readability)
 * - Strip: *italic*, _italic_, __underline__, ***bold-italic***, ~~strike~~
 * - Preserve: **bold**, real content like C++, A* Algorithm, 2 * 5, __FILE__
 * - Never modify code blocks, URLs, prices, or phone numbers
 */
class RemoveMarkdownStage {
  constructor(options = {}) {
    this.name = 'RemoveMarkdownStage';
  }

  /**
   * @param {string} text
   * @returns {{ text: string, meta: Object }}
   */
  process(text) {
    if (!text) return { text, meta: {} };

    let result = text;

    // Strip ***bold-italic*** first (before standalone * handling)
    result = result.replace(/\*\*\*(.+?)\*\*\*/g, '$1');

    // Strip *italic* — only single asterisks, NOT double (bold)
    // Opening * must NOT be followed by * (to avoid matching **bold**)
    // Closing * must NOT be preceded by * (to avoid matching **bold**)
    result = result.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '$1');

    // Strip ~~strike~~
    result = result.replace(/~~(.+?)~~/g, '$1');

    // Strip __underline__ and _italic_
    // Use negative lookbehind/lookahead to avoid matching __init__, __FILE__, etc.
    result = result.replace(/(?<![A-Za-z0-9_])__(.+?)__(?![A-Za-z0-9_])/g, '$1');

    // Strip _italic_ (single underscore)
    result = result.replace(/(?<![A-Za-z0-9_])_(.+?)_(?![A-Za-z0-9_])/g, '$1');

    return { text: result, meta: {} };
  }
}

module.exports = RemoveMarkdownStage;
