'use strict';

/**
 * FormattingRulesRegistry — presentation-only mapping of semantic categories to icons.
 *
 * This registry knows ONLY abstract category names.
 * It does NOT contain business words, regex patterns, or keyword matching.
 * Business vocabulary lives exclusively in SemanticAnalyzer.
 *
 * Each category maps to:
 *   - sectionIcon: emoji to prepend to section headers
 *   - itemIcon: emoji to use as bullet for list items
 *
 * To add support for a new category:
 *   1. Add the category name to SemanticAnalyzer.SECTION_RULES / ITEM_RULES
 *   2. Add the category → icon mapping in _buildCategoryMap() below
 *
 * No stage code needs to change.
 */
class FormattingRulesRegistry {
  constructor() {
    this._categoryMap = this._buildCategoryMap();
    this._emojiRegex = null; // lazy cache for hasKnownEmoji
  }

  /**
   * Pure presentation mapping: category → icon pairs.
   * NO business words, NO regex patterns, NO keyword matching.
   */
  _buildCategoryMap() {
    return {
      PRODUCT:     { sectionIcon: '📦', itemIcon: '📦' },
      PRICE:       { sectionIcon: '💰', itemIcon: '💰' },
      BENEFIT:     { sectionIcon: '✨', itemIcon: '✅' },
      FEATURE:     { sectionIcon: '✳️', itemIcon: '⭐' },
      ORDER:       { sectionIcon: '👉', itemIcon: '👉' },
      PAYMENT:     { sectionIcon: '💳', itemIcon: '💳' },
      CONTACT:     { sectionIcon: '📞', itemIcon: '📱' },
      LOCATION:    { sectionIcon: '📍', itemIcon: '📍' },
      TIME:        { sectionIcon: '🕒', itemIcon: '🕒' },
      DELIVERY:    { sectionIcon: '🚚', itemIcon: '🚚' },
      DOWNLOAD:    { sectionIcon: '⬇️', itemIcon: '⬇️' },
      BONUS:       { sectionIcon: '🎁', itemIcon: '🎁' },
      GUARANTEE:   { sectionIcon: '🛡️', itemIcon: '🛡️' },
      NOTE:        { sectionIcon: '📝', itemIcon: '⚠️' },
      FAQ:         { sectionIcon: '❓', itemIcon: '❓' },
      TIPS:        { sectionIcon: '💡', itemIcon: '💡' },
      TESTIMONIAL: { sectionIcon: '⭐', itemIcon: '⭐' },
      SUCCESS:     { sectionIcon: '✅', itemIcon: '✅' },
      ERROR:       { sectionIcon: '❌', itemIcon: '❌' },
      LINK:        { sectionIcon: '🔗', itemIcon: '🔗' },
      LINK_CLICK:  { sectionIcon: '🔗', itemIcon: '🔗' },
      MARKETPLACE: { sectionIcon: '🛒', itemIcon: '🛒' },
      EDUCATION:   { sectionIcon: '📚', itemIcon: '📄' },
      MATERIAL:    { sectionIcon: '📄', itemIcon: '📄' },
      FLASHCARD:   { sectionIcon: '🃏', itemIcon: '🃏' },
      KIDS:        { sectionIcon: '🧩', itemIcon: '👶' },
      HOMESCHOOL:  { sectionIcon: '🏡', itemIcon: '🏡' },
      RESELL:      { sectionIcon: '♻️', itemIcon: '♻️' },
      EMAIL:       { sectionIcon: '📧', itemIcon: '📧' },
      UPLOAD:      { sectionIcon: '⬆️', itemIcon: '⬆️' },
      DEFAULT:     { sectionIcon: null,  itemIcon: '✅' },
    };
  }

  /** Get all category keys */
  getCategories() {
    return Object.keys(this._categoryMap);
  }

  /**
   * Get the icon for a section header by category.
   * @param {string} category - Abstract category name (e.g., 'PRODUCT', 'PRICE')
   * @returns {string|null} emoji or null
   */
  getSectionIcon(category) {
    if (!category) return null;
    const entry = this._categoryMap[category];
    return entry ? (entry.sectionIcon || null) : null;
  }

  /**
   * Get the icon for a list item by category.
   * @param {string} category - Abstract category name
   * @returns {string} emoji or '✅' fallback
   */
  getItemIcon(category) {
    if (!category) return '✅';
    const entry = this._categoryMap[category];
    return entry ? (entry.itemIcon || '✅') : '✅';
  }

  /**
   * Check if text contains any known emoji from the registry.
   * Regex is compiled once and cached for performance.
   */
  hasKnownEmoji(text) {
    if (!text) return false;
    if (!this._emojiRegex) {
      const icons = new Set();
      for (const entry of Object.values(this._categoryMap)) {
        if (entry.sectionIcon) icons.add(entry.sectionIcon);
        if (entry.itemIcon && entry.itemIcon !== entry.sectionIcon) icons.add(entry.itemIcon);
      }
      this._emojiRegex = new RegExp(Array.from(icons).join('|'), 'u');
    }
    return this._emojiRegex.test(text);
  }
}

module.exports = FormattingRulesRegistry;
