# Testing Guide: Settlement Matching and Creation

## Quick Test Checklist

### 1. Browser Console Verification
Open browser DevTools (F12) → Console tab, and verify you see:

✅ **Period Calculation Logs**
```
🔍 Period calculation: {
  input_timestamp: "2025-11-06T...",
  extracted_date: "2025-11-06",
  transaction_date: "2025-11-06",
  days_since_epoch: XXX,
  period_number: XXX,
  calculated_period: { start: "2025-11-06", end: "2025-11-10" }
}
```

✅ **Settlement Matching Logs**
- `🔍 Existing settlements map keys: [...]` - Shows settlements in database
- `🔍 Calculated settlements map keys: [...]` - Shows calculated settlements
- `✅ Found existing settlement for key: ...` - When a match is found
- `⚠️ No existing settlement found for calculated key: ...` - When new settlement needed

✅ **Creation Logs**
- `🔍 Attempting to create settlements: [...]` - Shows settlements being created
- No `403 Forbidden` errors
- No `row-level security policy` errors

### 2. UI Verification

✅ **Settlements Display**
- All settlements appear in the table
- Period dates are correct (match database format: YYYY-MM-DD)
- No duplicate settlements for the same user/period
- Statuses are correct (pending/paid/cancelled)

✅ **Stephanie's Settlement (Student ID 535754)**
- Appears in the list
- Shows correct period dates
- Shows correct earnings (₱244.00)
- Shows correct transactions (1)
- Can be marked as paid (if pending)

### 3. Database Verification

Run this query in Supabase SQL Editor:

```sql
-- Check all settlements for Stephanie (student ID 535754)
SELECT 
    s.id,
    s.user_id,
    u.email,
    u.student_id_number,
    s.period_start_date,
    s.period_end_date,
    s.total_earnings,
    s.total_transactions,
    s.status,
    s.created_at
FROM settlements s
JOIN users u ON s.user_id = u.id
WHERE u.student_id_number = '535754'
ORDER BY s.period_start_date DESC;
```

**Expected Results:**
- Should see settlement with period matching what's shown in UI
- No duplicate settlements (same user_id + period_start_date + period_end_date)
- Status should match what's shown in UI

### 4. Test Specific Scenarios

#### Scenario A: Settlement Already Exists
1. **Setup**: Settlement exists in database with period `2025-11-01 - 2025-11-05`
2. **Action**: Load admin settlements page
3. **Expected**: 
   - Console shows: `✅ Found existing settlement for key`
   - UI shows the existing settlement (not a duplicate)
   - No attempt to create a new one

#### Scenario B: Settlement Doesn't Exist
1. **Setup**: Transaction exists but no settlement in database
2. **Action**: Load admin settlements page
3. **Expected**:
   - Console shows: `⚠️ No existing settlement found for calculated key`
   - Console shows: `🔍 Attempting to create settlements`
   - Settlement is created via RPC function (no RLS errors)
   - Settlement appears in UI and database

#### Scenario C: Period Calculation Mismatch
1. **Setup**: Frontend calculates period `2025-11-06 - 2025-11-10`, but database has `2025-11-01 - 2025-11-05`
2. **Action**: Load admin settlements page
3. **Expected**:
   - Console shows period calculation details
   - If periods don't match, new settlement is created for the calculated period
   - Both periods may appear (if they're actually different transactions)

### 5. Error Scenarios to Watch For

❌ **RLS Policy Errors**
- Error: `new row violates row-level security policy`
- **Fix**: Should use RPC function which bypasses RLS

❌ **Duplicate Key Errors**
- Error: `duplicate key value violates unique constraint`
- **Fix**: Code should check existence before creating

❌ **Wrong Period Matching**
- Settlement matched by earnings instead of period
- **Fix**: Should only match by exact user_id + period dates

### 6. Manual Database Check

If you want to verify the period calculation manually:

```sql
-- Calculate period for a specific date (matching the frontend logic)
WITH test_date AS (
    SELECT '2025-11-06'::DATE as transaction_date
),
epoch_start AS (
    SELECT '2024-01-01'::DATE as epoch_start
)
SELECT 
    transaction_date,
    epoch_start,
    (transaction_date - epoch_start) as days_since_epoch,
    FLOOR((transaction_date - epoch_start)::INTEGER / 5) as period_number,
    epoch_start + (FLOOR((transaction_date - epoch_start)::INTEGER / 5) * INTERVAL '5 days') as period_start,
    epoch_start + (FLOOR((transaction_date - epoch_start)::INTEGER / 5) * INTERVAL '5 days') + INTERVAL '4 days' as period_end
FROM test_date, epoch_start;
```

This should match what the frontend calculates.

## Troubleshooting

### Issue: Settlement shows in UI but not in database
**Check:**
1. Console for RLS errors
2. Console for creation errors
3. Database for settlements with similar periods (might be period mismatch)

### Issue: Duplicate settlements appearing
**Check:**
1. Console logs for matching logic
2. Database for actual duplicates (same user_id + period)
3. Period calculation logs for mismatches

### Issue: Wrong period dates
**Check:**
1. Console period calculation logs
2. Transaction `created_at` dates
3. Compare with database calculation using SQL query above

