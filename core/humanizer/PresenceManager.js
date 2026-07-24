'use strict';

/**
 * PresenceManager — orchestrates presence lifecycle per message send.
 *
 * Flow:
 *   composing (typing) → paused (brief pause after typing) → available (idle)
 *
 * All presence updates are fire-and-forget; failures are silently swallowed
 * because presence is UX sugar, not mission-critical.
 */
class PresenceManager {
  /**
   * @param {Object} sock — Baileys socket (has sendPresenceUpdate)
   */
  constructor(sock) {
    this.sock = sock;
  }

  /**
   * Compose → pause → available sequence.
   * Returns a function that advances the state machine.
   * @param {string} jid
   * @returns {Object} { start, pause, stop }
   */
  createFlow(jid) {
    let state = 'idle';

    return {
      /** Send 'composing' presence */
      start: async () => {
        if (state !== 'idle') return;
        state = 'composing';
        await this._send(jid, 'composing');
      },

      /** Send 'paused' presence (after typing, before sending) */
      pause: async () => {
        if (state !== 'composing') return;
        state = 'paused';
        await this._send(jid, 'paused');
      },

      /** Send 'available' presence (idle) */
      stop: async () => {
        if (state === 'idle') return;
        state = 'idle';
        await this._send(jid, 'available');
      },

      /** Get current state for debugging/testing */
      getState: () => state,
    };
  }

  /** Update socket reference after reconnect */
  setSocket(sock) {
    this.sock = sock;
  }

  // ---- internal ----

  async _send(jid, presence) {
    if (!this.sock || !this.sock.sendPresenceUpdate) return;
    try {
      await this.sock.sendPresenceUpdate(presence, jid);
    } catch {
      // swallow — presence is best-effort
    }
  }
}

module.exports = PresenceManager;