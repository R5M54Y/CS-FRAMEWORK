'use strict';

const path = require('path');
const fs = require('fs-extra');
const config = require('../config');

class SettingsManager {
  constructor() {
    this.settings = {};
    this.dataPath = path.join(config.dataPath, 'settings.json');
    this._loadSettings();
  }
  
  _loadSettings() {
    try {
      if (fs.existsSync(this.dataPath)) {
        this.settings = fs.readJsonSync(this.dataPath);
      } else {
        // Initialize with config defaults
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
    
    // Add AI info for API responses
    settings.ai = {
      endpoint: settings.ai?.endpoint || config.aiEndpoint,
      model: settings.ai?.model || config.aiModel,
      hasApiKey: !!(settings.ai?.apiKey || config.aiApiKey),
      queueConcurrency: config.aiQueueConcurrency,
      requestTimeout: config.aiRequestTimeout,
      maxRetries: config.aiQueueMaxRetries
    };
    
    // Add original config for backward compatibility
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
    // Merge with existing settings
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
  
  // Apply settings to config (for runtime)
  applyToConfig() {
    if (this.settings.server) {
      Object.assign(config, {
        port: this.settings.server.port || config.port,
        host: this.settings.server.host || config.host,
        defaultTypingDelay: this.settings.server.defaultTypingDelay || config.defaultTypingDelay,
        defaultReadDelay: this.settings.server.defaultReadDelay || config.defaultReadDelay,
        autoReply: this.settings.server.autoReply !== undefined ? this.settings.server.autoReply : config.autoReply,
        enableQrTerminal: this.settings.server.enableQrTerminal !== undefined ? this.settings.server.enableQrTerminal : config.enableQrTerminal,
        enableRealtime: this.settings.server.enableRealtime !== undefined ? this.settings.server.enableRealtime : config.enableRealtime,
      });
    }
    
    if (this.settings.ai) {
      // Update environment variables if settings changed
      if (this.settings.ai.endpoint !== config.aiEndpoint) {
        process.env.AI_ENDPOINT = this.settings.ai.endpoint;
        config.aiEndpoint = this.settings.ai.endpoint;
      }
      
      if (this.settings.ai.apiKey !== config.aiApiKey) {
        process.env.AI_API_KEY = this.settings.ai.apiKey;
        config.aiApiKey = this.settings.ai.apiKey;
      }
      
      if (this.settings.ai.model !== config.aiModel) {
        process.env.AI_MODEL = this.settings.ai.model;
        config.aiModel = this.settings.ai.model;
      }
    }
    
    if (this.settings.features) {
      Object.assign(config, {
        enableProducts: this.settings.features.enableProducts !== undefined ? this.settings.features.enableProducts : config.enableProducts,
        enableKnowledge: this.settings.features.enableKnowledge !== undefined ? this.settings.features.enableKnowledge : config.enableKnowledge,
        enablePersona: this.settings.features.enablePersona !== undefined ? this.settings.features.enablePersona : config.enablePersona,
      });
    }
  }
  
  resetToDefaults() {
    this.settings = {};
    this._loadSettings();
    return { success: true, settings: this.settings };
  }
  
  getConfig() {
    // Return current config values for frontend
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
