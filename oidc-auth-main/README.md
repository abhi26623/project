# 🔐 OIDC Auth Server — Custom Identity Provider

A lightweight **OIDC-compatible Identity Provider** built with **Express**, **Drizzle ORM**, and **PostgreSQL**. Supports the **OAuth 2.0 Authorization Code Flow** with **RS256 JWT** signing. Any third-party app can register as a client, redirect users to the login page, and receive a signed JWT upon authentication.

## 🏗 Architecture

```
┌─────────────┐                        ┌──────────────┐                    ┌────────────┐
│  3rd Party   │   /authorize           │  OIDC Auth   │   Drizzle ORM     │ PostgreSQL │
│  App         │ ──────────────────►   │  Server      │ ◄───────────────► │ :5432      │
│  (Checkbox)  │                       │  :9005       │                    │            │
│              │ ◄──────────────────   │              │                    │ - users    │
│              │   ?code=abc123         │              │                    │ - clients  │
└──────┬───────┘                       └──────────────┘                    │ - codes    │
       │                                      │                            └────────────┘
       │  POST /token                         │
       │  { code, client_secret }             │
       │                                      ▼
       │                               ┌──────────────┐
       └──────────────────────────►    │  JWT Signed   │
                                       │  with RS256   │
         ◄─────────────────────────    │  Private Key  │
           { access_token: "ey..." }   └──────────────┘
```

## 🚀 Quick Start

### Prerequisites
- **Node.js** 18+
- **pnpm** (or npm/yarn)
- **Docker** (for PostgreSQL)
- **OpenSSL** (for key generation)

### 1. Clone & Install

```bash
git clone <your-repo-url>
cd oidc-auth-main
pnpm install
```

### 2. Start PostgreSQL

```bash
docker compose up -d
```

### 3. Generate RSA Keys

```bash
# Linux / macOS
bash key-gen.sh

# Windows (Git Bash or WSL)
bash key-gen.sh
```

This creates `cert/private-key.pem` and `cert/public-key.pub`.

### 4. Configure Environment

```bash
cp .env.example .env
# Edit .env with your database URL
```

### 5. Run Database Migrations

```bash
pnpm db:generate
pnpm db:migrate
```

### 6. Run

```bash
# Development (auto-restart on TypeScript changes)
pnpm dev

# Production
pnpm build
pnpm start
```

Open [http://localhost:9005](http://localhost:9005) to verify.

## ⚙️ Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `9005` |
| `DATABASE_URL` | PostgreSQL connection string | — |

## 📡 API Endpoints

### Developer Registration
```
POST /api/developer/register
Body: { "name": "My App", "redirectUri": "https://myapp.com/callback" }
Response: { "client_id": "...", "client_secret": "..." }
```

### Authorization (Browser Redirect)
```
GET /authorize?client_id=xxx&redirect_uri=https://myapp.com/callback
→ Redirects to login page if not authenticated
→ Redirects to redirect_uri?code=xxx if authenticated
```

### Token Exchange (Server-to-Server)
```
POST /token
Body: { "client_id": "...", "client_secret": "...", "code": "..." }
Response: { "access_token": "eyJ...", "token_type": "Bearer", "expires_in": 3600 }
```

## 🔑 Security

- **JWT Signing:** RS256 (asymmetric) using a private key stored in `cert/`
- **Authorization Codes:** Expire after 60 seconds, single-use
- **Session Tracking:** `httpOnly` cookies prevent XSS token theft
- **Client Secrets:** Verified server-side during token exchange

## 🛠 Tech Stack

- **Runtime:** Node.js + TypeScript
- **Framework:** Express 5
- **ORM:** Drizzle ORM
- **Database:** PostgreSQL
- **Auth:** OAuth 2.0 Authorization Code Flow, RS256 JWT
- **Build:** tsc + tsc-watch

## 📄 License

ISC
