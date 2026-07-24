'use strict';

const fs = require('fs-extra');
const path = require('path');
const config = require('../config');

// Ensure all data directories exist
const directories = [
  config.dataPath,
  config.sessionsPath,
  config.logsPath,
  config.tempPath,
  path.join(config.dataPath, 'profiles'),
  path.join(config.dataPath, 'personas'),
  path.join(config.dataPath, 'products'),
  path.join(config.dataPath, 'knowledge'),
  path.join(config.dataPath, 'settings'),
  path.join(config.dataPath, 'sessions')
];

directories.forEach(dir => fs.ensureDirSync(dir));

/**
 * Generic JSON file storage
 */
class JsonStore {
  constructor(basePath, filename) {
    this.filePath = path.join(basePath, filename);
  }

  read() {
    if (!fs.existsSync(this.filePath)) return null;
    try {
      return fs.readJsonSync(this.filePath);
    } catch (e) {
      return null;
    }
  }

  write(data) {
    fs.writeJsonSync(this.filePath, data, { spaces: 2 });
    return true;
  }

  exists() {
    return fs.existsSync(this.filePath);
  }

  delete() {
    if (fs.existsSync(this.filePath)) {
      fs.removeSync(this.filePath);
    }
  }
}

/**
 * Profile Manager - handles WhatsApp session profiles
 */
class ProfileManager {
  constructor() {
    this.store = new JsonStore(config.dataPath, 'profiles/index.json');
    this.profilesDir = path.join(config.dataPath, 'profiles');
  }

  list() {
    const index = this.store.read() || { profiles: [] };
    return index.profiles.map(p => ({
      id: p.id,
      name: p.name,
      phone: p.phone,
      status: p.status,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt
    }));
  }

  get(id) {
    const file = path.join(this.profilesDir, `${id}.json`);
    if (!fs.existsSync(file)) return null;
    return fs.readJsonSync(file);
  }

  create(data) {
    const id = data.id || require('uuid').v4();
    const profile = {
      id,
      name: data.name || `Profile ${id.slice(0, 8)}`,
      phone: data.phone || null,
      status: 'disconnected',
      personaId: data.personaId || null,
      settings: data.settings || {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    fs.writeJsonSync(path.join(this.profilesDir, `${id}.json`), profile, { spaces: 2 });
    
    const index = this.store.read() || { profiles: [] };
    index.profiles.push({ id, name: profile.name, phone: profile.phone, status: 'disconnected', createdAt: profile.createdAt, updatedAt: profile.updatedAt });
    this.store.write(index);
    
    return profile;
  }

  update(id, data) {
    const profile = this.get(id);
    if (!profile) return null;
    
    const updated = { ...profile, ...data, updatedAt: new Date().toISOString() };
    fs.writeJsonSync(path.join(this.profilesDir, `${id}.json`), updated, { spaces: 2 });
    
    const index = this.store.read() || { profiles: [] };
    const idx = index.profiles.findIndex(p => p.id === id);
    if (idx >= 0) {
      index.profiles[idx] = { ...index.profiles[idx], ...data, updatedAt: updated.updatedAt };
      this.store.write(index);
    }
    
    return updated;
  }

  delete(id) {
    const file = path.join(this.profilesDir, `${id}.json`);
    if (fs.existsSync(file)) fs.removeSync(file);
    
    const index = this.store.read() || { profiles: [] };
    index.profiles = index.profiles.filter(p => p.id !== id);
    this.store.write(index);
    
    return true;
  }

  updateStatus(id, status) {
    return this.update(id, { status });
  }

  setPersona(id, personaId) {
    return this.update(id, { personaId });
  }
}

/**
 * Persona Manager - handles CS personas
 */
class PersonaManager {
  constructor() {
    this.store = new JsonStore(config.dataPath, 'personas/index.json');
    this.personasDir = path.join(config.dataPath, 'personas');
  }

  list() {
    const index = this.store.read() || { personas: [] };
    return index.personas.map(p => ({
      id: p.id,
      name: p.name,
      role: p.role,
      tone: p.tone,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt
    }));
  }

  get(id) {
    const file = path.join(this.personasDir, `${id}.json`);
    if (!fs.existsSync(file)) return null;
    return fs.readJsonSync(file);
  }

  create(data) {
    const id = data.id || require('uuid').v4();
    const persona = {
      id,
      name: data.name,
      role: data.role || 'Customer Service',
      tone: data.tone || 'friendly',
      language: data.language || 'id',
      greeting: data.greeting || 'Halo! Ada yang bisa saya bantu? 😊',
      guidelines: data.guidelines || [],
      knowledgeBase: data.knowledgeBase || [],
      products: data.products || [],
      fallback: data.fallback || 'Maaf, saya tidak memahami. Bisa diulang? 😊',
      autoReply: data.autoReply !== false,
      workingHours: data.workingHours || { enabled: false, start: '09:00', end: '17:00', timezone: 'Asia/Jakarta' },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    fs.writeJsonSync(path.join(this.personasDir, `${id}.json`), persona, { spaces: 2 });
    
    const index = this.store.read() || { personas: [] };
    index.personas.push({ id, name: persona.name, role: persona.role, tone: persona.tone, createdAt: persona.createdAt, updatedAt: persona.updatedAt });
    this.store.write(index);
    
    return persona;
  }

  update(id, data) {
    const persona = this.get(id);
    if (!persona) return null;
    
    const updated = { ...persona, ...data, updatedAt: new Date().toISOString() };
    fs.writeJsonSync(path.join(this.personasDir, `${id}.json`), updated, { spaces: 2 });
    
    const index = this.store.read() || { personas: [] };
    const idx = index.personas.findIndex(p => p.id === id);
    if (idx >= 0) {
      index.personas[idx] = { ...index.personas[idx], ...data, updatedAt: updated.updatedAt };
      this.store.write(index);
    }
    
    return updated;
  }

  delete(id) {
    const file = path.join(this.personasDir, `${id}.json`);
    if (fs.existsSync(file)) fs.removeSync(file);
    
    const index = this.store.read() || { personas: [] };
    index.personas = index.personas.filter(p => p.id !== id);
    this.store.write(index);
    
    return true;
  }
}

/**
 * Product Manager
 */
class ProductManager {
  constructor() {
    this.store = new JsonStore(config.dataPath, 'products/index.json');
    this.productsDir = path.join(config.dataPath, 'products');
  }

  list() {
    const index = this.store.read() || { products: [] };
    return index.products.map(p => ({
      id: p.id,
      name: p.name,
      price: p.price,
      category: p.category,
      stock: p.stock,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt
    }));
  }

  get(id) {
    const file = path.join(this.productsDir, `${id}.json`);
    if (!fs.existsSync(file)) return null;
    return fs.readJsonSync(file);
  }

  create(data) {
    const id = require('uuid').v4();
    const product = {
      id,
      name: data.name,
      description: data.description || '',
      price: data.price || 0,
      originalPrice: data.originalPrice || null,
      category: data.category || 'general',
      stock: data.stock || 0,
      images: data.images || [],
      features: data.features || [],
      specifications: data.specifications || {},
      tags: data.tags || [],
      isActive: data.isActive !== false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    fs.writeJsonSync(path.join(this.productsDir, `${id}.json`), product, { spaces: 2 });
    
    const index = this.store.read() || { products: [] };
    index.products.push({ id, name: product.name, price: product.price, category: product.category, stock: product.stock, createdAt: product.createdAt, updatedAt: product.updatedAt });
    this.store.write(index);
    
    return product;
  }

  update(id, data) {
    const product = this.get(id);
    if (!product) return null;
    
    const updated = { ...product, ...data, updatedAt: new Date().toISOString() };
    fs.writeJsonSync(path.join(this.productsDir, `${id}.json`), updated, { spaces: 2 });
    
    const index = this.store.read() || { products: [] };
    const idx = index.products.findIndex(p => p.id === id);
    if (idx >= 0) {
      index.products[idx] = { ...index.products[idx], ...data, updatedAt: updated.updatedAt };
      this.store.write(index);
    }
    
    return updated;
  }

  delete(id) {
    const file = path.join(this.productsDir, `${id}.json`);
    if (fs.existsSync(file)) fs.removeSync(file);
    
    const index = this.store.read() || { products: [] };
    index.products = index.products.filter(p => p.id !== id);
    this.store.write(index);
    
    return true;
  }

  search(query) {
    const all = this.list();
    const q = query.toLowerCase();
    return all.filter(p => 
      p.name.toLowerCase().includes(q) || 
      p.category.toLowerCase().includes(q)
    );
  }

  getByCategory(category) {
    return this.list().filter(p => p.category === category);
  }

  adjustStock(id, quantity) {
    const product = this.get(id);
    if (!product) return null;
    const newStock = Math.max(0, product.stock + quantity);
    return this.update(id, { stock: newStock });
  }
}

/**
 * Knowledge Base Manager
 */
class KnowledgeManager {
  constructor() {
    this.store = new JsonStore(config.dataPath, 'knowledge/index.json');
    this.knowledgeDir = path.join(config.dataPath, 'knowledge');
  }

  list() {
    const index = this.store.read() || { items: [] };
    return index.items.map(k => ({
      id: k.id,
      title: k.title,
      category: k.category,
      tags: k.tags,
      createdAt: k.createdAt,
      updatedAt: k.updatedAt
    }));
  }

  get(id) {
    const file = path.join(this.knowledgeDir, `${id}.json`);
    if (!fs.existsSync(file)) return null;
    return fs.readJsonSync(file);
  }

  create(data) {
    const id = require('uuid').v4();
    const item = {
      id,
      title: data.title,
      category: data.category || 'general',
      content: data.content || '',
      tags: data.tags || [],
      keywords: data.keywords || [],
      priority: data.priority || 0,
      isActive: data.isActive !== false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    fs.writeJsonSync(path.join(this.knowledgeDir, `${id}.json`), item, { spaces: 2 });
    
    const index = this.store.read() || { items: [] };
    index.items.push({ id, title: item.title, category: item.category, tags: item.tags, createdAt: item.createdAt, updatedAt: item.updatedAt });
    this.store.write(index);
    
    return item;
  }

  update(id, data) {
    const item = this.get(id);
    if (!item) return null;
    
    const updated = { ...item, ...data, updatedAt: new Date().toISOString() };
    fs.writeJsonSync(path.join(this.knowledgeDir, `${id}.json`), updated, { spaces: 2 });
    
    const index = this.store.read() || { items: [] };
    const idx = index.items.findIndex(k => k.id === id);
    if (idx >= 0) {
      index.items[idx] = { ...index.items[idx], ...data, updatedAt: updated.updatedAt };
      this.store.write(index);
    }
    
    return updated;
  }

  delete(id) {
    const file = path.join(this.knowledgeDir, `${id}.json`);
    if (fs.existsSync(file)) fs.removeSync(file);
    
    const index = this.store.read() || { items: [] };
    index.items = index.items.filter(k => k.id !== id);
    this.store.write(index);
    
    return true;
  }

  search(query) {
    const all = this.list();
    const q = query.toLowerCase();
    return all.filter(k => 
      k.title.toLowerCase().includes(q) || 
      k.category.toLowerCase().includes(q) ||
      k.tags.some(t => t.toLowerCase().includes(q))
    );
  }
}

/**
 * Settings Manager
 */
class SettingsManager {
  constructor() {
    this.file = path.join(config.dataPath, 'settings', 'global.json');
  }

  get() {
    if (!fs.existsSync(this.file)) {
      return this.getDefaults();
    }
    return fs.readJsonSync(this.file);
  }

  set(data) {
    const current = this.get();
    const updated = { ...current, ...data, updatedAt: new Date().toISOString() };
    fs.writeJsonSync(this.file, updated, { spaces: 2 });
    return updated;
  }

  getDefaults() {
    return {
      autoReply: true,
      defaultTypingDelay: 1000,
      defaultReadDelay: 500,
      maxReplyLength: 4096,
      qrTimeout: 45000,
      reconnectDelay: 5000,
      maxReconnectAttempts: 10,
      logLevel: 'info',
      enableQrTerminal: true,
      enableQrWeb: true,
      enableRealtime: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }
}

module.exports = {
  JsonStore,
  ProfileManager,
  PersonaManager,
  ProductManager,
  KnowledgeManager,
  SettingsManager
};