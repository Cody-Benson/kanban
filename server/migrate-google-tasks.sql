-- Migration: Add Google Tasks integration columns
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_refresh_token TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS google_task_id VARCHAR(255);
