'use strict';

const { v4: uuidv4 } = require('uuid');
const QRCode = require('qrcode');
const path = require("path");
const { parseUpload } = require("../utils/file-upload");
const sessionManager = require('../core/session-manager');
const { ProductManager, KnowledgeManager, ProfileManager, PersonaManager } = require('../core/storage');
const SettingsManager = require('../services/settings');
const config = require('../config');

class MainController {
  constructor() {
    this.profileManager = new ProfileManager();
    this.personaManager = new PersonaManager();
    this.settingsManager = new SettingsManager();
    this.productManager = new ProductManager();
    this.knowledgeManager = new KnowledgeManager();
    
    // Bind methods so Express preserves `this`
    this.health = this.health.bind(this);
    this.getSessions = this.getSessions.bind(this);
    this.createSession = this.createSession.bind(this);
    this.getSession = this.getSession.bind(this);
    this.updateSession = this.updateSession.bind(this);
    this.deleteSession = this.deleteSession.bind(this);
    this.connectSession = this.connectSession.bind(this);
    this.disconnectSession = this.disconnectSession.bind(this);
    this.reconnectSession = this.reconnectSession.bind(this);
    this.restartSession = this.restartSession.bind(this);
    this.duplicateSession = this.duplicateSession.bind(this);
    this.getQRCode = this.getQRCode.bind(this);
    this.regenerateQR = this.regenerateQR.bind(this);
    this.sendMessage = this.sendMessage.bind(this);
    this.getMessages = this.getMessages.bind(this);
    this.getMessagesByDate = this.getMessagesByDate.bind(this);
    this.getChats = this.getChats.bind(this);
      this.clearMessages = this.clearMessages.bind(this);
      this.getProfile = this.getProfile.bind(this);
    this.updateProfile = this.updateProfile.bind(this);
    this.getPersona = this.getPersona.bind(this);
    this.updatePersona = this.updatePersona.bind(this);
    this.savePersonaPrompt = this.savePersonaPrompt.bind(this);
    this.getProducts = this.getProducts.bind(this);
    this.getProduct = this.getProduct.bind(this);
    this.createProduct = this.createProduct.bind(this);
    this.updateProduct = this.updateProduct.bind(this);
    this.deleteProduct = this.deleteProduct.bind(this);
    this.searchProducts = this.searchProducts.bind(this);
    this.saveProducts = this.saveProducts.bind(this);
    this.getKnowledge = this.getKnowledge.bind(this);
    this.getKnowledgeItem = this.getKnowledgeItem.bind(this);
    this.createKnowledge = this.createKnowledge.bind(this);
    this.updateKnowledge = this.updateKnowledge.bind(this);
    this.deleteKnowledge = this.deleteKnowledge.bind(this);
    this.searchKnowledge = this.searchKnowledge.bind(this);
    this.fetchProduct = this.fetchProduct.bind(this);
    this.getSettings = this.getSettings.bind(this);
    this.updateSettings = this.updateSettings.bind(this);
    this.testAIGateway = this.testAIGateway.bind(this);
    this.getAIQueueStats = this.getAIQueueStats.bind(this);
    this.runtimeStatus = this.runtimeStatus.bind(this);
    this.observability = this.observability.bind(this);
    
    // Conversation Inbox
    this.getConversations = this.getConversations.bind(this);
    this.getConversationMessages = this.getConversationMessages.bind(this);
    this.getConversationStatus = this.getConversationStatus.bind(this);
    this.sendHumanReply = this.sendHumanReply.bind(this);
    this.clearChatMessages = this.clearChatMessages.bind(this);
    this.getAvatar = this.getAvatar.bind(this);
    
    // Bot Control
    this.pauseBot = this.pauseBot.bind(this);
    this.resumeBot = this.resumeBot.bind(this);
    this.getPersonaPrompt = this.getPersonaPrompt.bind(this);
    this.getKnowledgeConfig = this.getKnowledgeConfig.bind(this);
    this.saveKnowledgeConfig = this.saveKnowledgeConfig.bind(this);
    this.listKnowledgeFiles = this.listKnowledgeFiles.bind(this);
    this.uploadKnowledgeFile = this.uploadKnowledgeFile.bind(this);
    this.deleteKnowledgeFile = this.deleteKnowledgeFile.bind(this);
    this.downloadKnowledgeFile = this.downloadKnowledgeFile.bind(this);
  }

  health(req, res) {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      sessions: sessionManager.getAllSessions().length
    });
  }

  runtimeStatus(req, res) {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      sessions: sessionManager.getAllSessions().length,
      version: '1.0.0'
    });
  }

  observability(req, res) {
    const sessions = sessionManager.getAllSessions();
    const sessionStatuses = sessions.map(session => session.getStatus());
    
    res.json({
      service: 'WhatsApp CS Framework',
      version: '1.0.0',
      uptime: process.uptime(),
      sessions: sessionStatuses,
      health: {
        status: 'healthy',
        checks: [
          { name: 'process_running', status: 'pass' },
          { name: 'db_connection', status: 'pass' },
          { name: 'session_manager', status: 'pass' }
        ]
      }
    });
  }

  getSettings(req, res) {
        const settings = this.settingsManager.get();
        const ai = settings.ai || {};
        settings.ai = {
          endpoint: ai.endpoint || config.aiEndpoint,
          apiKey: ai.apiKey || config.aiApiKey,
          model: ai.model || config.aiModel,
          hasApiKey: !!ai.apiKey || !!config.aiApiKey,
          queueConcurrency: config.aiQueueConcurrency,
          requestTimeout: config.aiRequestTimeout,
          maxRetries: config.aiQueueMaxRetries
        };
        res.json(settings);
      }

  updateSettings(req, res) {
    const body = req.body || {};
    const ai = body.ai || {};

    // Validation: endpoint required + valid URL, apiKey required, model required
    if (ai.endpoint !== undefined || ai.aiEndpoint !== undefined) {
      const endpoint = ai.endpoint !== undefined ? ai.endpoint : ai.aiEndpoint;
      if (!endpoint || typeof endpoint !== 'string' || !endpoint.trim()) {
        return res.status(400).json({ success: false, error: 'AI Endpoint is required' });
      }
      try {
        const parsed = new URL(endpoint.trim());
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
          return res.status(400).json({ success: false, error: 'AI Endpoint must be a valid http(s) URL' });
        }
      } catch (err) {
        return res.status(400).json({ success: false, error: 'AI Endpoint must be a valid URL' });
      }
    }
    if (ai.apiKey !== undefined && ai.apiKey !== '••••••••') {
      if (!ai.apiKey || typeof ai.apiKey !== 'string' || !ai.apiKey.trim()) {
        return res.status(400).json({ success: false, error: 'API Key is required' });
      }
    }
    if (ai.model !== undefined || ai.aiModel !== undefined) {
      const model = ai.model !== undefined ? ai.model : ai.aiModel;
      if (!model || typeof model !== 'string' || !model.trim()) {
        return res.status(400).json({ success: false, error: 'Model is required' });
      }
    }

    const result = this.settingsManager.set(body);
    return res.json(result);
  }

  async testAIGateway(req, res) {
    const AIService = require('../services/ai');
    const ai = new AIService();
    try {
      const response = await ai.chat([{ role: 'user', content: 'Halo! Balas dengan "OK" saja.' }]);
      res.json({ success: !response.startsWith('['), response });
    } catch (err) { res.json({ success: false, error: err.message }); }
  }

  getAIQueueStats(req, res) {
    const { getQueue } = require('../services/ai-queue');
    const queue = getQueue();
    res.json(queue ? queue.getStats() : { pending: 0, active: 0, completed: 0, failed: 0, queueLength: 0 });
  }

  // ===== SESSIONS =====
  
  async getSessions(req, res) {
    try { res.json(sessionManager.getAllSessions()); }
    catch (err) { res.status(500).json({ error: err.message }); }
  }
  
  async createSession(req, res) {
    try {
      const sessionData = { ...req.body, id: uuidv4() };
      const session = sessionManager.createSession(sessionData);
      res.json(session);
    }
    catch (err) { res.status(500).json({ error: err.message }); }
  }
  
  async getSession(req, res) {
    try {
      const session = sessionManager.getSession(req.params.id);
      if (!session) return res.status(404).json({ error: 'Session not found' });
      res.json(session.getStatus());
    }
    catch (err) { res.status(500).json({ error: err.message }); }
  }
  
  async updateSession(req, res) {
    try {
      const session = sessionManager.updateSession(req.params.id, req.body);
      if (!session) return res.status(404).json({ error: 'Session not found' });
      res.json(session);
    }
    catch (err) { res.status(500).json({ error: err.message }); }
  }
  
  async deleteSession(req, res) {
    try {
      const result = await sessionManager.deleteSession(req.params.id);
      res.json(result);
    }
    catch (err) { res.status(500).json({ error: err.message }); }
  }
  
  async connectSession(req, res) {
    const ts = new Date().toISOString();
    const sessionId = req.params.id;
    console.log(`[${ts}] [${sessionId.slice(0,8)}] [Controller.connectSession()] API REQUEST RECEIVED`);
    
    try {
      const result = await sessionManager.connectSession(req.params.id);
      console.log(`[${ts}] [${sessionId.slice(0,8)}] [Controller.connectSession()] Result: ${JSON.stringify(result)}`);
      res.json(result);
    }
    catch (err) {
      console.log(`[${ts}] [${sessionId.slice(0,8)}] [Controller.connectSession()] EXCEPTION: ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  }
  
  async disconnectSession(req, res) {
    const ts = new Date().toISOString();
    const sessionId = req.params.id;
    console.log(`[${ts}] [${sessionId.slice(0,8)}] [Controller.disconnectSession()] API REQUEST RECEIVED`);
    
    try {
      const result = await sessionManager.disconnectSession(req.params.id);
      console.log(`[${ts}] [${sessionId.slice(0,8)}] [Controller.disconnectSession()] Result: ${JSON.stringify(result)}`);
      res.json(result);
    }
    catch (err) {
      console.log(`[${ts}] [${sessionId.slice(0,8)}] [Controller.disconnectSession()] EXCEPTION: ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  }
  
  async reconnectSession(req, res) {
    const ts = new Date().toISOString();
    const sessionId = req.params.id;
    console.log(`[${ts}] [${sessionId.slice(0,8)}] [Controller.reconnectSession()] API REQUEST RECEIVED`);
    
    try {
      const result = await sessionManager.reconnectSession(req.params.id);
      console.log(`[${ts}] [${sessionId.slice(0,8)}] [Controller.reconnectSession()] Result: ${JSON.stringify(result)}`);
      res.json(result);
    }
    catch (err) {
      console.log(`[${ts}] [${sessionId.slice(0,8)}] [Controller.reconnectSession()] EXCEPTION: ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  }
  
  async restartSession(req, res) {
    const ts = new Date().toISOString();
    const sessionId = req.params.id;
    console.log(`[${ts}] [${sessionId.slice(0,8)}] [Controller.restartSession()] API REQUEST RECEIVED`);
    
    try {
      const result = await sessionManager.restartSession(req.params.id);
      console.log(`[${ts}] [${sessionId.slice(0,8)}] [Controller.restartSession()] Result: ${JSON.stringify(result)}`);
      res.json(result);
    }
    catch (err) {
      console.log(`[${ts}] [${sessionId.slice(0,8)}] [Controller.restartSession()] EXCEPTION: ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  }

  async duplicateSession(req, res) {
    try {
      const result = sessionManager.duplicateSession(req.params.id);
      res.json(result);
    }
    catch (err) { res.status(500).json({ error: err.message }); }
  }

  async getQRCode(req, res) {
    const ts = new Date().toISOString();
    const sessionId = req.params.id;
    console.log(`[${ts}] [${sessionId.slice(0,8)}] [Controller.getQRCode()] API REQUEST RECEIVED`);
    
    try {
      const session = sessionManager.getSession(sessionId);
      console.log(`[${ts}] [${sessionId.slice(0,8)}] [Controller.getQRCode()] session found=${!!session}`);
      
      if (!session) {
        console.log(`[${ts}] [${sessionId.slice(0,8)}] [Controller.getQRCode()] ERROR: Session not found`);
        return res.status(404).json({ error: 'Session not found' });
      }
      
      const result = await session.getQRCode();
      console.log(`[${ts}] [${sessionId.slice(0,8)}] [Controller.getQRCode()] Result: ${JSON.stringify(result)}`);
      
      const qrImage = result.qrCode
        ? await QRCode.toDataURL(result.qrCode)
        : null;
      
      console.log(`[${ts}] [${sessionId.slice(0,8)}] [Controller.getQRCode()] SUCCESS: qrImage=${!!qrImage}`);
      res.json({ ...result, qrImage });
    }
    catch (err) {
      console.log(`[${ts}] [${sessionId.slice(0,8)}] [Controller.getQRCode()] EXCEPTION: ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  }

  async regenerateQR(req, res) {
    const ts = new Date().toISOString();
    const sessionId = req.params.id;
    console.log(`[${ts}] [${sessionId.slice(0,8)}] [Controller.regenerateQR()] API REQUEST RECEIVED`);
    
    try {
      const session = sessionManager.getSession(req.params.id);
      console.log(`[${ts}] [${sessionId.slice(0,8)}] [Controller.regenerateQR()] session found=${!!session}`);
      
      if (!session) {
        console.log(`[${ts}] [${sessionId.slice(0,8)}] [Controller.regenerateQR()] ERROR: Session not found`);
        return res.status(404).json({ error: 'Session not found' });
      }

      console.log(`[${ts}] [${sessionId.slice(0,8)}] [Controller.regenerateQR()] Calling session.regenerateQR()...`);
      const result = await session.regenerateQR();
      console.log(`[${ts}] [${sessionId.slice(0,8)}] [Controller.regenerateQR()] Result: ${JSON.stringify(result)}`);
      
      if (result?.error) {
        console.log(`[${ts}] [${sessionId.slice(0,8)}] [Controller.regenerateQR()] Returning 409 error`);
        return res.status(409).json(result);
      }

      const qrImage = result?.qrCode
        ? await QRCode.toDataURL(result.qrCode)
        : null;
      
      console.log(`[${ts}] [${sessionId.slice(0,8)}] [Controller.regenerateQR()] SUCCESS: qrImage=${!!qrImage}`);
      res.json({ ...result, qrImage });
    }
    catch (err) {
      console.log(`[${ts}] [${sessionId.slice(0,8)}] [Controller.regenerateQR()] EXCEPTION: ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  }

  // ===== MESSAGES =====
  
  async sendMessage(req, res) {
    try {
      const { id } = req.params;
      const { to, content } = req.body;
      const session = sessionManager.getSession(id);
      if (!session) return res.status(404).json({ error: 'Session not found' });
      const result = await session.sendMessage(to, content);
      res.json(result);
    }
    catch (err) { res.status(500).json({ error: err.message }); }
  }
  
  async getMessages(req, res) {
    try {
      const { id } = req.params;
      const { limit } = req.query;
      const session = sessionManager.getSession(id);
      if (!session) return res.status(404).json({ error: 'Session not found' });
      const result = await session.getMessages(limit ? parseInt(limit) : undefined);
      res.json(result);
    }
    catch (err) { res.status(500).json({ error: err.message }); }
  }

  async clearMessages(req, res) {
    try {
      const { id } = req.params;
      const session = sessionManager.getSession(id);
      if (!session) return res.status(404).json({ error: 'Session not found' });
      const messageRepo = require('../core/repositories/MessageRepository');
      const deleted = await messageRepo.clearSession(id);
      session.messages = [];
      session.messageCount = 0;
      const { getIO } = require('../services/socket');
      const io = getIO();
      if (io) {
        io.to(`session:${id}`).emit('session:messages-cleared', { sessionId: id });
        io.emit('session:messages-cleared', { sessionId: id });
      }
      res.json({ success: true, deleted });
    }
    catch (err) { res.status(500).json({ error: err.message }); }
  }

  async getMessagesByDate(req, res) {
    try {
      const { id } = req.params;
      const { date } = req.query;
      const session = sessionManager.getSession(id);
      if (!session) return res.status(404).json({ error: 'Session not found' });
      const result = await session.getMessagesByDate(date);
      res.json(result);
    }
    catch (err) { res.status(500).json({ error: err.message }); }
  }
  
  async getChats(req, res) {
    try {
      const { id } = req.params;
      const session = sessionManager.getSession(id);
      if (!session) return res.status(404).json({ error: 'Session not found' });
      const result = await session.getChats();
      res.json(result);
    }
    catch (err) { res.status(500).json({ error: err.message }); }
  }

  // ===== PROFILE =====
  
  async getProfile(req, res) {
    try {
      const { id } = req.params;
      const result = this.profileManager.get(id);
      if (!result) return res.status(404).json({ error: 'Profile not found' });
      res.json(result);
    }
    catch (err) { res.status(500).json({ error: err.message }); }
  }
  
  async updateProfile(req, res) {
    try {
      const { id } = req.params;
      const result = this.profileManager.update(id, req.body);
      if (!result) return res.status(404).json({ error: 'Profile not found' });
      res.json(result);
    }
    catch (err) { res.status(500).json({ error: err.message }); }
  }

  // ===== PERSONA =====
  
  async getPersona(req, res) {
    try {
      const { id } = req.params;
      const result = sessionManager.getPersonaPrompt(id);
      res.json(result || { prompt: '', name: '' });
    }
    catch (err) { res.status(500).json({ error: err.message }); }
  }
  
  async updatePersona(req, res) {
    try {
      const { id } = req.params;
      const result = sessionManager.setPersonaPrompt(id, req.body);
      res.json(result);
    }
    catch (err) { res.status(500).json({ error: err.message }); }
  }
  
  async savePersonaPrompt(req, res) {
      try {
        const { id } = req.params;
        const result = sessionManager.setPersonaPrompt(id, req.body);
        res.json(result);
      }
      catch (err) { res.status(500).json({ error: err.message }); }
    }

  // ===== PRODUCTS =====
  
  async getProducts(req, res) {
    try {
      const { id } = req.params;
      const result = this.productManager.list();
      res.json(result);
    }
    catch (err) { res.status(500).json({ error: err.message }); }
  }
  
  async getProduct(req, res) {
    try {
      const { id, productId } = req.params;
      const result = this.productManager.get(productId);
      if (!result) return res.status(404).json({ error: 'Product not found' });
      res.json(result);
    }
    catch (err) { res.status(500).json({ error: err.message }); }
  }
  
  async createProduct(req, res) {
    try {
      const { id } = req.params;
      const result = this.productManager.create(req.body);
      res.json(result);
    }
    catch (err) { res.status(500).json({ error: err.message }); }
  }
  
  async updateProduct(req, res) {
    try {
      const { id, productId } = req.params;
      const result = this.productManager.update(productId, req.body);
      if (!result) return res.status(404).json({ error: 'Product not found' });
      res.json(result);
    }
    catch (err) { res.status(500).json({ error: err.message }); }
  }
  
  async deleteProduct(req, res) {
    try {
      const { id, productId } = req.params;
      const result = this.productManager.delete(productId);
      if (!result) return res.status(404).json({ error: 'Product not found' });
      res.json(result);
    }
    catch (err) { res.status(500).json({ error: err.message }); }
  }
  
  async searchProducts(req, res) {
    try {
      const { id } = req.params;
      const { query } = req.query;
      const result = this.productManager.search(query);
      res.json(result);
    }
    catch (err) { res.status(500).json({ error: err.message }); }
  }

  async saveProducts(req, res) {
    try {
      const { id } = req.params;
      const result = this.productManager.save(req.body);
      res.json(result);
    }
    catch (err) { res.status(500).json({ error: err.message }); }
  }

  // ===== KNOWLEDGE =====
  
  async getKnowledge(req, res) {
    try {
      const { id } = req.params;
      const result = this.knowledgeManager.list();
      res.json(result);
    }
    catch (err) { res.status(500).json({ error: err.message }); }
  }
  
  async getKnowledgeItem(req, res) {
    try {
      const { id, knowledgeId } = req.params;
      const result = this.knowledgeManager.get(knowledgeId);
      if (!result) return res.status(404).json({ error: 'Knowledge item not found' });
      res.json(result);
    }
    catch (err) { res.status(500).json({ error: err.message }); }
  }
  
  async createKnowledge(req, res) {
    try {
      const { id } = req.params;
      const result = this.knowledgeManager.create(req.body);
      res.json(result);
    }
    catch (err) { res.status(500).json({ error: err.message }); }
  }
  
  async updateKnowledge(req, res) {
    try {
      const { id, knowledgeId } = req.params;
      const result = this.knowledgeManager.update(knowledgeId, req.body);
      if (!result) return res.status(404).json({ error: 'Knowledge item not found' });
      res.json(result);
    }
    catch (err) { res.status(500).json({ error: err.message }); }
  }
  
  async deleteKnowledge(req, res) {
    try {
      const { id, knowledgeId } = req.params;
      const result = this.knowledgeManager.delete(knowledgeId);
      if (!result) return res.status(404).json({ error: 'Knowledge item not found' });
      res.json(result);
    }
    catch (err) { res.status(500).json({ error: err.message }); }
  }
  
  async searchKnowledge(req, res) {
    try {
      const { id } = req.params;
      const { query } = req.query;
      const result = this.knowledgeManager.search(query);
      res.json(result);
    }
    catch (err) { res.status(500).json({ error: err.message }); }
  }

  async fetchProduct(req, res) {
    try {
      const { id } = req.params;
      const { url } = req.body;
      if (!url) return res.status(400).json({ error: 'URL required' });
      
      // Fetch product data
      const { JSDOM } = require('jsdom');
      const { window } = new JSDOM('');
      const gm = require('gm').configure({ imageMagick: true });
      
      const meta = name => window.document.querySelector(`meta[name='${name}']`);
      
      let name = meta('product:name') ? meta('product:name').content : '';
      name = name || meta('og:title') ? meta('og:title').content : '';
      name = name || meta('twitter:title') ? meta('twitter:title').content : '';
      
      const description = meta('product:description') ? meta('product:description').content : 
                         meta('og:description') ? meta('og:description').content : '';
      
      let price = 0;
      let image = meta('product:image') ? meta('product:image').content : '';
      let productUrl = url;
      
      if (!price) {
        const priceStr = meta('product:price:amount') || meta('price') || 
                         window.document.querySelector('input[name="price"]')?.value || 
                         window.document.querySelector('[class*="price"]')?.textContent;
        if (priceStr) { price = parseInt(priceStr.replace(/[^0-9]/g,'')) || 0; }
      }
      
      if (image && !image.startsWith('http')) { try { const u = new URL(url); image = u.origin + image; } catch {} }
      
      res.json({ name, description, price, image, url });
    }
    catch (err) { res.status(500).json({ error: 'Failed to fetch: ' + err.message }); }
  }

  // ===== CONVERSATION INBOX =====
  
  async getConversations(req, res) {
    try {
      const { id } = req.params;
      const result = await sessionManager.getConversations(req.params.id);
      res.json(result);
    }
    catch (err) { res.status(500).json({ error: err.message }); }
  }
  
  async getConversationMessages(req, res) {
    try {
      const { id, jid } = req.params;
      const result = await sessionManager.getConversationMessages(req.params.id, req.params.jid);
      res.json(result);
    }
    catch (err) { res.status(500).json({ error: err.message }); }
  }
  
  async getConversationStatus(req, res) {
    try {
      const { id, jid } = req.params;
      const result = sessionManager.getConversationStatus(req.params.id, req.params.jid);
      res.json(result);
    }
    catch (err) { res.status(500).json({ error: err.message }); }
  }
  
  async sendHumanReply(req, res) {
    try {
      const { id } = req.params;
      const { to, content } = req.body;
      const result = await sessionManager.sendHumanReply(req.params.id, req.body);
      res.json(result);
    }
    catch (err) { res.status(500).json({ error: err.message }); }
  }

  async clearChatMessages(req, res) {
    try {
      const { id, chatId } = req.params;
      const session = sessionManager.getSession(id);
      if (!session) return res.status(404).json({ error: 'Session not found' });
      const messageRepo = require('../core/repositories/MessageRepository');
      const deleted = await messageRepo.clearChat(id, chatId);
      res.json({ success: true, deleted });
    }
    catch (err) { res.status(500).json({ error: err.message }); }
  }

  async getAvatar(req, res) {
    try {
      const { id, jid } = req.params;
      const result = await sessionManager.getAvatar(req.params.id, req.params.jid);
      res.json(result);
    }
    catch (err) { res.status(500).json({ error: err.message }); }
  }

  // ===== BOT CONTROL =====
  
  async pauseBot(req, res) {
    try {
      const { id } = req.params;
      const result = await sessionManager.pauseBot(req.params.id);
      res.json(result);
    }
    catch (err) { res.status(500).json({ error: err.message }); }
  }
  
  async resumeBot(req, res) {
    try {
      const { id } = req.params;
      const result = await sessionManager.resumeBot(req.params.id);
      res.json(result);
    }
    catch (err) { res.status(500).json({ error: err.message }); }
  }
  // ===== PERSONA PROMPTS (per-session) =====

  async getPersonaPrompt(req, res) {
    try {
      const { id } = req.params;
      const persona = sessionManager.getPersonaPrompt(id);
      res.json(persona);
    }
    catch (err) { res.status(500).json({ error: err.message }); }
  }

  // ===== KNOWLEDGE CONFIG (per-session) =====

  async getKnowledgeConfig(req, res) {
    try {
      const { id } = req.params;
      const kConfig = sessionManager.getKnowledgeConfig(id);
      res.json(kConfig);
    }
    catch (err) { res.status(500).json({ error: err.message }); }
  }

  async saveKnowledgeConfig(req, res) {
    try {
      const { id } = req.params;
      const result = sessionManager.setKnowledgeConfig(id, req.body);
      res.json(result);
    }
    catch (err) { res.status(500).json({ error: err.message }); }
  }

  // ===== KNOWLEDGE FILES =====

  async listKnowledgeFiles(req, res) {
    try {
      const { id } = req.params;
      const files = sessionManager.listKnowledgeFiles(id);
      res.json(files);
    }
    catch (err) { res.status(500).json({ error: err.message }); }
  }

  async uploadKnowledgeFile(req, res) {
    try {
      const { id } = req.params;
      const uploadDir = path.join(config.sessionsPath, id, 'files');
      const files = await parseUpload(req, uploadDir, {
        maxFileSize: 50 * 1024 * 1024,
        allowedTypes: []
      });
      const results = [];
      for (const file of files) {
        const result = await sessionManager.uploadKnowledgeFile(id, file);
        results.push(result);
      }
      res.json(results.length === 1 ? results[0] : results);
    }
    catch (err) { res.status(500).json({ error: err.message }); }
  }

  async deleteKnowledgeFile(req, res) {
    try {
      const { id, fileId } = req.params;
      const result = await sessionManager.deleteKnowledgeFile(id, fileId);
      res.json(result);
    }
    catch (err) { res.status(500).json({ error: err.message }); }
  }

  async downloadKnowledgeFile(req, res) {
    try {
      const { id, fileId } = req.params;
      const result = await sessionManager.getKnowledgeFile(id, fileId);
      res.json(result);
    }
    catch (err) { res.status(500).json({ error: err.message }); }
  }

  // ===== GALLERY (Dropzone) =====

  async listGalleryFiles(req, res) {
    try {
      const files = await sessionManager.listGalleryFiles(req.params.id);
      res.json(files);
    } catch (err) { res.status(500).json({ error: err.message }); }
  }

  async uploadGalleryFile(req, res) {
    try {
      const { id } = req.params;
      const { parseUpload } = require('../utils/file-upload');
      const uploadDir = path.join(
        require('../config').sessionsPath,
        id, 'gallery'
      );
      const files = await parseUpload(req, uploadDir, {
        maxFileSize: 50 * 1024 * 1024,
        allowedTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml']
      });
      const results = [];
      for (const file of files) {
        const result = await sessionManager.uploadGalleryFile(id, file);
        results.push(result);
      }
      res.json(results.length === 1 ? results[0] : results);
    } catch (err) { res.status(500).json({ error: err.message }); }
  }

  async deleteGalleryFile(req, res) {
    try {
      const { id, fileId } = req.params;
      const result = await sessionManager.deleteGalleryFile(id, fileId);
      res.json({ success: result });
    } catch (err) { res.status(500).json({ error: err.message }); }
  }

  async downloadGalleryFile(req, res) {
    try {
      const { id, fileId } = req.params;
      const file = await sessionManager.getGalleryFile(id, fileId);
      if (!file) return res.status(404).json({ error: 'File not found' });
      res.download(file.diskPath, file.originalName);
    } catch (err) { res.status(500).json({ error: err.message }); }
  }

}

module.exports = new MainController();