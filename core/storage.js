'use strict';

const path = require('path');
const { createSessionLogger } = require('../utils/logger');
const config = require('../config');

/**
 * Storage implementations for session data
 */

class ProductManager {
  constructor() {
    this.store = new Map(); // id -> product
  }

  create(data) {
    const id = data.id || `prod-${Date.now()}`;
    this.store.set(id, { ...data, id });
    return this.store.get(id);
  }

  get(id) {
    return this.store.get(id);
  }

  update(id, data) {
    const existing = this.store.get(id);
    if (!existing) return null;
    this.store.set(id, { ...existing, ...data, id });
    return this.store.get(id);
  }

  delete(id) {
    return this.store.delete(id);
  }

  list() {
    return Array.from(this.store.values());
  }

  search(query) {
    const q = query.toLowerCase();
    return this.list().filter(p => 
      p.name?.toLowerCase().includes(q) ||
      p.description?.toLowerCase().includes(q)
    );
  }
}

class KnowledgeManager {
  constructor() {
    this.store = new Map();
  }

  create(data) {
    const id = data.id || `kn-${Date.now()}`;
    this.store.set(id, { ...data, id });
    return this.store.get(id);
  }

  get(id) {
    return this.store.get(id);
  }

  update(id, data) {
    const existing = this.store.get(id);
    if (!existing) return null;
    this.store.set(id, { ...existing, ...data, id });
    return this.store.get(id);
  }

  delete(id) {
    return this.store.delete(id);
  }

  list() {
    return Array.from(this.store.values());
  }

  search(query) {
    const q = query.toLowerCase();
    return this.list().filter(k => 
      k.title?.toLowerCase().includes(q) ||
      k.content?.toLowerCase().includes(q)
    );
  }
}

class ProfileManager {
  constructor() {
    this.store = new Map();
  }

  create(data) {
    const id = data.id;
    if (!id) throw new Error('Profile must have an id');
    this.store.set(id, { ...data, id });
    return this.store.get(id);
  }

  get(id) {
    return this.store.get(id);
  }

  update(id, data) {
    const existing = this.store.get(id);
    if (!existing) return null;
    this.store.set(id, { ...existing, ...data, id });
    return this.store.get(id);
  }

  delete(id) {
    return this.store.delete(id);
  }

  updateStatus(id, status) {
    const profile = this.store.get(id);
    if (profile) {
      this.store.set(id, { ...profile, status, lastStatusUpdate: new Date().toISOString() });
    }
  }
}

class PersonaManager {
  constructor() {
    this.store = new Map();
  }

  create(data) {
    const id = data.id || `pers-${Date.now()}`;
    this.store.set(id, { ...data, id });
    return this.store.get(id);
  }

  get(id) {
    return this.store.get(id);
  }

  update(id, data) {
    const existing = this.store.get(id);
    if (!existing) return null;
    this.store.set(id, { ...existing, ...data, id });
    return this.store.get(id);
  }

  delete(id) {
    return this.store.delete(id);
  }

  list() {
    return Array.from(this.store.values());
  }
}

class SettingsManager {
  constructor() {
    this.store = new Map();
    this._initDefaults();
  }

  _initDefaults() {
    this.store.set('default', {
      aiEndpoint: 'https://api.openai.com/v1',
      aiModel: 'gpt-4',
      aiApiKey: '',
      aiQueueConcurrency: 3,
      aiRequestTimeout: 60000,
      aiQueueMaxRetries: 3,
      aiQueueBaseDelay: 1000,
      aiQueueMaxDelay: 30000,
      defaultTypingDelay: 1000,
      defaultReadDelay: 500,
      autoReply: true,
      autoReconnect: true,
      sessionPortStart: 3100,
      sessionPortEnd: 4000,
      connectionTimeout: 60000,
      reconnectDelay: 5000,
      maxReconnectAttempts: 5,
      enableQrTerminal: false,
      baileysLogLevel: 'silent',
      humanizerEnabled: true,
      humanizerTypingDelayMin: 500,
      humanizerTypingDelayMax: 3000,
      humanizerReadDelay: 1000,
      humanizerSplitMessageThreshold: 500
    });
  }

  get() {
    return this.store.get('default') || {};
  }

  set(data) {
    const current = this.get();
    this.store.set('default', { ...current, ...data });
    return this.get();
  }
}

module.exports = {
  ProductManager,
  KnowledgeManager,
  ProfileManager,
  PersonaManager,
  SettingsManager,
};
