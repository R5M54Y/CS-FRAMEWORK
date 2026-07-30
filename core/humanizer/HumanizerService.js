'use strict';

const Bottleneck = require('bottleneck');
const { createSessionLogger } = require('../../utils/logger');
const HumanizerConfig = require('./HumanizerConfig');
const DelayEngine = require('./DelayEngine');
const TypingEngine = require('./TypingEngine');
const PresenceManager = require('./PresenceManager');
const MessageSplitter = require('./MessageSplitter');

/**
 * HumanizerService — orchestrates human-like message delivery.
 *
 * Architecture:
 *   HumanizerService
 *     └─ Bottleneck.Group
 *         └─ Limiter per JID (sequential per-customer queue)
 *             └─ TypingEngine (composing presence + duration)
 *             └─ DelayEngine  (read delay, split pauses)
 *             └─ PresenceManager (composing → paused → available)
 *             └─ MessageSplitter (paragraph-based)
 *             └─ Send via session.sendMessage()
 *
 * Guarantees:
 *   - Ordered replies per JID (no race conditions)
 *   - Isolated queue per customer
 *   - All humanization is invisible to ReplyService / Session
 */
class HumanizerService {
  /**
   * @param {Object} sessionManager — for accessing sessions (sendMessage, sock)
   * @param {Object} [configOverrides] — partial HumanizerConfig overrides
   */
  constructor(sessionManager, configOverrides = {}) {
    this.sessionManager = sessionManager;
    this.config = new HumanizerConfig(configOverrides);
    this.log = createSessionLogger('humanizer', 'humanizer');

    // Bottleneck group — one limiter per JID
    this.group = new Bottleneck.Group({
      maxConcurrent: this.config.queue.maxConcurrent,
      minTime: this.config.queue.minTime,
    });

    // Per-JID component caches (created lazily)
    this._delayEngines = new Map();
    this._typingEngines = new Map();
    this._presenceManagers = new Map();
    this._messageSplitter = new MessageSplitter(this.config.splitMessage);

    this.log.info(`Humanizer initialized (enabled=${this.config.enabled})`);
  }

  // =====================================================================
  //  PUBLIC API
  // =====================================================================

  /**
   * Send a message through the humanizer pipeline.
   * This is the ONLY method that external callers should use.
   *
   * @param {Object} params
   * @param {string} params.sessionId  — session ID (for accessing sock)
   * @param {string} params.to         — target JID
   * @param {string} params.text       — AI-generated response text
   * @param {Object} [params.options]  — extra sendMessage options (quoted, media, etc.)
   * @returns {Promise<Object|null>}  — Baileys send result(s)
   */
  async send({ sessionId, to, text, options = {} }) {
    if (!this.config.enabled) {
      // Bypass — direct send with no humanization
      return this._rawSend(sessionId, to, text, options);
    }

    const session = this.sessionManager.getSession(sessionId);
    if (!session || !session.connected) {
      this.log.warn(`Cannot humanize: session ${sessionId} not connected`);
      return null;
    }

    // Queue via Bottleneck limiter for this JID (sequential per-customer)
    const limiter = this.group.key(to);

    const result = await limiter.schedule(() =>
      this._humanizeAndSend({ sessionId, to, text, options, session })
    );

    return result;
  }

  /**
   * Get queue statistics for all JIDs.
   * @returns {Object}
   */
  getStats() {
    const jobs = this.group.jobs();
    return {
      queuedJobs: jobs.length,
      config: this.config.toJSON(),
    };
  }

  /**
   * Update Baileys socket reference for all engines (e.g. after reconnect).
   * @param {string} sessionId
   */
  updateSocket(sessionId) {
    const session = this.sessionManager.getSession(sessionId);
    if (!session || !session.sock) return;

    this._typingEngines.forEach((engine) => engine.setSocket(session.sock));
    this._presenceManagers.forEach((pm) => pm.setSocket(session.sock));
  }

  /**
   * Update config at runtime.
   * @param {Object} overrides
   */
  updateConfig(overrides) {
    this.config = new HumanizerConfig(overrides);
    this._messageSplitter = new MessageSplitter(this.config.splitMessage);
    this.log.info('Humanizer config updated');
  }

  /**
   * Cleanup: disconnect all limiters and clear caches.
   */
  async shutdown() {
    try {
      await this.group.disconnect();
    } catch {
      // best-effort
    }
    this._delayEngines.clear();
    this._typingEngines.clear();
    this._presenceManagers.clear();
    this.log.info('Humanizer shut down');
  }

  // =====================================================================
  //  INTERNAL
  // =====================================================================

  /**
   * Core humanization pipeline per JID.
   * Called inside a Bottleneck job — guaranteed sequential.
   */
  async _humanizeAndSend({ sessionId, to, text, options, session }) {
    const delayEngine = this._getDelayEngine(sessionId);
    const presence = this._getPresenceManager(sessionId);

    // 1. Start typing presence
    const flow = presence.createFlow(to);
    await flow.start();

    // 2. Calculate & execute typing duration
    const typingEngine = this._getTypingEngine(sessionId);
    const typingDuration = await typingEngine.type(to, text, delayEngine.sleep.bind(delayEngine));

    // 3. Brief read delay (simulates "reads before responding")
    const readDelay = delayEngine.getReadDelay();
    await delayEngine.sleep(readDelay);

    // 4. Decorate plain text with WhatsApp formatting (if applicable)
    const decorated = this._decorate(text);

    // 5. Split message into parts
    const parts = this._messageSplitter.split(decorated);

    // 6. Send each part with pauses between
    const results = [];
    for (let i = 0; i < parts.length; i++) {
      // Show typing for multi-part messages (re-composing for subsequent parts)
      if (i > 0) {
        try {
          await session.sock.sendPresenceUpdate('composing', to);
        } catch {
          // non-fatal
        }

        // Brief pause between messages
        const pause = delayEngine.getSplitPause();
        await delayEngine.sleep(pause);

        try {
          await session.sock.sendPresenceUpdate('paused', to);
        } catch {
          // non-fatal
        }
      }

      const sent = await this._rawSend(sessionId, to, parts[i], options);
      results.push(sent);
    }

    // 6. Set presence to available (idle)
    await flow.stop();

    return results.length === 1 ? results[0] : results;
  }

  /**
   * Raw send — bypasses humanization, calls session.sendMessage directly.
   */
  async _rawSend(sessionId, to, text, options) {
    const session = this.sessionManager.getSession(sessionId);
    if (!session || !session.connected) return null;
    return session.sendMessage(to, text, options);
  }

  /**
   * Decorate plain text with WhatsApp-friendly formatting.
   * Only improves presentation — never changes meaning.
   * Skips if text already has emoji (AI already formatted it).
   */
  _decorate(text) {
    if (!text) return text;

    // Section keyword → emoji mapping (precise, single-match)
    const SECTION_MAP = [
      // Case-insensitive keyword match, longer match wins (put specific first)
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

    // If ANY emoji from our mapping exists in the text, skip decoration
    const allEmojis = SECTION_MAP.map(s => s.emoji);
    const emojiRegex = new RegExp(allEmojis.join('|'), 'u');
    if (emojiRegex.test(text)) return text;

    // Also skip if any Unicode emoji is already present (broader check)
    const anyEmoji = /[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{2300}-\u{23FF}\u{2B50}\u{2934}\u{2935}\u{25AA}\u{25AB}\u{25FB}\u{25FC}\u{25FE}\u{25FD}\u{FE0F}]/u.test(text);
    if (anyEmoji) return text;

    // Process line by line
    const lines = text.split('\n');
    const result = [];
    let inList = false;
    let lastSectionEmoji = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      const prevLine = i > 0 ? lines[i - 1].trim() : '';
      const nextLine = i < lines.length - 1 ? lines[i + 1].trim() : '';

      // Preserve empty lines
      if (!trimmed) {
        inList = false;
        result.push(line);
        continue;
      }

      // Detect section headers (short standalone line ending with colon)
      const isSectionHeader = /^[A-Za-z\u00C0-\u024F\u0400-\u04FF\u0600-\u06FF\u0900-\u097F\u0E00-\u0E7F\u0E80-\u0EFF\u0F00-\u0FFF\u1F00-\u1FFF\u2000-\u206F\u2E00-\u2E7F\u3000-\u303F\u3040-\u309F\u30A0-\u30FF\u3100-\u312F\u3130-\u318F\u3190-\u31FF\u3200-\u32FF\u3300-\u33FF\u3400-\u4DBF\u4E00-\u9FFF\uA000-\uA4CF\uA960-\uA97F\uAC00-\uD7AF\uF900-\uFAFF]/.test(trimmed) &&
        trimmed.endsWith(':') &&
        trimmed.length < 80 &&
        !prevLine.endsWith(':') &&
        !trimmed.startsWith('http') &&
        !trimmed.startsWith('@');

      if (isSectionHeader) {
        // Find matching emoji for this section header
        let matched = null;
        for (const s of SECTION_MAP) {
          if (s.match.test(trimmed.replace(':', '').trim())) {
            matched = s.emoji;
            break;
          }
        }

        // Add blank line before section for spacing (if not already)
        if (result.length > 0 && result[result.length - 1] !== '') {
          result.push('');
        }

        if (matched) {
          result.push(`${matched} ${trimmed}`);
          lastSectionEmoji = matched;
        } else {
          result.push(trimmed);
          lastSectionEmoji = null;
        }

        inList = true;
        continue;
      }

      // Detect list items: short lines after a section header or in a group
      const isListItem = inList &&
        trimmed.length < 120 &&
        !trimmed.startsWith('Halo') &&
        !trimmed.startsWith('Ada yang') &&
        !trimmed.startsWith('Silakan') &&
        !trimmed.startsWith('Terima') &&
        !trimmed.startsWith('Ya,') &&
        !trimmed.startsWith('Tentu') &&
        !trimmed.endsWith(':') &&
        !/^[📦✅💰🕒🚚⬇️⬆️✨🎁🛡️🏷️🎉👉💡⭐❓📝⚠️❌♾️🔗🧩📚📄🎥🖼️🔤🛒💬📞📱💳🏦📲👤🙋]/.test(trimmed);

      if (isListItem) {
        // Check for price/payment/bonus/promo lines — use themed emoji
        const themedEmoji = this._matchListItemEmoji(trimmed);
        if (themedEmoji) {
          result.push(`${themedEmoji} ${trimmed}`);
        } else {
          result.push(`✅ ${trimmed}`);
        }
        continue;
      }

      // Detect standalone price lines
      const hasPrice = /^rp\s?\d|harga\s|rp\s/i.test(trimmed) && trimmed.length < 100;
      if (hasPrice && !isSectionHeader) {
        result.push(`💰 ${trimmed}`);
        inList = false;
        continue;
      }

      // Default: pass through unchanged
      inList = false;
      lastSectionEmoji = null;
      result.push(line);
    }

    // Ensure proper spacing: add blank line between sections
    const joined = result.join('\n');
    // Collapse multiple consecutive blank lines into one
    return joined.replace(/\n{3,}/g, '\n\n');
  }

  /**
   * Match a list item line to a themed emoji based on content keywords.
   * @param {string} text - The trimmed line text
   * @returns {string|null} Emoji if matched, null for generic item
   */
  _matchListItemEmoji(text) {
    const lower = text.toLowerCase().trim();

    // Price/payment related
    if (/^rp\s?\d|^rp\.?\s?\d|^(harga|price|biaya|total|bayar|dibayar|tagihan)/i.test(lower)) return '💰';
    if (/(diskon|discount|promo|hemat|murah|gratis|free)/i.test(lower) && lower.length < 80) return '🏷️';

    // Contact/communication
    if (/^(whatsapp|wa\b|phone|telepon|hp|handphone|mobile|kontak|call)/i.test(lower)) return '📱';
    if (/(whatsapp|wa\b|telepon|phone)/i.test(lower) && /\d/.test(lower)) return '📱';

    // Payment methods
    if (/^(qris|transfer|bank|bca|bni|mandiri|bri|gopay|ovo|dana|shopeepay|linkaja)/i.test(lower)) return '💳';
    if (/^(qris|transfer|bank|gopay|ovo|dana)/i.test(lower)) return '💳';

    // Location/delivery
    if (/^(alamat|lokasi|daerah|kota|kecamatan)/i.test(lower)) return '📍';
    if (/^(delivery|pengiriman|ongkir|kurir|ekspedisi|sameday|nextday)/i.test(lower)) return '🚚';

    // Download/upload
    if (/^(download|unduh|download|link\s|akses|masuk|login)/i.test(lower)) return '⬇️';
    if (/^(upload|unggah)/i.test(lower)) return '⬆️';

    // Time/schedule
    if (/^(jam\b|pukul|waktu|jadwal|senin|selasa|rabu|kamis|jumat|sabtu|minggu|hari\b|tanggal|bulan|tahun)/i.test(lower)) return '🕒';

    // Warning/important
    if (/^(warning|perhatian|penting|catatan|note|requirements|syarat|ketentuan)/i.test(lower)) return '⚠️';

    // Success/benefit
    if (/^(benefit|keuntungan|kelebihan|keunggulan|fitur|manfaat|plus|pro)/i.test(lower)) return '✅';

    // Guarantee
    if (/^(garansi|jaminan|warranty)/i.test(lower)) return '🛡️';

    // Bonus/gift
    if (/^(bonus|gift|hadiah|free)/i.test(lower)) return '🎁';

    // Product/item
    if (/^(product|produk|item|paket|bundling)/i.test(lower)) return '📦';

    return null;
  }

  // ---- component factories (lazy, cached per sessionId) ----

  _getDelayEngine(sessionId) {
    if (!this._delayEngines.has(sessionId)) {
      this._delayEngines.set(sessionId, new DelayEngine(this.config));
    }
    return this._delayEngines.get(sessionId);
  }

  _getTypingEngine(sessionId) {
    if (!this._typingEngines.has(sessionId)) {
      const session = this.sessionManager.getSession(sessionId);
      this._typingEngines.set(
        sessionId,
        new TypingEngine(this.config.typing, session?.sock || null)
      );
    }
    return this._typingEngines.get(sessionId);
  }

  _getPresenceManager(sessionId) {
    if (!this._presenceManagers.has(sessionId)) {
      const session = this.sessionManager.getSession(sessionId);
      this._presenceManagers.set(
        sessionId,
        new PresenceManager(session?.sock || null)
      );
    }
    return this._presenceManagers.get(sessionId);
  }
}

module.exports = HumanizerService;