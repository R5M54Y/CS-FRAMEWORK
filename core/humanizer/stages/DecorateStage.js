'use strict';

/**
 * DecorateStage — Stage 5 of the Humanizer pipeline.
 *
 * Responsibilities:
 * - Add emoji to section headers
 * - Add emoji bullets to list items
 * - Add themed emoji for price/payment/bonus/promo lines
 * - Never rewrite content, change wording, prices, URLs, or names
 * - Never modify already-formatted responses (skip if meta.alreadyFormatted)
 *
 * Section emoji mapping imported from DetectSectionsStage.
 */
const DetectSectionsStage = require('./DetectSectionsStage');

class DecorateStage {
  constructor(options = {}) {
    this.name = 'DecorateStage';
  }

  /** Emoji prefixes that indicate a line is already decorated */
  static EXISTING_EMOJI_PREFIXES = /^[📦✅💰🕒🚚⬇️⬆️✨🎁🛡️🏷️🎉👉💡⭐❓📝⚠️❌♾️🔗🧩📚📄🎥🖼️🔤🛒💬📞📱💳🏦📲👤🙋]/;

  /**
   * @param {string} text
   * @param {Object} meta — meta.sections[] from DetectSectionsStage
   * @returns {{ text: string, meta: Object }}
   */
  process(text, meta = {}) {
    if (!text || meta.alreadyFormatted) {
      return { text, meta };
    }

    const lines = text.split('\n');
    const result = [];
    const sectionLineIndices = new Set((meta.sections || []).map(s => s.lineIndex));
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

      // Is this line a known section header?
      const sectionInfo = meta.sections ? meta.sections.find(s => s.lineIndex === i) : null;

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

      // Detect list items: short line after a section header
      const isListItem = inList &&
        trimmed.length < 120 &&
        !trimmed.startsWith('Halo') &&
        !trimmed.startsWith('Ada yang') &&
        !trimmed.startsWith('Silakan') &&
        !trimmed.startsWith('Terima') &&
        !trimmed.startsWith('Ya,') &&
        !trimmed.startsWith('Tentu') &&
        !trimmed.endsWith(':') &&
        !DecorateStage.EXISTING_EMOJI_PREFIXES.test(trimmed);

      if (isListItem) {
        const themedEmoji = this._matchListItemEmoji(trimmed);
        result.push(themedEmoji ? `${themedEmoji} ${trimmed}` : `✅ ${trimmed}`);
        continue;
      }

      // Detect standalone price lines
      const hasPrice = /^rp\s?\d|harga\s|rp\s/i.test(trimmed) && trimmed.length < 100;
      if (hasPrice) {
        result.push(`💰 ${trimmed}`);
        inList = false;
        continue;
      }

      // Default: pass through unchanged
      inList = false;
      result.push(line);
    }

    return { text: result.join('\n'), meta };
  }

  /**
   * Match a list item line to a themed emoji based on content keywords.
   * Exact copy of original logic — must remain identical.
   */
  _matchListItemEmoji(text) {
    const lower = text.toLowerCase().trim();

    if (/^rp\s?\d|^rp\.?\s?\d|^(harga|price|biaya|total|bayar|dibayar|tagihan)/i.test(lower)) return '💰';
    if (/(diskon|discount|promo|hemat|murah|gratis|free)/i.test(lower) && lower.length < 80) return '🏷️';
    if (/^(whatsapp|wa\b|phone|telepon|hp|handphone|mobile|kontak|call)/i.test(lower)) return '📱';
    if (/(whatsapp|wa\b|telepon|phone)/i.test(lower) && /\d/.test(lower)) return '📱';
    if (/^(qris|transfer|bank|bca|bni|mandiri|bri|gopay|ovo|dana|shopeepay|linkaja)/i.test(lower)) return '💳';
    if (/^(qris|transfer|bank|gopay|ovo|dana)/i.test(lower)) return '💳';
    if (/^(alamat|lokasi|daerah|kota|kecamatan)/i.test(lower)) return '📍';
    if (/^(delivery|pengiriman|ongkir|kurir|ekspedisi|sameday|nextday)/i.test(lower)) return '🚚';
    if (/^(download|unduh|download|link\s|akses|masuk|login)/i.test(lower)) return '⬇️';
    if (/^(upload|unggah)/i.test(lower)) return '⬆️';
    if (/^(jam\b|pukul|waktu|jadwal|senin|selasa|rabu|kamis|jumat|sabtu|minggu|hari\b|tanggal|bulan|tahun)/i.test(lower)) return '🕒';
    if (/^(warning|perhatian|penting|catatan|note|requirements|syarat|ketentuan)/i.test(lower)) return '⚠️';
    if (/^(benefit|keuntungan|kelebihan|keunggulan|fitur|manfaat|plus|pro)/i.test(lower)) return '✅';
    if (/^(garansi|jaminan|warranty)/i.test(lower)) return '🛡️';
    if (/^(bonus|gift|hadiah|free)/i.test(lower)) return '🎁';
    if (/^(product|produk|item|paket|bundling)/i.test(lower)) return '📦';

    return null;
  }
}

module.exports = DecorateStage;
