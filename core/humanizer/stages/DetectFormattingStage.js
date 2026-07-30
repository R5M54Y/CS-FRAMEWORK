'use strict';

/**
 * DetectFormattingStage — Stage 2 of the Humanizer pipeline.
 *
 * Responsibilities:
 * - Detect whether the AI already produced emoji formatting
 * - If already formatted, set meta.alreadyFormatted = true so downstream stages skip
 * - Never modify text
 *
 * The emoji list must match the emojis used by DecorateStage & DetectSectionsStage.
 */
class DetectFormattingStage {
  constructor({ registry, ...options } = {}) {
    this.name = 'DetectFormattingStage';
    this.registry = registry;
  }

  /** Broad Unicode emoji ranges covering all common emoji families */
  static EMOJI_RANGES = /[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{2300}-\u{23FF}\u{2B50}\u{2934}\u{2935}\u{25AA}\u{25AB}\u{25FB}\u{25FC}\u{25FE}\u{25FD}\u{FE0F}]/u;

  /**
   * @param {string} text
   * @returns {{ text: string, meta: { alreadyFormatted: boolean } }}
   */
  process(text) {
    if (!text) return { text, meta: { alreadyFormatted: false } };

    // Check if any decoration emoji exists (via registry)
    if (this.registry && this.registry.hasKnownEmoji(text)) {
      return { text, meta: { alreadyFormatted: true } };
    }

    // Also check for any Unicode emoji (broader check)
    if (DetectFormattingStage.EMOJI_RANGES.test(text)) {
      return { text, meta: { alreadyFormatted: true } };
    }

    return { text, meta: { alreadyFormatted: false } };
  }
}

module.exports = DetectFormattingStage;
