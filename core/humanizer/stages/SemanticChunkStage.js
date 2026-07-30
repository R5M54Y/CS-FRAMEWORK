'use strict';

/**
 * SemanticChunkStage — Stage 9 of the Humanizer pipeline.
 *
 * Responsibilities:
 * - Detect logical section boundaries from the decorated text
 * - Each section becomes an independent semantic block
 * - Opening paragraph before sections is its own chunk
 * - Content after last section stays with last section
 * - Never split inside a list, URL, or price
 *
 * This stage does NOT modify text.
 * This stage does NOT enforce size limits.
 * This stage ONLY identifies where semantic chunks should be split.
 */
class SemanticChunkStage {
  constructor(options = {}) {
    this.name = 'SemanticChunkStage';
  }

  /** Lines matching this pattern are section headers (emoji prefix + keyword + colon) */
  static HEADER_PATTERN = /^[📦💰✨✳️👉💳📞📍🕒🚚⬇️🎁🛡️📝❓💡⭐✅❌🔗🛒📚📄🃏🧩🏡♻️📧⬆️✅👶] .+:$/u;

  /**
   * @param {string} text
   * @param {Object} meta
   * @returns {{ text: string, meta: { chunkBoundaries: Array } }}
   */
  process(text, meta = {}) {
    const chunkBoundaries = [];
    if (!text) return { text, meta: { ...meta, chunkBoundaries } };

    const lines = text.split('\n');
    let openerEnd = -1;

    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();

      // Detect decorated section headers: "📦 Produk:", "💰 Harga:", etc.
      if (SemanticChunkStage.HEADER_PATTERN.test(trimmed)) {
        if (chunkBoundaries.length === 0) {
          // First header found — everything before it is the opening chunk
          // Only add opener boundary if there's non-empty content before
          for (let j = 0; j < i; j++) {
            if (lines[j].trim().length > 0) {
              chunkBoundaries.push(0);
              openerEnd = i;
              break;
            }
          }
        }
        // This header starts a new chunk
        chunkBoundaries.push(i);
      }
    }

    // If no sections detected, the entire text is one chunk
    if (chunkBoundaries.length === 0) {
      chunkBoundaries.push(0);
    }

    // De-duplicate and sort
    const unique = [...new Set(chunkBoundaries)].sort((a, b) => a - b);

    return { text, meta: { ...meta, chunkBoundaries: unique } };
  }
}

module.exports = SemanticChunkStage;
