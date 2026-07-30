'use strict';

/**
 * MessageRepository — SQLite-backed persistence for conversation messages.
 *
 * SINGLE SOURCE OF TRUTH for all conversation history.
 * session.memory remains as a runtime cache only.
 *
 * Schema (auto-migrated in db-migrate.js):
 *
 *   messages_v2 (
 *     id               TEXT PRIMARY KEY,
 *     session_id       TEXT NOT NULL,
 *     chat_id          TEXT NOT NULL,       — phone number (sender or receiver) grouping conversations
 *     direction        TEXT NOT NULL,       — 'incoming' | 'outgoing'
 *     sender           TEXT NOT NULL DEFAULT '',
 *     receiver         TEXT NOT NULL DEFAULT '',
 *     message_type     TEXT NOT NULL DEFAULT 'text',
 *     content          TEXT NOT NULL DEFAULT '',
 *     media_url        TEXT,
 *     quoted_message_id TEXT,
 *     timestamp        TEXT NOT NULL,
 *     status           TEXT NOT NULL DEFAULT 'sent',  — 'sent' | 'delivered' | 'read' | 'failed'
 *     metadata         TEXT NOT NULL DEFAULT '{}'     — JSON blob for extensible fields
 *   )
 *
 * Indexes: session_id, chat_id, timestamp
 */

const db = require('../database');

const TABLE = 'messages_v2';

class MessageRepository {

  /**
   * Save a single message.
   * Returns the saved message with any DB-generated fields.
   */
  async save(msg) {
    const chatId = msg.chat_id || this._deriveChatId(msg);
    const direction = msg.direction || this._deriveDirection(msg);
    const sender = msg.sender || msg.from || '';
    const receiver = msg.receiver || msg.to || '';
    const messageType = msg.message_type || msg.type || 'text';
    const metadata = typeof msg.metadata === 'string' ? msg.metadata : JSON.stringify(msg.metadata || {});

    const sql = `
      INSERT INTO ${TABLE} (id, session_id, chat_id, direction, sender, receiver, message_type, content, media_url, quoted_message_id, timestamp, status, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        content = excluded.content,
        status = excluded.status,
        metadata = excluded.metadata
    `;

    await db.run(sql, [
      msg.id,
      msg.session_id,
      chatId,
      direction,
      sender,
      receiver,
      messageType,
      msg.content || '',
      msg.media_url || null,
      msg.quoted_message_id || null,
      msg.timestamp || new Date().toISOString(),
      msg.status || 'sent',
      metadata
    ]);

    return { ...msg, chat_id: chatId, direction, sender, receiver, message_type: messageType };
  }

  /**
   * Save multiple messages in a transaction.
   */
  async saveMany(messages) {
    if (!messages || messages.length === 0) return [];
    const results = [];
    await db.serialize(async () => {
      for (const msg of messages) {
        results.push(await this.save(msg));
      }
    });
    return results;
  }

  /**
   * Find messages for a chat (participant) within a session.
   * Ordered by timestamp ASC.
   */
  async findByChat(sessionId, chatId, limit = 50, offset = 0) {
    // chatId can be full JID or bare phone number
    const pattern = chatId.includes('@') ? chatId : `%${chatId}%`;
    const sql = `
      SELECT * FROM ${TABLE}
      WHERE session_id = ? AND (chat_id = ? OR sender LIKE ? OR receiver LIKE ?)
      ORDER BY timestamp ASC
      LIMIT ? OFFSET ?
    `;
    const rows = await db.all(sql, [sessionId, chatId, pattern, pattern, limit, offset]);
    return rows.map(row => this._toMessage(row));
  }

  /**
   * Find messages for a specific chat (exact chat_id match) — optimized for AI history.
   * No LIKE pattern matching, uses indexed chat_id column directly.
   */
  async findByChatForHistory(sessionId, chatId, limit = 20) {
    const sql = `
      SELECT * FROM ${TABLE}
      WHERE session_id = ? AND chat_id = ?
      ORDER BY timestamp ASC
      LIMIT ?
    `;
    const rows = await db.all(sql, [sessionId, chatId, limit]);
    return rows.map(row => this._toMessage(row));
  }

  /**
   * Find all messages for a session.
   * Ordered by timestamp ASC.
   */
  async findBySession(sessionId, limit = 200, offset = 0) {
    const sql = `
      SELECT * FROM ${TABLE}
      WHERE session_id = ?
      ORDER BY timestamp ASC
      LIMIT ? OFFSET ?
    `;
    const rows = await db.all(sql, [sessionId, limit, offset]);
    return rows.map(row => this._toMessage(row));
  }

  /**
   * Get the most recent messages for a session (for cache warming / dashboard).
   */
  async findRecent(sessionId, limit = 50) {
    const sql = `
      SELECT * FROM ${TABLE}
      WHERE session_id = ?
      ORDER BY timestamp DESC
      LIMIT ?
    `;
    const rows = await db.all(sql, [sessionId, limit]);
    return rows.map(row => this._toMessage(row)).reverse();
  }

  /**
   * Search messages by content within a session.
   */
  async search(sessionId, query, limit = 50) {
    const sql = `
      SELECT * FROM ${TABLE}
      WHERE session_id = ? AND content LIKE ?
      ORDER BY timestamp DESC
      LIMIT ?
    `;
    const pattern = `%${query}%`;
    const rows = await db.all(sql, [sessionId, pattern, limit]);
    return rows.map(row => this._toMessage(row));
  }

  /**
   * Count unread messages for a chat.
   * "Unread" = incoming messages with status = 'sent' (not yet delivered/read) or explicit unread flag in metadata.
   */
  async countUnread(sessionId, chatId) {
    const sql = `
      SELECT COUNT(*) as cnt FROM ${TABLE}
      WHERE session_id = ? AND chat_id = ? AND direction = 'incoming' AND status = 'sent'
    `;
    const row = await db.get(sql, [sessionId, chatId]);
    return row ? row.cnt : 0;
  }

  /**
   * Get the last message for each unique chat_id within a session.
   * Used to build the conversation list.
   */
  async lastMessagePerChat(sessionId) {
    // SQLite: get the latest message per chat_id using GROUP BY
    const sql = `
      SELECT m.* FROM ${TABLE} m
      INNER JOIN (
        SELECT chat_id, MAX(timestamp) as max_ts
        FROM ${TABLE}
        WHERE session_id = ?
        GROUP BY chat_id
      ) latest ON m.chat_id = latest.chat_id AND m.timestamp = latest.max_ts
      WHERE m.session_id = ?
      ORDER BY m.timestamp DESC
    `;
    const rows = await db.all(sql, [sessionId, sessionId]);
    return rows.map(row => this._toMessage(row));
  }

  /**
   * Count total messages in a session.
   */
  async count(sessionId) {
    const sql = 'SELECT COUNT(*) as cnt FROM ' + TABLE + ' WHERE session_id = ?';
    const row = await db.get(sql, [sessionId]);
    return row ? row.cnt : 0;
  }

  /**
   * Count unique chats in a session.
   */
  async countChats(sessionId) {
    const sql = 'SELECT COUNT(DISTINCT chat_id) as cnt FROM ' + TABLE + ' WHERE session_id = ?';
    const row = await db.get(sql, [sessionId]);
    return row ? row.cnt : 0;
  }

  /**
   * Get messages for a specific date range (used by getMessagesByDate).
   */
  async findByDate(sessionId, dateStr) {
    // dateStr is YYYY-MM-DD
    const sql = `
      SELECT * FROM ${TABLE}
      WHERE session_id = ? AND timestamp >= ? AND timestamp < ?
      ORDER BY timestamp ASC
    `;
    const start = `${dateStr}T00:00:00.000Z`;
    const end = `${dateStr}T23:59:59.999Z`;
    const rows = await db.all(sql, [sessionId, start, end]);
    return rows.map(row => this._toMessage(row));
  }

  /**
   * Delete a single message by ID.
   */
  async delete(messageId) {
    await db.run('DELETE FROM ' + TABLE + ' WHERE id = ?', [messageId]);
  }

  /**
   * Delete all messages for a session.
   */
  async deleteSession(sessionId) {
    await db.run('DELETE FROM ' + TABLE + ' WHERE session_id = ?', [sessionId]);
  }

  /**
   * Delete all messages for a session and return deleted count.
   */
  async clearSession(sessionId) {
    const result = await db.run('DELETE FROM ' + TABLE + ' WHERE session_id = ?', [sessionId]);
    return result ? result.changes : 0;
  }

  // ===== HELPERS =====

  _deriveChatId(msg) {
    // Chat_id is the phone number of the other party (not the bot)
    if (msg.chat_id) return msg.chat_id;
    if (msg.user) return msg.user;
    if (msg.from && msg.direction !== 'outgoing') return msg.from.split('@')[0];
    if (msg.to) return msg.to.split('@')[0];
    return 'unknown';
  }

  _deriveDirection(msg) {
    if (msg.direction) return msg.direction;
    if (msg.isOutgoing) return 'outgoing';
    if (msg.fromMe) return 'outgoing';
    if (msg.from) return 'incoming';
    return 'incoming';
  }

  _toMessage(row) {
    return {
      id: row.id,
      session_id: row.session_id,
      chat_id: row.chat_id,
      direction: row.direction,
      sender: row.sender,
      receiver: row.receiver,
      content: row.content,
      type: row.message_type,
      message_type: row.message_type,
      from: row.direction === 'incoming' ? row.sender : '',
      to: row.direction === 'outgoing' ? row.receiver : '',
      user: row.chat_id,
      isOutgoing: row.direction === 'outgoing',
      isGroup: false,
      media_url: row.media_url,
      quoted_message_id: row.quoted_message_id,
      timestamp: row.timestamp,
      status: row.status,
      metadata: row.metadata ? this._parseJson(row.metadata) : {},
      fromMe: row.direction === 'outgoing'
    };
  }

  _parseJson(str) {
    if (!str || str === '{}') return {};
    try { return JSON.parse(str); } catch { return {};
    }
  }
}

module.exports = new MessageRepository();
