-- Add pickup status and photo fields to errand table for Delivery Items flow
-- This migration adds three new columns to support the pickup confirmation feature

-- Step 1: Add pickup_status column with default value 'pending'
ALTER TABLE public.errand
ADD COLUMN IF NOT EXISTS pickup_status text DEFAULT 'pending';

-- Step 2: Add CHECK constraint to ensure pickup_status only allows valid values
ALTER TABLE public.errand
ADD CONSTRAINT errand_pickup_status_check 
CHECK (pickup_status IS NULL OR pickup_status IN ('pending', 'picked_up'));

-- Step 3: Add pickup_photo column to store Supabase storage public URL
ALTER TABLE public.errand
ADD COLUMN IF NOT EXISTS pickup_photo text NULL;

-- Step 4: Add pickup_confirmed_at timestamp column
ALTER TABLE public.errand
ADD COLUMN IF NOT EXISTS pickup_confirmed_at timestamptz NULL;

-- Step 5: Add comment to document the columns
COMMENT ON COLUMN public.errand.pickup_status IS 'Status of item pickup: pending or picked_up';
COMMENT ON COLUMN public.errand.pickup_photo IS 'Supabase storage public URL for the pickup confirmation photo';
COMMENT ON COLUMN public.errand.pickup_confirmed_at IS 'Timestamp when the runner confirmed item pickup';

-- Step 6: Verify the columns were added
SELECT 
    column_name, 
    data_type, 
    column_default,
    is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'errand'
  AND column_name IN ('pickup_status', 'pickup_photo', 'pickup_confirmed_at')
ORDER BY column_name;

