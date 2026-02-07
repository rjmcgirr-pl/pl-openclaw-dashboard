# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Password protection for dashboard access
- Login modal with sessionStorage persistence
- API authentication via `X-Dashboard-Password` header

### Added
- Branded header with logo (⚡ icon) and gradient styling
- Animated logo with pulse effect

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
