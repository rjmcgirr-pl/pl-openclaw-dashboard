/**
 * Hook exports index
 * Central export point for all SSE-related hooks
 */

export { useSSE, useTaskEvent } from './useSSE';
export type { UseSSEOptions, UseSSEReturn } from './useSSE';

export { useRealTimeTasks } from './useRealTimeTasks';
export type { 
  Task, 
  UseRealTimeTasksOptions, 
  UseRealTimeTasksReturn 
} from './useRealTimeTasks';

export { useTaskNotifications } from '../components/TaskUpdateNotification';
export type { TaskNotification, NotificationAction } from '../components/TaskUpdateNotification';

export { useSSEContext } from '../components/SSEProvider';
