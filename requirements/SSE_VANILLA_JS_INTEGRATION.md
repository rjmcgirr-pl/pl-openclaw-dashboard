# SSE Real-Time Integration for Vanilla JS Frontend

## Overview
Integrate Server-Sent Events (SSE) into the vanilla JavaScript dashboard (`public/app.js`) to enable real-time task updates without requiring page refresh. Tasks will be updated in real-time when other users/agents modify them.

## Current State
- **Backend**: Fully functional SSE infrastructure with Durable Objects (`worker/src/sse/SSEConnectionManager.ts`)
- **Frontend**: Vanilla JS dashboard with manual refresh intervals
- **Status**: SSE client infrastructure exists but is not wired to the dashboard

## Technical Architecture

### SSE Connection Flow
```
1. User logs in → JWT token generated and stored in sessionStorage
2. Dashboard establishes SSE connection to /sse/connect endpoint
3. Token passed via query parameter (EventSource limitation)
4. Durable Object maintains persistent connection
5. Events broadcast to all connected clients
6. Dashboard updates task list in real-time
```

### Event Types to Handle
- `task.created` - New task added
- `task.updated` - Task properties changed
- `task.deleted` - Task removed
- `task.status_changed` - Task moved between columns
- `comment.created` - Comment added to task
- `cron_job.started`, `cron_job.completed`, `cron_job.failed` - Cron monitoring

## Implementation Requirements

### Phase 1: SSE Connection Management

1. **Update `public/app.js` SSE initialization**
   - After user logs in and JWT token is stored, initialize SSE connection
   - Location: After successful authentication, before rendering task board
   - Use the JWT token from `sessionStorage` for authentication

2. **Create SSE connection helper**
   ```javascript
   // Connect to SSE endpoint
   // URL: ${API_BASE_URL}/sse/connect?token=${jwt_token}
   // Headers: User-Agent, Accept (standard EventSource headers)
   // Returns: EventSource instance
   ```

3. **Handle connection lifecycle**
   - **onopen**: Log successful connection
   - **onerror**: Log errors, implement exponential backoff reconnection
   - **onclose**: Clean up on logout

4. **Reconnection Strategy**
   - Base delay: 1000ms
   - Max delay: 30000ms
   - Multiplier: 2x (exponential backoff)
   - Max attempts: 10
   - Backoff timer state variable exists at line 59: `sseReconnectTimer`

### Phase 2: Event Listeners

1. **Task Created Event (`task.created`)**
   - Parse event data to extract task object
   - Add task to appropriate column based on status
   - Trigger UI update (render new task card)
   - Optional: Toast notification

2. **Task Updated Event (`task.updated`)**
   - Find existing task by ID
   - Update task properties
   - Re-render task card only (not entire board)
   - Track recently updated: add to `recentlyUpdatedTasks` Set
   - Optional: Highlight briefly to indicate change

3. **Task Deleted Event (`task.deleted`)**
   - Remove task from `tasks` array
   - Remove DOM element for task
   - Update column count displays

4. **Task Status Changed Event (`task.status_changed`)**
   - Find task by ID
   - Update status property
   - Move task card to correct column
   - Animate transition if possible

5. **Comment Created Event (`comment.created`)**
   - If comment task modal is open: add comment to display
   - Update comment count on task card
   - Trigger notification

6. **Cron Job Events**
   - Update cron job status in `cronJobs` array
   - Re-render cron job list on monitoring tab
   - Highlight recent changes

### Phase 3: Integration Points

1. **Connection initialization** (line ~800-900, after auth flow)
   ```javascript
   function initializeSSE() {
     const token = sessionStorage.getItem('sessionToken');
     if (!token) return;

     const sseUrl = `${API_BASE_URL}/sse/connect?token=${token}`;
     sseConnection = new EventSource(sseUrl);

     sseConnection.onopen = handleSSEOpen;
     sseConnection.onerror = handleSSEError;

     // Add event listeners for each event type
     sseConnection.addEventListener('task.created', handleTaskCreated);
     sseConnection.addEventListener('task.updated', handleTaskUpdated);
     // ... etc
   }
   ```

2. **Cleanup on logout** (existing logout function)
   - Call `sseConnection.close()` before clearing sessionStorage
   - Clear reconnect timer

3. **Disable auto-refresh polling** (optional optimization)
   - When SSE is connected, can reduce `autoRefreshInterval` frequency
   - Or disable it entirely if real-time is preferred

### Phase 4: Event Handlers

Create event handler functions:
- `handleSSEOpen()` - Log connection, reset reconnect counter
- `handleSSEError()` - Log error, schedule reconnect
- `handleTaskCreated(event)` - Parse, add task, update UI
- `handleTaskUpdated(event)` - Parse, update task, refresh UI
- `handleTaskDeleted(event)` - Parse, remove task, update UI
- `handleTaskStatusChanged(event)` - Parse, move task, update UI
- `handleCommentCreated(event)` - Update comment count, notify
- `handleCronJobEvent(event)` - Update cron status, notify

### Phase 5: UI/UX Enhancements

1. **Visual feedback for real-time updates**
   - Briefly highlight updated tasks (CSS class `recently-updated` for 2 seconds)
   - Use `recentlyUpdatedTasks` Set to track which tasks changed

2. **Connection status indicator**
   - Add visual indicator in header (green = connected, red = disconnected, yellow = reconnecting)
   - Display current connection status in debug log

3. **Toast notifications** (optional)
   - Show brief toast when significant events occur
   - Example: "New task created: Task Name"
   - Example: "Task moved to In Progress"

## Testing

### Manual Testing Checklist
- [ ] SSE connection established after login
- [ ] Real-time task creation shows immediately
- [ ] Task updates reflect on board without refresh
- [ ] Task deletion removes from board
- [ ] Status changes move task to correct column
- [ ] Reconnection works after network interruption
- [ ] Logout properly closes SSE connection
- [ ] No memory leaks with repeated connect/disconnect cycles
- [ ] Multiple browser tabs can connect simultaneously
- [ ] Comments update in open modal in real-time

### Console Checks
- No JavaScript errors in browser console
- SSE debug logs appear (connection, events, errors)
- Token is properly included in query parameter

## Files to Modify

| File | Changes |
|------|---------|
| `public/app.js` | Add SSE initialization, event handlers, connection management |
| (Optional) `public/styles.css` | Add `.recently-updated`, `.sse-status` styling |
| (Optional) `public/index.html` | Add connection status indicator element |

## Notes

- **EventSource Limitation**: Custom headers not supported, so JWT token passed via query parameter (secure because connection is HTTPS)
- **Reconnection**: Must be exponential backoff to avoid overwhelming server
- **Cleanup**: Always close SSE connection on logout to avoid orphaned connections
- **Polling**: Current auto-refresh may conflict; consider reducing its frequency or disabling when SSE is active
- **Durable Objects**: Connection persists on server side until client disconnects or 10 minutes of inactivity

## Success Criteria

✅ **Feature Complete When:**
1. SSE connection automatically established after login
2. All event types handled and UI updates in real-time
3. Reconnection works automatically on disconnect
4. Connection properly closed on logout
5. Manual testing checklist passes
6. No console errors
7. Browser DevTools shows EventSource connection active
8. Task board reflects changes from other users in real-time
