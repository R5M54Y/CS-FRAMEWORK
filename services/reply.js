'use strict';

const PromptBuilder = require('./prompt-builder');
const { createQueue, getQueue } = require('./ai-queue');
const { createSessionLogger } = require('../utils/logger');
const config = require('../config');

/**
 * Reply Service — orchestrates the full AI reply flow
 * All AI requests go through the AI Request Queue.
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
  }

  /**
   * Process incoming message → build prompt → enqueue → AI → reply
   */
  async processIncomingMessage(sessionId, sender, message) {
    const session = this.sessionManager.getSession(sessionId);
    if (!session || !session.connected) return;

    const from = sender || message.from;

    const profile = this.sessionManager.getProfile(sessionId);
    const persona = this.sessionManager.getPersona(sessionId);
    const products = this.sessionManager.getProducts(sessionId);
    const knowledge = this.sessionManager.getKnowledge(sessionId);
    const history = this._buildHistory(session.messages, from);

    const messages = this.promptBuilder.build({
      persona,
      profile,
      products,
      knowledge,
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
        await session.sendMessage(from, response);
        this.log.info(`AI reply sent to ${from}`);
      } else {
        this.log.warn(`AI error response: ${response}`);
        await this._fallback(session, from, persona);
      }
    } catch (err) {
      this.log.error(`Reply error: ${err.message}`);
      await this._fallback(session, from, persona);
    }
  }

  _buildHistory(messages, contactJid) {
    const history = [];
    for (const msg of messages) {
      if (msg.from === contactJid || msg.to === contactJid) {
        history.push({
          role: msg.isOutgoing ? 'assistant' : 'user',
          content: msg.content
        });
      }
    }
    return history.slice(-this.maxHistory);
  }

  async _fallback(session, to, persona) {
    const fallback = persona?.fallback || 'Maaf, saya tidak memahami. Bisa diulang? 😊';
    await session.sendMessage(to, fallback);
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
}

module.exports = ReplyService;