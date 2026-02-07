import type { D1Database, KVNamespace } from '@cloudflare/workers-types';

export interface Env {
  DB: D1Database;
  CRON_JOBS_KV: KVNamespace;
  ALLOWED_ORIGIN?: string;
  DASHBOARD_PASSWORD?: string;
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

// Cron Job Types
export type CronJobStatus = 'pending' | 'running' | 'done' | 'error' | 'stalled';

export interface CronJob {
  id: number;
  name: string;
  description: string | null;
  schedule: string;
  skill_md_path: string | null;
  last_run_at: string | null;
  last_status: CronJobStatus;
  last_output: string | null;
  next_run_at: string | null;
  created_at: string;
}

export interface CronJobRun {
  id: number;
  cron_job_id: number;
  started_at: string;
  ended_at: string | null;
  status: CronJobStatus;
  output: string | null;
}

export interface CreateCronJobRequest {
  name: string;
  description?: string;
  schedule: string;
  skill_md_path?: string;
  last_status?: CronJobStatus;
  last_run_at?: string | null;
  next_run_at?: string | null;
}

export interface EndCronJobRequest {
  status: 'done' | 'error';
  output?: string;
}
