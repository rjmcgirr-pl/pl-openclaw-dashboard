-- D1 Schema Migration: Add cron job monitoring tables
-- Run this in your D1 database console

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
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS cron_job_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cron_job_id INTEGER NOT NULL,
    status TEXT NOT NULL,
    output TEXT,
    started_at DATETIME,
    ended_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (cron_job_id) REFERENCES cron_jobs(id)
);

CREATE INDEX IF NOT EXISTS idx_cron_jobs_status ON cron_jobs(last_status);
CREATE INDEX IF NOT EXISTS idx_cron_job_runs_job_id ON cron_job_runs(cron_job_id);

-- Insert sample cron jobs for testing
INSERT INTO cron_jobs (name, description, schedule, skill_md_path, last_status) VALUES
('Twitter Check', 'Check for mentions and replies', '0 */2 * * *', 'skills/bird/SKILL.md', 'pending'),
('Taskboard Sync', 'Sync assigned tasks', '*/30 * * * *', 'skills/skill-creator/SKILL.md', 'pending');
