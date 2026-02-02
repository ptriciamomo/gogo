-- Safe Runner-Side Timeout Handler RPC Function
-- This function allows runner clients to trigger timeout processing immediately
-- It is idempotent and safe to call multiple times
-- Cron job remains as fallback

-- Function for errand timeout (called by runner client)
CREATE OR REPLACE FUNCTION public.handle_errand_timeout(
    p_errand_id bigint,
    p_runner_id uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_errand_record RECORD;
    v_ranked_runner_ids uuid[];
    v_current_index integer;
    v_next_index integer;
    v_queue_length integer;
    v_next_runner_id uuid;
    v_timeout_runner_ids uuid[];
    v_updated_timeout_ids uuid[];
    v_updated RECORD;
BEGIN
    -- Re-check conditions (idempotency guard)
    SELECT 
        id,
        status,
        runner_id,
        notified_runner_id,
        ranked_runner_ids,
        current_queue_index,
        timeout_runner_ids,
        notified_expires_at
    INTO v_errand_record
    FROM public.errand
    WHERE id = p_errand_id
    FOR UPDATE SKIP LOCKED;
    
    -- Safety checks: only process if conditions still match
    IF v_errand_record.id IS NULL THEN
        RETURN json_build_object('success', false, 'reason', 'errand_not_found');
    END IF;
    
    IF v_errand_record.status != 'pending' THEN
        RETURN json_build_object('success', false, 'reason', 'not_pending', 'status', v_errand_record.status);
    END IF;
    
    IF v_errand_record.runner_id IS NOT NULL THEN
        RETURN json_build_object('success', false, 'reason', 'already_accepted');
    END IF;
    
    IF v_errand_record.notified_runner_id IS NULL OR v_errand_record.notified_runner_id != p_runner_id THEN
        RETURN json_build_object('success', false, 'reason', 'not_notified_to_runner');
    END IF;
    
    -- Check if already expired (cron may have processed it)
    IF v_errand_record.notified_expires_at IS NULL OR v_errand_record.notified_expires_at > NOW() THEN
        RETURN json_build_object('success', false, 'reason', 'not_expired_yet');
    END IF;
    
    -- Read queue state
    v_ranked_runner_ids := v_errand_record.ranked_runner_ids;
    v_current_index := COALESCE(v_errand_record.current_queue_index, 0);
    v_timeout_runner_ids := COALESCE(v_errand_record.timeout_runner_ids, ARRAY[]::uuid[]);
    v_queue_length := COALESCE(array_length(v_ranked_runner_ids, 1), 0);
    
    -- Append current runner to timeout list (idempotent)
    v_updated_timeout_ids := v_timeout_runner_ids;
    IF NOT (p_runner_id = ANY(v_updated_timeout_ids)) THEN
        v_updated_timeout_ids := array_append(v_updated_timeout_ids, p_runner_id);
    END IF;
    
    -- Advance queue index
    v_next_index := v_current_index + 1;
    
    -- Determine if queue is exhausted
    IF v_queue_length = 0 OR v_next_index >= v_queue_length THEN
        -- CANCEL: Queue exhausted
        UPDATE public.errand
        SET 
            status = 'cancelled',
            notified_runner_id = NULL,
            notified_at = NULL,
            notified_expires_at = NULL,
            is_notified = FALSE,
            current_queue_index = v_next_index,
            timeout_runner_ids = v_updated_timeout_ids
        WHERE id = p_errand_id
          AND status = 'pending'
          AND runner_id IS NULL
          AND notified_runner_id = p_runner_id
        RETURNING * INTO v_updated;
        
        IF v_updated.id IS NULL THEN
            RETURN json_build_object('success', false, 'reason', 'update_failed_concurrent');
        END IF;
        
        RETURN json_build_object('success', true, 'action', 'cancelled');
    ELSE
        -- REASSIGN: Get next runner from queue
        v_next_runner_id := v_ranked_runner_ids[v_next_index + 1];
        
        IF v_next_runner_id IS NULL THEN
            -- Next runner is NULL: cancel instead
            UPDATE public.errand
            SET 
                status = 'cancelled',
                notified_runner_id = NULL,
                notified_at = NULL,
                notified_expires_at = NULL,
                is_notified = FALSE,
                current_queue_index = v_next_index,
                timeout_runner_ids = v_updated_timeout_ids
            WHERE id = p_errand_id
              AND status = 'pending'
              AND runner_id IS NULL
              AND notified_runner_id = p_runner_id
            RETURNING * INTO v_updated;
            
            IF v_updated.id IS NULL THEN
                RETURN json_build_object('success', false, 'reason', 'update_failed_concurrent');
            END IF;
            
            RETURN json_build_object('success', true, 'action', 'cancelled');
        ELSE
            -- REASSIGN: Notify next runner
            UPDATE public.errand
            SET 
                notified_runner_id = v_next_runner_id,
                notified_at = NOW(),
                notified_expires_at = NOW() + INTERVAL '60 seconds',
                current_queue_index = v_next_index,
                timeout_runner_ids = v_updated_timeout_ids,
                is_notified = TRUE
            WHERE id = p_errand_id
              AND status = 'pending'
              AND runner_id IS NULL
              AND notified_runner_id = p_runner_id
            RETURNING * INTO v_updated;
            
            IF v_updated.id IS NULL THEN
                RETURN json_build_object('success', false, 'reason', 'update_failed_concurrent');
            END IF;
            
            RETURN json_build_object('success', true, 'action', 'reassigned', 'next_runner_id', v_next_runner_id);
        END IF;
    END IF;
EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'reason', 'error', 'error', SQLERRM);
END;
$$;

-- Function for commission timeout (called by runner client)
CREATE OR REPLACE FUNCTION public.handle_commission_timeout(
    p_commission_id bigint,
    p_runner_id uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_commission_record RECORD;
    v_ranked_runner_ids uuid[];
    v_current_index integer;
    v_next_index integer;
    v_queue_length integer;
    v_next_runner_id uuid;
    v_timeout_runner_ids uuid[];
    v_updated_timeout_ids uuid[];
    v_updated RECORD;
BEGIN
    -- Re-check conditions (idempotency guard)
    SELECT 
        id,
        status,
        runner_id,
        notified_runner_id,
        ranked_runner_ids,
        current_queue_index,
        timeout_runner_ids,
        notified_expires_at
    INTO v_commission_record
    FROM public.commission
    WHERE id = p_commission_id
    FOR UPDATE SKIP LOCKED;
    
    -- Safety checks: only process if conditions still match
    IF v_commission_record.id IS NULL THEN
        RETURN json_build_object('success', false, 'reason', 'commission_not_found');
    END IF;
    
    IF v_commission_record.status != 'pending' THEN
        RETURN json_build_object('success', false, 'reason', 'not_pending', 'status', v_commission_record.status);
    END IF;
    
    IF v_commission_record.runner_id IS NOT NULL THEN
        RETURN json_build_object('success', false, 'reason', 'already_accepted');
    END IF;
    
    IF v_commission_record.notified_runner_id IS NULL OR v_commission_record.notified_runner_id != p_runner_id THEN
        RETURN json_build_object('success', false, 'reason', 'not_notified_to_runner');
    END IF;
    
    -- Check if already expired (cron may have processed it)
    IF v_commission_record.notified_expires_at IS NULL OR v_commission_record.notified_expires_at > NOW() THEN
        RETURN json_build_object('success', false, 'reason', 'not_expired_yet');
    END IF;
    
    -- Read queue state
    v_ranked_runner_ids := v_commission_record.ranked_runner_ids;
    v_current_index := COALESCE(v_commission_record.current_queue_index, 0);
    v_timeout_runner_ids := COALESCE(v_commission_record.timeout_runner_ids, ARRAY[]::uuid[]);
    v_queue_length := COALESCE(array_length(v_ranked_runner_ids, 1), 0);
    
    -- Append current runner to timeout list (idempotent)
    v_updated_timeout_ids := v_timeout_runner_ids;
    IF NOT (p_runner_id = ANY(v_updated_timeout_ids)) THEN
        v_updated_timeout_ids := array_append(v_updated_timeout_ids, p_runner_id);
    END IF;
    
    -- Advance queue index
    v_next_index := v_current_index + 1;
    
    -- Determine if queue is exhausted
    IF v_queue_length = 0 OR v_next_index >= v_queue_length THEN
        -- CANCEL: Queue exhausted
        UPDATE public.commission
        SET 
            status = 'cancelled',
            notified_runner_id = NULL,
            notified_at = NULL,
            notified_expires_at = NULL,
            is_notified = FALSE,
            current_queue_index = v_next_index,
            timeout_runner_ids = v_updated_timeout_ids
        WHERE id = p_commission_id
          AND status = 'pending'
          AND runner_id IS NULL
          AND notified_runner_id = p_runner_id
        RETURNING * INTO v_updated;
        
        IF v_updated.id IS NULL THEN
            RETURN json_build_object('success', false, 'reason', 'update_failed_concurrent');
        END IF;
        
        RETURN json_build_object('success', true, 'action', 'cancelled');
    ELSE
        -- REASSIGN: Get next runner from queue
        v_next_runner_id := v_ranked_runner_ids[v_next_index + 1];
        
        IF v_next_runner_id IS NULL THEN
            -- Next runner is NULL: cancel instead
            UPDATE public.commission
            SET 
                status = 'cancelled',
                notified_runner_id = NULL,
                notified_at = NULL,
                notified_expires_at = NULL,
                is_notified = FALSE,
                current_queue_index = v_next_index,
                timeout_runner_ids = v_updated_timeout_ids
            WHERE id = p_commission_id
              AND status = 'pending'
              AND runner_id IS NULL
              AND notified_runner_id = p_runner_id
            RETURNING * INTO v_updated;
            
            IF v_updated.id IS NULL THEN
                RETURN json_build_object('success', false, 'reason', 'update_failed_concurrent');
            END IF;
            
            RETURN json_build_object('success', true, 'action', 'cancelled');
        ELSE
            -- REASSIGN: Notify next runner
            UPDATE public.commission
            SET 
                notified_runner_id = v_next_runner_id,
                notified_at = NOW(),
                notified_expires_at = NOW() + INTERVAL '60 seconds',
                current_queue_index = v_next_index,
                timeout_runner_ids = v_updated_timeout_ids,
                is_notified = TRUE
            WHERE id = p_commission_id
              AND status = 'pending'
              AND runner_id IS NULL
              AND notified_runner_id = p_runner_id
            RETURNING * INTO v_updated;
            
            IF v_updated.id IS NULL THEN
                RETURN json_build_object('success', false, 'reason', 'update_failed_concurrent');
            END IF;
            
            RETURN json_build_object('success', true, 'action', 'reassigned', 'next_runner_id', v_next_runner_id);
        END IF;
    END IF;
EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'reason', 'error', 'error', SQLERRM);
END;
$$;
