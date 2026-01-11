-- Drop net_amount column from settlements table
-- This column is no longer needed as net amount can be calculated as: total_earnings - system_fees

-- Step 1: Drop the net_amount column from the settlements table
ALTER TABLE settlements
DROP COLUMN IF EXISTS net_amount;

-- Note: After running this migration, the net_amount value can still be calculated
-- in the application layer using: total_earnings - system_fees
-- This removes redundant data storage and ensures consistency.

