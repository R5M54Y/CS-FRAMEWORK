'use strict';

/**
 * DetectSectionsStage — Stage 3 of the Humanizer pipeline.
 *
 * Responsibilities:
 * - Detect section headers (lines ending with colon that look like titles)
 * - Match headers against keyword → emoji mapping
 * - Return annotated line metadata for DecorateStage
 *
 * Does NOT modify text.
 * Does NOT decorate.
 * Does NOT make spacing decisions.
 */
class DetectSectionsStage {
  constructor(options = {}) {
    this.name = 'DetectSectionsStage';
  }

  /** Section keyword → emoji mapping (shared with DecorateStage) */
  static SECTION_MAP = [
    { match: /^marketplace/i, emoji: '🛒' },
    { match: /^whatsapp/i, emoji: '💬' },
    { match: /^website/i, emoji: '🔗' },
    { match: /^alamat/i, emoji: '📍' },
    { match: /^kontak/i, emoji: '📞' },
    { match: /^telepon|^phone|^hp|^handphone/i, emoji: '📱' },
    { match: /^pembayaran|^pembayar/i, emoji: '💳' },
    { match: /^transfer/i, emoji: '🏦' },
    { match: /^qris/i, emoji: '📲' },
    { match: /^delivery|^pengiriman|^ongkir/i, emoji: '🚚' },
    { match: /^download/i, emoji: '⬇️' },
    { match: /^upload/i, emoji: '⬆️' },
    { match: /^harga|^price|^biaya|^promo|^rp\b/i, emoji: '💰' },
    { match: /^customer/i, emoji: '👤' },
    { match: /^admin/i, emoji: '🙋' },
    { match: /^fitur|^keunggulan|^kelebihan/i, emoji: '✨' },
    { match: /^produk|^katalog|^item\b/i, emoji: '📦' },
    { match: /^bonus/i, emoji: '🎁' },
    { match: /^garansi/i, emoji: '🛡️' },
    { match: /^diskon|^discount/i, emoji: '🏷️' },
    { match: /^promo/i, emoji: '🎉' },
    { match: /^langkah|^cara|^tutorial|^step/i, emoji: '👉' },
    { match: /^tips/i, emoji: '💡' },
    { match: /^testimoni/i, emoji: '⭐' },
    { match: /^faq|^tanya/i, emoji: '❓' },
    { match: /^catatan|^note/i, emoji: '📝' },
    { match: /^penting|^warning|^perhatian/i, emoji: '⚠️' },
    { match: /^jadwal|^jam|^waktu|^schedule|^buka|^tutup/i, emoji: '🕒' },
    { match: /^success|^sukses|^berhasil/i, emoji: '✅' },
    { match: /^error|^gagal|^salah/i, emoji: '❌' },
    { match: /^lifetime|^selamanya|^seumur/i, emoji: '♾️' },
    { match: /^link|^url/i, emoji: '🔗' },
    { match: /^anak|^kids|^children/i, emoji: '🧩' },
    { match: /^pendidikan|^edukasi|^belajar|^worksheet/i, emoji: '📚' },
    { match: /^materi|^bahan ajar/i, emoji: '📄' },
    { match: /^video/i, emoji: '🎥' },
    { match: /^gambar|^image|^foto/i, emoji: '🖼️' },
    { match: /^pdf/i, emoji: '📄' },
    { match: /^flashcard|^kartu/i, emoji: '🔤' },
  ];

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
        let matched = null;
        for (const s of DetectSectionsStage.SECTION_MAP) {
          if (s.match.test(headerText)) {
            matched = s.emoji;
            break;
          }
        }

        sections.push({
          lineIndex: i,
          header: headerText,
          emoji: matched,
          rawLine: lines[i],
          isSectionHeader: true
        });
      }
    }

    return { text, meta: { sections } };
  }

  /** Convenience: match header text to emoji */
  static matchHeader(text) {
    for (const s of DetectSectionsStage.SECTION_MAP) {
      if (s.match.test(text)) return s.emoji;
    }
    return null;
  }
}

module.exports = DetectSectionsStage;
