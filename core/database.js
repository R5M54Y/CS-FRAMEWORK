'use strict';

/**
 * Promisified SQLite3 database wrapper.
 * sqlite3 v6 is callback-based; await returns `this` (Database) not query results.
 * This wrapper ensures db.get/all/run return proper Promises with real data.
 */
const sqlite3 = require('sqlite3');
const path = require('path');

const dbPath = path.join(process.cwd(), 'data', 'cs-framework.db');

// Raw database (callback-style)
const _raw = new sqlite3.Database(dbPath, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
    process.exit(1);
  }
});

// Run PRAGMAs synchronously via serialize
_raw.serialize(() => {
  _raw.run('PRAGMA journal_mode = WAL');
  _raw.run('PRAGMA foreign_keys = ON');
});

// Promisified wrapper
const db = {
  /**
   * db.get(sql, [params]) => Promise<row|null>
   * Returns first matching row or null.
   */
  get(sql, params) {
    if (typeof sql !== 'string' || !sql) {
      return Promise.reject(new TypeError(`SQL query expected, got ${typeof sql}`));
    }
    return new Promise((resolve, reject) => {
      const cb = (err, row) => {
        if (err) reject(err);
        else resolve(row ?? null);
      };
      if (params !== undefined && params !== null) {
        _raw.get(sql, params, cb);
      } else {
        _raw.get(sql, cb);
      }
    });
  },

  /**
   * db.all(sql, [params]) => Promise<Array>
   * Returns array of rows (empty array if none).
   */
  all(sql, params) {
    if (typeof sql !== 'string' || !sql) {
      return Promise.reject(new TypeError(`SQL query expected, got ${typeof sql}`));
    }
    return new Promise((resolve, reject) => {
      const cb = (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      };
      if (params !== undefined && params !== null) {
        _raw.all(sql, params, cb);
      } else {
        _raw.all(sql, cb);
      }
    });
  },

  /**
   * db.run(sql, [params]) => Promise<{ changes, lastID }>
   * Returns changes info.
   */
  run(sql, params) {
    if (typeof sql !== 'string' || !sql) {
      return Promise.reject(new TypeError(`SQL query expected, got ${typeof sql}`));
    }
    return new Promise((resolve, reject) => {
      const cb = function (err) {
        if (err) reject(err);
        else resolve({ changes: this.changes, lastID: this.lastID });
      };
      if (params !== undefined && params !== null) {
        _raw.run(sql, params, cb);
      } else {
        _raw.run(sql, cb);
      }
    });
  },

  /**
   * db.close() => Promise<void>
   */
  close() {
    return new Promise((resolve, reject) => {
      _raw.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  },

  /**
   * db.serialize(fn) — delegates to raw db
   */
  serialize(fn) {
    _raw.serialize(fn);
  },

  /**
   * Access raw Database for debugging
   */
  _raw,
};

module.exports = db;
