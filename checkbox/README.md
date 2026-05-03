# ☑️ Checkbox — Real-Time Collaborative Checkboxes

A real-time collaborative checkbox app built with **Express**, **Socket.IO**, and **Redis**. Multiple users can see and interact with the same set of 100 checkboxes in real-time. Authentication is handled via a custom **OIDC Identity Provider** — guests can view checkboxes, but only logged-in users can click them.

## 🏗 Architecture

```
┌─────────────┐       WebSocket        ┌──────────────┐        Pub/Sub       ┌─────────┐
│   Browser    │ ◄──────────────────► │  Checkbox    │ ◄──────────────────► │  Redis  │
│  (Guest or   │       Socket.IO       │  Server      │       ioredis        │ (Valkey)│
│   Logged In) │                       │  :8080       │                      │  :6379  │
└──────┬───────┘                       └──────┬───────┘                      └─────────┘
       │                                      │
       │  OAuth redirect                      │  Token Exchange
       │                                      │
       ▼                                      ▼
┌──────────────┐                       ┌──────────────┐
│  OIDC Auth   │ ◄──────────────────── │  /callback   │
│  Server      │    Authorization      │  route       │
│  :9005       │    Code Flow          │              │
└──────────────┘                       └──────────────┘
```

## 🚀 Quick Start

### Prerequisites
- **Node.js** 18+
- **pnpm** (or npm/yarn)
- **Docker** (for Redis)
- A running [OIDC Auth Server](../oidc-auth-main)

### 1. Clone & Install

```bash
git clone <your-repo-url>
cd checkbox
pnpm install
```

### 2. Start Redis

```bash
docker compose up -d
```

### 3. Configure Environment

```bash
cp .env.example .env
# Edit .env with your OIDC credentials
```

### 4. Run

```bash
# Development (auto-restart on file changes)
pnpm dev

# Production
pnpm start
```

Open [http://localhost:8080](http://localhost:8080) in your browser.

## ⚙️ Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `8080` |
| `REDIS_HOST` | Redis hostname | `localhost` |
| `REDIS_PORT` | Redis port | `6379` |
| `REDIS_PASSWORD` | Redis password (for Upstash etc.) | _(empty)_ |
| `OIDC_CLIENT_ID` | OAuth Client ID from OIDC server | — |
| `OIDC_CLIENT_SECRET` | OAuth Client Secret from OIDC server | — |
| `OIDC_SERVER_URL` | Base URL of the OIDC Auth server | `http://localhost:9005` |
| `OIDC_REDIRECT_URI` | OAuth callback URL | `http://localhost:8080/callback` |

## 🔒 Authentication Flow

1. **Guest** opens the app → can **see** all checkboxes (read-only)
2. **Guest clicks** a checkbox → gets redirected to the OIDC login page
3. User **signs in** on the OIDC server
4. OIDC server redirects back to `/callback` with an authorization code
5. Checkbox server **exchanges** the code for a JWT token
6. Token is stored in an `httpOnly` cookie
7. User can now **click checkboxes** freely

## 🛠 Tech Stack

- **Runtime:** Node.js
- **Framework:** Express 5
- **Real-time:** Socket.IO
- **State Store:** Redis (via ioredis)
- **Auth:** OIDC / OAuth 2.0 Authorization Code Flow

## 📄 License

ISC
