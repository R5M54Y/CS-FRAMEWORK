'use strict';

const { v4: uuidv4 } = require('uuid');
const QRCode = require('qrcode');
const sessionManager = require('../core/session-manager');
const { ProductManager, KnowledgeManager, ProfileManager, PersonaManager, SettingsManager } = require('../core/storage');
const config = require('../config');

class MainController {
  constructor() {
    this.profileManager = new ProfileManager();
    this.personaManager = new PersonaManager();
    this.settingsManager = new SettingsManager();
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
    this.getQRCode = this.getQRCode.bind(this);
    this.sendMessage = this.sendMessage.bind(this);
    this.getMessages = this.getMessages.bind(this);
    this.getMessagesByDate = this.getMessagesByDate.bind(this);
    this.getChats = this.getChats.bind(this);
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

  getSessions(req, res) {
    const sessions = sessionManager.getAllSessions();
    res.json({
      total: sessions.length,
      connected: sessions.filter(s => s.connected).length,
      disconnected: sessions.filter(s => !s.connected && s.state !== 'connecting' && s.state !== 'reconnecting').length,
      connecting: sessions.filter(s => s.state === 'connecting' || s.state === 'reconnecting').length,
      sessions
    });
  }

  async createSession(req, res) {
    try {
      const result = await sessionManager.createSession(req.body);
      res.status(201).json(result);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  }

  getSession(req, res) {
    const status = sessionManager.getSessionInfo(req.params.id);
    if (!status) return res.status(404).json({ error: 'Session not found' });
    res.json(status);
  }

  updateSession(req, res) {
    try {
      const status = sessionManager.updateSession(req.params.id, req.body);
      res.json(status);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  }

  async connectSession(req, res) {
    try { res.json(await sessionManager.connectSession(req.params.id)); }
    catch (err) { res.status(400).json({ error: err.message }); }
  }

  async disconnectSession(req, res) {
    try { res.json(await sessionManager.disconnectSession(req.params.id)); }
    catch (err) { res.status(400).json({ error: err.message }); }
  }

  async reconnectSession(req, res) {
    try { res.json(await sessionManager.reconnectSession(req.params.id)); }
    catch (err) { res.status(400).json({ error: err.message }); }
  }

  async restartSession(req, res) {
    try { res.json(await sessionManager.restartSession(req.params.id)); }
    catch (err) { res.status(400).json({ error: err.message }); }
  }

  async getQRCode(req, res) {
    try {
      const session = sessionManager.getSession(req.params.id);
      if (!session) return res.status(404).json({ error: 'Session not found' });
      const status = session.getStatus();
      if (!status.qrCode) return res.json({ qrCode: null, qrImage: null });
      const qrImage = await QRCode.toDataURL(status.qrCode);
      res.json({ qrCode: status.qrCode, qrImage });
    } catch (err) { res.status(500).json({ error: err.message }); }
  }

  async deleteSession(req, res) {
    try { res.json(await sessionManager.deleteSession(req.params.id)); }
    catch (err) { res.status(400).json({ error: err.message }); }
  }

  async sendMessage(req, res) {
    try {
      const { to, content, media } = req.body;
      const result = await sessionManager.sendMessage(req.params.id, to, content, { media });
      res.json({ success: !!result, message: result });
    } catch (err) { res.status(400).json({ error: err.message }); }
  }

  getMessages(req, res) {
    const count = parseInt(req.query.count) || 50;
    res.json(sessionManager.getRecentMessages(req.params.id, count));
  }

  async getMessagesByDate(req, res) {
    try {
      const messages = await sessionManager.getMessagesByDate(req.params.id, req.query.date);
      res.json(messages);
    } catch (err) { res.status(400).json({ error: err.message }); }
  }

  async getChats(req, res) {
    try { res.json(await sessionManager.getChats(req.params.id)); }
    catch (err) { res.status(400).json({ error: err.message }); }
  }

  getProfile(req, res) {
    const profile = sessionManager.getProfile(req.params.id);
    if (!profile) return res.status(404).json({ error: 'Profile not found' });
    res.json(profile);
  }

  updateProfile(req, res) {
    const profile = sessionManager.updateProfile(req.params.id, req.body);
    if (!profile) return res.status(404).json({ error: 'Profile not found' });
    res.json(profile);
  }

  getPersona(req, res) {
    const persona = sessionManager.getPersona(req.params.id);
    res.json({ personaId: persona?.id || null, persona });
  }

  updatePersona(req, res) {
    const persona = sessionManager.updatePersona(req.params.id, req.body);
    res.json(persona);
  }
  savePersonaPrompt(req, res) {
    const persona = sessionManager.updatePersona(req.params.id, { prompt: req.body.prompt });
    res.json(persona);
  }

  getProducts(req, res) { res.json(sessionManager.getProducts(req.params.id)); }
  getProduct(req, res) {
    const p = sessionManager.getProduct(req.params.id, req.params.productId);
    if (!p) return res.status(404).json({ error: 'Product not found' });
    res.json(p);
  }
  createProduct(req, res) { res.status(201).json(sessionManager.createProduct({ ...req.body, sessionId: req.params.id })); }
  saveProducts(req, res) { res.json(sessionManager.saveProducts(req.params.id, req.body.products || [])); }
  updateProduct(req, res) {
    const p = sessionManager.updateProduct(req.params.id, req.params.productId, req.body);
    if (!p) return res.status(404).json({ error: 'Product not found' });
    res.json(p);
  }
  deleteProduct(req, res) {
    if (!sessionManager.deleteProduct(req.params.id, req.params.productId)) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true });
  }
  searchProducts(req, res) { res.json(sessionManager.searchProducts(req.params.id, req.query.q || '')); }

  getKnowledge(req, res) { res.json(sessionManager.getKnowledge(req.params.id)); }
  getKnowledgeItem(req, res) {
    const k = sessionManager.getKnowledgeItem(req.params.id, req.params.knowledgeId);
    if (!k) return res.status(404).json({ error: 'Not found' });
    res.json(k);
  }
  createKnowledge(req, res) { res.status(201).json(sessionManager.createKnowledge(req.params.id, req.body)); }
  updateKnowledge(req, res) {
    const k = sessionManager.updateKnowledge(req.params.id, req.params.knowledgeId, req.body);
    if (!k) return res.status(404).json({ error: 'Not found' });
    res.json(k);
  }
  deleteKnowledge(req, res) {
    if (!sessionManager.deleteKnowledge(req.params.id, req.params.knowledgeId)) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true });
  }
  searchKnowledge(req, res) { res.json(sessionManager.searchKnowledge(req.params.id, req.query.q || '')); }

  async fetchProduct(req, res) {
        try {
          const { url } = req.body;
          if (!url) return res.status(400).json({ error: 'URL is required' });
          const mod = url.startsWith('https') ? require('https') : require('http');
          const html = await new Promise((resolve, reject) => {
            const get = (u, redirects = 0) => {
              if (redirects > 5) return reject(new Error('Too many redirects'));
              mod.get(u, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }, timeout: 15000 }, (resp) => {
                if (resp.statusCode >= 300 && resp.statusCode < 400 && resp.headers.location) {
                  let loc = resp.headers.location;
                  if (loc.startsWith('/')) { const u2 = new URL(url); loc = u2.origin + loc; }
                  return get(loc, redirects + 1);
                }
                let d = ''; resp.on('data', c => d += c); resp.on('end', () => resolve(d)); resp.on('error', reject);
              }).on('error', reject).on('timeout', function() { this.destroy(); reject(new Error('Timeout')); });
            };
            get(url);
          });
     
          const gm = (re) => { const m = html.match(re); return m ? m[1].trim().replace(/&/g,'&').replace(/</g,'<').replace(/>/g,'>').replace(/'/g,"'").replace(/"/g,'"') : ''; };
          const meta = (p) => gm(new RegExp('<meta[^>]+(?:property|name)=["\']' + p + '["\'][^>]+content=["\']([^"\']*)["\']','i'))
            || gm(new RegExp('<meta[^>]+content=["\']([^"\']*)["\'][^>]+(?:property|name)=["\']' + p + '["\']','i'));
     
          // JSON-LD structured data extraction
          let jsonLdData = {};
          const jsonLdMatches = html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
          if (jsonLdMatches) {
            for (const match of jsonLdMatches) {
              const content = match.replace(/<script[^>]*>/i, '').replace(/<\/script>/i, '').trim();
              try {
                const data = JSON.parse(content);
                if (data['@type'] === 'Product' || (Array.isArray(data) && data.find(d => d['@type'] === 'Product'))) {
                  const product = data['@type'] === 'Product' ? data : data.find(d => d['@type'] === 'Product');
                  if (product.name) jsonLdData.name = product.name;
                  if (product.description) jsonLdData.description = product.description;
                  if (product.offers) {
                    const offer = Array.isArray(product.offers) ? product.offers[0] : product.offers;
                    if (offer.price) jsonLdData.price = parseInt(offer.price);
                    if (offer.priceCurrency) jsonLdData.currency = offer.priceCurrency;
                  }
                  if (product.image) jsonLdData.image = Array.isArray(product.image) ? product.image[0] : product.image;
                }
              } catch {}
            }
          }
     
          let name = jsonLdData.name || meta('og:title') || meta('twitter:title') || gm(/<title[^>]*>([^<]+)<\/title>/i);
          let description = jsonLdData.description || meta('og:description') || meta('description') || meta('twitter:description');
          let image = jsonLdData.image || meta('og:image') || meta('twitter:image');
          let price = jsonLdData.price || 0;
     
          // Site-specific selectors
          const host = new URL(url).hostname;
          if (host.includes('tokopedia.com')) {
            name = name || gm(/data-testid=["']product-name["'][^>]*>([^<]+)</i) || gm(/"name"\s*:\s*"([^"]+)"/i);
            price = price || (gm(/data-testid=["']product-price["'][^>]*>([^<]+)</i) ? parseInt(gm(/data-testid=["']product-price["'][^>]*>([^<]+)</i).replace(/[^0-9]/g,'')) : 0);
            description = description || gm(/data-testid=["']product-description["'][^>]*>([^<]+)</i);
            image = image || gm(/data-testid=["']product-image["'][^>]*src=["']([^"']+)["']/i);
          } else if (host.includes('shopee.co.id')) {
            name = name || gm(/class=["'][^"']*product-title[^"']*["'][^>]*>([^<]+)</i) || gm(/"name"\s*:\s*"([^"]+)"/i);
            price = price || (gm(/class=["'][^"']*price[^"']*["'][^>]*>([^<]+)</i) ? parseInt(gm(/class=["'][^"']*price[^"']*["'][^>]*>([^<]+)</i).replace(/[^0-9]/g,'')) : 0);
            image = image || gm(/class=["'][^"']*product-image[^"']*["'][^>]*src=["']([^"']+)["']/i);
          } else if (host.includes('bukalapak.com')) {
            name = name || gm(/data-title=["']([^"']+)["']/i) || gm(/class=["'][^"']*product-name[^"']*["'][^>]*>([^<]+)</i);
            price = price || (gm(/data-price=["']([^"']+)["']/i) ? parseInt(gm(/data-price=["']([^"']+)["']/i).replace(/[^0-9]/g,'')) : 0);
            image = image || gm(/class=["'][^"']*product-image[^"']*["'][^>]*src=["']([^"']+)["']/i);
          } else if (host.includes('lazada.co.id')) {
            name = name || gm(/data-title=["']([^"']+)["']/i) || gm(/pd_title["']?\s*:\s*["']([^"']+)["']/i);
            price = price || (gm(/data-price=["']([^"']+)["']/i) ? parseInt(gm(/data-price=["']([^"']+)["']/i).replace(/[^0-9]/g,'')) : 0);
            image = image || gm(/src=["']([^"']+\.(?:jpg|jpeg|png|webp))["']/i);
          } else if (host.includes('blibli.com')) {
            name = name || gm(/class=["'][^"']*product-name[^"']*["'][^>]*>([^<]+)</i);
            price = price || (gm(/class=["'][^"']*price[^"']*["'][^>]*>([^<]+)</i) ? parseInt(gm(/class=["'][^"']*price[^"']*["'][^>]*>([^<]+)</i).replace(/[^0-9]/g,'')) : 0);
          }
     
          if (!price) {
            const priceStr = meta('product:price:amount') || meta('price') || gm(/data-price=["']([^"']*)["']/i) || gm(/"price"\s*:\s*"?([\d.,]+)/i) || gm(/class=["'][^"']*price[^"']*["'][^>]*>([\d.,]+)/i);
            if (priceStr) { price = parseInt(priceStr.replace(/[^0-9.,]/g,'').replace(/,/g,'')) || 0; }
          }
     
          if (image && !image.startsWith('http')) { try { const u = new URL(url); image = u.origin + image; } catch {} }
     
          res.json({ name, description, price, image, url });
        } catch (err) { res.status(500).json({ error: 'Failed to fetch: ' + err.message }); }
      }

  getSettings(req, res) {
    const settings = this.settingsManager.get();
    settings.ai = {
      endpoint: config.aiEndpoint,
      model: config.aiModel,
      hasApiKey: !!config.aiApiKey,
      queueConcurrency: config.aiQueueConcurrency,
      requestTimeout: config.aiRequestTimeout,
      maxRetries: config.aiQueueMaxRetries
    };
    res.json(settings);
  }

  updateSettings(req, res) {
    res.json(this.settingsManager.set(req.body));
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
}

module.exports = new MainController();