# CLAUDE.md — AI Assistant Guide

This file helps AI assistants (Claude, etc.) understand and work with this project.

## Project Overview

**PL OpenClaw Dashboard** is a password-protected task board for managing AI agent tasks. It replaces external services like ClawDeck with a self-hosted Cloudflare solution.

### Key Design Decisions

1. **Cloudflare-native** — Workers + D1 + Pages for zero server maintenance
2. **Password auth** — Simple but effective protection (no user accounts)
3. **GitHub Actions CD** — Push to main = auto deploy
4. **No build step for frontend** — Vanilla JS for simplicity

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Cloudflare     │────▶│  Cloudflare     │────▶│  Cloudflare D1  │
│  Pages          │     │  Worker         │     │  (SQLite)       │
│  (Frontend)     │◄────│  (API)          │◄────│  (Tasks data)   │
└─────────────────┘     └─────────────────┘     └─────────────────┘
       │
       ▼
  User with password
```

## Common Tasks

### Add a New API Endpoint

1. Edit `worker/src/index.ts`
2. Add route handler in the `fetch` function
3. Implement the handler function (see `listTasks`, `createTask` patterns)
4. Update types in `worker/src/types.ts` if needed
5. Test locally with `wrangler dev`
6. Commit and push

### Modify Database Schema

1. Edit `schema.sql` with new table/column
2. Run migration manually on D1:
   ```bash
   wrangler d1 execute taskboard-db --file=./migration.sql
   ```
3. Update `worker/src/types.ts` Task interface
4. Test locally
5. Document in CHANGELOG.md

### Update Frontend

1. Edit files in `public/` folder
2. Test locally: `wrangler pages dev public`
3. Commit and push (GitHub Actions auto-deploys)

### Change Password

1. Update GitHub secret `DASHBOARD_PASSWORD`
2. Push any commit to trigger re-deploy
3. Worker gets new password from env vars

## Environment Variables

| Variable | Location | Purpose |
|----------|----------|---------|
| `DASHBOARD_PASSWORD` | GitHub Secrets → Worker env | Auth password |
| `D1_DATABASE_ID` | GitHub Secrets | Database binding |
| `DB` | Worker bindings | D1 database access |
| `ALLOWED_ORIGIN` | Worker vars | CORS (optional) |

## API Authentication

All API requests must include:
```
X-Dashboard-Password: <password>
```

The Worker compares this to `env.DASHBOARD_PASSWORD`.

## Deployment Pipeline

1. Push to `main` branch
2. GitHub Actions triggers
3. Inject secrets into wrangler.toml
4. Deploy Worker
5. Deploy Pages (only if Worker succeeds)
6. Both use same `CLOUDFLARE_API_TOKEN`

## Common Issues

### CORS Errors
- Check `ALLOWED_ORIGIN` in Worker matches Pages URL
- Or use `*` for development

### 401 Unauthorized
- Password header missing or wrong
- Check browser dev tools Network tab
- Clear sessionStorage and re-login

### Database Not Found
- Verify `D1_DATABASE_ID` in GitHub secrets
- Check database exists in Cloudflare dashboard

### Cache Issues
- Hard refresh: `Ctrl+Shift+R`
- Or clear site data in dev tools

## Security Considerations

- Password is in sessionStorage ( survives refresh, not browser restart )
- No rate limiting on API (Cloudflare handles some DDoS)
- No user sessions (single shared password)
- CORS allows any origin currently (can restrict)

## Dependencies

- `wrangler` — CLI for Cloudflare deployment
- No runtime dependencies (Worker uses native fetch/D1)

## Testing

No automated tests yet. Manual test checklist:

- [ ] Login with password
- [ ] Create task
- [ ] Move task between columns
- [ ] Edit task
- [ ] Delete task
- [ ] Auto-refresh works
- [ ] Logout and re-login works

## Documentation Maintenance

**Always update before pushing:**
1. `CHANGELOG.md` — Add version entry
2. `CLAUDE.md` — Update if architecture changes
3. `README.md` — Keep in sync

## Repository

https://github.com/rjmcgirr-pl/pl-openclaw-dashboard
