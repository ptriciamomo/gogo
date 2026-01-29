# Reassign Timed-Out Tasks Edge Function

## Purpose

Handles 60-second timeout reassignment for errands and commissions. When a runner ignores a task for 60+ seconds, this function automatically reassigns it to the next eligible runner using the same ranking logic as initial assignment.

## How It Works

1. **Scheduled Execution**: Runs every 10-15 seconds via Supabase cron
2. **Query Timed-Out Tasks**: Finds tasks where `notified_at < NOW() - 60 seconds`
3. **Rank Next Runner**: Uses same ranking algorithm as initial assignment:
   - Distance score (40%)
   - Rating score (35%)
   - TF-IDF similarity score (25%)
4. **Reassign**: Updates `notified_runner_id`, `notified_at`, `timeout_runner_ids`, `is_notified`
5. **Broadcast**: Sends notification to new runner's private channel

## Setup

### 1. Deploy the Function

```bash
supabase functions deploy reassign-timed-out-tasks
```

### 2. Configure Cron Schedule

In Supabase Dashboard → Database → Cron Jobs, create a new cron job:

```sql
-- Run every 10 seconds
SELECT cron.schedule(
  'reassign-timed-out-tasks',
  '*/10 * * * * *',  -- Every 10 seconds
  $$
  SELECT net.http_post(
    url := 'https://YOUR_PROJECT.supabase.co/functions/v1/reassign-timed-out-tasks',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
```

**Note**: Replace `YOUR_PROJECT` with your actual Supabase project reference.

### 3. Verify Execution

Check Edge Function logs in Supabase Dashboard to confirm the function runs every 10 seconds and processes timed-out tasks.

## Safety Features

- **Atomic Updates**: Uses `.eq('notified_runner_id', previousRunnerId)` to prevent race conditions
- **Idempotency Checks**: Verifies task state before processing
- **Batch Limiting**: Processes max 50 tasks per run to prevent function timeout
- **Error Handling**: Continues processing other tasks if one fails

## Guards Enforced

1. `status = 'pending'`
2. `runner_id IS NULL`
3. `notified_at < NOW() - 60 seconds`
4. `notified_at IS NOT NULL`
5. `notified_runner_id IS NOT NULL`
6. Excludes runners in `timeout_runner_ids`
7. Distance ≤ 500m
8. Presence rules (75s threshold for commissions)
9. `is_available = true`
10. Excludes `declined_runner_id` (commissions only)

## Behavior

- **If eligible runner found**: Reassigns and broadcasts notification
- **If no eligible runners**: Clears `notified_runner_id` and `notified_at` (no broadcast)
- **If task already accepted**: Skips (atomic guard prevents reassignment)

## Testing

To test manually (without waiting for cron):

```bash
curl -X POST https://YOUR_PROJECT.supabase.co/functions/v1/reassign-timed-out-tasks \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{}'
```
