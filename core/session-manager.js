'use strict';

const EventEmitter = require('events');
const path = require('path');
const fs = require('fs-extra');
const { v4: uuidv4 } = require('uuid');
const Session = require('./session');
const { ProductManager, KnowledgeManager, ProfileManager, PersonaManager } = require('./storage');
const ReplyService = require('../services/reply');
const config = require('../config');
const { createSessionLogger } = require('../utils/logger');

/**
 * Multi-Session Manager
 * Manages multiple WhatsApp Business sessions
 */
class SessionManager extends EventEmitter {
  constructor() {
    super();
    this.sessions = new Map();
    this.log = createSessionLogger('manager', 'session-manager');
    this.profileManager = new ProfileManager();
    this.personaManager = new PersonaManager();
    this.productManager = new ProductManager();
    this.knowledgeManager = new KnowledgeManager();
    this.replyService = new ReplyService(this);
    this.usedPorts = new Set();
    this.nextPort = config.sessionPortStart;
    
    this._loadSessions();
    this.log.info('SessionManager initialized');
  }

  _loadSessions() {
    const indexPath = path.join(config.dataPath, 'sessions', 'index.json');
    if (!fs.existsSync(indexPath)) {
      fs.writeJsonSync(indexPath, { sessions: [] }, { spaces: 2 });
      return;
    }

    try {
      const index = fs.readJsonSync(indexPath);
      const sessions = Array.isArray(index) ? index : index.sessions;
      if (!Array.isArray(sessions)) {
        throw new Error('Invalid sessions index: expected { sessions: [] }');
      }
      for (const s of sessions) {
        if (s && s.id) this._createSessionInstance(s);
      }
    } catch (e) {
      this.log.error(`Failed to load sessions: ${e.message}`);
    }
  }

  _createSessionInstance(data) {
    const session = new Session(data.id, {
      name: data.name,
      autoReconnect: data.autoReconnect !== false,
      typingDelay: data.typingDelay,
      readDelay: data.readDelay,
      autoReply: data.autoReply,
      personaId: data.personaId,
      port: data.port,
      replyService: this.replyService
    });
    
    session.port = data.port || this._assignPort();
    this.usedPorts.add(session.port);
    if (session.port >= this.nextPort) this.nextPort = session.port + 1;

    this._attachSessionEvents(session);
    this.sessions.set(data.id, session);

    // Ensure profile exists
    if (!this.profileManager.get(data.id)) {
      this.profileManager.create({ id: data.id, name: data.name });
    }
    
    this.log.info(`Loaded session: ${data.id} (${data.name}) on port ${session.port}`);
  }

  _assignPort() {
    while (this.usedPorts.has(this.nextPort) && this.nextPort < config.sessionPortEnd) {
      this.nextPort++;
    }
    if (this.nextPort >= config.sessionPortEnd) {
      this.nextPort = config.sessionPortStart;
    }
    return this.nextPort++;
  }

  _saveSessionIndex() {
    const indexPath = path.join(config.dataPath, 'sessions', 'index.json');
    const sessions = Array.from(this.sessions.values()).map(s => {
      const st = s.getStatus();
      // Keep only persistent fields
      return {
        id: st.id,
        name: st.name,
        port: st.port,
        autoReconnect: s.autoReconnect,
        autoReply: s.autoReply,
        typingDelay: s.typingDelay,
        readDelay: s.readDelay,
        personaId: s.options?.personaId
      };
    });
    const tempPath = `${indexPath}.tmp`;
    fs.writeJsonSync(tempPath, { sessions }, { spaces: 2 });
    fs.moveSync(tempPath, indexPath, { overwrite: true });
  }

  _attachSessionEvents(session) {
    session.on('status', (status) => {
      session.state = status;
      this.emit('status', { sessionId: session.id, state: status });
      this._saveSessionIndex();
    });

    session.on('qr', (qrCode) => {
      this.emit('qr', { sessionId: session.id, qrCode });
    });

    session.on('ready', (info) => {
      this.emit('ready', { sessionId: session.id, ...info });
      this.profileManager.updateStatus(session.id, 'connected');
      this._saveSessionIndex();
    });

    session.on('message', (message) => {
      this.emit('message', { sessionId: session.id, ...message });
    });

    session.on('error', (error) => {
      this.emit('error', { sessionId: session.id, error });
    });

    session.on('loggedOut', () => {
      this.emit('loggedOut', { sessionId: session.id });
      this.profileManager.updateStatus(session.id, 'disconnected');
      this._saveSessionIndex();
    });

    session.on('sent', (message) => {
      this.emit('sent', { sessionId: session.id, ...message });
    });
  }

  // ===== PUBLIC API =====

  async createSession(options = {}) {
    const id = uuidv4();
    const name = options.name || `Session ${id.slice(0, 8)}`;
    const port = this._assignPort();

    const session = new Session(id, {
      name,
      autoReconnect: options.autoReconnect !== false,
      typingDelay: options.typingDelay,
      readDelay: options.readDelay,
      autoReply: options.autoReply,
      personaId: options.personaId,
      port,
      replyService: this.replyService
    });

    this.usedPorts.add(port);
    this._attachSessionEvents(session);
    this.sessions.set(id, session);

    // Create profile
    this.profileManager.create({
      id,
      name,
      personaId: options.personaId
    });

    this._saveSessionIndex();
    this.emit('created', session.getStatus());
    this.log.info(`Created session: ${id} (${name}) on port ${port}`);

    return session.getStatus();
  }

    // Get conversations (for conversation list in dashboard)
    getConversations(sessionId) {
      const session = this.sessions.get(sessionId);
      if (!session) return [];
      
      // Build conversation list from messages
      const conversations = [];
      const participantMap = new Map();
      
      // Create a simple conversation mapping
      // For WhatsApp, we can look at the last message from each participant
      for (const msg of session.messages) {
        if (msg.isOutgoing) continue; // Skip outgoing messages for conversation tracking
        
        const key = msg.user || msg.from;
        if (!participantMap.has(key)) {
          participantMap.set(key, {
            name: key,
            avatar: null,
            lastMessage: msg.content,
            timestamp: msg.timestamp,
            unread: 0,
            botPausedBy: session.botPausedBy
          });
        }
      }
      
      // Convert to array
      const result = Array.from(participantMap.values());
      result.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)); // Newest first
      
      return result;
    }

    getConversationMessages(sessionId, participant) {
      const session = this.sessions.get(sessionId);
      if (!session) return [];
      
      // Filter messages between current user (operator) and participant
      // This is a simple implementation - in production you'd need more sophisticated conversation tracking
      return session.messages.filter(msg => 
        (msg.user === participant || msg.from === participant) && 
        !msg.isOutgoing
      );
    }

    async sendHumanReply(sessionId, to, content) {
      const session = this.sessions.get(sessionId);
      if (!session || !session.connected) {
        throw new Error('Session not found or not connected');
      }

      // Send through HumanizerService (for typing, delays, presence)
      await this.replyService.humanizer.send({
        sessionId,
        to,
        text: content,
        options: {}
      });

      // Manually pause the bot when human sends a reply
      await session.pauseBot('human');

      this.log.info(`Human reply sent via Humanizer to ${to} for session ${sessionId}`);
      return { success: true };
    }

    getConversationStatus(sessionId, participant) {
      const session = this.sessions.get(sessionId);
      if (!session) return null;
      
      const botPausedBy = session.botPausedBy;
      let status = 'AUTO';
      
      if (botPausedBy === 'human') {
        status = 'HUMAN';
      } else if (botPausedBy) {
        status = 'PAUSED';
      }
      
      return {
        sessionId,
        participant,
        botStatus: status,
        botPausedBy,
        botEnabled: session.isBotEnabled(),
        lastMessage: session.messages.length > 0 ? session.messages[session.messages.length - 1].content : null
      };
    }

    // ===== PUBLIC API =====

    getSession(id) {
      return this.sessions.get(id);
    }

    getAllSessions() {
      return Array.from(this.sessions.values()).map(s => s.getStatus());
    }

    // ===== BOT CONTROL =====

    pauseBot(sessionId) {
      const session = this.sessions.get(sessionId);
      if (!session) throw new Error('Session not found');
      const result = session.pauseBot('human');
      this._saveSessionIndex();
      this.emit('bot:state', { sessionId, botEnabled: false });
      return result;
    }

    resumeBot(sessionId) {
      const session = this.sessions.get(sessionId);
      if (!session) throw new Error('Session not found');
      const result = session.resumeBot();
      this._saveSessionIndex();
      this.emit('bot:state', { sessionId, botEnabled: true });
      return result;
    }

  async connectSession(id) {
    const session = this.sessions.get(id);
    if (!session) {
      throw new Error('Session not found');
    }
    if (session.connected) {
      return { success: true, message: 'Already connected' };
    }
    return session.connect();
  }

  async disconnectSession(id) {
    const session = this.sessions.get(id);
    if (!session) {
      throw new Error('Session not found');
    }
    return session.disconnect();
  }

  async reconnectSession(id) {
    const session = this.sessions.get(id);
    if (!session) {
      throw new Error('Session not found');
    }
    await session.disconnect();
    return session.connect();
  }

  async restartSession(id) {
    const session = this.sessions.get(id);
    if (!session) {
      throw new Error('Session not found');
    }
    await session.disconnect();
    // Wait a bit for clean disconnect
    await new Promise(r => setTimeout(r, 1000));
    return session.connect();
  }

  async deleteSession(id) {
    const session = this.sessions.get(id);
    if (!session) {
      throw new Error('Session not found');
    }

    await session.disconnect();
    
    // Remove session directory
    const sessionDir = path.join(config.sessionsPath, id);
    if (fs.existsSync(sessionDir)) {
      fs.removeSync(sessionDir);
    }

    // Remove profile
    this.profileManager.delete(id);

    // Remove from maps
    this.usedPorts.delete(session.port);
    this.sessions.delete(id);
    this._saveSessionIndex();
    this.emit('deleted', { sessionId: id });

    this.log.info(`Deleted session: ${id}`);
    return { success: true };
  }

  updateSession(id, data) {
    const session = this.sessions.get(id);
    if (!session) throw new Error('Session not found');
    if (data.name) {
      session.options.name = data.name;
    }
    const profileData = {};
    if (data.name) profileData.name = data.name;
    if (data.description !== undefined) profileData.description = data.description;
    if (Object.keys(profileData).length > 0) {
      this.profileManager.update(id, profileData);
    }
    this._saveSessionIndex();
    this.emit('updated', session.getStatus());
    this.log.info(`Updated session: ${id}`);
    return session.getStatus();
  }

  async sendMessage(sessionId, to, content, options = {}) {
    const session = this.sessions.get(sessionId);
    if (!session || !session.connected) {
      throw new Error('Session not connected');
    }
    return session.sendMessage(to, content, options);
  }

  getRecentMessages(sessionId, count = 50) {
    const session = this.sessions.get(sessionId);
    if (!session) return [];
    return session.messages.slice(-count);
  }

  async getMessagesByDate(sessionId, date) {
    const session = this.sessions.get(sessionId);
    if (!session) return [];
    
    const messagesDir = path.join(config.sessionsPath, sessionId, 'messages');
    if (!fs.existsSync(messagesDir)) return [];
    
    const dateStr = date.replace(/-/g, '');
    const files = fs.readdirSync(messagesDir).filter(f => f.startsWith(dateStr));
    const messages = [];
    
    for (const file of files) {
      const data = fs.readJsonSync(path.join(messagesDir, file));
      messages.push(...data);
    }
    
    return messages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  }

  async getChats(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session || !session.sock) return [];
    
    try {
      const chats = await session.sock.chats.all();
      return chats.map(c => ({
        id: c.id,
        name: c.name || c.pushName || c.id.user,
        lastMessage: c.lastMessage?.message?.conversation || c.lastMessage?.message?.extendedTextMessage?.text || '',
        unread: c.unreadCount || 0,
        isGroup: c.id.includes('@g.us'),
        lastActivity: c.lastMessage?.messageTimestamp ? new Date(c.lastMessage.messageTimestamp * 1000).toISOString() : null
      }));
    } catch (e) {
      return [];
    }
  }

  // ===== PROFILE =====
  getProfile(sessionId) {
    return this.profileManager.get(sessionId);
  }

  updateProfile(sessionId, data) {
    return this.profileManager.update(sessionId, data);
  }

  // ===== PERSONA =====
  getPersona(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    const personaId = session.options.personaId;
    if (!personaId) return null;
    return this.personaManager.get(personaId);
  }

  updatePersona(sessionId, data) {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    let personaId = session.options.personaId;
    if (!personaId) {
      const p = this.personaManager.create({ ...data, sessionId });
      personaId = p.id;
      session.options.personaId = personaId;
      this.profileManager.update(sessionId, { personaId });
    } else {
      this.personaManager.update(personaId, data);
    }
    return this.personaManager.get(personaId);
  }

  // ===== PRODUCTS =====
  getProducts(sessionId) {
    return this.productManager.list();
  }

  getProduct(sessionId, productId) {
    return this.productManager.get(productId);
  }

  createProduct(data) {
    return this.productManager.create({ ...data, sessionId: data.sessionId });
  }

  saveProducts(sessionId, productsArray) {
    // Delete all existing products first
    const existing = this.productManager.list();
    for (const p of existing) {
      this.productManager.delete(p.id);
    }
    // Create new products
    const created = [];
    for (const p of productsArray) {
      if (p.name) {
        created.push(this.productManager.create({
          name: p.name,
          description: p.description || '',
          price: parseInt(p.price) || 0,
          stock: parseInt(p.stock) || 0,
          category: p.category || 'general'
        }));
      }
    }
    return created;
  }

  updateProduct(sessionId, productId, data) {
    return this.productManager.update(productId, data);
  }

  deleteProduct(sessionId, productId) {
    return this.productManager.delete(productId);
  }

  searchProducts(sessionId, query) {
    return this.productManager.search(query);
  }

  // ===== KNOWLEDGE =====
  getKnowledge(sessionId) {
    return this.knowledgeManager.list();
  }

  getKnowledgeItem(sessionId, knowledgeId) {
    return this.knowledgeManager.get(knowledgeId);
  }

  createKnowledge(sessionId, data) {
    return this.knowledgeManager.create({ ...data, sessionId });
  }

  updateKnowledge(sessionId, knowledgeId, data) {
    return this.knowledgeManager.update(knowledgeId, data);
  }

  deleteKnowledge(sessionId, knowledgeId) {
    return this.knowledgeManager.delete(knowledgeId);
  }

  searchKnowledge(sessionId, query) {
    return this.knowledgeManager.search(query);
  }

  // ===== SESSION METADATA =====
  getSessionInfo(id) {
    const session = this.sessions.get(id);
    return session ? session.getStatus() : null;
  }

  // Auto-connect all sessions on startup
  async autoConnectAll() {
    const sessions = this.getAllSessions();
    this.log.info(`Auto-connecting ${sessions.length} session(s)...`);
    for (const session of sessions) {
      if (session.state !== 'disconnected' && session.state !== 'error') {
        continue;
      }
      this.log.info(`Auto-connecting session: ${session.id} (${session.name})`);
      try {
        await this.connectSession(session.id);
      } catch (e) {
        this.log.error(`Failed to auto-connect ${session.id}: ${e.message}`);
      }
    }
  }

  // Graceful shutdown


  // ===== PERSONA PROMPT (per-session file storage) =====
  getPersonaPrompt(sessionId) {
    const personaPath = path.join(config.sessionsPath, sessionId, 'persona.json');
    if (!fs.existsSync(personaPath)) return { prompt: '', name: '' };
    return fs.readJsonSync(personaPath);
  }

  setPersonaPrompt(sessionId, data) {
    const sessionDir = path.join(config.sessionsPath, sessionId);
    fs.ensureDirSync(sessionDir);
    const personaPath = path.join(sessionDir, 'persona.json');
    const existing = this.getPersonaPrompt(sessionId);
    const updated = { ...existing, ...data, updatedAt: new Date().toISOString() };
    fs.writeJsonSync(personaPath, updated, { spaces: 2 });
    this.emit('persona:updated', { sessionId, ...updated });
    return updated;
  }

  // ===== KNOWLEDGE CONFIG (per-session file storage) =====
  getKnowledgeConfig(sessionId) {
    const knowledgePath = path.join(config.sessionsPath, sessionId, 'knowledge.json');
    if (!fs.existsSync(knowledgePath)) return { knowledge: '', marketplaceUrl: '', files: [] };
    return fs.readJsonSync(knowledgePath);
  }

  setKnowledgeConfig(sessionId, data) {
    const sessionDir = path.join(config.sessionsPath, sessionId);
    fs.ensureDirSync(sessionDir);
    const knowledgePath = path.join(sessionDir, 'knowledge.json');
    const existing = this.getKnowledgeConfig(sessionId);
    const updated = {
      knowledge: data.knowledge !== undefined ? data.knowledge : existing.knowledge,
      marketplaceUrl: data.marketplaceUrl !== undefined ? data.marketplaceUrl : existing.marketplaceUrl,
      files: data.files !== undefined ? data.files : (existing.files || []),
      version: (existing.version || 0) + 1,
      updatedAt: new Date().toISOString()
    };
    fs.writeJsonSync(knowledgePath, updated, { spaces: 2 });
    this.emit('knowledge:updated', { sessionId, ...updated });
    return updated;
  }

  // ===== KNOWLEDGE FILES =====
  listKnowledgeFiles(sessionId) {
    const knowledgeConf = this.getKnowledgeConfig(sessionId);
    return knowledgeConf.files || [];
  }

  async uploadKnowledgeFile(sessionId, fileData) {
    const sessionDir = path.join(config.sessionsPath, sessionId);
    const filesDir = path.join(sessionDir, 'files');
    fs.ensureDirSync(filesDir);
    
    const { v4: uuidv4 } = require('uuid');
    const id = uuidv4();
    const ext = require('path').extname(fileData.originalName || '');
    const filename = `${id}${ext}`;
    const filePath = path.join(filesDir, filename);
    
    // Write file to disk
    if (fileData.buffer) {
      fs.writeFileSync(filePath, fileData.buffer);
    } else if (fileData.path) {
      fs.copySync(fileData.path, filePath);
    }
    
    const metadata = {
      id,
      originalName: fileData.originalName || filename,
      mimeType: fileData.mimeType || 'application/octet-stream',
      size: fileData.size || 0,
      uploadedAt: new Date().toISOString(),
      filename
    };
    
    // Add to knowledge config
    const knowledgeData = this.getKnowledgeConfig(sessionId);
    if (!knowledgeData.files) knowledgeData.files = [];
    knowledgeData.files.push(metadata);
    this.setKnowledgeConfig(sessionId, knowledgeData);
    
    return metadata;
  }

  async deleteKnowledgeFile(sessionId, fileId) {
    const knowledgeData = this.getKnowledgeConfig(sessionId);
    const fileIndex = (knowledgeData.files || []).findIndex(f => f.id === fileId);
    if (fileIndex === -1) throw new Error('File not found');
    
    const file = knowledgeData.files[fileIndex];
    
    // Delete from disk
    const filePath = path.join(config.sessionsPath, sessionId, 'files', file.filename);
    if (fs.existsSync(filePath)) {
      fs.removeSync(filePath);
    }
    
    // Remove from metadata
    knowledgeData.files.splice(fileIndex, 1);
    this.setKnowledgeConfig(sessionId, knowledgeData);
    
    return { success: true, deletedFileId: fileId };
  }

  async getKnowledgeFile(sessionId, fileId) {
    const knowledgeData = this.getKnowledgeConfig(sessionId);
    const file = (knowledgeData.files || []).find(f => f.id === fileId);
    if (!file) throw new Error('File not found');
    
    const filePath = path.join(config.sessionsPath, sessionId, 'files', file.filename);
    if (!fs.existsSync(filePath)) throw new Error('File not found on disk');
    
    return { ...file, diskPath: filePath };
  }


  async shutdown() {
    this.log.info('Shutting down all sessions...');
    const promises = [];
    for (const [id, session] of this.sessions) {
      promises.push(session.disconnect());
    }
    await Promise.all(promises);
    this.log.info('All sessions disconnected');
  }
}

module.exports = new SessionManager();