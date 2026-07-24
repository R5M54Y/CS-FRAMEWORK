'use strict';

/**
 * DelayEngine — utility for random delays within configured bounds.
 * Stateless, pure functions. No side effects.
 */
class DelayEngine {
  /**
   * @param {Object} config — HumanizerConfig instance (or any object with readDelay/randomPause)
   */
  constructor(config) {
    this.config = config;
  }

  /** Random integer between min and max (inclusive). */
  randomBetween(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  /** Read delay: simulated "person reads the response before typing". */
  getReadDelay() {
    const { min, max } = this.config.readDelay;
    return this.randomBetween(min, max);
  }

  /** Random pause between split messages. */
  getSplitPause() {
    if (!this.config.randomPause.enabled) return 0;
    const { min, max } = this.config.randomPause;
    return this.randomBetween(min, max);
  }

  /**
   * Sleep helper — returns a promise that resolves after `ms`.
   * @param {number} ms
   * @returns {Promise<void>}
   */
  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

module.exports = DelayEngine;
