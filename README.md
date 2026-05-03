# ✅ CheckBox — Real-Time Collaborative Checkbox App with OIDC Authentication

A full-stack monorepo containing two services:

- **`oidc-auth-main`** — A custom OpenID Connect (OIDC) authentication server
- **`checkbox`** — A real-time collaborative checkbox web app secured by the OIDC server

> Live demo: [checkbox-w1gl.onrender.com](https://checkbox-w1gl.onrender.com) | Auth server: [oidc-auth-main.onrender.com](https://oidc-auth-main.onrender.com)

---

## 📋 Project Overview

Users visit the Checkbox app and see a 10×10 grid of 100 checkboxes. The state of every checkbox is **shared in real-time across all connected users**. Before a user can toggle a checkbox, they must **sign in** through the OIDC Auth Server. After login, their name is displayed in the nav bar and they can interact with the shared state.

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| **Checkbox Backend** | Node.js, Express 5, Socket.IO |
| **Auth Server Backend** | Node.js, Express 5, TypeScript |
| **Database** | PostgreSQL via [Neon](https://neon.tech) (serverless) |
| **ORM** | Drizzle ORM |
| **Cache / Pub-Sub** | Redis via [Upstash](https://upstash.com) |
| **Real-time** | Socket.IO (WebSockets) |
| **Auth Standard** | Custom OIDC (Authorization Code Flow) |
| **JWT Signing** | RS256 (RSA 2048-bit) via `jsonwebtoken` |
| **Password Security** | PBKDF2-SHA512 with per-user salt via Node `crypto` |
| **Frontend** | Vanilla HTML, CSS, JavaScript |
| **Deployment** | [Render](https://render.com) (both services) |

---

## ✨ Features Implemented

- 🔐 **OIDC Authorization Code Flow** — Full sign-up/sign-in with code exchange and JWT issuance
- 🗄️ **Database-backed users** — All user accounts stored securely in Neon PostgreSQL
- 🔑 **Secure password hashing** — PBKDF2-SHA512 with a unique random salt per user
- 🛡️ **RS256 JWT tokens** — RSA-signed access tokens; auto-generates key in memory if `.pem` file is missing
- ⚡ **Real-time sync** — All 100 checkboxes stay in sync across every connected browser using Socket.IO
- 📡 **Redis Pub/Sub** — Checkbox updates broadcast across server instances via Redis channels
- 👤 **User identity display** — Logged-in user's name shown in the nav bar
- 🔒 **Protected interaction** — Unauthenticated users are redirected to login when clicking checkboxes
- ⏱️ **Rate limiting** — 1-second cooldown between checkbox clicks to prevent spamming
- 🚪 **Logout** — Clears all session cookies and redirects to home

---

## 🗂️ Project Structure

```
project/
├── checkbox/               # Real-time checkbox web app
│   ├── public/
│   │   └── index.html      # Frontend (HTML + CSS + JS)
│   ├── index.js            # Express + Socket.IO server
│   ├── redis-connection.js # Redis client setup
│   ├── .env.example        # Environment variable template
│   └── package.json
│
└── oidc-auth-main/         # OIDC authentication server
    ├── public/
    │   ├── authenticate.html  # Sign-in page
    │   └── signup.html        # Sign-up page
    ├── src/
    │   ├── index.ts           # Main server (all OIDC endpoints)
    │   └── db/
    │       └── schema.ts      # Drizzle ORM schema
    ├── cert/                  # (optional) RSA private key
    ├── .env.example           # Environment variable template
    └── package.json
```

---

## 🚀 How to Run Locally

### Prerequisites

- Node.js 18+
- `pnpm` (recommended) or `npm`
- A running Redis instance (or Upstash account)
- A PostgreSQL database (or Neon account)

### 1. Clone the repository

```bash
git clone https://github.com/abhi26623/project.git
cd project
```

### 2. Set up the OIDC Auth Server

```bash
cd oidc-auth-main

# Install dependencies
pnpm install

# Copy env template and fill in your values
cp .env.example .env

# Run database migrations
pnpm db:migrate

# Start the server in development mode
pnpm dev
```

The auth server runs on **http://localhost:9005**

### 3. Set up the Checkbox App

```bash
cd ../checkbox

# Install dependencies
pnpm install

# Copy env template and fill in your values
cp .env.example .env

# Start the server
pnpm dev
```

The checkbox app runs on **http://localhost:8080**

### 4. Register your Checkbox app as an OIDC client

```bash
curl -X POST http://localhost:9005/api/developer/register \
  -H "Content-Type: application/json" \
  -d '{"name": "Checkbox App", "redirectUri": "http://localhost:8080/callback"}'
```

Copy the returned `client_id` and `client_secret` into your `checkbox/.env`.

---

## 🔑 Environment Variables

### `oidc-auth-main/.env`

```env
# PostgreSQL (Neon or local)
DATABASE_URL=postgresql://user:password@host/dbname

# Server port
PORT=9005
```

### `checkbox/.env`

```env
# Server
PORT=8080

# Redis (Upstash or local)
REDIS_HOST=your-redis-host
REDIS_PORT=6379
REDIS_PASSWORD=your-redis-password

# OIDC Authentication
OIDC_CLIENT_ID=your_client_id_here
OIDC_CLIENT_SECRET=your_client_secret_here
OIDC_SERVER_URL=http://localhost:9005
OIDC_REDIRECT_URI=http://localhost:8080/callback
```

---

## 🔴 Redis Setup Instructions

### Option A: Local Redis (Development)

```bash
# Install and start Redis (macOS)
brew install redis && brew services start redis

# Install and start Redis (Ubuntu/Debian)
sudo apt install redis-server && sudo service redis start
```

Leave `REDIS_PASSWORD` empty and use `localhost:6379`.

### Option B: Upstash (Production / Free Tier)

1. Go to [console.upstash.com](https://console.upstash.com) and create a free Redis database
2. Choose your region
3. From the **Details** page, copy:
   - **Endpoint** → `REDIS_HOST`
   - **Port** → `REDIS_PORT`
   - **Password** → `REDIS_PASSWORD`
4. Paste these values into your `checkbox/.env` or Render environment variables

---

## 🔐 Auth Flow Explanation

This project implements the **OIDC Authorization Code Flow**:

```
User clicks "Login"
        │
        ▼
[Checkbox App] → GET /login
        │  Redirects to →
        ▼
[OIDC Auth Server] GET /authorize?client_id=...&redirect_uri=...
        │  Validates client, checks session cookie
        │  No session? → Redirect to /authenticate.html (login page)
        ▼
User enters email + password on authenticate.html
        │
        ▼
[OIDC Auth Server] POST /o/authenticate/sign-in
        │  Looks up user in Neon DB
        │  Verifies PBKDF2-hashed password
        │  Sets httpOnly `oidc_session` cookie (user UUID)
        │  Redirects back to /authorize
        ▼
[OIDC Auth Server] GET /authorize (now has valid session)
        │  Generates a short-lived one-time `code`
        │  Stores code in DB (expires in 60 seconds)
        │  Redirects to → redirect_uri?code=...
        ▼
[Checkbox App] GET /callback?code=...
        │  Sends POST /token with client_id + client_secret + code
        ▼
[OIDC Auth Server] POST /token
        │  Validates client credentials + code
        │  Deletes code (one-time use)
        │  Signs RS256 JWT with user's name, email, userId
        │  Returns { access_token, token_type, expires_in }
        ▼
[Checkbox App] Stores JWT in httpOnly `token` cookie
        │  Sets visible `logged_in` cookie for frontend
        │  Redirects user to /
        ▼
User is logged in ✅ — Name shown in nav bar
```

---

## 📡 WebSocket Flow Explanation

The checkbox state is synchronized in real-time across all connected browsers using Socket.IO and Redis Pub/Sub:

```
Browser clicks a checkbox
        │
        ▼ (WebSocket)
[Checkbox Server] receives "client:checkbox:click" { index, checked }
        │
        ├─ Updates state in Redis (key: "checkbox-state")
        │
        └─ Publishes to Redis channel "internal-server:checkbox:update"
                │
                ▼ (Redis Pub/Sub — works across multiple server instances)
[All Checkbox Servers] receive the published message
        │
        └─ Emit "server:checkbox:update" to ALL connected sockets
                │
                ▼ (WebSocket to every browser)
All connected browsers update that checkbox instantly ✅
```

This architecture scales horizontally — multiple instances of the checkbox server can run simultaneously, all staying in sync via Redis.

---

## ⏱️ Rate Limiting Logic Explanation

To prevent checkbox spamming, a **client-side cooldown** is enforced:

- A `lastClickTime` variable tracks the timestamp of the last successful checkbox click
- When a checkbox is clicked, the elapsed time since the last click is calculated
- If **less than 1 second** has passed:
  - The checkbox is **reverted** to its previous state
  - An error message is displayed: _"Wait a moment before clicking again."_
- If **1 second or more** has passed:
  - The click is accepted and emitted to the server via Socket.IO
  - `lastClickTime` is updated

```javascript
const elapsed = Date.now() - lastClickTime;
if (elapsed < 1000 && lastClickTime !== 0) {
    // Revert and show error
} else {
    // Allow and emit
}
```

> **Note:** This is a frontend-only rate limit for UX purposes. For production, server-side rate limiting per user (e.g., using Redis with a sliding window) should also be implemented.

---

## 🔒 Security Notes

| Feature | Implementation |
|---|---|
| Password storage | PBKDF2-SHA512, 100,000 iterations, random 16-byte salt per user |
| JWT signing | RSA 2048-bit (RS256); auto-generates in-memory key if `.pem` is absent |
| Session cookie | `httpOnly: true`, `sameSite: lax` — not readable by JavaScript |
| Token cookie | `httpOnly: true` — only accessible server-side via `/api/me` |
| Auth codes | Single-use, stored in DB, expire in 60 seconds |

---

## 🌐 Deployment

Both services are deployed on **[Render](https://render.com)** (free tier):

| Service | URL |
|---|---|
| Checkbox App | https://checkbox-w1gl.onrender.com |
| OIDC Auth Server | https://oidc-auth-main.onrender.com |

All secrets (database URLs, Redis credentials, OIDC client secrets) are stored as **Environment Variables** in the Render dashboard — never in source code.

---

## 📸 Screenshots

> Visit the live demo: **[checkbox-w1gl.onrender.com](https://checkbox-w1gl.onrender.com)**
