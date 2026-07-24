'use strict';

const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const path = require('path');
const config = require('../config');

// Ensure logs directory
const fs = require('fs-extra');
fs.ensureDirSync(config.logsPath);

// Custom format
const customFormat = winston.format.printf(({ level, message, timestamp, sessionId, module: mod, ...rest }) => {
  let log = `${timestamp} [${level}]`;
  if (sessionId) log += ` [${sessionId}]`;
  if (mod) log += ` [${mod}]`;
  log += ` ${message}`;
  const extra = Object.keys(rest).length > 0 ? ' ' + JSON.stringify(rest) : '';
  return log + extra;
});

const timestampFormat = winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' });

// Transport: file rotation
const fileTransport = new DailyRotateFile({
  filename: path.join(config.logsPath, 'app-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  maxSize: config.logMaxSize,
  maxFiles: config.logMaxFiles,
  format: winston.format.combine(timestampFormat, customFormat)
});

// Transport: console
const consoleTransport = new winston.transports.Console({
  format: winston.format.combine(
    winston.format.colorize(),
    timestampFormat,
    customFormat
  )
});

// Main logger
const logger = winston.createLogger({
  level: config.logLevel,
  transports: [fileTransport, consoleTransport],
  exitOnError: false
});

// Create a child logger with session context
function createSessionLogger(sessionId, module = 'system') {
  return {
    info: (msg, meta = {}) => logger.info(msg, { sessionId, module, ...meta }),
    warn: (msg, meta = {}) => logger.warn(msg, { sessionId, module, ...meta }),
    error: (msg, meta = {}) => logger.error(msg, { sessionId, module, ...meta }),
    debug: (msg, meta = {}) => logger.debug(msg, { sessionId, module, ...meta })
  };
}

module.exports = { logger, createSessionLogger };
