'use strict';

/**
 * DecorateStage — Stage 7 of the Humanizer pipeline.
 *
 * Responsibilities:
 * - Apply emoji to section headers (using metadata from DetectSectionsStage)
 * - Apply emoji bullets to list items (using metadata from DetectListsStage + FormattingRulesRegistry)
 * - Apply themed emoji for prices and special blocks (using metadata from DetectSpecialBlocksStage)
 * - Never rewrite content, change wording, prices, URLs, or names
 * - Never modify already-formatted responses (skip if meta.alreadyFormatted)
 *
 * Contains NO hardcoded detection logic.
 * All detection comes from prior stages (DetectSections, DetectLists, DetectSpecialBlocks).
 * All emoji mappings come from FormattingRulesRegistry.
 */
class DecorateStage {
  constructor({ registry, ...options } = {}) {
    this.name = 'DecorateStage';
    this.registry = registry;
  }

  /** Emoji prefixes that indicate a line is already decorated */
  static EXISTING_EMOJI_PREFIXES = /^[📦✅💰🕒🚚⬇️⬆️✨🎁🛡️🏷️🎉👉💡⭐❓📝⚠️❌♾️🔗🧩📚📄🎥🖼️🔤🛒💬📞📱💳🏦📲👤🙋📧🃏👶♻️🏡]/u;

  /** Number emoji for list numbering (kept for fallback but contextual icons preferred) */
  static NUMBER_EMOJIS = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];

  /**
   * @param {string} text
   * @param {Object} meta — from DetectSectionsStage, DetectListsStage, DetectSpecialBlocksStage
   * @returns {{ text: string, meta: Object }}
   */
  process(text, meta = {}) {
    if (!text || meta.alreadyFormatted) {
      return { text, meta };
    }

    const lines = text.split('\n');
    const result = [];

    // Build lookup sets from metadata
    const sections = meta.sections || [];
    const listItems = meta.listItems || [];
    const specialBlocks = meta.specialBlocks || [];

    const sectionLineIndices = new Set(sections.map(s => s.lineIndex));
    const specialLineIndices = new Set(specialBlocks.map(s => s.lineIndex));
    const listItemMap = new Map(listItems.map(l => [l.lineIndex, l]));

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

      // Is this a known section header?
      const sectionInfo = sections.find(s => s.lineIndex === i);
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

      // Is this a known list item?
      const listInfo = listItemMap.get(i);
      if (listInfo) {
        inList = true;

        // Check special block metadata overlay
        const specialInfo = specialLineIndices.has(i) ? specialBlocks.find(s => s.lineIndex === i) : null;

        let themedEmoji = null;
        let textToDecorate = listInfo.content;

        // Priority: special block type > registry item match
        if (specialInfo && specialInfo.type === 'price') {
          themedEmoji = '💰';
        } else if (this.registry) {
          themedEmoji = this.registry.getItemIcon(textToDecorate);
        }

        // Numbered list items: prefer contextual icon, fallback to number emoji
        if (listInfo.isNumbered) {
          // Try contextual icon first (from registry item matching)
          if (themedEmoji) {
            result.push(`${themedEmoji} ${textToDecorate}`);
          } else if (listInfo.numberIndex >= 0 && listInfo.numberIndex < DecorateStage.NUMBER_EMOJIS.length) {
            // Fallback: use number emoji for order-important steps
            result.push(`${DecorateStage.NUMBER_EMOJIS[listInfo.numberIndex]} ${textToDecorate}`);
          } else {
            result.push(`✅ ${textToDecorate}`);
          }
        } else if (themedEmoji) {
          result.push(`${themedEmoji} ${textToDecorate}`);
        } else {
          result.push(`✅ ${textToDecorate}`);
        }
        continue;
      }

      // Is this a special block (price line not in list)?
      const specialInfo = specialLineIndices.has(i) ? specialBlocks.find(s => s.lineIndex === i) : null;
      if (specialInfo) {
        inList = false;
        if (specialInfo.type === 'price') {
          result.push(`💰 ${trimmed}`);
        } else if (specialInfo.type === 'url') {
          result.push(`🔗 ${trimmed}`);
        } else {
          result.push(line);
        }
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
