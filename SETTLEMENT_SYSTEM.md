# Settlement System Documentation

## Overview

The Settlement System tracks student earnings from transactions (commissions and errands) and automatically deducts a 10 peso service fee per transaction. Settlements are calculated every 5 days, showing how much each student earns after fees.

## Features

1. **5-Day Settlement Periods**: The system divides time into 5-day periods for settlement calculations
2. **Automatic Fee Deduction**: 10 pesos is automatically deducted from each completed transaction
3. **Earnings Tracking**: Tracks total earnings from commissions and errands
4. **Net Amount Calculation**: Shows the final amount students receive after system fees
5. **Admin Management**: Admins can view all student settlements in one place

## Setup Instructions

### Step 1: Run the SQL Migration

Execute the SQL file to create the settlement system tables and functions:

1. Go to your Supabase dashboard
2. Navigate to **SQL Editor**
3. Copy and paste the contents of `create_settlement_system.sql`
4. Click **Run** to execute the script

This will create:
- `settlements` table to store settlement records
- `calculate_user_settlement()` function to calculate earnings and fees
- `create_or_update_settlement()` function to create/update settlement records
- `get_current_settlement_period()` function to get the current 5-day period
- Row Level Security (RLS) policies for data access

### Step 2: Verify Installation

After running the SQL, verify that:
- The `settlements` table exists in your database
- The functions are created and accessible
- RLS policies are enabled

## How It Works

### Settlement Calculation

For each student (BuddyRunner), the system:

1. **Calculates Total Earnings**:
   - Sums all accepted invoice amounts from completed commissions where the student was the runner
   - Sums all estimated prices from completed errands where the student was the runner

2. **Counts Transactions**:
   - Counts the total number of completed commissions and errands

3. **Calculates System Fees**:
   - Multiplies the number of transactions by 10 pesos
   - Formula: `system_fees = total_transactions × 10`

4. **Calculates Net Amount**:
   - Subtracts system fees from total earnings
   - Formula: `net_amount = total_earnings - system_fees`
   - Minimum value is 0 (cannot be negative)

### Settlement Periods

- Each period is exactly 5 days long
- Periods start from January 1, 2024 (epoch date)
- The current period is automatically calculated based on the current date
- Period dates are displayed in the format: `MM/DD/YYYY - MM/DD/YYYY`

### Example Calculation

If a student completes:
- 3 commissions with total earnings of ₱500
- 2 errands with total earnings of ₱200

**Calculation:**
- Total Earnings: ₱500 + ₱200 = ₱700
- Total Transactions: 3 + 2 = 5
- System Fees: 5 × ₱10 = ₱50
- Net Amount: ₱700 - ₱50 = ₱650

## Admin Interface

### Accessing Settlements

1. Log in as an admin
2. Navigate to **Settlements** in the sidebar
3. View the current settlement period and all student settlements

### Settlement Table Columns

- **Student Name**: Full name of the student
- **Student ID**: Student ID number
- **Transactions**: Total number of completed transactions
- **Total Earnings**: Total amount earned before fees
- **System Fees**: Total fees deducted (₱10 per transaction)
- **Net Amount**: Final amount after fees (displayed in green if positive)
- **Status**: Settlement status (Pending, Paid, or Cancelled)

### Settlement Statuses

- **Pending**: Settlement is calculated but not yet paid
- **Paid**: Settlement has been paid to the student
- **Cancelled**: Settlement has been cancelled

## Database Functions

### `calculate_user_settlement(p_user_id, p_start_date, p_end_date)`

Calculates settlement for a specific user within a date range.

**Parameters:**
- `p_user_id`: UUID of the user
- `p_start_date`: Start date of the period
- `p_end_date`: End date of the period

**Returns:**
- `total_earnings`: Sum of all earnings
- `total_transactions`: Count of transactions
- `system_fees`: Total fees (transactions × 10)
- `net_amount`: Earnings minus fees

### `create_or_update_settlement(p_user_id, p_start_date, p_end_date)`

Creates or updates a settlement record for a user.

**Parameters:**
- Same as `calculate_user_settlement`

**Returns:**
- Complete settlement record with all fields

### `get_current_settlement_period()`

Gets the current 5-day settlement period.

**Returns:**
- `start_date`: Start date of current period
- `end_date`: End date of current period
- `period_number`: Period number since epoch

## Important Notes

1. **Only BuddyRunners Earn Money**: Only students with the role "buddyrunner" are included in settlements since they are the ones who complete tasks and earn money.

2. **Completed Transactions Only**: Only transactions with status "completed" are counted in settlements.

3. **Commission Earnings**: Commission earnings come from accepted invoices. If a commission has multiple invoices, the system uses the accepted one, or the latest one if none are accepted.

4. **Errand Earnings**: Errand earnings come from the `estimated_price` field. If this field is not set, the errand contributes ₱0 to earnings.

5. **Real-time Updates**: Settlements are recalculated each time the admin views the Settlements page, ensuring the data is always current.

## Future Enhancements

Potential improvements to the system:
- Payment tracking and processing integration
- Email notifications for settlements
- Historical settlement period viewing
- Export settlement data to CSV/Excel
- Automated payment processing
- Settlement reports and analytics
