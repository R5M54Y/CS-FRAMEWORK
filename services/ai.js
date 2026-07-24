'use strict';

const axios = require('axios');
const { createSessionLogger } = require('../utils/logger');

/**
 * AI Service — single gateway for all LLM communication
 * Only this module talks to the AI provider.
 */
class AIService {
  constructor(options = {}) {
    this.endpoint = options.endpoint || process.env.AI_ENDPOINT || 'http://localhost:20128/v1';
    this.apiKey = options.apiKey || process.env.AI_API_KEY || '';
    this.model = options.model || process.env.AI_MODEL || 'gpt-4.1';
    this.timeout = options.timeout || 30000;
    this.maxRetries = options.maxRetries || 2;
    this.log = createSessionLogger('ai', 'ai-service');
  }

  /**
   * Send a chat completion request to the AI Gateway
   * @param {Array} messages - Array of {role, content} messages
   * @param {Object} [options] - Optional overrides
   * @returns {Promise<string>} The response text
   */
  async chat(messages, options = {}) {
    const model = options.model || this.model;
    const url = `${this.endpoint}/chat/completions`;
    
    const payload = {
      model,
      messages
    };

    const headers = {
      'Content-Type': 'application/json'
    };
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    let lastError = null;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          this.log.info(`Retry attempt ${attempt}/${this.maxRetries}`);
          await new Promise(r => setTimeout(r, 1000 * attempt));
        }

        const response = await axios.post(url, payload, {
          headers,
          timeout: this.timeout,
          validateStatus: status => status < 500
        });

        if (response.status === 200 && response.data?.choices?.[0]?.message?.content) {
          const content = response.data.choices[0].message.content.trim();
          this.log.info(`AI response: ${content.substring(0, 100)}...`);
          return content;
        }

        // Handle 4xx errors (client errors — no retry)
        if (response.status >= 400 && response.status < 500) {
          const errMsg = response.data?.error?.message || `HTTP ${response.status}`;
          this.log.error(`AI client error: ${errMsg}`);
          return `[AI Error: ${errMsg}]`;
        }

        lastError = new Error(`Unexpected status ${response.status}`);
        this.log.error(`AI attempt ${attempt} failed: ${lastError.message}`);

      } catch (err) {
        lastError = err;
        if (err.code === 'ECONNREFUSED') {
          this.log.error(`AI Gateway not reachable at ${this.endpoint}`);
          return '[AI Gateway tidak tersedia]';
        }
        if (err.code === 'ETIMEDOUT' || err.code === 'ECONNABORTED') {
          this.log.error(`AI Gateway timeout (attempt ${attempt + 1})`);
          continue;
        }
        this.log.error(`AI request failed: ${err.message}`);
        if (attempt < this.maxRetries) continue;
      }
    }

    this.log.error(`All ${this.maxRetries + 1} attempts failed`);
    return '[AI tidak merespon, silakan coba lagi]';
  }
}

module.exports = AIService;
