/**
 * useRealTimeTasks Hook
 * 
 * React hook for managing task data with real-time SSE updates.
 * Automatically updates the local task list when SSE events are received.
 * 
 * Features:
 * - Subscribe to task events (created, updated, deleted, status changed)
 * - Automatic local state updates
 * - Optional optimistic updates
 * - Debounced batch updates for performance
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { useSSEContext } from '../components/SSEProvider';
import {
  TaskCreatedEvent,
  TaskUpdatedEvent,
  TaskDeletedEvent,
  TaskStatusChangedEvent,
} from '../types/sse';

// Task interface matching SSE TaskEventData
export interface Task {
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

interface UseRealTimeTasksOptions {
  initialTasks?: Task[];
  onTaskCreated?: (task: Task) => void;
  onTaskUpdated?: (task: Task, previousValues?: Partial<Task>) => void;
  onTaskDeleted?: (taskId: number) => void;
  onTaskStatusChanged?: (task: Task, previousStatus: string) => void;
  enableBatching?: boolean;
  batchDelay?: number;
}

interface UseRealTimeTasksReturn {
  tasks: Task[];
  setTasks: React.Dispatch<React.SetStateAction<Task[]>>;
  addTask: (task: Task) => void;
  updateTask: (taskId: number, updates: Partial<Task>) => void;
  deleteTask: (taskId: number) => void;
  getTaskById: (taskId: number) => Task | undefined;
  pendingUpdates: number;
}

/**
 * Hook for managing tasks with real-time updates
 * 
 * @example
 * ```tsx
 * function TaskBoard() {
 *   const { tasks, setTasks } = useRealTimeTasks({
 *     initialTasks: [],
 *     onTaskCreated: (task) => console.log('New task:', task),
 *   });
 * 
 *   return (
 *     <div>
 *       {tasks.map(task => <TaskCard key={task.id} task={task} />)}
 *     </div>
 *   );
 * }
 * ```
 */
export function useRealTimeTasks(options: UseRealTimeTasksOptions = {}): UseRealTimeTasksReturn {
  const {
    initialTasks = [],
    onTaskCreated,
    onTaskUpdated,
    onTaskDeleted,
    onTaskStatusChanged,
    enableBatching = true,
    batchDelay = 100,
  } = options;

  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [pendingUpdates, setPendingUpdates] = useState(0);
  const { subscribe } = useSSEContext();

  // Batch update queue
  const updateQueue = useRef<Array<() => void>>([]);
  const batchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Process batched updates
  const processBatch = useCallback(() => {
    if (updateQueue.current.length === 0) return;

    const updates = [...updateQueue.current];
    updateQueue.current = [];

    setTasks((currentTasks) => {
      let newTasks = [...currentTasks];
      updates.forEach((update) => {
        newTasks = update() || newTasks;
      });
      return newTasks;
    });

    setPendingUpdates(0);
  }, []);

  // Queue an update
  const queueUpdate = useCallback(
    (updateFn: () => Task[] | void) => {
      if (enableBatching) {
        updateQueue.current.push(updateFn);
        setPendingUpdates((prev) => prev + 1);

        if (batchTimer.current) {
          clearTimeout(batchTimer.current);
        }

        batchTimer.current = setTimeout(() => {
          processBatch();
        }, batchDelay);
      } else {
        setTasks((current) => updateFn() || current);
      }
    },
    [enableBatching, batchDelay, processBatch]
  );

  // Subscribe to SSE events
  useEffect(() => {
    const unsubscribeCreated = subscribe('task.created', (event) => {
      const { task } = (event as TaskCreatedEvent).data;
      queueUpdate(() => {
        setTasks((prev) => [...prev, task]);
        onTaskCreated?.(task);
      });
    });

    const unsubscribeUpdated = subscribe('task.updated', (event) => {
      const { task, previousValues } = (event as TaskUpdatedEvent).data;
      queueUpdate(() => {
        setTasks((prev) =>
          prev.map((t) => (t.id === task.id ? { ...t, ...task } : t))
        );
        onTaskUpdated?.(task, previousValues);
      });
    });

    const unsubscribeDeleted = subscribe('task.deleted', (event) => {
      const { taskId } = (event as TaskDeletedEvent).data;
      queueUpdate(() => {
        setTasks((prev) => prev.filter((t) => t.id !== taskId));
        onTaskDeleted?.(taskId);
      });
    });

    const unsubscribeStatusChanged = subscribe('task.status_changed', (event) => {
      const { task, previousStatus } = (event as TaskStatusChangedEvent).data;
      queueUpdate(() => {
        setTasks((prev) =>
          prev.map((t) => (t.id === task.id ? { ...t, ...task } : t))
        );
        onTaskStatusChanged?.(task, previousStatus);
      });
    });

    return () => {
      unsubscribeCreated();
      unsubscribeUpdated();
      unsubscribeDeleted();
      unsubscribeStatusChanged();

      if (batchTimer.current) {
        clearTimeout(batchTimer.current);
      }
    };
  }, [subscribe, queueUpdate, onTaskCreated, onTaskUpdated, onTaskDeleted, onTaskStatusChanged]);

  // Manual task operations
  const addTask = useCallback((task: Task) => {
    setTasks((prev) => [...prev, task]);
  }, []);

  const updateTask = useCallback((taskId: number, updates: Partial<Task>) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, ...updates } : t))
    );
  }, []);

  const deleteTask = useCallback((taskId: number) => {
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
  }, []);

  const getTaskById = useCallback(
    (taskId: number) => tasks.find((t) => t.id === taskId),
    [tasks]
  );

  return {
    tasks,
    setTasks,
    addTask,
    updateTask,
    deleteTask,
    getTaskById,
    pendingUpdates,
  };
}

export default useRealTimeTasks;
