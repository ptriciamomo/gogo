-- Migration: Create cron job for timeout reassignment
-- Purpose: Automatically trigger reassign-timed-out-tasks Edge Function every 60 seconds
-- This ensures timed-out runners are processed and the queue advances correctly
-- Backend is the single source of truth for timeout enforcement

-- Ensure required extensions are enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Drop existing cron job if it exists (for idempotency)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'reassign-timed-out-tasks-cron') THEN
    PERFORM cron.unschedule('reassign-timed-out-tasks-cron');
  END IF;
END $$;

-- Create cron job to call reassign-timed-out-tasks Edge Function every 60 seconds
-- Schedule: */60 * * * * * means every 60 seconds (requires Postgres 15.1.1.61+)
-- Uses Supabase Vault secrets: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
SELECT cron.schedule(
  'reassign-timed-out-tasks-cron',
  '*/60 * * * * *',  -- Every 60 seconds
  $$
  SELECT net.http_post(
    url := (vault.get_secret('SUPABASE_URL') || '/functions/v1/reassign-timed-out-tasks'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || vault.get_secret('SUPABASE_SERVICE_ROLE_KEY')
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Note: This migration requires the following secrets to be stored in Supabase Vault:
-- 1. SUPABASE_URL - Your Supabase project URL (e.g., 'https://YOUR_PROJECT.supabase.co')
-- 2. SUPABASE_SERVICE_ROLE_KEY - Your Supabase service role key
-- 
-- To create these secrets, use:
-- SELECT vault.create_secret('SUPABASE_URL', 'https://YOUR_PROJECT.supabase.co');
-- SELECT vault.create_secret('SUPABASE_SERVICE_ROLE_KEY', 'your_service_role_key_here');

-- Verify the cron job was created
SELECT 
  jobid,
  jobname,
  schedule,
  active,
  command
FROM cron.job
WHERE jobname = 'reassign-timed-out-tasks-cron';
