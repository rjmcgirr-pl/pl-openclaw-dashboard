import type { D1Database, KVNamespace } from '@cloudflare/workers-types';

export interface Env {
  DB: D1Database;
  CRON_JOBS_KV: KVNamespace;
  SESSION_KV: KVNamespace;
  ALLOWED_ORIGIN?: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  ALLOWED_DOMAIN: string;
  SESSION_SECRET: string;
  JWT_SECRET: string; // For JWT token signing/verification
  AGENT_API_KEY: string; // For agent automation without OAuth
  ADMIN_PASSWORD?: string; // For admin user JWT login
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
  status: 'inbox' | 'up_next' | 'in_progress' | 'in_review' | 'done' | 'archived';
  priority: number;
  blocked: number;
  assigned_to_agent: number;
  archived: number;
  comment_count: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateTaskRequest {
  name: string;
  description?: string;
  status?: 'inbox' | 'up_next' | 'in_progress' | 'in_review' | 'done' | 'archived';
  priority?: number;
  blocked?: boolean;
  assigned_to_agent?: boolean;
  archived?: boolean;
}

export interface UpdateTaskRequest {
  name?: string;
  description?: string;
  status?: 'inbox' | 'up_next' | 'in_progress' | 'in_review' | 'done' | 'archived';
  priority?: number;
  blocked?: boolean;
  assigned_to_agent?: boolean;
  archived?: boolean;
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

// Comment Types
export type AuthorType = 'human' | 'agent' | 'system';
export type AgentCommentType = 'status_update' | 'question' | 'completion' | 'generic';
export type NotificationType = 'mention' | 'reply' | 'agent_comment';

export interface Comment {
  id: number;
  task_id: number;
  parent_comment_id: number | null;
  author_type: AuthorType;
  author_id: string;
  author_name: string;
  content: string;
  agent_comment_type: AgentCommentType | null;
  mentions: string[] | null;
  is_edited: number;
  is_deleted: number;
  created_at: string;
  updated_at: string;
  replies?: Comment[];
  reactions?: CommentReaction[];
}

export interface CommentReaction {
  id: number;
  comment_id: number;
  emoji: string;
  author_id: string;
  author_type: AuthorType;
  created_at: string;
}

export interface CommentNotification {
  id: number;
  user_id: string;
  type: NotificationType;
  task_id: number;
  comment_id: number;
  is_read: number;
  created_at: string;
  task_title?: string;
  comment_preview?: string;
}

export interface CreateCommentRequest {
  content: string;
  parent_comment_id?: number | null;
}

export interface CreateAgentCommentRequest {
  content: string;
  agent_comment_type?: AgentCommentType;
  mentions?: string[];
  auth_token: string;
}

export interface AddReactionRequest {
  emoji: string;
}

export interface ClaimTaskRequest {
  agent_id: string;
  auth_token: string;
}
