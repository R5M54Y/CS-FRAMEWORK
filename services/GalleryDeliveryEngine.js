'use strict';

/**
 * GalleryDeliveryEngine — decides WHICH gallery files should be delivered.
 *
 * Single responsibility: selection only.
 * It MUST NOT send media, parse AI, access socket, or render UI.
 *
 * Rules:
 * - History is scoped by (session_id, chat_id) — per customer.
 * - Previously delivered items are NEVER eligible again.
 * - Selection is randomized ONLY inside the remaining pool.
 * - Max 4 files per delivery (even if AI requests more).
 * - If remaining < requested, send only remaining files.
 * - If remaining == 0, return galleryExhausted=true (no reset, no resend).
 */

const messageRepo = require('../core/repositories/MessageRepository');

const MAX_GALLERY_PER_DELIVERY = 4;

class GalleryDeliveryEngine {
  /**
   * @param {Function} listGalleryFiles - (sessionId) => Array<{id: string, ...}>
   *   Injected to keep engine decoupled from SessionManager.
   */
  constructor({ listGalleryFiles } = {}) {
    this.listGalleryFiles = listGalleryFiles || (() => []);
  }

  /**
   * Select gallery files for delivery.
   *
   * @param {string} sessionId
   * @param {string} chatId          - bare phone or JID
   * @param {number} requestedCount  - how many AI asked for
   * @returns {Promise<{ files: Array, galleryExhausted: boolean, remaining: number }>}
   */
  async select(sessionId, chatId, requestedCount = 4) {
    // 1. Load gallery
    const allFiles = this.listGalleryFiles(sessionId) || [];

    // 2. Load delivery history (scoped to session + chat ONLY)
    const delivered = await messageRepo.getDeliveredGallery(sessionId, chatId);

    // 3. Exclude delivered files
    const remaining = allFiles.filter(f => !delivered.has(f.id));

    // 4. Exhausted?
    if (remaining.length === 0) {
      return { files: [], galleryExhausted: true, remaining: 0 };
    }

    // 5. Shuffle remaining pool
    const shuffled = [...remaining].sort(() => Math.random() - 0.5);

    // 6. Take min(remaining, requested, MAX=4)
    const take = Math.min(remaining.length, requestedCount || 4, MAX_GALLERY_PER_DELIVERY);
    const selected = shuffled.slice(0, take);

    return {
      files: selected,
      galleryExhausted: false,
      remaining: remaining.length - selected.length
    };
  }
}

module.exports = GalleryDeliveryEngine;
