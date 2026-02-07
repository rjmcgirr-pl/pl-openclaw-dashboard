-- D1 Schema for Cloudflare Task Board
-- Run: wrangler d1 execute taskboard-db --file=./schema.sql

-- Drop table if exists (for clean setup)
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

-- Create index on status for faster filtering
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_assigned_to_agent ON tasks(assigned_to_agent);
CREATE INDEX idx_tasks_priority ON tasks(priority DESC);

-- Insert sample tasks for testing
INSERT INTO tasks (name, description, status, priority, blocked, assigned_to_agent) VALUES
    ('Setup D1 database', 'Initialize the taskboard database schema', 'done', 5, 0, 0),
    ('Build Cloudflare Worker API', 'Create REST API endpoints for CRUD operations', 'in_progress', 4, 0, 1),
    ('Create kanban frontend', 'Build HTML/JS kanban board interface', 'up_next', 3, 0, 0),
    ('Write documentation', 'Create README with deployment instructions', 'inbox', 2, 0, 0),
    ('Deploy to Cloudflare', 'Deploy worker and pages to production', 'inbox', 1, 1, 0);
