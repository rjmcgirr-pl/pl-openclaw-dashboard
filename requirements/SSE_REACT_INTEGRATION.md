# SSE Real-Time Integration for React Frontend

## Overview
Complete the integration of Server-Sent Events (SSE) into the React dashboard to enable real-time task updates with notifications. The SSE infrastructure is already built (`SSEProvider`, `useSSE`, `useRealTimeTasks` hooks) but not fully wired into the main application.

## Current State
- **Backend**: Fully functional SSE infrastructure with Durable Objects (`worker/src/sse/SSEConnectionManager.ts`)
- **React Components**: All SSE components exist and are feature-complete:
  - `SSEProvider` context for managing SSE connection
  - `useSSE` hook for subscription management
  - `useRealTimeTasks` hook for task state management
  - `TaskUpdateNotification` component for notifications
  - `SSEConnectionStatus` component for connection status display
- **Status**: Components exist but not integrated into main app

## Technical Architecture

### SSE Connection Flow
```
1. User logs in via OAuth → JWT token stored
2. SSEProvider wraps main app and establishes connection
3. Token passed via query parameter to /sse/connect endpoint
4. Durable Object maintains persistent connection
5. Events broadcast to all connected clients
6. useRealTimeTasks hook updates React state automatically
7. Components re-render with new data
8. TaskUpdateNotification displays updates to user
```

## Implementation Requirements

### Phase 1: Integrate SSEProvider into Main App

1. **Identify main app entry point**
   - Find root React component (likely in `src/App.tsx` or similar)
   - Check `src/components/SSEIntegratedApp.tsx` for reference implementation

2. **Wrap application with SSEProvider**
   ```jsx
   <SSEProvider
     url={`${API_BASE_URL}/sse/connect`}
     token={jwtToken}
     autoConnect={true}
   >
     <YourMainApp />
   </SSEProvider>
   ```

3. **Pass JWT token to provider**
   - Get token from OAuth context or state management
   - Ensure token is available before rendering SSEProvider
   - Handle token refresh if needed

4. **Configure API base URL**
   - Use environment variable or runtime detection
   - Match backend URL (production: `https://openclaw.api.propertyllama.com`)

### Phase 2: Connect Task State to SSE

1. **Use useRealTimeTasks hook in task list component**
   ```jsx
   const { tasks, isConnected } = useRealTimeTasks({
     initialTasks: fetchedTasks,
     onTaskCreated: (task) => console.log('New task:', task),
     onTaskUpdated: (task) => console.log('Updated:', task),
     onTaskDeleted: (taskId) => console.log('Deleted:', taskId),
     onTaskStatusChanged: (task, prevStatus) => console.log('Moved:', task),
   });
   ```

2. **Display tasks from real-time state**
   - Render from `tasks` returned by hook
   - Task updates automatically trigger re-renders

3. **Event handlers for visual feedback**
   - Optional callbacks for toast notifications
   - Track recently updated tasks for highlighting
   - Update task comment counts when comments created

### Phase 3: Add Real-Time Notifications

1. **Integrate TaskUpdateNotification component**
   - Display when tasks are created/updated by other users
   - Show connection status changes
   - Optional toast/snackbar notifications

2. **Handle notification content**
   - Task created: "New task: [Task Name]"
   - Task updated: "[Task Name] was updated"
   - Status changed: "[Task Name] moved to [Status]"
   - Comment added: "Comment on [Task Name]"

3. **Notification duration**
   - Auto-dismiss after 3-5 seconds
   - Allow manual dismiss
   - Don't interrupt user actions

### Phase 4: Display Connection Status

1. **Add SSEConnectionStatus component to header/navbar**
   - Green dot: Connected
   - Yellow dot: Reconnecting
   - Red dot: Disconnected
   - Tooltip with status details

2. **Visual indicators**
   - Real-time connection state
   - Reconnection attempts
   - Last event timestamp

### Phase 5: Comment Updates in Real-Time

1. **Subscribe to comment.created events**
   ```jsx
   useEffect(() => {
     return subscribe('comment.created', (event) => {
       // Update comment list if modal is open
       // Increment comment count on task card
     });
   }, [subscribe]);
   ```

2. **Update comment count on task cards**
   - When comment created event received
   - If viewing task modal, append comment to list
   - Update UI without refetch

### Phase 6: Cron Job Monitoring

1. **Use useSSE hook for cron events**
   ```jsx
   const { subscribe } = useSSE({
     url: `${API_BASE_URL}/sse/connect`,
     token: jwtToken,
   });

   useEffect(() => {
     return subscribe('cron_job.started', (event) => {
       updateCronJobStatus(event.data);
     });
   }, [subscribe]);
   ```

2. **Handle cron job events**
   - `cron_job.started`: Update status to running, start timer
   - `cron_job.completed`: Mark as done, show success
   - `cron_job.failed`: Mark as error, show error details

## Integration Points

### React Components to Modify/Create

| Component | Action | Details |
|-----------|--------|---------|
| `App.tsx` or root component | Wrap with SSEProvider | Pass JWT token, API base URL |
| Task list component | Use useRealTimeTasks | Get tasks from hook, subscribe to events |
| Task card component | Show update indicator | Highlight recently updated tasks |
| Comment modal | Subscribe to comment events | Update comment count, show new comments |
| Cron monitoring tab | Use useSSE hook | Subscribe to cron events |
| Header/navbar | Add SSEConnectionStatus | Display connection status |

### Hooks Already Available

- **useSSE**: Low-level event subscription
- **useRealTimeTasks**: High-level task state management
- **useSSEContext**: Access SSE from any component (wrapped in provider)

## Event Types to Handle

| Event Type | Data | Action |
|------------|------|--------|
| `task.created` | `{ task: Task }` | Add to task list, show notification |
| `task.updated` | `{ task: Task, previousValues: Partial<Task> }` | Update task in list, highlight |
| `task.deleted` | `{ taskId: number }` | Remove from list |
| `task.status_changed` | `{ task: Task, previousStatus: string }` | Move task, update status column |
| `comment.created` | `{ comment: Comment, taskId: number }` | Update count, append if modal open |
| `cron_job.started` | `{ cronJob: CronJob }` | Update status, animate |
| `cron_job.completed` | `{ cronJob: CronJob }` | Mark complete, show success |
| `cron_job.failed` | `{ cronJob: CronJob, error: string }` | Mark error, show details |

## Testing

### Manual Testing Checklist
- [ ] App renders without errors after wrapping with SSEProvider
- [ ] SSE connection established after login
- [ ] Connection status indicator shows "Connected"
- [ ] Real-time task creation shows immediately on board
- [ ] Task updates reflect without page refresh
- [ ] Task deletion removes from board instantly
- [ ] Status changes move task to correct column with animation
- [ ] New comments appear in task modal in real-time
- [ ] Comment count updates on task cards
- [ ] Cron job status updates in real-time
- [ ] Reconnection works after network interruption
- [ ] Logout properly closes SSE connection
- [ ] Notifications display for significant events
- [ ] Recently updated tasks are highlighted
- [ ] Multiple browser tabs can connect simultaneously

### Debug Checklist
- [ ] Browser console shows SSE connection logs
- [ ] No JavaScript errors
- [ ] Network tab shows EventSource connection active
- [ ] Token is properly included in query parameter
- [ ] React DevTools shows correct component tree

## Reference Files

- `src/components/SSEProvider.tsx` - Context and hooks
- `src/components/SSEIntegratedApp.tsx` - Example integration
- `src/hooks/useRealTimeTasks.ts` - Task state management
- `src/hooks/useSSE.ts` - Low-level SSE hook
- `src/components/TaskUpdateNotification.tsx` - Notification component
- `src/components/SSEConnectionStatus.tsx` - Status display
- `src/types/sse.ts` - TypeScript types

## Notes

- **EventSource Limitation**: Custom headers not supported, token passed via query param (secure over HTTPS)
- **Context Provider**: SSEProvider must wrap components that use SSE hooks
- **Token Lifecycle**: Handle token refresh if OAuth tokens have short expiration
- **Memory Management**: useRealTimeTasks handles subscription cleanup on unmount
- **Offline Handling**: EventSource reconnection built-in, configurable via options

## Success Criteria

✅ **Feature Complete When:**
1. SSEProvider wraps main React app
2. Task list uses useRealTimeTasks hook
3. Real-time task creation, update, delete working
4. Status changes move tasks between columns immediately
5. Task update notifications display to user
6. Connection status indicator shows in UI
7. Comments update in real-time in task modal
8. Cron job monitoring shows real-time updates
9. Reconnection works automatically on disconnect
10. All manual testing checklist passes
11. No console errors
12. Browser DevTools confirms EventSource active
