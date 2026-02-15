# Activity Log & Agent Identity - Requirements & Acceptance Criteria

**Date:** 2026-02-15
**Status:** Complete

---

## 1. Database: `activity_log` table

### Requirements
- [x] Create `activity_log` table with columns: `id`, `action_type`, `actor_type` (human/agent/system), `actor_id`, `actor_name`, `resource_type` (task/comment/cron_job/reaction), `resource_id`, `task_id` (nullable FK for linking to tasks), `task_name` (denormalized for display), `summary` (human-readable sentence), `details` (JSON for extra context), `created_at`
- [x] Create migration file `migrations/004_activity_log.sql`
- [x] Add to `schema.sql`
- [x] Add indexes on `action_type`, `task_id`, `created_at`, `actor_id`
- [x] Add `ActivityLog` and `ActivityActionType` types to `types.ts`

### Acceptance Criteria
- Table exists with all columns
- Types compile cleanly
- Migration is idempotent (IF NOT EXISTS)

---

## 2. Agent Identity Enforcement

### Requirements
- [x] Agents MUST provide `X-Agent-Name` header (a display name like "QA Agent") on all mutating requests
- [x] Update `validateAgentApiKey()` to also extract `X-Agent-Name` header, return it as `agentName`
- [x] Update `getCurrentUser()` to use `agentName` from header instead of hardcoded 'clawdbot'
- [x] If an agent authenticates with API key but is missing `X-Agent-Name`, return 400 with verbose error: `"Agent identification required. You must provide the 'X-Agent-Name' header with a human-readable display name (e.g., 'QA Agent', 'Deploy Bot'). This is used to identify your actions in the activity log. The 'X-Agent-API-Key' header was valid but 'X-Agent-Name' is also required for all mutating requests (POST, PATCH, DELETE)."`
- [x] Non-mutating requests (GET) from agents should still work without `X-Agent-Name` (backward compat)

### Acceptance Criteria
- Agent POST/PATCH/DELETE without `X-Agent-Name` returns 400 with verbose error
- Agent GET requests work without `X-Agent-Name`
- Agent with both headers: `getCurrentUser()` returns `{ type: 'agent', id: 'clawdbot', name: 'QA Agent' }`
- All verbose errors include: what's missing, why it's needed, example of correct usage

---

## 3. Verbose Validation Errors

### Requirements
- [x] All validation errors across the API must be verbose and helpful for agent retries
- [x] Error responses should include: `error` (message), `field` (which field failed), `hint` (how to fix it)
- [x] Update `createTask` validation errors
- [x] Update `createComment` / `createAgentComment` validation errors
- [x] Update `claimTask` / `releaseTask` validation errors
- [x] Update `updateTask` validation errors

### Acceptance Criteria
- Every 400 error includes `error`, `field` (if applicable), and `hint` fields
- Error messages explain what the agent did wrong and how to fix it

---

## 4. Backend: `logActivity()` Helper

### Requirements
- [x] Create `logActivity(env, params)` function that inserts into `activity_log` and broadcasts via SSE
- [x] Parameters: `{ actionType, actorType, actorId, actorName, resourceType, resourceId, taskId?, taskName?, summary, details? }`
- [x] The `summary` field is a human-readable sentence like: `QA Agent commented on task #5 - "Setup D1 database"`
- [x] Broadcast `activity.created` SSE event to all clients after insert
- [x] Function must be fire-and-forget (never fail the parent request)

### Acceptance Criteria
- Activity is persisted to DB
- SSE event fires with full activity record
- Parent request succeeds even if logging fails

---

## 5. Backend: `GET /activity` Endpoint

### Requirements
- [x] Route: `GET /activity`
- [x] Query params: `types` (comma-separated action types to include), `search` (text search on summary), `task_id` (filter to specific task), `limit` (default from admin setting `activity_stream_limit`), `offset` (pagination)
- [x] Returns: `{ activities: ActivityLog[], total: number }`
- [x] Ordered by `created_at DESC`
- [x] Requires session auth (same as other routes)

### Acceptance Criteria
- `GET /activity` returns all activities
- `GET /activity?types=task.created,comment.created` filters by types
- `GET /activity?search=QA%20Agent` searches summary text
- `GET /activity?task_id=5` returns only activities for task 5
- `GET /activity?task_id=5&types=comment.created` combines filters
- Limit respects admin setting

---

## 6. Instrument All Operations

### Requirements
Every data mutation must log an activity with a descriptive summary:

- [x] **Task created**: `"{actor} created task #{id} - "{name}""`
- [x] **Task updated**: `"{actor} updated task #{id} - "{name}" ({changed fields})"`
- [x] **Task deleted**: `"{actor} deleted task #{id} - "{name}""`
- [x] **Task status changed**: `"{actor} moved task #{id} - "{name}" from {old} to {new}"`
- [x] **Task archived** (via archive-closed): `"System archived {count} completed tasks"`
- [x] **Comment created**: `"{actor} commented on task #{id} - "{name}": "{preview}""`
- [x] **Comment edited**: `"{actor} edited comment on task #{id} - "{name}""`
- [x] **Comment deleted**: `"{actor} deleted comment on task #{id} - "{name}""`
- [x] **Agent comment created**: `"{agent_name} commented on task #{id} - "{name}": "{preview}""`
- [x] **Task claimed**: `"{agent_name} claimed task #{id} - "{name}""`
- [x] **Task released**: `"{agent_name} released task #{id} - "{name}""`
- [x] **Reaction added**: `"{actor} reacted {emoji} to comment on task #{id}"`
- [x] **Reaction removed**: `"{actor} removed {emoji} reaction from comment on task #{id}"`
- [x] **Cron job created**: `"{actor} created cron job "{name}""`
- [x] **Cron job updated**: `"{actor} updated cron job "{name}""`
- [x] **Cron job deleted**: `"{actor} deleted cron job "{name}""`
- [x] **Cron job started**: `"{actor} started cron job "{name}""`
- [x] **Cron job ended**: `"Cron job "{name}" completed with status {status}"`

### Action Types
```
task.created, task.updated, task.deleted, task.status_changed, task.archived,
comment.created, comment.updated, comment.deleted,
reaction.added, reaction.removed,
cron_job.created, cron_job.updated, cron_job.deleted, cron_job.started, cron_job.ended,
task.claimed, task.released
```

### Acceptance Criteria
- Every mutation creates an activity_log row
- Summary text is human-readable and includes who, what, when
- taskId is set whenever the action relates to a task
- taskName is denormalized for fast display

---

## 7. SSE: `activity.created` Event

### Requirements
- [x] Add `'activity.created'` to `TaskEvent.type` union
- [x] Add `activity?: Record<string, unknown>` to `TaskEvent` interface
- [x] Add `broadcastActivity()` to `broadcast.ts`
- [x] `logActivity()` calls `broadcastActivity()` after DB insert

### Acceptance Criteria
- SSE clients receive `activity.created` events in real-time
- Event payload includes full activity record

---

## 8. Frontend: Activity Tab

### Requirements
- [x] Add "Activity" tab button in nav, positioned SECOND (after Tasks, before Archive)
- [x] Tab content area with:
  - **Search bar** at top (text input, searches on keystroke with debounce)
  - **Type filter chips** (multi-select, toggleable): Task, Comment, Status Change, Cron Job, Reaction, Agent Action
  - **Activity feed** below filters
- [x] Each activity item displays:
  - Actor icon (human avatar/agent bot icon)
  - Rich summary with **clickable task link** (opens task modal) and **clickable comment link**
  - Relative time: less than 1 day = "Xh Ym ago" or "Xm ago"; 1 day or more = full date/time
- [x] Feed loads on tab switch via `GET /activity`
- [x] Pagination: "Load more" button at bottom (offset-based)

### Acceptance Criteria
- Tab appears second in nav
- Filter chips toggle on/off, multiple can be active
- Search filters activity list in real-time
- Clicking task reference opens task modal
- Time formatting matches spec (<1 day relative, >=1 day absolute)
- Feed loads fresh data each time tab is opened

---

## 9. Frontend: Task Modal Activity Tab

### Requirements
- [x] Add third tab to task modal: "Activity" (after Details, Comments)
- [x] Shows activity feed filtered to `task_id` of the open task
- [x] Same item rendering as main Activity tab (clickable links, relative time)
- [x] No type filters or search needed (task-scoped is enough)
- [x] Loads on tab click via `GET /activity?task_id={id}`

### Acceptance Criteria
- Third tab appears in task modal (Details | Comments | Activity)
- Activity is filtered to current task only
- Items show who did what and when

---

## 10. Frontend: Notification Panel Time Formatting

### Requirements
- [x] Update `renderNotificationPanel()` to use the same relative time function
- [x] Less than 1 day: "2h 15m ago", "45m ago", "just now"
- [x] 1 day or more: full date/time string

### Acceptance Criteria
- Notification panel uses relative time for recent items
- Older items show full date/time

---

## 11. Frontend: SSE Real-Time Updates

### Requirements
- [x] Add `activity.created` SSE event listener
- [x] When received and Activity tab is active: prepend new activity to feed (no full reload)
- [x] When received and Activity tab is NOT active: show a subtle indicator/badge on tab
- [x] When received and task modal is open with Activity tab: prepend if matching task_id
- [x] Update activity count badge on Activity tab when new activities arrive
- [x] Fix SSE event dispatch: onmessage handler now dispatches to named handlers based on JSON type field

### Acceptance Criteria
- New activities appear instantly in feed without refresh
- Activity tab shows unread count badge when not active
- Task modal activity updates in real-time for the open task

---

## 12. CSS Styles

### Requirements
- [x] Activity feed styles matching existing design system (card bg, border color, etc.)
- [x] Filter chip styles (toggleable, active state)
- [x] Search input style
- [x] Activity item layout (icon | content | time)
- [x] Clickable task/comment links styled as inline links
- [x] Responsive at mobile breakpoints
- [x] Activity tab badge for unread count

### Acceptance Criteria
- Consistent with existing dashboard design
- Readable on both desktop and mobile
- Filter chips clearly show active/inactive state

---

## Implementation Order

1. DB + Types + Migration ✅
2. Agent identity enforcement + verbose errors ✅
3. `logActivity()` helper + SSE broadcast ✅
4. `GET /activity` endpoint ✅
5. Instrument all mutations ✅
6. Frontend: relative time function + notification update ✅
7. Frontend: Activity tab UI + CSS ✅
8. Frontend: Task modal activity tab ✅
9. Frontend: SSE listener wiring ✅
10. TypeScript check, commit, push ✅
