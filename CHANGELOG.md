# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- SSE Infrastructure with Durable Objects (Ticket #20):
  - New Durable Object: `SSEConnectionManager` for managing SSE connections
  - New endpoint: `GET /sse/connect` with JWT token authentication
  - Connection stats endpoint: `GET /sse/stats` (admin/debug use)
  - Support for token-based authentication via query param or Authorization header
  - CORS-enabled for cross-origin connections
  - Automatic connection cleanup on disconnect

### Added
- Task Event Broadcasting (Ticket #22):
  - Events emitted on task CRUD operations:
    - `task.created` - when a new task is created
    - `task.updated` - when a task is modified
    - `task.deleted` - when a task is deleted
    - `task.status_changed` - when task status changes (includes previous/new status)
  - User-scoped broadcasting: clients only receive events they have permission for
  - Event middleware: `worker/src/middleware/taskEvents.ts` for hooking into CRUD
  - Broadcast utility: `worker/src/sse/broadcast.ts` for sending events

### Added
- Archive All Closed Tasks feature (Ticket #28):
  - New API endpoint: `POST /tasks/archive-closed` (admin only)
  - "📦 Archive Closed" button in header with warning styling
  - Confirmation modal showing count of tasks to be archived
  - Toast notifications for success/error feedback
  - Archived tasks are filtered from default board view
  - New 'archived' status added to task workflow
  - Admin authentication checks via JWT, session, or Agent API Key

### Added
- Password protection for dashboard access
- Login modal with sessionStorage persistence
- API authentication via `X-Dashboard-Password` header

### Added
- Branded header with logo (⚡ icon) and gradient styling
- Animated logo with pulse effect

### Added
- Staging environment for safe deployment testing
- Automated deployment pipeline with 5 stages
- Cron job monitoring system:
  - Tasks/Cron Monitor tabs in UI
  - API endpoints for job logging
  - PowerShell helper script
  - Database tables for job tracking

### Fixed
- Use Node.js for secret injection (handles any special characters in passwords)
- Add cache-busting headers and versioned assets to prevent stale code
- Add `X-Dashboard-Password` to CORS allowed headers
- Fix: setupEventListeners was not called when showing login form

## [1.0.0] - 2026-02-07

### Added
- Initial release of PL OpenClaw Dashboard
- Cloudflare Workers backend with REST API
- Cloudflare D1 database for task storage
- Cloudflare Pages frontend with kanban board
- GitHub Actions auto-deployment workflow
- 5-column kanban: Inbox, Up Next, In Progress, In Review, Done
- Drag-and-drop task movement
- Create, edit, delete tasks
- Task properties: priority, blocked status, agent assignment
- Auto-refresh every 30 seconds
- Dark theme UI
- CORS support for cross-origin requests

### Security
- Environment-based configuration (no secrets in code)
- D1 database ID injected at deploy time
- Worker and Pages projects auto-created on first deploy

### Infrastructure
- D1 database: `openclaw-taskboard-db`
- Worker: `taskboard-api`
- Pages: `taskboard`
- Custom domain: openclaw.propertyllama.com

## Template

### Added
- New features

### Changed
- Changes in existing functionality

### Deprecated
- Soon-to-be removed features

### Removed
- Now removed features

### Fixed
- Bug fixes

### Security
- Security improvements
