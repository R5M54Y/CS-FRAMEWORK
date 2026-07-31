'use strict';

const config = require('../config');
const PromptBuilder = require('./prompt-builder');
const { createQueue, getQueue } = require('./ai-queue');
const { createSessionLogger } = require('../utils/logger');
const HumanizerService = require('../core/humanizer/HumanizerService');
const messageRepo = require('../core/repositories/MessageRepository');
const ActionParser = require('./ActionParser');
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

    const messages = this.promptBuilder.build({
      persona,
      personaPrompt,
      profile,
      products,
      knowledge,
      knowledgeConfig,
      history,
      userMessage: message.content
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
    const files = this.sessionManager.listGalleryFiles(sessionId);
    if (!files || files.length === 0) return;

    // Random selection: max 4 for album, or all if <= 4
    const maxCount = 4;
    const count = Math.min(action.count || 1, files.length, maxCount);
    const shuffled = [...files].sort(() => Math.random() - 0.5);
    const selected = shuffled.slice(0, count);

    // Send first image via session.sendImage to get message key & persist
    const first = selected[0];
    const firstUrl = `http://localhost:${config.port}/api/session/${sessionId}/gallery/${first.id}/download`;
    const caption = action.caption || '';
    let firstMsg;
    try {
      firstMsg = await session.sendImage(to, firstUrl, caption);
    } catch (err) {
      return;
    }
    if (!firstMsg || !firstMsg.key) return;

    // Remaining images → send as album via sock.sendMessage with albumParentKey
    if (selected.length > 1) {
      const remaining = selected.slice(1);
      for (const file of remaining) {
        const fileUrl = `http://localhost:${config.port}/api/session/${sessionId}/gallery/${file.id}/download`;
        try {
          await session.sock.sendMessage(to, {
            image: { url: fileUrl },
            albumParentKey: firstMsg.key
          }, {});
        } catch (err) {
          // album image send failed, continue with next
        }
      }
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
    const fallback = persona?.fallback || 'Maaf, saya tidak memahami. Bisa diulang? 😊';
    await session.sendMessage(to, fallback);
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
}

module.exports = ReplyService;
