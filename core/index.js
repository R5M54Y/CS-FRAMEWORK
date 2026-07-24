'use strict';

const SessionManager = require('./session-manager');
const Session = require('./session');
const storage = require('./storage');

// Singleton instance
const sessionManager = new SessionManager();

module.exports = {
  Session,
  SessionManager,
  sessionManager,
  ...storage
};
