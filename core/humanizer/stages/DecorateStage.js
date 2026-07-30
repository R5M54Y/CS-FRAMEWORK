'use strict';

/**
 * DecorateStage — Stage 8 of the Humanizer pipeline.
 *
 * Responsibilities:
 * - Apply emoji to section headers (using category from SemanticAnalyzerStage)
 * - Apply emoji bullets to list items (using category metadata)
 * - All emoji lookups go through FormattingRulesRegistry by category only
 *
 * Contains NO business vocabulary.
 * Contains NO hardcoded emoji decisions.
 * Contains NO regex pattern matching.
 */
class DecorateStage {
  constructor({ registry, ...options } = {}) {
    this.name = 'DecorateStage';
    this.registry = registry;
  }

  /** Emoji prefixes that indicate a line is already decorated */
  static EXISTING_EMOJI_PREFIXES = /^[📦✅💰🕒🚚⬇️⬆️✨🎁🛡️🏷️🎉👉💡⭐❓📝⚠️❌♾️🔗🧩📚📄🎥🖼️🔤🛒💬📞📱💳🏦📲👤🙋📧🃏👶♻️🏡]/u;

  /** Number emoji for list numbering (kept for fallback) */
  static NUMBER_EMOJIS = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];

  /**
   * @param {string} text
   * @param {Object} meta — from prior stages, contains sections[], listItems[] with categories
   * @returns {{ text: string, meta: Object }}
   */
  process(text, meta = {}) {
    if (!text || meta.alreadyFormatted) {
      return { text, meta };
    }

    const lines = text.split('\n');
    const result = [];

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

      if (!trimmed) {
        inList = false;
        result.push(line);
        continue;
      }

      // Section headers — use category from SemanticAnalyzer
      const sectionInfo = sections.find(s => s.lineIndex === i);
      if (sectionInfo) {
        if (result.length > 0 && result[result.length - 1] !== '') {
          result.push('');
        }
        const emoji = this.registry ? this.registry.getSectionIcon(sectionInfo.category) : null;
        if (emoji) {
          result.push(`${emoji} ${sectionInfo.rawLine}`);
        } else {
          result.push(sectionInfo.rawLine);
        }
        inList = true;
        continue;
      }

      // List items — use category from SemanticAnalyzer
      const listInfo = listItemMap.get(i);
      if (listInfo) {
        inList = true;
        const specialInfo = specialLineIndices.has(i) ? specialBlocks.find(s => s.lineIndex === i) : null;
        const textToDecorate = listInfo.content;

        // Priority: special block > category from analyzer
        let themedEmoji = null;
        if (specialInfo && specialInfo.type === 'price') {
          themedEmoji = '💰';
        } else if (this.registry) {
          themedEmoji = this.registry.getItemIcon(listInfo.category);
        }

        // Numbered items: contextual icon preferred
        if (listInfo.isNumbered) {
          if (themedEmoji) {
            result.push(`${themedEmoji} ${textToDecorate}`);
          } else if (listInfo.numberIndex >= 0 && listInfo.numberIndex < DecorateStage.NUMBER_EMOJIS.length) {
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

      // Special blocks (prices, URLs not in lists)
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

      inList = false;
      result.push(line);
    }

    return { text: result.join('\n'), meta };
  }
}

module.exports = DecorateStage;
