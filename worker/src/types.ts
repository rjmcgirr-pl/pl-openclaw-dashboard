import type { D1Database } from '@cloudflare/workers-types';

export interface Env {
  DB: D1Database;
  ALLOWED_ORIGIN?: string;
}

export interface Task {
  id: number;
  name: string;
  description: string | null;
  status: 'inbox' | 'up_next' | 'in_progress' | 'in_review' | 'done';
  priority: number;
  blocked: number;
  assigned_to_agent: number;
  created_at: string;
  updated_at: string;
}

export interface CreateTaskRequest {
  name: string;
  description?: string;
  status?: 'inbox' | 'up_next' | 'in_progress' | 'in_review' | 'done';
  priority?: number;
  blocked?: boolean;
  assigned_to_agent?: boolean;
}

export interface UpdateTaskRequest {
  name?: string;
  description?: string;
  status?: 'inbox' | 'up_next' | 'in_progress' | 'in_review' | 'done';
  priority?: number;
  blocked?: boolean;
  assigned_to_agent?: boolean;
}
