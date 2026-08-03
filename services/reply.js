'use strict';

const config = require('../config');
const PromptBuilder = require('./prompt-builder');
const { createQueue, getQueue } = require('./ai-queue');
const { createSessionLogger } = require('../utils/logger');
const HumanizerService = require('../core/humanizer/HumanizerService');
const messageRepo = require('../core/repositories/MessageRepository');
const ActionParser = require('./ActionParser');
const GalleryDeliveryEngine = require('./GalleryDeliveryEngine');
const path = require('path');

/**
 * ReplyService — orchestrates the full AI reply flow
 * All AI requests go through the AI Request Queue.
 * Now integrates HumanizerService for human-like message delivery.
 */
class ReplyService {
  constructor(sessionManager) {
    this.sessionManager = sessionManager;
    this.promptBuilder = new PromptBuilder();
    this.log = createSessionLogger('reply', 'reply-service');
    this.maxHistory = 20;

    // Create queue singleton with config
    this.queue = createQueue({
      concurrency: config.aiQueueConcurrency,
      timeout: config.aiRequestTimeout,
      maxRetries: config.aiQueueMaxRetries,
      baseDelay: config.aiQueueBaseDelay,
      maxDelay: config.aiQueueMaxDelay
    });

    // Humanizer instance — handles typing, presence, delays, splitting
    this.humanizer = new HumanizerService(sessionManager, config.humanizer);

    // Gallery selection engine — decides which files to deliver
    this.galleryEngine = new GalleryDeliveryEngine({
      listGalleryFiles: (sid) => sessionManager.listGalleryFiles(sid)
    });
  }

  /**
   * Process incoming message → build prompt → enqueue → AI → reply via Humanizer
   */
  async processIncomingMessage(sessionId, sender, message) {
      const session = this.sessionManager.getSession(sessionId);
      if (!session || !session.connected) return;

      // Check if bot is paused by human takeover
      if (!session.isBotEnabled()) {
        this.log.info(`Bot paused by human takeover for session ${sessionId}, skipping AI request`);
        return;
      }

      const from = sender || message.from;

      const profile = this.sessionManager.getProfile(sessionId);
      const persona = this.sessionManager.getPersona(sessionId);
      const personaPromptData = this.sessionManager.getPersonaPrompt(sessionId);
      const personaPrompt = (personaPromptData && typeof personaPromptData === 'object') ? personaPromptData.prompt || '' : personaPromptData || '';
      const products = this.sessionManager.getProducts(sessionId);
      const knowledge = this.sessionManager.getKnowledge(sessionId);
      const knowledgeConfig = this.sessionManager.getKnowledgeConfig(sessionId);
      const history = await this._buildHistory(session, from);
      const gallerySummary = await this._buildGallerySummary(sessionId, from);

      // Build customer context for first conversation welcome flow
      const customerContext = this._buildCustomerContext(session, from, history);

      const messages = this.promptBuilder.build({
        persona,
        personaPrompt,
        profile,
        products,
        knowledge,
        knowledgeConfig,
        history,
        userMessage: message.content,
        gallerySummary,
        customerContext
      });

    try {
      this.log.info(`Enqueuing AI request for session ${sessionId} → ${from}`);
      
      // All AI requests go through the queue
      const response = await this.queue.enqueue({
        id: `ai-${sessionId}-${Date.now()}`,
        sessionId,
        messages,
        metadata: { sender: from, sessionId }
      });

      if (response && !response.startsWith('[')) {
        // Parse for action blocks (e.g. <action type="send_gallery">)
        const { actions, text: cleanText } = ActionParser.parse(response);

        // Execute actions before sending text
        if (actions.length > 0) {
          await this._executeActions(sessionId, from, actions);
        }

        // Send remaining text through Humanizer (if any)
        if (cleanText) {
          await this.humanizer.send({
            sessionId,
            to: from,
            text: cleanText,
            options: {}
          });
        }
        this.log.info(`AI reply sent via Humanizer to ${from}`);
      } else {
        this.log.warn(`AI error response: ${response}`);
        await this._fallback(session, from, persona);
      }
    } catch (err) {
      this.log.error(`Reply error: ${err.message}`);
      await this._fallback(session, from, persona);
    }
  }

  /**
   * Get queue statistics
   */
  getQueueStats() {
    return this.queue.getStats();
  }

  /**
   * Update queue concurrency
   */
  setQueueConcurrency(concurrency) {
    this.queue.setConcurrency(concurrency);
  }

  async _executeActions(sessionId, to, actions) {
    const fs = require('fs');
    const session = this.sessionManager.getSession(sessionId);
    if (!session || !session.sock) return;

    for (const action of actions) {
      if (action.type === 'send_gallery') {
        await this._sendGallery(session, sessionId, to, action);
      } else if (action.type === 'send_marketplace_url') {
        await this._sendMarketplaceUrl(session, sessionId, to, action);
      }
    }
  }

  async _sendGallery(session, sessionId, to, action) {
    const fs = require('fs');
    const path = require('path');
    const config = require('../config');

    // chatId: strip JID suffix for per-customer history scoping
    const chatId = to.replace(/@[sw]\.whatsapp\.net$|@lid$/i, '');

    // Use GalleryDeliveryEngine — excludes previously delivered files
    const selection = await this.galleryEngine.select(sessionId, chatId, action.count || 4);
    const selected = selection.files;

    // No files available (gallery empty OR exhausted) — do nothing.
    // AI prompt already knows galleryExhausted state; text-only reply follows.
    if (selected.length === 0) return;

    // Send first image via session.sendImage to get message key & persist
    const first = selected[0];
    const firstUrl = `http://localhost:${config.port}/api/session/${sessionId}/gallery/${first.id}/download`;
    const caption = action.caption || '';
    const deliveredIds = [];

    let firstMsg;
    try {
      firstMsg = await session.sendImage(to, firstUrl, caption);
    } catch (err) {
      this.log.error(`Gallery send failed for ${first.id}: ${err.message}`);
      return;
    }
    if (!firstMsg || !firstMsg.key) return;
    deliveredIds.push(first.id);

    // Remaining images → album via sock.sendMessage with albumParentKey
    // STOP on first failure — record only successfully delivered files.
    if (selected.length > 1) {
      const remaining = selected.slice(1);
      for (const file of remaining) {
        const fileUrl = `http://localhost:${config.port}/api/session/${sessionId}/gallery/${file.id}/download`;
        try {
          const sent = await session.sock.sendMessage(to, {
            image: { url: fileUrl },
            albumParentKey: firstMsg.key
          }, {});
          if (!sent || !sent.key) {
            this.log.error(`Gallery send no key for ${file.id}, stopping`);
            break;
          }
          deliveredIds.push(file.id);
        } catch (err) {
          this.log.error(`Gallery send failed for ${file.id}: ${err.message} — stopping`);
          break;
        }
      }
    }

    // Persist delivery history ONLY for successfully delivered files
    if (deliveredIds.length > 0) {
      await messageRepo.recordGalleryDeliveryBatch(sessionId, chatId, deliveredIds);
      this.log.info(`Gallery delivered ${deliveredIds.length}/${selected.length} to ${chatId}`);
    }
  }

  async _sendMarketplaceUrl(session, sessionId, to, action) {
    const knowledgeConfig = this.sessionManager.getKnowledgeConfig(sessionId);
    const url = knowledgeConfig?.marketplaceUrl || '';
    const message = action.message || '';

    this.log.info(`Marketplace URL action — session=${sessionId} url=${url ? 'PRESENT' : 'MISSING'}`);

    if (!url) {
      const fallback = 'Maaf Kak, link pembelian belum tersedia saat ini. Silakan hubungi admin terlebih dahulu.';
      await session.sendMessage(to, fallback);
      return;
    }

    // Send AI's message first
    if (message) {
      await session.sendMessage(to, message);
    }

    // Send marketplace URL as standalone plain-text message (no markdown, no emoji)
    await session.sendMessage(to, url);
  }

  async _fallback(session, to, persona) {
      const fallbackResponses = [
        'Maaf Kak, saya tak sengaja melewatkan pesan Anda. Bisa ulangi? 😊',
        'Maaf Kak, pesan tadi sepertinya tidak keangkut. Kirim ulang ya? 🙏',
        'Maaf Kak, saya agak kewalahan. Ada yang bisa dibantu? Bisa diulang ya? 😊',
        'Maaf Kak, sepertinya saya lewatkan chat ini. Bisa mulai lagi? 🙏',
        'Maaf Kak, ada sedikit gangguan. Bisa pesan ulang sebentar? 😊',
        'Maaf Kak, saya kira pesan ini tidak masuk. Kirim ulang ya? 🙏',
        'Maaf Kak, percakapan tadi terputus. Mulai dari sini? Bisa ulang? 😊',
        'Maaf Kak, saya terlewatkan notifikasi. Ada apa Kak? Bisa pesan lagi? 🙏',
        'Maaf Kak, chat ini tiba-tiba diam. Lanjutkan lagi? 😊',
        'Maaf Kak, saya tidak sempat membaca. Bisa diulang? 🙏',
        'Maaf Kak, sepertinya ada kendala. Coba kirim lagi? 😊',
        'Maaf Kak, saya kira sudah selesai. Ada yang lain? Bisa pesan lagi? 🙏',
        'Maaf Kak, salah paham sedikit. Bisa jelaskan lagi? 😊',
        'Maaf Kak, saya lewatkan satu pesan. Kirim ulang ya? 🙏',
        'Maaf Kak, sistem chat agak lambat. Coba sekali lagi? 😊'
      ];

      const fallback = persona?.fallback || fallbackResponses[Math.floor(Math.random() * fallbackResponses.length)];
      await session.sendMessage(to, fallback);
    }

  async _buildGallerySummary(sessionId, from) {
    try {
      const chatId = String(from).replace(/@[sw]\.whatsapp\.net$|@lid$/i, '');
      const allFiles = this.sessionManager.listGalleryFiles(sessionId) || [];
      const total = allFiles.length;
      const delivered = await messageRepo.getDeliveredGallery(sessionId, chatId);
      const remaining = total - delivered.size;
      const exhausted = remaining <= 0;
      return { total, remaining, exhausted };
    } catch (err) {
      this.log.error(`_buildGallerySummary error: ${err.message}`);
      return { total: 0, remaining: 0, exhausted: true };
    }
  }

  async _buildHistory(session, contactJid) {
    // Try cache first (fast path)
    if (session.messages && session.messages.length > 0) {
      const history = [];
      for (const msg of session.messages) {
        if (msg.from === contactJid || msg.to === contactJid) {
          history.push({
            role: msg.isOutgoing ? 'assistant' : 'user',
            content: msg.content
          });
        }
      }
      if (history.length > 0) return history.slice(-this.maxHistory);
    }
    // Fall back to SQLite (authoritative)
    try {
      const msgs = await messageRepo.findByChatForHistory(session.id, contactJid, this.maxHistory);
      return msgs.map(msg => ({
        role: msg.isOutgoing ? 'assistant' : 'user',
        content: msg.content
      }));
    } catch (err) {
      this.log.error(`_buildHistory DB error: ${err.message}`);
      return [];
    }
  }

  /**
   * Build customer context for prompt builder.
   * Extracts display name from WhatsApp session contacts.
   * Detects first conversation using message history heuristic (not guaranteed).
   * @param {Object} session - Session object
   * @param {string} from - Customer JID
   * @param {Array} history - Message history for this customer
   * @returns {Object} customerContext
   */
  _buildCustomerContext(session, from, history) {
    const ctx = { isFirstConversation: false, displayName: null };

    // --- Display name extraction ---
    // Reuse existing session contacts data (pushName → notify → verifiedName)
    const contacts = session.contacts || new Map();
    const contact = contacts.get(from) || {};
    const rawName = contact.pushName || contact.notify || contact.verifiedName || null;

    if (rawName && this._isValidDisplayName(rawName)) {
      ctx.displayName = rawName.trim();
    }

    // --- First conversation detection ---
    // HEURISTIC: Runtime detection based on available message history.
    // This is NOT a guaranteed method; it relies on current history snapshot.
    // Other factors (like persistent state) may exist but are not considered here.
    // Only indicates lack of recorded prior messages in the current session.
    ctx.isFirstConversation = history.length === 0;

    return ctx;
  }

  /**
   * Validate customer display name.
   * Reject phone numbers, empty, whitespace-only, symbols-only, numeric-only,
   * and obviously invalid names.
   * Does NOT reject legitimate Indonesian names (accented chars, long names, etc.).
   */
  _isValidDisplayName(name) {
    if (!name || typeof name !== 'string') return false;
    const trimmed = name.trim();
    if (trimmed.length === 0) return false;
    if (trimmed.length > 30) return false;

    // Phone number patterns (Indonesian: 0xxx, +62xxx, 62xxx) — 10-15 digits
    const phonePattern = /^(\+?62|0)[0-9]{9,14}$/;
    const digitsOnly = trimmed.replace(/\s/g, '');
    if (phonePattern.test(digitsOnly)) return false;

    // Numeric-only (all digits and optional separators)
    if (/^[0-9\s]+$/.test(trimmed)) return false;

    // Symbols-only (no letter at all)
    if (!/[a-zA-Z\u00C0-\u024F\u1E00-\u1EFF]/i.test(trimmed)) return false;

    // URL or handle pattern
    if (/^(https?:\/\/|www\.|@)/i.test(trimmed)) return false;

    // All-caps multi-word is almost certainly a business name
    if (/^[A-Z][A-Z\s]{4,}$/.test(trimmed) && /\s/.test(trimmed)) return false;

    // All-caps single-word with no space is likely a brand/business (3+ chars)
    if (/^[A-Z]{3,}$/.test(trimmed) && !/[a-z]/.test(trimmed)) return false;

    return true;
  }
}

module.exports = ReplyService;
