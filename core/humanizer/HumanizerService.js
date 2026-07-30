'use strict';

const Bottleneck = require('bottleneck');
const { createSessionLogger } = require('../../utils/logger');
const HumanizerConfig = require('./HumanizerConfig');
const DelayEngine = require('./DelayEngine');
const TypingEngine = require('./TypingEngine');
const PresenceManager = require('./PresenceManager');
const MessageSplitter = require('./MessageSplitter');
const {
  NormalizeStage,
  RemoveMarkdownStage,
  DetectFormattingStage,
  DetectSectionsStage,
  DetectStructureStage,
  DetectListsStage,
  DetectSpecialBlocksStage,
  SemanticAnalyzerStage,
  DecorateStage,
  ImproveSpacingStage,
  SemanticChunkStage,
  SplitLongMessagesStage,
  FinalNormalizeStage,
} = require('./stages');
const FormattingRulesRegistry = require('./FormattingRulesRegistry');

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

    // Pipeline stages (single responsibility, ordered)
    this.registry = new FormattingRulesRegistry();
    this._stages = [
      new NormalizeStage(),
      new RemoveMarkdownStage(),
      new DetectFormattingStage({ registry: this.registry }),
      new DetectSectionsStage(),
      new DetectStructureStage(),
      new DetectListsStage(),
      new DetectSpecialBlocksStage(),
      new SemanticAnalyzerStage(),
      new DecorateStage({ registry: this.registry }),
      new SemanticChunkStage(),
      new ImproveSpacingStage(),
      new SplitLongMessagesStage(),
      new FinalNormalizeStage(),
    ];

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
    const decoratedResult = this._decorate(text);
    const finalText = decoratedResult.text;
    const chunks = decoratedResult.meta?.chunks || null;

    // 5. Determine message parts — use semantic chunks if available, otherwise split
    let parts;
    if (chunks && chunks.length > 0) {
      parts = chunks;
    } else {
      parts = this._messageSplitter.split(finalText);
    }

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
   * Orchestrates the pipeline stages in order.
   * Only improves presentation — never changes meaning.
   * Skips if text already has emoji (AI already formatted it).
   * @returns {{ text: string, meta: Object }}
   */
  _decorate(text) {
    if (!text) return { text, meta: {} };

    let result = { text, meta: {} };

    // Run each stage in sequence. Each stage receives the previous stage's output.
    // Stages: Normalize → RemoveMarkdown → DetectFormatting → DetectSections → DetectStructure → DetectLists → DetectSpecialBlocks → SemanticAnalyzer → Decorate → SemanticChunk → ImproveSpacing → SplitLongMessages → FinalNormalize
    for (const stage of this._stages) {
      // DetectFormattingStage sets meta.alreadyFormatted — short-circuit after it
      if (result.meta.alreadyFormatted && stage.name !== 'NormalizeStage' && stage.name !== 'DetectFormattingStage') {
        continue;
      }
      result = stage.process(result.text, result.meta);
    }

    return result;
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