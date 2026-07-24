'use strict';

/**
 * HumanizerConfig — centralized defaults for the Humanizer layer.
 * All timing values in milliseconds unless otherwise noted.
 *
 * Sources of truth (priority high→low):
 *   1. Constructor override object
 *   2. Environment variables (HUMANIZER_*)
 *   3. Hardcoded defaults below
 */

const DEFAULTS = {
  enabled: true,

  typing: {
    min: 800,       // minimum typing duration (ms)
    max: 5000,      // maximum typing duration (ms)
    speedWPM: 28,   // words-per-minute to calculate base duration from text length
  },

  readDelay: {
    min: 300,       // minimum read/processing delay after typing (ms)
    max: 1200,      // maximum read/processing delay (ms)
  },

  splitMessage: {
    enabled: true,
    maxMessages: 3, // max natural bubbles per AI response
    separator: '\n\n', // paragraph split delimiter
  },

  randomPause: {
    enabled: true,
    min: 200,       // minimum pause between split messages (ms)
    max: 1500,      // maximum pause between split messages (ms)
  },

  queue: {
    maxConcurrent: 1,   // per-JID limiter: 1 = strictly sequential
    minTime: 500,       // minimum time between jobs per JID (ms)
  },
};

class HumanizerConfig {
  /**
   * @param {Object} [overrides] — partial config merged over defaults
   */
  constructor(overrides = {}) {
    this._config = this._merge(DEFAULTS, this._fromEnv(), overrides);
  }

  get enabled()         { return this._config.enabled; }
  get typing()          { return this._config.typing; }
  get readDelay()       { return this._config.readDelay; }
  get splitMessage()    { return this._config.splitMessage; }
  get randomPause()     { return this._config.randomPause; }
  get queue()           { return this._config.queue; }

  /** Return a frozen snapshot for logging / debugging. */
  toJSON() {
    return JSON.parse(JSON.stringify(this._config));
  }

  // ---- internal ----

  /** Read HUMANIZER_* env vars into a partial config object. */
  _fromEnv() {
    const env = {};
    const num = (key) => {
      const v = process.env[key];
      return v !== undefined ? Number(v) : undefined;
    };
    const bool = (key) => {
      const v = process.env[key];
      return v !== undefined ? v === 'true' : undefined;
    };

    if (bool('HUMANIZER_ENABLED') !== undefined)        env.enabled = bool('HUMANIZER_ENABLED');
    if (num('HUMANIZER_TYPING_MIN') !== undefined)      env.typing = { ...env.typing, min: num('HUMANIZER_TYPING_MIN') };
    if (num('HUMANIZER_TYPING_MAX') !== undefined)      env.typing = { ...env.typing, max: num('HUMANIZER_TYPING_MAX') };
    if (num('HUMANIZER_TYPING_SPEED_WPM') !== undefined) env.typing = { ...env.typing, speedWPM: num('HUMANIZER_TYPING_SPEED_WPM') };
    if (num('HUMANIZER_READ_DELAY_MIN') !== undefined)  env.readDelay = { ...env.readDelay, min: num('HUMANIZER_READ_DELAY_MIN') };
    if (num('HUMANIZER_READ_DELAY_MAX') !== undefined)  env.readDelay = { ...env.readDelay, max: num('HUMANIZER_READ_DELAY_MAX') };
    if (bool('HUMANIZER_SPLIT_ENABLED') !== undefined)  env.splitMessage = { ...env.splitMessage, enabled: bool('HUMANIZER_SPLIT_ENABLED') };
    if (num('HUMANIZER_SPLIT_MAX') !== undefined)       env.splitMessage = { ...env.splitMessage, maxMessages: num('HUMANIZER_SPLIT_MAX') };
    if (bool('HUMANIZER_PAUSE_ENABLED') !== undefined)  env.randomPause = { ...env.randomPause, enabled: bool('HUMANIZER_PAUSE_ENABLED') };
    if (num('HUMANIZER_PAUSE_MIN') !== undefined)       env.randomPause = { ...env.randomPause, min: num('HUMANIZER_PAUSE_MIN') };
    if (num('HUMANIZER_PAUSE_MAX') !== undefined)       env.randomPause = { ...env.randomPause, max: num('HUMANIZER_PAUSE_MAX') };

    return env;
  }

  /** Deep merge `source` into `target` (only defined values). */
  _merge(target, ...sources) {
    const result = { ...target };
    for (const source of sources) {
      if (!source) continue;
      for (const key of Object.keys(source)) {
        if (source[key] === undefined) continue;
        if (
          typeof source[key] === 'object' &&
          source[key] !== null &&
          !Array.isArray(source[key]) &&
          typeof target[key] === 'object' &&
          target[key] !== null
        ) {
          result[key] = this._merge(target[key], source[key]);
        } else {
          result[key] = source[key];
        }
      }
    }
    return result;
  }
}

module.exports = HumanizerConfig;
