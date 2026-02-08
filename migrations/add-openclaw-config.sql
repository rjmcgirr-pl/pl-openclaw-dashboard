-- Migration: Add OpenClaw config fields to existing cron_jobs table
-- Date: 2026-02-07
-- Run: wrangler d1 execute openclaw-taskboard-db --file=./migrations/add-openclaw-config.sql --env production

-- Add new columns for OpenClaw configuration
ALTER TABLE cron_jobs ADD COLUMN payload TEXT;
ALTER TABLE cron_jobs ADD COLUMN model TEXT DEFAULT 'google/gemini-3-flash-preview';
ALTER TABLE cron_jobs ADD COLUMN thinking TEXT DEFAULT 'low';
ALTER TABLE cron_jobs ADD COLUMN timeout_seconds INTEGER DEFAULT 300;
ALTER TABLE cron_jobs ADD COLUMN deliver BOOLEAN DEFAULT 1;
ALTER TABLE cron_jobs ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP;

-- Update existing rows with default payload based on job name patterns
UPDATE cron_jobs SET 
    payload = 'Check Twitter/X for mentions and replies. Use bird tool to search and respond.',
    model = 'google/gemini-3-flash-preview',
    thinking = 'low',
    timeout_seconds = 300,
    deliver = 1
WHERE name LIKE '%X %' OR name LIKE '%Twitter%';

UPDATE cron_jobs SET 
    payload = 'Generate sales report and brief. Query Salesforce for pipeline data, analyze, and deliver summary.',
    model = 'google/gemini-3-flash-preview',
    thinking = 'low',
    timeout_seconds = 300,
    deliver = 1
WHERE name LIKE '%Sales%' OR name LIKE '%Pipeline%' OR name LIKE '%Morning Brief%';

UPDATE cron_jobs SET 
    payload = 'Monday morning preparation tasks. Review weekend activity, prepare weekly agenda, check calendar.',
    model = 'google/gemini-3-flash-preview',
    thinking = 'medium',
    timeout_seconds = 600,
    deliver = 1
WHERE name LIKE '%Monday%';

UPDATE cron_jobs SET 
    payload = 'Weekly summary generation. Compile metrics, summarize activities, prepare report.',
    model = 'google/gemini-3-flash-preview',
    thinking = 'medium',
    timeout_seconds = 600,
    deliver = 1
WHERE name LIKE '%Weekly%';

-- Set updated_at for all existing rows
UPDATE cron_jobs SET updated_at = CURRENT_TIMESTAMP WHERE updated_at IS NULL;
