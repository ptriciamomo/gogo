# Debug: Why Only Stephanie Delfin's Account is Getting Locked

## Diagnostic Queries

### Query 1: Check Stephanie Delfin's Account Details
```sql
SELECT 
    id,
    email,
    first_name,
    last_name,
    role,
    created_at,
    EXTRACT(DAY FROM (NOW() - created_at)) as days_since_registration,
    is_blocked
FROM users
WHERE email = 's.delfin.535754@umindanao.edu.ph';
```

### Query 2: Check All BuddyRunners and Their Status
```sql
SELECT 
    u.id,
    u.email,
    u.first_name,
    u.last_name,
    u.role,
    u.created_at,
    EXTRACT(DAY FROM (NOW() - u.created_at)) as days_since_registration,
    u.is_blocked,
    COUNT(s.id) FILTER (WHERE s.status = 'pending') as unpaid_settlements_count
FROM users u
LEFT JOIN settlements s ON s.user_id = u.id AND s.status = 'pending'
WHERE LOWER(TRIM(u.role)) = 'buddyrunner'
GROUP BY u.id, u.email, u.first_name, u.last_name, u.role, u.created_at, u.is_blocked
ORDER BY u.created_at DESC;
```

### Query 3: Check Stephanie's Settlements
```sql
SELECT 
    s.id,
    s.user_id,
    u.email,
    s.status,
    s.system_fees,
    s.period_start_date,
    s.period_end_date,
    s.created_at,
    s.paid_at
FROM settlements s
JOIN users u ON s.user_id = u.id
WHERE u.email = 's.delfin.535754@umindanao.edu.ph'
ORDER BY s.created_at DESC;
```

### Query 4: Check All Users Who Should Be Blocked (but might not be)
```sql
SELECT 
    u.email,
    u.first_name,
    u.last_name,
    u.role,
    EXTRACT(DAY FROM (NOW() - u.created_at)) as days_since_registration,
    COUNT(s.id) as unpaid_settlements
FROM users u
LEFT JOIN settlements s ON s.user_id = u.id AND s.status = 'pending'
WHERE LOWER(TRIM(u.role)) = 'buddyrunner'
  AND EXTRACT(DAY FROM (NOW() - u.created_at)) >= 6
GROUP BY u.id, u.email, u.first_name, u.last_name, u.role, u.created_at
HAVING COUNT(s.id) > 0
ORDER BY u.created_at DESC;
```

## Common Issues to Check

### Issue 1: Role Field Case Sensitivity
The code does `.trim().toLowerCase()` but the role might be stored as:
- `'BuddyRunner'` (capital B and R)
- `'buddy runner'` (with space)
- `'Buddy Runner'` (with space and capitals)

**Fix:** Check actual role values:
```sql
SELECT DISTINCT role FROM users WHERE role ILIKE '%runner%' OR role ILIKE '%buddy%';
```

### Issue 2: Email Address Mismatch
The UPDATE query returned "No rows returned" - check if the email exists:
```sql
SELECT email FROM users WHERE email LIKE '%delfin%' OR email LIKE '%stephanie%';
```

### Issue 3: Created_at Already Set to 6+ Days Ago
Stephanie's account might already have `created_at` set correctly from registration or a previous update.

**Check:**
```sql
SELECT 
    email,
    created_at,
    EXTRACT(DAY FROM (NOW() - created_at)) as days_ago
FROM users
WHERE email = 's.delfin.535754@umindanao.edu.ph';
```

### Issue 4: Other BuddyRunners Don't Meet Criteria
Other BuddyRunners might:
- Have `created_at` less than 6 days ago
- Have all settlements marked as "paid"
- Have no settlements at all

## Why Only Stephanie is Getting Locked

Based on the blocking logic, Stephanie's account is getting locked because she meets ALL of these conditions:

1. ✅ **Role matches**: Her role is stored as 'buddyrunner' (case-insensitive match works)
2. ✅ **6+ days since registration**: Her `created_at` is 6 or more days ago
3. ✅ **Has unpaid settlements**: She has at least one settlement with `status = 'pending'`

Other BuddyRunners are NOT getting locked because they likely:
- ❌ Have `created_at` less than 6 days ago (new accounts)
- ❌ Have all settlements marked as "paid" (no pending status)
- ❌ Have no settlements yet (no completed commissions/errands)

## Solution

### To Test Other Accounts:
1. **Update another BuddyRunner's registration date**:
```sql
UPDATE users 
SET created_at = NOW() - INTERVAL '6 days'
WHERE email = 'other-buddyrunner@example.com'
AND LOWER(TRIM(role)) = 'buddyrunner';
```

2. **Ensure they have unpaid settlements**:
   - They need to complete at least one commission/errand
   - Or manually create a settlement:
```sql
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
) 
SELECT 
    id,
    CURRENT_DATE - INTERVAL '10 days',
    CURRENT_DATE - INTERVAL '6 days',
    100.00,
    5,
    50.00,
    50.00,
    'pending',
    NOW(),
    NOW()
FROM users
WHERE email = 'other-buddyrunner@example.com';
```

### To Unlock Stephanie's Account:
1. Login as Admin
2. Go to Settlements page
3. Find Stephanie Delfin's settlement
4. Click "Mark as Paid"
5. Her account will be accessible immediately

