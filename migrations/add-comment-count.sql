-- Migration: Add comment_count column to tasks table
-- Run: wrangler d1 execute openclaw-taskboard-db --file=./migrations/add-comment-count.sql
-- Date: 2026-02-11

-- Add comment_count column to tasks table
ALTER TABLE tasks ADD COLUMN comment_count INTEGER DEFAULT 0;

-- Initialize comment_count for existing tasks
UPDATE tasks SET comment_count = (
    SELECT COUNT(*) FROM comments 
    WHERE comments.task_id = tasks.id 
    AND comments.is_deleted = 0
);
