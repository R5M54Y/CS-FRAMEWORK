'use strict';

const path = require('path');
const dotenv = require('dotenv');

// Load .env from project root
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const config = {
  // Server
  port: parseInt(process.env.PORT, 10) || 3000,
  host: process.env.HOST || '0.0.0.0',
  nodeEnv: process.env.NODE_ENV || 'production',

  // Session ports
  sessionPortStart: parseInt(process.env.SESSION_PORT_START, 10) || 3100,
  sessionPortEnd: parseInt(process.env.SESSION_PORT_END, 10) || 3200,

  // Paths
  dataPath: path.resolve(__dirname, '..', process.env.DATA_PATH || './data'),
  sessionsPath: path.resolve(__dirname, '..', process.env.SESSIONS_PATH || './sessions'),
  logsPath: path.resolve(__dirname, '..', process.env.LOGS_PATH || './logs'),
  tempPath: path.resolve(__dirname, '..', process.env.TEMP_PATH || './temp'),
  viewsPath: path.resolve(__dirname, '..', 'views'),
  publicPath: path.resolve(__dirname, '..', 'public'),

  // Baileys
  baileysLogLevel: process.env.BAILEYS_LOG_LEVEL || 'silent',
  connectionTimeout: parseInt(process.env.CONNECTION_TIMEOUT, 10) || 60000,
  qrTimeout: parseInt(process.env.QR_TIMEOUT, 10) || 45000,
  reconnectDelay: parseInt(process.env.RECONNECT_DELAY, 10) || 5000,
  maxReconnectAttempts: parseInt(process.env.MAX_RECONNECT_ATTEMPTS, 10) || 10,

  // Message
  defaultTypingDelay: parseInt(process.env.DEFAULT_TYPING_DELAY, 10) || 1000,
  defaultReadDelay: parseInt(process.env.DEFAULT_READ_DELAY, 10) || 500,
  maxReplyLength: parseInt(process.env.MAX_REPLY_LENGTH, 10) || 4096,
  autoReply: process.env.AUTO_REPLY === 'true',

  // Logging
  logLevel: process.env.LOG_LEVEL || 'info',
  logMaxSize: process.env.LOG_MAX_SIZE || '20m',
  logMaxFiles: parseInt(process.env.LOG_MAX_FILES, 10) || 14,

  // AI Gateway
  aiEndpoint: process.env.AI_ENDPOINT || 'http://localhost:20128/v1',
  aiApiKey: process.env.AI_API_KEY || '',
  aiModel: process.env.AI_MODEL || 'gpt-4.1',

  // AI Queue
  aiQueueConcurrency: parseInt(process.env.AI_QUEUE_CONCURRENCY, 10) || 3,
  aiRequestTimeout: parseInt(process.env.AI_REQUEST_TIMEOUT, 10) || 60000,
  aiQueueMaxRetries: parseInt(process.env.AI_QUEUE_MAX_RETRIES, 10) || 3,
  aiQueueBaseDelay: parseInt(process.env.AI_QUEUE_BASE_DELAY, 10) || 1000,
  aiQueueMaxDelay: parseInt(process.env.AI_QUEUE_MAX_DELAY, 10) || 30000,

  // Features
  enableQrTerminal: process.env.ENABLE_QR_TERMINAL !== 'false',
  enableQrWeb: process.env.ENABLE_QR_WEB !== 'false',
  enableRealtime: process.env.ENABLE_REALTIME !== 'false',
  enableProducts: process.env.ENABLE_PRODUCTS !== 'false',
  enableKnowledge: process.env.ENABLE_KNOWLEDGE !== 'false',
  enablePersona: process.env.ENABLE_PERSONA !== 'false',

  // Humanizer
  humanizer: {
    enabled: process.env.HUMANIZER_ENABLED !== 'false',
    typing: {
      min: parseInt(process.env.HUMANIZER_TYPING_MIN, 10) || 800,
      max: parseInt(process.env.HUMANIZER_TYPING_MAX, 10) || 5000,
      speedWPM: parseInt(process.env.HUMANIZER_TYPING_SPEED_WPM, 10) || 28,
    },
    readDelay: {
      min: parseInt(process.env.HUMANIZER_READ_DELAY_MIN, 10) || 300,
      max: parseInt(process.env.HUMANIZER_READ_DELAY_MAX, 10) || 1200,
    },
    splitMessage: {
      enabled: process.env.HUMANIZER_SPLIT_ENABLED !== 'false',
      maxMessages: parseInt(process.env.HUMANIZER_SPLIT_MAX, 10) || 3,
    },
    randomPause: {
      enabled: process.env.HUMANIZER_PAUSE_ENABLED !== 'false',
      min: parseInt(process.env.HUMANIZER_PAUSE_MIN, 10) || 200,
      max: parseInt(process.env.HUMANIZER_PAUSE_MAX, 10) || 1500,
    },
    queue: {
      maxConcurrent: parseInt(process.env.HUMANIZER_QUEUE_MAX_CONCURRENT, 10) || 1,
      minTime: parseInt(process.env.HUMANIZER_QUEUE_MIN_TIME, 10) || 500,
    },
  },

  // Derived
  get isDev() { return this.nodeEnv === 'development'; },
  get isProd() { return this.nodeEnv === 'production'; }
};

module.exports = config;
