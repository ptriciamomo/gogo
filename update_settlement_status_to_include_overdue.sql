-- Update settlements table to include 'overdue' status and remove 'cancelled'
-- This migration updates the CHECK constraint to allow: 'pending', 'overdue', 'paid'

-- Step 1: Update any existing 'cancelled' status to 'pending' (or you can keep them as cancelled if needed)
-- For now, we'll convert cancelled to pending
UPDATE settlements
SET status = 'pending'
WHERE status = 'cancelled';

-- Step 2: Drop the old CHECK constraint
ALTER TABLE settlements
DROP CONSTRAINT IF EXISTS settlements_status_check;

-- Step 3: Add new CHECK constraint with 'pending', 'overdue', 'paid' only
ALTER TABLE settlements
ADD CONSTRAINT settlements_status_check 
CHECK (status IN ('pending', 'overdue', 'paid'));

-- Step 4: Create a function to automatically update pending settlements to overdue
-- when their period_end_date has passed
CREATE OR REPLACE FUNCTION update_overdue_settlements()
RETURNS INTEGER AS $$
DECLARE
    updated_count INTEGER;
BEGIN
    UPDATE settlements
    SET 
        status = 'overdue',
        updated_at = NOW()
    WHERE status = 'pending'
      AND period_end_date < CURRENT_DATE;
    
    GET DIAGNOSTICS updated_count = ROW_COUNT;
    RETURN updated_count;
END;
$$ LANGUAGE plpgsql;

-- Step 5: Create a trigger function that runs on INSERT/UPDATE to check for overdue
CREATE OR REPLACE FUNCTION check_settlement_overdue()
RETURNS TRIGGER AS $$
BEGIN
    -- If status is pending and period_end_date has passed, set to overdue
    IF NEW.status = 'pending' AND NEW.period_end_date < CURRENT_DATE THEN
        NEW.status := 'overdue';
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Step 6: Create trigger to automatically check on insert/update
DROP TRIGGER IF EXISTS trigger_check_settlement_overdue ON settlements;
CREATE TRIGGER trigger_check_settlement_overdue
    BEFORE INSERT OR UPDATE ON settlements
    FOR EACH ROW
    EXECUTE FUNCTION check_settlement_overdue();

-- Step 7: Run the update function once to update existing overdue settlements
SELECT update_overdue_settlements() as updated_settlements_count;

-- Verify the update
SELECT 
    status,
    COUNT(*) as count
FROM settlements
GROUP BY status
ORDER BY status;

