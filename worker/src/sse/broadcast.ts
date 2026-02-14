/**
 * Event Broadcasting Utility
 * Provides functions to broadcast task events via SSE
 * 
 * Ticket #22: Task Event Broadcasting
 */

import type { TaskEvent } from './SSEConnectionManager';
import type { Env } from '../types';

// Durable Object namespace name for SSE
const SSE_DO_NAME = 'sse-connection-manager';

/**
 * Get SSE Connection Manager Durable Object stub
 */
function getSSEManager(env: Env): DurableObjectStub | null {
  if (!env.SSE_CONNECTION_MANAGER) {
    console.warn('[broadcast] SSE_CONNECTION_MANAGER binding not found');
    return null;
  }
  
  const id = env.SSE_CONNECTION_MANAGER.idFromName('global');
  return env.SSE_CONNECTION_MANAGER.get(id);
}

/**
 * Broadcast a task event to all connected clients
 * 
 * @param env - Worker environment with Durable Object binding
 * @param event - The task event to broadcast
 * @param targetUserIds - Optional array of user IDs to target (broadcasts to all if not specified)
 * @returns Number of clients that received the event
 */
export async function broadcastTaskEvent(
  env: Env,
  event: TaskEvent,
  targetUserIds?: string[]
): Promise<number> {
  const manager = getSSEManager(env);
  if (!manager) {
    console.warn('[broadcast] SSE manager not available, skipping broadcast');
    return 0;
  }

  try {
    const response = await manager.fetch('http://internal/sse/broadcast', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-API-Key': env.AGENT_API_KEY || env.JWT_SECRET || '',
      },
      body: JSON.stringify({ event, targetUserIds }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('[broadcast] Failed to broadcast event:', error);
      return 0;
    }

    const result = await response.json() as { broadcastCount: number };
    return result.broadcastCount;
  } catch (error) {
    console.error('[broadcast] Error broadcasting event:', error);
    return 0;
  }
}

/**
 * Broadcast task created event
 */
export async function broadcastTaskCreated(
  env: Env,
  task: Record<string, unknown>,
  userId?: string
): Promise<number> {
  const event: TaskEvent = {
    type: 'task.created',
    taskId: Number(task.id),
    task,
    timestamp: new Date().toISOString(),
    userId,
  };

  return broadcastTaskEvent(env, event);
}

/**
 * Broadcast task updated event
 */
export async function broadcastTaskUpdated(
  env: Env,
  task: Record<string, unknown>,
  userId?: string
): Promise<number> {
  const event: TaskEvent = {
    type: 'task.updated',
    taskId: Number(task.id),
    task,
    timestamp: new Date().toISOString(),
    userId,
  };

  return broadcastTaskEvent(env, event);
}

/**
 * Broadcast task deleted event
 */
export async function broadcastTaskDeleted(
  env: Env,
  taskId: number,
  userId?: string
): Promise<number> {
  const event: TaskEvent = {
    type: 'task.deleted',
    taskId,
    timestamp: new Date().toISOString(),
    userId,
  };

  return broadcastTaskEvent(env, event);
}

/**
 * Broadcast task status changed event
 */
export async function broadcastTaskStatusChanged(
  env: Env,
  task: Record<string, unknown>,
  previousStatus: string,
  newStatus: string,
  userId?: string
): Promise<number> {
  const event: TaskEvent = {
    type: 'task.status_changed',
    taskId: Number(task.id),
    task,
    previousStatus,
    newStatus,
    timestamp: new Date().toISOString(),
    userId,
  };

  return broadcastTaskEvent(env, event);
}
