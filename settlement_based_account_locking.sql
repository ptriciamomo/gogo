-- Settlement-Based Account Locking System
-- This migration implements account locking based on overdue settlements:
-- 1. A settlement becomes Overdue the day after its period_end_date (period_end_date < CURRENT_DATE and status = 'pending')
-- 2. If a runner has any Overdue settlement that has been overdue for 5 full days, lock on day 6
-- 3. When all Overdue settlements for a runner are marked Paid, automatically unlock the account

-- ============================================
-- Function 1: Lock accounts with overdue settlements (5+ days overdue)
-- ============================================
CREATE OR REPLACE FUNCTION lock_accounts_with_overdue_settlements()
RETURNS INTEGER AS $$
DECLARE
    locked_count INTEGER;
    runner_record RECORD;
BEGIN
    locked_count := 0;
    
    -- Find all runners with overdue settlements that have been overdue for 5+ full days
    -- A settlement is overdue if: status = 'overdue' OR (status = 'pending' AND period_end_date < CURRENT_DATE)
    -- It's been overdue for 5+ days if: period_end_date < (CURRENT_DATE - INTERVAL '5 days')
    FOR runner_record IN
        SELECT DISTINCT s.user_id
        FROM settlements s
        INNER JOIN users u ON u.id = s.user_id
        WHERE LOWER(TRIM(u.role)) = 'buddyrunner'
          AND (
            -- Settlement is overdue (either status = 'overdue' OR pending with past period_end_date)
            (s.status = 'overdue')
            OR (s.status = 'pending' AND s.period_end_date < CURRENT_DATE)
          )
          -- Settlement has been overdue for 5+ full days (period_end_date was 6+ days ago)
          AND s.period_end_date < (CURRENT_DATE - INTERVAL '5 days')
          -- Only lock if not already locked
          AND (u.is_blocked IS NULL OR u.is_blocked = false)
        GROUP BY s.user_id
        HAVING COUNT(*) > 0
    LOOP
        -- Lock the runner's account
        UPDATE users
        SET 
            is_blocked = true,
            updated_at = NOW()
        WHERE id = runner_record.user_id;
        
        locked_count := locked_count + 1;
        
        RAISE NOTICE 'Locked account for user_id: %', runner_record.user_id;
    END LOOP;
    
    RETURN locked_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- Function 2: Unlock accounts when all overdue settlements are paid
-- ============================================
CREATE OR REPLACE FUNCTION unlock_accounts_with_paid_settlements()
RETURNS INTEGER AS $$
DECLARE
    unlocked_count INTEGER;
    runner_record RECORD;
    overdue_count INTEGER;
BEGIN
    unlocked_count := 0;
    
    -- Find all locked runners (BuddyRunners only)
    FOR runner_record IN
        SELECT u.id as user_id
        FROM users u
        WHERE LOWER(TRIM(u.role)) = 'buddyrunner'
          AND u.is_blocked = true
    LOOP
        -- Check if this runner has any overdue settlements
        SELECT COUNT(*)
        INTO overdue_count
        FROM settlements s
        WHERE s.user_id = runner_record.user_id
          AND (
            -- Settlement is overdue (either status = 'overdue' OR pending with past period_end_date)
            (s.status = 'overdue')
            OR (s.status = 'pending' AND s.period_end_date < CURRENT_DATE)
          );
        
        -- If no overdue settlements, unlock the account
        IF overdue_count = 0 THEN
            UPDATE users
            SET 
                is_blocked = false,
                updated_at = NOW()
            WHERE id = runner_record.user_id;
            
            unlocked_count := unlocked_count + 1;
            
            RAISE NOTICE 'Unlocked account for user_id: % (all overdue settlements are now paid)', runner_record.user_id;
        END IF;
    END LOOP;
    
    RETURN unlocked_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- Function 3: Daily check function (locks and unlocks in one call)
-- ============================================
CREATE OR REPLACE FUNCTION daily_settlement_account_check()
RETURNS JSON AS $$
DECLARE
    locked_count INTEGER;
    unlocked_count INTEGER;
BEGIN
    -- First, lock accounts with overdue settlements (5+ days overdue)
    SELECT lock_accounts_with_overdue_settlements() INTO locked_count;
    
    -- Then, unlock accounts with all overdue settlements paid
    SELECT unlock_accounts_with_paid_settlements() INTO unlocked_count;
    
    RETURN json_build_object(
        'locked', locked_count,
        'unlocked', unlocked_count,
        'timestamp', NOW()
    );
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- Trigger: Automatically unlock when settlement is marked as paid
-- ============================================
CREATE OR REPLACE FUNCTION trigger_unlock_on_settlement_paid()
RETURNS TRIGGER AS $$
DECLARE
    overdue_count INTEGER;
BEGIN
    -- Only trigger on status change to 'paid'
    IF NEW.status = 'paid' AND (OLD.status != 'paid' OR OLD.status IS NULL) THEN
        -- Check if this runner has any other overdue settlements
        SELECT COUNT(*)
        INTO overdue_count
        FROM settlements s
        WHERE s.user_id = NEW.user_id
          AND s.id != NEW.id
          AND (
            (s.status = 'overdue')
            OR (s.status = 'pending' AND s.period_end_date < CURRENT_DATE)
          );
        
        -- If no other overdue settlements, unlock the account
        IF overdue_count = 0 THEN
            UPDATE users
            SET 
                is_blocked = false,
                updated_at = NOW()
            WHERE id = NEW.user_id
              AND is_blocked = true;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if it exists and recreate it
DROP TRIGGER IF EXISTS trigger_unlock_on_settlement_paid ON settlements;
CREATE TRIGGER trigger_unlock_on_settlement_paid
    AFTER UPDATE OF status ON settlements
    FOR EACH ROW
    WHEN (NEW.status = 'paid')
    EXECUTE FUNCTION trigger_unlock_on_settlement_paid();

-- ============================================
-- Run initial check to lock/unlock accounts
-- ============================================
SELECT daily_settlement_account_check() as initial_check_result;

-- Note: This function should be called daily (via cron job or scheduled task)
-- Example cron schedule: 0 0 * * * (runs at midnight every day)
-- To run manually: SELECT daily_settlement_account_check();

