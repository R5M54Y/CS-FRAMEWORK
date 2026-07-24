'use strict';

const express = require('express');
const path = require('path');
const router = express.Router();
const sessionManager = require('../core/session-manager');
const config = require('../config');

// Main dashboard
router.get('/', (req, res) => {
  const sessions = sessionManager.getAllSessions();
  res.render('dashboard', {
    title: 'WhatsApp CS Framework',
    sessions,
    config: {
      host: config.host,
      port: config.port
    }
  });
});

// Session dashboard
router.get('/session/:id', (req, res) => {
  const session = sessionManager.getSession(req.params.id);
  if (!session) {
    return res.status(404).render('error', { 
      title: 'Not Found', 
      message: 'Session not found' 
    });
  }
  const status = session.getStatus();
  res.render('session-dashboard', {
    title: `Session ${status.phoneNumber}`,
    session: status,
    config: {
      host: config.host,
      port: config.port
    }
  });
});

// Settings page
router.get('/settings', (req, res) => {
  res.render('settings', {
    title: 'Settings',
    config
  });
});

module.exports = router;