-- D1 Schema for Cloudflare Task Board
-- Run: wrangler d1 execute taskboard-db --file=./schema.sql

-- Drop table if exists (for clean setup)
DROP TABLE IF EXISTS cron_job_runs;
DROP TABLE IF EXISTS cron_jobs;
DROP TABLE IF EXISTS tasks;

-- Create tasks table
CREATE TABLE tasks (
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

-- Create cron_jobs table
CREATE TABLE cron_jobs (
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

-- Create cron_job_runs table for history
CREATE TABLE cron_job_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cron_job_id INTEGER NOT NULL,
    started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    ended_at DATETIME,
    status TEXT NOT NULL,
    output TEXT,
    FOREIGN KEY (cron_job_id) REFERENCES cron_jobs(id)
);

-- Create index on status for faster filtering
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_assigned_to_agent ON tasks(assigned_to_agent);
CREATE INDEX idx_tasks_priority ON tasks(priority DESC);

-- Create index on cron_jobs
CREATE INDEX idx_cron_jobs_status ON cron_jobs(last_status);
CREATE INDEX idx_cron_jobs_runs_job_id ON cron_job_runs(cron_job_id);
CREATE INDEX idx_cron_jobs_runs_started ON cron_job_runs(started_at);

-- Insert sample tasks for testing
INSERT INTO tasks (name, description, status, priority, blocked, assigned_to_agent) VALUES
    ('Setup D1 database', 'Initialize the taskboard database schema', 'done', 5, 0, 0),
    ('Build Cloudflare Worker API', 'Create REST API endpoints for CRUD operations', 'in_progress', 4, 0, 1),
    ('Create kanban frontend', 'Build HTML/JS kanban board interface', 'up_next', 3, 0, 0),
    ('Write documentation', 'Create README with deployment instructions', 'inbox', 2, 0, 0),
    ('Deploy to Cloudflare', 'Deploy worker and pages to production', 'inbox', 1, 1, 0);
