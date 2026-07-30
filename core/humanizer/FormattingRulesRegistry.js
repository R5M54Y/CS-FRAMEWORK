'use strict';

/**
 * FormattingRulesRegistry — single source of truth for all Humanizer formatting rules.
 *
 * Each rule defines:
 *   - id: unique identifier
 *   - sectionPatterns: array of regex that match section header text
 *   - itemPatterns: array of regex that match list item text (optional if same as section)
 *   - sectionIcon: emoji to prepend to section header
 *   - itemIcon: emoji to use as bullet for matching list items (null = use generic ✅)
 *   - priority: higher number = matched first (default 0)
 *
 * Adding support for new formatting (invoice, shipping, refund, etc.)
 * requires ONLY adding a new rule to this registry.
 * No Humanizer code needs to change.
 */
class FormattingRulesRegistry {
  constructor() {
    this._rules = this._buildDefaultRules();
    this._emojiRegex = null; // lazy cache for hasKnownEmoji
  }

  /**
   * All default formatting rules.
   * Order matters — first matching rule wins (within same priority tier).
   */
  _buildDefaultRules() {
    return [
      // === PRICE / PAYMENT ===
      {
        id: 'price',
        sectionPatterns: [/^harga/i, /^price/i, /^biaya/i, /^promo/i, /^rp\b/i, /^total/i],
        itemPatterns: [
          /^rp\s?\d/i, /^rp\.?\s?\d/i,
          /^(harga|price|biaya|total|bayar|dibayar|tagihan)/i,
        ],
        sectionIcon: '💰',
        itemIcon: '💰',
        priority: 100,
      },
      {
        id: 'payment',
        sectionPatterns: [/^pembayaran/i, /^pembayar/i],
        itemPatterns: [
          /^(qris|transfer|bank|bca|bni|mandiri|bri|gopay|ovo|dana|shopeepay|linkaja)/i,
        ],
        sectionIcon: '💳',
        itemIcon: '💳',
        priority: 100,
      },
      {
        id: 'transfer',
        sectionPatterns: [/^transfer/i],
        sectionIcon: '🏦',
        itemIcon: '💳',
        priority: 100,
      },
      {
        id: 'qris',
        sectionPatterns: [/^qris/i],
        sectionIcon: '📲',
        itemIcon: '💳',
        priority: 100,
      },
      {
        id: 'promo',
        sectionPatterns: [/^promo/i],
        sectionIcon: '🎉',
        itemIcon: '🏷️',
        priority: 100,
      },
      {
        id: 'discount',
        sectionPatterns: [/^diskon/i, /^discount/i],
        itemPatterns: [/(diskon|discount|promo|hemat|murah|gratis|free)/i],
        sectionIcon: '🏷️',
        itemIcon: '🏷️',
        priority: 90,
      },

      // === PRODUCT ===
      {
        id: 'product',
        sectionPatterns: [/^produk/i, /^product/i, /^katalog/i, /^item\b/i],
        itemPatterns: [/^(product|produk|item|paket|bundling)/i],
        sectionIcon: '📦',
        itemIcon: '📦',
        priority: 100,
      },

      // === BENEFITS / FEATURES ===
      {
        id: 'benefit',
        sectionPatterns: [/^fitur/i, /^keunggulan/i, /^kelebihan/i],
        itemPatterns: [/^(benefit|keuntungan|kelebihan|keunggulan|fitur|manfaat|plus|pro)/i],
        sectionIcon: '✨',
        itemIcon: '✅',
        priority: 100,
      },

      // === GUARANTEE ===
      {
        id: 'guarantee',
        sectionPatterns: [/^garansi/i, /^jaminan/i],
        itemPatterns: [/^(garansi|jaminan|warranty)/i],
        sectionIcon: '🛡️',
        itemIcon: '🛡️',
        priority: 100,
      },

      // === BONUS ===
      {
        id: 'bonus',
        sectionPatterns: [/^bonus/i],
        itemPatterns: [/^(bonus|gift|hadiah|free)/i],
        sectionIcon: '🎁',
        itemIcon: '🎁',
        priority: 100,
      },

      // === ORDER / STEPS ===
      {
        id: 'steps',
        sectionPatterns: [/^langkah/i, /^cara/i, /^tutorial/i, /^step/i],
        sectionIcon: '👉',
        itemIcon: '👉',
        priority: 100,
      },
      {
        id: 'tips',
        sectionPatterns: [/^tips/i],
        sectionIcon: '💡',
        priority: 100,
      },

      // === CONTACT ===
      {
        id: 'marketplace',
        sectionPatterns: [/^marketplace/i],
        sectionIcon: '🛒',
        itemIcon: '🛒',
        priority: 100,
      },
      {
        id: 'whatsapp',
        sectionPatterns: [/^whatsapp/i],
        sectionIcon: '💬',
        itemIcon: '📱',
        priority: 100,
      },
      {
        id: 'website',
        sectionPatterns: [/^website/i, /^web\b/i],
        sectionIcon: '🔗',
        itemIcon: '🔗',
        priority: 100,
      },
      {
        id: 'contact',
        sectionPatterns: [/^kontak/i],
        sectionIcon: '📞',
        itemIcon: '📱',
        priority: 100,
      },
      {
        id: 'phone',
        sectionPatterns: [/^telepon/i, /^phone/i, /^hp\b/i, /^handphone/i, /^mobile/i],
        itemPatterns: [
          /^(whatsapp|wa\b|phone|telepon|hp|handphone|mobile|kontak|call)/i,
          /(whatsapp|wa|telepon|phone)(?=.*\d)/i,
        ],
        sectionIcon: '📱',
        itemIcon: '📱',
        priority: 100,
      },
      {
        id: 'address',
        sectionPatterns: [/^alamat/i, /^lokasi/i],
        itemPatterns: [/^(alamat|lokasi|daerah|kota|kecamatan)/i],
        sectionIcon: '📍',
        itemIcon: '📍',
        priority: 100,
      },

      // === SCHEDULE ===
      {
        id: 'schedule',
        sectionPatterns: [/^jadwal/i, /^jam\b/i, /^waktu/i, /^schedule/i, /^buka/i, /^tutup/i],
        itemPatterns: [
          /^(jam\b|pukul|waktu|jadwal|senin|selasa|rabu|kamis|jumat|sabtu|minggu|hari\b|tanggal|bulan|tahun)/i,
        ],
        sectionIcon: '🕒',
        itemIcon: '🕒',
        priority: 100,
      },

      // === DELIVERY ===
      {
        id: 'delivery',
        sectionPatterns: [/^delivery/i, /^pengiriman/i, /^ongkir/i],
        itemPatterns: [/^(delivery|pengiriman|ongkir|kurir|ekspedisi|sameday|nextday)/i],
        sectionIcon: '🚚',
        itemIcon: '🚚',
        priority: 100,
      },

      // === DOWNLOAD / UPLOAD ===
      {
        id: 'download',
        sectionPatterns: [/^download/i, /^unduh/i],
        itemPatterns: [/^(download|unduh|link\s|akses|masuk|login)/i],
        sectionIcon: '⬇️',
        itemIcon: '⬇️',
        priority: 100,
      },
      {
        id: 'upload',
        sectionPatterns: [/^upload/i, /^unggah/i],
        sectionIcon: '⬆️',
        itemIcon: '⬆️',
        priority: 100,
      },

      // === CUSTOMER / ADMIN ===
      {
        id: 'customer',
        sectionPatterns: [/^customer/i, /^pelanggan/i],
        sectionIcon: '👤',
        priority: 100,
      },
      {
        id: 'admin',
        sectionPatterns: [/^admin/i],
        sectionIcon: '🙋',
        priority: 100,
      },

      // === TESTIMONIAL ===
      {
        id: 'testimonial',
        sectionPatterns: [/^testimoni/i, /^review/i],
        sectionIcon: '⭐',
        priority: 100,
      },

      // === FAQ ===
      {
        id: 'faq',
        sectionPatterns: [/^faq/i, /^tanya/i],
        sectionIcon: '❓',
        priority: 100,
      },

      // === NOTES / WARNING ===
      {
        id: 'note',
        sectionPatterns: [/^catatan/i, /^note/i],
        sectionIcon: '📝',
        itemIcon: '⚠️',
        priority: 100,
      },
      {
        id: 'warning',
        sectionPatterns: [/^penting/i, /^warning/i, /^perhatian/i],
        itemPatterns: [/^(warning|perhatian|penting|catatan|note|requirements|syarat|ketentuan)/i],
        sectionIcon: '⚠️',
        itemIcon: '⚠️',
        priority: 100,
      },

      // === EDUCATION / KIDS ===
      {
        id: 'education',
        sectionPatterns: [/^pendidikan/i, /^edukasi/i, /^belajar/i, /^worksheet/i],
        sectionIcon: '📚',
        priority: 100,
      },
      {
        id: 'material',
        sectionPatterns: [/^materi/i, /^bahan ajar/i],
        sectionIcon: '📄',
        priority: 100,
      },
      {
        id: 'kids',
        sectionPatterns: [/^anak/i, /^kids/i, /^children/i],
        sectionIcon: '🧩',
        priority: 100,
      },
      {
        id: 'flashcard',
        sectionPatterns: [/^flashcard/i, /^kartu/i],
        sectionIcon: '🔤',
        priority: 100,
      },

      // === MEDIA ===
      {
        id: 'video',
        sectionPatterns: [/^video/i],
        sectionIcon: '🎥',
        priority: 100,
      },
      {
        id: 'image',
        sectionPatterns: [/^gambar/i, /^image/i, /^foto/i],
        sectionIcon: '🖼️',
        priority: 100,
      },
      {
        id: 'pdf',
        sectionPatterns: [/^pdf/i, /^pdf\b/i],
        sectionIcon: '📄',
        priority: 100,
      },

      // === STATUS ===
      {
        id: 'success',
        sectionPatterns: [/^success/i, /^sukses/i, /^berhasil/i],
        sectionIcon: '✅',
        priority: 100,
      },
      {
        id: 'error',
        sectionPatterns: [/^error/i, /^gagal/i, /^salah/i],
        sectionIcon: '❌',
        priority: 100,
      },

      // === MISC ===
      {
        id: 'lifetime',
        sectionPatterns: [/^lifetime/i, /^selamanya/i, /^seumur/i],
        sectionIcon: '♾️',
        priority: 100,
      },
      {
        id: 'link',
        sectionPatterns: [/^link/i, /^url/i],
        sectionIcon: '🔗',
        priority: 100,
      },
    ];
  }

  /** Get all rules */
  getAllRules() {
    return this._rules;
  }

  /**
   * Find rule matching a section header title.
   * First rule that matches any sectionPattern wins.
   * @param {string} title — header text without colon
   * @returns {Object|null} matched rule or null
   */
  getSectionRule(title) {
    if (!title) return null;
    for (const rule of this._rules) {
      if (!rule.sectionPatterns || rule.sectionPatterns.length === 0) continue;
      for (const pattern of rule.sectionPatterns) {
        if (pattern.test(title)) return rule;
      }
    }
    return null;
  }

  /**
   * Find rule matching a list item text.
   * First rule that matches any itemPattern wins.
   * Falls back to sectionPatterns if no itemPatterns defined.
   * @param {string} text — trimmed list item line
   * @returns {Object|null} matched rule or null
   */
  getItemRule(text) {
    if (!text) return null;
    const lower = text.toLowerCase().trim();
    for (const rule of this._rules) {
      // Only use sectionPatterns for items if rule has itemIcon
      // (rules without itemIcon are section-only: tips, customer, admin, etc.)
      const hasItemPatterns = rule.itemPatterns && rule.itemPatterns.length > 0;
      const useSectionFallback = !hasItemPatterns && rule.itemIcon;
      if (!hasItemPatterns && !useSectionFallback) continue;

      const patterns = hasItemPatterns ? rule.itemPatterns : rule.sectionPatterns;
      if (!patterns || patterns.length === 0) continue;
      for (const pattern of patterns) {
        if (pattern.test(lower)) return rule;
      }
    }
    return null;
  }

  /**
   * Get the icon to use for a list item.
   * Uses itemIcon if set, otherwise sectionIcon, otherwise null.
   * @param {string} text
   * @returns {string|null}
   */
  getItemIcon(text) {
    const rule = this.getItemRule(text);
    if (!rule) return null;
    return rule.itemIcon || rule.sectionIcon || null;
  }

  /**
   * Get the emoji for a section header.
   * @param {string} title
   * @returns {string|null}
   */
  getSectionIcon(title) {
    const rule = this.getSectionRule(title);
    return rule ? (rule.sectionIcon || null) : null;
  }

  /**
   * Check if text contains any known emoji from the registry.
   * Used by DetectFormattingStage to short-circuit.
   * Regex is compiled once and cached for performance.
   * @param {string} text
   * @returns {boolean}
   */
  hasKnownEmoji(text) {
    if (!text) return false;
    if (!this._emojiRegex) {
      const icons = new Set();
      for (const rule of this._rules) {
        if (rule.sectionIcon) icons.add(rule.sectionIcon);
        if (rule.itemIcon && rule.itemIcon !== rule.sectionIcon) icons.add(rule.itemIcon);
      }
      this._emojiRegex = new RegExp(Array.from(icons).join('|'), 'u');
    }
    return this._emojiRegex.test(text);
  }
}

module.exports = FormattingRulesRegistry;
