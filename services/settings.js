'use strict';

const path = require('path');
const fs = require('fs-extra');
const config = require('../config');

class SettingsManager {
  constructor() {
    this.settings = {};
    this.dataPath = path.join(config.dataPath, 'settings.json');
    this._loadSettings();
    this.applyToConfig();
  }

  _loadSettings() {
    try {
      if (fs.existsSync(this.dataPath)) {
        this.settings = fs.readJsonSync(this.dataPath);
        // Bootstrap: if no AI settings exist, initialize from .env-derived config
        if (!this.settings.ai || !this.settings.ai.endpoint) {
          this.settings.ai = {
            endpoint: this.settings.ai?.endpoint || config.aiEndpoint,
            apiKey: this.settings.ai?.apiKey || config.aiApiKey,
            model: this.settings.ai?.model || config.aiModel,
          };
          this._saveSettings();
        }
      } else {
        this.settings = {
          server: {
            port: config.port,
            host: config.host,
            defaultTypingDelay: config.defaultTypingDelay,
            defaultReadDelay: config.defaultReadDelay,
            autoReply: config.autoReply,
            enableQrTerminal: config.enableQrTerminal,
            enableRealtime: config.enableRealtime,
          },
          ai: {
            endpoint: config.aiEndpoint,
            apiKey: config.aiApiKey,
            model: config.aiModel,
          },
          features: {
            enableProducts: config.enableProducts,
            enableKnowledge: config.enableKnowledge,
            enablePersona: config.enablePersona,
          }
        };
        this._saveSettings();
      }
    } catch (err) {
      console.error('Failed to load settings:', err.message);
      this.settings = {};
    }
  }

  _saveSettings() {
    try {
      fs.writeJsonSync(this.dataPath, this.settings, { spaces: 2 });
    } catch (err) {
      console.error('Failed to save settings:', err.message);
    }
  }

  get() {
    const settings = { ...this.settings };

    settings.server = {
      port: this.settings.server?.port ?? config.port,
      host: this.settings.server?.host ?? config.host,
      defaultTypingDelay: this.settings.server?.defaultTypingDelay ?? config.defaultTypingDelay,
      defaultReadDelay: this.settings.server?.defaultReadDelay ?? config.defaultReadDelay,
      autoReply: this.settings.server?.autoReply !== undefined ? this.settings.server.autoReply : config.autoReply,
      enableQrTerminal: this.settings.server?.enableQrTerminal !== undefined ? this.settings.server.enableQrTerminal : config.enableQrTerminal,
      enableRealtime: this.settings.server?.enableRealtime !== undefined ? this.settings.server.enableRealtime : config.enableRealtime,
    };

    settings.ai = {
      endpoint: settings.ai?.endpoint || config.aiEndpoint,
      apiKey: settings.ai?.apiKey || config.aiApiKey,
      model: settings.ai?.model || config.aiModel,
      hasApiKey: !!(settings.ai?.apiKey || config.aiApiKey),
      queueConcurrency: config.aiQueueConcurrency,
      requestTimeout: config.aiRequestTimeout,
      maxRetries: config.aiQueueMaxRetries
    };

    settings._config = {
      port: config.port,
      host: config.host,
      defaultTypingDelay: config.defaultTypingDelay,
      defaultReadDelay: config.defaultReadDelay,
      autoReply: config.autoReply,
      enableQrTerminal: config.enableQrTerminal,
      enableRealtime: config.enableRealtime,
      enableProducts: config.enableProducts,
      enableKnowledge: config.enableKnowledge,
      enablePersona: config.enablePersona,
    };

    return settings;
  }

  set(newSettings) {
    // Normalize legacy flat AI keys (aiEndpoint/aiApiKey/aiModel) to canonical (endpoint/apiKey/model)
    if (newSettings.ai) {
      const ai = newSettings.ai;
      const normalized = {};
      if (ai.endpoint !== undefined) normalized.endpoint = ai.endpoint;
      else if (ai.aiEndpoint !== undefined) normalized.endpoint = ai.aiEndpoint;
      if (ai.apiKey !== undefined) normalized.apiKey = ai.apiKey;
      else if (ai.aiApiKey !== undefined) normalized.apiKey = ai.aiApiKey;
      if (ai.model !== undefined) normalized.model = ai.model;
      else if (ai.aiModel !== undefined) normalized.model = ai.aiModel;
      // Masked placeholder means "keep existing key" — never persist the mask
      if (normalized.apiKey === '••••••••') delete normalized.apiKey;
      newSettings.ai = normalized;
    }

    if (this.settings.server) {
      this.settings.server = { ...this.settings.server, ...newSettings.server };
    } else {
      this.settings.server = newSettings.server || {};
    }

    if (this.settings.ai) {
      this.settings.ai = { ...this.settings.ai, ...newSettings.ai };
    } else {
      this.settings.ai = newSettings.ai || {};
    }

    if (this.settings.features) {
      this.settings.features = { ...this.settings.features, ...newSettings.features };
    } else {
      this.settings.features = newSettings.features || {};
    }

    this._saveSettings();
    return { success: true, settings: this.settings };
  }

  applyToConfig() {
    if (this.settings.server) {
      const s = this.settings.server;
      Object.assign(config, {
        port: s.port ?? config.port,
        host: s.host ?? config.host,
        defaultTypingDelay: s.defaultTypingDelay ?? config.defaultTypingDelay,
        defaultReadDelay: s.defaultReadDelay ?? config.defaultReadDelay,
        autoReply: s.autoReply !== undefined ? s.autoReply : config.autoReply,
        enableQrTerminal: s.enableQrTerminal !== undefined ? s.enableQrTerminal : config.enableQrTerminal,
        enableRealtime: s.enableRealtime !== undefined ? s.enableRealtime : config.enableRealtime,
      });
    }

    if (this.settings.ai) {
      const ai = this.settings.ai;
      if (ai.endpoint) {
        config.aiEndpoint = ai.endpoint;
      }
      if (ai.apiKey !== undefined && ai.apiKey !== '') {
        config.aiApiKey = ai.apiKey;
      }
      if (ai.model) {
        config.aiModel = ai.model;
      }
    }

    if (this.settings.features) {
      const f = this.settings.features;
      Object.assign(config, {
        enableProducts: f.enableProducts !== undefined ? f.enableProducts : config.enableProducts,
        enableKnowledge: f.enableKnowledge !== undefined ? f.enableKnowledge : config.enableKnowledge,
        enablePersona: f.enablePersona !== undefined ? f.enablePersona : config.enablePersona,
      });
    }
  }

  resetToDefaults() {
    this.settings = {};
    this._loadSettings();
    return { success: true, settings: this.settings };
  }

  getConfig() {
    return {
      port: config.port,
      host: config.host,
      defaultTypingDelay: config.defaultTypingDelay,
      defaultReadDelay: config.defaultReadDelay,
      autoReply: config.autoReply,
      enableQrTerminal: config.enableQrTerminal,
      enableRealtime: config.enableRealtime,
      enableProducts: config.enableProducts,
      enableKnowledge: config.enableKnowledge,
      enablePersona: config.enablePersona,
      aiEndpoint: config.aiEndpoint,
      aiApiKey: config.aiApiKey,
      aiModel: config.aiModel,
    };
  }

  /**
   * SSOT: fresh AI config from settings.json — the ONLY runtime source.
   * Never reads process.env. Never caches.
   */
  getAISettings() {
    let stored = {};
    try {
      if (fs.existsSync(this.dataPath)) {
        stored = fs.readJsonSync(this.dataPath).ai || {};
      }
    } catch (err) {
      console.error('Failed to read AI settings:', err.message);
    }
    return {
      endpoint: stored.endpoint || stored.aiEndpoint || config.aiEndpoint,
      apiKey: stored.apiKey || stored.aiApiKey || config.aiApiKey,
      model: stored.model || stored.aiModel || config.aiModel,
    };
  }
}

// Singleton instance — single source of truth for the whole app
let _instance = null;
function getSettingsManager() {
  if (!_instance) {
    _instance = new SettingsManager();
  }
  return _instance;
}

module.exports = SettingsManager;
module.exports.getSettingsManager = getSettingsManager;
