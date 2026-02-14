/**
 * SSE (Server-Sent Events) Type Definitions
 * Defines types for real-time task updates via EventSource
 */

export type SSEEventType = 
  | 'task.created'
  | 'task.updated'
  | 'task.deleted'
  | 'task.status_changed'
  | 'task.priority_changed'
  | 'task.assigned'
  | 'comment.created'
  | 'comment.updated'
  | 'comment.deleted'
  | 'cron_job.started'
  | 'cron_job.completed'
  | 'cron_job.failed'
  | 'ping'
  | 'connected';

export interface SSEEventData {
  type: SSEEventType;
  timestamp: string;
  id?: string;
  data: unknown;
}

export interface TaskEventData {
  task: {
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
  };
  previousValues?: Partial<TaskEventData['task']>;
  changedBy?: {
    id: string;
    name: string;
    type: 'human' | 'agent';
  };
}

export interface TaskCreatedEvent extends SSEEventData {
  type: 'task.created';
  data: TaskEventData;
}

export interface TaskUpdatedEvent extends SSEEventData {
  type: 'task.updated';
  data: TaskEventData;
}

export interface TaskDeletedEvent extends SSEEventData {
  type: 'task.deleted';
  data: {
    taskId: number;
    taskName: string;
    deletedBy?: {
      id: string;
      name: string;
      type: 'human' | 'agent';
    };
  };
}

export interface TaskStatusChangedEvent extends SSEEventData {
  type: 'task.status_changed';
  data: TaskEventData & {
    previousStatus: TaskEventData['task']['status'];
    newStatus: TaskEventData['task']['status'];
  };
}

export interface CommentEventData {
  comment: {
    id: number;
    task_id: number;
    task_name?: string;
    author_type: 'human' | 'agent' | 'system';
    author_name: string;
    content: string;
    created_at: string;
  };
}

export interface CommentCreatedEvent extends SSEEventData {
  type: 'comment.created';
  data: CommentEventData;
}

export interface CronJobEventData {
  cronJob: {
    id: number;
    name: string;
    status: 'pending' | 'running' | 'done' | 'error' | 'stalled';
    last_output?: string;
    last_run_at?: string;
  };
}

export interface CronJobEvent extends SSEEventData {
  type: 'cron_job.started' | 'cron_job.completed' | 'cron_job.failed';
  data: CronJobEventData;
}

export type SSEConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error' | 'reconnecting';

export interface SSEConnectionState {
  status: SSEConnectionStatus;
  lastError?: Error;
  reconnectAttempt: number;
  lastEventTime?: Date;
}

export interface SSEClientOptions {
  url: string;
  token: string;
  authMethod?: 'bearer' | 'query';
  reconnect?: boolean;
  maxReconnectAttempts?: number;
  reconnectDelay?: number;
  maxReconnectDelay?: number;
  reconnectBackoffMultiplier?: number;
  heartbeatInterval?: number;
  eventHandlers?: Partial<Record<SSEEventType, (event: SSEEventData) => void>>;
  onConnect?: () => void;
  onDisconnect?: (event: CloseEvent) => void;
  onError?: (error: Error) => void;
  onReconnect?: (attempt: number) => void;
}

export type SSEEventHandler<T extends SSEEventData = SSEEventData> = (event: T) => void;

export interface SSESubscription {
  eventType: SSEEventType | '*';
  handler: SSEEventHandler;
  id: string;
}
