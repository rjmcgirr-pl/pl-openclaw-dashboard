/**
 * SSE Usage Examples
 * 
 * Demonstrates how to use the SSE frontend system in various scenarios.
 */

import React, { useEffect } from 'react';

// ============================================================================
// Example 1: Full Application Integration (Recommended)
// ============================================================================

import { SSEIntegratedApp } from '../components';

function App() {
  const jwtToken = 'your-jwt-token-here';

  return (
    <SSEIntegratedApp
      url="/api/events"
      token={jwtToken}
      showConnectionStatus={true}
      connectionStatusPosition="bottom-right"
      showNotifications={true}
      notificationPosition="top-right"
      compactStatus={false}
      onTaskCreated={(event) => {
        console.log('New task created:', event.data.task.name);
      }}
      onTaskUpdated={(event) => {
        console.log('Task updated:', event.data.task.name);
      }}
    >
      <Dashboard />
    </SSEIntegratedApp>
  );
}

// ============================================================================
// Example 2: Task Board with Real-Time Updates
// ============================================================================

import { useRealTimeTasks } from '../hooks';

function Dashboard() {
  const { 
    tasks, 
    pendingUpdates,
    getTaskById 
  } = useRealTimeTasks({
    initialTasks: [],
    enableBatching: true,
    batchDelay: 100,
    onTaskCreated: (task) => {
      console.log('🎉 New task:', task.name);
    },
    onTaskUpdated: (task, previous) => {
      console.log('✏️ Task updated:', task.name, 'Changes:', previous);
    },
    onTaskDeleted: (taskId) => {
      console.log('🗑️ Task deleted:', taskId);
    },
    onTaskStatusChanged: (task, previousStatus) => {
      console.log('📊 Status changed:', task.name, previousStatus, '→', task.status);
    },
  });

  return (
    <div className="dashboard">
      <header>
        <h1>Task Board</h1>
        {pendingUpdates > 0 && (
          <span className="pending-badge">{pendingUpdates} updates pending...</span>
        )}
      </header>
      
      <div className="columns">
        <TaskColumn 
          title="Inbox" 
          tasks={tasks.filter(t => t.status === 'inbox')} 
        />
        <TaskColumn 
          title="Up Next" 
          tasks={tasks.filter(t => t.status === 'up_next')} 
        />
        <TaskColumn 
          title="In Progress" 
          tasks={tasks.filter(t => t.status === 'in_progress')} 
        />
        <TaskColumn 
          title="Done" 
          tasks={tasks.filter(t => t.status === 'done')} 
        />
      </div>
    </div>
  );
}

function TaskColumn({ title, tasks }: { title: string; tasks: Task[] }) {
  return (
    <div className="task-column">
      <h2>{title} ({tasks.length})</h2>
      {tasks.map(task => (
        <TaskCard key={task.id} task={task} />
      ))}
    </div>
  );
}

// ============================================================================
// Example 3: Manual Event Subscription
// ============================================================================

import { useSSE } from '../hooks';

function TaskDetail({ taskId }: { taskId: number }) {
  const { subscribe, isConnected, status } = useSSE({
    url: '/api/events',
    token: 'jwt-token',
    autoConnect: true,
  });

  const [task, setTask] = React.useState<Task | null>(null);
  const [comments, setComments] = React.useState<Comment[]>([]);

  // Subscribe to specific task updates
  useEffect(() => {
    const unsubscribe = subscribe('task.updated', (event) => {
      if (event.data.task.id === taskId) {
        setTask(event.data.task);
      }
    });

    return unsubscribe;
  }, [subscribe, taskId]);

  // Subscribe to comments for this task
  useEffect(() => {
    const unsubscribe = subscribe('comment.created', (event) => {
      if (event.data.comment.task_id === taskId) {
        setComments(prev => [...prev, event.data.comment]);
      }
    });

    return unsubscribe;
  }, [subscribe, taskId]);

  return (
    <div>
      <div className="connection-status">
        {isConnected ? '🟢 Live' : `🔴 ${status}`}
      </div>
      {task && <TaskDetailView task={task} comments={comments} />}
    </div>
  );
}

// ============================================================================
// Example 4: Custom Notifications
// ============================================================================

import { useTaskNotifications, NotificationContainer } from '../components';
import { useSSEContext } from '../components/SSEProvider';

function CustomNotificationExample() {
  const { addNotification, notifications, dismissNotification } = useTaskNotifications();
  const { subscribe } = useSSEContext();

  // Custom notification for high-priority tasks
  useEffect(() => {
    return subscribe('task.created', (event) => {
      const task = event.data.task;
      
      if (task.priority >= 4) {
        addNotification({
          type: 'warning',
          eventType: 'task.created',
          title: 'High Priority Task Created',
          message: `"${task.name}" requires immediate attention`,
          taskId: task.id,
          taskName: task.name,
          autoDismiss: false, // Don't auto-dismiss high priority
          actions: [
            {
              label: 'View Task',
              onClick: () => window.location.href = `/tasks/${task.id}`,
              variant: 'primary',
            },
            {
              label: 'Assign to Me',
              onClick: () => assignTaskToMe(task.id),
              variant: 'secondary',
            },
          ],
        });
      }
    });
  }, [subscribe, addNotification]);

  return (
    <NotificationContainer
      notifications={notifications}
      onDismiss={dismissNotification}
      position="top-right"
      maxNotifications={3}
    />
  );
}

// ============================================================================
// Example 5: Testing with Mock Events
// ============================================================================

import { createMockSSEClient, createMockTaskCreatedEvent } from '../lib/sse';

function TestExample() {
  const [mockEvents, setMockEvents] = React.useState<string[]>([]);

  const startMockStream = () => {
    const mockClient = createMockSSEClient({
      autoEmit: true,
      emitInterval: 3000, // Emit every 3 seconds
    });

    mockClient.subscribe('*', (event) => {
      setMockEvents(prev => [...prev, `${event.type} at ${new Date().toLocaleTimeString()}`]);
    });

    mockClient.connect();

    // Emit a specific event
    setTimeout(() => {
      mockClient.emit(createMockTaskCreatedEvent({
        name: 'Test Task from Mock',
        priority: 5,
      }));
    }, 1000);

    return () => mockClient.close();
  };

  return (
    <div>
      <button onClick={startMockStream}>Start Mock Stream</button>
      <ul>
        {mockEvents.map((event, i) => (
          <li key={i}>{event}</li>
        ))}
      </ul>
    </div>
  );
}

// ============================================================================
// Example 6: Provider-Only Setup (Manual Integration)
// ============================================================================

import { SSEProvider, useSSEContext } from '../components/SSEProvider';
import { SSEConnectionStatus } from '../components/SSEConnectionStatus';

function ManualIntegrationExample() {
  return (
    <SSEProvider
      url="/api/events"
      token="jwt-token"
      autoConnect={true}
      onConnect={() => console.log('SSE Connected')}
      onError={(error) => console.error('SSE Error:', error)}
    >
      <AppWithManualStatus />
    </SSEProvider>
  );
}

function AppWithManualStatus() {
  const { state, isConnected } = useSSEContext();

  return (
    <div>
      <SSEConnectionStatus
        status={state.status}
        reconnectAttempt={state.reconnectAttempt}
        lastError={state.lastError}
        onReconnect={() => window.location.reload()}
        size="md"
        showDetails={true}
      />
      
      {isConnected ? (
        <LiveDataComponents />
      ) : (
        <OfflineMode />
      )}
    </div>
  );
}

// ============================================================================
// Type definitions for examples
// ============================================================================

interface Task {
  id: number;
  name: string;
  description: string | null;
  status: 'inbox' | 'up_next' | 'in_progress' | 'in_review' | 'done';
  priority: number;
  blocked: number;
  assigned_to_agent: number;
  comment_count: number;
  created_at: string;
  updated_at: string;
}

interface Comment {
  id: number;
  task_id: number;
  author_name: string;
  content: string;
  created_at: string;
}

// Placeholder components
function TaskCard({ task }: { task: Task }) {
  return <div className="task-card">{task.name}</div>;
}

function TaskDetailView({ task, comments }: { task: Task; comments: Comment[] }) {
  return (
    <div>
      <h1>{task.name}</h1>
      <p>{task.description}</p>
      <div>{comments.length} comments</div>
    </div>
  );
}

function LiveDataComponents() {
  return <div>Live data components here</div>;
}

function OfflineMode() {
  return <div>Offline mode - showing cached data</div>;
}

function assignTaskToMe(taskId: number) {
  console.log('Assigning task:', taskId);
}

export default App;
