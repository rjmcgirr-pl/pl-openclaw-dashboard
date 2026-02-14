/**
 * TaskUpdateNotification Component
 * 
 * Toast notification system for task events with:
 * - Auto-dismiss with progress bar
 * - Multiple notification types (success, info, warning, error)
 * - Support for different event types (created, updated, deleted, status changed)
 * - Action buttons (View Task, Undo, Dismiss)
 * - Stacking and positioning
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  SSEEventType,
  TaskCreatedEvent,
  TaskUpdatedEvent,
  TaskDeletedEvent,
  TaskStatusChangedEvent,
  CommentCreatedEvent,
} from '../types/sse';

export type NotificationType = 'success' | 'info' | 'warning' | 'error';

export interface TaskNotification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  eventType: SSEEventType;
  taskId?: number;
  taskName?: string;
  timestamp: Date;
  autoDismiss?: boolean;
  dismissDelay?: number;
  actions?: NotificationAction[];
}

export interface NotificationAction {
  label: string;
  onClick: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
}

export interface TaskUpdateNotificationProps {
  notification: TaskNotification;
  onDismiss: (id: string) => void;
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
}

/**
 * Individual notification toast component
 */
export const TaskUpdateNotification: React.FC<TaskUpdateNotificationProps> = ({
  notification,
  onDismiss,
}) => {
  const [progress, setProgress] = useState(100);
  const [isPaused, setIsPaused] = useState(false);
  const [isExiting, setIsExiting] = useState(false);

  const {
    id,
    type,
    title,
    message,
    autoDismiss = true,
    dismissDelay = 5000,
    actions = [],
  } = notification;

  // Auto-dismiss with progress bar
  useEffect(() => {
    if (!autoDismiss || isPaused) return;

    const startTime = Date.now();
    const duration = dismissDelay;

    const updateProgress = () => {
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, 100 - (elapsed / duration) * 100);
      setProgress(remaining);

      if (remaining > 0) {
        requestAnimationFrame(updateProgress);
      } else {
        handleDismiss();
      }
    };

    const animationFrame = requestAnimationFrame(updateProgress);
    return () => cancelAnimationFrame(animationFrame);
  }, [autoDismiss, dismissDelay, isPaused]);

  const handleDismiss = useCallback(() => {
    setIsExiting(true);
    setTimeout(() => onDismiss(id), 300);
  }, [id, onDismiss]);

  const handleActionClick = (action: NotificationAction) => {
    action.onClick();
    handleDismiss();
  };

  // Type-based styling
  const typeStyles = {
    success: {
      bg: 'bg-green-50',
      border: 'border-green-400',
      iconBg: 'bg-green-100',
      iconColor: 'text-green-600',
      progress: 'bg-green-500',
    },
    info: {
      bg: 'bg-blue-50',
      border: 'border-blue-400',
      iconBg: 'bg-blue-100',
      iconColor: 'text-blue-600',
      progress: 'bg-blue-500',
    },
    warning: {
      bg: 'bg-yellow-50',
      border: 'border-yellow-400',
      iconBg: 'bg-yellow-100',
      iconColor: 'text-yellow-600',
      progress: 'bg-yellow-500',
    },
    error: {
      bg: 'bg-red-50',
      border: 'border-red-400',
      iconBg: 'bg-red-100',
      iconColor: 'text-red-600',
      progress: 'bg-red-500',
    },
  };

  // Icons for each type
  const typeIcons = {
    success: (
      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
        <path
          fillRule="evenodd"
          d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
          clipRule="evenodd"
        />
      </svg>
    ),
    info: (
      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
        <path
          fillRule="evenodd"
          d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
          clipRule="evenodd"
        />
      </svg>
    ),
    warning: (
      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
        <path
          fillRule="evenodd"
          d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
          clipRule="evenodd"
        />
      </svg>
    ),
    error: (
      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
        <path
          fillRule="evenodd"
          d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
          clipRule="evenodd"
        />
      </svg>
    ),
  };

  const styles = typeStyles[type];

  return (
    <div
      className={`
        relative w-full max-w-sm p-4 rounded-lg shadow-lg border-l-4
        ${styles.bg} ${styles.border}
        transform transition-all duration-300 ease-out
        ${isExiting ? 'opacity-0 translate-x-full' : 'opacity-100 translate-x-0'}
      `}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      role="alert"
    >
      {/* Progress bar */}
      {autoDismiss && (
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-gray-200 rounded-b-lg overflow-hidden">
          <div
            className={`h-full transition-all duration-100 ease-linear ${styles.progress}`}
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      <div className="flex items-start space-x-3">
        {/* Icon */}
        <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${styles.iconBg} ${styles.iconColor}`}>
          {typeIcons[type]}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <h4 className={`text-sm font-semibold ${styles.iconColor}`}>{title}</h4>
          <p className="mt-1 text-sm text-gray-600">{message}</p>

          {/* Actions */}
          {actions.length > 0 && (
            <div className="mt-3 flex space-x-2">
              {actions.map((action, index) => (
                <button
                  key={index}
                  onClick={() => handleActionClick(action)}
                  className={`
                    px-3 py-1.5 text-xs font-medium rounded transition-colors
                    ${
                      action.variant === 'primary'
                        ? `bg-blue-600 text-white hover:bg-blue-700`
                        : action.variant === 'danger'
                        ? `bg-red-600 text-white hover:bg-red-700`
                        : `bg-white border border-gray-300 text-gray-700 hover:bg-gray-50`
                    }
                  `}
                >
                  {action.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Dismiss button */}
        <button
          onClick={handleDismiss}
          className="flex-shrink-0 text-gray-400 hover:text-gray-600 transition-colors"
          aria-label="Dismiss"
        >
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
              clipRule="evenodd"
            />
          </svg>
        </button>
      </div>
    </div>
  );
};

/**
 * Container for multiple notifications
 */
export interface NotificationContainerProps {
  notifications: TaskNotification[];
  onDismiss: (id: string) => void;
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  maxNotifications?: number;
}

export const NotificationContainer: React.FC<NotificationContainerProps> = ({
  notifications,
  onDismiss,
  position = 'top-right',
  maxNotifications = 5,
}) => {
  const positionClasses = {
    'top-left': 'top-4 left-4 items-start',
    'top-right': 'top-4 right-4 items-end',
    'bottom-left': 'bottom-4 left-4 items-start flex-col-reverse',
    'bottom-right': 'bottom-4 right-4 items-end flex-col-reverse',
  };

  // Limit notifications
  const visibleNotifications = notifications.slice(-maxNotifications);

  return (
    <div
      className={`
        fixed z-50 flex flex-col gap-3 pointer-events-none
        ${positionClasses[position]}
      `}
    >
      {visibleNotifications.map((notification) => (
        <div key={notification.id} className="pointer-events-auto">
          <TaskUpdateNotification
            notification={notification}
            onDismiss={onDismiss}
            position={position}
          />
        </div>
      ))}
    </div>
  );
};

/**
 * Hook for managing notifications
 */
export function useTaskNotifications() {
  const [notifications, setNotifications] = useState<TaskNotification[]>([]);

  const addNotification = useCallback((notification: Omit<TaskNotification, 'id' | 'timestamp'>) => {
    const id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    setNotifications((prev) => [...prev, { ...notification, id, timestamp: new Date() }]);
    return id;
  }, []);

  const dismissNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const clearAll = useCallback(() => {
    setNotifications([]);
  }, []);

  // Create notification from SSE event
  const createTaskNotification = useCallback(
    (event: TaskCreatedEvent | TaskUpdatedEvent | TaskDeletedEvent | TaskStatusChangedEvent | CommentCreatedEvent): string | null => {
      const baseNotification = {
        autoDismiss: true,
        dismissDelay: 5000,
      };

      switch (event.type) {
        case 'task.created': {
          const task = event.data.task;
          return addNotification({
            ...baseNotification,
            type: 'success',
            eventType: 'task.created',
            title: 'Task Created',
            message: `"${task.name}" was created`,
            taskId: task.id,
            taskName: task.name,
            actions: [
              {
                label: 'View Task',
                onClick: () => {
                  // Navigate to task
                  window.location.href = `/tasks/${task.id}`;
                },
                variant: 'primary',
              },
            ],
          });
        }

        case 'task.updated': {
          const task = event.data.task;
          const changedFields = event.data.previousValues
            ? Object.keys(event.data.previousValues).join(', ')
            : 'fields';
          return addNotification({
            ...baseNotification,
            type: 'info',
            eventType: 'task.updated',
            title: 'Task Updated',
            message: `"${task.name}" ${changedFields} updated`,
            taskId: task.id,
            taskName: task.name,
          });
        }

        case 'task.deleted': {
          return addNotification({
            ...baseNotification,
            type: 'warning',
            eventType: 'task.deleted',
            title: 'Task Deleted',
            message: `"${event.data.taskName}" was deleted`,
            taskId: event.data.taskId,
            taskName: event.data.taskName,
          });
        }

        case 'task.status_changed': {
          const task = event.data.task;
          return addNotification({
            ...baseNotification,
            type: 'info',
            eventType: 'task.status_changed',
            title: 'Status Changed',
            message: `"${task.name}" moved to ${task.status.replace('_', ' ')}`,
            taskId: task.id,
            taskName: task.name,
          });
        }

        case 'comment.created': {
          const comment = event.data.comment;
          return addNotification({
            ...baseNotification,
            type: 'info',
            eventType: 'comment.created',
            title: 'New Comment',
            message: `${comment.author_name} commented on "${comment.task_name}"`,
            taskId: comment.task_id,
            taskName: comment.task_name,
          });
        }

        default:
          return null;
      }
    },
    [addNotification]
  );

  return {
    notifications,
    addNotification,
    dismissNotification,
    clearAll,
    createTaskNotification,
  };
}

export default TaskUpdateNotification;
