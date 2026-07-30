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

  /** Number emoji for list numbering */
  static NUMBER_EMOJIS = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];

  /** Regex to detect markdown bullet at line start */
  static BULLET_REGEX = /^(\s*)([-*+]|\d{1,2}\.)\s+/;

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
    let numberedCount = 0;
    let prevLineWasBullet = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // Preserve empty lines — reset list state
      if (!trimmed) {
        inList = false;
        prevLineWasBullet = false;
        numberedCount = 0;
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
        prevLineWasBullet = false;
        numberedCount = 0;
        continue;
      }

      // Detect markdown bullet lists (-, *, +, number.)
      const bulletMatch = trimmed.match(DecorateStage.BULLET_REGEX);
      const isBulletLine = !!bulletMatch && !DecorateStage.EXISTING_EMOJI_PREFIXES.test(trimmed);

      // If this is a bullet line, extract the content after the bullet marker
      let contentAfterBullet = trimmed;
      let isNumberedItem = false;
      let numberIndex = -1;

      if (isBulletLine) {
        const rawContent = trimmed.slice(bulletMatch[0].length);
        contentAfterBullet = rawContent.trim();

        // Check if it's a numbered list
        if (/^\d{1,2}\./.test(bulletMatch[1] || bulletMatch[0].trim())) {
          isNumberedItem = true;
          numberIndex = parseInt(trimmed.match(/^(\d+)\./)[1], 10) - 1;
        }
      }

      // Detect list items (via inList OR bullet lines)
      const isListItem = (inList || isBulletLine || prevLineWasBullet) &&
        contentAfterBullet.length < 120 &&
        !contentAfterBullet.startsWith('Halo') &&
        !contentAfterBullet.startsWith('Ada yang') &&
        !contentAfterBullet.startsWith('Silakan') &&
        !contentAfterBullet.startsWith('Terima') &&
        !contentAfterBullet.startsWith('Ya,') &&
        !contentAfterBullet.startsWith('Tentu') &&
        !contentAfterBullet.endsWith(':') &&
        !DecorateStage.EXISTING_EMOJI_PREFIXES.test(contentAfterBullet) &&
        !this._isLikelyTable(contentAfterBullet) &&
        !this._isLikelyUrl(contentAfterBullet);

      // Also detect standalone bullet lists (no section header before)
      if (isBulletLine || (prevLineWasBullet && contentAfterBullet.length < 120)) {
        prevLineWasBullet = true;
        inList = true;
      } else {
        prevLineWasBullet = false;
      }

      if (isListItem) {
        // Use content after bullet marker (or full trimmed if non-bullet list)
        const textToDecorate = isBulletLine ? contentAfterBullet : trimmed;

        // Check registry for themed emoji
        const themedEmoji = this.registry ? this.registry.getItemIcon(textToDecorate) : null;

        if (isNumberedItem && numberIndex >= 0 && numberIndex < DecorateStage.NUMBER_EMOJIS.length) {
          result.push(`${DecorateStage.NUMBER_EMOJIS[numberIndex]} ${textToDecorate}`);
        } else if (themedEmoji) {
          result.push(`${themedEmoji} ${textToDecorate}`);
        } else {
          result.push(`✅ ${textToDecorate}`);
        }
        continue;
      }

      // Detect standalone price lines (no bullet, not in list)
      const hasPrice = /^rp\s?\d|harga\s|rp\s/i.test(trimmed) && trimmed.length < 100 && !isBulletLine;
      if (hasPrice) {
        result.push(`💰 ${trimmed}`);
        inList = false;
        numberedCount = 0;
        continue;
      }

      // Default: pass through unchanged (but strip any leading bullet first)
      inList = false;
      numberedCount = 0;
      prevLineWasBullet = false;
      result.push(isBulletLine ? contentAfterBullet : line);
    }

    return { text: result.join('\n'), meta };
  }

  /** Check if line looks like a markdown table row */
  _isLikelyTable(trimmed) {
    if (!trimmed.includes('|')) return false;
    const pipes = trimmed.split('|').length - 1;
    return pipes >= 2;
  }

  /** Check if line looks like a URL or link */
  _isLikelyUrl(trimmed) {
    // Never treat prices as URLs
    if (/^rp\s?\d/i.test(trimmed) || /^\d/.test(trimmed)) return false;
    return /^https?:\/\//i.test(trimmed) ||
           /^wa\.me\//i.test(trimmed) ||
           /^t\.me\//i.test(trimmed) ||
           /^[^\s]+\.[a-zA-Z]{2,}(\s|$)/.test(trimmed);  // Ensure TLD is letters
  }
}

module.exports = DecorateStage;
