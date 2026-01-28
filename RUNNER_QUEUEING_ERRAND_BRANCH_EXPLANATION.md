# Runner Queueing (Errands) — Branch-by-Branch Code Explanation

This file explains the code inside these two blocks in `app/buddyrunner/home.tsx`:

- **Block A (Initial assignment):**
  - `if (!errand.notified_runner_id) { ... }`
- **Block B (Timeout reassignment):**
  - `if (notifiedAt && notifiedAt < sixtySecondsAgo) { ... }`

Everything below is traced from the real code (no “expected behavior”).

---

## Where this code lives

- **File:** `app/buddyrunner/home.tsx`
- **Function:** `shouldShowErrand(errand: ErrandRowDB): Promise<boolean>`
- **Relevant line ranges (approx):**
  - **Time/timeout setup:** ~L1325–L1328
  - **Block A (Initial assignment):** ~L1331–L1547
  - **Block B (Timeout reassignment):** ~L1552–L1775
  - **Final visibility returns:** ~L1779–L1786

> Note: line numbers are based on the current workspace view (the file is large and may shift slightly as edits happen).

---

## Shared setup: “has 60 seconds passed?”

**File:** `app/buddyrunner/home.tsx`  
**Lines:** ~L1325–L1328

What it does:
- Creates timestamps used to decide whether the notified runner has “timed out”.

Key variables:
- `now`: current time
- `notifiedAt`: when the current `notified_runner_id` was set (or `null`)
- `sixtySecondsAgo`: `now - 60,000ms`

Effect:
- The code later checks `notifiedAt < sixtySecondsAgo` to decide if it should re-run the queue and move to the next runner.

---

## Block A — Initial Assignment (`if (!errand.notified_runner_id) { ... }`)

**File:** `app/buddyrunner/home.tsx`  
**Starts at:** ~L1331  
**Ends at:** ~L1547

This block is long because it runs the full pipeline to:
1) determine eligible runners,  
2) score them,  
3) pick the best runner,  
4) write the assignment into the database,  
5) return whether *this* runner should see the errand.

### A1 — Task “detected” logging

**Lines:** ~L1333–L1339

What it does:
- Computes friendly display values (`callerName`, `callerShortId`)
- Logs queue tracing messages:
  - `[QUEUE] STEP 1 — Task detected`
  - `Type: Errand`, `Task ID`, `Caller`, `Status`

Why it exists:
- Observability/debugging (not needed for correctness).

### A2 — Caller location lookup (hard gate)

**Lines:** ~L1341–L1346

Code behavior:
- Looks up caller location from the in-memory map built earlier in `refetch()`:
  - `callerLocations[errand.buddycaller_id]`
- If missing: returns `false`

Why it matters:
- Distance scoring requires caller coordinates; without it, this code refuses to rank/assign.

### A3 — Presence threshold setup (75 seconds)

**Lines:** ~L1349

Key variable:
- `seventyFiveSecondsAgo = now - 75,000ms`

Why 75 seconds:
- The runner heartbeat updates `last_seen_at` roughly every 60 seconds; 75s provides buffer.

### A4 — Count query (logging-only)

**Lines:** ~L1351–L1365

What it does:
- Builds `countQuery` against `users`:
  - filters: `role = BuddyRunner`, `is_available = true`
  - excludes IDs from `errand.timeout_runner_ids` (if present)
- Executes it to get `runnersBeforePresence`

Important detail:
- This count is used for logging comparison, not for ranking decisions directly.

### A5 — Fetch eligible runners (actual eligibility filters)

**Lines:** ~L1367–L1390

What it does:
- Builds `query` against `users` selecting:
  - `id, first_name, last_name, latitude, longitude, average_rating, location_updated_at`
- Eligibility filters used:
  - `.eq("role", "BuddyRunner")`
  - `.eq("is_available", true)`
  - `.gte("last_seen_at", seventyFiveSecondsAgo.toISOString())`
  - `.or("location_updated_at.gte.<threshold>,location_updated_at.is.null")`
- Excludes all IDs in `errand.timeout_runner_ids` (if present)
- Executes query → `availableRunners`

Why it exists:
- This is the **candidate set** for scoring/ranking.

Failure behavior:
- If query errors: logs error and returns `false`
- If `availableRunners` empty: returns `false`

### A6 — Distance filtering + scoring loop (per-runner)

**Lines:** ~L1412–L1482

What it does for each runner in `availableRunners`:
1. **Validate runner has coordinates** (`latitude`, `longitude`) and they parse to numbers  
2. **Compute runner↔caller distance** using `LocationService.calculateDistance(...)` (km), then convert to meters  
3. **Hard filter:** if distance > 500m → exclude runner  
4. **Compute distanceScore:**
   - `distanceScore = max(0, 1 - distanceMeters/500)`
5. **Fetch runner history for TF-IDF:**
   - `getRunnerErrandCategoryHistory(runner.id)` (async; DB call)
6. **Compute TF‑IDF cosine similarity:**
   - `calculateTFIDFCosineSimilarity(errandCategories, runnerHistory, runnerHistoryData.taskCategories, runnerHistoryData.totalTasks)`
7. **Compute ratingScore:**
   - `ratingScore = (average_rating || 0) / 5`
8. **Compute finalScore (weighted):**
   - `finalScore = distanceScore*0.40 + ratingScore*0.35 + tfidfScore*0.25`
9. Pushes runner + scores into `eligibleRunners`

Why it’s expensive:
- It performs per-runner work.
- `getRunnerErrandCategoryHistory(...)` is awaited inside the loop (serial DB calls).

### A7 — Guard: no eligible runners

**Lines:** ~L1486–L1489

If no runners within 500m (or no valid coordinates):
- returns `false`

### A8 — Score logging (debug)

**Lines:** ~L1491–L1500

What it does:
- Logs each candidate runner’s distance/rating/TF‑IDF/final score.

### A9 — Sort + pick top runner

**Lines:** ~L1502–L1526

What it does:
- Sorts `eligibleRunners`:
  - primary: `finalScore` descending
  - tiebreaker: `distance` ascending
- Picks `topRunner = eligibleRunners[0]`

### A10 — Assignment write (DB update via RPC helper)

**Lines:** ~L1532–L1538

What it does:
- Calls `updateErrandNotification(errand.id, topRunner.id, new Date().toISOString())`

What this represents:
- This is where the queue advances: the errand’s `notified_runner_id` is set in the database (plus timestamp).

### A11 — Visibility decision for current runner

**Lines:** ~L1540–L1547

What it does:
- If the chosen `topRunner.id === uid` → returns `true` (this runner should see the errand)
- Else → returns `false` (hide it from this runner because someone else is “currently notified”)

---

## Block B — Timeout Reassignment (`if (notifiedAt && notifiedAt < sixtySecondsAgo) { ... }`)

**File:** `app/buddyrunner/home.tsx`  
**Starts at:** ~L1552  
**Ends at:** ~L1775

This block is also long because it **re-runs the same scoring pipeline**, with extra exclusions, then assigns the next runner.

### B1 — Timeout detection logging

**Lines:** ~L1553–L1557

What it does:
- Logs `[QUEUE] STEP 7 — Timeout detected`
- Logs which runner timed out (short id)

### B2 — Caller location lookup (hard gate)

**Lines:** ~L1559–L1564

Same as initial assignment:
- If caller location missing → return `false`

### B3 — Reassignment “task detected” logging

**Lines:** ~L1566–L1573

Same logging as Block A, but marked as reassignment in comments.

### B4 — Eligible runner fetch with additional exclusions

**Lines:** ~L1575–L1619 (continues beyond snippet)

Key differences vs Block A:
- It excludes the previously notified runner:
  - `.neq("id", errand.notified_runner_id || "")`
- It also excludes all IDs in `timeout_runner_ids` (if present)
- Uses the same 75-second presence/location freshness gating.

Failure behavior:
- If no remaining runners: it calls `clearErrandNotification(errand.id)` then returns `false` (meaning queue is cleared and no runner is currently notified).

### B5 — Distance + TF‑IDF + scoring + ranking (repeat)

**Lines:** ~L1643 onward through ~L1747 (same structure as Block A)

What happens:
- Same 500m filtering
- Same scoring formula
- Same sort logic

### B6 — Reassign write (DB update via RPC helper)

**Lines:** ~L1759–L1766

What it does:
- Captures `previousNotifiedRunnerId = errand.notified_runner_id`
- Calls:
  - `updateErrandNotification(errand.id, nextRunner.id, new Date().toISOString(), previousNotifiedRunnerId)`

Meaning:
- Moves the queue forward and (in the RPC) can also add the previous runner to `timeout_runner_ids` (based on earlier comments in the file).

### B7 — Visibility decision for current runner

**Lines:** ~L1768–L1775

Same as Block A:
- If reassigned runner is current `uid` → return `true`
- Otherwise → return `false`

---

## After both blocks: “Just show/hide” checks (no scoring)

**File:** `app/buddyrunner/home.tsx`  
**Lines:** ~L1779–L1786

What it does:
- If `errand.notified_runner_id === uid` → return `true`
- Else → return `false`

No TF‑IDF, no ranking, no DB writes — just visibility.

