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
}

module.exports = SettingsManager;
