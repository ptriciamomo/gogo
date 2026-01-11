-- Implement Weighted Statistical Tool for Rating System
-- This creates a weighted average system where star value = weight
-- Formula: weighted_avg = sum(rating × weight) / sum(weight)
-- Since weight = rating value, this becomes: weighted_avg = sum(rating²) / sum(rating)
-- The system is designed to be extensible for future enhancements (recency, rater reliability, etc.)

-- Update the function to calculate weighted average
CREATE OR REPLACE FUNCTION update_user_weighted_rating(user_id UUID)
RETURNS VOID AS $$
DECLARE
    weighted_sum DECIMAL(10,2);
    total_weight DECIMAL(10,2);
    calculated_rating DECIMAL(3,2);
BEGIN
    -- Calculate weighted average where weight = rating value
    -- This implements: sum(rating × weight) / sum(weight) where weight = rating
    -- For flexibility, we calculate it step by step
    
    SELECT 
        COALESCE(SUM(rating::DECIMAL * rating::DECIMAL), 0),  -- sum(rating × rating)
        COALESCE(SUM(rating::DECIMAL), 0)                     -- sum(rating)
    INTO weighted_sum, total_weight
    FROM rate_and_feedback 
    WHERE (buddycaller_id = user_id AND rater_id != user_id) 
       OR (buddyrunner_id = user_id AND rater_id != user_id);
    
    -- Calculate weighted average: (weighted_sum) / total_weight
    -- This is extensible - we can later add time_decay_factor, rater_reliability_factor, etc.
    IF total_weight > 0 THEN
        calculated_rating := ROUND(weighted_sum / total_weight, 2);
    ELSE
        calculated_rating := 0.00;
    END IF;
    
    -- Update user's average rating (we'll store it in average_rating field)
    UPDATE users 
    SET 
        average_rating = calculated_rating,
        total_ratings = COALESCE(
            (SELECT COUNT(*) 
             FROM rate_and_feedback 
             WHERE (buddycaller_id = user_id AND rater_id != user_id) 
                OR (buddyrunner_id = user_id AND rater_id != user_id)), 
            0
        )
    WHERE id = user_id;
    
    -- Log for debugging (optional)
    RAISE NOTICE 'Updated weighted rating for user %: % (from % ratings)', user_id, calculated_rating, total_weight;
END;
$$ LANGUAGE plpgsql;

-- Update the trigger function to use weighted calculation
CREATE OR REPLACE FUNCTION trigger_update_user_rating()
RETURNS TRIGGER AS $$
BEGIN
    -- Update rating for the user being rated (not the one giving the rating)
    IF TG_OP = 'INSERT' THEN
        -- Update the buddycaller's rating (if they were rated)
        IF NEW.buddycaller_id != NEW.rater_id THEN
            PERFORM update_user_weighted_rating(NEW.buddycaller_id);
        END IF;
        -- Update the buddyrunner's rating (if they were rated)  
        IF NEW.buddyrunner_id != NEW.rater_id THEN
            PERFORM update_user_weighted_rating(NEW.buddyrunner_id);
        END IF;
    ELSIF TG_OP = 'UPDATE' THEN
        -- Update both users' ratings
        IF NEW.buddycaller_id != NEW.rater_id THEN
            PERFORM update_user_weighted_rating(NEW.buddycaller_id);
        END IF;
        IF NEW.buddyrunner_id != NEW.rater_id THEN
            PERFORM update_user_weighted_rating(NEW.buddyrunner_id);
        END IF;
        -- Also update old values if they changed
        IF OLD.buddycaller_id != NEW.buddycaller_id AND OLD.buddycaller_id != OLD.rater_id THEN
            PERFORM update_user_weighted_rating(OLD.buddycaller_id);
        END IF;
        IF OLD.buddyrunner_id != NEW.buddyrunner_id AND OLD.buddyrunner_id != OLD.rater_id THEN
            PERFORM update_user_weighted_rating(OLD.buddyrunner_id);
        END IF;
    ELSIF TG_OP = 'DELETE' THEN
        -- Update both users' ratings
        IF OLD.buddycaller_id != OLD.rater_id THEN
            PERFORM update_user_weighted_rating(OLD.buddycaller_id);
        END IF;
        IF OLD.buddyrunner_id != OLD.rater_id THEN
            PERFORM update_user_weighted_rating(OLD.buddyrunner_id);
        END IF;
    END IF;
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Recreate the trigger
DROP TRIGGER IF EXISTS update_user_rating_trigger ON rate_and_feedback;
CREATE TRIGGER update_user_rating_trigger
    AFTER INSERT OR UPDATE OR DELETE ON rate_and_feedback
    FOR EACH ROW
    EXECUTE FUNCTION trigger_update_user_rating();

-- Update all existing users' weighted ratings
DO $$
DECLARE
    user_record RECORD;
BEGIN
    FOR user_record IN SELECT id FROM users LOOP
        PERFORM update_user_weighted_rating(user_record.id);
    END LOOP;
END $$;

-- Add comment for documentation
COMMENT ON FUNCTION update_user_weighted_rating IS 'Calculates weighted average rating using formula: sum(rating²) / sum(rating). This is extensible for future enhancements like recency weighting or rater reliability.';
COMMENT ON COLUMN users.average_rating IS 'Weighted average rating calculated from all received ratings (weight = rating value)';
COMMENT ON COLUMN users.total_ratings IS 'Total number of ratings received';

