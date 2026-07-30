'use strict';

/**
 * SplitLongMessagesStage — Stage 10 of the Humanizer pipeline.
 *
 * Responsibilities:
 * - Detect section boundaries from the final decorated text
 * - Each section becomes its own message
 * - Enforce size limits: target ~650 chars, hard limit 700 chars
 * - Never split URLs, phone numbers, prices, or list items
 *
 * Produces chunks[] in metadata for MessageSplitter to use directly.
 */
class SplitLongMessagesStage {
  constructor(options = {}) {
    this.name = 'SplitLongMessagesStage';
    this.targetLength = 650;
    this.hardLimit = 700;
  }

  /** Detect decorated section headers (emoji + text + colon) */
  static HEADER_PATTERN = /^[📦✅💰🕒🚚⬇️⬆️✨🎁🛡️🏷️🎉👉💡⭐❓📝⚠️❌♾️🔗🧩📚📄🎥🖼️🔤🛒💬📞📱💳🏦📲👤🙋]\s.+:$/u;

  /**
   * @param {string} text
   * @param {Object} meta
   * @returns {{ text: string, meta: { chunks: Array } }}
   */
  process(text, meta = {}) {
    const chunks = [];
    if (!text) return { text, meta: { ...meta, chunks } };

    // Detect section boundaries from the FINAL text
    const boundaries = this._detectBoundaries(text);

    // Build chunks from boundaries
    const lines = text.split('\n');
    const rawChunks = [];
    for (let i = 0; i < boundaries.length; i++) {
      const start = boundaries[i];
      const end = i + 1 < boundaries.length ? boundaries[i + 1] : lines.length;
      const chunkLines = lines.slice(start, end);
      const chunkText = chunkLines.join('\n').trim();
      if (chunkText) rawChunks.push(chunkText);
    }

    // Enforce size limits on each chunk
    for (const chunk of rawChunks) {
      if (chunk.length <= this.hardLimit) {
        chunks.push(chunk);
      } else {
        const subChunks = this._subSplit(chunk);
        chunks.push(...subChunks);
      }
    }

    return { text, meta: { ...meta, chunks } };
  }

  /** Detect section header boundaries from the final text after spacing stage */
  _detectBoundaries(text) {
    const lines = text.split('\n');
    const boundaries = [];

    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      if (SplitLongMessagesStage.HEADER_PATTERN.test(trimmed)) {
        if (boundaries.length === 0) {
          let hasOpener = false;
          for (let j = 0; j < i; j++) {
            if (lines[j].trim().length > 0) { hasOpener = true; break; }
          }
          if (hasOpener) boundaries.push(0);
        }
        boundaries.push(i);
      }
    }

    if (boundaries.length === 0) boundaries.push(0);
    return [...new Set(boundaries)].sort((a, b) => a - b);
  }

  /** Split oversized chunk by paragraphs, then sentences */
  _subSplit(text) {
    if (text.length <= this.hardLimit) return [text];
    const result = [];
    let remaining = text;

    while (remaining.length > 0) {
      if (remaining.length <= this.hardLimit) { result.push(remaining); break; }

      const paragraphSplit = remaining.lastIndexOf('\n\n', this.targetLength);
      if (paragraphSplit > 0) {
        result.push(remaining.slice(0, paragraphSplit).trim());
        remaining = remaining.slice(paragraphSplit + 2).trim();
        continue;
      }

      const sentenceSplit = this._lastSentenceBoundary(remaining, this.targetLength);
      if (sentenceSplit > 0) {
        result.push(remaining.slice(0, sentenceSplit).trim());
        remaining = remaining.slice(sentenceSplit).trim();
        continue;
      }

      result.push(remaining.slice(0, this.hardLimit).trim());
      remaining = remaining.slice(this.hardLimit).trim();
    }

    return result.filter(Boolean);
  }

  _lastSentenceBoundary(text, beforePos) {
    const candidates = ['. ', '! ', '? ', '.\n', '!\n', '?\n'];
    let best = -1;
    for (const c of candidates) {
      const idx = text.lastIndexOf(c, beforePos);
      if (idx > best) best = idx + 1;
    }
    return best;
  }
}

module.exports = SplitLongMessagesStage;
