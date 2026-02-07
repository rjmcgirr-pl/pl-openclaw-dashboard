-- Minimal schema to create cron_jobs tables
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

CREATE TABLE IF NOT EXISTS cron_job_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cron_job_id INTEGER NOT NULL,
    started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    ended_at DATETIME,
    status TEXT NOT NULL,
    output TEXT,
    FOREIGN KEY (cron_job_id) REFERENCES cron_jobs(id)
);

CREATE INDEX IF NOT EXISTS idx_cron_jobs_status ON cron_jobs(last_status);
CREATE INDEX IF NOT EXISTS idx_cron_jobs_runs_job_id ON cron_job_runs(cron_job_id);
CREATE INDEX IF NOT EXISTS idx_cron_jobs_runs_started ON cron_job_runs(started_at);
