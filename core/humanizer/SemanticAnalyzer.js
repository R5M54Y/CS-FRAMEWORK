'use strict';

/**
 * SemanticAnalyzer — classifies text blocks into abstract categories.
 *
 * Responsibilities:
 * - Analyze section headers and assign semantic categories
 * - Analyze list items and assign semantic categories
 * - Use keyword scoring, parent context, and heuristics
 *
 * This is the ONLY component that knows business vocabulary.
 * FormattingRulesRegistry knows ONLY abstract category names.
 *
 * To support a new language or synonym: add entries here.
 * No changes needed to FormattingRulesRegistry or any stage.
 */
class SemanticAnalyzer {
  /**
   * Build category → keyword map for section header analysis.
   * Higher weight = more points per keyword match.
   */
  static SECTION_RULES = [
    { category: 'PRODUCT', words: ['produk', 'product', 'isi', 'isi paket', 'isi nya', 'isi nya', 'isinya', 'katalog', 'item', 'daftar', 'rincian', 'detail', 'inti', 'pilihan', 'tersedia', 'yang didapat', 'yang diperoleh', 'termasuk'], weight: 2 },
    { category: 'PRICE', words: ['harga', 'price', 'biaya', 'total', 'promo', 'diskon', 'discount', 'rp'], weight: 2 },
    { category: 'BENEFIT', words: ['kelebihan', 'keunggulan', 'benefit', 'fitur', 'feature', 'manfaat', 'plus', 'unggul', 'istimewa'], weight: 2 },
    { category: 'ORDER', words: ['cara', 'langkah', 'step', 'tutorial', 'order', 'pesan', 'beli', 'pemesanan', 'pembelian', 'order'], weight: 2 },
    { category: 'PAYMENT', words: ['pembayaran', 'bayar', 'transfer', 'qris', 'bank', 'pembayar'], weight: 2 },
    { category: 'CONTACT', words: ['kontak', 'contact', 'telepon', 'phone', 'hp', 'handphone', 'mobile', 'whatsapp', 'wa'], weight: 2 },
    { category: 'LOCATION', words: ['alamat', 'lokasi', 'daerah', 'kota', 'cabang'], weight: 2 },
    { category: 'TIME', words: ['jadwal', 'jam', 'waktu', 'schedule', 'buka', 'tutup', 'hari', 'tanggal', 'bulan'], weight: 2 },
    { category: 'DELIVERY', words: ['pengiriman', 'delivery', 'ongkir', 'kurir', 'ekspedisi'], weight: 2 },
    { category: 'DOWNLOAD', words: ['download', 'unduh'], weight: 2 },
    { category: 'BONUS', words: ['bonus', 'gift', 'hadiah', 'gratis', 'free'], weight: 2 },
    { category: 'GUARANTEE', words: ['garansi', 'jaminan', 'warranty'], weight: 2 },
    { category: 'NOTE', words: ['catatan', 'note', 'penting', 'perhatian', 'warning'], weight: 2 },
    { category: 'FAQ', words: ['faq', 'tanya', 'pertanyaan', 'question'], weight: 2 },
    { category: 'TIPS', words: ['tips', 'tip', 'saran'], weight: 2 },
    { category: 'TESTIMONIAL', words: ['testimoni', 'review', 'ulasan'], weight: 2 },
    { category: 'SUCCESS', words: ['sukses', 'berhasil', 'success'], weight: 2 },
    { category: 'LINK', words: ['link', 'url', 'website', 'web'], weight: 3 },
    { category: 'MARKETPLACE', words: ['marketplace', 'shopee', 'tokopedia', 'lazada', 'bukalapak'], weight: 2 },
    { category: 'EDUCATION', words: ['pendidikan', 'edukasi', 'belajar', 'worksheet', 'materi', 'bahan ajar', 'modul'], weight: 2 },
    { category: 'FLASHCARD', words: ['flashcard', 'kartu', 'flash card'], weight: 2 },
    { category: 'KIDS', words: ['anak', 'kids', 'children', 'usia', 'balita', 'bayi'], weight: 2 },
    { category: 'EMAIL', words: ['email', 'e-mail', 'mail'], weight: 2 },
    { category: 'RESELL', words: ['resell', 'jual kembali', 'dijual kembali', 'bisnis', 'reseller'], weight: 2 },
    { category: 'HOMESCHOOL', words: ['homeschool', 'home school', 'belajar di rumah'], weight: 2 },
  ];

  /**
   * Build category → keyword map for list item analysis.
   * Separate from section rules because items need different matching.
   */
  static ITEM_RULES = [
    { category: 'PRICE', words: ['rp', 'harga', 'price', 'biaya', 'total', 'bayar', 'dibayar', 'tagihan', 'promo', 'diskon'], weight: 2 },
    // Also match "Rp50.000" style (rp prefix attached to number)
    { category: 'PRICE', words: [], weight: 2, prefixMatch: ['rp'] },
    { category: 'PAYMENT', words: ['qris', 'transfer', 'bank', 'bca', 'bni', 'mandiri', 'bri', 'gopay', 'ovo', 'dana', 'shopeepay', 'linkaja', 'bayar'], weight: 2 },
    { category: 'CONTACT', words: ['whatsapp', 'wa', 'telepon', 'phone', 'hp', 'handphone', 'mobile', 'kontak', 'call', 'hubungi'], weight: 2 },
    { category: 'DOWNLOAD', words: ['download', 'unduh', 'akses', 'masuk', 'login'], weight: 2 },
    { category: 'EMAIL', words: ['email', 'e-mail', 'cek email', 'inbox'], weight: 2 },
    { category: 'LINK_CLICK', words: ['klik', 'click', 'kunjungi', 'buka link', 'link pembelian', 'link produk'], weight: 2 },
    { category: 'TIME', words: ['jam', 'pukul', 'waktu', 'jadwal', 'senin', 'selasa', 'rabu', 'kamis', 'jumat', 'sabtu', 'minggu', 'hari', 'tanggal', 'bulan', 'tahun'], weight: 2 },
    { category: 'LOCATION', words: ['alamat', 'lokasi', 'daerah', 'kota', 'kecamatan'], weight: 2 },
    { category: 'DELIVERY', words: ['delivery', 'pengiriman', 'ongkir', 'kurir', 'ekspedisi', 'sameday', 'nextday'], weight: 2 },
    { category: 'BONUS', words: ['bonus', 'gift', 'hadiah', 'free', 'gratis'], weight: 2 },
    { category: 'GUARANTEE', words: ['garansi', 'jaminan', 'warranty'], weight: 2 },
    { category: 'DEFAULT', words: ['benefit', 'keuntungan', 'kelebihan', 'keunggulan', 'fitur', 'manfaat', 'plus', 'pro'], weight: 2 },
    { category: 'NOTE', words: ['warning', 'perhatian', 'penting', 'catatan', 'note', 'requirements', 'syarat', 'ketentuan'], weight: 2 },
    { category: 'PRODUCT', words: ['product', 'produk', 'item', 'paket', 'bundling'], weight: 2 },
    { category: 'MATERIAL', words: ['worksheet', 'printable', 'lembar kerja', 'modul', 'bahan ajar'], weight: 2 },
    { category: 'FLASHCARD', words: ['flashcard', 'kartu', 'flash card'], weight: 2 },
    { category: 'KIDS', words: ['anak', 'kids', 'usia', 'umur', 'baby', 'balita', 'bayi'], weight: 2 },
    { category: 'RESELL', words: ['resell', 'jual kembali', 'dijual kembali', 'bisnis', 'reseller'], weight: 2 },
    { category: 'HOMESCHOOL', words: ['homeschool', 'home school', 'belajar di rumah'], weight: 2 },
  ];

  /**
   * Category hierarchy: parent section influence on child items.
   * If an item is under a PRODUCT section, PRODUCT-related keywords get a boost.
   */
  static CATEGORY_PARENT_BOOST = {
    PRODUCT: { PRODUCT: 3, MATERIAL: 2, FLASHCARD: 2 },
    PRICE: { PRICE: 3, DISCOUNT: 2 },
    BENEFIT: { BENEFIT: 2, DEFAULT: 3 },
    ORDER: { ORDER: 3, PAYMENT: 2, LINK_CLICK: 2 },
    PAYMENT: { PAYMENT: 3, PRICE: 2 },
    CONTACT: { CONTACT: 3, LINK_CLICK: 1 },
    BONUS: { BONUS: 3, PRODUCT: 1 },
    FAQ: { DEFAULT: 2 },
    EDUCATION: { MATERIAL: 3, FLASHCARD: 2, KIDS: 2 },
    DELIVERY: { DELIVERY: 3, TIME: 1 },
    DOWNLOAD: { DOWNLOAD: 3, EMAIL: 1, LINK_CLICK: 1 },
  };

  /**
   * Analyze a section header and return its category.
   * @param {string} headerText - The header text without colon
   * @returns {string} category name or null
   */
  analyzeSection(headerText) {
    if (!headerText) return null;
    return this._score(headerText, SemanticAnalyzer.SECTION_RULES, null);
  }

  /**
   * Analyze a list item and return its category.
   * @param {string} itemText - The trimmed item text
   * @param {string|null} parentCategory - The parent section's category (for boost)
   * @returns {string} category name
   */
  analyzeItem(itemText, parentCategory = null) {
    if (!itemText) return 'DEFAULT';
    const result = this._score(itemText, SemanticAnalyzer.ITEM_RULES, parentCategory, true);
    return result || 'DEFAULT';
  }

  /**
   * Score text against rules using word-boundary keyword matching.
   * Uses word boundaries to prevent false positives from substring matches.
   */
  _score(text, rules, parentCategory = null, penalizeShortGeneric = false) {
    const lower = text.toLowerCase().trim();
    // Split into words and also test the full text for multi-word phrases
    const words = new Set(lower.split(/[\s,.;:!?()]+/).filter(Boolean));
    const scores = {};

    for (const rule of rules) {
      let points = 0;
      for (const phrase of rule.words) {
        // For multi-word phrases, test against full text
        // For single words, test against word set (exact match)
        if (phrase.includes(' ')) {
          // Multi-word phrase: test if text contains it
          if (lower.includes(phrase)) {
            points += rule.weight;
          }
        } else {
          // Single word: test exact word match (not substring)
          if (words.has(phrase)) {
            points += rule.weight;
          }
        }
      }
      // Handle prefix matching (e.g., "Rp50.000" starts with "rp" but isn't a separate word)
      if (rule.prefixMatch) {
        for (const prefix of rule.prefixMatch) {
          if (lower.startsWith(prefix) && lower.length > prefix.length + 1) {
            points += rule.weight;
          }
        }
      }
      if (points > 0) {
        scores[rule.category] = (scores[rule.category] || 0) + points;
      }
    }

    // Apply parent category boost
    if (parentCategory && SemanticAnalyzer.CATEGORY_PARENT_BOOST[parentCategory]) {
      const boosts = SemanticAnalyzer.CATEGORY_PARENT_BOOST[parentCategory];
      for (const [cat, boost] of Object.entries(boosts)) {
        if (scores[cat]) {
          scores[cat] += boost;
        }
      }
    }

    // Find highest score
    let bestCategory = null;
    let bestScore = 0;

    for (const [cat, score] of Object.entries(scores)) {
      if (score > bestScore) {
        bestScore = score;
        bestCategory = cat;
      }
    }

    return bestCategory;
  }
}

module.exports = SemanticAnalyzer;
