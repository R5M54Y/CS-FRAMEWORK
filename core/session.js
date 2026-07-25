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
    this.startTime = null;
    this.phoneNumber = null;
    this.displayName = null;
    this.lastActivity = null;
    this.batteryLevel = null;
    this.pluggedIn = false;
    this.messages = [];
    this.maxMessages = 200;
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
    this.botPausedBy = null; // Track who paused the bot

    this._setupConnectionHandlers();
    this.log.info(`Session ${sessionId} initialized`);
  }

  async connect() {
    if (this.state === 'connecting' || this.state === 'connected') {
      this.log.warn('Already connecting/connected');
      return { error: 'Already connecting or connected' };
    }

    this.state = 'connecting';
    this.emit('status', this.state);
    this.log.info('Connecting...');

    try {
      const { version, isLatest } = await fetchLatestBaileysVersion();
      this.log.info(`Using Baileys v${version.join('.')}, latest: ${isLatest}`);

      const sessionDir = path.join(config.sessionsPath, this.id);
      fs.ensureDirSync(sessionDir);
      fs.ensureDirSync(path.join(sessionDir, 'auth'));
      fs.ensureDirSync(path.join(sessionDir, 'data'));

      const { state: authState, saveCreds } = await useMultiFileAuthState(
        path.join(sessionDir, 'auth')
      );

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

      // Store saveCreds for later
      this.saveCreds = saveCreds;

      this._attachSocketHandlers();

      return { success: true, qrCode: this.qrCode };

    } catch (err) {
      this.state = 'error';
      this.log.error(`Connection error: ${err.message}`);
      this.emit('status', this.state);
      this.emit('error', err);
      return { error: err.message };
    }
  }

  _attachSocketHandlers() {
    if (!this.sock) return;

    // QR Code
    this.sock.ev.on('creds.update', () => {
      if (this.saveCreds) this.saveCreds();
    });

    this.sock.ev.on('connection.update', (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        this.qrCode = qr;
        this.qrAttempts++;
        this.emit('qr', qr);
        this.log.info(`QR code generated (attempt ${this.qrAttempts})`);
      }

      if (connection === 'open') {
        this.state = 'connected';
        this.connected = true;
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
      }

      if (connection === 'close') {
        this.connected = false;
        const statusCode = lastDisconnect?.error?.output?.statusCode || 500;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut
          && statusCode !== DisconnectReason.badSession
          && statusCode !== 403; // Forbidden by server

        if (statusCode === DisconnectReason.loggedOut) {
          this.state = 'disconnected';
          this.log.warn('Logged out from WhatsApp');
          this.emit('status', this.state);
          this.emit('loggedOut');
          this.disconnect();
          return;
        }

        if (shouldReconnect) {
          this.state = 'reconnecting';
          this.emit('status', this.state);
          this.log.info(`Disconnected (code: ${statusCode}), reconnecting in ${config.reconnectDelay}ms...`);
          this.reconnectAttempts++;
          if (this.reconnectAttempts <= config.maxReconnectAttempts) {
            this.reconnectTimer = setTimeout(() => this.connect(), config.reconnectDelay);
          } else {
            this.state = 'disconnected';
            this.emit('status', this.state);
            this.log.error('Max reconnect attempts reached');
          }
        } else {
          this.state = 'disconnected';
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
          await this._handleIncomingMessage(m);
        }
      }
    });

    // Presence
    this.sock.ev.on('presence.update', (update) => {
      this.emit('presence', update);
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

    // Save message to file
    this._saveMessage(message);

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
        isOutgoing: true
      };

      this.messages.push(outgoing);
      if (this.messages.length > this.maxMessages) {
        this.messages.shift();
      }
      this._saveMessage(outgoing);
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
    this.connected = false;
    this.state = 'disconnected';
    
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.sock) {
      try {
        this.sock.ev.removeAllListeners();
        this.sock.ws?.close();
        this.sock.end(new Error('Manual disconnect'));
      } catch (err) {
        // Ignore
      }
      this.sock = null;
    }

    this.emit('status', this.state);
    this.log.info('Disconnected');
    return { success: true };
  }

  async regenerateQR() {
      if (this.state === 'connected') {
        return { error: 'Already connected' };
      }

      // Jangan kembalikan QR lama yang mungkin sudah expired.
      this.qrCode = null;
      await this.disconnect();
    
      // Connect and wait for QR to be generated
      const result = await this.connect();
      if (result?.error) return result;
    
      // Wait for QR to be generated (max 10 seconds)
      if (!this.qrCode) {
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            this.removeListener('qr', onQR);
            reject(new Error('QR generation timeout'));
          }, 10000);
        
          const onQR = (qr) => {
            clearTimeout(timeout);
            this.removeListener('qr', onQR);
            resolve(qr);
          };
        
          this.once('qr', onQR);
        });
      }
    
      return { qrCode: this.qrCode, attempts: this.qrAttempts };
    }

    async getQRCode() {
      if (this.state === 'connected') {
        return { error: 'Already connected' };
      }
      if (!this.qrCode) {
        // Trigger QR generation if not available
        if (this.state !== 'connecting') {
          await this.connect();
        }
        // Wait briefly for QR to generate
        await new Promise(r => setTimeout(r, 1000));
      }
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
    // Filter messages for this participant
    const messages = this.messages.filter(msg => {
      const jid = msg.from || msg.to || '';
      const participantJid = participant + '@s.whatsapp.net';
      
      // Match exact JID or phone number
      return jid === participantJid || 
             jid === participant || 
             jid.split('@')[0] === participant;
    });
    
    return messages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  }

  async getConversations() {
    // Build conversation list from messages
    const participantMap = new Map();
    
    for (const msg of this.messages) {
      if (msg.isOutgoing) continue; // Skip outgoing messages for conversation tracking
      
      const key = msg.user || msg.from || msg.to || `unknown`;
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
    
    // Convert to array and sort by timestamp (newest first)
    const result = Array.from(participantMap.values());
    result.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    return result;
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
    this.emit('bot:state', { sessionId: this.id, botEnabled: false, pausedBy });
    return { success: true, botEnabled: false, pausedBy };
  }

  async resumeBot() {
    this.botEnabled = true;
    this.botPausedBy = null;
    this.log.info('Bot resumed');
    this.emit('bot:state', { sessionId: this.id, botEnabled: true, pausedBy: null });
    return { success: true, botEnabled: true };
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
      botEnabled: this.botEnabled,
      botPausedBy: this.botPausedBy
    };
  }

  getRecentMessages(count = 50) {
    return this.messages.slice(-count);
  }

  async getMessagesByDate(date) {
    const dateStr = typeof date === 'string' ? date : date.toISOString().split('T')[0];
    const file = path.join(config.sessionsPath, this.id, 'data', `messages-${dateStr}.json`);
    if (!fs.existsSync(file)) return [];
    try {
      return fs.readJsonSync(file);
    } catch {
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