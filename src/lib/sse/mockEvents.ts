/**
 * Mock SSE Events for Testing
 * 
 * Provides mock event generators for testing SSE components
 * without requiring a live backend connection.
 */

import {
  SSEEventType,
  SSEEventData,
  TaskCreatedEvent,
  TaskUpdatedEvent,
  TaskDeletedEvent,
  TaskStatusChangedEvent,
  TaskEventData,
  CommentCreatedEvent,
  CommentEventData,
  CronJobEvent,
} from '../../types/sse';

// Sample task data
const sampleTasks: TaskEventData['task'][] = [
  {
    id: 1,
    name: 'Implement SSE frontend',
    description: 'Create EventSource client with JWT auth',
    status: 'in_progress',
    priority: 5,
    blocked: 0,
    assigned_to_agent: 0,
    comment_count: 3,
    created_at: '2026-02-13T20:00:00Z',
    updated_at: '2026-02-13T21:00:00Z',
  },
  {
    id: 2,
    name: 'Update task list component',
    description: 'Add real-time updates to task list',
    status: 'up_next',
    priority: 4,
    blocked: 0,
    assigned_to_agent: 0,
    comment_count: 1,
    created_at: '2026-02-13T19:00:00Z',
    updated_at: '2026-02-13T19:30:00Z',
  },
  {
    id: 3,
    name: 'Create toast notifications',
    description: 'Build notification system for task events',
    status: 'inbox',
    priority: 3,
    blocked: 0,
    assigned_to_agent: 0,
    comment_count: 0,
    created_at: '2026-02-13T18:00:00Z',
    updated_at: '2026-02-13T18:00:00Z',
  },
];

/**
 * Generate a random task
 */
export function generateMockTask(override?: Partial<TaskEventData['task']>): TaskEventData['task'] {
  const id = Math.floor(Math.random() * 1000) + 10;
  return {
    id,
    name: `Task ${id}: ${['Review', 'Update', 'Create', 'Fix', 'Implement'][Math.floor(Math.random() * 5)]} ${['API', 'UI', 'database', 'tests', 'documentation'][Math.floor(Math.random() * 5)]}`,
    description: 'Mock task description',
    status: ['inbox', 'up_next', 'in_progress', 'in_review', 'done'][Math.floor(Math.random() * 5)] as TaskEventData['task']['status'],
    priority: Math.floor(Math.random() * 6),
    blocked: Math.random() > 0.8 ? 1 : 0,
    assigned_to_agent: Math.random() > 0.5 ? 1 : 0,
    comment_count: Math.floor(Math.random() * 10),
    created_at: new Date(Date.now() - Math.random() * 86400000).toISOString(),
    updated_at: new Date().toISOString(),
    ...override,
  };
}

/**
 * Create mock task.created event
 */
export function createMockTaskCreatedEvent(task?: Partial<TaskEventData['task']>): TaskCreatedEvent {
  return {
    type: 'task.created',
    timestamp: new Date().toISOString(),
    id: `evt-${Date.now()}`,
    data: {
      task: task ? { ...generateMockTask(), ...task } : generateMockTask(),
      changedBy: {
        id: 'user@example.com',
        name: 'John Doe',
        type: 'human',
      },
    },
  };
}

/**
 * Create mock task.updated event
 */
export function createMockTaskUpdatedEvent(
  taskId?: number,
  changes?: Partial<TaskEventData['task']>
): TaskUpdatedEvent {
  const task = sampleTasks.find((t) => t.id === taskId) || sampleTasks[0];
  const previousValues = changes
    ? Object.keys(changes).reduce((acc, key) => {
        acc[key as keyof typeof task] = task[key as keyof typeof task];
        return acc;
      }, {} as Partial<TaskEventData['task']>)
    : { priority: task.priority };

  return {
    type: 'task.updated',
    timestamp: new Date().toISOString(),
    id: `evt-${Date.now()}`,
    data: {
      task: { ...task, ...changes, updated_at: new Date().toISOString() },
      previousValues,
      changedBy: {
        id: Math.random() > 0.5 ? 'user@example.com' : 'agent-1',
        name: Math.random() > 0.5 ? 'John Doe' : 'Clawdbot',
        type: Math.random() > 0.5 ? 'human' : 'agent',
      },
    },
  };
}

/**
 * Create mock task.deleted event
 */
export function createMockTaskDeletedEvent(taskId?: number): TaskDeletedEvent {
  const task = sampleTasks.find((t) => t.id === taskId) || sampleTasks[0];
  return {
    type: 'task.deleted',
    timestamp: new Date().toISOString(),
    id: `evt-${Date.now()}`,
    data: {
      taskId: task.id,
      taskName: task.name,
      deletedBy: {
        id: 'user@example.com',
        name: 'John Doe',
        type: 'human',
      },
    },
  };
}

/**
 * Create mock task.status_changed event
 */
export function createMockTaskStatusChangedEvent(
  taskId?: number,
  newStatus?: TaskEventData['task']['status']
): TaskStatusChangedEvent {
  const task = sampleTasks.find((t) => t.id === taskId) || sampleTasks[0];
  const statuses: TaskEventData['task']['status'][] = ['inbox', 'up_next', 'in_progress', 'in_review', 'done'];
  const currentIndex = statuses.indexOf(task.status);
  const nextStatus = newStatus || statuses[(currentIndex + 1) % statuses.length];

  return {
    type: 'task.status_changed',
    timestamp: new Date().toISOString(),
    id: `evt-${Date.now()}`,
    data: {
      task: { ...task, status: nextStatus, updated_at: new Date().toISOString() },
      previousStatus: task.status,
      newStatus: nextStatus,
      previousValues: { status: task.status },
      changedBy: {
        id: Math.random() > 0.5 ? 'user@example.com' : 'agent-1',
        name: Math.random() > 0.5 ? 'John Doe' : 'Clawdbot',
        type: Math.random() > 0.5 ? 'human' : 'agent',
      },
    },
  };
}

/**
 * Create mock comment.created event
 */
export function createMockCommentCreatedEvent(taskId?: number): CommentCreatedEvent {
  const task = sampleTasks.find((t) => t.id === taskId) || sampleTasks[0];
  return {
    type: 'comment.created',
    timestamp: new Date().toISOString(),
    id: `evt-${Date.now()}`,
    data: {
      comment: {
        id: Math.floor(Math.random() * 1000),
        task_id: task.id,
        task_name: task.name,
        author_type: Math.random() > 0.5 ? 'human' : 'agent',
        author_name: Math.random() > 0.5 ? 'John Doe' : 'Clawdbot',
        content: [
          'Great work on this!',
          'Can we discuss the approach?',
          'This is now complete.',
          'I have a question about the implementation...',
          'LGTM! 👍',
        ][Math.floor(Math.random() * 5)],
        created_at: new Date().toISOString(),
      },
    },
  };
}

/**
 * Create mock cron job event
 */
export function createMockCronJobEvent(
  status: 'cron_job.started' | 'cron_job.completed' | 'cron_job.failed'
): CronJobEvent {
  return {
    type: status,
    timestamp: new Date().toISOString(),
    id: `evt-${Date.now()}`,
    data: {
      cronJob: {
        id: Math.floor(Math.random() * 100),
        name: ['Daily Backup', 'Report Generation', 'Cleanup Job', 'Sync Task'][Math.floor(Math.random() * 4)],
        status: status === 'cron_job.started' ? 'running' : status === 'cron_job.completed' ? 'done' : 'error',
        last_output: status === 'cron_job.completed' ? 'Job completed successfully' : status === 'cron_job.failed' ? 'Error: Connection timeout' : undefined,
        last_run_at: new Date().toISOString(),
      },
    },
  };
}

/**
 * Mock SSE Client for testing
 * Simulates EventSourceClient behavior without actual connection
 */
export class MockEventSourceClient {
  private listeners: Map<SSEEventType | '*', Array<(event: SSEEventData) => void>> = new Map();
  private isConnected = false;
  private mockInterval: ReturnType<typeof setInterval> | null = null;
  private options: {
    autoEmit?: boolean;
    emitInterval?: number;
    eventTypes?: SSEEventType[];
  };

  constructor(options: { autoEmit?: boolean; emitInterval?: number; eventTypes?: SSEEventType[] } = {}) {
    this.options = {
      autoEmit: true,
      emitInterval: 5000,
      eventTypes: ['task.created', 'task.updated', 'task.status_changed', 'comment.created'],
      ...options,
    };
  }

  connect(): void {
    this.isConnected = true;
    console.log('[MockSSE] Connected');

    // Emit connected event
    this.emit({
      type: 'connected',
      timestamp: new Date().toISOString(),
      data: { message: 'Connected to mock SSE stream' },
    });

    if (this.options.autoEmit) {
      this.startAutoEmit();
    }
  }

  close(): void {
    this.isConnected = false;
    if (this.mockInterval) {
      clearInterval(this.mockInterval);
      this.mockInterval = null;
    }
    console.log('[MockSSE] Disconnected');
  }

  subscribe<T extends SSEEventData>(
    eventType: SSEEventType | '*',
    handler: (event: T) => void
  ): () => void {
    const handlers = this.listeners.get(eventType) || [];
    handlers.push(handler as (event: SSEEventData) => void);
    this.listeners.set(eventType, handlers);

    return () => {
      const handlers = this.listeners.get(eventType) || [];
      const index = handlers.indexOf(handler as (event: SSEEventData) => void);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    };
  }

  /**
   * Emit a mock event
   */
  emit(event: SSEEventData): void {
    const handlers = this.listeners.get(event.type) || [];
    const wildcardHandlers = this.listeners.get('*') || [];

    [...handlers, ...wildcardHandlers].forEach((handler) => {
      try {
        handler(event);
      } catch (error) {
        console.error('[MockSSE] Handler error:', error);
      }
    });
  }

  /**
   * Emit specific event type
   */
  emitEvent(type: SSEEventType, data?: unknown): void {
    const event: SSEEventData = {
      type,
      timestamp: new Date().toISOString(),
      id: `evt-${Date.now()}`,
      data: data || {},
    };
    this.emit(event);
  }

  /**
   * Start automatic event emission
   */
  private startAutoEmit(): void {
    const eventFactories: Array<() => SSEEventData> = [
      () => createMockTaskCreatedEvent(),
      () => createMockTaskUpdatedEvent(),
      () => createMockTaskStatusChangedEvent(),
      () => createMockCommentCreatedEvent(),
    ];

    this.mockInterval = setInterval(() => {
      if (!this.isConnected) return;

      const factory = eventFactories[Math.floor(Math.random() * eventFactories.length)];
      const event = factory();

      if (!this.options.eventTypes || this.options.eventTypes.includes(event.type)) {
        this.emit(event);
      }
    }, this.options.emitInterval);
  }

  get isConnectedValue(): boolean {
    return this.isConnected;
  }
}

/**
 * Create mock EventSourceClient for testing
 */
export function createMockSSEClient(options?: { autoEmit?: boolean; emitInterval?: number }) {
  return new MockEventSourceClient(options);
}

export default MockEventSourceClient;
