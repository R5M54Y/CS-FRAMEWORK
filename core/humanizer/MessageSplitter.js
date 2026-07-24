'use strict';

/**
 * MessageSplitter — splits a single AI response into multiple natural bubbles.
 *
 * Strategy: paragraph-based split on double newline (\n\n).
 * - Each paragraph becomes one message bubble
 * - Max bubbles capped by config.splitMessage.maxMessages (default 3)
 * - Trailing/leading whitespace trimmed
 * - Empty paragraphs dropped
 *
 * Future: sentence-based split for languages without paragraph convention.
 */
class MessageSplitter {
  /**
   * @param {Object} config — HumanizerConfig.splitMessage section
   */
  constructor(config) {
    this.enabled = config.enabled;
    this.maxMessages = config.maxMessages;
    this.separator = config.separator || '\n\n';
  }

  /**
   * Split text into message parts.
   * @param {string} text
   * @returns {string[]} array of message parts (length ≤ maxMessages)
   */
  split(text) {
    if (!this.enabled || !text) return [text];

    const parts = text
      .split(this.separator)
      .map((p) => p.trim())
      .filter((p) => p.length > 0);

    if (parts.length <= 1) return [text];

    // Cap at maxMessages — merge excess into last part
    if (parts.length > this.maxMessages) {
      const keep = parts.slice(0, this.maxMessages - 1);
      const rest = parts.slice(this.maxMessages - 1).join(this.separator);
      return [...keep, rest];
    }

    return parts;
  }
}

module.exports = MessageSplitter;