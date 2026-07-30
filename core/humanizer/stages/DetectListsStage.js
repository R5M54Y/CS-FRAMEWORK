'use strict';

/**
 * DetectListsStage — Stage 5 of the Humanizer pipeline.
 *
 * Responsibilities:
 * - Detect markdown bullet lists (-, *, +, numbered)
 * - Strip bullet markers
 * - Identify list boundaries (consecutive bullet lines form a group)
 * - Return metadata for DecorateStage: listItems[] with lineIndex, content, type
 *
 * Does NOT modify text.
 * Does NOT decorate.
 * Does NOT make spacing decisions.
 */
class DetectListsStage {
  constructor(options = {}) {
    this.name = 'DetectListsStage';
  }

  /** Regex to detect markdown bullet at line start */
  static BULLET_REGEX = /^(\s*)([-*+]|\d{1,2}\.)\s+/;

  /** Number emoji for list numbering */
  static NUMBER_EMOJIS = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];

  /**
   * @param {string} text
   * @param {Object} meta — must contain sections[] from DetectSectionsStage
   * @returns {{ text: string, meta: { listItems: Array } }}
   */
  process(text, meta = {}) {
    const listItems = [];
    if (!text) return { text, meta: { ...meta, listItems } };

    const lines = text.split('\n');
    const sectionLineIndices = new Set((meta.sections || []).map(s => s.lineIndex));
    let inList = false;

    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      if (!trimmed) {
        inList = false;
        continue;
      }

      // Skip section header lines (already handled by DetectSectionsStage)
      if (sectionLineIndices.has(i)) {
        inList = true; // items after a section header are in a list
        continue;
      }

      // Check if line starts with a bullet marker
      const bulletMatch = trimmed.match(DetectListsStage.BULLET_REGEX);
      const isBulletLine = !!bulletMatch;

      // Detect list items: inList OR bullet line
      const isListItem = inList || isBulletLine;

      if (isListItem && !inList) {
        // First bullet line — start of a standalone list
        inList = true;
      }

      if (!isListItem) {
        inList = false;
        continue;
      }

      if (isBulletLine) {
        // Strip bullet marker
        const rawContent = trimmed.slice(bulletMatch[0].length);
        const contentAfterBullet = rawContent.trim();

        // Determine if numbered
        const marker = (bulletMatch[1] || '').trim() || bulletMatch[0].trim();
        const isNumbered = /^\d{1,2}\./.test(marker);
        let numberIndex = -1;
        if (isNumbered) {
          numberIndex = parseInt(trimmed.match(/^(\d+)\./)[1], 10) - 1;
        }

        listItems.push({
          lineIndex: i,
          content: contentAfterBullet,
          rawLine: lines[i],
          bulletType: marker,
          isNumbered,
          numberIndex,
          isListItem: true,
        });
      } else {
        // Item from section header context (no bullet marker)
        listItems.push({
          lineIndex: i,
          content: trimmed,
          rawLine: lines[i],
          bulletType: null,
          isNumbered: false,
          numberIndex: -1,
          isListItem: true,
        });
      }
    }

    return { text, meta: { ...meta, listItems } };
  }
}

module.exports = DetectListsStage;
