'use strict';

const fs = require('fs-extra');
const path = require('path');
const EventEmitter = require('events');
const { Boom } = require('@hapi/boom');

// Baileys
const {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore
} = require('@whiskeysockets/baileys');

const config = require('../config');
const { ProductManager, KnowledgeManager } = require('./storage');
const { createSessionLogger } = require('../utils/logger');
const messageRepo = require('./repositories/MessageRepository');

/**
 * WhatsApp Session Manager
 * Handles a single WhatsApp Business connection
 */
class Session extends EventEmitter {
  constructor(sessionId, options = {}) {
    super();
    this.id = sessionId;
    this.log = createSessionLogger(sessionId, 'session');
    this.sock = null;
    this.state = 'disconnected'; // disconnected | connecting | connected | error
    this.qrCode = null;
    this.qrAttempts = 0;
    this.reconnectAttempts = 0;
    
    // FORENSIC LOG
    const ts = new Date().toISOString();
    const shortId = sessionId.slice(0, 8);
    console.log(`[${ts}] [${shortId}] [constructor()] [state=disconnected] Session initialized`);
    console.log(`[${ts}] [${shortId}] [constructor()] options=${JSON.stringify({autoReconnect: options.autoReconnect, port: options.port, holder: options.holder})}`);
    this.startTime = null;
    this.phoneNumber = null;
    this.displayName = null;
    this.holder = options.holder || null; // CS holder real name
    this.lastActivity = null;
    this.batteryLevel = null;
    this.pluggedIn = false;
    this.messages = [];
    this.maxMessages = 200;
    this.contacts = new Map(); // jid -> { pushName, notify, verifiedName, updatedAt }
    this._loadContacts();
    this.productManager = new ProductManager();
    this.knowledgeManager = new KnowledgeManager();
    this.replyService = options.replyService || null; // Injected by SessionManager
    this.port = options.port || null;
    this.reconnectTimer = null;
    this.connected = false;
    this.options = options;
    this.autoReconnect = options.autoReconnect !== false;
    this.typingDelay = options.typingDelay || config.defaultTypingDelay;
    this.readDelay = options.readDelay || config.defaultReadDelay;
    this.autoReply = options.autoReply !== undefined ? options.autoReply : config.autoReply;
    this.botEnabled = options.botEnabled !== false; // Default true, can be paused by human
    this.botPausedBy = options.botPausedBy || null; // Track who paused the bot

    this._setupConnectionHandlers();
    this.log.info(`Session ${sessionId} initialized`);
  }

  async connect() {
    const ts = new Date().toISOString();
    const shortId = this.id.slice(0, 8);
    
    console.log(`[${ts}] [${shortId}] [connect()] [state=${this.state}] ENTER: connected=${this.connected} sock=${!!this.sock} qrAttempts=${this.qrAttempts}`);
    
    if (this.state === 'connecting' || this.state === 'connected') {
      console.log(`[${ts}] [${shortId}] [connect()] [state=${this.state}] EXIT EARLY: Already in ${this.state}`);
      this.log.warn('Already connecting/connected');
      return { error: 'Already connecting or connected' };
    }

    const prevState = this.state;
    this.state = 'connecting';
    console.log(`[${ts}] [${shortId}] [connect()] STATE TRANSITION: ${prevState} → connecting`);
    this.emit('status', this.state);
    this.log.info('Connecting...');

    try {
      const { version, isLatest } = await fetchLatestBaileysVersion();
      this.log.info(`Using Baileys v${version.join('.')}, latest: ${isLatest}`);

      const sessionDir = path.join(config.sessionsPath, this.id);
      fs.ensureDirSync(sessionDir);
      fs.ensureDirSync(path.join(sessionDir, 'auth'));
      fs.ensureDirSync(path.join(sessionDir, 'data'));
      
      const authDir = path.join(sessionDir, 'auth');
      const credsPath = path.join(authDir, 'creds.json');
      const keysDir = path.join(authDir, 'keys');
      const credsExists = fs.existsSync(credsPath);
      const keysExists = fs.existsSync(keysDir);
      
      console.log(`[${ts}] [${shortId}] [connect()] AUTH STATE: credsExists=${credsExists} keysExists=${keysExists}`);

      const { state: authState, saveCreds } = await useMultiFileAuthState(authDir);
      
      console.log(`[${ts}] [${shortId}] [connect()] AUTH LOADED: hasCreds=${!!authState.creds} hasKeys=${!!authState.keys}`);
      if (authState.creds) {
        console.log(`[${ts}] [${shortId}] [connect()] CREDS DETAILS: connected=${authState.creds.me?.id || 'N/A'}`);
      }

      this.sock = makeWASocket({
        version,
        auth: {
          creds: authState.creds,
          keys: makeCacheableSignalKeyStore(authState.keys, require('pino')({ level: 'silent' }))
        },
        printQRInTerminal: config.enableQrTerminal,
        defaultQueryTimeoutMs: config.connectionTimeout,
        keepAliveIntervalMs: 30000,
        logger: require('pino')({ level: config.baileysLogLevel }),
        markOnlineOnConnect: true,
        emitOwnEvents: true,
        generateHighQualityLinkPreview: false,
        syncFullHistory: false,
        fireInitQueries: false,
        shouldIgnoreJid: () => false,
        patchMessageBeforeSending: (msg) => msg,
        getMessage: async () => null
      });
      
      console.log(`[${ts}] [${shortId}] [connect()] Socket created: ${!!this.sock}`);

      // Store saveCreds for later
      this.saveCreds = saveCreds;

      this._attachSocketHandlers();
      
      console.log(`[${ts}] [${shortId}] [connect()] EXIT: success=true qrCode=${!!this.qrCode}`);
      return { success: true, qrCode: this.qrCode };

    } catch (err) {
      const errState = 'error';
      this.state = errState;
      console.log(`[${ts}] [${shortId}] [connect()] STATE TRANSITION: ${prevState} → error`);
      console.log(`[${ts}] [${shortId}] [connect()] ERROR: ${err.message}`);
      this.log.error(`Connection error: ${err.message}`);
      this.emit('status', this.state);
      this.emit('error', err);
      return { error: err.message };
    }
  }

  _attachSocketHandlers() {
    if (!this.sock) return;
    
    const ts = new Date().toISOString();
    const shortId = this.id.slice(0, 8);
    console.log(`[${ts}] [${shortId}] [_attachSocketHandlers()] Attaching handlers to socket`);

    // QR Code
    this.sock.ev.on('creds.update', () => {
      const ts = new Date().toISOString();
      console.log(`[${ts}] [${shortId}] [creds.update] Event fired, saveCreds=${!!this.saveCreds}`);
      if (this.saveCreds) {
        this.saveCreds();
        console.log(`[${ts}] [${shortId}] [creds.update] Credentials saved`);
      }
    });

    this.sock.ev.on('connection.update', (update) => {
      const ts = new Date().toISOString();
      const { connection, lastDisconnect, qr } = update;
      
      console.log(`[${ts}] [${shortId}] [connection.update] connection=${connection} qr=${!!qr} lastDisconnect=${!!lastDisconnect}`);
      if (qr) {
        console.log(`[${ts}] [${shortId}] [connection.update] QR_GENERATED: length=${qr.length} attempts=${this.qrAttempts + 1}`);
      }
      if (lastDisconnect) {
        const statusCode = lastDisconnect?.error?.output?.statusCode || 500;
        console.log(`[${ts}] [${shortId}] [connection.update] DISCONNECT: statusCode=${statusCode} reason=${DisconnectReason[statusCode] || 'UNKNOWN'}`);
      }

      if (qr) {
        this.qrCode = qr;
        this.qrAttempts++;
        console.log(`[${ts}] [${shortId}] [connection.update] QR STORED: qrAttempts=${this.qrAttempts}`);
        this.emit('qr', qr);
        this.log.info(`QR code generated (attempt ${this.qrAttempts})`);
      }

      if (connection === 'open') {
        const prevState = this.state;
        this.state = 'connected';
        this.connected = true;
        console.log(`[${ts}] [${shortId}] [connection.update] STATE TRANSITION: ${prevState} → connected`);
        console.log(`[${ts}] [${shortId}] [connection.update] CONNECTION_OPEN: phone=${this.phoneNumber} display=${this.displayName}`);
        this.phoneNumber = this.sock.user?.id || 'Unknown';
        this.displayName = this.sock.user?.name || this.sock.user?.verifiedName || 'Unknown';
        this.startTime = new Date();
        this.lastActivity = new Date();
        this.reconnectAttempts = 0;
        this.emit('status', this.state);
        this.emit('ready', {
          phoneNumber: this.phoneNumber,
          displayName: this.displayName
        });
        this.log.info(`Connected: ${this.phoneNumber} (${this.displayName})`);
        // Warm message cache from SQLite
        this._ensureCache().catch(err => this.log.warn(`Cache warm failed: ${err.message}`));
      }

      if (connection === 'close') {
        this.connected = false;
        const statusCode = lastDisconnect?.error?.output?.statusCode || 500;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut
          && statusCode !== DisconnectReason.badSession
          && statusCode !== 403; // Forbidden by server
        
        console.log(`[${ts}] [${shortId}] [connection.update] CONNECTION_CLOSE: statusCode=${statusCode} shouldReconnect=${shouldReconnect} reason=${DisconnectReason[statusCode] || 'UNKNOWN'}`);

        if (statusCode === DisconnectReason.loggedOut) {
          const prevState = this.state;
          this.state = 'disconnected';
          console.log(`[${ts}] [${shortId}] [connection.update] STATE TRANSITION: ${prevState} → disconnected (loggedOut)`);
          this.log.warn('Logged out from WhatsApp');
          this.emit('status', this.state);
          this.emit('loggedOut');
          console.log(`[${ts}] [${shortId}] [connection.update] Calling disconnect() due to loggedOut`);
          this.disconnect();
          return;
        }

        if (shouldReconnect) {
          const prevState = this.state;
          this.state = 'reconnecting';
          this.emit('status', this.state);
          console.log(`[${ts}] [${shortId}] [connection.update] STATE TRANSITION: ${prevState} → reconnecting`);
          this.log.info(`Disconnected (code: ${statusCode}), reconnecting in ${config.reconnectDelay}ms...`);
          this.reconnectAttempts++;
          console.log(`[${ts}] [${shortId}] [connection.update] reconnectAttempts=${this.reconnectAttempts} maxAttempts=${config.maxReconnectAttempts}`);
          if (this.reconnectAttempts <= config.maxReconnectAttempts) {
            this.reconnectTimer = setTimeout(() => this.connect(), config.reconnectDelay);
            console.log(`[${ts}] [${shortId}] [connection.update] Scheduled reconnect in ${config.reconnectDelay}ms`);
          } else {
            const prevState2 = this.state;
            this.state = 'disconnected';
            console.log(`[${ts}] [${shortId}] [connection.update] STATE TRANSITION: ${prevState2} → disconnected (maxAttemptsReached)`);
            this.emit('status', this.state);
            this.log.error('Max reconnect attempts reached');
          }
        } else {
          const prevState = this.state;
          this.state = 'disconnected';
          console.log(`[${ts}] [${shortId}] [connection.update] STATE TRANSITION: ${prevState} → disconnected (permanent)`);
          this.emit('status', this.state);
          this.log.warn(`Connection closed permanently (code: ${statusCode})`);
        }
      }
    });

    // Messages
    this.sock.ev.on('messages.upsert', async (msg) => {
      const { messages, type } = msg;
      if (type !== 'notify') return;

      for (const m of messages) {
        const jid = m.key?.remoteJid || '';
        const isWhatsApp = jid.endsWith('@s.whatsapp.net');
        const isGroup = jid.endsWith('@g.us');
        const isLid = jid.endsWith('@lid');

        if (isWhatsApp || isGroup || isLid) {
          // Normalize: if LID, use remoteJidAlt as canonical sender
          if (isLid && m.key?.remoteJidAlt) {
            console.log(`[TRACE] LID→JID: ${jid} → ${m.key.remoteJidAlt}`);
            m.key.remoteJid = m.key.remoteJidAlt;
          }
          // Remember display name (pushName preferred, fallback: verifiedName / name)
          if (m.pushName || m.verifiedBizName) {
            this._updateContact(m.key.remoteJid, { pushName: m.pushName, verifiedName: m.verifiedBizName });
          }
          await this._handleIncomingMessage(m);
        }
      }
    });

    // Presence
    this.sock.ev.on('presence.update', (update) => {
      this.emit('presence', update);
    });

    // Contacts — refresh cached display names (name changes, profile updates)
    this.sock.ev.on('contacts.update', (contacts) => {
      for (const c of contacts || []) {
        if (!c.id) continue;
        this._updateContact(c.id, { notify: c.notify, verifiedName: c.verifiedName });
      }
    });

    // Battery
    this.sock.ev.on('battery', (battery) => {
      this.batteryLevel = battery.battery;
      this.pluggedIn = battery.pluggable;
    });
  }

  _setupConnectionHandlers() {
    // Base setup - nothing needed before connect
  }

  async _handleIncomingMessage(msg) {
    console.log(`[TRACE] _handleIncomingMessage ENTERED, remoteJid=${msg.key.remoteJid}, fromMe=${msg.key.fromMe}`);
    const sender = msg.key.remoteJid;
    const fromMe = msg.key.fromMe;
    if (fromMe) {
      console.log(`[TRACE] _handleIncomingMessage SKIP: fromMe=true`);
      return;
    }

    const messageContent = this._getMessageContent(msg);
    if (!messageContent) {
      console.log(`[TRACE] _handleIncomingMessage SKIP: no messageContent (msg.message keys: ${Object.keys(msg.message || {}).join(',')})`);
      return;
    }
    console.log(`[TRACE] _handleIncomingMessage content="${messageContent.substring(0,50)}"`);

    const user = sender.split('@')[0];
    const message = {
      id: msg.key.id,
      from: sender,
      user,
      content: messageContent,
      type: msg.messageType || 'text',
      timestamp: msg.messageTimestamp ? new Date(msg.messageTimestamp * 1000).toISOString() : new Date().toISOString(),
      isGroup: sender.includes('@g.us')
    };

    this.messages.push(message);
    if (this.messages.length > this.maxMessages) {
      this.messages.shift();
    }
    this.lastActivity = new Date();

    // Persist to SQLite (single source of truth)
    messageRepo.save({ ...message, session_id: this.id }).catch(err => {
      this.log.error(`Failed to save incoming message to DB: ${err.message}`);
    });

    // [DEPRECATED] JSON file fallback — kept for rollback
    // this._saveMessage(message);

    this.emit('message', message);
    this.log.info(`Message from ${message.isGroup ? 'group' : 'user'} ${user}: ${message.content.substring(0, 100)}`);

    // Auto reply
    console.log(`[TRACE] autoReply=${this.autoReply}, connected=${this.connected}, replyService=${!!this.replyService}`);
    if (this.autoReply && this.connected) {
      await this._sendReadReceipt(sender, msg.key);
      await this._sendTyping(sender);
      await this._processAutoReply(sender, message);
    }
  }

  _getMessageContent(msg) {
    const types = [
      'conversation',
      'extendedTextMessage',
      'imageMessage',
      'videoMessage',
      'documentMessage',
      'voiceMessage',
      'stickerMessage'
    ];

    for (const type of types) {
      if (msg.message?.[type]) {
        if (type === 'conversation') return msg.message.conversation;
        if (type === 'extendedTextMessage') return msg.message.extendedTextMessage.text || '';
        return `[${type.replace('Message', '')}]`;
      }
    }

    if (msg.message?.buttonsResponseMessage) {
      return msg.message.buttonsResponseMessage.selectedButtonId || '';
    }
    if (msg.message?.listResponseMessage) {
      return msg.message.listResponseMessage.title || '';
    }
    if (msg.message?.templateButtonReplyMessage) {
      return msg.message.templateButtonReplyMessage.selectedId || '';
    }

    return null;
  }

  async _sendReadReceipt(sender, key) {
    try {
      await this.sock.readMessages([key]);
    } catch (err) {
      // Ignore read receipt errors
    }
  }

  async _sendTyping(sender) {
    try {
      await this.sock.sendPresenceUpdate('composing', sender);
    } catch (err) {
      // Ignore typing errors
    }
  }

  async _processAutoReply(sender, message) {
    console.log(`[TRACE] _processAutoReply ENTERED, replyService=${!!this.replyService}`);
    // Use ReplyService if available (AI-driven)
    if (this.replyService) {
      console.log(`[TRACE] _processAutoReply → replyService.processIncomingMessage(sessionId=${this.id}, sender=${sender})`);
      try {
        await this.replyService.processIncomingMessage(this.id, sender, message);
        console.log(`[TRACE] _processAutoReply → replyService returned OK`);
        return;
      } catch (err) {
        this.log.error(`ReplyService error: ${err.message}, falling back to knowledge base`);
      }
    }

    // Fallback: knowledge-based reply
    await this._delay(this.typingDelay);
    const response = await this._findResponse(message.content);
    if (response) {
      const sent = await this.sendMessage(sender, response);
      if (sent) {
        this.log.info(`Replied to ${sender}`);
      }
    }
  }

  async _findResponse(message) {
    const lower = message.toLowerCase();
    
    // Try knowledge base
    const knowledge = this.knowledgeManager.list();
    for (const item of knowledge) {
      const full = this.knowledgeManager.get(item.id);
      if (!full) continue;
      const keywords = full.keywords || [];
      for (const keyword of keywords) {
        if (lower.includes(keyword.toLowerCase())) {
          return full.content;
        }
      }
    }

    return null;
  }

  _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Ensure runtime cache is populated from SQLite.
   * Called lazily when cache is empty and a read method needs data.
   */
  async _ensureCache(maxCount) {
    const limit = maxCount || config.cacheWarmLimit || 500;
    if (this.messages.length === 0) {
      try {
        const recent = await messageRepo.findRecent(this.id, limit);
        this.messages = recent;
        this.log.info(`Cache warmed: ${recent.length} messages from SQLite`);
      } catch (err) {
        this.log.error(`Failed to warm cache: ${err.message}`);
      }
    }
  }

  _saveMessage(message) {
    try {
      const dataDir = path.join(config.sessionsPath, this.id, 'data');
      const today = new Date().toISOString().split('T')[0];
      const file = path.join(dataDir, `messages-${today}.json`);

      let messages = [];
      if (fs.existsSync(file)) {
        try {
          messages = fs.readJsonSync(file);
        } catch (e) {
          messages = [];
        }
      }
      messages.push(message);
      fs.writeJsonSync(file, messages, { spaces: 2 });
    } catch (err) {
      this.log.error(`Failed to save message: ${err.message}`);
    }
  }

  // ===== CONTACT CACHE PERSISTENCE (survives restart) =====

  _contactsFile() {
    return path.join(config.sessionsPath, this.id, 'contacts.json');
  }

  _loadContacts() {
    try {
      const file = this._contactsFile();
      if (fs.existsSync(file)) {
        const data = fs.readJsonSync(file);
        if (data && typeof data === 'object') {
          for (const [jid, entry] of Object.entries(data)) {
            this.contacts.set(jid, {
              pushName: entry?.pushName || null,
              notify: entry?.notify || null,
              verifiedName: entry?.verifiedName || null,
              updatedAt: entry?.updatedAt || null
            });
          }
        }
      }
    } catch (err) {
      this.log.error(`Failed to load contacts: ${err.message}`);
    }
  }

  _persistContacts() {
    try {
      const data = {};
      for (const [jid, entry] of this.contacts) {
        data[jid] = entry;
      }
      fs.ensureDirSync(path.join(config.sessionsPath, this.id));
      fs.writeJsonSync(this._contactsFile(), data, { spaces: 2 });
    } catch (err) {
      this.log.error(`Failed to save contacts: ${err.message}`);
    }
  }

  _updateContact(jid, update) {
    if (!jid) return;
    const prev = this.contacts.get(jid) || {};
    const merged = {
      pushName: update.pushName !== undefined ? update.pushName : (prev.pushName || null),
      notify: update.notify !== undefined ? update.notify : (prev.notify || null),
      verifiedName: update.verifiedName !== undefined ? update.verifiedName : (prev.verifiedName || null),
      updatedAt: new Date().toISOString()
    };
    // Only persist when something actually changed
    if (prev.pushName !== merged.pushName || prev.notify !== merged.notify || prev.verifiedName !== merged.verifiedName) {
      this.contacts.set(jid, merged);
      this._persistContacts();
    }
  }

  // Best display name for a JID: pushName → notify → verifiedName → phone
  _contactDisplayName(jid) {
    const entry = this.contacts.get(jid);
    return entry?.pushName || entry?.notify || entry?.verifiedName || null;
  }

  async sendMessage(to, content, options = {}) {
    if (!this.connected || !this.sock) {
      this.log.warn('Cannot send: not connected');
      return null;
    }

    try {
      const payload = {};
      if (options.media) {
        payload.image = { url: options.media };
        payload.caption = content;
      } else {
        payload.text = content;
      }

      const sent = await this.sock.sendMessage(to, payload, {
        quoted: options.quoted ? { key: options.quoted, message: {} } : undefined,
        linkPreview: options.linkPreview !== false
      });

      const outgoing = {
        id: sent?.key?.id || require('uuid').v4(),
        to,
        content,
        type: options.media ? 'image' : 'text',
        timestamp: new Date().toISOString(),
        isOutgoing: true,
        fromMe: true
      };

      this.messages.push(outgoing);
      if (this.messages.length > this.maxMessages) {
        this.messages.shift();
      }
      // Persist outgoing to SQLite
      messageRepo.save({ ...outgoing, session_id: this.id, isOutgoing: true }).catch(err => {
        this.log.error(`Failed to save outgoing message to DB: ${err.message}`);
      });

      // [DEPRECATED] JSON — kept for rollback
      // this._saveMessage(outgoing);
      this.emit('sent', outgoing);

      return sent;
    } catch (err) {
      this.log.error(`Send error: ${err.message}`);
      this.emit('error', err);
      return null;
    }
  }

  async sendImage(to, url, caption = '') {
    return this.sendMessage(to, caption, { media: url });
  }

  async broadcastMessage(contacts, content) {
    const results = [];
    for (const contact of contacts) {
      const sent = await this.sendMessage(contact, content);
      results.push({ contact, sent: !!sent });
    }
    return results;
  }

  async disconnect() {
    const ts = new Date().toISOString();
    const shortId = this.id.slice(0, 8);
    const prevState = this.state;
    
    console.log(`[${ts}] [${shortId}] [disconnect()] ENTER: state=${this.state} connected=${this.connected} sock=${!!this.sock}`);
    
    this.connected = false;
    this.state = 'disconnected';
    console.log(`[${ts}] [${shortId}] [disconnect()] STATE TRANSITION: ${prevState} → disconnected`);
    
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
      console.log(`[${ts}] [${shortId}] [disconnect()] reconnectTimer cleared`);
    }

    if (this.sock) {
      try {
        console.log(`[${ts}] [${shortId}] [disconnect()] Socket cleanup: removeAllListeners...`);
        this.sock.ev.removeAllListeners();
        console.log(`[${ts}] [${shortId}] [disconnect()] Socket cleanup: ws.close()...`);
        this.sock.ws?.close();
        console.log(`[${ts}] [${shortId}] [disconnect()] Socket cleanup: sock.end()...`);
        this.sock.end(new Error('Manual disconnect'));
      } catch (err) {
        console.log(`[${ts}] [${shortId}] [disconnect()] Socket cleanup error: ${err.message}`);
      }
      this.sock = null;
      console.log(`[${ts}] [${shortId}] [disconnect()] Socket set to null`);
    }

    this.emit('status', this.state);
    this.log.info('Disconnected');
    console.log(`[${ts}] [${shortId}] [disconnect()] EXIT: success=true`);
    return { success: true };
  }

  async regenerateQR() {
      const ts = new Date().toISOString();
      const shortId = this.id.slice(0, 8);
      
      console.log(`[${ts}] [${shortId}] [regenerateQR()] ENTER: state=${this.state} connected=${this.connected} sock=${!!this.sock} qrCode=${!!this.qrCode} qrAttempts=${this.qrAttempts}`);
      
      if (
        this.state === 'connected' ||
        this.state === 'connecting' ||
        this.state === 'reconnecting'
      ) {
        console.log(`[${ts}] [${shortId}] [regenerateQR()] EXIT EARLY: Operation in progress (state=${this.state})`);
        return { error: 'QR regeneration already in progress' };
      }

      // Jangan kembalikan QR lama yang mungkin sudah expired.
      this.qrCode = null;
      console.log(`[${ts}] [${shortId}] [regenerateQR()] qrCode reset to null, calling disconnect()...`);
      await this.disconnect();
      
      console.log(`[${ts}] [${shortId}] [regenerateQR()] disconnect() completed. state=${this.state} sock=${!!this.sock}`);
      
      // Delete auth files to force new QR generation
      const authDir = path.join(config.sessionsPath, this.id, 'auth');
      const credsBeforeDelete = fs.existsSync(path.join(authDir, 'creds.json'));
      console.log(`[${ts}] [${shortId}] [regenerateQR()] PRE-DELETE AUTH: credsExists=${credsBeforeDelete}`);
      
      try {
        if (fs.existsSync(authDir)) {
          fs.removeSync(authDir);
          console.log(`[${ts}] [${shortId}] [regenerateQR()] Auth directory deleted`);
        }
      } catch (err) {
        console.log(`[${ts}] [${shortId}] [regenerateQR()] ERROR deleting auth: ${err.message}`);
        return { error: `Failed to delete auth: ${err.message}` };
      }
      
      const credsAfterDelete = fs.existsSync(path.join(authDir, 'creds.json'));
      console.log(`[${ts}] [${shortId}] [regenerateQR()] POST-DELETE AUTH: credsExists=${credsAfterDelete}`);
    
      // Connect and wait for QR to be generated
      console.log(`[${ts}] [${shortId}] [regenerateQR()] Calling connect()...`);
      const result = await this.connect();
      console.log(`[${ts}] [${shortId}] [regenerateQR()] connect() returned: ${JSON.stringify(result)}`);
      if (result?.error) {
        console.log(`[${ts}] [${shortId}] [regenerateQR()] EXIT: connect() returned error`);
        return result;
      }
    
      // Wait for QR to be generated (max 10 seconds)
      console.log(`[${ts}] [${shortId}] [regenerateQR()] qrCode after connect=${!!this.qrCode}`);
      if (!this.qrCode) {
        console.log(`[${ts}] [${shortId}] [regenerateQR()] No QR yet, waiting 10s with listener...`);
        try {
          await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
              console.log(`[${ts}] [${shortId}] [regenerateQR()] TIMEOUT: 10s elapsed, no QR received. state=${this.state} connected=${this.connected} sock=${!!this.sock}`);
              this.removeListener('qr', onQR);
              reject(new Error('QR generation timeout'));
            }, 10000);
          
            const onQR = (qr) => {
              const ts2 = new Date().toISOString();
              console.log(`[${ts2}] [${shortId}] [regenerateQR()] QR LISTENER FIRED: qrLength=${qr?.length}`);
              clearTimeout(timeout);
              this.removeListener('qr', onQR);
              resolve(qr);
            };
          
            this.once('qr', onQR);
            console.log(`[${ts}] [${shortId}] [regenerateQR()] QR listener registered on Session EventEmitter`);
          });
        } catch (err) {
          console.log(`[${ts}] [${shortId}] [regenerateQR()] ERROR: ${err.message}`);
          return { error: err.message };
        }
      }
    
      console.log(`[${ts}] [${shortId}] [regenerateQR()] EXIT: qrCode=${!!this.qrCode} qrAttempts=${this.qrAttempts}`);
      return { qrCode: this.qrCode, attempts: this.qrAttempts };
    }

    async getQRCode() {
      const ts = new Date().toISOString();
      const shortId = this.id.slice(0, 8);
      
      console.log(`[${ts}] [${shortId}] [getQRCode()] ENTER: state=${this.state} connected=${this.connected} qrCode=${!!this.qrCode}`);
      
      if (this.state === 'connected') {
        console.log(`[${ts}] [${shortId}] [getQRCode()] EXIT EARLY: Already connected`);
        return { error: 'Already connected' };
      }
      if (!this.qrCode) {
        // Trigger QR generation if not available
        if (this.state !== 'connecting') {
          console.log(`[${ts}] [${shortId}] [getQRCode()] No QR, calling connect()...`);
          await this.connect();
        } else {
          console.log(`[${ts}] [${shortId}] [getQRCode()] No QR, but state=connecting, skip connect()`);
        }
        // Wait briefly for QR to generate
        await new Promise(r => setTimeout(r, 1000));
        console.log(`[${ts}] [${shortId}] [getQRCode()] After 1s wait: qrCode=${!!this.qrCode}`);
      }
      console.log(`[${ts}] [${shortId}] [getQRCode()] EXIT: qrCode=${!!this.qrCode} qrAttempts=${this.qrAttempts}`);
      return { qrCode: this.qrCode, attempts: this.qrAttempts };
    }

    // ===== CONVERSATION INBOX METHODS =====

  async getConversationStatus(participant) {
    const botPausedBy = this.botPausedBy;
    let status = 'AUTO';
    
    if (botPausedBy === 'human') {
      status = 'HUMAN';
    } else if (botPausedBy) {
      status = 'PAUSED';
    }
    
    return {
      sessionId: this.id,
      participant,
      botStatus: status,
      botPausedBy,
      botEnabled: this.isBotEnabled(),
      lastMessage: this.messages.length > 0 ? this.messages[this.messages.length - 1].content : null
    };
  }

  async getConversationMessages(participant, count = 50) {
    // Try cache first
    if (this.messages.length > 0) {
      const messages = this.messages.filter(msg => {
        const jid = msg.from || msg.to || '';
        const participantJid = participant + '@s.whatsapp.net';
        return jid === participantJid || 
               jid === participant || 
               jid.split('@')[0] === participant;
      });
      if (messages.length > 0) {
        return messages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
      }
    }
    // Fall back to SQLite
    try {
      return await messageRepo.findByChat(this.id, participant, count);
    } catch (err) {
      this.log.error(`getConversationMessages DB error: ${err.message}`);
      return [];
    }
  }

  async getConversations() {
    // Try cache first
    if (this.messages.length > 0) {
      const participantMap = new Map();
      for (const msg of this.messages) {
        if (msg.isOutgoing) continue;
        const key = msg.user || msg.from || msg.to || 'unknown';
        if (!participantMap.has(key)) {
          participantMap.set(key, {
            name: key,
            avatar: null,
            lastMessage: msg.content,
            timestamp: msg.timestamp,
            unread: 0,
            botPausedBy: this.botPausedBy
          });
        }
      }
      if (participantMap.size > 0) {
        const result = Array.from(participantMap.values());
        result.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        return result;
      }
    }
    // Fall back to SQLite
    try {
      const lastMessages = await messageRepo.lastMessagePerChat(this.id);
      return lastMessages.map(msg => ({
        name: msg.user || msg.chat_id,
        avatar: null,
        lastMessage: msg.content,
        timestamp: msg.timestamp,
        unread: 0,
        botPausedBy: this.botPausedBy
      }));
    } catch (err) {
      this.log.error(`getConversations DB error: ${err.message}`);
      return [];
    }
  }

  async getAvatar(jid) {
    if (!this.sock) {
      return { avatar: null, error: 'Not connected' };
    }
    
    try {
      const url = await this.sock.profilePictureUrl(jid, 'image');
      return { avatar: url };
    } catch (err) {
      return { avatar: null, error: err.message };
    }
  }

  // ===== BOT CONTROL =====

  isBotEnabled() {
    return this.botEnabled === true;
  }

  async pauseBot(pausedBy = 'human') {
      this.botEnabled = false;
      this.botPausedBy = pausedBy;
      this.log.info(`Bot paused by ${pausedBy}`);
      this.emit('bot:state', { sessionId: this.id, botEnabled: false, botPausedBy: pausedBy });
      return { success: true, botEnabled: false, botPausedBy: pausedBy };
    }

    async resumeBot() {
      this.botEnabled = true;
      this.botPausedBy = null;
      this.log.info('Bot resumed');
      this.emit('bot:state', { sessionId: this.id, botEnabled: true, botPausedBy: null });
      return { success: true, botEnabled: true, botPausedBy: null };
    }

  // ===== STATUS =====

  getStatus() {
    const uptime = this.startTime 
      ? Math.floor((Date.now() - this.startTime.getTime()) / 1000) 
      : 0;

    return {
      id: this.id,
      name: this.options?.name || this.id.slice(0, 8),
      state: this.state,
      connected: this.connected,
      phoneNumber: this.phoneNumber,
      displayName: this.displayName,
      port: this.port,
      startTime: this.startTime?.toISOString() || null,
      lastActivity: this.lastActivity?.toISOString() || null,
      uptime,
      uptimeFormatted: this._formatUptime(uptime),
      qrCode: this.qrCode,
      qrAttempts: this.qrAttempts,
      reconnectAttempts: this.reconnectAttempts,
      batteryLevel: this.batteryLevel,
      pluggedIn: this.pluggedIn,
      messageCount: this.messages.length,
      autoReply: this.autoReply,
      typingDelay: this.typingDelay,
      readDelay: this.readDelay,
      holder: this.holder,
      botEnabled: this.botEnabled,
      botPausedBy: this.botPausedBy
    };
  }

  async getRecentMessages(count = 50) {
    if (this.messages.length === 0) {
      try {
        return await messageRepo.findRecent(this.id, count);
      } catch (err) {
        this.log.error(`getRecentMessages DB error: ${err.message}`);
        return [];
      }
    }
    return this.messages.slice(-count);
  }

  async getMessagesByDate(date) {
    const dateStr = typeof date === 'string' ? date : date.toISOString().split('T')[0];
    try {
      return await messageRepo.findByDate(this.id, dateStr);
    } catch (err) {
      this.log.error(`getMessagesByDate DB error: ${err.message}`);
      return [];
    }
  }

  async getChats() {
    if (!this.sock || !this.connected) return [];
    try {
      const chats = await this.sock.groupFetchAllParticipating();
      return Object.values(chats).map(c => ({
        id: c.id,
        name: c.subject,
        participants: c.participants?.length || 0
      }));
    } catch {
      return [];
    }
  }

  _formatUptime(seconds) {
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    const parts = [];
    if (d > 0) parts.push(`${d}d`);
    if (h > 0) parts.push(`${h}h`);
    if (m > 0) parts.push(`${m}m`);
    parts.push(`${s}s`);
    return parts.join(' ');
  }
}

module.exports = Session;