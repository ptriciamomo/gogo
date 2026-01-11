-- SQL statements to safely remove unused errand pricing columns
-- Run these AFTER verifying that the code refactor is complete and working
-- 
-- IMPORTANT: Backup your database before running these statements!
--
-- These columns are no longer used after refactoring to use amount_price:
--   - estimated_price (replaced by amount_price which includes total)
--   - delivery_fee (if exists, now included in amount_price)
--   - service_fee (if exists, now included in amount_price)
--   - Any other similar pricing breakdown columns

-- Step 1: Verify the columns exist and check for any remaining data
-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns 
-- WHERE table_schema = 'public'
--   AND table_name = 'errand' 
--   AND column_name IN ('estimated_price', 'delivery_fee', 'service_fee', 'subtotal', 'total_fee')
-- ORDER BY column_name;

-- Step 2: Check if there are any dependencies (views, functions, triggers)
-- SELECT 
--     dependent_ns.nspname as dependent_schema,
--     dependent_view.relname as dependent_view,
--     source_ns.nspname as source_schema,
--     source_table.relname as source_table
-- FROM pg_depend
-- JOIN pg_rewrite ON pg_depend.objid = pg_rewrite.oid
-- JOIN pg_class as dependent_view ON pg_rewrite.ev_class = dependent_view.oid
-- JOIN pg_class as source_table ON pg_depend.refobjid = source_table.oid
-- JOIN pg_namespace dependent_ns ON dependent_view.relnamespace = dependent_ns.oid
-- JOIN pg_namespace source_ns ON source_table.relnamespace = source_ns.oid
-- WHERE source_table.relname = 'errand'
--   AND dependent_view.relname NOT LIKE 'pg_%';

-- Step 3: Drop the unused columns (run these one at a time and verify after each)
-- Note: These use IF EXISTS so they won't fail if columns don't exist

-- Drop estimated_price column (replaced by amount_price)
ALTER TABLE public.errand 
DROP COLUMN IF EXISTS estimated_price;

-- Drop delivery_fee column (if it exists, now included in amount_price)
ALTER TABLE public.errand 
DROP COLUMN IF EXISTS delivery_fee;

-- Drop service_fee column (if it exists, now included in amount_price)
ALTER TABLE public.errand 
DROP COLUMN IF EXISTS service_fee;

-- Drop subtotal column (if it exists, now included in amount_price)
ALTER TABLE public.errand 
DROP COLUMN IF EXISTS subtotal;

-- Drop total_fee column (if it exists, replaced by amount_price)
ALTER TABLE public.errand 
DROP COLUMN IF EXISTS total_fee;

-- Step 4: Verify the columns have been removed
-- This should show only 'amount_price' (if any price-related columns remain)
-- SELECT column_name, data_type
-- FROM information_schema.columns
-- WHERE table_schema = 'public'
--   AND table_name = 'errand'
--   AND (column_name LIKE '%price%' OR column_name LIKE '%fee%' OR column_name LIKE '%total%')
-- ORDER BY column_name;

