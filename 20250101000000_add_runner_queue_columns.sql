-- Migration: Add runner queue columns for queue-based assignment
-- Purpose: Store ranked runner queue once at creation, advance index on timeout
-- This eliminates re-ranking and re-querying on timeout, preventing UI glitching

-- Add queue columns to errand table
ALTER TABLE errand 
ADD COLUMN IF NOT EXISTS ranked_runner_ids TEXT[],
ADD COLUMN IF NOT EXISTS current_queue_index INTEGER DEFAULT 0;

-- Add queue columns to commission table
ALTER TABLE commission 
ADD COLUMN IF NOT EXISTS ranked_runner_ids TEXT[],
ADD COLUMN IF NOT EXISTS current_queue_index INTEGER DEFAULT 0;

-- Add constraints to ensure queue validity
ALTER TABLE errand 
ADD CONSTRAINT errand_queue_index_valid 
CHECK (current_queue_index >= 0);

ALTER TABLE commission 
ADD CONSTRAINT commission_queue_index_valid 
CHECK (current_queue_index >= 0);

-- Add index for efficient queue-based queries
CREATE INDEX IF NOT EXISTS idx_errand_queue_index ON errand(current_queue_index) 
WHERE ranked_runner_ids IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_commission_queue_index ON commission(current_queue_index) 
WHERE ranked_runner_ids IS NOT NULL;

-- Comment on columns
COMMENT ON COLUMN errand.ranked_runner_ids IS 'Ordered array of runner IDs ranked by distance/rating/TF-IDF. Created once at task creation.';
COMMENT ON COLUMN errand.current_queue_index IS 'Current position in ranked_runner_ids queue. Incremented on timeout.';
COMMENT ON COLUMN commission.ranked_runner_ids IS 'Ordered array of runner IDs ranked by distance/rating/TF-IDF. Created once at task creation.';
COMMENT ON COLUMN commission.current_queue_index IS 'Current position in ranked_runner_ids queue. Incremented on timeout.';
