# Weighted Statistical Tool for Rating System

## Overview
This implementation adds a weighted statistical tool to calculate user ratings where each star value serves as its own weight.

## What Changed

### Database Level
The SQL function `update_user_weighted_rating()` calculates weighted averages using the formula:
```
Weighted Average = sum(rating × weight) / sum(weight)
```
Where `weight = rating value` (1-5 stars)

**Mathematical Formula:**
```
weighted_avg = (rating₁×rating₁ + rating₂×rating₂ + ... + ratingₙ×ratingₙ) / (rating₁ + rating₂ + ... + ratingₙ)
            = sum(rating²) / sum(rating)
```

### Example Calculation
If a user receives:
- 5 stars (appears 3 times)
- 4 stars (appears 2 times)  
- 3 stars (appears 1 time)

Calculation:
```
Weighted Sum = (5×5×3) + (4×4×2) + (3×3×1) = 75 + 32 + 9 = 116
Total Weight = (5×3) + (4×2) + (3×1) = 15 + 8 + 3 = 26
Weighted Average = 116 / 26 = 4.46
```

### Frontend Level
Updated `app/buddyrunner/home.tsx` to use weighted calculation in the manual fallback when `average_rating` is 0 or null.

## Installation

### Step 1: Run the SQL Migration
Execute the SQL script to update database functions:

```bash
# Connect to your Supabase database and run:
psql -h your-database-host -U postgres -d your-database-name -f implement_weighted_rating_system.sql
```

Or manually execute the SQL in `implement_weighted_rating_system.sql` in your Supabase SQL editor.

### Step 2: Verify
After running the SQL, the system will:
- Automatically recalculate all existing users' ratings using the weighted formula
- Automatically update ratings whenever new feedback is added
- Display the weighted average in user profiles (both mobile and web)

## How It Works

### Automatic Updates
A database trigger fires whenever a row is inserted, updated, or deleted from `rate_and_feedback`:
```sql
CREATE TRIGGER update_user_rating_trigger
    AFTER INSERT OR UPDATE OR DELETE ON rate_and_feedback
    FOR EACH ROW
    EXECUTE FUNCTION trigger_update_user_rating();
```

### Rating Storage
Ratings are stored with all required fields:
- `rater_id`: User giving the rating
- `buddycaller_id`: The BuddyCaller
- `buddyrunner_id`: The BuddyRunner  
- `rating`: Star value (1-5)
- `feedback`: Optional text feedback
- Timestamps: `created_at`, `updated_at`

### Display
The weighted rating is displayed in:
- User profile cards (BuddyRunner home)
- Stats cards showing overall rating
- Both mobile and web versions

## Extensibility

The system is designed for future enhancements. To add custom weighting (e.g., recency or rater reliability), modify the `update_user_weighted_rating` function:

```sql
-- Example: Add recency weighting
DECLARE
    recency_factor DECIMAL;
BEGIN
    -- Calculate recency factor based on created_at
    recency_factor := 1.0 + (days_old / 365) * 0.1;
    
    weighted_sum := SUM(rating * rating * recency_factor);
    ...
END;
```

Or add rater reliability:
```sql
-- Weight by rater's experience
weighted_sum := SUM(rating * rating * rater.experience_level);
```

## Testing

### Test the Calculation
```sql
-- Insert test ratings
INSERT INTO rate_and_feedback (commission_id, buddycaller_id, buddyrunner_id, rater_id, rating, feedback)
VALUES
  (1, 'user-1', 'user-2', 'user-3', 5, 'Excellent'),
  (1, 'user-1', 'user-2', 'user-4', 4, 'Very good'),
  (1, 'user-1', 'user-2', 'user-5', 3, 'Good');

-- Check the weighted average
SELECT average_rating FROM users WHERE id = 'user-2';
-- Expected: ≈ 4.33 (calculated as sum of 5²+4²+3² / 5+4+3 = 50/12 ≈ 4.17)
```

## Features

✅ Weighted statistical calculation (not simple average)  
✅ Automatic updates on rating changes  
✅ Bidirectional ratings (runners can rate callers, callers can rate runners)  
✅ Extensible for future enhancements  
✅ Mobile and web support  
✅ Rounded to 2 decimal places  

## Technical Details

### Weight Assignment
- 1 star = weight 1 (Very Poor)
- 2 stars = weight 2 (Poor)
- 3 stars = weight 3 (Good)
- 4 stars = weight 4 (Very Good)
- 5 stars = weight 5 (Excellent)

### Database Function
File: `implement_weighted_rating_system.sql`

### Frontend Integration
File: `app/buddyrunner/home.tsx` (lines 179-214)

## Support

For issues or questions about the weighted rating system, refer to:
- SQL implementation: `implement_weighted_rating_system.sql`
- Database schema: `create_rate_and_feedback_table.sql`
- Frontend display: `app/buddyrunner/home.tsx`

