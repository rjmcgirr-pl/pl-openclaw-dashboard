/**
 * useSSE - React Hook for Server-Sent Events
 * 
 * Provides easy integration of SSE into React components with:
 * - Automatic connection management
 * - Event subscription helpers
 * - Connection state tracking
 * - Cleanup on unmount
 */

import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { EventSourceClient, createSSEClient } from '../lib/sse/EventSourceClient';
import {
  SSEEventType,
  SSEEventData,
  SSEConnectionStatus,
  SSEConnectionState,
  SSEEventHandler,
  TaskCreatedEvent,
  TaskUpdatedEvent,
  TaskDeletedEvent,
  TaskStatusChangedEvent,
  CommentCreatedEvent,
  CronJobEvent,
} from '../types/sse';

export interface UseSSEOptions {
  /** SSE endpoint URL */
  url: string;
  /** JWT token for authentication */
  token: string;
  /** Connect automatically on mount */
  autoConnect?: boolean;
  /** Reconnect on disconnect */
  reconnect?: boolean;
  /** Maximum reconnect attempts */
  maxReconnectAttempts?: number;
  /** Initial reconnect delay in ms */
  reconnectDelay?: number;
  /** Callback when connection is established */
  onConnect?: () => void;
  /** Callback when connection is lost */
  onDisconnect?: () => void;
  /** Callback on connection error */
  onError?: (error: Error) => void;
  /** Callback on reconnect attempt */
  onReconnect?: (attempt: number) => void;
}

export interface UseSSEReturn {
  /** Current connection state */
  state: SSEConnectionState;
  /** Connection status for easy checking */
  status: SSEConnectionStatus;
  /** Whether currently connected */
  isConnected: boolean;
  /** Whether currently reconnecting */
  isReconnecting: boolean;
  /** Connect to SSE endpoint */
  connect: () => void;
  /** Disconnect from SSE endpoint */
  disconnect: () => void;
  /** Subscribe to specific event type */
  subscribe: <T extends SSEEventData>(
    eventType: SSEEventType | '*',
    handler: SSEEventHandler<T>
  ) => () => void;
  /** Subscribe to multiple event types */
  subscribeToMany: <T extends SSEEventData>(
    eventTypes: SSEEventType[],
    handler: SSEEventHandler<T>
  ) => () => void;
  /** Subscribe to task events */
  onTaskCreated: (handler: SSEEventHandler<TaskCreatedEvent>) => () => void;
  onTaskUpdated: (handler: SSEEventHandler<TaskUpdatedEvent>) => () => void;
  onTaskDeleted: (handler: SSEEventHandler<TaskDeletedEvent>) => () => void;
  onTaskStatusChanged: (handler: SSEEventHandler<TaskStatusChangedEvent>) => () => void;
  /** Subscribe to comment events */
  onCommentCreated: (handler: SSEEventHandler<CommentCreatedEvent>) => () => void;
  /** Subscribe to cron job events */
  onCronJobEvent: (handler: SSEEventHandler<CronJobEvent>) => () => void;
  /** Wait for connection to be established */
  waitForConnection: (timeoutMs?: number) => Promise<void>;
}

/**
 * React hook for SSE connections
 * 
 * @example
 * ```tsx
 * function TaskList() {
 *   const { subscribe, isConnected, status } = useSSE({
 *     url: 'https://api.example.com/events',
 *     token: jwtToken,
 *     autoConnect: true,
 *   });
 * 
 *   useEffect(() => {
 *     return subscribe('task.created', (event) => {
 *       console.log('New task:', event.data.task);
 *     });
 *   }, [subscribe]);
 * 
 *   return <div>Status: {status}</div>;
 * }
 * ```
 */
export function useSSE(options: UseSSEOptions): UseSSEReturn {
  const {
    url,
    token,
    autoConnect = true,
    reconnect = true,
    maxReconnectAttempts = 10,
    reconnectDelay = 1000,
    onConnect,
    onDisconnect,
    onError,
    onReconnect,
  } = options;

  // Use ref to maintain stable client instance
  const clientRef = useRef<EventSourceClient | null>(null);
  const [state, setState] = useState<SSEConnectionState>({
    status: 'disconnected',
    reconnectAttempt: 0,
  });

  // Create client instance
  const getClient = useCallback((): EventSourceClient => {
    if (!clientRef.current) {
      clientRef.current = createSSEClient({
        url,
        token,
        reconnect,
        maxReconnectAttempts,
        reconnectDelay,
        onConnect: () => {
          setState((prev) => ({ ...prev, status: 'connected', reconnectAttempt: 0 }));
          onConnect?.();
        },
        onDisconnect: () => {
          setState((prev) => ({ ...prev, status: 'disconnected' }));
          onDisconnect?.();
        },
        onError: (error) => {
          setState((prev) => ({ ...prev, status: 'error', lastError: error }));
          onError?.(error);
        },
        onReconnect: (attempt) => {
          setState((prev) => ({ ...prev, status: 'reconnecting', reconnectAttempt: attempt }));
          onReconnect?.(attempt);
        },
      });
    }
    return clientRef.current;
  }, [url, token, reconnect, maxReconnectAttempts, reconnectDelay, onConnect, onDisconnect, onError, onReconnect]);

  // Connect function
  const connect = useCallback(() => {
    getClient().connect();
  }, [getClient]);

  // Disconnect function
  const disconnect = useCallback(() => {
    clientRef.current?.close();
    clientRef.current = null;
    setState({ status: 'disconnected', reconnectAttempt: 0 });
  }, []);

  // Subscribe function
  const subscribe = useCallback(<T extends SSEEventData>(
    eventType: SSEEventType | '*',
    handler: SSEEventHandler<T>
  ): (() => void) => {
    return getClient().subscribe(eventType, handler as SSEEventHandler);
  }, [getClient]);

  // Subscribe to many function
  const subscribeToMany = useCallback(<T extends SSEEventData>(
    eventTypes: SSEEventType[],
    handler: SSEEventHandler<T>
  ): (() => void) => {
    return getClient().subscribeToMany(eventTypes, handler as SSEEventHandler);
  }, [getClient]);

  // Convenience methods for common event types
  const onTaskCreated = useCallback((handler: SSEEventHandler<TaskCreatedEvent>): (() => void) => {
    return getClient().subscribe('task.created', handler as SSEEventHandler);
  }, [getClient]);

  const onTaskUpdated = useCallback((handler: SSEEventHandler<TaskUpdatedEvent>): (() => void) => {
    return getClient().subscribe('task.updated', handler as SSEEventHandler);
  }, [getClient]);

  const onTaskDeleted = useCallback((handler: SSEEventHandler<TaskDeletedEvent>): (() => void) => {
    return getClient().subscribe('task.deleted', handler as SSEEventHandler);
  }, [getClient]);

  const onTaskStatusChanged = useCallback((handler: SSEEventHandler<TaskStatusChangedEvent>): (() => void) => {
    return getClient().subscribe('task.status_changed', handler as SSEEventHandler);
  }, [getClient]);

  const onCommentCreated = useCallback((handler: SSEEventHandler<CommentCreatedEvent>): (() => void) => {
    return getClient().subscribe('comment.created', handler as SSEEventHandler);
  }, [getClient]);

  const onCronJobEvent = useCallback((handler: SSEEventHandler<CronJobEvent>): (() => void) => {
    return getClient().subscribeToMany(
      ['cron_job.started', 'cron_job.completed', 'cron_job.failed'],
      handler as SSEEventHandler
    );
  }, [getClient]);

  // Wait for connection
  const waitForConnection = useCallback((timeoutMs?: number): Promise<void> => {
    return getClient().waitForConnection(timeoutMs);
  }, [getClient]);

  // Auto-connect on mount
  useEffect(() => {
    if (autoConnect) {
      getClient().connect();
    }

    // Cleanup on unmount
    return () => {
      disconnect();
    };
  }, [autoConnect, getClient, disconnect]);

  // Memoized derived state
  const status = state.status;
  const isConnected = useMemo(() => state.status === 'connected', [state.status]);
  const isReconnecting = useMemo(() => state.status === 'reconnecting', [state.status]);

  return {
    state,
    status,
    isConnected,
    isReconnecting,
    connect,
    disconnect,
    subscribe,
    subscribeToMany,
    onTaskCreated,
    onTaskUpdated,
    onTaskDeleted,
    onTaskStatusChanged,
    onCommentCreated,
    onCronJobEvent,
    waitForConnection,
  };
}

/**
 * Hook for subscribing to specific task events
 * Automatically handles subscription cleanup
 * 
 * @example
 * ```tsx
 * function useTaskUpdates(taskId: number) {
 *   const [task, setTask] = useState<Task | null>(null);
 *   const { onTaskUpdated } = useSSE({ url, token });
 * 
 *   useTaskEvent('task.updated', (event) => {
 *     if (event.data.task.id === taskId) {
 *       setTask(event.data.task);
 *     }
 *   }, [taskId]);
 * 
 *   return task;
 * }
 * ```
 */
export function useTaskEvent(
  eventType: SSEEventType,
  handler: SSEEventHandler,
  deps: React.DependencyList = []
): void {
  const { subscribe } = useSSE({
    url: process.env.REACT_APP_SSE_URL || '/events',
    token: '', // Should be provided via context or prop
    autoConnect: true,
  });

  useEffect(() => {
    return subscribe(eventType, handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

export default useSSE;
