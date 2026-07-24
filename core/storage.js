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

module.exports = {
  ProductManager,
  KnowledgeManager,
  ProfileManager,
  PersonaManager,
};
