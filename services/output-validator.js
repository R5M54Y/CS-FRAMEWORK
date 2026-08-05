'use strict';

/**
 * Output Validation Layer
 * Last line of defense before any reply is sent to customer.
 * Validates AI responses against authoritative runtime data.
 *
 * Validates: prices, phone/WA numbers, emails, URLs, social media,
 * bank accounts, QRIS strings, marketplace links.
 */

class OutputValidator {
  constructor(sessionManager) {
    this.sessionManager = sessionManager;
    const { createSessionLogger } = require('../utils/logger');
    this.log = createSessionLogger('validator', 'output-validator');
  }

  /**
   * Validate AI response text against authoritative runtime data.
   * @param {string} sessionId
   * @param {string} responseText — AI-generated response (after ActionParser)
   * @param {Object} promptData — original prompt context for fallback data
   * @returns {{ valid: boolean, violations: Array }}
   */
  async validate(sessionId, responseText, promptData) {
    if (!responseText || typeof responseText !== 'string') {
      return { valid: true, violations: [] };
    }

    const violations = [];

    // Collect all authoritative runtime data
    const profile = this.sessionManager.getProfile(sessionId);
    const products = this.sessionManager.getProducts(sessionId) || [];
    const knowledge = this.sessionManager.getKnowledge(sessionId) || [];
    const knowledgeConfig = this.sessionManager.getKnowledgeConfig(sessionId);
    const session = this.sessionManager.getSession(sessionId);

    // 1. Price validation
    const priceViolations = this._validatePrices(responseText, products, promptData);
    violations.push(...priceViolations);

    // 2. Phone / WhatsApp number validation
    const phoneViolations = this._validatePhones(responseText, knowledgeConfig, session);
    violations.push(...phoneViolations);

    // 3. Email validation
    const emailViolations = this._validateEmails(responseText, knowledgeConfig);
    violations.push(...emailViolations);

    // 4. URL validation
    const urlViolations = this._validateURLs(responseText, knowledgeConfig);
    violations.push(...urlViolations);

    // 5. Social media validation
    const socialViolations = this._validateSocialMedia(responseText, knowledgeConfig);
    violations.push(...socialViolations);

    // 6. Bank account validation
    const bankViolations = this._validateBankAccounts(responseText, knowledgeConfig);
    violations.push(...bankViolations);

    // 7. QRIS validation
    const qrisViolations = this._validateQRIS(responseText, knowledgeConfig);
    violations.push(...qrisViolations);

    return {
      valid: violations.length === 0,
      violations
    };
  }

  // =====================================================================
  //  PRICE VALIDATION
  // =====================================================================

  _validatePrices(text, products, promptData) {
    const violations = [];

    // Collect ALL valid prices from runtime sources
    const validPrices = this._collectValidPrices(products, promptData);

    // If no prices configured, skip price validation
    if (validPrices.size === 0) return violations;

    // Match Rp-prefixed prices: Rp37.000, Rp 250.000, Rp.100.000
    // These are ALWAYS prices when preceded by Rp
    const rpPriceRegex = /Rp\.?\s*(\d[\d.,]*)/gi;
    const rpMatches = [...text.matchAll(rpPriceRegex)];

    for (const match of rpMatches) {
      const raw = match[0]; // full match like "Rp37.000" or "Rp 250.000"
      const digits = match[1].replace(/[.,\s]/g, '');
      const numericValue = parseInt(digits, 10);

      if (!this._isValidPrice(numericValue, validPrices)) {
        violations.push({
          type: 'price',
          value: raw,
          normalizedValue: numericValue,
          allowedValues: [...validPrices]
        });
      }
    }

    // Match verbal price patterns: "37 ribu", "250 ribuan"
    const verbalPriceRegex = /(\d[\d.,]*)\s*(ribu|ribuan|rupiah)/gi;
    const verbalMatches = [...text.matchAll(verbalPriceRegex)];

    for (const match of verbalMatches) {
      const raw = match[0];
      const digits = match[1].replace(/[.,\s]/g, '');
      let numericValue = parseInt(digits, 10);

      // "ribu" = thousand
      if (/ribu/i.test(match[2])) {
        numericValue *= 1000;
      }

      if (!this._isValidPrice(numericValue, validPrices)) {
        violations.push({
          type: 'price',
          value: raw,
          normalizedValue: numericValue,
          allowedValues: [...validPrices]
        });
      }
    }

    return violations;
  }

  /**
   * Collect all valid prices from products + prompt data context.
   * Normalizes to numeric values for comparison.
   */
  _collectValidPrices(products, promptData) {
    const prices = new Set();

    // From product catalog
    for (const p of products) {
      if (p.price != null) {
        const num = typeof p.price === 'number'
          ? p.price
          : parseInt(String(p.price).replace(/[.,]/g, ''), 10);
        if (!isNaN(num)) prices.add(num);
      }
    }

    // From promptData knowledge (Product Knowledge section contains prices too)
    if (promptData?.knowledge) {
      for (const k of promptData.knowledge) {
        if (k.content) {
          // Extract Rp-prefixed prices from knowledge content
          const rpMatches = [...k.content.matchAll(/Rp\.?\s*(\d[\d.,]*)/gi)];
          for (const m of rpMatches) {
            const num = parseInt(m[1].replace(/[.,]/g, ''), 10);
            if (!isNaN(num)) prices.add(num);
          }
          // Extract verbal prices
          const verbalMatches = [...k.content.matchAll(/(\d[\d.,]*)\s*(ribu|ribuan)/gi)];
          for (const m of verbalMatches) {
            let num = parseInt(m[1].replace(/[.,]/g, ''), 10);
            if (/ribu/i.test(m[2])) num *= 1000;
            if (!isNaN(num)) prices.add(num);
          }
        }
      }
    }

    return prices;
  }

  _isValidPrice(numericValue, validPrices) {
    if (isNaN(numericValue) || numericValue <= 0) return true; // skip invalid
    return validPrices.has(numericValue);
  }

  // =====================================================================
  //  PHONE / WHATSAPP VALIDATION
  // =====================================================================

  _validatePhones(text, knowledgeConfig, session) {
    const violations = [];
    const allowedNumbers = this._collectAllowedPhones(knowledgeConfig, session);

    // If no phones configured, skip validation
    if (allowedNumbers.size === 0) return violations;

    // Match Indonesian phone patterns
    // +62xxx, 62xxx, 08xxx, 08xx-xxxx-xxxx
    const phoneRegex = /(?:\+62|62|0)8[0-9][\d\s\-]{6,14}\d/g;
    const matches = text.match(phoneRegex) || [];

    for (const phone of matches) {
      const normalized = this._normalizePhone(phone);
      if (!allowedNumbers.has(normalized) && !allowedNumbers.has(phone)) {
        violations.push({
          type: 'phone',
          value: phone,
          allowedValues: [...allowedNumbers]
        });
      }
    }

    return violations;
  }

  _collectAllowedPhones(knowledgeConfig, session) {
    const phones = new Set();
    if (knowledgeConfig?.whatsappNumbers) {
      for (const p of knowledgeConfig.whatsappNumbers) {
        phones.add(p);
        phones.add(this._normalizePhone(p));
      }
    }
    if (session?.phoneNumber) {
      phones.add(session.phoneNumber);
      phones.add(this._normalizePhone(session.phoneNumber));
    }
    return phones;
  }

  _normalizePhone(phone) {
    return phone.replace(/[\s\-]/g, '').replace(/^0/, '+62');
  }

  // =====================================================================
  //  EMAIL VALIDATION
  // =====================================================================

  _validateEmails(text, knowledgeConfig) {
    const violations = [];
    const allowedEmails = this._collectAllowedEmails(knowledgeConfig);
    if (allowedEmails.size === 0) return violations;

    const emailRegex = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
    const matches = text.match(emailRegex) || [];

    for (const email of matches) {
      if (!allowedEmails.has(email.toLowerCase())) {
        violations.push({
          type: 'email',
          value: email,
          allowedValues: [...allowedEmails]
        });
      }
    }

    return violations;
  }

  _collectAllowedEmails(knowledgeConfig) {
    const emails = new Set();
    if (knowledgeConfig?.email) emails.add(knowledgeConfig.email.toLowerCase());
    if (knowledgeConfig?.emails) {
      for (const e of knowledgeConfig.emails) emails.add(e.toLowerCase());
    }
    return emails;
  }

  // =====================================================================
  //  URL VALIDATION
  // =====================================================================

  _validateURLs(text, knowledgeConfig) {
    const violations = [];
    const allowedUrls = this._collectAllowedUrls(knowledgeConfig);
    if (allowedUrls.size === 0) return violations;

    const urlRegex = /https?:\/\/[^\s<>"')\]]+/gi;
    const matches = text.match(urlRegex) || [];

    for (const url of matches) {
      const cleanUrl = url.replace(/[.,;:!?]+$/, '');
      if (!this._isUrlAllowed(cleanUrl, allowedUrls)) {
        violations.push({
          type: 'url',
          value: cleanUrl,
          allowedValues: [...allowedUrls]
        });
      }
    }

    return violations;
  }

  _collectAllowedUrls(knowledgeConfig) {
    const urls = new Set();
    if (knowledgeConfig?.marketplaceUrl) urls.add(knowledgeConfig.marketplaceUrl);
    if (knowledgeConfig?.urls) {
      for (const u of knowledgeConfig.urls) urls.add(u);
    }
    return urls;
  }

  _isUrlAllowed(url, allowedUrls) {
    for (const allowed of allowedUrls) {
      if (url === allowed) return true;
      if (allowed && url.startsWith(allowed)) return true;
      try {
        const foundDomain = new URL(url).hostname;
        const allowedDomain = new URL(allowed).hostname;
        if (foundDomain === allowedDomain) return true;
      } catch { /* invalid URL */ }
    }
    return false;
  }

  // =====================================================================
  //  SOCIAL MEDIA VALIDATION
  // =====================================================================

  _validateSocialMedia(text, knowledgeConfig) {
    const violations = [];
    const allowedSocial = this._collectAllowedSocial(knowledgeConfig);
    if (allowedSocial.size === 0) return violations;

    // Extract social media patterns - look for handles and URLs
    const instagramHandleRegex = /@([a-zA-Z0-9._]{2,30})(?!\w)/gi;
    const instagramUrlRegex = /instagram\.com\/([a-zA-Z0-9._]+)/gi;
    const tiktokRegex = /tiktok\.com\/@([a-zA-Z0-9._]+)/gi;
    const fbRegex = /facebook\.com\/([a-zA-Z0-9._]+)/gi;
    const tgRegex = /t\.me\/([a-zA-Z0-9_]+)/gi;
    const lineRegex = /line\.me\/[^\s]+/gi;
    const ytRegex = /youtube\.com\/[^\s]+/gi;

    const patterns = [
      { regex: instagramHandleRegex, type: 'instagram', extract: (m) => '@' + (m[1] || '') },
      { regex: instagramUrlRegex, type: 'instagram', extract: (m) => 'instagram.com/' + (m[1] || '') },
      { regex: tiktokRegex, type: 'tiktok', extract: (m) => 'tiktok.com/@' + (m[1] || '') },
      { regex: fbRegex, type: 'facebook', extract: (m) => 'facebook.com/' + (m[1] || '') },
      { regex: tgRegex, type: 'telegram', extract: (m) => 't.me/' + (m[1] || '') },
      { regex: lineRegex, type: 'line', extract: (m) => m[0] || '' },
      { regex: ytRegex, type: 'youtube', extract: (m) => m[0] || '' }
    ];

    for (const { regex, type, extract } of patterns) {
      const matches = Array.from(text.matchAll(regex));
      for (const match of matches) {
        const extracted = extract(match);
        if (!extracted) continue;

        // Normalize extracted value for comparison
        let normalizedExtracted = extracted.toLowerCase();

        // Handle different formats:
        // - @username -> username
        // - instagram.com/username -> username
        // - tiktok.com/@username -> username
        // - facebook.com/username -> username
        // - t.me/username -> username

        if (normalizedExtracted.startsWith('@')) {
          normalizedExtracted = normalizedExtracted.substring(1);
        } else if (normalizedExtracted.includes('instagram.com/')) {
          normalizedExtracted = normalizedExtracted.split('instagram.com/')[1];
        } else if (normalizedExtracted.includes('tiktok.com/@')) {
          normalizedExtracted = normalizedExtracted.split('tiktok.com/@')[1];
        } else if (normalizedExtracted.includes('facebook.com/')) {
          normalizedExtracted = normalizedExtracted.split('facebook.com/')[1];
        } else if (normalizedExtracted.includes('t.me/')) {
          normalizedExtracted = normalizedExtracted.split('t.me/')[1];
        }

        let isAllowed = false;
        for (const allowed of allowedSocial) {
          let normalizedAllowed = allowed.toLowerCase();

          // Remove @ from allowed value for comparison
          if (normalizedAllowed.startsWith('@')) {
            normalizedAllowed = normalizedAllowed.substring(1);
          } else if (normalizedAllowed.includes('instagram.com/')) {
            normalizedAllowed = normalizedAllowed.split('instagram.com/')[1];
          } else if (normalizedAllowed.includes('tiktok.com/@')) {
            normalizedAllowed = normalizedAllowed.split('tiktok.com/@')[1];
          } else if (normalizedAllowed.includes('facebook.com/')) {
            normalizedAllowed = normalizedAllowed.split('facebook.com/')[1];
          } else if (normalizedAllowed.includes('t.me/')) {
            normalizedAllowed = normalizedAllowed.split('t.me/')[1];
          }

          if (normalizedExtracted === normalizedAllowed) {
            isAllowed = true;
            break;
          }
        }

        if (!isAllowed) {
          violations.push({
            type: 'social_media',
            subtype: type,
            value: extracted,
            allowedValues: [...allowedSocial]
          });
        }
      }
    }

    return violations;
  }

  _collectAllowedSocial(knowledgeConfig) {
    const social = new Set();
    if (knowledgeConfig?.instagram) social.add(knowledgeConfig.instagram);
    if (knowledgeConfig?.tiktok) social.add(knowledgeConfig.tiktok);
    if (knowledgeConfig?.facebook) social.add(knowledgeConfig.facebook);
    if (knowledgeConfig?.telegram) social.add(knowledgeConfig.telegram);
    if (knowledgeConfig?.youtube) social.add(knowledgeConfig.youtube);
    if (knowledgeConfig?.socialMedia) {
      for (const s of Object.values(knowledgeConfig.socialMedia)) {
        if (s) social.add(s);
      }
    }
    return social;
  }

  // =====================================================================
  //  BANK ACCOUNT VALIDATION
  // =====================================================================

  _validateBankAccounts(text, knowledgeConfig) {
    const violations = [];
    const allowedAccounts = this._collectAllowedBankAccounts(knowledgeConfig);
    if (allowedAccounts.size === 0) return violations;

    const bankRegex = /(?:BCA|BNI|BRI|Mandiri|CIMB|Permata|Danamon|BSI|Bank\s+\w+)[\s:]*(\d[\d\s\-]{8,20})/gi;
    const matches = text.match(bankRegex) || [];

    for (const match of matches) {
      const digits = match.replace(/[^\d]/g, '');
      if (!allowedAccounts.has(digits)) {
        violations.push({
          type: 'bank_account',
          value: match.trim(),
          allowedValues: [...allowedAccounts]
        });
      }
    }

    return violations;
  }

  _collectAllowedBankAccounts(knowledgeConfig) {
    const accounts = new Set();
    if (knowledgeConfig?.bankAccounts) {
      for (const acc of knowledgeConfig.bankAccounts) {
        if (typeof acc === 'string') accounts.add(acc.replace(/[^\d]/g, ''));
        else if (acc?.number) accounts.add(acc.number.replace(/[^\d]/g, ''));
      }
    }
    if (knowledgeConfig?.bankAccount) {
      const num = knowledgeConfig.bankAccount.number || knowledgeConfig.bankAccount;
      if (typeof num === 'string') accounts.add(num.replace(/[^\d]/g, ''));
    }
    return accounts;
  }

  // =====================================================================
  //  QRIS VALIDATION
  // =====================================================================

  _validateQRIS(text, knowledgeConfig) {
    const violations = [];
    const allowedQRIS = knowledgeConfig?.qris || knowledgeConfig?.qrisCode;
    if (!allowedQRIS) return violations;

    const qrisRegex = /(?:QRIS|QR\s*Code|Kode\s*QR)[\s:]*([A-Za-z0-9]{20,})/gi;
    const matches = text.match(qrisRegex) || [];

    for (const match of matches) {
      const code = match.replace(/(?:QRIS|QR\s*Code|Kode\s*QR)[\s:]*/i, '').trim();
      if (code !== allowedQRIS) {
        violations.push({
          type: 'qris',
          value: code,
          allowedValues: [allowedQRIS]
        });
      }
    }

    return violations;
  }

  // =====================================================================
  //  LOGGING
  // =====================================================================

  logValidation(sessionId, violations, wasRegenerated) {
    if (violations.length > 0) {
      this.log.warn(
        `[OUTPUT VALIDATOR] FAIL session=${sessionId}` +
        (wasRegenerated ? ' [regenerated]' : '') +
        ` violations=${violations.length}`
      );
      for (const v of violations) {
        this.log.warn(
          `  [${v.type}] value="${v.value}"` +
          ` allowed=${JSON.stringify(v.allowedValues?.slice(0, 5) || [])}` +
          (v.allowedValues?.length > 5 ? ` ...+${v.allowedValues.length - 5} more` : '')
        );
      }
    }
  }
}

module.exports = OutputValidator;