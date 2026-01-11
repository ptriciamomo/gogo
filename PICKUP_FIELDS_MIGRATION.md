# Database Migration: Pickup Fields for Delivery Items

## Overview
This migration adds three new columns to the `public.errand` table to support the Delivery Items pickup confirmation flow.

## New Columns

1. **`pickup_status`** (text, default: 'pending')
   - Tracks whether the item has been picked up
   - Allowed values: `'pending'`, `'picked_up'`
   - Default value: `'pending'`

2. **`pickup_photo`** (text, nullable)
   - Stores the Supabase storage public URL for the pickup confirmation photo
   - Nullable to allow errands without photos

3. **`pickup_confirmed_at`** (timestamptz, nullable)
   - Timestamp when the runner confirmed item pickup
   - Nullable until pickup is confirmed

## Installation Steps

### Step 1: Run the SQL Migration

1. Go to your Supabase dashboard: https://supabase.com/dashboard
2. Select your project
3. Navigate to **SQL Editor** in the left sidebar
4. Click **"New query"**
5. Copy and paste the contents of `add_pickup_fields_to_errand.sql`
6. Click **"Run"** to execute the migration

### Step 2: Verify the Migration

After running the SQL, verify the columns were added:

```sql
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
```

Expected result:
- `pickup_status`: text, default 'pending', NOT NULL
- `pickup_photo`: text, no default, NULL
- `pickup_confirmed_at`: timestamp with time zone, no default, NULL

### Step 3: Update Supabase Types (Optional)

If you're using Supabase's TypeScript code generation:

```bash
npx supabase gen types typescript --project-id your-project-id > types/supabase.ts
```

**Note:** The TypeScript interfaces in the codebase have already been updated to include these fields. If you're using auto-generated types, regenerate them after running the migration.

## Updated TypeScript Interfaces

The following files have been updated with the new fields:

### ErrandRow Types (13 files):
- `app/buddycaller/view_map.tsx`
- `app/buddycaller/view_map_web.tsx`
- `app/buddyrunner/view_map.tsx`
- `app/buddyrunner/view_map_web.tsx`
- `app/buddycaller/my_request_errands.tsx`
- `app/buddycaller/my_request_errands_web.tsx`
- `app/buddyrunner/accepted_tasks.tsx`
- `app/buddyrunner/accepted_tasks_web.tsx`
- `app/buddyrunner/home.tsx`
- `app/admin/errands.tsx`
- `app/buddycaller/home.tsx`
- `app/buddycaller/view_errand.tsx`
- `app/buddycaller/view_errand_web.tsx`

### New Fields Added:
```typescript
pickup_status?: string | null;
pickup_photo?: string | null;
pickup_confirmed_at?: string | null;
```

## Usage

These fields are now available in all errand-related queries and can be used in the frontend to:

1. Track pickup status for Delivery Items errands
2. Display pickup confirmation photos
3. Show when items were picked up

## Notes

- All existing errands will have `pickup_status = 'pending'` by default
- The fields are optional (nullable) to maintain backward compatibility
- Only Delivery Items errands will use these fields in the UI (to be implemented in next phase)
- No existing functionality has been modified

