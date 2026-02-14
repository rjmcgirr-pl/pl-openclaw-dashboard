/**
 * Component exports index
 * Central export point for all SSE-related components
 */

export { SSEConnectionStatus, SSEConnectionDot } from './SSEConnectionStatus';
export type { SSEConnectionStatusProps } from './SSEConnectionStatus';

export {
  TaskUpdateNotification,
  NotificationContainer,
  useTaskNotifications,
} from './TaskUpdateNotification';
export type {
  TaskNotification,
  NotificationAction,
  TaskUpdateNotificationProps,
  NotificationContainerProps,
} from './TaskUpdateNotification';

export { SSEProvider, useSSEContext } from './SSEProvider';
export type { SSEProviderProps } from './SSEProvider';

export { SSEIntegratedApp } from './SSEIntegratedApp';
export type { SSEIntegrationProps } from './SSEIntegratedApp';

// TagBadge Component (Ticket #43)
export { TagBadge, TagBadgeGroup } from './TagBadge';
export type { TagBadgeProps, TagBadgeGroupProps, Tag } from './TagBadge';
