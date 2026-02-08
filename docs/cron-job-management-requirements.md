# Cron Job Management Feature Requirements

## 1. Executive Summary

**Objective:** Build a unified cron job management interface that allows viewing and editing ALL cron job information, including the actual task instructions (payload) that OpenClaw uses to execute jobs.

**Current Problem:** 
- Dashboard stores basic metadata (name, description, schedule, skill reference)
- OpenClaw stores task instructions (payload) separately
- Users cannot view or edit task instructions without direct OpenClaw access

**Proposed Solution:**
- Store complete OpenClaw cron configuration in the dashboard database
- Dashboard becomes the source of truth
- One-way sync from dashboard to OpenClaw
- Unified UI for managing all cron job aspects

## 2. Current State Analysis

### Dashboard (D1 Database) - Current Fields
| Field | Type | Purpose |
|-------|------|---------|
| id | INTEGER | Primary key |
| name | TEXT | Job name |
| description | TEXT | Job description |
| schedule | TEXT | Cron expression |
| skill_md_path | TEXT | Reference to skill file |
| skill_md_content | TEXT | Inline skill documentation |
| last_run_at | DATETIME | Last execution timestamp |
| last_status | TEXT | Current status |
| last_output | TEXT | Last execution output |
| next_run_at | DATETIME | Next scheduled run |
| created_at | DATETIME | Creation timestamp |

### OpenClaw Cron - Current Fields
| Field | Type | Purpose |
|-------|------|---------|
| schedule | object | Cron timing configuration |
| payload | object | Task instructions (agentTurn message) |
| sessionTarget | string | "main" or "isolated" |
| enabled | boolean | Whether job is active |

### Gap Analysis
**Missing in Dashboard:**
- Full task instructions (payload message)
- Model selection
- Thinking level
- Timeout configuration
- Delivery settings

**Result:** Cannot edit the actual job behavior from dashboard

## 3. Proposed Solution

### Architecture
```
Dashboard D1 Database (Source of Truth)
    ↓ [Sync Service]
OpenClaw Cron Scheduler
    ↓ [Executes]
Agent Tasks
```

### Data Flow
1. User edits cron job in dashboard UI
2. Changes saved to D1 database
3. Sync service reads from D1
4. Sync service updates OpenClaw cron
5. OpenClaw executes with synced configuration

## 4. Data Model

### Enhanced `cron_jobs` Table Schema

```sql
CREATE TABLE cron_jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    schedule TEXT NOT NULL,
    
    -- Skill reference
    skill_md_path TEXT,
    skill_md_content TEXT,
    
    -- OpenClaw configuration
    payload TEXT,                    -- Full task instructions (JSON)
    model TEXT,                      -- Target model (e.g., "google/gemini-3-flash-preview")
    thinking TEXT,                   -- Reasoning level ("low", "medium", "high")
    timeout_seconds INTEGER,         -- Max execution time (default: 300)
    deliver BOOLEAN DEFAULT 1,       -- Whether to deliver to channel
    
    -- Execution tracking
    last_run_at DATETIME,
    last_status TEXT DEFAULT 'pending',
    last_output TEXT,
    next_run_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### New Fields Detail

#### `payload` (TEXT, JSON)
- **Purpose:** Full task instructions sent to the agent
- **Format:** Free text or structured markdown
- **Example:** "Check Twitter for mentions of @RJMcGirr and respond..."
- **Max Length:** 100KB

#### `model` (TEXT)
- **Purpose:** AI model to use for execution
- **Options:** 
  - "google/gemini-3-flash-preview" (default for speed)
  - "anthropic/claude-opus-4-5" (for complex tasks)
  - "openrouter/auto" (automatic selection)
- **Default:** "google/gemini-3-flash-preview"

#### `thinking` (TEXT)
- **Purpose:** Reasoning level for agent
- **Options:** "low", "medium", "high"
- **Default:** "low"

#### `timeout_seconds` (INTEGER)
- **Purpose:** Maximum execution time before timeout
- **Range:** 60 - 3600 seconds
- **Default:** 300 (5 minutes)

#### `deliver` (BOOLEAN)
- **Purpose:** Whether to deliver output to configured channel
- **Default:** true (1)

## 5. API Requirements

### New/Modified Endpoints

#### GET /cron-jobs
**Response:**
```json
{
  "cronJobs": [
    {
      "id": 1,
      "name": "X Check Replies",
      "description": "Check Twitter for mentions",
      "schedule": "0 */2 * * *",
      "skill_md_path": "skills/bird/SKILL.md",
      "skill_md_content": "...",
      "payload": "Check Twitter for mentions of...",
      "model": "google/gemini-3-flash-preview",
      "thinking": "low",
      "timeout_seconds": 300,
      "deliver": true,
      "last_status": "ok",
      "last_run_at": "2026-02-07T18:00:00Z"
    }
  ]
}
```

#### POST /cron-jobs
**Request:**
```json
{
  "name": "New Cron Job",
  "description": "Job description",
  "schedule": "0 9 * * *",
  "skill_md_path": "optional/path.md",
  "skill_md_content": "optional content",
  "payload": "Task instructions for the agent...",
  "model": "google/gemini-3-flash-preview",
  "thinking": "low",
  "timeout_seconds": 300,
  "deliver": true
}
```

#### PATCH /cron-jobs/:id
**Request:**
```json
{
  "payload": "Updated task instructions...",
  "model": "anthropic/claude-opus-4-5",
  "timeout_seconds": 600
}
```

### Validation Requirements
- `payload`: Required, max 100KB
- `model`: Must be from approved model list
- `thinking`: Must be "low", "medium", or "high"
- `timeout_seconds`: Range 60-3600
- `schedule`: Valid cron expression

## 6. UI Requirements

### Cron Job Editor Modal

#### Section 1: Basic Information
- **Name** (required, text input)
- **Description** (optional, textarea)

#### Section 2: Schedule
- **Cron Expression** (required, text input with helper)
- **Next Run Preview** (display calculated next run time)

#### Section 3: Task Instructions (Payload)
- **Instructions** (required, large textarea)
- **Character Counter** (show current/max: 100KB)
- **Template Buttons** (quick insert common patterns)

#### Section 4: Agent Configuration
- **Model** (dropdown: Gemini Flash, Claude Opus, Auto)
- **Thinking Level** (dropdown: Low, Medium, High)
- **Timeout** (number input, seconds, range: 60-3600)
- **Deliver to Channel** (toggle switch)

#### Section 5: Skill Reference
- **Skill.md Path** (optional, text input)
- **Skill.md Content** (collapsible, markdown editor)
- **Preview** (rendered markdown)

### Cron Job List View Enhancements
- Show model badge (small icon)
- Show timeout indicator
- Quick edit button (opens editor)
- Run now button (manual trigger)

## 7. Integration Flow

### Sync Architecture
```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Dashboard     │────▶│   Sync Service   │────▶│  OpenClaw Cron  │
│   (D1 Database) │     │   (Background)   │     │   Scheduler     │
└─────────────────┘     └──────────────────┘     └─────────────────┘
```

### Sync Process
1. **Change Detection:** Poll D1 for updated_at changes
2. **Transform:** Convert dashboard format to OpenClaw format
3. **Update:** Call OpenClaw cron API to update job
4. **Verify:** Confirm sync success, log errors

### OpenClaw Cron Format
```json
{
  "schedule": {
    "kind": "cron",
    "expr": "0 */2 * * *",
    "tz": "America/Denver"
  },
  "payload": {
    "kind": "agentTurn",
    "message": "Task instructions from dashboard...",
    "model": "google/gemini-3-flash-preview",
    "thinking": "low",
    "timeoutSeconds": 300,
    "deliver": true
  },
  "sessionTarget": "isolated",
  "enabled": true
}
```

## 8. Security Considerations

- **Authentication:** Dashboard password protects all API endpoints
- **Authorization:** All cron job operations require valid password
- **Payload Validation:** Sanitize to prevent injection attacks
- **Secrets:** Never store API keys or tokens in payload field
- **Audit Trail:** Log all changes to cron job configuration

## 9. Testing Requirements

### API Tests
- [ ] Create cron job with all new fields
- [ ] Update cron job payload
- [ ] Validate payload size limit (100KB)
- [ ] Validate model selection
- [ ] Validate timeout range
- [ ] Get cron job returns full configuration
- [ ] List cron jobs includes new fields

### UI Tests
- [ ] Editor modal opens with all sections
- [ ] Payload textarea auto-resizes
- [ ] Character counter updates correctly
- [ ] Model dropdown shows options
- [ ] Save button triggers API call
- [ ] Success/error toasts display
- [ ] Cancel button closes modal without saving

### Integration Tests
- [ ] Changes sync to OpenClaw within 1 minute
- [ ] Sync failures are logged and alerted
- [ ] OpenClaw executes with synced configuration
- [ ] Rollback on sync failure

## 10. Implementation Phases

### Phase 1: Backend API (Day 1)
1. Update database schema (add new columns)
2. Update TypeScript types
3. Modify API endpoints (create, update, get, list)
4. Add validation logic
5. Test API endpoints
6. Commit: "Add OpenClaw config fields to cron jobs API"

### Phase 2: Frontend UI (Day 2)
1. Update cron job editor modal
2. Add new form sections
3. Implement payload editor with validation
4. Add model/thinking/timeout controls
5. Test UI interactions
6. Commit: "Add OpenClaw config editor to cron jobs"

### Phase 3: Sync Service (Day 3)
1. Build background sync service
2. Transform dashboard → OpenClaw format
3. Handle sync errors and retries
4. Add logging and monitoring
5. Test end-to-end sync
6. Commit: "Add cron job sync service"

### Phase 4: Deployment (Day 4)
1. Deploy backend changes
2. Deploy frontend changes
3. Run database migration
4. Verify in production
5. Update documentation
6. Commit: "Deploy cron job management feature"

## Appendix A: Database Migration

```sql
-- Migration: Add OpenClaw config fields to cron_jobs
-- Date: 2026-02-07

ALTER TABLE cron_jobs ADD COLUMN payload TEXT;
ALTER TABLE cron_jobs ADD COLUMN model TEXT DEFAULT 'google/gemini-3-flash-preview';
ALTER TABLE cron_jobs ADD COLUMN thinking TEXT DEFAULT 'low';
ALTER TABLE cron_jobs ADD COLUMN timeout_seconds INTEGER DEFAULT 300;
ALTER TABLE cron_jobs ADD COLUMN deliver BOOLEAN DEFAULT 1;
ALTER TABLE cron_jobs ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP;

-- Update existing jobs with default payload based on name
UPDATE cron_jobs SET payload = 'Task instructions not yet configured. Edit this job to add task instructions.' WHERE payload IS NULL;
```

## Appendix B: API Examples

### Example: Create Twitter Check Job
```bash
curl -X POST https://taskboard-api.rei-workers.workers.dev/cron-jobs \
  -H "X-Dashboard-Password: your-password" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "X Check Replies",
    "description": "Check Twitter for mentions and replies",
    "schedule": "0 */2 * * *",
    "skill_md_path": "skills/bird/SKILL.md",
    "payload": "Check Twitter for any mentions of @RJMcGirr or @richard_clawdbot. Look for replies to recent tweets. Use the bird tool to search and respond appropriately.",
    "model": "google/gemini-3-flash-preview",
    "thinking": "low",
    "timeout_seconds": 300,
    "deliver": true
  }'
```

### Example: Update Job Model
```bash
curl -X PATCH https://taskboard-api.rei-workers.workers.dev/cron-jobs/3 \
  -H "X-Dashboard-Password: your-password" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "anthropic/claude-opus-4-5",
    "thinking": "high",
    "timeout_seconds": 600
  }'
```

---

**Document Status:** Draft  
**Last Updated:** 2026-02-07  
**Owner:** Richard McGirr / Clawdbot
