import type { D1Database, KVNamespace } from '@cloudflare/workers-types';

export interface Env {
  DB: D1Database;
  CRON_JOBS_KV: KVNamespace;
  SESSION_KV: KVNamespace;
  ALLOWED_ORIGIN?: string;
  DASHBOARD_PASSWORD?: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  ALLOWED_DOMAIN: string;
  SESSION_SECRET: string;
}

// OAuth Types
export interface GoogleTokenResponse {
  access_token: string;
  expires_in: number;
  id_token: string;
  scope: string;
  token_type: string;
}

export interface GoogleUserInfo {
  sub: string;
  email: string;
  email_verified: boolean;
  name: string;
  picture?: string;
  given_name?: string;
  family_name?: string;
}

export interface Session {
  userId: string;
  email: string;
  name: string;
  picture?: string;
  createdAt: number;
  expiresAt: number;
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

// Valid AI models for cron job execution
export type CronJobModel = 
  | 'google/gemini-3-flash-preview'
  | 'anthropic/claude-opus-4-5'
  | 'openrouter/auto';

// Thinking levels for agent reasoning
export type CronJobThinking = 'low' | 'medium' | 'high';

export interface CronJob {
  id: number;
  name: string;
  description: string | null;
  schedule: string;
  skill_md_path: string | null;
  skill_md_content: string | null;
  
  // OpenClaw configuration
  payload: string | null;
  model: CronJobModel;
  thinking: CronJobThinking;
  timeout_seconds: number;
  deliver: number; // SQLite stores BOOLEAN as INTEGER (0 or 1)
  
  // Execution tracking
  last_run_at: string | null;
  last_status: CronJobStatus;
  last_output: string | null;
  next_run_at: string | null;
  created_at: string;
  updated_at: string;
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
  skill_md_content?: string;
  
  // OpenClaw configuration
  payload: string;
  model?: CronJobModel;
  thinking?: CronJobThinking;
  timeout_seconds?: number;
  deliver?: boolean;
  
  // Execution tracking
  last_status?: CronJobStatus;
  last_run_at?: string | null;
  next_run_at?: string | null;
}

export interface UpdateCronJobRequest {
  name?: string;
  description?: string;
  schedule?: string;
  skill_md_path?: string;
  skill_md_content?: string;
  
  // OpenClaw configuration
  payload?: string;
  model?: CronJobModel;
  thinking?: CronJobThinking;
  timeout_seconds?: number;
  deliver?: boolean;
  
  // Execution tracking
  last_status?: CronJobStatus;
  last_run_at?: string | null;
  next_run_at?: string | null;
}

export interface EndCronJobRequest {
  status: 'done' | 'error';
  output?: string;
}
