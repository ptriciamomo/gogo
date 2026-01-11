# Testing Guide: System Fee Blocking for BuddyRunners

## Overview
This feature automatically prevents BuddyRunners from logging in every 6 days from their registration date if they have unpaid system fees.

## Prerequisites
1. Admin access to the system
2. A test BuddyRunner account
3. Access to the Settlements page (Admin panel)

## Test Scenarios

### Scenario 1: Test with New BuddyRunner (6+ Days Old with Unpaid Fees)

#### Step 1: Create or Find a Test BuddyRunner
1. Register a new BuddyRunner account (or use an existing one)
2. Note the registration date (`created_at` in the `users` table)
3. Calculate: Registration Date + 6 days = Block Date

#### Step 2: Create Unpaid Settlement
1. Login as Admin
2. Navigate to **Settlements** page
3. Find the test BuddyRunner in the settlements list
4. Verify they have a settlement with **Status: Pending**
5. If no settlement exists, ensure the BuddyRunner has completed at least one commission/errand that generates system fees

#### Step 3: Verify Registration Date
- Option A: Use Supabase Dashboard
  1. Go to Supabase Dashboard → Table Editor → `users`
  2. Find the test BuddyRunner by email
  3. Check `created_at` field
  4. Calculate days: `(Today - created_at) >= 6 days`

- Option B: Temporarily modify registration date (for testing)
  ```sql
  -- In Supabase SQL Editor, run:
  UPDATE users 
  SET created_at = NOW() - INTERVAL '6 days'
  WHERE email = 'test-buddyrunner@example.com';
  ```

#### Step 4: Test Login Blocking
1. Logout from any account
2. Try to login as the test BuddyRunner
3. **Expected Result**: 
   - Login should be blocked
   - Modal/Alert should appear: "Account Access Restricted"
   - Message: "Your account access has been restricted. Please settle your system fees by contacting the admin. Your account will be accessible again once the admin marks your fees as paid."
   - Auto-logout after 3-5 seconds

#### Step 5: Verify Access is Blocked
1. Even if somehow logged in, try accessing:
   - `/buddyrunner/home`
   - `/buddyrunner/task_progress_web`
2. **Expected Result**: Should redirect to login page

### Scenario 2: Test with Paid Fees (Should Allow Access)

#### Step 1: Mark Settlement as Paid
1. Login as Admin
2. Navigate to **Settlements** page
3. Find the test BuddyRunner's settlement
4. Click **"Mark as Paid"** button
5. Verify status changes to **"Paid"** (green status)

#### Step 2: Test Login
1. Logout from admin account
2. Try to login as the test BuddyRunner
3. **Expected Result**: 
   - Login should succeed
   - Should redirect to `/buddyrunner/home`
   - No blocking message

### Scenario 3: Test with BuddyRunner Less Than 6 Days Old

#### Step 1: Create New BuddyRunner
1. Register a new BuddyRunner account
2. Verify `created_at` is today (or within last 5 days)

#### Step 2: Create Unpaid Settlement
1. Login as Admin
2. Create a settlement for this new BuddyRunner with status "Pending"
   - Or wait for them to complete a commission/errand

#### Step 3: Test Login
1. Try to login as the new BuddyRunner
2. **Expected Result**: 
   - Login should succeed (even with unpaid fees)
   - Should NOT be blocked because 6 days haven't passed yet

### Scenario 4: Test with BuddyRunner (6+ Days Old, No Unpaid Fees)

#### Step 1: Setup
1. Use a BuddyRunner account that's 6+ days old
2. Ensure all their settlements are marked as "Paid"
3. Or ensure they have no pending settlements

#### Step 2: Test Login
1. Try to login as this BuddyRunner
2. **Expected Result**: 
   - Login should succeed
   - Should NOT be blocked
   - Should redirect to `/buddyrunner/home`

## Quick Testing Commands

### Check Current Registration Date and Days Since Registration
```sql
-- Run in Supabase SQL Editor
SELECT 
    id,
    email,
    first_name,
    last_name,
    role,
    created_at,
    EXTRACT(DAY FROM (NOW() - created_at)) as days_since_registration
FROM users
WHERE role = 'buddyrunner'
ORDER BY created_at DESC;
```

### Check Unpaid Settlements
```sql
-- Run in Supabase SQL Editor
SELECT 
    s.id,
    s.user_id,
    u.email,
    u.first_name,
    u.last_name,
    s.status,
    s.system_fees,
    s.created_at
FROM settlements s
JOIN users u ON s.user_id = u.id
WHERE s.status = 'pending'
AND u.role = 'buddyrunner';
```

### Manually Set Registration Date to 6 Days Ago (for testing)
```sql
-- Replace 'test-buddyrunner@example.com' with actual email
UPDATE users 
SET created_at = NOW() - INTERVAL '6 days'
WHERE email = 'test-buddyrunner@example.com'
AND role = 'buddyrunner';
```

### Manually Set Registration Date to 7 Days Ago (for testing)
```sql
-- Replace 'test-buddyrunner@example.com' with actual email
UPDATE users 
SET created_at = NOW() - INTERVAL '7 days'
WHERE email = 'test-buddyrunner@example.com'
AND role = 'buddyrunner';
```

### Create a Test Settlement (if needed)
```sql
-- Replace 'USER_ID_HERE' with actual user_id (UUID)
INSERT INTO settlements (
    user_id,
    period_start_date,
    period_end_date,
    total_earnings,
    total_transactions,
    system_fees,
    net_amount,
    status,
    created_at,
    updated_at
) VALUES (
    'USER_ID_HERE',
    CURRENT_DATE - INTERVAL '10 days',
    CURRENT_DATE - INTERVAL '6 days',
    100.00,
    5,
    50.00,
    50.00,
    'pending',
    NOW(),
    NOW()
);
```

## Testing Checklist

- [ ] BuddyRunner with 6+ days since registration + unpaid fees → **BLOCKED**
- [ ] BuddyRunner with 6+ days since registration + paid fees → **ALLOWED**
- [ ] BuddyRunner with < 6 days since registration + unpaid fees → **ALLOWED**
- [ ] BuddyRunner with 6+ days since registration + no settlements → **ALLOWED**
- [ ] Admin marks settlement as "Paid" → BuddyRunner can login again
- [ ] Login modal shows correct message
- [ ] Auto-logout works correctly
- [ ] Access to home page is blocked if unpaid fees exist
- [ ] Access to task progress page is blocked if unpaid fees exist

## Expected Behavior Summary

| Days Since Registration | Unpaid Fees | Expected Result |
|------------------------|-------------|----------------|
| < 6 days | Yes | ✅ Login Allowed |
| < 6 days | No | ✅ Login Allowed |
| ≥ 6 days | Yes | ❌ Login Blocked |
| ≥ 6 days | No | ✅ Login Allowed |

## Troubleshooting

### Issue: BuddyRunner not being blocked even though they have unpaid fees
**Check:**
1. Verify `created_at` date in `users` table
2. Verify days since registration >= 6
3. Check if settlements exist with `status = 'pending'`
4. Check browser console for errors

### Issue: BuddyRunner blocked even after marking as paid
**Check:**
1. Verify settlement status is actually "paid" in database
2. Clear browser cache and try again
3. Check if there are multiple settlements (all should be paid)

### Issue: Message not appearing correctly
**Check:**
1. Verify modal is showing for web version
2. Verify alert is showing for mobile version
3. Check if `showBlockedModal` state is working

## Notes

- The 6-day count starts from the `created_at` timestamp in the `users` table
- Only settlements with `status = 'pending'` are considered unpaid
- Once admin marks a settlement as "paid", the BuddyRunner can immediately login again
- The check happens on every login attempt and on page load for BuddyRunner pages

