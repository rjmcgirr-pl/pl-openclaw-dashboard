# Task Comments System - Requirements Document

**Project:** OpenClaw Task Board  
**Version:** 1.0  
**Date:** 2026-02-08  
**Status:** Draft for Review

---

## Executive Summary

Enable bidirectional communication between Richard and AI agents on tasks through a comprehensive comments system with threaded replies, @mentions, notifications, and agent-specific features.

---

## MVP Phase (Must-Have for Launch)

### 1. Core Comments
- Add/view comments on any task
- Threaded replies (2-level nesting: comment → reply)
- Plain text with line breaks preserved
- 2000 character limit per comment
- Soft delete (hide but retain for audit)

### 2. Agent Integration
- API endpoint for agents to POST comments
- Visual distinction: Agent comments have 🤖 badge + color coding
- Agent comment types: `status_update`, `question`, `completion`, `generic`
- Task "claiming" via special comment type

### 3. @Mentions
- Syntax: `@richard`, `@clawdbot`
- Mentions parsed and stored in JSON array
- In-app notifications for mentions

### 4. Basic Notifications
- Badge on task cards showing unread count
- Clicking task marks comments as read
- Simple notification dropdown

### 5. Quick Actions
- Predefined quick replies: "Got it", "Please proceed", "Need more info"
- Emoji reactions: 👍 ✅ ❓ 🚀

---

## Full Feature Set (Post-MVP)

### Phase 2: Enhanced Communication
- Markdown support (bold, italic, code blocks, lists)
- File attachments (images, logs, up to 5MB)
- Edit comments within 5-minute window
- Email notifications for @mentions
- Slack DM integration for urgent mentions

### Phase 3: Advanced Features
- Agent webhook notifications
- Typing indicators
- Real-time updates via WebSockets
- Comment search/filtering
- Export/audit logs

---

## Database Schema

```sql
-- Comments table
CREATE TABLE comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER NOT NULL,
    parent_comment_id INTEGER NULL,
    
    author_type TEXT NOT NULL, -- 'human', 'agent', 'system'
    author_id TEXT NOT NULL,   -- email or agent name
    author_name TEXT NOT NULL,
    
    content TEXT NOT NULL,
    agent_comment_type TEXT NULL, -- 'status_update', 'question', 'completion', 'generic', 'claim'
    
    mentions JSON, -- ["richard", "clawdbot"]
    
    is_edited INTEGER DEFAULT 0,
    is_deleted INTEGER DEFAULT 0,
    
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
    FOREIGN KEY (parent_comment_id) REFERENCES comments(id) ON DELETE CASCADE
);

CREATE INDEX idx_comments_task_id ON comments(task_id, created_at DESC);
CREATE INDEX idx_comments_parent ON comments(parent_comment_id);

-- Reactions
CREATE TABLE comment_reactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    comment_id INTEGER NOT NULL,
    reactor_type TEXT NOT NULL,
    reactor_id TEXT NOT NULL,
    emoji TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(comment_id, reactor_type, reactor_id, emoji),
    FOREIGN KEY (comment_id) REFERENCES comments(id) ON DELETE CASCADE
);

-- Notifications
CREATE TABLE comment_notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    comment_id INTEGER NOT NULL,
    task_id INTEGER NOT NULL,
    is_read INTEGER DEFAULT 0,
    read_at TEXT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, comment_id),
    FOREIGN KEY (comment_id) REFERENCES comments(id) ON DELETE CASCADE
);

-- Task comment count cache
ALTER TABLE tasks ADD COLUMN comment_count INTEGER DEFAULT 0;
ALTER TABLE tasks ADD COLUMN last_comment_at TEXT NULL;
```

---

## API Endpoints (MVP)

### Comments
```
GET    /tasks/:id/comments          - List comments (with pagination)
POST   /tasks/:id/comments          - Create comment
PATCH  /comments/:id                - Edit comment (5min window)
DELETE /comments/:id                - Soft delete

POST   /comments/:id/reactions      - Add reaction
DELETE /comments/:id/reactions      - Remove reaction
```

### Notifications
```
GET    /notifications               - List unread notifications
POST   /notifications/:id/read      - Mark as read
POST   /notifications/read-all      - Mark all as read
```

### Agent-Only
```
POST   /tasks/:id/agent-comment     - Agent-specific endpoint with auth
POST   /tasks/:id/claim             - Claim task
POST   /tasks/:id/release           - Release claim
```

---

## Frontend UI

### Task Card Changes
- Small badge showing comment count (if > 0)
- Dot indicator for unread comments

### Task Detail Modal (New)
- Expandable comments section
- Threaded view with indentation for replies
- Comment input box at bottom
- @mention autocomplete on typing "@"
- Quick reply buttons below each agent comment

### Agent Comment Styling
- Left border color by type:
  - 🔄 status_update = blue
  - ❓ question = yellow
  - ✅ completion = green
  - 🤖 generic = purple
- Agent avatar/badge in header

---

## Cron Job Integration

### Automatic Updates
When cron job runs on an assigned task:
1. POST status update comment at start
2. POST progress updates every 30s (if long-running)
3. POST completion summary at end
4. POST error details if failed (with @mention to relevant agent)

### Checking for Instructions
Before cron job executes:
1. Query task comments for unread @mentions to agent
2. Parse for keywords: "STOP", "PAUSE", "CHANGE: x"
3. Respect instructions or ask for clarification

---

## Implementation Plan

### Week 1: Database & API
- Create tables
- Build REST endpoints
- Add authentication middleware

### Week 2: Frontend MVP
- Add comments section to task modal
- Basic CRUD UI
- Agent styling

### Week 3: Integration
- Wire up notifications
- Add quick replies
- Cron job integration

### Week 4: Polish & Launch
- Bug fixes
- Performance optimization
- Documentation

---

## Questions for Richard

1. **Markdown support:** MVP (plain text only) or Phase 2 (markdown)?
2. **File attachments:** Needed in MVP or can wait?
3. **Email notifications:** Critical for MVP or Slack-only to start?
4. **Quick replies:** Which preset responses are most useful?
5. **Agent claim visibility:** Should claimed tasks show agent name on board?

---

**Please review and provide feedback on priorities and scope!**
