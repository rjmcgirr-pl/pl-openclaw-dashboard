/**
 * SSEIntegratedApp - Complete SSE Integration Component
 * 
 * Combines SSEProvider, connection status, and notifications
 * into a single drop-in component for the application.
 */

import React, { useCallback, useEffect } from 'react';
import { SSEProvider, useSSEContext } from './SSEProvider';
import { SSEConnectionStatus, SSEConnectionDot } from './SSEConnectionStatus';
import {
  NotificationContainer,
  useTaskNotifications,
  TaskNotification,
} from './TaskUpdateNotification';
import {
  TaskCreatedEvent,
  TaskUpdatedEvent,
  TaskDeletedEvent,
  TaskStatusChangedEvent,
  CommentCreatedEvent,
} from '../types/sse';

interface SSEIntegrationProps {
  children: React.ReactNode;
  url: string;
  token: string;
  showConnectionStatus?: boolean;
  connectionStatusPosition?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  showNotifications?: boolean;
  notificationPosition?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  compactStatus?: boolean;
  autoConnect?: boolean;
  onTaskCreated?: (event: TaskCreatedEvent) => void;
  onTaskUpdated?: (event: TaskUpdatedEvent) => void;
  onTaskDeleted?: (event: TaskDeletedEvent) => void;
  onTaskStatusChanged?: (event: TaskStatusChangedEvent) => void;
  onCommentCreated?: (event: CommentCreatedEvent) => void;
}

/**
 * Internal component that handles subscriptions and notifications
 */
const SSEIntegrationInner: React.FC<Omit<SSEIntegrationProps, 'url' | 'token' | 'autoConnect'>> = ({
  children,
  showConnectionStatus = true,
  connectionStatusPosition = 'bottom-right',
  showNotifications = true,
  notificationPosition = 'top-right',
  compactStatus = false,
  onTaskCreated,
  onTaskUpdated,
  onTaskDeleted,
  onTaskStatusChanged,
  onCommentCreated,
}) => {
  const { state, subscribe } = useSSEContext();
  const {
    notifications,
    dismissNotification,
    createTaskNotification,
  } = useTaskNotifications();

  // Subscribe to task events and create notifications
  useEffect(() => {
    const unsubscribeCreated = subscribe('task.created', (event) => {
      createTaskNotification(event as TaskCreatedEvent);
      onTaskCreated?.(event as TaskCreatedEvent);
    });

    const unsubscribeUpdated = subscribe('task.updated', (event) => {
      createTaskNotification(event as TaskUpdatedEvent);
      onTaskUpdated?.(event as TaskUpdatedEvent);
    });

    const unsubscribeDeleted = subscribe('task.deleted', (event) => {
      createTaskNotification(event as TaskDeletedEvent);
      onTaskDeleted?.(event as TaskDeletedEvent);
    });

    const unsubscribeStatusChanged = subscribe('task.status_changed', (event) => {
      createTaskNotification(event as TaskStatusChangedEvent);
      onTaskStatusChanged?.(event as TaskStatusChangedEvent);
    });

    const unsubscribeComment = subscribe('comment.created', (event) => {
      createTaskNotification(event as CommentCreatedEvent);
      onCommentCreated?.(event as CommentCreatedEvent);
    });

    return () => {
      unsubscribeCreated();
      unsubscribeUpdated();
      unsubscribeDeleted();
      unsubscribeStatusChanged();
      unsubscribeComment();
    };
  }, [
    subscribe,
    createTaskNotification,
    onTaskCreated,
    onTaskUpdated,
    onTaskDeleted,
    onTaskStatusChanged,
    onCommentCreated,
  ]);

  return (
    <>
      {children}

      {/* Connection Status */}
      {showConnectionStatus && (
        <>
          {compactStatus ? (
            <SSEConnectionDot
              status={state.status}
              fixed
              position={connectionStatusPosition}
            />
          ) : (
            <SSEConnectionStatus
              status={state.status}
              reconnectAttempt={state.reconnectAttempt}
              lastError={state.lastError}
              lastEventTime={state.lastEventTime}
              fixed
              position={connectionStatusPosition}
              size="sm"
            />
          )}
        </>
      )}

      {/* Notifications */}
      {showNotifications && (
        <NotificationContainer
          notifications={notifications}
          onDismiss={dismissNotification}
          position={notificationPosition}
        />
      )}
    </>
  );
};

/**
 * Complete SSE Integration Component
 * 
 * Wraps children with SSE connection, status indicator, and notifications.
 * 
 * @example
 * ```tsx
 * <SSEIntegratedApp
 *   url="/api/events"
 *   token={jwtToken}
 *   showConnectionStatus={true}
 *   showNotifications={true}
 * >
 *   <YourApp />
 * </SSEIntegratedApp>
 * ```
 */
export const SSEIntegratedApp: React.FC<SSEIntegrationProps> = ({
  children,
  url,
  token,
  autoConnect = true,
  ...props
}) => {
  return (
    <SSEProvider url={url} token={token} autoConnect={autoConnect}>
      <SSEIntegrationInner {...props}>
        {children}
      </SSEIntegrationInner>
    </SSEProvider>
  );
};

export default SSEIntegratedApp;
