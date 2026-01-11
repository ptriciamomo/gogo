-- Add RPC functions for errand notification management (mirrors commission notification functions)
-- These functions bypass RLS using SECURITY DEFINER, allowing updates to notified_runner_id, notified_at, and timeout_runner_ids

-- Function to update errand notification
CREATE OR REPLACE FUNCTION public.update_errand_notification(
    p_errand_id bigint,
    p_notified_runner_id uuid,
    p_notified_at timestamptz,
    p_previous_notified_runner_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_current_timeout_ids uuid[] := ARRAY[]::uuid[];
BEGIN
    -- Get current timeout_runner_ids
    SELECT COALESCE(timeout_runner_ids, ARRAY[]::uuid[])
    INTO v_current_timeout_ids
    FROM public.errand
    WHERE id = p_errand_id;
    
    -- Add previous runner to timeout list if provided and not already in list
    IF p_previous_notified_runner_id IS NOT NULL THEN
        IF NOT (p_previous_notified_runner_id = ANY(v_current_timeout_ids)) THEN
            v_current_timeout_ids := array_append(v_current_timeout_ids, p_previous_notified_runner_id);
        END IF;
    END IF;
    
    -- Update errand with new notification info
    UPDATE public.errand
    SET 
        notified_runner_id = p_notified_runner_id,
        notified_at = p_notified_at,
        timeout_runner_ids = v_current_timeout_ids
    WHERE id = p_errand_id;
END;
$$;

-- Function to clear errand notification
CREATE OR REPLACE FUNCTION public.clear_errand_notification(
    p_errand_id bigint
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_current_notified_runner_id uuid;
    v_current_timeout_ids uuid[] := ARRAY[]::uuid[];
BEGIN
    -- Get current notified_runner_id and timeout_runner_ids
    SELECT notified_runner_id, COALESCE(timeout_runner_ids, ARRAY[]::uuid[])
    INTO v_current_notified_runner_id, v_current_timeout_ids
    FROM public.errand
    WHERE id = p_errand_id;
    
    -- Add current notified runner to timeout list before clearing (if exists and not already in list)
    IF v_current_notified_runner_id IS NOT NULL THEN
        IF NOT (v_current_notified_runner_id = ANY(v_current_timeout_ids)) THEN
            v_current_timeout_ids := array_append(v_current_timeout_ids, v_current_notified_runner_id);
        END IF;
    END IF;
    
    -- Clear notification
    UPDATE public.errand
    SET 
        notified_runner_id = NULL,
        notified_at = NULL,
        timeout_runner_ids = v_current_timeout_ids
    WHERE id = p_errand_id;
END;
$$;

-- Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION public.update_errand_notification(bigint, uuid, timestamptz, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.clear_errand_notification(bigint) TO authenticated;

