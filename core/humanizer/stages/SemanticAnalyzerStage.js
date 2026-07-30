'use strict';

/**
 * SemanticAnalyzerStage — Stage 7 of the Humanizer pipeline.
 *
 * Responsibilities:
 * - Classify section headers into abstract semantic categories
 * - Classify list items into abstract semantic categories
 * - Use parent section context to improve item classification
 * - Produce metadata: categorizedSections[], categorizedItems[]
 *
 * This stage is the semantic bridge between raw text and presentation.
 * It does NOT decorate, modify text, or make spacing decisions.
 * Business vocabulary lives in SemanticAnalyzer, not in this stage.
 */
const SemanticAnalyzer = require('../SemanticAnalyzer');

class SemanticAnalyzerStage {
  constructor(options = {}) {
    this.name = 'SemanticAnalyzerStage';
    this.analyzer = new SemanticAnalyzer();
  }

  /**
   * @param {string} text
   * @param {Object} meta — must contain sections[] from DetectSectionsStage
   * @returns {{ text: string, meta: Object }}
   */
  process(text, meta = {}) {
    if (!text) return { text, meta: { ...meta, semanticSections: [], semanticItems: [] } };

    const sections = meta.sections || [];
    const listItems = meta.listItems || [];

    // Classify each section header
    const semanticSections = sections.map(section => {
      const category = this.analyzer.analyzeSection(section.header);
      return { ...section, category };
    });

    // Build section lookup: which section is each list item under?
    const sectionMap = new Map();
    for (const section of semanticSections) {
      sectionMap.set(section.lineIndex, section);
    }

    // Find parent section for each list item
    const sortedSectionLines = [...sectionMap.keys()].sort((a, b) => a - b);

    function findParentSection(lineIndex) {
      let parent = null;
      for (const sectionLine of sortedSectionLines) {
        if (sectionLine <= lineIndex) {
          parent = sectionMap.get(sectionLine);
        } else {
          break;
        }
      }
      return parent;
    }

    // Classify each list item
    const semanticItems = listItems.map(item => {
      const parent = findParentSection(item.lineIndex);
      const parentCategory = parent ? parent.category : null;
      const category = this.analyzer.analyzeItem(item.content, parentCategory);
      return { ...item, category };
    });

    return {
      text,
      meta: {
        ...meta,
        semanticSections,
        semanticItems,
        // Keep backward compatibility: enrich sections with category info
        sections: semanticSections,
        listItems: semanticItems,
      }
    };
  }
}

module.exports = SemanticAnalyzerStage;
