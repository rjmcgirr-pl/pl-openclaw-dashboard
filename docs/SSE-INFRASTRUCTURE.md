# SSE Infrastructure Implementation

This document describes the Server-Sent Events (SSE) infrastructure implemented for real-time task updates in the PL OpenClaw Dashboard.

## Overview

The SSE infrastructure provides real-time updates to connected clients when tasks are created, updated, or deleted. This enables a more responsive user experience without requiring page refreshes.

## Architecture

```
┌─────────────────┐      SSE Connection      ┌──────────────────┐
│   Web Client    │◄────────────────────────►│  SSEConnection   │
│   (Browser)     │   text/event-stream      │  Manager (DO)    │
└─────────────────┘                          └──────────────────┘
                                                      │
                                                      │ Broadcast
                                                      │ Events
                                                      ▼
┌─────────────────┐     Task CRUD Operations    ┌──────────────────┐
│   D1 Database   │◄────────────────────────────│  Worker API      │
└─────────────────┘                             │  (index.ts)      │
                                                └──────────────────┘
```

## Components

### 1. SSEConnectionManager (Durable Object)
**File:** `worker/src/sse/SSEConnectionManager.ts`

Manages WebSocket-like SSE connections:
- Maintains a map of active connections
- Validates JWT tokens on connection
- Broadcasts events to all or specific users
- Handles connection lifecycle (connect/disconnect)

### 2. Broadcast Utility
**File:** `worker/src/sse/broadcast.ts`

Provides functions to broadcast events:
- `broadcastTaskCreated()` - Emits when a task is created
- `broadcastTaskUpdated()` - Emits when a task is modified
- `broadcastTaskDeleted()` - Emits when a task is deleted
- `broadcastTaskStatusChanged()` - Emits when task status changes

### 3. SSE Routes
**File:** `worker/src/routes/sse.ts`

HTTP endpoint handlers:
- `GET /sse/connect` - Establish SSE connection
- `GET /sse/stats` - Get connection statistics (admin)

### 4. Task Events Middleware
**File:** `worker/src/middleware/taskEvents.ts`

Hooks into task CRUD operations to emit events automatically.

## API Endpoints

### Connect to SSE Stream
```
GET /sse/connect?token=<jwt_token>
```

Headers:
```
Authorization: Bearer <jwt_token>
```

Response:
```
HTTP/1.1 200 OK
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive

data: {"type":"connection.established","connectionId":"...","userId":"...","timestamp":"..."}

data: {"type":"task.created","taskId":123,"task":{...},"timestamp":"..."}

data: {"type":"task.updated","taskId":123,"task":{...},"timestamp":"..."}
```

### Get Connection Stats
```
GET /sse/stats
Authorization: Bearer <jwt_token>
```

Response:
```json
{
  "totalConnections": 5,
  "connections": [
    {
      "id": "...",
      "userId": "...",
      "connectedAt": 1707868800000,
      "duration": 30000
    }
  ]
}
```

## Event Types

### task.created
Emitted when a new task is created.

```json
{
  "type": "task.created",
  "taskId": 123,
  "task": {
    "id": 123,
    "name": "New Task",
    "status": "inbox",
    ...
  },
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

### task.updated
Emitted when a task is modified.

```json
{
  "type": "task.updated",
  "taskId": 123,
  "task": {
    "id": 123,
    "name": "Updated Task",
    ...
  },
  "timestamp": "2024-01-15T10:35:00.000Z"
}
```

### task.deleted
Emitted when a task is deleted.

```json
{
  "type": "task.deleted",
  "taskId": 123,
  "timestamp": "2024-01-15T10:40:00.000Z"
}
```

### task.status_changed
Emitted when a task's status changes (includes both old and new status).

```json
{
  "type": "task.status_changed",
  "taskId": 123,
  "task": { ... },
  "previousStatus": "inbox",
  "newStatus": "in_progress",
  "timestamp": "2024-01-15T10:45:00.000Z"
}
```

## Frontend Usage

### JavaScript Example
```javascript
// Connect to SSE endpoint
const token = 'your-jwt-token';
const eventSource = new EventSource(`/sse/connect?token=${token}`);

// Listen for events
eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('Received event:', data);
  
  switch (data.type) {
    case 'task.created':
      // Add new task to board
      addTaskToBoard(data.task);
      break;
    case 'task.updated':
      // Update task in board
      updateTaskInBoard(data.task);
      break;
    case 'task.deleted':
      // Remove task from board
      removeTaskFromBoard(data.taskId);
      break;
    case 'task.status_changed':
      // Move task to new column
      moveTaskToColumn(data.taskId, data.newStatus);
      break;
  }
};

// Handle connection open
eventSource.onopen = () => {
  console.log('SSE connection established');
};

// Handle errors
eventSource.onerror = (error) => {
  console.error('SSE error:', error);
  // Connection will auto-retry
};

// Close connection when done
window.addEventListener('beforeunload', () => {
  eventSource.close();
});
```

### React Hook Example
```typescript
import { useEffect, useState } from 'react';

function useTaskEvents(token: string) {
  const [events, setEvents] = useState([]);
  
  useEffect(() => {
    if (!token) return;
    
    const eventSource = new EventSource(`/sse/connect?token=${token}`);
    
    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      setEvents(prev => [...prev, data]);
    };
    
    return () => eventSource.close();
  }, [token]);
  
  return events;
}
```

## Testing

### Using curl
```bash
# Connect to SSE stream
curl -N "https://taskboard-api.your-domain.com/sse/connect?token=YOUR_JWT_TOKEN"

# Test with local development
curl -N "http://localhost:8788/sse/connect?token=YOUR_JWT_TOKEN"
```

### Using PowerShell Test Script
```powershell
# Run the test script
.\worker\scripts\test-sse.ps1 -BaseUrl "http://localhost:8788"
```

## Deployment

### Local Development
```bash
cd worker
npx wrangler dev --local
```

### Deploy to Staging
```bash
cd worker
npx wrangler deploy --env staging
```

### Deploy to Production
```bash
cd worker
npx wrangler deploy --env production
```

### Configure Durable Objects
The Durable Object namespace is automatically configured via `wrangler.toml`:

```toml
[[durable_objects.bindings]]
name = "SSE_CONNECTION_MANAGER"
class_name = "SSEConnectionManager"

[[migrations]]
tag = "v1"
new_classes = ["SSEConnectionManager"]
```

## Security Considerations

1. **JWT Token Validation**: All SSE connections require a valid JWT token
2. **User-Scoped Broadcasting**: Events are filtered by user permissions
3. **CORS**: Properly configured to allow only authorized origins
4. **Connection Limits**: Durable Objects automatically manage resource limits
5. **Automatic Cleanup**: Dead connections are cleaned up automatically

## Troubleshooting

### Connection Refused
- Verify the worker is deployed and running
- Check JWT token is valid and not expired
- Ensure CORS headers are properly configured

### No Events Received
- Check browser console for errors
- Verify SSE connection is established (look for `connection.established` event)
- Ensure task operations are triggering events (check worker logs)

### High Latency
- Durable Objects are globally distributed; latency depends on user location
- Consider using WebSockets for lower latency (future enhancement)

## Future Enhancements

1. **Selective Event Subscriptions**: Allow clients to subscribe to specific event types
2. **Event History**: Store and replay recent events for late-joining clients
3. **WebSocket Support**: Add WebSocket transport as an alternative to SSE
4. **Presence Detection**: Show which users are currently viewing the board
5. **Typing Indicators**: Show when other users are editing tasks

## References

- [Cloudflare Durable Objects](https://developers.cloudflare.com/durable-objects/)
- [Server-Sent Events (SSE)](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events)
- [EventSource API](https://developer.mozilla.org/en-US/docs/Web/API/EventSource)
