# Cloudflare Task Board

A full-stack task management board built with Cloudflare Workers, D1 (SQLite), and Pages. Features a kanban-style interface with drag-and-drop support.

## Architecture

- **Frontend**: Static HTML/CSS/JS hosted on Cloudflare Pages
- **Backend**: Cloudflare Worker providing REST API
- **Database**: Cloudflare D1 (SQLite) for task storage

## Project Structure

```
cloudflare-taskboard/
├── .github/
│   └── workflows/
│       └── deploy.yml      # GitHub Actions auto-deployment
├── schema.sql              # D1 database schema
├── README.md               # This file
├── worker/                 # Cloudflare Worker (API)
│   ├── src/
│   │   ├── index.ts       # Main worker code
│   │   └── types.ts       # TypeScript types
│   ├── package.json
│   ├── tsconfig.json
│   └── wrangler.toml      # Worker configuration
└── public/                 # Frontend (deployed to Pages)
    ├── index.html
    ├── styles.css
    └── app.js
```

## Prerequisites

- Node.js 18+
- Wrangler CLI v3: `npm install -g wrangler`
- Cloudflare account

## Quick Start

### 1. Clone and Setup

```bash
cd cloudflare-taskboard/worker
npm install
```

### 2. Create D1 Database

```bash
# Create the database
wrangler d1 create taskboard-db

# Note the database ID from the output, then update worker/wrangler.toml:
# [[d1_databases]]
# binding = "DB"
# database_name = "taskboard-db"
# database_id = "YOUR_DATABASE_ID_HERE"
```

### 3. Initialize Database Schema

```bash
wrangler d1 execute taskboard-db --file=../schema.sql
```

### 4. Run Local Development

**Terminal 1 - Worker:**
```bash
cd worker
wrangler dev
```
The API will be available at `http://localhost:8787`

**Terminal 2 - Pages (Frontend):**
```bash
# In the project root (cloudflare-taskboard/)
wrangler pages dev public --port 8788
```
The frontend will be at `http://localhost:8788`

### 5. Deploy to Production

**Deploy the Worker:**
```bash
cd worker
wrangler deploy
```

Note the deployed Worker URL (e.g., `https://taskboard-api.your-account.workers.dev`)

**Deploy Pages (Frontend):**
```bash
# In the project root
wrangler pages deploy public --project-name=taskboard
```

**Update CORS (Optional but recommended):**
Edit `worker/wrangler.toml` and set your Pages domain:
```toml
[vars]
ALLOWED_ORIGIN = "https://taskboard.pages.dev"
```

Then redeploy the worker:
```bash
wrangler deploy
```

## GitHub Actions Auto-Deployment

The project includes a GitHub Actions workflow that automatically deploys both the Worker and Pages when you push to the `main` branch.

### Setup Instructions

1. **Push the code to a GitHub repository:**
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
   git push -u origin main
   ```

2. **Get your Cloudflare Account ID:**
   - Log into [Cloudflare Dashboard](https://dash.cloudflare.com)
   - Copy your Account ID from the right sidebar

3. **Create a Cloudflare API Token:**
   - Go to [Cloudflare API Tokens](https://dash.cloudflare.com/profile/api-tokens)
   - Click "Create Token"
   - Use the "Edit Cloudflare Workers" template or create custom token with these permissions:
     - **Cloudflare Pages**: Edit
     - **Workers Scripts**: Edit
     - **D1**: Edit (if you need to modify schema via Actions)
     - **Account**: Read (for account verification)
   - Include your account and zone resources
   - Create the token and copy it

4. **Add GitHub Secrets:**
   - Go to your GitHub repository → Settings → Secrets and variables → Actions
   - Add the following secrets:

   | Secret Name | Value |
   |-------------|-------|
   | `CLOUDFLARE_API_TOKEN` | Your Cloudflare API token |
   | `CLOUDFLARE_ACCOUNT_ID` | Your Cloudflare account ID |

5. **Trigger Deployment:**
   - Push any change to the `main` branch
   - Or manually trigger from Actions → Deploy Task Board → Run workflow
   - The workflow will:
     1. Deploy the Worker first
     2. Then deploy the Pages site (only if Worker succeeds)

### Monitoring Deployments

- View workflow runs: GitHub repository → Actions tab
- Green checkmark = successful deployment
- Red X = failed (check logs for errors)

### Disabling Auto-Deployment

To disable automatic deployments, either:
- Delete `.github/workflows/deploy.yml`
- Or change the `on.push.branches` to a non-existent branch in the workflow file

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/tasks` | List all tasks (optionally filter by `?status=` or `?assigned_to_agent=true`) |
| GET | `/tasks/:id` | Get a single task by ID |
| POST | `/tasks` | Create a new task |
| PATCH | `/tasks/:id` | Update a task (partial updates supported) |
| DELETE | `/tasks/:id` | Delete a task |

### Request/Response Examples

**Create Task:**
```bash
curl -X POST http://localhost:8787/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My Task",
    "description": "Task description",
    "status": "inbox",
    "priority": 3,
    "blocked": false,
    "assigned_to_agent": true
  }'
```

**Update Task Status:**
```bash
curl -X PATCH http://localhost:8787/tasks/1 \
  -H "Content-Type: application/json" \
  -d '{"status": "in_progress"}'
```

## Database Schema

```sql
CREATE TABLE tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'inbox',  -- inbox, up_next, in_progress, in_review, done
    priority INTEGER DEFAULT 0,
    blocked INTEGER DEFAULT 0,
    assigned_to_agent INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

## Features

- **Kanban Board**: 5 columns (Inbox, Up Next, In Progress, In Review, Done)
- **Drag & Drop**: Move tasks between columns
- **Task Properties**: Name, description, status, priority, blocked flag, agent assignment
- **Quick Actions**: Move buttons on each task card
- **Auto-refresh**: Board refreshes every 30 seconds
- **Dark Theme**: Easy on the eyes

## Environment Variables

| Variable | Description |
|----------|-------------|
| `DB` | D1 database binding (auto-configured in wrangler.toml) |
| `ALLOWED_ORIGIN` | CORS allowed origin (set to your Pages domain in production) |

## Troubleshooting

**CORS errors:**
- Check that `ALLOWED_ORIGIN` matches your frontend URL
- For local dev, use `*` or the local Pages URL

**Database not found:**
- Verify database_id in wrangler.toml matches your D1 database
- Run `wrangler d1 list` to see your databases

**Changes not persisting:**
- Local dev uses a local SQLite file by default
- For persistent local data, use `wrangler d1 execute` to seed data

## License

MIT
