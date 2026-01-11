# Verification Steps for Commission & Errand ID Tracking

## Step 1: Verify Database Schema

Run this query to confirm the columns were added:

```sql
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'settlements'
AND column_name IN ('commission_ids', 'errand_ids');
```

Expected result: Both columns should exist as `uuid[]` type with default `'{}'`.

## Step 2: Verify Function Signature

Check that `calculate_user_settlement` now returns the new columns:

```sql
SELECT 
    p.proname as function_name,
    pg_get_function_result(p.oid) as return_type
FROM pg_proc p
WHERE p.proname = 'calculate_user_settlement';
```

Expected result: Should show the function returns a table with `commission_ids` and `errand_ids` columns.

## Step 3: Test Function with Real Data

Test the function with an actual user who has completed commissions/errands:

```sql
-- Replace with an actual user_id from your database
SELECT * FROM calculate_user_settlement(
    'YOUR_USER_ID_HERE'::UUID,
    '2024-01-01'::DATE,
    '2024-12-31'::DATE
);
```

Expected result: Should return a row with populated `commission_ids` and `errand_ids` arrays.

## Step 4: Check Existing Settlements

See if any settlements already have IDs populated:

```sql
SELECT 
    id,
    user_id,
    period_start_date,
    period_end_date,
    total_transactions,
    array_length(commission_ids, 1) as commission_count,
    array_length(errand_ids, 1) as errand_count,
    commission_ids,
    errand_ids
FROM settlements
WHERE array_length(commission_ids, 1) > 0 
   OR array_length(errand_ids, 1) > 0
ORDER BY created_at DESC
LIMIT 10;
```

## Step 5: Test Frontend Functionality

1. **Go to Admin Settlements Page**
   - Navigate to the admin settlements page in your app
   - The page should load without errors

2. **Trigger Settlement Calculation**
   - The settlements should be calculated automatically
   - Check browser console for any errors

3. **Verify New Settlements**
   - Create a new settlement (or wait for automatic calculation)
   - Check the database to see if `commission_ids` and `errand_ids` are populated:
   ```sql
   SELECT 
       id,
       user_id,
       period_start_date,
       period_end_date,
       commission_ids,
       errand_ids,
       total_transactions
   FROM settlements
   ORDER BY created_at DESC
   LIMIT 5;
   ```

4. **Verify Period Calculation**
   - Check that `period_start_date` matches the earliest transaction date from the tracked IDs
   - You can verify this by comparing:
   ```sql
   -- Get settlement with IDs
   SELECT 
       s.id,
       s.period_start_date,
       s.commission_ids,
       s.errand_ids
   FROM settlements s
   WHERE array_length(s.commission_ids, 1) > 0
   LIMIT 1;
   
   -- Then check the earliest commission date
   SELECT 
       MIN(DATE(c.created_at)) as earliest_commission_date
   FROM commission c
   WHERE c.id::text = ANY(
       SELECT unnest(commission_ids)::text 
       FROM settlements 
       WHERE id = 'SETTLEMENT_ID_FROM_ABOVE'
   );
   ```

## Step 6: Test "Mark as Paid" Functionality

1. Find a pending settlement in the admin UI
2. Click "Mark as Paid"
3. Verify it updates correctly:
   ```sql
   SELECT 
       id,
       status,
       paid_at,
       commission_ids,
       errand_ids
   FROM settlements
   WHERE status = 'paid'
   ORDER BY paid_at DESC
   LIMIT 5;
   ```

## Step 7: Update Existing Settlements (Optional)

If you want to backfill existing settlements with commission/errand IDs, you can run:

```sql
-- This will recalculate and update all pending settlements
-- WARNING: Only run this if you want to update existing settlements
DO $$
DECLARE
    settlement_record RECORD;
BEGIN
    FOR settlement_record IN 
        SELECT id, user_id, period_start_date, period_end_date
        FROM settlements
        WHERE status = 'pending'
    LOOP
        PERFORM create_or_update_settlement(
            settlement_record.user_id,
            settlement_record.period_start_date,
            settlement_record.period_end_date
        );
    END LOOP;
END $$;
```

## Troubleshooting

### If commission_ids/errand_ids are empty:
- Check that commissions/errands have `status = 'completed'`
- Verify the date range includes the transaction dates
- Check that invoices exist for commissions (if required)

### If period_start_date seems incorrect:
- The frontend now calculates periods based on earliest transaction date from tracked IDs
- Verify the calculation by checking the actual transaction dates:
  ```sql
  SELECT 
      DATE(c.created_at) as transaction_date,
      c.id as commission_id
  FROM commission c
  WHERE c.id::text = ANY(
      SELECT unnest(commission_ids)::text 
      FROM settlements 
      WHERE id = 'YOUR_SETTLEMENT_ID'
  )
  ORDER BY c.created_at ASC;
  ```

