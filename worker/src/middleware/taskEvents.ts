/**
 * Task Events Middleware
 * Hooks into task CRUD operations to emit SSE events
 * 
 * Ticket #22: Task Event Broadcasting
 */

import type { Env, Task, UpdateTaskRequest } from '../types';
import {
  broadcastTaskCreated,
  broadcastTaskUpdated,
  broadcastTaskDeleted,
  broadcastTaskStatusChanged,
} from '../sse/broadcast';

/**
 * Hook to emit event after task creation
 * Call this after successfully creating a task
 */
export async function emitTaskCreated(
  env: Env,
  task: Task,
  userId?: string
): Promise<void> {
  try {
    await broadcastTaskCreated(env, task as unknown as Record<string, unknown>, userId);
    console.log(`[taskEvents] Emitted task.created for task ${task.id}`);
  } catch (error) {
    // Log but don't fail the request if broadcast fails
    console.error(`[taskEvents] Failed to emit task.created for task ${task.id}:`, error);
  }
}

/**
 * Hook to emit event after task update
 * Call this after successfully updating a task
 */
export async function emitTaskUpdated(
  env: Env,
  task: Task,
  previousTask: Task | null,
  userId?: string
): Promise<void> {
  try {
    // Check if status changed
    if (previousTask && previousTask.status !== task.status) {
      // Emit status_changed event
      await broadcastTaskStatusChanged(
        env,
        task as unknown as Record<string, unknown>,
        previousTask.status,
        task.status,
        userId
      );
      console.log(`[taskEvents] Emitted task.status_changed for task ${task.id}: ${previousTask.status} -> ${task.status}`);
    }

    // Emit updated event
    await broadcastTaskUpdated(env, task as unknown as Record<string, unknown>, userId);
    console.log(`[taskEvents] Emitted task.updated for task ${task.id}`);
  } catch (error) {
    console.error(`[taskEvents] Failed to emit task.updated for task ${task.id}:`, error);
  }
}

/**
 * Hook to emit event after task deletion
 * Call this after successfully deleting a task
 */
export async function emitTaskDeleted(
  env: Env,
  taskId: number,
  userId?: string
): Promise<void> {
  try {
    await broadcastTaskDeleted(env, taskId, userId);
    console.log(`[taskEvents] Emitted task.deleted for task ${taskId}`);
  } catch (error) {
    console.error(`[taskEvents] Failed to emit task.deleted for task ${taskId}:`, error);
  }
}

/**
 * Detect changes between old and new task for selective event emission
 */
export function detectTaskChanges(
  previousTask: Task,
  updateRequest: UpdateTaskRequest
): {
  hasChanges: boolean;
  statusChanged: boolean;
  previousStatus?: string;
  newStatus?: string;
} {
  const changes: {
    hasChanges: boolean;
    statusChanged: boolean;
    previousStatus?: string;
    newStatus?: string;
  } = {
    hasChanges: false,
    statusChanged: false,
  };

  // Check each field for changes
  if (updateRequest.name !== undefined && updateRequest.name !== previousTask.name) {
    changes.hasChanges = true;
  }
  if (updateRequest.description !== undefined && updateRequest.description !== previousTask.description) {
    changes.hasChanges = true;
  }
  if (updateRequest.priority !== undefined && updateRequest.priority !== previousTask.priority) {
    changes.hasChanges = true;
  }
  if (updateRequest.blocked !== undefined && (updateRequest.blocked ? 1 : 0) !== previousTask.blocked) {
    changes.hasChanges = true;
  }
  if (updateRequest.assigned_to_agent !== undefined && (updateRequest.assigned_to_agent ? 1 : 0) !== previousTask.assigned_to_agent) {
    changes.hasChanges = true;
  }
  if (updateRequest.archived !== undefined && (updateRequest.archived ? 1 : 0) !== previousTask.archived) {
    changes.hasChanges = true;
  }
  if (updateRequest.status !== undefined && updateRequest.status !== previousTask.status) {
    changes.hasChanges = true;
    changes.statusChanged = true;
    changes.previousStatus = previousTask.status;
    changes.newStatus = updateRequest.status;
  }

  return changes;
}

/**
 * Middleware wrapper for task creation
 * Usage: Wrap the createTask function with this to auto-emit events
 */
export function withTaskEvents<T extends (...args: unknown[]) => Promise<Response>>(
  fn: T,
  env: Env,
  userId?: string
): T {
  return (async (...args: unknown[]) => {
    const result = await fn(...args);
    
    // If successful, emit event
    if (result.status === 201 || result.status === 200) {
      try {
        const body = await result.clone().json() as { task?: Task };
        if (body.task) {
          await emitTaskCreated(env, body.task, userId);
        }
      } catch {
        // Ignore parsing errors
      }
    }
    
    return result;
  }) as T;
}
