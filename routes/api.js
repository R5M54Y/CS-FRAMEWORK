'use strict';

const express = require('express');
const router = express.Router();
const controller = require('../controllers/mainController');

// Health
router.get('/health', controller.health);

// Runtime status
router.get('/runtime-status', controller.runtimeStatus);
router.get('/observability', controller.observability);

// Sessions
router.get('/sessions', controller.getSessions);
router.post('/session', controller.createSession);
router.get('/session/:id', controller.getSession);
router.put('/session/:id', controller.updateSession);
router.delete('/session/:id', controller.deleteSession);
router.post('/session/:id/connect', controller.connectSession);
router.post('/session/:id/disconnect', controller.disconnectSession);
router.post('/session/:id/reconnect', controller.reconnectSession);
router.post('/session/:id/restart', controller.restartSession);
router.get('/session/:id/qrcode', controller.getQRCode);
router.post('/session/:id/qrcode/regenerate', controller.regenerateQR);

// Messages
router.post('/session/:id/send', controller.sendMessage);
router.get('/session/:id/messages', controller.getMessages);
router.get('/session/:id/messages/date', controller.getMessagesByDate);
router.get('/session/:id/chats', controller.getChats);

// Conversation Inbox
router.get('/session/:id/conversations', controller.getConversations);
router.get('/session/:id/conversations/:jid/messages', controller.getConversationMessages);
router.get('/session/:id/conversations/status', controller.getConversationStatus);
router.post('/session/:id/conversations/reply', controller.sendHumanReply);
router.get('/session/:id/conversations/:jid/avatar', controller.getAvatar);

// Bot Control
router.post('/session/:id/bot/pause', controller.pauseBot);
router.post('/session/:id/bot/resume', controller.resumeBot);

// Profile
router.get('/session/:id/profile', controller.getProfile);
router.put('/session/:id/profile', controller.updateProfile);

// Persona
router.get('/session/:id/persona', controller.getPersona);
router.put('/session/:id/persona', controller.updatePersona);
router.put('/session/:id/persona/prompt', controller.savePersonaPrompt);

// Products
router.get('/session/:id/products', controller.getProducts);
router.get('/session/:id/products/search', controller.searchProducts);
router.post('/session/:id/products', controller.createProduct);
router.post('/session/:id/products/save', controller.saveProducts);
router.post('/session/:id/products/fetch', controller.fetchProduct);
router.get('/session/:id/products/:productId', controller.getProduct);
router.put('/session/:id/products/:productId', controller.updateProduct);
router.delete('/session/:id/products/:productId', controller.deleteProduct);

// Knowledge
router.get('/session/:id/knowledge', controller.getKnowledge);
router.get('/session/:id/knowledge/search', controller.searchKnowledge);
router.post('/session/:id/knowledge', controller.createKnowledge);
router.get('/session/:id/knowledge/:knowledgeId', controller.getKnowledgeItem);
router.put('/session/:id/knowledge/:knowledgeId', controller.updateKnowledge);
router.delete('/session/:id/knowledge/:knowledgeId', controller.deleteKnowledge);

// Settings
router.get('/settings', controller.getSettings);
router.put('/settings', controller.updateSettings);

// AI Gateway
router.post('/ai/test', controller.testAIGateway);
router.get('/ai/queue', controller.getAIQueueStats);

module.exports = router;