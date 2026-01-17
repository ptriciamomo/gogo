# Runner Queueing Process - Step Documentation

## Overview
This document maps all steps in the runner queueing process with exact file locations and line numbers. All comments have been added to the codebase at the specified locations.

## Queueing Flow Steps

### Step 1 – Resolve runner location
**File:** `app/buddyrunner/home.tsx`  
**Lines:** 1070-1132  
**Comment to add:**
```typescript
// STEP 1: Resolve runner location (GPS with retries -> DB fallback)
// Purpose: Get current runner location for distance calculations. Tries GPS first with up to 3 retries, falls back to database-stored location if GPS fails.
```

### Step 2 – Fetch pending errands
**File:** `app/buddyrunner/home.tsx`  
**Lines:** 1131-1143  
**Comment to add:**
```typescript
// STEP 2: Fetch pending errands
// Purpose: Query all pending errands that haven't been assigned to a runner yet, ordered by creation time (newest first).
```

### Step 3 – Fetch caller names and locations
**File:** `app/buddyrunner/home.tsx`  
**Lines:** 1145-1165  
**Comment to add:**
```typescript
// STEP 3: Fetch caller names and locations
// Purpose: Get caller location data needed for distance calculations. Extracts unique caller IDs and fetches their coordinates from users table.
```

### Step 4 – Pre-ranking distance filtering
**File:** `app/buddyrunner/home.tsx`  
**Lines:** 1167-1186  
**Comment to add:**
```typescript
// STEP 4: Pre-ranking distance filtering
// Purpose: Filter errands to only those within 500 meters of the runner before ranking. Uses Haversine formula to calculate distance between runner and caller locations.
```

### Step 5 – Fetch available runners with presence and availability filters
**File:** `app/buddyrunner/home.tsx`  
**Lines:** 1307-1346  
**Comment to add:**
```typescript
// STEP 5: Fetch available runners with presence and availability filters
// Purpose: Query all runners who are available, have been active recently (2 min app presence, 90 sec GPS), and exclude any runners who have already timed out for this errand.
```

### Step 6 – Distance filtering and scoring for each runner
**File:** `app/buddyrunner/home.tsx`  
**Lines:** 1373-1437  
**Comment to add:**
```typescript
// STEP 6: Distance filtering and scoring for each runner
// Purpose: For each available runner, calculate distance to caller, filter out runners beyond 500m, then calculate distance score, TF-IDF score, rating score, and final weighted score.
```

#### Step 6A – Calculate distance between runner and caller
**File:** `app/buddyrunner/home.tsx`  
**Lines:** 1388-1396  
**Comment to add:**
```typescript
// STEP 6A: Calculate distance between runner and caller
// Purpose: Uses Haversine formula to compute distance in kilometers, then converts to meters for comparison against 500m threshold.
```

#### Step 6B – Calculate distance score
**File:** `app/buddyrunner/home.tsx`  
**Lines:** 1410-1412  
**Comment to add:**
```typescript
// STEP 6B: Calculate distance score
// Purpose: Normalize distance to 0-1 scale where 0m = 1.0 (best) and 500m = 0.0 (worst). Used as 40% weight in final score.
```

#### Step 6C – Fetch runner category history for TF-IDF calculation
**File:** `app/buddyrunner/home.tsx`  
**Lines:** 1414-1417  
**Comment to add:**
```typescript
// STEP 6C: Fetch runner category history for TF-IDF calculation
// Purpose: Retrieves all completed errand categories for this runner to compute TF-IDF similarity with the current errand category.
```

#### Step 6D – Calculate TF-IDF + Cosine Similarity score
**File:** `app/buddyrunner/home.tsx`  
**Lines:** 1419-1422  
**Comment to add:**
```typescript
// STEP 6D: Calculate TF-IDF + Cosine Similarity score
// Purpose: Computes semantic similarity between errand category and runner's completed task history using TF-IDF vectors and cosine similarity. Returns 0-1 score.
```

#### Step 6E – Normalize rating score
**File:** `app/buddyrunner/home.tsx`  
**Lines:** 1424-1426  
**Comment to add:**
```typescript
// STEP 6E: Normalize rating score
// Purpose: Converts runner's average rating from 0-5 scale to 0-1 scale. Used as 35% weight in final score.
```

#### Step 6F – Calculate final weighted score
**File:** `app/buddyrunner/home.tsx`  
**Lines:** 1428-1429  
**Comment to add:**
```typescript
// STEP 6F: Calculate final weighted score
// Purpose: Combines distance (40%), rating (35%), and TF-IDF (25%) scores into a single final score for ranking runners.
```

### Step 7 – Sort and rank runners
**File:** `app/buddyrunner/home.tsx`  
**Lines:** 1460-1464  
**Comment to add:**
```typescript
// STEP 7: Sort and rank runners
// Purpose: Sort eligible runners by final score (descending), with distance as tiebreaker (ascending). Runner with highest score wins, or closest runner if scores are equal.
```

### Step 8 – Assign errand to top-ranked runner
**File:** `app/buddyrunner/home.tsx`  
**Lines:** 1489-1491  
**Comment to add:**
```typescript
// STEP 8: Assign errand to top-ranked runner
// Purpose: Update database to assign errand to the highest-scoring runner. Sets notified_runner_id, notified_at timestamp, and starts 60-second timeout window.
```

### Step 9 – Timeout detection and reassignment
**File:** `app/buddyrunner/home.tsx`  
**Lines:** 1507-1509  
**Comment to add:**
```typescript
// STEP 9: Timeout detection and reassignment
// Purpose: Check if 60 seconds have passed since the errand was assigned. If timeout occurred, exclude the previous runner and all timeout runners, then re-run the ranking process for remaining eligible runners.
```

#### Step 9A – Fetch available runners excluding previous and timeout runners
**File:** `app/buddyrunner/home.tsx`  
**Lines:** 1532-1568  
**Comment to add:**
```typescript
// STEP 9A: Fetch available runners excluding previous and timeout runners
// Purpose: Re-query runners with same presence filters, but exclude the current notified_runner_id and all runners in timeout_runner_ids array to prevent re-notification loops.
```

#### Step 9B – Reassign to next runner with timeout tracking
**File:** `app/buddyrunner/home.tsx`  
**Lines:** 1714-1723  
**Comment to add:**
```typescript
// STEP 9B: Reassign to next runner with timeout tracking
// Purpose: Assign errand to the next highest-scoring runner and pass the previous runner ID to add them to timeout_runner_ids array, preventing them from being notified again for this errand.
```

### Step 10 – Apply ranking filter to determine visibility
**File:** `app/buddyrunner/home.tsx`  
**Lines:** 1746-1751  
**Comment to add:**
```typescript
// STEP 10: Apply ranking filter to determine visibility
// Purpose: For each distance-filtered errand, run the ranking logic (shouldShowErrand) to determine if current runner should see it. Only errands assigned to current runner (or unassigned errands where current runner is top-ranked) are shown.
```

## TF-IDF Utility Functions

### Step TF-1 – Calculate Term Frequency (token-based)
**File:** `app/buddyrunner/home.tsx`  
**Lines:** 709-713  
**Comment to add:**
```typescript
// STEP TF-1: Calculate Term Frequency (token-based)
// Purpose: Computes term frequency as count of term occurrences divided by total document length. Used for query document TF calculation.
```

### Step TF-2 – Calculate Term Frequency (task-based)
**File:** `app/buddyrunner/home.tsx`  
**Lines:** 717-726  
**Comment to add:**
```typescript
// STEP TF-2: Calculate Term Frequency (task-based)
// Purpose: Computes term frequency based on task count rather than token count. Each completed task counts as 1, preventing multi-category tasks from inflating TF values. Used for runner history TF calculation.
```

### Step IDF-1 – Calculate Inverse Document Frequency (adjusted)
**File:** `app/buddyrunner/home.tsx`  
**Lines:** 737-754  
**Comment to add:**
```typescript
// STEP IDF-1: Calculate Inverse Document Frequency (adjusted)
// Purpose: Computes IDF as log(N/df) where N is total documents and df is documents containing the term. When term appears in all documents, returns 0.1 instead of 0 to prevent zero TF-IDF weights for common terms.
```

### Step TFIDF-1 – Calculate TF-IDF vector (token-based TF)
**File:** `app/buddyrunner/home.tsx`  
**Lines:** 753-770  
**Comment to add:**
```typescript
// STEP TFIDF-1: Calculate TF-IDF vector (token-based TF)
// Purpose: Constructs TF-IDF vector by computing TF × IDF for each unique term in the document. Used for query document vector construction.
```

### Step TFIDF-2 – Calculate TF-IDF vector (task-based TF)
**File:** `app/buddyrunner/home.tsx`  
**Lines:** 768-792  
**Comment to add:**
```typescript
// STEP TFIDF-2: Calculate TF-IDF vector (task-based TF)
// Purpose: Constructs TF-IDF vector using task-based TF calculation for runner history. Each task counts as 1 regardless of category count, providing more accurate frequency representation.
```

### Step COSINE-1 – Calculate Cosine Similarity between TF-IDF vectors
**File:** `app/buddyrunner/home.tsx`  
**Lines:** 813-832  
**Comment to add:**
```typescript
// STEP COSINE-1: Calculate Cosine Similarity between TF-IDF vectors
// Purpose: Computes cosine similarity as (v1 · v2) / (||v1|| × ||v2||) where dot product is sum of products and magnitudes are square roots of sum of squares. Returns 0-1 similarity score, with 1 being perfect match.
```

## Helper Functions

### getRunnerErrandCategoryHistory
**File:** `app/buddyrunner/home.tsx`  
**Lines:** 1188-1221  
**Comment to add:**
```typescript
// Helper function: Get runner's category history for TF-IDF calculation
// Purpose: Fetches all completed errands for a runner and returns their categories organized by task. Used to calculate TF-IDF similarity scores.
```

## Notes

- All steps have been documented with comments in the actual codebase
- Line numbers are approximate and may shift slightly due to comment additions
- The same logic pattern applies to commissions (in `useAvailableCommissions()` function, starting around line 1788)
- Timeout reassignment (Step 9) repeats Steps 6-8 with exclusions for timeout runners
