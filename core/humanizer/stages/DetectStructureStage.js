'use strict';

/**
 * DetectStructureStage — Stage 4 of the Humanizer pipeline.
 *
 * Responsibilities:
 * - Classify the overall structure of the response
 * - Types: paragraph, plain_list, steps, price_list, mixed
 * - Provide line-level type annotations for DecorateStage
 *
 * Only classifies. Does NOT modify text.
 */
class DetectStructureStage {
  constructor(options = {}) {
    this.name = 'DetectStructureStage';
  }

  /**
   * @param {string} text
   * @param {Object} meta — must contain sections[] from DetectSectionsStage
   * @returns {{ text: string, meta: { structureType, lineTypes, sections } }}
   */
  process(text, meta = {}) {
    const result = { text, meta: { ...meta, structureType: 'paragraph', lineTypes: [] } };
    if (!text) return result;

    const lines = text.split('\n');
    const nonEmpty = lines.filter(l => l.trim().length > 0);
    const sectionCount = (meta.sections || []).length;
    const sectionLineIndices = new Set((meta.sections || []).map(s => s.lineIndex));

    // Classify each line
    const lineTypes = lines.map((line, i) => {
      const trimmed = line.trim();
      if (!trimmed) return { type: 'empty', lineIndex: i };
      if (sectionLineIndices.has(i)) return { type: 'section_header', lineIndex: i };
      return { type: 'content', lineIndex: i };
    });

    result.meta.lineTypes = lineTypes;

    // Determine overall structure
    const contentLines = lineTypes.filter(lt => lt.type === 'content');
    const shortLines = contentLines.filter(lt => lines[lt.lineIndex].trim().length < 120);
    const hasStepKeywords = contentLines.some(lt =>
      /^(transfer|kirim|bayar|pilih|klik|masuk|buka)/i.test(lines[lt.lineIndex].trim())
    );
    const hasPricePattern = contentLines.some(lt =>
      /^rp\s?\d|^\d/.test(lines[lt.lineIndex].trim())
    );

    if (sectionCount > 0 && contentLines.length > 1) {
      if (hasStepKeywords) {
        result.meta.structureType = 'steps';
      } else if (hasPricePattern) {
        result.meta.structureType = 'price_list';
      } else {
        result.meta.structureType = 'plain_list';
      }
    } else if (shortLines.length > 1 && lines.length <= 15) {
      result.meta.structureType = 'plain_list';
    }

    return result;
  }
}

module.exports = DetectStructureStage;
