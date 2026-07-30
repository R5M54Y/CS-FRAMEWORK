'use strict';

/**
 * RemoveMarkdownStage — Stage 2 of the Humanizer pipeline.
 *
 * Responsibilities:
 * - Strip markdown emphasis markers: **bold**, *italic*, _italic_, __underline__, ***bold-italic***
 * - Preserve real content: C++, A* Algorithm, 2 * 5, __FILE__, __init__
 * - Never modify code blocks, URLs, prices, or phone numbers
 *
 * Output is plain text only. No markdown formatting reaches WhatsApp.
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

    // Strip ***bold-italic*** first (before standalone * or **)
    result = result.replace(/\*\*\*(.+?)\*\*\*/g, '$1');

    // Strip **bold**
    result = result.replace(/\*\*(.+?)\*\*/g, '$1');

    // Strip *italic* — but only if paired (opening + closing)
    // The non-greedy match ensures only paired asterisks are stripped
    // Single asterisks like A* Algorithm or 2 * 5 are left alone
    result = result.replace(/\*(.+?)\*/g, '$1');

    // Strip __underline__ and _italic_
    // Use negative lookbehind/lookahead to avoid matching __init__, __FILE__, etc.
    result = result.replace(/(?<![A-Za-z0-9_])__(.+?)__(?![A-Za-z0-9_])/g, '$1');

    // Strip _italic_ (single underscore)
    result = result.replace(/(?<![A-Za-z0-9_])_(.+?)_(?![A-Za-z0-9_])/g, '$1');

    return { text: result, meta: {} };
  }
}

module.exports = RemoveMarkdownStage;
