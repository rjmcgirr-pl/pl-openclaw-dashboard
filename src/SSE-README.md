# SSE (Server-Sent Events) Frontend System

Real-time task updates via EventSource with JWT authentication, toast notifications, and automatic UI synchronization.

## Overview

This SSE system provides:
- **EventSourceClient** - Low-level SSE client with reconnect logic
- **useSSE Hook** - React hook for component-level SSE subscriptions
- **SSEProvider** - Global context for application-wide SSE connection
- **TaskUpdateNotification** - Toast notification system for task events
- **useRealTimeTasks** - Hook for automatic task list synchronization

## Quick Start

### 1. Wrap Your App with SSE Provider

```tsx
import { SSEIntegratedApp } from './components';

function App() {
  return (
    <SSEIntegratedApp
      url="/api/events"
      token={jwtToken}
      showConnectionStatus={true}
      showNotifications={true}
      onTaskCreated={(event) => console.log('New task:', event.data.task)}
    >
      <YourApp />
    </SSEIntegratedApp>
  );
}
```

### 2. Use Real-Time Tasks in Components

```tsx
import { useRealTimeTasks } from './hooks';

function TaskBoard() {
  const { tasks, addTask, updateTask } = useRealTimeTasks({
    initialTasks: [],
    onTaskCreated: (task) => console.log('Created:', task.name),
  });

  return (
    <div>
      {tasks.map(task => (
        <TaskCard key={task.id} task={task} />
      ))}
    </div>
  );
}
```

### 3. Manual Event Subscription

```tsx
import { useSSE } from './hooks';

function MyComponent() {
  const { subscribe, isConnected } = useSSE({
    url: '/api/events',
    token: jwtToken,
    autoConnect: true,
  });

  useEffect(() => {
    return subscribe('task.updated', (event) => {
      console.log('Task updated:', event.data.task);
    });
  }, [subscribe]);

  return <div>Connected: {isConnected}</div>;
}
```

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   SSE Server    │────▶│ EventSourceClient│────▶│   SSEProvider   │
│  (Cloudflare)   │     │  (Reconnecting) │     │  (React Context)│
└─────────────────┘     └─────────────────┘     └────────┬────────┘
                                                         │
         ┌─────────────────┬─────────────────┬───────────┼───────────┐
         │                 │                 │           │           │
         ▼                 ▼                 ▼           ▼           ▼
┌─────────────────┐ ┌──────────────┐ ┌────────────────┐ ┌──────────┐ ┌─────────────┐
│useRealTimeTasks │ │  useSSE Hook │ │ TaskUpdateNotification│ │ Connection│ │   Mock SSE  │
│  (Auto Sync)    │ │(Manual Subs) │ │  (Toasts)      │ │  Status   │ │  (Testing)  │
└─────────────────┘ └──────────────┘ └────────────────┘ └──────────┘ └─────────────┘
```

## Components

### SSEIntegratedApp
All-in-one wrapper providing connection, status, and notifications.

**Props:**
- `url` - SSE endpoint URL
- `token` - JWT authentication token
- `showConnectionStatus` - Show connection indicator (default: true)
- `connectionStatusPosition` - Position of status indicator
- `showNotifications` - Enable toast notifications (default: true)
- `notificationPosition` - Position of notifications
- `compactStatus` - Use dot instead of full status badge
- `autoConnect` - Connect on mount (default: true)
- Event callbacks: `onTaskCreated`, `onTaskUpdated`, etc.

### SSEConnectionStatus
Visual connection state indicator with animations.

```tsx
<SSEConnectionStatus
  status="connected"
  reconnectAttempt={2}
  lastError={error}
  size="md"
  showDetails={true}
  fixed
  position="bottom-right"
/>
```

### TaskUpdateNotification
Toast notification with auto-dismiss progress bar.

```tsx
const { notifications, dismissNotification } = useTaskNotifications();

<NotificationContainer
  notifications={notifications}
  onDismiss={dismissNotification}
  position="top-right"
  maxNotifications={5}
/>
```

## Hooks

### useSSE
Component-level SSE hook with auto-cleanup.

```tsx
const {
  state,           // Full connection state
  status,          // 'connected' | 'disconnected' | 'reconnecting' | 'error'
  isConnected,     // Boolean
  isReconnecting,  // Boolean
  connect,         // () => void
  disconnect,      // () => void
  subscribe,       // (eventType, handler) => unsubscribe
  subscribeToMany, // (eventTypes, handler) => unsubscribe
  onTaskCreated,   // Convenience method
  onTaskUpdated,   // Convenience method
  onTaskDeleted,   // Convenience method
  waitForConnection // (timeout) => Promise
} = useSSE({ url, token, autoConnect: true });
```

### useRealTimeTasks
Automatic task list synchronization.

```tsx
const {
  tasks,           // Current task list
  setTasks,        // Manual update
  addTask,         // (task) => void
  updateTask,      // (taskId, updates) => void
  deleteTask,      // (taskId) => void
  getTaskById,     // (taskId) => Task | undefined
  pendingUpdates   // Number of batched updates
} = useRealTimeTasks({
  initialTasks: [],
  enableBatching: true,
  batchDelay: 100,
  onTaskCreated: (task) => {},
  onTaskUpdated: (task, previous) => {},
});
```

### useTaskNotifications
Toast notification management.

```tsx
const {
  notifications,        // Notification[]
  addNotification,      // (notification) => id
  dismissNotification,  // (id) => void
  clearAll,            // () => void
  createTaskNotification // (event) => id
} = useTaskNotifications();
```

## Event Types

| Event Type | Description | Data Shape |
|------------|-------------|------------|
| `task.created` | New task created | `{ task }` |
| `task.updated` | Task fields updated | `{ task, previousValues }` |
| `task.deleted` | Task deleted | `{ taskId, taskName }` |
| `task.status_changed` | Status column changed | `{ task, previousStatus }` |
| `comment.created` | New comment added | `{ comment }` |
| `cron_job.started` | Cron job started | `{ cronJob }` |
| `cron_job.completed` | Cron job finished | `{ cronJob }` |
| `cron_job.failed` | Cron job error | `{ cronJob }` |
| `ping` | Keepalive ping | `{}` |
| `connected` | Initial connection | `{ message }` |

## Testing with Mock Events

```tsx
import { createMockSSEClient, createMockTaskCreatedEvent } from './lib/sse';

// Create mock client
const mockClient = createMockSSEClient({
  autoEmit: true,
  emitInterval: 5000,
});

// Manually emit events
mockClient.emit(createMockTaskCreatedEvent({ name: 'Test Task' }));
mockClient.emitEvent('task.updated', { task: { id: 1, name: 'Updated' } });
```

## Configuration

### Environment Variables

```bash
REACT_APP_SSE_URL=/api/events
REACT_APP_SSE_AUTO_CONNECT=true
```

### Connection Options

```tsx
<SSEProvider
  url="/api/events"
  token={jwtToken}
  autoConnect={true}
  reconnect={true}
  maxReconnectAttempts={10}
  onConnect={() => console.log('Connected')}
  onError={(error) => console.error('Error:', error)}
>
```

## Files Structure

```
src/
├── components/
│   ├── SSEConnectionStatus.tsx    # Connection indicator UI
│   ├── TaskUpdateNotification.tsx # Toast notifications
│   ├── SSEProvider.tsx            # Global context provider
│   ├── SSEIntegratedApp.tsx       # All-in-one integration
│   └── index.ts                   # Component exports
├── hooks/
│   ├── useSSE.ts                  # Component SSE hook
│   ├── useRealTimeTasks.ts        # Task sync hook
│   └── index.ts                   # Hook exports
├── lib/
│   └── sse/
│       ├── EventSourceClient.ts   # Low-level client
│       ├── mockEvents.ts          # Testing utilities
│       └── index.ts               # Lib exports
└── types/
    ├── sse.ts                     # Type definitions
    └── index.ts                   # Type exports
```

## Best Practices

1. **Use SSEIntegratedApp** at the root for most cases
2. **Use useRealTimeTasks** for task list components
3. **Use useSSE** for custom event handling needs
4. **Always clean up subscriptions** in useEffect return
5. **Handle reconnection** - UI should work offline
6. **Batch updates** - useRealTimeTasks batches by default
7. **Mock for testing** - use mockEvents.ts in dev/test

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Connection fails | Check JWT token and SSE URL |
| No events received | Verify server sends correct event types |
| Memory leaks | Ensure unsubscribe in useEffect cleanup |
| UI not updating | Check event handler is subscribed |
| Too many reconnects | Check network and server health |
