# Cloudflare Worker REST API Documentation

## Overview

This Cloudflare Worker provides a REST API for the taskboard dashboard with full CRUD operations for tasks, cron jobs, comments, tags, and notifications.

## Base URL

- Local Development: `http://localhost:8787`
- Production: `https://api.openclaw.propertyllama.com`

## Authentication

The API supports multiple authentication methods:

1. **Session Cookie** (OAuth via Google)
2. **JWT Bearer Token** - `Authorization: Bearer <token>`
3. **Agent API Key** - `Authorization: Bearer <api_key>` or `X-Agent-API-Key: <api_key>`

## CORS

All endpoints include CORS headers for cross-origin requests:
- `Access-Control-Allow-Origin`: Dynamic (matches request origin)
- `Access-Control-Allow-Methods`: GET, POST, PATCH, DELETE, OPTIONS
- `Access-Control-Allow-Headers`: Content-Type, Authorization
- `Access-Control-Allow-Credentials`: true

---

## API Endpoints

### Tasks

#### List All Tasks
```
GET /tasks
```

**Query Parameters:**
- `status` (optional): Filter by status (inbox, up_next, in_progress, in_review, done, archived)
- `assigned_to_agent` (optional): Filter by agent assignment (true/false)
- `archived` (optional): Include archived tasks (yes/no, default: no)

**Response:**
```json
{
  "tasks": [
    {
      "id": 1,
      "name": "Task name",
      "description": "Task description",
      "status": "inbox",
      "priority": 3,
      "blocked": 0,
      "assigned_to_agent": 0,
      "archived": 0,
      "comment_count": 0,
      "created_at": "2026-02-14 05:55:05",
      "updated_at": "2026-02-14 05:55:05"
    }
  ]
}
```

#### Get Single Task
```
GET /tasks/:id
```

**Response:**
```json
{
  "task": {
    "id": 1,
    "name": "Task name",
    "description": "Task description",
    "status": "inbox",
    "priority": 3,
    "blocked": 0,
    "assigned_to_agent": 0,
    "archived": 0,
    "comment_count": 0,
    "created_at": "2026-02-14 05:55:05",
    "updated_at": "2026-02-14 05:55:05"
  }
}
```

#### Create Task
```
POST /tasks
```

**Request Body:**
```json
{
  "name": "Task name",
  "description": "Task description",
  "status": "inbox",
  "priority": 3,
  "blocked": false,
  "assigned_to_agent": false,
  "archived": false
}
```

**Required Fields:**
- `name` (string): Task name

**Optional Fields:**
- `description` (string): Task description
- `status` (string): inbox, up_next, in_progress, in_review, done, archived (default: inbox)
- `priority` (number): Priority level (default: 0)
- `blocked` (boolean): Whether task is blocked (default: false)
- `assigned_to_agent` (boolean): Whether assigned to agent (default: false)
- `archived` (boolean): Whether archived (default: false)

**Response:** `201 Created`
```json
{
  "task": { ... }
}
```

#### Update Task
```
PATCH /tasks/:id
```

**Request Body:** (all fields optional)
```json
{
  "name": "Updated name",
  "description": "Updated description",
  "status": "in_progress",
  "priority": 5,
  "blocked": true,
  "assigned_to_agent": true,
  "archived": false
}
```

**Response:** `200 OK`
```json
{
  "task": { ... }
}
```

#### Delete Task
```
DELETE /tasks/:id
```

**Response:** `200 OK`
```json
{
  "success": true,
  "message": "Task deleted"
}
```

### Cron Jobs

#### List All Cron Jobs
```
GET /cron-jobs
```

**Response:**
```json
{
  "cronJobs": [
    {
      "id": 1,
      "name": "Job name",
      "description": "Job description",
      "schedule": "0 0 * * *",
      "payload": "Task instructions...",
      "model": "google/gemini-3-flash-preview",
      "thinking": "low",
      "timeout_seconds": 300,
      "deliver": 1,
      "last_status": "pending",
      "created_at": "2026-02-14 06:06:56",
      "updated_at": "2026-02-14 06:06:56"
    }
  ]
}
```

#### Get Single Cron Job
```
GET /cron-jobs/:id
```

#### Create Cron Job
```
POST /cron-jobs
```

**Request Body:**
```json
{
  "name": "Job name",
  "description": "Job description",
  "schedule": "0 0 * * *",
  "payload": "Task instructions for the agent...",
  "model": "google/gemini-3-flash-preview",
  "thinking": "low",
  "timeout_seconds": 300,
  "deliver": true
}
```

**Required Fields:**
- `name` (string): Job name
- `schedule` (string): Cron schedule expression
- `payload` (string): Task instructions (max 100KB)

**Optional Fields:**
- `description` (string): Job description
- `model` (string): AI model to use (default: google/gemini-3-flash-preview)
- `thinking` (string): low, medium, high (default: low)
- `timeout_seconds` (number): 60-3600 (default: 300)
- `deliver` (boolean): Whether to deliver output (default: true)

#### Update Cron Job
```
PATCH /cron-jobs/:id
```

#### Delete Cron Job
```
DELETE /cron-jobs/:id
```

### Comments

#### List Comments for Task
```
GET /tasks/:id/comments
```

#### Create Comment
```
POST /tasks/:id/comments
```

**Request Body:**
```json
{
  "content": "Comment text",
  "parent_comment_id": null
}
```

#### Update Comment
```
PATCH /comments/:id
```

#### Delete Comment
```
DELETE /comments/:id
```

### Tags

#### List All Tags
```
GET /tags
```

#### Create Tag
```
POST /tags
```

#### Update Tag
```
PATCH /tags/:id
```

#### Delete Tag
```
DELETE /tags/:id
```

### Task Tags

#### Get Tags for Task
```
GET /tasks/:id/tags
```

#### Add Tag to Task
```
POST /tasks/:id/tags
```

#### Remove Tag from Task
```
DELETE /tasks/:id/tags/:tagId
```

### Notifications

#### List Notifications
```
GET /notifications
```

#### Mark Notification as Read
```
POST /notifications/:id/read
```

#### Mark All Notifications as Read
```
POST /notifications/read-all
```

### Authentication

#### Google OAuth
```
GET /auth/google
```

Redirects to Google OAuth login.

#### OAuth Callback
```
GET /auth/callback
```

#### Get Current User
```
GET /auth/me
```

#### Login (JWT)
```
POST /auth/login
```

**Request Body:**
```json
{
  "api_key": "your-api-key"
}
```
or
```json
{
  "username": "admin@taskboard.local",
  "password": "your-password"
}
```

#### Logout
```
POST /auth/logout
```

### SSE (Server-Sent Events)

#### Connect to SSE Stream
```
GET /sse/connect
```

**Headers:**
- `Authorization: Bearer <token>`

Streams real-time updates for tasks, comments, and notifications.

---

## Error Responses

All errors follow this format:

```json
{
  "error": "Error message description"
}
```

**HTTP Status Codes:**
- `200 OK` - Success
- `201 Created` - Resource created successfully
- `400 Bad Request` - Invalid request parameters
- `401 Unauthorized` - Authentication required
- `403 Forbidden` - Permission denied
- `404 Not Found` - Resource not found
- `500 Internal Server Error` - Server error

---

## Local Development

1. Install dependencies:
```bash
npm install
```

2. Start local development server:
```bash
npx wrangler dev --env local
```

3. The API will be available at `http://localhost:8787`

---

## Deployment

Deploy to Cloudflare:
```bash
npx wrangler deploy --env production
```
