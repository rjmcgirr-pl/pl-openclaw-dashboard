-- D1 Schema for Cloudflare Task Board - Clean Setup
-- Run: wrangler d1 execute DB --file=./schema-clean.sql --env production

-- Create tasks table (if not exists)
CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'inbox',
    priority INTEGER DEFAULT 0,
    blocked INTEGER DEFAULT 0,
    assigned_to_agent INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Create cron_jobs table (if not exists)
CREATE TABLE IF NOT EXISTS cron_jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    schedule TEXT NOT NULL,
    skill_md_path TEXT,
    last_run_at DATETIME,
    last_status TEXT DEFAULT 'pending',
    last_output TEXT,
    next_run_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Create cron_job_runs table for history (if not exists)
CREATE TABLE IF NOT EXISTS cron_job_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cron_job_id INTEGER NOT NULL,
    started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    ended_at DATETIME,
    status TEXT NOT NULL,
    output TEXT,
    FOREIGN KEY (cron_job_id) REFERENCES cron_jobs(id)
);

-- Create indexes (if not exists)
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to_agent ON tasks(assigned_to_agent);
CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority DESC);
CREATE INDEX IF NOT EXISTS idx_cron_jobs_status ON cron_jobs(last_status);
CREATE INDEX IF NOT EXISTS idx_cron_jobs_runs_job_id ON cron_job_runs(cron_job_id);
CREATE INDEX IF NOT EXISTS idx_cron_jobs_runs_started ON cron_job_runs(started_at);
