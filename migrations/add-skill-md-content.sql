-- Migration: Add skill_md_content column to cron_jobs table
-- Date: 2026-02-08
-- Run: wrangler d1 execute openclaw-taskboard-db --file=./migrations/add-skill-md-content.sql --env production

-- Add skill_md_content column
ALTER TABLE cron_jobs ADD COLUMN skill_md_content TEXT;

-- Update timestamp
UPDATE cron_jobs SET updated_at = CURRENT_TIMESTAMP;
