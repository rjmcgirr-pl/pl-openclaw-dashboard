# Cloudflare Task Board - Development Guide

## GitHub Actions Deployment

The project includes automated deployment via GitHub Actions. See `.github/workflows/deploy.yml`.

### Required Secrets

Configure these in your GitHub repository (Settings → Secrets and variables → Actions):

| Secret | How to Get It |
|--------|---------------|
| `CLOUDFLARE_API_TOKEN` | Cloudflare Dashboard → Profile → API Tokens → Create Token |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare Dashboard → Copy from right sidebar |

### API Token Permissions

Create a token with these permissions:
- **Cloudflare Pages**: Edit
- **Workers Scripts**: Edit
- **Account**: Read

### Workflow Behavior

- Triggers on push to `main` branch (only when files in `cloudflare-taskboard/` change)
- Can be manually triggered via "Run workflow" button
- Deploys Worker first, then Pages (sequential)
- Check Actions tab for deployment status

## Commands Reference

### Database
```bash
# Create database
wrangler d1 create taskboard-db

# Execute schema
wrangler d1 execute taskboard-db --file=./schema.sql

# List databases
wrangler d1 list

# Query data
wrangler d1 execute taskboard-db --command="SELECT * FROM tasks"

# Backup
wrangler d1 export taskboard-db --output=backup.sql
```

### Worker (API)
```bash
cd worker/

# Local development
wrangler dev

# Deploy
wrangler deploy

# View logs
wrangler tail
```

### Pages (Frontend)
```bash
# Local development
wrangler pages dev public --port 8788

# Deploy
wrangler pages deploy public --project-name=taskboard
```

## Configuration

### Update Worker wrangler.toml after D1 creation

When you run `wrangler d1 create`, you'll get output like:
```
[[d1_databases]]
binding = "DB" # available in your Worker on env.DB
database_name = "taskboard-db"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

Copy the `database_id` into `worker/wrangler.toml`.

### Custom Domain (Optional)

To use a custom domain for your Pages site:
1. Go to Cloudflare Dashboard → Pages → Your Project
2. Settings → Domains → Add Custom Domain

## Development Workflow

1. Start Worker dev server: `cd worker && wrangler dev`
2. Start Pages dev server: `wrangler pages dev public --port 8788`
3. Make changes to code
4. Changes auto-reload in dev servers
5. Test locally at `http://localhost:8788`
6. Deploy when ready:
   - `cd worker && wrangler deploy`
   - `wrangler pages deploy public --project-name=taskboard`

## Common Issues

**"Cannot find module" errors:**
```bash
cd worker
npm install
```

**Port already in use:**
```bash
# Use a different port
wrangler pages dev public --port 8789
```

**D1 binding errors:**
Make sure you're running `wrangler dev` from inside the `worker/` directory where `wrangler.toml` is located.
