'use strict';

/**
 * TypingEngine — calculates dynamic typing duration based on message length
 * and triggers Baileys composing presence.
 *
 * Typing duration formula:
 *   1. Estimate word count from text length (avg 5 chars/word for Indonesian)
 *   2. duration = (words / speedWPM) * 60_000ms, clamped to [min, max]
 *   3. Small jitter (±15%) to feel natural
 */
class TypingEngine {
  /**
   * @param {Object} config — HumanizerConfig.typing section
   * @param {Object} sock    — Baileys socket for sendPresenceUpdate
   */
  constructor(config, sock) {
    this.min = config.min;
    this.max = config.max;
    this.speedWPM = config.speedWPM;
    this.sock = sock;
  }

  /**
   * Calculate typing duration for a given text.
   * @param {string} text
   * @returns {number} duration in ms
   */
  calculateDuration(text) {
    const charsPerWord = 5;
    const wordCount = Math.max(1, (text || '').length / charsPerWord);
    let duration = (wordCount / this.speedWPM) * 60_000;

    // Add ±15% jitter
    const jitter = duration * 0.15 * (Math.random() * 2 - 1);
    duration += jitter;

    // Clamp
    return Math.round(Math.max(this.min, Math.min(this.max, duration)));
  }

  /**
   * Send 'composing' presence and sleep for calculated duration.
   * @param {string} jid     — target JID
   * @param {string} text    — message text (used to calculate duration)
   * @param {Function} [sleepFn] — optional custom sleep (for testing)
   * @returns {Promise<number>} actual duration slept (ms)
   */
  async type(jid, text, sleepFn) {
    const duration = this.calculateDuration(text);

    // Send composing presence
    try {
      await this.sock.sendPresenceUpdate('composing', jid);
    } catch {
      // Presence errors are non-fatal
    }

    // Simulate typing time
    const sleep = sleepFn || ((ms) => new Promise((r) => setTimeout(r, ms)));
    await sleep(duration);

    // Stop composing → set to paused briefly
    try {
      await this.sock.sendPresenceUpdate('paused', jid);
    } catch {
      // Presence errors are non-fatal
    }

    return duration;
  }

  /**
   * Update sock reference (e.g. after reconnect).
   * @param {Object} sock
   */
  setSocket(sock) {
    this.sock = sock;
  }
}

module.exports = TypingEngine;
