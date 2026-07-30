'use strict';

/**
 * DetectSectionsStage — Stage 3 of the Humanizer pipeline.
 *
 * Responsibilities:
 * - Detect section headers (lines ending with colon that look like titles)
 * - Return annotated line metadata for SemanticAnalyzerStage
 *
 * Does NOT modify text.
 * Does NOT decorate.
 * Does NOT match emoji (that's SemanticAnalyzer's job).
 * Contains NO emoji mappings.
 */
class DetectSectionsStage {
  constructor(options = {}) {
    this.name = 'DetectSectionsStage';
  }

  /**
   * Character range for detecting script-bearing text.
   */
  static SCRIPT_RANGE = /^[A-Za-z\u00C0-\u024F\u0400-\u04FF\u0600-\u06FF\u0900-\u097F\u0E00-\u0E7F\u0E80-\u0EFF\u0F00-\u0FFF\u1F00-\u1FFF\u2000-\u206F\u2E00-\u2E7F\u3000-\u303F\u3040-\u309F\u30A0-\u30FF\u3100-\u312F\u3130-\u318F\u3190-\u31FF\u3200-\u32FF\u3300-\u33FF\u3400-\u4DBF\u4E00-\u9FFF\uA000-\uA4CF\uA960-\uA97F\uAC00-\uD7AF\uF900-\uFAFF]/;

  /**
   * @param {string} text
   * @returns {{ text: string, meta: { sections: Array } }}
   */
  process(text) {
    const sections = [];
    if (!text) return { text, meta: { sections } };

    const lines = text.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      if (!trimmed) continue;

      const prevLine = i > 0 ? lines[i - 1].trim() : '';

      // Section header detection
      const isHeader = DetectSectionsStage.SCRIPT_RANGE.test(trimmed) &&
        trimmed.endsWith(':') &&
        trimmed.length < 80 &&
        !prevLine.endsWith(':') &&
        !trimmed.startsWith('http') &&
        !trimmed.startsWith('@');

      if (isHeader) {
        const headerText = trimmed.replace(':', '').trim();

        sections.push({
          lineIndex: i,
          header: headerText,
          rawLine: lines[i],
          isSectionHeader: true
        });
      }
    }

    return { text, meta: { sections } };
  }
}

module.exports = DetectSectionsStage;
