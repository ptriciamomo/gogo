# Runner Queueing, TF-IDF, and Distance Calculation Explanation

This document provides step-by-step explanations of three independent processes used in the runner assignment system:

1. **Runner Queueing Process** - How runners are queued and assigned to tasks
2. **TF-IDF Process** - How runner expertise is calculated using text similarity
3. **Distance Calculation Process** - How distances between locations are computed

---

## Section 1: Runner Queueing Process (Step-by-Step)

The runner queueing process ensures that when a task (errand or commission) is created, eligible runners are ranked once and stored in a queue. If the first runner times out, the system advances to the next runner in the queue without re-ranking.

### Files Involved:
- **Initial Assignment**: `supabase/functions/assign-errand/index.ts` (for errands) or `supabase/functions/assign-and-notify-commission/index.ts` (for commissions)
- **Timeout Handling**: `supabase/migrations/20260203000003_fix_errand_multi_runner_timeout.sql` (SQL function `process_timed_out_tasks()`)
- **Ranking Logic**: `supabase/functions/_shared/runner-ranking.ts`

---

### Step 1: Task Creation & Initial Assignment Request

**Description**: This is the entry point when a caller creates a task (errand or commission) and requests runner assignment. The system receives the task ID, validates authentication, and fetches the task from the database to verify it exists and check its current state. If a runner is already assigned, the function exits early to prevent duplicate assignments. TF-IDF and distance calculations are not used in this step.

**Code Reference**:
- **File**: `supabase/functions/assign-errand/index.ts`
- **Lines 24-40**: Function entry point and Supabase client initialization
- **Lines 43-62**: Authentication check (validates JWT token from request header)
- **Lines 64-78**: Request body parsing and validation
- **Lines 79-84**: Fetch errand from database
- **Lines 96-99**: Check if already assigned

**Exact Code**:

```typescript
// File: supabase/functions/assign-errand/index.ts
// Lines 24-40: Function entry point and Supabase client initialization

serve(async (req) => {
  console.log("[ASSIGN-ERRAND] ========== FUNCTION ENTERED ==========");
  console.log("[ASSIGN-ERRAND] Timestamp:", new Date().toISOString());
  console.log("[ASSIGN-ERRAND] Method:", req.method);
  console.log("[ASSIGN-ERRAND] URL:", req.url);
  
  // Handle OPTIONS preflight request
  if (req.method === "OPTIONS") {
    return corsResponse("", 200);
  }

  try {
    // Initialize Supabase client with service role key
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
```

```typescript
// File: supabase/functions/assign-errand/index.ts
// Lines 43-62: Authentication check

  const isTestMode =
    req.headers.get("x-test-mode") === "true" &&
    Deno.env.get("ENVIRONMENT") !== "production";

 
  if (!isTestMode) {
    const authHeader = req.headers.get("authorization");

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return corsResponse(JSON.stringify({ error: "Unauthorized" }), 401);
    }

    const token = authHeader.replace("Bearer ", "");

    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (!user || error) {
      return corsResponse(JSON.stringify({ error: "Unauthorized" }), 401);
    }
  }
```

```typescript
// File: supabase/functions/assign-errand/index.ts
// Lines 64-78: Request body parsing and validation

  try {
  
    const body = await req.json();
    const { errand_id } = body;


    console.log("[ASSIGN-ERRAND] ========== PROCESSING ERRAND ==========");
    console.log("[ASSIGN-ERRAND] ENTERED FUNCTION for errand_id:", errand_id);
    console.log("[ASSIGN-ERRAND] Request body parsed:", { errandId: errand_id });

    // Basic validation
    if (!errand_id) {
      return corsResponse(JSON.stringify({ error: "Missing errand_id" }), 400);
    }
```

```typescript
// File: supabase/functions/assign-errand/index.ts
// Lines 79-84: Fetch errand from database

    // STEP1: Fetch the errand 
const { data: errand, error } = await supabase
  .from("errand")
  .select("*")
  .eq("id", errand_id)
  .single();
```

```typescript
// File: supabase/functions/assign-errand/index.ts
// Lines 96-99: Check if already assigned

    // Check if errand is already assigned
if (errand.notified_runner_id !== null) {
  return corsResponse(JSON.stringify({ status: "already_assigned" }), 200);
}
```

---

### Step 2: Fetch Eligible Runners

**Description**: Queries the database to find all runners who are currently available and active. The system applies multiple filters: presence detection (75-second threshold for recent activity), availability check (runners must have `is_available = true`), role verification (only "BuddyRunner" role), and timeout exclusion (removes runners who already timed out on this task). TF-IDF and distance calculations are not used in this step.

**Code Reference**:
- **File**: `supabase/functions/assign-errand/index.ts`
- **Lines 101-110**: Define presence thresholds and query eligible runners
- **Lines 112-117**: Exclude timeout runners (if any)
- **Line 119**: Execute query

**Exact Code**:

```typescript
// File: supabase/functions/assign-errand/index.ts
// Lines 101-110: Define presence thresholds and query eligible runners

     // Step 2: Fetch eligible runners 
const seventyFiveSecondsAgo = new Date(Date.now() - 75 * 1000).toISOString();

let runnersQuery = supabase
  .from("users")
  .select("id, latitude, longitude, last_seen_at, location_updated_at, is_available, average_rating")
  .eq("role", "BuddyRunner")
  .eq("is_available", true)
  .gte("last_seen_at", seventyFiveSecondsAgo)
  .or(`location_updated_at.gte.${seventyFiveSecondsAgo},location_updated_at.is.null`);
```

```typescript
// File: supabase/functions/assign-errand/index.ts
// Lines 112-117: Exclude timeout runners (if any)

    // Exclude timeout runners if present 
if (errand.timeout_runner_ids && Array.isArray(errand.timeout_runner_ids) && errand.timeout_runner_ids.length > 0) {
  for (const timeoutRunnerId of errand.timeout_runner_ids) {
    runnersQuery = runnersQuery.neq("id", timeoutRunnerId);
  }
}
```

```typescript
// File: supabase/functions/assign-errand/index.ts
// Line 119: Execute query

    // Execute query to fetch eligible runners
const { data: runners, error: runnersError } = await runnersQuery;
```

---

### Step 3: Apply Distance Filter (≤ 500m)

**Description**: Calculates the distance between each eligible runner and the caller's location using the Haversine formula (see Section 3 for details on how distance calculation works). Only runners within 500 meters are kept for ranking. This is a hard filter - runners beyond 500m are completely excluded, not just penalized. The distance is calculated using the `calculateDistanceKm()` function, which returns kilometers that are then converted to meters for the 500m threshold check. TF-IDF is not used in this step.

**Code Reference**:
- **File**: `supabase/functions/assign-errand/index.ts`
- **Lines 191-196**: Fetch caller location
- **Lines 213-233**: Filter runners by distance (≤ 500m)
- **Function**: `calculateDistanceKm()` from `supabase/functions/_shared/runner-ranking.ts` (lines 5-23)

**Exact Code**:

```typescript
// File: supabase/functions/assign-errand/index.ts
// Lines 191-196: Fetch caller location

    // STep 3: Fetch caller location for distance calculation
const { data: callerData, error: callerError } = await supabase
  .from("users")
  .select("latitude, longitude")
  .eq("id", errand.buddycaller_id)
  .single();
```

```typescript
// File: supabase/functions/assign-errand/index.ts
// Lines 213-233: Filter runners by distance (≤ 500m)

    // Filter runners by distance (≤ 500m)
const filteredRunners = runners.filter((runner) => {
     
      if (!runner.latitude || !runner.longitude) {
        return false;
      }

      const lat = typeof runner.latitude === 'number' ? runner.latitude : parseFloat(String(runner.latitude || ''));
      const lon = typeof runner.longitude === 'number' ? runner.longitude : parseFloat(String(runner.longitude || ''));

      if (!lat || !lon || isNaN(lat) || isNaN(lon)) {
        return false;
      }

      // Calculate distance in meters
  const distanceKm = calculateDistanceKm(callerLat, callerLon, lat, lon);
  const distanceMeters = distanceKm * 1000;

      // Hard filter: exclude if distance > 500m 
      return distanceMeters <= 500;
});
```

---

### Step 4: Rank Runners

**Description**: This is the core ranking step where each eligible runner receives a composite score based on three factors: their distance from the caller (40% weight), their average rating (35% weight), and how relevant their task history is to the current task category using TF-IDF (25% weight). The distance calculation is used here to compute the distance score component. The TF-IDF process (see Section 2) is executed here to calculate runner expertise similarity. Runners are sorted by this composite score to create the assignment queue. This is the ONLY time runners are ranked - the ranked list becomes the queue stored in the database, preventing re-ranking on timeout.

**Code Reference**:
- **File**: `supabase/functions/assign-errand/index.ts` (calls `supabase/functions/_shared/runner-ranking.ts`)
- **Lines 313-317**: Normalize errand categories
- **Lines 319-336**: Call ranking function
- **File**: `supabase/functions/_shared/runner-ranking.ts`
- **Function**: `rankRunners()` (lines 137-205)
- **Lines 158-162**: Distance calculation for distance score
- **Lines 169-187**: TF-IDF calculation via `calculateTFIDFCosineSimilarity()`
- **Line 190**: Final weighted score calculation

**Exact Code**:

```typescript
// File: supabase/functions/assign-errand/index.ts
// Lines 313-317: Normalize errand categories

    // Step 4: Normalize errand categories for ranking (empty array allowed)
const errandCategories =
  errand.category && errand.category.trim().length > 0
    ? [errand.category.trim().toLowerCase()]
    : [];
```

```typescript
// File: supabase/functions/assign-errand/index.ts
// Lines 319-336: Call ranking function

    // QUEUE-BASED RANKING: Rank runners ONCE and store queue
    console.log(`[ASSIGN-ERRAND] Ranking ${filteredRunners.length} runners for errand ${errand.id}`);
const rankedRunners = await rankRunners(
  filteredRunners as RunnerForRanking[],
  errandCategories,
  callerLat,
  callerLon,
  async (runnerId: string) => {
    // Fetch runner category history for TF-IDF
    const { data: historyData } = await supabase
      .from("errand")
      .select("category")
      .eq("runner_id", runnerId)
      .eq("status", "completed");
    return historyData || [];
  }
);
```

```typescript
// File: supabase/functions/_shared/runner-ranking.ts
// Lines 137-205: rankRunners() function

export async function rankRunners(
  eligibleRunners: RunnerForRanking[],
  taskCategories: string[],
  callerLat: number,
  callerLon: number,
  fetchRunnerHistory: (runnerId: string) => Promise<{ category: string | null }[]>
): Promise<RankedRunner[]> {
  const rankedRunners: RankedRunner[] = [];

  for (const runner of eligibleRunners) {
    if (!runner.latitude || !runner.longitude) continue;

    const lat = typeof runner.latitude === 'number' ? runner.latitude : parseFloat(String(runner.latitude || ''));
    const lon = typeof runner.longitude === 'number' ? runner.longitude : parseFloat(String(runner.longitude || ''));

    if (!lat || !lon || isNaN(lat) || isNaN(lon)) continue;

    // Calculate distance in meters
    const distanceKm = calculateDistanceKm(callerLat, callerLon, lat, lon);
    const distanceMeters = distanceKm * 1000;

    // Distance score (40% weight)
    const distanceScore = Math.max(0, 1 - (distanceMeters / 500));

    // Rating score (35% weight)
    const ratingScore = (runner.average_rating || 0) / 5;
 
    // Step 10: TF-IDF score used in ranking
    // TF-IDF score (25% weight)
    let tfidfScore = 0;
    if (taskCategories.length > 0) {
      const historyData = await fetchRunnerHistory(runner.id);
      if (historyData && historyData.length > 0) {
        const totalTasks = historyData.length;
        const taskCategoriesArray: string[][] = [];
        historyData.forEach((task: any) => {
          if (!task.category) return;
          taskCategoriesArray.push([task.category.trim().toLowerCase()]);
        });
        const runnerHistory = taskCategoriesArray.flat();
        tfidfScore = calculateTFIDFCosineSimilarity(
          taskCategories,
          runnerHistory,
          taskCategoriesArray,
          totalTasks
        );
      }
    }

    // Step 10: Final weighted score
    const finalScore = (distanceScore * 0.40) + (ratingScore * 0.35) + (tfidfScore * 0.25);

    rankedRunners.push({
      id: runner.id,
      distance: distanceMeters,
      distanceScore: distanceScore,
      ratingScore: ratingScore,
      tfidfScore: tfidfScore,
      finalScore: finalScore,
    });
  }

  // Sort by final score (descending), then distance (ascending)
  rankedRunners.sort((a, b) => {
    if (b.finalScore !== a.finalScore) return b.finalScore - a.finalScore;
    return a.distance - b.distance;
  });

  return rankedRunners;
}
```

---

### Step 5: Store Queue in Database

**Description**: Persists the ranked runner queue to the database and assigns the first runner (index 0). This atomic database update stores the complete ranked list of runner IDs in the `ranked_runner_ids` array field, sets `notified_runner_id` to the top-ranked runner, sets `current_queue_index` to 0, and sets `notified_expires_at` to 60 seconds in the future. The queue is immutable - it's never re-ranked, only advanced on timeout. TF-IDF and distance calculations are not used in this step.

**Code Reference**:
- **File**: `supabase/functions/assign-errand/index.ts`
- **Lines 405-406**: Extract ranked runner IDs
- **Line 409**: Get top runner (index 0)
- **Lines 418-419**: Generate timestamps
- **Lines 486-499**: Store queue and assign first runner

**Exact Code**:

```typescript
// File: supabase/functions/assign-errand/index.ts
// Lines 405-406: Extract ranked runner IDs

    // Step 5: Extract runner IDs in ranked order for queue storage
const rankedRunnerIds = rankedRunners.map(r => r.id);
console.log(`[ASSIGN-ERRAND] Ranked runner IDs for errand ${errand.id}:`, rankedRunnerIds);
```

```typescript
// File: supabase/functions/assign-errand/index.ts
// Line 409: Get top runner (index 0)

    // Get top runner (index 0)
const topRunner = rankedRunners[0];
```

```typescript
// File: supabase/functions/assign-errand/index.ts
// Lines 418-419: Generate timestamps

    // Generate assignment timestamp and expiration (60 seconds from now)
const assignedAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 60 * 1000).toISOString();
```

```typescript
// File: supabase/functions/assign-errand/index.ts
// Lines 486-499: Store queue and assign first runner

    // Store queue and assign first runner
const { data: updateData, error: updateError } = await supabase
  .from("errand")
  .update({
        notified_runner_id: topRunner.id,
    notified_at: assignedAt,
        notified_expires_at: expiresAt,  // Set expiration 60 seconds from now
        ranked_runner_ids: rankedRunnerIds,  // Store complete queue
        current_queue_index: 0,  // Start at index 0
        timeout_runner_ids: updatedTimeoutRunnerIds,  
    is_notified: true,
  })
  .eq("id", errand.id)
  .is("notified_runner_id", null)
  .select();
```

---

### Step 6: Broadcast Notification to Runner

**Description**: Sends a real-time notification to the assigned runner's private Supabase channel. The runner's mobile app subscribes to this channel and receives the notification instantly, allowing them to see the task and accept or decline it. Each runner has a unique channel (`errand_notify_{runnerId}`), ensuring notifications are only sent to the intended recipient. TF-IDF and distance calculations are not used in this step.

**Code Reference**:
- **File**: `supabase/functions/assign-errand/index.ts`
- **Lines 540-559**: Send real-time notification

**Exact Code**:

```typescript
// File: supabase/functions/assign-errand/index.ts
// Lines 540-559: Send real-time notification

    // Step 6: Broadcast notification to assigned runner's 
const channelName = `errand_notify_${topRunner.id}`;
    console.log(`🔔 [EDGE FUNCTION] Broadcasting to channel: ${channelName}`);
    console.log(`🔔 [EDGE FUNCTION] Event name: errand_notification`);
    console.log(`🔔 [EDGE FUNCTION] Runner ID: ${topRunner.id}`);
    console.log(`🔔 [EDGE FUNCTION] Errand ID: ${errand.id}`);
    
const broadcastChannel = supabase.channel(channelName);

await broadcastChannel.send({
  type: 'broadcast',
  event: 'errand_notification',
  payload: {
    errand_id: errand.id,
    errand_title: errand.title,
    errand_category: errand.category,
    caller_id: errand.buddycaller_id,
    assigned_at: assignedAt,
  },
});
    
    console.log(`🔔 [EDGE FUNCTION] Broadcast sent to channel: ${channelName}`);
```

---

### Step 7: Timeout Detection

**Description**: A PostgreSQL function (`process_timed_out_tasks()`) runs periodically (via cron) to find tasks where the notified runner hasn't responded within 60 seconds. It uses row-level locking (`FOR UPDATE SKIP LOCKED`) to prevent concurrent processing of the same task. The function checks for expired notifications by comparing `notified_expires_at <= NOW()`. TF-IDF and distance calculations are not used in this step.

**Code Reference**:
- **File**: `supabase/migrations/20260203000003_fix_errand_multi_runner_timeout.sql`
- **Function**: `process_timed_out_tasks()`
- **Lines 59-79**: SQL function selects timed-out tasks

**Exact Code**:

```sql
-- File: supabase/migrations/20260203000003_fix_errand_multi_runner_timeout.sql
-- Lines 59-79: SQL function selects timed-out tasks

FOR errand_rec IN
  SELECT 
    id,
    title,
    buddycaller_id,
    notified_runner_id,
    ranked_runner_ids,
    current_queue_index,
    timeout_runner_ids,
    status,
    runner_id,
    notified_expires_at
  FROM errand
  WHERE status = 'pending'
    AND runner_id IS NULL
    AND notified_runner_id IS NOT NULL
    AND notified_expires_at IS NOT NULL
    AND notified_expires_at <= NOW()  -- ONLY place expiry is checked
  ORDER BY notified_expires_at ASC
  LIMIT 50
  FOR UPDATE SKIP LOCKED  -- Lock row to prevent concurrent modification
  LOOP
```

---

### Step 8: Queue Advancement

**Description**: When a runner times out, the system reads the stored queue from the database, increments the queue index, and either assigns the next runner or cancels the task if the queue is exhausted. This happens entirely in SQL for atomicity and performance. The system retrieves the stored `ranked_runner_ids` array and current index, increments `current_queue_index`, extracts the next runner ID from the array, and atomically updates the task to notify the next runner with a new 60-second timeout. TF-IDF and distance calculations are not used in this step.

**Code Reference**:
- **File**: `supabase/migrations/20260203000003_fix_errand_multi_runner_timeout.sql`
- **Function**: `process_timed_out_tasks()`
- **Lines 87-91**: Read queue state from locked row
- **Line 112**: Calculate next queue index
- **Lines 154-212**: Reassign to next runner if queue not exhausted
- **Lines 223-234**: Broadcast notification to new runner

**Exact Code**:

```sql
-- File: supabase/migrations/20260203000003_fix_errand_multi_runner_timeout.sql
-- Lines 87-91: Read queue state from locked row

      -- Read locked row values
errand_ranked_runner_ids := errand_rec.ranked_runner_ids;
errand_current_index := COALESCE(errand_rec.current_queue_index, 0);
errand_timeout_runner_ids := COALESCE(errand_rec.timeout_runner_ids, ARRAY[]::uuid[]);
      errand_queue_length := COALESCE(array_length(errand_ranked_runner_ids, 1), 0);
```

```sql
-- File: supabase/migrations/20260203000003_fix_errand_multi_runner_timeout.sql
-- Line 112: Calculate next queue index

      -- Advance queue index (0-based: current_index=0 means array[1] was notified)
errand_next_index := errand_current_index + 1;
```

```sql
-- File: supabase/migrations/20260203000003_fix_errand_multi_runner_timeout.sql
-- Lines 154-212: Reassign to next runner if queue not exhausted

      ELSE
        -- REASSIGN: Get next runner from queue
        -- Array is 1-based: next_index=1 means array[2] = ranked_runner_ids[next_index + 1]
        errand_next_runner_id := errand_ranked_runner_ids[errand_next_index + 1];
        
        IF errand_next_runner_id IS NULL THEN
          -- Next runner is NULL: cancel instead
UPDATE errand
SET 
  status = 'cancelled',
  notified_runner_id = NULL,
  notified_at = NULL,
  notified_expires_at = NULL,
  is_notified = FALSE,
  current_queue_index = errand_next_index,
  timeout_runner_ids = errand_updated_timeout_ids
WHERE id = errand_rec.id
  AND status = 'pending'
  AND runner_id IS NULL
RETURNING * INTO errand_updated;
          
          IF errand_updated.id IS NULL THEN
            RAISE EXCEPTION 'UPDATE failed for errand %: next runner NULL, cancel failed',
              errand_rec.id;
          END IF;
          
          RAISE NOTICE '[TIMEOUT] MUTATION errand % CANCELLED (next runner NULL, rows_updated=1)', errand_rec.id;
          errands_cancelled := errands_cancelled + 1;
          
          PERFORM pg_notify(
            'caller_notify_' || errand_rec.buddycaller_id,
            json_build_object(
              'type', 'broadcast',
              'event', 'task_cancelled',
              'payload', json_build_object(
                'task_id', errand_rec.id,
                'task_type', 'errand',
                'task_title', errand_rec.title,
                'reason', 'no_runners_available'
              )
            )::text
          );
  ELSE
    -- REASSIGN: Notify next runner
          -- FIX: Added idempotency guard to WHERE clause to prevent 0-row updates
          --      when notified_runner_id changes between SELECT and UPDATE
    UPDATE errand
    SET 
      notified_runner_id = errand_next_runner_id,
      notified_at = NOW(),
      notified_expires_at = NOW() + INTERVAL '60 seconds',
      current_queue_index = errand_next_index,
      timeout_runner_ids = errand_updated_timeout_ids,
      is_notified = TRUE
    WHERE id = errand_rec.id
      AND status = 'pending'
      AND runner_id IS NULL
            AND notified_runner_id = errand_rec.notified_runner_id
    RETURNING * INTO errand_updated;
```

```sql
-- File: supabase/migrations/20260203000003_fix_errand_multi_runner_timeout.sql
-- Lines 223-234: Broadcast notification to new runner

PERFORM pg_notify(
  'errand_notify_' || errand_next_runner_id,
  json_build_object(
    'type', 'broadcast',
    'event', 'errand_notification',
    'payload', json_build_object(
      'errand_id', errand_rec.id,
      'errand_title', errand_rec.title,
      'assigned_at', NOW()
    )
  )::text
);
```

**Exact Code — Timeout Runner Tracking**:

```sql
-- File: supabase/migrations/20260203000003_fix_errand_multi_runner_timeout.sql
-- Lines 93-106: Append current runner to timeout list (for audit)

      -- Append current notified_runner_id to timeout_runner_ids (idempotent)
      errand_updated_timeout_ids := errand_timeout_runner_ids;
      IF errand_rec.notified_runner_id IS NOT NULL THEN
        IF NOT (errand_rec.notified_runner_id::uuid = ANY(errand_updated_timeout_ids)) THEN
          errand_updated_timeout_ids := array_append(errand_updated_timeout_ids, errand_rec.notified_runner_id::uuid);
          RAISE NOTICE '[TIMEOUT] Appended runner % to errand % timeout list. New list: %', 
            errand_rec.notified_runner_id, errand_rec.id, errand_updated_timeout_ids;
        ELSE
          RAISE NOTICE '[TIMEOUT] Runner % already in errand % timeout list (idempotent skip)', 
            errand_rec.notified_runner_id, errand_rec.id;
        END IF;
      ELSE
        RAISE WARNING '[TIMEOUT] Errand % has NULL notified_runner_id, cannot append to timeout list', errand_rec.id;
      END IF;
```

---

### Step 9: Queue Exhaustion

**Description**: If the queue is exhausted (no more runners available), the task is cancelled. The system determines queue exhaustion by checking if `current_queue_index + 1 >= queue_length` or if the queue is empty. When exhausted, all notification fields are cleared, the task status is set to 'cancelled', and the caller is notified via `pg_notify`. TF-IDF and distance calculations are not used in this step.

**Code Reference**:
- **File**: `supabase/migrations/20260203000003_fix_errand_multi_runner_timeout.sql`
- **Function**: `process_timed_out_tasks()`
- **Line 117**: Check if queue is exhausted
- **Lines 119-131**: Cancel task if queue exhausted

**Exact Code**:

```sql
-- File: supabase/migrations/20260203000003_fix_errand_multi_runner_timeout.sql
-- Line 117: Check if queue is exhausted

      -- Determine if queue is exhausted
      -- Queue exhausted when: no queue OR next_index >= queue_length
      -- (next_index is 0-based, queue_length is count of 1-based array elements)
      IF errand_queue_length = 0 OR errand_next_index >= errand_queue_length THEN
```

```sql
-- File: supabase/migrations/20260203000003_fix_errand_multi_runner_timeout.sql
-- Lines 119-131: Cancel task if queue exhausted

        -- CANCEL: Queue exhausted
        UPDATE errand
        SET 
          status = 'cancelled',
          notified_runner_id = NULL,
          notified_at = NULL,
          notified_expires_at = NULL,
          is_notified = FALSE,
          current_queue_index = errand_next_index,
          timeout_runner_ids = errand_updated_timeout_ids
        WHERE id = errand_rec.id
          AND status = 'pending'
          AND runner_id IS NULL
        RETURNING * INTO errand_updated;
```

---

## Section 2: TF-IDF Process (Step-by-Step)

TF-IDF (Term Frequency-Inverse Document Frequency) is used to calculate how relevant a runner's task history is to the current task category. The TF-IDF process is executed within Step 4 of the Runner Queueing Process, where it contributes 25% weight to the final ranking score.

### Files Involved:
- **Shared Module**: `supabase/functions/_shared/runner-ranking.ts` (production code)
- **Client-Side**: `app/buddyrunner/home.tsx` (detailed logging version, lines 708-984)

---

### Step 1: Collect Task Category

**Description**: Extracts and normalizes the current task's category. The category is trimmed of whitespace and converted to lowercase for consistent matching. If no category exists, an empty array is used, which will result in a TF-IDF score of 0 (but distance and rating scores still apply).

**Code Reference**:
- **File**: `supabase/functions/_shared/runner-ranking.ts`
- **Function**: `calculateTFIDFCosineSimilarity()`
- **Line 101**: Normalize task categories

**Exact Code**:

```typescript
// File: supabase/functions/_shared/runner-ranking.ts
// Line 101: Normalize task categories

  const queryDoc = taskCategories.map(cat => cat.toLowerCase().trim()).filter(cat => cat.length > 0);
```

---

### Step 2: Collect Runner Task History

**Description**: Fetches the runner's completed task history from the database. For each completed task, extracts the category and normalizes it (trimmed, lowercase). The history is transformed into two formats: a 2D array for task-based TF calculation (preferred) and a flat array for token-based TF calculation (fallback).

**Code Reference**:
- **File**: `supabase/functions/_shared/runner-ranking.ts`
- **Function**: `rankRunners()`
- **Lines 169-187**: Fetch and transform runner history

**Exact Code**:

```typescript
// File: supabase/functions/_shared/runner-ranking.ts
// Lines 167-179: Fetch and transform runner history

    // Step 10: TF-IDF score used in ranking
    // TF-IDF score (25% weight)
    let tfidfScore = 0;
    if (taskCategories.length > 0) {
      const historyData = await fetchRunnerHistory(runner.id);
      if (historyData && historyData.length > 0) {
        const totalTasks = historyData.length;
        const taskCategoriesArray: string[][] = [];
        historyData.forEach((task: any) => {
          if (!task.category) return;
          taskCategoriesArray.push([task.category.trim().toLowerCase()]);
        });
        const runnerHistory = taskCategoriesArray.flat();
```

---

### Step 3: Calculate Term Frequency (Token-Based)

**Description**: Counts how many times a specific category term appears in a document (list of categories) and divides by the total number of terms. This measures how frequently a category appears relative to all categories. The empty document check prevents division by zero. This method counts individual category occurrences, so if a runner has completed 10 "grocery" tasks, each "grocery" token is counted separately.

**Code Reference**:
- **File**: `supabase/functions/_shared/runner-ranking.ts`
- **Function**: `calculateTF()`
- **Lines 26-30**: Token-based TF calculation

**Formula**: `TF(term) = (number of times term appears in document) / (total terms in document)`
 exact formula in code: return termCount / document.length; // exact formula in the code

**Exact Code**:

```typescript
// File: supabase/functions/_shared/runner-ranking.ts
// Lines 26-30: Token-based TF calculation

// Step 1: Calculate Term Frequency 
function calculateTF(term: string, document: string[]): number {
  if (document.length === 0) return 0;
  const termCount = document.filter(word => word === term).length;
  return termCount / document.length; // exact formula in the code
}
```

---

### Step 4: Calculate Term Frequency (Task-Based)

**Description**: Instead of counting category tokens, this method counts how many tasks contain a specific category. This is the preferred method because it measures task-level experience rather than token frequency. Each task is treated as a unit - if a task has category "grocery", it counts as 1 task with that category. This better reflects a runner's experience: a runner who completed 6 grocery tasks out of 10 has 60% grocery experience.

**Code Reference**:
- **File**: `supabase/functions/_shared/runner-ranking.ts`
- **Function**: `calculateTFWithTaskCount()`
- **Lines 32-38**: Task-based TF calculation

**Formula**: `TF(term) = (number of tasks containing term) / (total tasks)`
exact formula in code: tasksWithCategory / totalTasks;

**Exact Code**:

```typescript
// File: supabase/functions/_shared/runner-ranking.ts
// Lines 32-38: Task-based TF calculation

// Step 2: TF Calculation (Task-Based)
function calculateTFWithTaskCount(term: string, taskCategories: string[][], totalTasks: number): number {
  if (totalTasks === 0) return 0;
  const tasksWithCategory = taskCategories.filter(taskCats => 
    taskCats.some(cat => cat === term.toLowerCase())
  ).length;
  return tasksWithCategory / totalTasks;
}
```

---

### Step 5: Calculate Document Frequency (DF)

**Description**: Counts how many documents in the corpus contain a specific term. This is the first part of calculating IDF (Inverse Document Frequency), which measures how rare or common a term is across all documents. Each document counts as 1 if it contains the term, regardless of how many times the term appears in that document. Terms that appear in fewer documents are more distinctive.

**Code Reference**:
- **File**: `supabase/functions/_shared/runner-ranking.ts`
- **Function**: `calculateIDFAdjusted()`
- **Line 42**: Document Frequency (DF) calculation

**Formula**: `DF(term) = number of documents containing term`
Exact formula in code: 
**Exact Code**: allDocuments.filter(doc => doc.includes(term)).length

```typescript
// File: supabase/functions/_shared/runner-ranking.ts
// Lines 41-42: Document Frequency (DF) calculation

// Step 3 & 4: Calculate Document Frequency & Inverse Document Frequency
function calculateIDFAdjusted(term: string, allDocuments: string[][]): number {
  const documentsContainingTerm = allDocuments.filter(doc => doc.includes(term)).length;
```

---

### Step 6: Calculate Inverse Document Frequency (IDF)

**Description**: Takes the Document Frequency (DF) and inverts it using a logarithmic scale. Terms that appear in fewer documents get higher IDF scores, making them more important for matching. IDF is inversely proportional to DF - rare terms get high IDF, common terms get low IDF. The natural logarithm compresses the scale, preventing extremely rare terms from dominating. If a term appears in all documents, smoothing returns 0.1 instead of 0 to prevent the term from being completely ignored.

**Code Reference**:
- **File**: `supabase/functions/_shared/runner-ranking.ts`
- **Function**: `calculateIDFAdjusted()`
- **Lines 43-45**: IDF calculation with smoothing

**Formula**: `IDF(term) = log(total documents / documents containing term)`
Exact formula in code:  Math.log(allDocuments.length / documentsContainingTerm); 

example: 
Math.log(allDocuments.length / documentsContainingTerm)
= Math.log(2 / 1)
= Math.log(2)
≈ 0.693

**Exact Code**:

```typescript
// File: supabase/functions/_shared/runner-ranking.ts
// Lines 43-45: IDF calculation with smoothing

  if (documentsContainingTerm === 0) return 0;
  if (documentsContainingTerm === allDocuments.length) return 0.1; //Step 6: Apply IDF Smoothing
  return Math.log(allDocuments.length / documentsContainingTerm); // Step 4: IDF
}


---

### Step 7: Build Document Corpus

**Description**: Combines the query document (current task categories) and runner document (runner's task history) into a corpus. This corpus is used to calculate IDF values that are relative to both documents. IDF values are calculated relative to this specific corpus, not a global database, making the scores context-aware - a term's rarity is measured against the current task and runner being compared.

**Code Reference**:
- **File**: `supabase/functions/_shared/runner-ranking.ts`
- **Function**: `calculateTFIDFCosineSimilarity()`
- **Line 107**: Create corpus from query and runner documents

**Exact Code**:

```typescript
// File: supabase/functions/_shared/runner-ranking.ts
// Line 107: Create corpus from query and runner documents

  // Step 5: Build Document Corpus
  const allDocuments = [queryDoc, runnerDoc];
```

---

### Step 8: Construct TF-IDF Vector for Query Document

**Description**: Creates a vector (map) where each unique term in the query document has a TF-IDF weight. This vector represents the query document in a mathematical space where terms are weighted by both frequency (TF) and distinctiveness (IDF). Terms with high TF (frequent in query) and high IDF (rare in corpus) get the highest weights. Only includes terms that appear in the query document, creating a sparse vector.

**Code Reference**:
- **File**: `supabase/functions/_shared/runner-ranking.ts`
- **Function**: `calculateTFIDFVectorAdjusted()`
- **Lines 49-58**: Build query vector

**Formula**: `TF-IDF(term) = TF(term) × IDF(term)`

**Exact Code**:  const tf = calculateTF(term, document);
    const idf = calculateIDFAdjusted(term, allDocuments);
    tfidfMap.set(term, tf * idf);

```typescript
// File: supabase/functions/_shared/runner-ranking.ts
// Lines 49-58: Build query vector

//  Step 7: Construct TF-IDF Vector for Query Document 
// Build query vector
function calculateTFIDFVectorAdjusted(document: string[], allDocuments: string[][]): Map<string, number> {
  const uniqueTerms = Array.from(new Set(document));
  const tfidfMap = new Map<string, number>();
  uniqueTerms.forEach(term => {
    const tf = calculateTF(term, document);
    const idf = calculateIDFAdjusted(term, allDocuments);
    tfidfMap.set(term, tf * idf);
  });
  return tfidfMap;
}
```

---

### Step 9: Construct TF-IDF Vector for Runner Document

**Description**: Creates a TF-IDF vector for the runner's task history, similar to Step 8 but using task-based TF calculation when available (preferred method). This vector represents the runner's experience profile in the same mathematical space as the query vector. If task-level data isn't available, falls back to token-based TF calculation for backward compatibility. Uses the same corpus and IDF values as the query vector, ensuring both vectors are in the same space for meaningful comparison.

**Code Reference**:
- **File**: `supabase/functions/_shared/runner-ranking.ts`
- **Function**: `calculateTFIDFVectorWithTaskCount()` or `calculateTFIDFVectorAdjusted()`
- **Lines 60-72**: Build runner vector (prefers task-based TF)
- **Lines 110-115**: Choose vector calculation method

**Exact Code**:

```typescript
// File: supabase/functions/_shared/runner-ranking.ts
// Lines 59-73: Build runner vector (prefers task-based TF)

// Step 8: Construct TF-IDF Vector for Runner Document
// Build runner vector (prefers task-based TF)
function calculateTFIDFVectorWithTaskCount(taskCategories: string[][], totalTasks: number, allDocuments: string[][]): Map<string, number> {
  const allTerms = new Set<string>();
  taskCategories.forEach(taskCats => {
    taskCats.forEach(cat => allTerms.add(cat.toLowerCase()));
  });
  const tfidfMap = new Map<string, number>();
  allTerms.forEach(term => {
    const tf = calculateTFWithTaskCount(term, taskCategories, totalTasks);
    const idf = calculateIDFAdjusted(term, allDocuments);
    tfidfMap.set(term, tf * idf);
  });
  return tfidfMap;
}
```

```typescript
// File: supabase/functions/_shared/runner-ranking.ts
// Lines 110-115: Choose vector calculation method

  // Step 8: Choose vector calculation method
let runnerVector: Map<string, number>;
if (runnerTaskCategories.length > 0 && runnerTotalTasks > 0) {
  runnerVector = calculateTFIDFVectorWithTaskCount(runnerTaskCategories, runnerTotalTasks, allDocuments);
} else {
  runnerVector = calculateTFIDFVectorAdjusted(runnerDoc, allDocuments);
}
```

---

### Step 10: Calculate Cosine Similarity

**Description**: Measures the cosine of the angle between the query vector and runner vector in multi-dimensional space. This gives a similarity score between 0 (completely different) and 1 (identical direction). Cosine similarity is preferred over Euclidean distance because it's normalized and measures direction (relevance) rather than magnitude (size). The calculation involves computing the dot product of the two vectors and dividing by the product of their magnitudes.

**Code Reference**:
- **File**: `supabase/functions/_shared/runner-ranking.ts`
- **Function**: `cosineSimilarity()`
- **Lines 75-90**: Cosine similarity calculation

**Formula**: `cosine_similarity = (v1 · v2) / (||v1|| × ||v2||)`

**Exact Code**:

```typescript
// File: supabase/functions/_shared/runner-ranking.ts
// Lines 75-90: Cosine similarity calculation

// Step 9: Calculate Cosine Similarity
function cosineSimilarity(vector1: Map<string, number>, vector2: Map<string, number>): number {
  const allTerms = Array.from(new Set([...vector1.keys(), ...vector2.keys()]));
  let dotProduct = 0;
  let magnitude1 = 0;
  let magnitude2 = 0;
  allTerms.forEach(term => {
    const val1 = vector1.get(term) || 0;
    const val2 = vector2.get(term) || 0;
    dotProduct += val1 * val2;
    magnitude1 += val1 * val1;
    magnitude2 += val2 * val2;
  });
  const denominator = Math.sqrt(magnitude1) * Math.sqrt(magnitude2);
  if (denominator === 0) return 0;
  return dotProduct / denominator;
}
```

---

### Step 11: Integration into Runner Ranking

**Description**: The TF-IDF cosine similarity score (0-1 range) is integrated into the overall runner ranking system. It's combined with distance and rating scores using weighted averaging to produce a final ranking score. The TF-IDF score receives 25% weight in the final calculation, with distance at 40% and rating at 35%. This weighted sum ensures tasks go to runners who are not just close, but also reliable and experienced with similar tasks.

**Code Reference**:
- **File**: `supabase/functions/_shared/runner-ranking.ts`
- **Function**: `calculateTFIDFCosineSimilarity()`
- **Lines 92-118**: Main TF-IDF calculation function
- **File**: `supabase/functions/_shared/runner-ranking.ts`
- **Function**: `rankRunners()`
- **Lines 169-187**: TF-IDF score calculation
- **Line 190**: Final weighted score combining distance (40%), rating (35%), and TF-IDF (25%)

**Exact Code**:

```typescript
// File: supabase/functions/_shared/runner-ranking.ts
// Lines 92-118: Main TF-IDF calculation function

// Step 10: // Main TF-IDF calculation function
function calculateTFIDFCosineSimilarity(
  taskCategories: string[],
  runnerHistory: string[],
  runnerTaskCategories: string[][] = [],
  runnerTotalTasks: number = 0
): number {
  if (taskCategories.length === 0 || runnerHistory.length === 0) {
    return 0;
  }
  const queryDoc = taskCategories.map(cat => cat.toLowerCase().trim()).filter(cat => cat.length > 0);
  const runnerDoc = runnerHistory.map(cat => cat.toLowerCase().trim()).filter(cat => cat.length > 0);
  if (queryDoc.length === 0 || runnerDoc.length === 0) {
    return 0;
  }
  // Step 5: Build Document Corpus
  const allDocuments = [queryDoc, runnerDoc];
  const queryVector = calculateTFIDFVectorAdjusted(queryDoc, allDocuments);
  // Step 8: Choose vector calculation method
  let runnerVector: Map<string, number>;
  if (runnerTaskCategories.length > 0 && runnerTotalTasks > 0) {
    runnerVector = calculateTFIDFVectorWithTaskCount(runnerTaskCategories, runnerTotalTasks, allDocuments);
  } else {
    runnerVector = calculateTFIDFVectorAdjusted(runnerDoc, allDocuments);
  }
  const similarity = cosineSimilarity(queryVector, runnerVector);
  return isNaN(similarity) ? 0 : similarity;
}
```

```typescript
// File: supabase/functions/_shared/runner-ranking.ts
// Lines 169-190: TF-IDF score calculation and final weighted score

    // Step 10: TF-IDF score used in ranking
    // TF-IDF score (25% weight)
let tfidfScore = 0;
if (taskCategories.length > 0) {
  const historyData = await fetchRunnerHistory(runner.id);
  if (historyData && historyData.length > 0) {
    const totalTasks = historyData.length;
    const taskCategoriesArray: string[][] = [];
    historyData.forEach((task: any) => {
      if (!task.category) return;
      taskCategoriesArray.push([task.category.trim().toLowerCase()]);
    });
    const runnerHistory = taskCategoriesArray.flat();
    tfidfScore = calculateTFIDFCosineSimilarity(
      taskCategories,
      runnerHistory,
      taskCategoriesArray,
      totalTasks
    );
  }
}

    // Step 10: Final weighted score
    const finalScore = (distanceScore * 0.40) + (ratingScore * 0.35) + (tfidfScore * 0.25);
```

---

## Section 3: Distance Calculation Process (Step-by-Step)

The distance between a runner and a caller is calculated using the Haversine formula, which computes the great-circle distance between two points on Earth's surface. This provides accurate distance measurements that account for Earth's curvature, making it more accurate than simple Euclidean distance for GPS coordinates.

### Files Involved:
- **Shared Module**: `supabase/functions/_shared/runner-ranking.ts`

---

### Step 1: Obtain Coordinates

**Description**: Retrieves the latitude and longitude coordinates for both the caller and the runner. The caller's coordinates are fetched from the database using the caller's user ID. The runner's coordinates are already available from the eligible runners query. Both coordinates must be valid numbers (not null, not NaN) for the calculation to proceed.

**Code Reference**:
- **File**: `supabase/functions/assign-errand/index.ts`
- **Lines 191-196**: Fetch caller location
- **File**: `supabase/functions/_shared/runner-ranking.ts`
- **Function**: `calculateDistanceKm()`
- **Parameters**: `lat1, lon1` (caller), `lat2, lon2` (runner)

**Exact Code**:

```typescript
// File: supabase/functions/assign-errand/index.ts
// Lines 191-196: Fetch caller location

    // STep 3: Fetch caller location for distance calculation
    const { data: callerData, error: callerError } = await supabase
      .from("users")
      .select("latitude, longitude")
      .eq("id", errand.buddycaller_id)
      .single();
```

```typescript
// File: supabase/functions/_shared/runner-ranking.ts
// Lines 5-10: calculateDistanceKm() function signature

// Haversine distance calculation (km)
export function calculateDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
```

---

### Step 2: Convert Degrees to Radians

**Description**: GPS coordinates are stored in degrees, but trigonometric functions require radians. Converts the latitude and longitude differences to radians by multiplying by π/180. This conversion is necessary because the Haversine formula uses trigonometric functions (sine, cosine) which operate on radians.

**Code Reference**:
- **File**: `supabase/functions/_shared/runner-ranking.ts`
- **Function**: `calculateDistanceKm()`
- **Line 12**: Convert degrees to radians helper function
- **Lines 13-14**: Calculate latitude and longitude differences in radians

**Formula**: `radians = degrees × (π / 180)`

**Exact Code**:

```typescript
// File: supabase/functions/_shared/runner-ranking.ts
// Lines 12-14: Convert degrees to radians

  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
```

---

### Step 3: Apply Haversine Formula - Calculate Intermediate Value

**Description**: Calculates an intermediate value (a) that represents the square of half the chord length between the two points. This involves computing the sine of half the latitude difference, the sine of half the longitude difference, and the cosine of both latitudes. The formula combines these values to account for Earth's curvature.

**Code Reference**:
- **File**: `supabase/functions/_shared/runner-ranking.ts`
- **Function**: `calculateDistanceKm()`
- **Lines 15-20**: Calculate intermediate value (a)

**Formula**: `a = sin²(Δlat/2) + cos(lat1) × cos(lat2) × sin²(Δlon/2)`

**Exact Code**:

```typescript
// File: supabase/functions/_shared/runner-ranking.ts
// Lines 15-20: Calculate intermediate value (a)

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
```

---

### Step 4: Calculate Angular Distance

**Description**: Calculates the central angle (c) between the two points in radians using the intermediate value from Step 3. This uses the `atan2` function to compute the angular distance, which represents the angle between the two points as seen from the center of the Earth.

**Code Reference**:
- **File**: `supabase/functions/_shared/runner-ranking.ts`
- **Function**: `calculateDistanceKm()`
- **Line 21**: Calculate angular distance

**Formula**: `c = 2 × atan2(√a, √(1-a))`

**Exact Code**:

```typescript
// File: supabase/functions/_shared/runner-ranking.ts
// Line 21: Calculate angular distance

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
```

---

### Step 5: Compute Distance in Kilometers

**Description**: Multiplies the angular distance by Earth's radius (6,371 km) to get the actual distance in kilometers. Earth's radius is a constant that represents the average radius of the Earth, accounting for its slightly ellipsoidal shape. The result is the great-circle distance between the two points along Earth's surface.

**Code Reference**:
- **File**: `supabase/functions/_shared/runner-ranking.ts`
- **Function**: `calculateDistanceKm()`
- **Line 11**: Earth radius constant (6,371 km)
- **Line 22**: Calculate distance in kilometers

**Formula**: `distance = R × c` where `R = 6371 km`

**Exact Code**:

```typescript
// File: supabase/functions/_shared/runner-ranking.ts
// Lines 11, 22: Earth radius constant and distance calculation

  const R = 6371; // Earth radius in km
  // ... (intermediate calculations) ...
  return R * c;
```

---

### Step 6: Convert Distance to Meters and Use in Filtering and Ranking

**Description**: Converts the distance from kilometers to meters by multiplying by 1000. This converted distance is then used in two places: (1) In Step 3 of the Runner Queueing Process, it's compared against the 500m threshold for hard filtering. (2) In Step 4 of the Runner Queueing Process, it's used to calculate the distance score component (40% weight) of the ranking, where closer runners get higher scores using the formula: `distanceScore = max(0, 1 - (distanceMeters / 500))`.

**Code Reference**:
- **File**: `supabase/functions/assign-errand/index.ts`
- **Line 228**: Distance calculation and conversion to meters for filtering
- **File**: `supabase/functions/_shared/runner-ranking.ts`
- **Line 158**: Distance calculation for ranking
- **Line 159**: Distance score calculation

**Formula**: `distanceMeters = distanceKm × 1000`
**Formula**: `distanceScore = max(0, 1 - (distanceMeters / 500))`

**Exact Code**:

```typescript
// File: supabase/functions/assign-errand/index.ts
// Lines 228-229: Distance calculation and conversion to meters for filtering

      // Calculate distance in meters
      const distanceKm = calculateDistanceKm(callerLat, callerLon, lat, lon);
      const distanceMeters = distanceKm * 1000;
```

```typescript
// File: supabase/functions/_shared/runner-ranking.ts
// Lines 158-162: Distance calculation for ranking and distance score

    // Calculate distance in meters
    const distanceKm = calculateDistanceKm(callerLat, callerLon, lat, lon);
    const distanceMeters = distanceKm * 1000;

    // Distance score (40% weight)
    const distanceScore = Math.max(0, 1 - (distanceMeters / 500));
```

---

### Full Distance Function Implementation

**Description**: This shows the complete implementation of the Haversine distance calculation function used throughout the runner assignment system. The function calculates the great-circle distance between two points on Earth's surface using the Haversine formula, accounting for Earth's curvature to provide accurate distance measurements for GPS coordinates.

**Code Reference**:
- **File**: `supabase/functions/_shared/runner-ranking.ts`
- **Function**: `calculateDistanceKm()`
- **Lines**: 5-23

**Exact Code**:

```typescript
// File: supabase/functions/_shared/runner-ranking.ts
// Lines 5-23: Complete calculateDistanceKm() function implementation

// Haversine distance calculation (km)
export function calculateDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Earth radius in km
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
```

---

## Summary

### Runner Queueing Process:
1. Task creation and validation
2. Fetch eligible runners
3. Apply distance filter (≤ 500m)
4. Rank runners (using distance, rating, and TF-IDF)
5. Store queue in database
6. Broadcast notification
7. Timeout detection
8. Queue advancement
9. Queue exhaustion handling

### TF-IDF Process:
1. Collect task category
2. Collect runner task history
3. Calculate term frequency (token-based)
4. Calculate term frequency (task-based)
5. Calculate document frequency
6. Calculate inverse document frequency
7. Build document corpus
8. Construct query TF-IDF vector
9. Construct runner TF-IDF vector
10. Calculate cosine similarity
11. Integration into runner ranking

### Distance Calculation Process:
1. Obtain coordinates
2. Convert degrees to radians
3. Apply Haversine formula (intermediate value)
4. Calculate angular distance
5. Compute distance in kilometers
6. Convert to meters and use in filtering/ranking
