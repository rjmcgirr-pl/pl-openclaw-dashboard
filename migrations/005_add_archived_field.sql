-- Migration: Add archived field to tasks table
-- Run: wrangler d1 execute openclaw-taskboard-db --file=./migrations/005_add_archived_field.sql
-- Date: 2026-02-13

-- Add archived column to tasks table (0 = not archived, 1 = archived)
ALTER TABLE tasks ADD COLUMN archived INTEGER DEFAULT 0;

-- Create index for faster filtering
CREATE INDEX IF NOT EXISTS idx_tasks_archived ON tasks(archived);

-- Update existing tasks with status='archived' to have archived=1
UPDATE tasks SET archived = 1 WHERE status = 'archived';
