# WhatsApp Customer Service Framework

A lightweight, production-ready WhatsApp Customer Service Framework built with **Node.js v24**, **Baileys v7**, **Express**, **SQLite3**, and **Socket.IO**.

## Features

- **Multi-Session** — Unlimited WhatsApp Business accounts, each with independent auth, connection, and config
- **QR Authentication** — Scan QR codes from terminal or web UI
- **Web Dashboard** — Manage all sessions from a single control panel
- **SQLite3 Storage** — All data persisted to a single WAL-mode SQLite3 database. No external DB required.
- **REST API** — Full HTTP API with Bearer token auth
- **JWT Authentication** — All API endpoints protected by configurable Bearer token
- **Product Manager** — Per-session product catalog with CRUD and search
- **Knowledge Base** — FAQ, policies, company info — per session
- **Persona System** — Define CS agent persona (role, tone, guidelines)
- **Profile Manager** — Company info, greeting, working hours, signature
- **Real-time Updates** — Socket.IO for live message, status, and QR updates
- **Auto Migration** — Legacy JSON data auto-imported to SQLite3 on first run
- **AI Integration** — OpenAI-compatible gateway (DeepSeek, GPT, etc.)
- **Humanizer** — Natural language post-processing for outgoing messages
- **Graceful Shutdown** — SIGTERM/SIGINT handling, DB close, port cleanup
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
# Edit .env — set SESSION_SECRET, AI_ENDPOINT, etc.

# Start
npm start
```

Open **http://localhost:3000** in your browser.

## Architecture

```
project/
├── app.js                  # Main entry point (async init, graceful shutdown)
├── config/                 # Environment-based configuration
├── core/
│   ├── database.js         # SQLite3 connection manager (WAL, FKs, serialized writes)
│   ├── db-migrate.js       # One-time migration from JSON → SQLite3
│   ├── session.js          # WhatsApp session (Baileys WASocket wrapper)
│   ├── session-manager.js  # Multi-session orchestrator (async, SQLite-backed)
│   ├── storage.js          # SQLite3-backed stores: Product, Knowledge, Profile, Persona, Settings, Message
│   └── index.js            # Module barrel + initCore()
├── controllers/            # Route handlers (async, lazy SM accessor)
├── routes/                 # REST API (api.js) & Web routes (web.js)
├── middleware/             # Auth (JWT Bearer), Error handler, CORS, Rate limiter, Request logger
├── services/              # Socket.IO, AI gateway, Humanizer, Reply service
├── views/                 # EJS dashboard templates
├── public/                # Static JS/CSS assets
├── data/                  # SQLite3 DB + empty dirs for migration sources
├── sessions/              # Baileys auth state (per session)
├── logs/                  # Rotated Winston log files
└── utils/                 # Winston logger, file upload helper
```

### Data Flow

```
WhatsApp ←→ Baileys ←→ Session.js ←→ SessionManager ←→ SQLite3 (core/database.js)
                                      ↕
                              Controllers ←→ REST API ←→ Dashboard (EJS + Socket.IO)
                                      ↕
                              AI Gateway (services/ai.js) ←→ OpenAI-compatible endpoint
```

## Database

SQLite3 with WAL journal mode. Single file: `data/cs-framework.db`.

**9 tables:** sessions, messages, products, knowledge_base, personas, profiles, settings, knowledge_config, persona_prompts

**Safety:** WAL mode, foreign keys ON, `BEGIN IMMEDIATE` transactions, serialized write queue, prepared statements (no SQL injection), busy timeout 5000ms.

## REST API

All `/api/*` endpoints require `Authorization: Bearer <SESSION_SECRET>` header.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /health | Health check (no auth) |
| GET | /api/sessions | List all sessions |
| POST | /api/session | Create new session |
| GET | /api/session/:id | Get session status |
| PUT | /api/session/:id | Update session |
| DELETE | /api/session/:id | Delete session |
| POST | /api/session/:id/connect | Connect session |
| POST | /api/session/:id/disconnect | Disconnect session |
| POST | /api/session/:id/reconnect | Reconnect session |
| POST | /api/session/:id/restart | Restart session |
| GET | /api/session/:id/qrcode | Get QR code |
| POST | /api/session/:id/send | Send message |
| GET | /api/session/:id/messages | Get messages (paginated) |
| GET | /api/session/:id/messages/date?date=YYYY-MM-DD | Get messages by date |
| GET | /api/session/:id/chats | Get chat list |
| GET | /api/session/:id/profile | Get profile |
| PUT | /api/session/:id/profile | Update profile |
| GET | /api/session/:id/persona | Get AI persona config |
| PUT | /api/session/:id/persona | Update AI persona |
| GET | /api/session/:id/products | List products |
| POST | /api/session/:id/products | Add product |
| PUT | /api/session/:id/products/:productId | Update product |
| DELETE | /api/session/:id/products/:productId | Delete product |
| POST | /api/session/:id/products/fetch | Fetch product URL metadata |
| GET | /api/session/:id/knowledge | List knowledge base |
| POST | /api/session/:id/knowledge | Add knowledge article |
| PUT | /api/session/:id/knowledge/:knowledgeId | Update article |
| DELETE | /api/session/:id/knowledge/:knowledgeId | Delete article |
| GET | /api/settings | Get global settings |
| PUT | /api/settings | Update global settings |
| GET | /api/session/:id/conversations | List conversations |
| GET | /api/session/:id/conversations/:jid/messages | Get conversation history |
| POST | /api/session/:id/conversations/reply | Send human reply |
| POST | /api/ai/test | Test AI gateway connection |
| GET | /api/ai/queue | AI request queue stats |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| PORT | 3000 | HTTP port |
| HOST | 0.0.0.0 | Bind address |
| NODE_ENV | production | Environment |
| SESSION_SECRET | (required) | Bearer token for API auth |
| CORS_ORIGIN | http://localhost:3000 | Allowed CORS origin |
| AI_ENDPOINT | http://localhost:20128/v1 | OpenAI-compatible endpoint |
| AI_MODEL | oc/deepseek-v4-flash-free | Model name |
| AI_API_KEY | (your key) | API key |
| LOG_LEVEL | info | Winston log level |
| DATA_PATH | ./data | Data directory |
| SESSIONS_PATH | ./sessions | Auth state directory |

## Migration from JSON Storage

On first run, the app auto-imports legacy JSON data from the `data/` directory:

- `data/sessions/index.json` → `sessions` table
- `data/settings.json` → `settings` table  
- `data/profiles/*.json` → `profiles` table
- `data/personas/*.json` → `personas` table
- `data/products/*.json` → `products` table
- `data/knowledge/*.json` → `knowledge_base` table

Migration is idempotent — safe to run multiple times.

## Portability

```bash
git clone <repo-url>
npm install
cp .env.example .env
# Copy data/cs-framework.db for database
# Copy sessions/ dir for WhatsApp auth state
npm start
```

## License

MIT
