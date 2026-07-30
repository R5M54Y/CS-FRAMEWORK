'use strict';

/**
 * DetectSectionsStage — Stage 3 of the Humanizer pipeline.
 *
 * Responsibilities:
 * - Detect section headers (lines ending with colon that look like titles)
 * - Query FormattingRulesRegistry for matching emoji
 * - Return annotated line metadata for DecorateStage
 *
 * Does NOT modify text.
 * Does NOT decorate.
 * Does NOT make spacing decisions.
 * Contains NO hardcoded emoji mappings.
 */
class DetectSectionsStage {
  constructor({ registry, ...options } = {}) {
    this.name = 'DetectSectionsStage';
    this.registry = registry;
  }

  /**
   * Character range for detecting script-bearing text.
   * Covers Latin, extended Latin, Cyrillic, Arabic, Devanagari, Thai,
   * Lao, Tibetan, CJK, Hangul, and more.
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

      // Section header detection (same logic as original)
      const isHeader = DetectSectionsStage.SCRIPT_RANGE.test(trimmed) &&
        trimmed.endsWith(':') &&
        trimmed.length < 80 &&
        !prevLine.endsWith(':') &&
        !trimmed.startsWith('http') &&
        !trimmed.startsWith('@');

      if (isHeader) {
        const headerText = trimmed.replace(':', '').trim();
        const rule = this.registry ? this.registry.getSectionRule(headerText) : null;
        const emoji = rule ? rule.sectionIcon : null;

        sections.push({
          lineIndex: i,
          header: headerText,
          emoji,
          rawLine: lines[i],
          isSectionHeader: true
        });
      }
    }

    return { text, meta: { sections } };
  }

  /** Convenience: match header text to emoji via registry */
  static matchHeader(text, registry) {
    if (!registry) return null;
    const rule = registry.getSectionRule(text);
    return rule ? rule.sectionIcon : null;
  }
}

module.exports = DetectSectionsStage;
