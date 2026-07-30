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
    this.targetLength = 550;
    this.hardLimit = 700;
  }

  /** Detect decorated section headers (emoji + text + colon) */
  static HEADER_PATTERN = /^[📦💰✨✳️👉💳📞📍🕒🚚⬇️🎁🛡️📝❓💡⭐✅❌🔗🛒📚📄🃏🧩🏡♻️📧⬆️✅👶] .+:$/u;

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

  /** Protected patterns that must never be split */
  static PROTECTED_LINE = /^(https?:\/\/|Rp\s?\d|\+\d{2,}|👉\s|⬇️\s|💰\s|🔗\s|📱\s)/i;

  /** Split oversized chunk by paragraphs, then sentences */
  _subSplit(text) {
    if (text.length <= this.hardLimit) return [text];
    const result = [];
    let remaining = text;

    while (remaining.length > 0) {
      if (remaining.length <= this.hardLimit) { result.push(remaining); break; }

      // Try paragraph split, but ensure we don't split before a protected line
      const paragraphSplit = this._safeSplit(remaining, '\n\n', this.targetLength);
      if (paragraphSplit > 0) {
        result.push(remaining.slice(0, paragraphSplit).trim());
        remaining = remaining.slice(paragraphSplit + 2).trim();
        continue;
      }

      // Try sentence boundary
      const sentenceSplit = this._safeSentenceSplit(remaining);
      if (sentenceSplit > 0) {
        result.push(remaining.slice(0, sentenceSplit).trim());
        remaining = remaining.slice(sentenceSplit).trim();
        continue;
      }

      // Hard limit
      result.push(remaining.slice(0, this.hardLimit).trim());
      remaining = remaining.slice(this.hardLimit).trim();
    }

    return result.filter(Boolean);
  }

  /** Find safe paragraph split point — never before a protected line */
  _safeSplit(text, delimiter, beforePos) {
    let pos = text.lastIndexOf(delimiter, beforePos);
    while (pos > 0) {
      const after = text.slice(pos + delimiter.length).trimStart();
      if (!SplitLongMessagesStage.PROTECTED_LINE.test(after)) {
        return pos;
      }
      // Move backward to find an earlier split point
      pos = text.lastIndexOf(delimiter, pos - 1);
    }
    return -1;
  }

  /** Find sentence boundary, avoiding protected content */
  _safeSentenceSplit(text) {
    const candidates = ['. ', '! ', '? ', '.\n', '!\n', '?\n'];
    let best = -1;
    for (const c of candidates) {
      const idx = text.lastIndexOf(c, this.targetLength);
      if (idx > best) {
        // Check the line after the split is not a protected line
        const after = text.slice(idx + c.length).trimStart();
        if (!SplitLongMessagesStage.PROTECTED_LINE.test(after)) {
          best = idx + 1;
        }
      }
    }
    return best;
  }
}

module.exports = SplitLongMessagesStage;
