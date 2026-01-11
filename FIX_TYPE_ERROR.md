# Fix: Type Error - UUID[] to BIGINT[] Conversion

## Problem
The error `COALESCE could not convert type uuid[] to bigint[]` occurred because:
- `commission.id` is `BIGINT` (number), not `UUID`
- The function was trying to aggregate BIGINT values into a `UUID[]` array
- This caused a type mismatch error

## Solution
Changed everything to use `TEXT[]` instead of `UUID[]` because:
1. Commission IDs are BIGINT (numbers)
2. Errand IDs might be different types  
3. TEXT[] can store any ID type as strings
4. The frontend already converts IDs to strings with `String(comm.id)`

## Steps to Fix

### Step 1: Update Column Types (if columns already exist as UUID[])

Run `migrate_settlement_ids_to_text.sql` to change existing columns from UUID[] to TEXT[]:

```sql
-- This will drop and recreate the columns as TEXT[]
-- Run this in Supabase SQL Editor
```

### Step 2: Re-run the Function Update

Run `update_settlement_functions_with_ids.sql` again. It now uses TEXT[] instead of UUID[].

### Step 3: Run the Backfill Script

After the function is updated, run `backfill_settlement_ids.sql` to populate IDs for existing settlements:

```sql
DO $$
DECLARE
    settlement_record RECORD;
    updated_count INTEGER := 0;
BEGIN
    FOR settlement_record IN 
        SELECT id, user_id, period_start_date, period_end_date, status
        FROM settlements
        WHERE status = 'pending'
        ORDER BY created_at DESC
    LOOP
        PERFORM create_or_update_settlement(
            settlement_record.user_id,
            settlement_record.period_start_date,
            settlement_record.period_end_date
        );
        updated_count := updated_count + 1;
    END LOOP;
    
    RAISE NOTICE 'Updated % pending settlements', updated_count;
END $$;
```

### Step 4: Verify

Check that IDs are now populated:

```sql
SELECT 
    id,
    period_start_date,
    total_transactions,
    array_length(commission_ids, 1) as commission_count,
    array_length(errand_ids, 1) as errand_count,
    commission_ids,
    errand_ids
FROM settlements
ORDER BY created_at DESC
LIMIT 10;
```

You should see TEXT arrays with commission and errand IDs as strings.

## What Changed

1. **Column Types**: `commission_ids` and `errand_ids` are now `TEXT[]` instead of `UUID[]`
2. **Function Variables**: All array variables use `TEXT[]` type
3. **Array Aggregation**: IDs are cast to TEXT: `ci.commission_id::TEXT` and `e.id::TEXT`
4. **Default Values**: Empty arrays use `ARRAY[]::TEXT[]` instead of `ARRAY[]::UUID[]`

## Notes

- The frontend already handles IDs as strings (`String(comm.id)`), so this change is compatible
- TEXT[] is more flexible and can handle different ID types (BIGINT, UUID, etc.)
- GIN indexes work with TEXT[] just as well as UUID[]

