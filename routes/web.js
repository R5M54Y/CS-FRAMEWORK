'use strict';

const express = require('express');
const path = require('path');
const router = express.Router();
const sessionManager = require('../core/session-manager');
const config = require('../config');
const QRCode = require('qrcode');

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
router.get('/session/:id', async (req, res) => {
  const session = sessionManager.getSession(req.params.id);
  if (!session) {
    return res.status(404).render('error', { 
      title: 'Not Found', 
      message: 'Session not found' 
    });
  }
  const status = session.getStatus();
  const titlePhone = status.phoneNumber || status.displayName || status.name || status.id.substring(0, 8);
  const qrImage = status.qrCode ? await QRCode.toDataURL(status.qrCode) : null;
  res.render('session-dashboard', {
    title: `Session ${titlePhone}`,
    session: { ...status, qrImage },
    config: {
      host: config.host,
      port: config.port
    }
  });
});

// Settings page
router.get('/settings', (req, res) => {
  const SettingsManager = require('../services/settings');
  const settingsManager = new SettingsManager();
  const settings = settingsManager.get();
  res.render('settings', {
    title: 'Settings',
    config,
    settings
  });
});

module.exports = router;