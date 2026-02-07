# ⚡ PL OpenClaw Dashboard

A secure, full-stack task management board built with Cloudflare Workers, D1 (SQLite), and Pages. Features a kanban-style interface with drag-and-drop support and password protection.

**Live URL:** https://openclaw.propertyllama.com

![Dashboard Preview](https://openclaw.propertyllama.com/preview.png)

## Features

- 🔐 **Password Protected** — Secure login required
- 📋 **Kanban Board** — 5 columns: Inbox, Up Next, In Progress, In Review, Done
- 🖱️ **Drag & Drop** — Move tasks between columns
- ➕ **Create/Edit/Delete** — Full CRUD for tasks
- 🏷️ **Task Properties** — Priority, blocked status, agent assignment
- 🔄 **Auto-refresh** — Board updates every 30 seconds
- 🌙 **Dark Theme** — Easy on the eyes
- ⚡ **Branded** — Custom logo and styling

## Architecture

| Component | Technology | URL |
|-----------|-----------|-----|
| Frontend | Cloudflare Pages | https://openclaw.propertyllama.com |
| Backend | Cloudflare Worker | https://taskboard-api.rei-workers.workers.dev |
| Database | Cloudflare D1 (SQLite) | openclaw-taskboard-db |

## Quick Start

### Prerequisites

- Node.js 18+
- Wrangler CLI: `npm install -g wrangler`
- Cloudflare account

### Local Development

```bash
# 1. Install dependencies
cd worker
npm install

# 2. Create local D1 database (one time)
wrangler d1 create taskboard-db-local
# Copy the database_id to worker/wrangler.toml

# 3. Apply schema
wrangler d1 execute taskboard-db-local --file=../schema.sql

# 4. Set local password
# Edit worker/wrangler.toml [env.local] section

# 5. Start Worker (Terminal 1)
wrangler dev

# 6. Start Pages frontend (Terminal 2)
wrangler pages dev public --port 8788
```

Open http://localhost:8788 and login with the local password.

## Deployment

### Automated (GitHub Actions)

Pushes to `main` branch auto-deploy via GitHub Actions:

1. Worker deploys first
2. Pages deploys second (if Worker succeeds)

### Required Secrets

Add these to GitHub → Settings → Secrets → Actions:

| Secret | Description |
|--------|-------------|
| `CLOUDFLARE_API_TOKEN` | Cloudflare API token with Workers, D1, Pages edit permissions |
| `CLOUDFLARE_ACCOUNT_ID` | Your Cloudflare account ID |
| `D1_DATABASE_ID` | D1 database ID |
| `DASHBOARD_PASSWORD` | Password for accessing the dashboard |

### Manual Deploy

```bash
# Deploy Worker
cd worker
wrangler deploy

# Deploy Pages
wrangler pages deploy public --project-name=taskboard
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/tasks` | List tasks (filter: `?status=`, `?assigned_to_agent=true`) |
| GET | `/tasks/:id` | Get single task |
| POST | `/tasks` | Create task |
| PATCH | `/tasks/:id` | Update task |
| DELETE | `/tasks/:id` | Delete task |

**Auth Header:** All requests require `X-Dashboard-Password: your-password`

## Project Structure

```
├── .github/workflows/deploy.yml  # CI/CD
├── public/                       # Frontend (Pages)
│   ├── index.html
│   ├── styles.css
│   └── app.js
├── worker/                       # Backend (Worker)
│   ├── src/
│   │   ├── index.ts             # API routes
│   │   └── types.ts             # TypeScript types
│   ├── wrangler.toml
│   └── package.json
├── schema.sql                    # Database schema
├── README.md                     # This file
├── CLAUDE.md                     # AI assistant context
└── CHANGELOG.md                  # Version history
```

## Security

- Password stored in Cloudflare Worker environment variables
- Password header required on all API requests
- Frontend stores password in sessionStorage (cleared on browser close)
- No plaintext secrets in repository

## See Also

- [CHANGELOG.md](./CHANGELOG.md) — Version history
- [CLAUDE.md](./CLAUDE.md) — AI assistant guide
- [DEVELOPMENT.md](./DEVELOPMENT.md) — Detailed dev setup

## License

MIT
