'use strict';

const EventEmitter = require('events');
const { createSessionLogger } = require('../utils/logger');

/**
 * AI Request Queue
 * In-memory, FIFO, async queue with configurable concurrency
 * Handles rate limiting, retries with exponential backoff, and timeouts
 */
class AIRequestQueue extends EventEmitter {
  constructor(options = {}) {
    super();
    this.concurrency = parseInt(options.concurrency, 10) || 3;
    this.timeout = parseInt(options.timeout, 10) || 60000;
    this.maxRetries = parseInt(options.maxRetries, 10) || 3;
    this.baseDelay = parseInt(options.baseDelay, 10) || 1000;
    this.maxDelay = parseInt(options.maxDelay, 10) || 30000;
    
    this.queue = [];
    this.active = new Map();
    this.stats = {
      pending: 0,
      active: 0,
      completed: 0,
      failed: 0,
      totalEnqueued: 0
    };
    
    this.log = createSessionLogger('ai-queue', 'ai-queue');
    this.processing = false;
  }

  /**
   * Enqueue an AI request
   * @param {Object} request - { id, sessionId, messages, metadata }
   * @returns {Promise<string>} Resolves with AI response or rejects with error
   */
  enqueue(request) {
    return new Promise((resolve, reject) => {
      const item = {
        id: request.id || `req-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        sessionId: request.sessionId,
        messages: request.messages,
        metadata: request.metadata || {},
        resolve,
        reject,
        retries: 0,
        createdAt: Date.now(),
        startedAt: null,
        completedAt: null
      };

      this.queue.push(item);
      this.stats.pending++;
      this.stats.totalEnqueued++;
      this._emitStats();
      
      this.log.debug(`Enqueued ${item.id}, queue length: ${this.queue.length}`);
      this._process();
    });
  }

  /**
   * Process queue - runs continuously while items available and concurrency allows
   */
  async _process() {
    if (this.processing) return;
    this.processing = true;

    while (this.queue.length > 0 && this.active.size < this.concurrency) {
      const item = this.queue.shift();
      this.stats.pending--;
      this.stats.active++;
      this._emitStats();
      
      this.active.set(item.id, item);
      item.startedAt = Date.now();
      
      // Process without blocking the queue
      this._execute(item).catch(() => {});
    }

    this.processing = false;
  }

  /**
   * Execute a single request with retries and timeout
   */
  async _execute(item) {
    const AIService = require('./ai');
    const ai = new AIService();
    
    const attempt = async (attemptNum) => {
      // Check timeout
      if (Date.now() - item.startedAt > this.timeout) {
        this._finishItem(item, null, new Error('AI request timeout'));
        return;
      }

      try {
        this.log.info(`Processing ${item.id} (attempt ${attemptNum + 1})`);
        const response = await ai.chat(item.messages);
        
        // Check if response indicates an error
        if (response && response.startsWith('[') && response.includes('Error')) {
          throw new Error(response);
        }
        
        this._finishItem(item, response, null);
      } catch (err) {
        if (attemptNum < this.maxRetries && this._isRetryable(err)) {
          item.retries = attemptNum + 1;
          const delay = Math.min(
            this.baseDelay * Math.pow(2, attemptNum),
            this.maxDelay
          );
          
          this.log.warn(
            `Request ${item.id} failed (attempt ${attemptNum + 1}/${this.maxRetries + 1}), ` +
            `retrying in ${delay}ms: ${err.message}`
          );
          
          await new Promise(r => setTimeout(r, delay));
          return attempt(attemptNum + 1);
        }
        
        this._finishItem(item, null, err);
      }
    };

    await attempt(0);
  }

  /**
   * Determine if an error is retryable
   */
  _isRetryable(err) {
    const message = (err.message || '').toLowerCase();
    return message.includes('429') || 
           message.includes('500') || 
           message.includes('502') || 
           message.includes('503') || 
           message.includes('504') ||
           message.includes('econnrefused') ||
           message.includes('etimedout') ||
           message.includes('timeout') ||
           message.includes('unavailable');
  }

  /**
   * Finish an item - update stats and call resolve/reject
   */
  _finishItem(item, response, error) {
    this.active.delete(item.id);
    this.stats.active--;
    item.completedAt = Date.now();
    
    if (error) {
      this.stats.failed++;
      this.log.error(`Request ${item.id} failed after ${item.retries + 1} attempts: ${error.message}`);
      item.reject(error);
    } else {
      this.stats.completed++;
      this.log.debug(`Request ${item.id} completed in ${item.completedAt - item.startedAt}ms`);
      item.resolve(response);
    }
    
    this._emitStats();
    setImmediate(() => this._process());
  }

  /**
   * Emit stats update event
   */
  _emitStats() {
    this.emit('stats', this.getStats());
  }

  /**
   * Get current queue statistics
   */
  getStats() {
    return {
      pending: this.stats.pending,
      active: this.stats.active,
      completed: this.stats.completed,
      failed: this.stats.failed,
      totalEnqueued: this.stats.totalEnqueued,
      queueLength: this.stats.pending + this.stats.active,
      concurrency: this.concurrency
    };
  }

  /**
   * Clear the queue
   */
  clear() {
    const items = this.queue.splice(0);
    for (const item of items) {
      item.reject(new Error('Queue cleared'));
    }
    this.stats.pending = 0;
    this._emitStats();
  }

  /**
   * Set concurrency dynamically
   */
  setConcurrency(concurrency) {
    this.concurrency = Math.max(1, parseInt(concurrency, 10));
    this._process();
  }
}

// Singleton instance
let instance = null;

function createQueue(options) {
  if (!instance) {
    instance = new AIRequestQueue(options);
  }
  return instance;
}

function getQueue() {
  return instance;
}

module.exports = { AIRequestQueue, createQueue, getQueue };