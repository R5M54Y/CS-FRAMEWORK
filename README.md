# WhatsApp Customer Service Framework

A lightweight, modular, production-ready WhatsApp Customer Service Framework built with **Node.js**, **Baileys**, **Express**, and **Socket.IO**.

## Features

- **Multi-Session** — Unlimited WhatsApp Business accounts, each with independent auth, connection, and config
- **QR Authentication** — Scan QR codes from terminal or web UI
- **Web Dashboard** — Manage all sessions from a single control panel
- **Session Dashboard** — Per-session control panel for messages, products, knowledge, persona, and profile
- **Product Manager** — Per-session product catalog with search
- **Knowledge Base** — FAQ, policies, company info — per session
- **Persona System** — Define CS agent persona (role, tone, guidelines)
- **Profile Manager** — Company info, greeting, working hours, signature
- **REST API** — Full HTTP API for programmatic control
- **Real-time Updates** — Socket.IO for live message, status, and QR updates
- **Lightweight Storage** — JSON-based, zero external databases
- **Plugin-ready** — Extendable architecture for AI integrations (OpenAI, Gemini, Claude, etc.)
- **Cross-platform** — Windows, Linux, macOS

## Quick Start

```bash
# Clone
git clone <repo-url> whatsapp-cs-framework
cd whatsapp-cs-framework

# Install
npm install

# Configure
cp .env.example .env

# Start
npm start
```

Open **http://localhost:3000** in your browser.

## Architecture

```
project/
├── app.js                  # Main entry point
├── config/                 # Configuration
├── core/                   # Core modules
│   ├── session.js          # WhatsApp session (Baileys wrapper)
│   ├── session-manager.js  # Multi-session orchestrator
│   └── storage.js          # JSON storage managers
├── controllers/            # Route handlers
├── routes/                 # API & Web routes
├── middleware/             # Express middleware
├── services/              # Socket.IO service
├── views/                 # EJS templates
├── public/               # Static assets
├── data/                 # JSON data storage
├── sessions/             # Auth state per session
├── logs/                 # Rotated log files
└── utils/                # Utilities (logger)
```

## REST API

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /health | Health check |
| GET | /api/sessions | List all sessions |
| POST | /api/session | Create new session |
| GET | /api/session/:id | Get session status |
| DELETE | /api/session/:id | Delete session |
| POST | /api/session/:id/connect | Connect session |
| POST | /api/session/:id/disconnect | Disconnect session |
| POST | /api/session/:id/reconnect | Reconnect session |
| POST | /api/session/:id/restart | Restart session |
| GET | /api/session/:id/qrcode | Get QR code |
| POST | /api/session/:id/send | Send message |
| GET | /api/session/:id/messages | Get recent messages |
| GET | /api/session/:id/messages/date?date=DATE | Get messages by date |
| GET | /api/session/:id/chats | Get chat list |
| GET | /api/session/:id/profile | Get profile |
| PUT | /api/session/:id/profile | Update profile |
| GET | /api/session/:id/persona | Get persona |
| PUT | /api/session/:id/persona | Update persona |
| GET | /api/session/:id/products | Get products |
| POST | /api/session/:id/products | Add product |
| PUT | /api/session/:id/products/:productId | Update product |
| DELETE | /api/session/:id/products/:productId | Delete product |
| GET | /api/session/:id/knowledge | Get knowledge base |
| POST | /api/session/:id/knowledge | Add knowledge article |
| PUT | /api/session/:id/knowledge/:knowledgeId | Update article |
| DELETE | /api/session/:id/knowledge/:knowledgeId | Delete article |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| PORT | 3000 | Main dashboard port |
| HOST | 0.0.0.0 | Bind address |
| SESSION_PORT_START | 3100 | Start of per-session port range |
| SESSION_PORT_END | 3200 | End of per-session port range |
| DATA_PATH | ./data | Data storage directory |
| SESSIONS_PATH | ./sessions | Session auth directory |
| LOGS_PATH | ./logs | Log directory |
| LOG_LEVEL | info | Log level (error/warn/info/debug) |
| AUTO_REPLY | true | Auto-reply to messages |

## Portability

Copy the entire project folder to another computer:

```bash
# On new machine
git clone <repo-url>
npm install
cp .env.example .env
npm start
```

Your `sessions/` folder contains WhatsApp auth state — copy it along with `data/` to preserve all sessions and authentication.

## Extending

The framework is designed for plugins. Future modules for AI integration:

- OpenAI / ChatGPT
- Google Gemini
- Anthropic Claude
- Ollama (local LLMs)
- DeepSeek
- CRM / ERP / Ticket systems
- Analytics & Webhooks

## License

MIT
