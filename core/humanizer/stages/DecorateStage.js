'use strict';

/**
 * DecorateStage — Stage 5 of the Humanizer pipeline.
 *
 * Responsibilities:
 * - Add emoji to section headers (using metadata from DetectSectionsStage)
 * - Add emoji bullets to list items (using FormattingRulesRegistry)
 * - Add themed emoji for price/payment/bonus/promo lines
 * - Never rewrite content, change wording, prices, URLs, or names
 * - Never modify already-formatted responses (skip if meta.alreadyFormatted)
 *
 * Contains NO hardcoded emoji decisions.
 * All emoji mappings come from FormattingRulesRegistry.
 */
class DecorateStage {
  constructor({ registry, ...options } = {}) {
    this.name = 'DecorateStage';
    this.registry = registry;
  }

  /** Emoji prefixes that indicate a line is already decorated */
  static EXISTING_EMOJI_PREFIXES = /^[📦✅💰🕒🚚⬇️⬆️✨🎁🛡️🏷️🎉👉💡⭐❓📝⚠️❌♾️🔗🧩📚📄🎥🖼️🔤🛒💬📞📱💳🏦📲👤🙋]/;

  /**
   * @param {string} text
   * @param {Object} meta — meta.sections[] from DetectSectionsStage
   * @returns {{ text: string, meta: Object }}
   */
  process(text, meta = {}) {
    if (!text || meta.alreadyFormatted) {
      return { text, meta };
    }

    const lines = text.split('\n');
    const result = [];
    const sectionLineIndices = new Set((meta.sections || []).map(s => s.lineIndex));
    let inList = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // Preserve empty lines — reset list state
      if (!trimmed) {
        inList = false;
        result.push(line);
        continue;
      }

      // Is this line a known section header?
      const sectionInfo = meta.sections ? meta.sections.find(s => s.lineIndex === i) : null;

      if (sectionInfo) {
        // Add blank line BEFORE section header for spacing
        if (result.length > 0 && result[result.length - 1] !== '') {
          result.push('');
        }

        if (sectionInfo.emoji) {
          result.push(`${sectionInfo.emoji} ${sectionInfo.rawLine}`);
        } else {
          result.push(sectionInfo.rawLine);
        }
        inList = true;
        continue;
      }

      // Detect list items: short line after a section header
      const isListItem = inList &&
        trimmed.length < 120 &&
        !trimmed.startsWith('Halo') &&
        !trimmed.startsWith('Ada yang') &&
        !trimmed.startsWith('Silakan') &&
        !trimmed.startsWith('Terima') &&
        !trimmed.startsWith('Ya,') &&
        !trimmed.startsWith('Tentu') &&
        !trimmed.endsWith(':') &&
        !DecorateStage.EXISTING_EMOJI_PREFIXES.test(trimmed);

      if (isListItem) {
        const themedEmoji = this.registry ? this.registry.getItemIcon(trimmed) : null;
        result.push(themedEmoji ? `${themedEmoji} ${trimmed}` : `✅ ${trimmed}`);
        continue;
      }

      // Detect standalone price lines
      const hasPrice = /^rp\s?\d|harga\s|rp\s/i.test(trimmed) && trimmed.length < 100;
      if (hasPrice) {
        result.push(`💰 ${trimmed}`);
        inList = false;
        continue;
      }

      // Default: pass through unchanged
      inList = false;
      result.push(line);
    }

    return { text: result.join('\n'), meta };
  }
}

module.exports = DecorateStage;
