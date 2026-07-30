'use strict';

/**
 * Data migration — imports existing JSON data into SQLite.
 * Idempotent: checks for existing records before inserting.
 */
const path = require('path');
const fs = require('fs-extra');
const config = require('../config');
const db = require('./database');
const { createSessionLogger } = require('../utils/logger');

const log = createSessionLogger('migrate', 'db-migrate');

async function migrateAll() {
  log.info('Starting data migration...');

  // Check migration completion marker
  const marker = await db.get("SELECT value FROM settings WHERE key = 'schema_version'");
  if (marker && marker.value === '2') {
    log.info('Migration already complete (schema_version=2), skipping');
    return { success: true, skipped: true };
  }

  // Phase 1: Ensure messages_v2 table exists (conversation source of truth)
  await _ensureMessagesV2Table();

  // Phase 2: Migrate existing JSON data into SQLite
  await _migrateSessions();
  await _migrateProfileFiles();
  await _migratePersonaFiles();
  await _migrateProductFiles();
  await _migrateKnowledgeFiles();
  await _migrateSettings();

  // Phase 3: Migrate existing JSON message files into messages_v2
  await _migrateMessagesFromJson();

  // Write completion marker
  await db.run(
    "INSERT INTO settings (key, value, updated_at) VALUES ('schema_version', '2', datetime('now')) ON CONFLICT(key) DO UPDATE SET value='2', updated_at=datetime('now')"
  );

  log.info('Migration complete (schema_version=2)');
  return { success: true };
}

async function _ensureMessagesV2Table() {
  log.info('Ensuring messages_v2 table exists...');
  await db.run(`
    CREATE TABLE IF NOT EXISTS messages_v2 (
      id                TEXT PRIMARY KEY,
      session_id        TEXT NOT NULL,
      chat_id           TEXT NOT NULL,
      direction         TEXT NOT NULL DEFAULT 'incoming',
      sender            TEXT NOT NULL DEFAULT '',
      receiver          TEXT NOT NULL DEFAULT '',
      message_type      TEXT NOT NULL DEFAULT 'text',
      content           TEXT NOT NULL DEFAULT '',
      media_url         TEXT,
      quoted_message_id TEXT,
      timestamp         TEXT NOT NULL,
      status            TEXT NOT NULL DEFAULT 'sent',
      metadata          TEXT NOT NULL DEFAULT '{}'
    )
  `);
  // Create indexes (IF NOT EXISTS for indexes requires per-index check)
  const existing = await db.all("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='messages_v2'");
  const indexNames = existing.map(r => r.name);
  if (!indexNames.includes('idx_m2_session')) {
    await db.run('CREATE INDEX IF NOT EXISTS idx_m2_session ON messages_v2(session_id)');
  }
  if (!indexNames.includes('idx_m2_chat')) {
    await db.run('CREATE INDEX IF NOT EXISTS idx_m2_chat ON messages_v2(chat_id)');
  }
  if (!indexNames.includes('idx_m2_timestamp')) {
    await db.run('CREATE INDEX IF NOT EXISTS idx_m2_timestamp ON messages_v2(timestamp)');
  }
  // Composite index for ORDER BY timestamp within a session (avoids temp B-TREE)
  if (!indexNames.includes('idx_m2_session_ts')) {
    await db.run('CREATE INDEX IF NOT EXISTS idx_m2_session_ts ON messages_v2(session_id, timestamp)');
  }
  log.info('messages_v2 table ready');
}

async function _migrateSessions() {
  const indexPath = path.join(config.dataPath, 'sessions', 'index.json');
  if (!fs.existsSync(indexPath)) return;

  let sessions = [];
  try {
    const raw = fs.readJsonSync(indexPath);
    sessions = Array.isArray(raw) ? raw : (raw.sessions || []);
  } catch { return; }

  for (const s of sessions) {
    if (!s || !s.id) continue;
    const existing = await db.get('SELECT id FROM sessions WHERE id = ?', [s.id]);
    if (existing) continue;

    await db.run(
      `INSERT INTO sessions (id, name, port, auto_reconnect, auto_reply, typing_delay, read_delay, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      [s.id, s.name || '', s.port || null, s.autoReconnect !== false ? 1 : 0,
       s.autoReply !== false ? 1 : 0, s.typingDelay || 1000, s.readDelay || 500]
    );
    log.info(`Migrated session: ${s.id} (${s.name})`);
  }
  log.info(`Migrated ${sessions.length} sessions`);
}

async function _migrateProfileFiles() {
  const profilesDir = path.join(config.dataPath, 'profiles');
  if (!fs.existsSync(profilesDir)) return;

  const files = fs.readdirSync(profilesDir).filter(f => f.endsWith('.json') && f !== 'index.json');
  let count = 0;
  for (const file of files) {
    try {
      const data = fs.readJsonSync(path.join(profilesDir, file));
      const sessionId = data.id || path.basename(file, '.json');
      const existing = await db.get('SELECT id FROM profiles WHERE id = ?', [sessionId]);
      if (existing) continue;

      await db.run(
        `INSERT INTO profiles (id, session_id, name, description, agent_name, company_name, greeting_message, status, persona_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
        [sessionId, sessionId, data.name || '', data.description || '', data.agentName || '',
         data.companyName || '', data.greetingMessage || '', data.status || 'disconnected', data.personaId || null]
      );
      count++;
    } catch { /* skip corrupt files */ }
  }
  log.info(`Migrated ${count} profiles`);
}

async function _migratePersonaFiles() {
  const personasDir = path.join(config.dataPath, 'personas');
  if (!fs.existsSync(personasDir)) return;

  const files = fs.readdirSync(personasDir).filter(f => f.endsWith('.json') && f !== 'index.json');
  let count = 0;
  for (const file of files) {
    try {
      const data = fs.readJsonSync(path.join(personasDir, file));
      const pid = data.id || `pers-${Date.now()}-${count}`;
      const existing = await db.get('SELECT id FROM personas WHERE id = ?', [pid]);
      if (existing) continue;

      await db.run(
        `INSERT INTO personas (id, session_id, name, prompt, role, tone, guidelines, greeting, fallback, forbidden_topics, allowed_topics, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
        [pid, data.sessionId || null, data.name || '', data.prompt || '', data.role || 'Customer Service',
         data.tone || 'friendly', JSON.stringify(data.guidelines || []), data.greeting || null,
         data.fallback || null, JSON.stringify(data.forbiddenTopics || []), JSON.stringify(data.allowedTopics || [])]
      );
      count++;
    } catch { /* skip */ }
  }
  log.info(`Migrated ${count} personas`);
}

async function _migrateProductFiles() {
  const productsDir = path.join(config.dataPath, 'products');
  if (!fs.existsSync(productsDir)) return;

  const files = fs.readdirSync(productsDir).filter(f => f.endsWith('.json'));
  let count = 0;
  for (const file of files) {
    try {
      const items = fs.readJsonSync(path.join(productsDir, file));
      const sessionId = path.basename(file, '.json');
      if (!Array.isArray(items)) continue;

      for (const p of items) {
        if (!p.name) continue;
        const id = p.id || `prod-${Date.now()}-${count}`;
        const existing = await db.get('SELECT id FROM products WHERE id = ?', [id]);
        if (existing) continue;

        await db.run(
          `INSERT INTO products (id, session_id, name, description, price, stock, category, image, discount, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
          [id, sessionId, p.name, p.description || '', parseInt(p.price) || 0,
           parseInt(p.stock) || 0, p.category || 'general', p.image || null, p.discount || null]
        );
        count++;
      }
    } catch { /* skip */ }
  }
  log.info(`Migrated ${count} products`);
}

async function _migrateKnowledgeFiles() {
  const knowledgeDir = path.join(config.dataPath, 'knowledge');
  if (!fs.existsSync(knowledgeDir)) return;

  const files = fs.readdirSync(knowledgeDir).filter(f => f.endsWith('.json'));
  let count = 0;
  for (const file of files) {
    try {
      const items = fs.readJsonSync(path.join(knowledgeDir, file));
      const sessionId = path.basename(file, '.json');
      if (!Array.isArray(items)) continue;

      for (const k of items) {
        const id = k.id || `kn-${Date.now()}-${count}`;
        const existing = await db.get('SELECT id FROM knowledge_base WHERE id = ?', [id]);
        if (existing) continue;

        await db.run(
          `INSERT INTO knowledge_base (id, session_id, title, content, category, keywords, created_at)
           VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
          [id, sessionId, k.title || '', k.content || '', k.category || 'Umum',
           JSON.stringify(k.keywords || [])]
        );
        count++;
      }
    } catch { /* skip */ }
  }
  log.info(`Migrated ${count} knowledge items`);
}

async function _migrateSettings() {
  const settingsFile = path.join(config.dataPath, 'settings.json');
  if (!fs.existsSync(settingsFile)) return;

  try {
    const data = fs.readJsonSync(settingsFile);
    const existing = await db.get("SELECT key FROM settings WHERE key = 'global'");
    if (!existing) {
      await db.run(
        "INSERT INTO settings (key, value, updated_at) VALUES ('global', ?, datetime('now'))",
        [JSON.stringify(data)]
      );
      log.info('Migrated global settings');
    }
  } catch { /* skip */ }
}

async function _migrateMessagesFromJson() {
  // Migrate existing messages from JSON files into messages_v2
  const sessionsDir = config.sessionsPath;
  if (!fs.existsSync(sessionsDir)) return;

  const sessionDirs = fs.readdirSync(sessionsDir).filter(d => {
    const dataDir = path.join(sessionsDir, d, 'data');
    return fs.existsSync(dataDir) && fs.statSync(dataDir).isDirectory();
  });

  let totalMigrated = 0;
  for (const sessionId of sessionDirs) {
    const dataDir = path.join(sessionsDir, sessionId, 'data');
    const files = fs.readdirSync(dataDir).filter(f => f.startsWith('messages-') && f.endsWith('.json'));
    if (files.length === 0) continue;

    for (const file of files) {
      try {
        const messages = fs.readJsonSync(path.join(dataDir, file));
        if (!Array.isArray(messages)) continue;

        for (const msg of messages) {
          // Skip if already exists in messages_v2
          if (msg.id) {
            const existing = await db.get('SELECT id FROM messages_v2 WHERE id = ?', [msg.id]);
            if (existing) continue;
          }

          const chatId = msg.user || (msg.from ? msg.from.split('@')[0] : (msg.to ? msg.to.split('@')[0] : 'unknown'));
          const direction = msg.isOutgoing ? 'outgoing' : 'incoming';
          const sender = direction === 'incoming' ? (msg.from || '') : (msg.to || '');
          const receiver = direction === 'outgoing' ? (msg.to || '') : (msg.from || '');

          await db.run(
            `INSERT INTO messages_v2 (id, session_id, chat_id, direction, sender, receiver, message_type, content, timestamp, status, metadata)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              msg.id || `mig-${Date.now()}-${totalMigrated}`,
              sessionId,
              chatId,
              direction,
              sender,
              receiver,
              msg.type || 'text',
              msg.content || '',
              msg.timestamp || new Date().toISOString(),
              direction === 'outgoing' ? 'sent' : 'delivered',
              JSON.stringify({ isGroup: !!msg.isGroup, migratedFrom: file })
            ]
          );
          totalMigrated++;
        }
      } catch (err) {
        log.warn(`Failed to migrate ${file}: ${err.message}`);
      }
    }
  }

  if (totalMigrated > 0) {
    log.info(`Migrated ${totalMigrated} messages from JSON files into messages_v2`);
  }
}

module.exports = { migrateAll };
