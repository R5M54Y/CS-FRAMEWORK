'use strict';

/**
 * Prompt Builder — assembles the system prompt from all context sources
 * and builds the message array for AI completion.
 */
class PromptBuilder {
  constructor() {
    this.maxContextLength = 15000; // Safe char limit for system prompt (persona + knowledge + products)
  }

  /**
   * Build the full prompt for an incoming user message
   * @param {Object} params
   * @param {Object} params.persona - CS persona configuration
   * @param {Object} params.profile - Session profile
   * @param {Array} params.products - Product catalog
   * @param {Array} params.knowledge - Knowledge base articles
   * @param {Array} params.history - Recent conversation history
   * @param {string} params.userMessage - The incoming user message
   * @returns {Array} Messages array for chat completion
   */
  build({ persona, personaPrompt, profile, products, knowledge, knowledgeConfig, history = [], userMessage }) {
    const systemPrompt = this._buildSystemPrompt({ persona, personaPrompt, profile, products, knowledge, knowledgeConfig });
    const messages = [{ role: 'system', content: systemPrompt }];

    // Add conversation history (last N exchanges to stay within context)
    const maxHistory = 20;
    const recentHistory = history.slice(-maxHistory);
    for (const msg of recentHistory) {
      if (msg.role === 'user' || msg.role === 'assistant') {
        messages.push({ role: msg.role, content: msg.content });
      }
    }

    // Add current user message
    messages.push({ role: 'user', content: userMessage });

    return messages;
  }

  /**
   * Build the system prompt from all context sources
   */
  _buildSystemPrompt({ persona, personaPrompt, profile, products, knowledge, knowledgeConfig }) {
    // If persona has a custom prompt, use it as the primary system prompt
    const effectivePersonaPrompt = personaPrompt || persona?.prompt;
    if (effectivePersonaPrompt) {
      const parts = [effectivePersonaPrompt];

      // WhatsApp messaging format standards
      parts.push(this._sectionFormatting());

      // Knowledge base (from config)
      const kbSection = this._sectionKnowledgeBase(knowledgeConfig);
      if (kbSection) parts.push(kbSection);

      // Products
      if (products && products.length > 0) {
        parts.push(this._sectionProducts(products));
      }

      // Knowledge base items
      if (knowledge && knowledge.length > 0) {
        parts.push(this._sectionKnowledge(knowledge));
      }

      // Merge and trim
      let prompt = parts.join('\n\n');
      if (prompt.length > this.maxContextLength) {
        prompt = prompt.substring(0, this.maxContextLength);
      }
      return prompt;
    }

    // Legacy format fallback
    const parts = [];

    // Knowledge base (from config)
    const kbSection = this._sectionKnowledgeBase(knowledgeConfig);
    if (kbSection) parts.push(kbSection);

    // Identity / Role
    parts.push(this._sectionIdentity(persona, profile));

    // Communication style
    parts.push(this._sectionStyle(persona));

    // WhatsApp messaging format standards
    parts.push(this._sectionFormatting());

    // Products
    if (products && products.length > 0) {
      parts.push(this._sectionProducts(products));
    }

    // Knowledge base
    if (knowledge && knowledge.length > 0) {
      parts.push(this._sectionKnowledge(knowledge));
    }

    // Behavior rules
    parts.push(this._sectionRules(persona));

    // Merge and trim
    let prompt = parts.join('\n\n');
    if (prompt.length > this.maxContextLength) {
      prompt = prompt.substring(0, this.maxContextLength);
    }

    return prompt;
  }

  _sectionIdentity(persona, profile) {
    const agentName = profile?.agentName || persona?.name || 'CS Agent';
    const company = profile?.companyName || 'Perusahaan';
    const role = persona?.role || 'Customer Service';
    const greeting = persona?.greeting || profile?.greetingMessage || 'Halo! Ada yang bisa saya bantu?';

    return [
      `Nama kamu: ${agentName}`,
      `Perusahaan: ${company}`,
      `Kamu adalah seorang ${role} yang profesional, ramah, dan membantu.`,
      `Gunakan bahasa Indonesia yang santai namun sopan.`,
      `Sapaan: "${greeting}"`,
    ].join('\n');
  }

  _sectionStyle(persona) {
    const tone = persona?.tone || 'friendly';
    const guidelines = persona?.guidelines || [];

    const toneMap = {
      friendly: 'Gunakan nada ramah, hangat, gunakan emoji sesuai tempat.',
      professional: 'Gunakan nada profesional, jelas, dan terstruktur.',
      casual: 'Gunakan nada santai dan akrab.',
      formal: 'Gunakan nada formal dan baku.'
    };

    const parts = [
      `Gaya bicara: ${toneMap[tone] || toneMap.friendly}`,
    ];

    if (guidelines.length > 0) {
      parts.push('Panduan:');
      guidelines.forEach((g, i) => {
        parts.push(`${i + 1}. ${g}`);
      });
    }

    return parts.join('\n');
  }

  _sectionProducts(products) {
    const lines = ['Katalog Produk:'];
    for (const p of products.slice(0, 30)) {
      let line = `📦 ${p.name}`;
      if (p.price) line += ` | Rp ${p.price.toLocaleString('id-ID')}`;
      if (p.stock !== undefined) line += ` | Stok: ${p.stock}`;
      if (p.description) line += ` | ${p.description}`;
      if (p.discount) line += ` | Diskon: ${p.discount}`;
      lines.push(line);
    }
    return lines.join('\n');
  }

  _sectionKnowledge(knowledge) {
    const lines = ['Pengetahuan / Informasi:'];
    for (const k of knowledge.slice(0, 30)) {
      let line = `[${k.category || 'Umum'}] ${k.title}: ${k.content || ''}`;
      if (k.keywords && k.keywords.length > 0) {
        line += ` (kata kunci: ${k.keywords.join(', ')})`;
      }
      lines.push(line);
    }
    return lines.join('\n');
  }

  _sectionKnowledgeBase(knowledgeConfig) {
    if (!knowledgeConfig) return null;
    const parts = [];
    if (knowledgeConfig.knowledge) {
      parts.push('KNOWLEDGE BASE');
      parts.push(knowledgeConfig.knowledge);
    }
    if (knowledgeConfig.marketplaceUrl) {
      if (parts.length === 0) parts.push('KNOWLEDGE BASE');
      if (parts.length === 1) parts.push('');
      parts.push(`Marketplace: ${knowledgeConfig.marketplaceUrl}`);
    }
    if (parts.length === 0) return null;
    return parts.join('\n');
  }

  _sectionFormatting() {
    return [
      'FORMAT PESAN WHATSAPP (INI WAJIB, BUKAN SARAN):',
      '',
      'Tulis seperti customer service manusia, bukan robot.',
      'Gunakan bahasa yang natural dan mengalir.',
      '',
      'CONTOH FORMAT PRODUK (WAJIB tiru persis):',
      '📦 Kucing Persia - Rp 500.000',
      '📦 Kucing Anggora - Rp 750.000',
      '📦 Kucing Maine Coon - Rp 1.200.000',
      '',
      'CONTOH FORMAT FITUR (WAJIB tiru persis):',
      '✅ Produk Original',
      '✅ Pengiriman Cepat',
      '✅ Garansi 30 Hari',
      '',
      'CONTOH FORMAT JADWAL (WAJIB tiru persis):',
      '🕒 Senin-Jumat: 09:00-17:00',
      '🕒 Sabtu: 09:00-13:00',
      '🕒 Minggu: Libur',
      '',
      'CONTOH FORMAT HARGA (WAJIB tiru persis):',
      '💰 Paket A: Rp 50.000',
      '💰 Paket B: Rp 100.000',
      '',
      'CONTOH FORMAT KONTAK (WAJIB tiru persis):',
      '📱 WhatsApp: 0812-xxxx-xxxx',
      '🌐 Website: tokokucing.com',
      '',
      'SALAH — JANGAN PERNAH LAKUKAN INI:',
      'Kelebihan:',
      'Koleksi super lengkap',
      'Akses seumur hidup',
      'Harga terjangkau',
      '',
      'BENAR — WAJIB SEPERTI INI:',
      '✨ Kelebihan:',
      '',
      '✅ Koleksi super lengkap',
      '✅ Akses seumur hidup',
      '💰 Harga terjangkau',
      '',
      'ATURAN LIST (WAJIB):',
      'WAJIB: Setiap item dalam daftar HARUS diawali emoji.',
      'WAJIB: Pilih emoji yang sesuai konteks item.',
      'DILARANG KERAS: Menulis daftar item tanpa emoji.',
      'DILARANG KERAS: Menggunakan strip (-), angka (1. 2. 3.), asterisk (*), atau bullet (•).',
      '',
      'PANDUAN EMOJI PER KONTEKS:',
      'Produk → 📦',
      'Fitur/Keunggulan → ✅ ✨',
      'Harga → 💰',
      'Waktu/Jadwal → 🕒',
      'Pengiriman → 🚚',
      'Download → 📥',
      'Dokumen → 📄 📝',
      'Kontak → 📱 📞',
      'Link → 🔗',
      'Peringatan → ⚠️ ❗',
      'Catatan/Poin penting → 📌',
      'Langkah-langkah → 👉',
      'Manfaat → ✨',
      'Anak-anak → 🧩 🎨 🔤',
      'Pendidikan → 📚 🎓',
      '',
      'ATURAN NOMOR:',
      'Hanya gunakan nomor urut jika customer meminta langkah-langkah berurutan.',
      'Untuk daftar biasa, WAJIB gunakan emoji.',
      '',
      'ATURAN EMOJI:',
      'WAJIB: Satu emoji di awal setiap item list.',
      'WAJIB: Pilih emoji yang sesuai konteks.',
      'DILARANG KERAS: Menumpuk emoji (contoh salah: 📦✅✨).',
      'DILARANG KERAS: Menghias setiap kalimat dengan emoji.',
      'Gunakan emoji hanya untuk memperjelas struktur, bukan menghias.',
      '',
      'ATURAN FORMAT:',
      'DILARANG KERAS: markdown (##, **, __, ---, tabel, code block).',
      'WAJIB: Teks WhatsApp polos.',
      'DILARANG KERAS: Blok teks panjang tanpa jeda.',
      '',
      'STRUKTUR:',
      'Paragraf pendek (1-3 baris).',
      'Antar paragraf beri jarak (baris kosong).',
      'Mudah dipindai (scanable).',
      'Alami, seperti orang ngobrol di WhatsApp.',
    ].join('\n');
  }

  _sectionRules(persona) {
    const parts = [
      'Aturan:',
      '1. Jangan mengarang informasi produk atau harga. Jika tidak tahu, bilang tidak tahu.',
      '2. Jika ditanya tentang sesuatu di luar pengetahuanmu, arahkan ke manusia.',
      '3. Jawab singkat, padat, dan jelas.',
      '4. Tutup percakapan dengan sopan.',
      '5. Jangan mengirim pesan lebih dari 3 paragraf.',
    ];

    if (persona?.forbiddenTopics && persona.forbiddenTopics.length > 0) {
      parts.push(`Topik yang dilarang: ${persona.forbiddenTopics.join(', ')}`);
    }

    if (persona?.allowedTopics && persona.allowedTopics.length > 0) {
      parts.push(`Topik yang boleh dibahas: ${persona.allowedTopics.join(', ')}`);
    }

    return parts.join('\n');
  }
}

module.exports = PromptBuilder;
