# TF-IDF & Cosine Similarity - Mathematical Calculation Steps

## Summary

This document identifies all mathematical and computational steps for TF-IDF and Cosine Similarity calculations used in both errand and commission queueing. All calculations are in a single file with shared utility functions.

---

## Step 1 – Term Frequency (TF) Calculation - Token-Based

**File:** `app/buddyrunner/home.tsx`  
**Lines:** 711-715  
**Function:** `calculateTF()`  
**Comment to add:**
```typescript
// STEP 1: Calculate Term Frequency (token-based)
// Purpose: Computes TF(term, document) = count(term in document) / document.length. Counts occurrences of term in document array and normalizes by total document length. Used for query document TF calculation (errands and commissions).
```

**Formula:** `TF(term, document) = termCount / document.length`

**Where:**
- `termCount` = number of times term appears in document (Line 713)
- `document.length` = total number of tokens in document (Line 714)

---

## Step 2 – Term Frequency (TF) Calculation - Task-Based

**File:** `app/buddyrunner/home.tsx`  
**Lines:** 719-726  
**Function:** `calculateTFWithTaskCount()`  
**Comment to add:**
```typescript
// STEP 2: Calculate Term Frequency (task-based)
// Purpose: Computes TF(term) = tasks_with_category(term) / totalTasks. Counts how many tasks contain the term, not token occurrences. Each task counts as 1 regardless of category count. Used for runner history TF calculation (errands and commissions) to prevent multi-category inflation.
```

**Formula:** `TF(term) = tasksWithCategory / totalTasks`

**Where:**
- `tasksWithCategory` = number of tasks containing this term (Lines 722-724)
- `totalTasks` = total number of completed tasks (parameter)

---

## Step 3 – Document Frequency (DF) Calculation

**File:** `app/buddyrunner/home.tsx`  
**Lines:** 740-741  
**Function:** `calculateIDFAdjusted()` (implicit DF calculation)  
**Comment to add:**
```typescript
// STEP 3: Calculate Document Frequency (DF)
// Purpose: Counts how many documents in the corpus contain the term. DF is calculated as documentsContainingTerm = allDocuments.filter(doc => doc.includes(term)).length. This count is used in IDF calculation. In this system, corpus consists of 2 documents: query document (task categories) and runner document (runner history).
```

**Formula:** `DF(term) = count(documents containing term)`

**Calculation:** Line 740: `const documentsContainingTerm = allDocuments.filter(doc => doc.includes(term)).length;`

**Note:** DF is calculated implicitly within `calculateIDFAdjusted()` and is not a separate exported function. It's the intermediate value used to compute IDF.

---

## Step 4 – Inverse Document Frequency (IDF) Calculation with Adjustment

**File:** `app/buddyrunner/home.tsx`  
**Lines:** 739-751  
**Function:** `calculateIDFAdjusted()`  
**Comment to add:**
```typescript
// STEP 4: Calculate Inverse Document Frequency (IDF) with adjustment
// Purpose: Computes IDF(term) = log(N / df) where N is total documents and df is document frequency. When term appears in all documents (df = N), returns 0.1 instead of 0 to prevent zero TF-IDF weights for common terms. This adjustment ensures common terms still contribute to similarity calculations. Used for both errands and commissions.
```

**Formula:**
```
IDF(term) = {
    0.1,                    if df(term) = N (all documents contain term)
    log(N / df(term)),      otherwise
}
```

**Where:**
- `N` = total documents in corpus = `allDocuments.length` (Line 750)
- `df(term)` = document frequency = `documentsContainingTerm` (Line 740)
- **Adjustment:** Lines 743-748 check if `documentsContainingTerm === allDocuments.length` and return `0.1` instead of `0`

---

## Step 5 – TF-IDF Weight Computation (Query Document)

**File:** `app/buddyrunner/home.tsx`  
**Lines:** 759-762 (within `calculateTFIDFVectorAdjusted`)  
**Function:** `calculateTFIDFVectorAdjusted()`  
**Comment to add:**
```typescript
// STEP 5: Compute TF-IDF weight (TF × IDF) for query document
// Purpose: Multiplies TF and IDF values to produce TF-IDF weight for each term in the query document. Formula: TF-IDF(term) = TF(term) × IDF(term). Used for both errands (single category) and commissions (multiple types). Each unique term gets its TF-IDF weight stored in the vector map.
```

**Formula:** `TF-IDF(term) = TF(term) × IDF(term)`

**Where:**
- `TF(term)` = calculated via `calculateTF(term, document)` (Line 760)
- `IDF(term)` = calculated via `calculateIDFAdjusted(term, allDocuments)` (Line 761)
- **Result stored:** Line 762: `tfidfMap.set(term, tf * idf)`

**Also computed at:** Lines 943-945 (within `calculateTFIDFCosineSimilarity` for logging)

---

## Step 6 – TF-IDF Weight Computation (Runner Document - Token-Based)

**File:** `app/buddyrunner/home.tsx`  
**Lines:** 759-762 (within `calculateTFIDFVectorAdjusted`)  
**Function:** `calculateTFIDFVectorAdjusted()`  
**Comment to add:**
```typescript
// STEP 6: Compute TF-IDF weight (TF × IDF) for runner document using token-based TF
// Purpose: Multiplies token-based TF and IDF values for runner history when task data is unavailable. Used as fallback when runnerTaskCategories is empty. Formula: TF-IDF(term) = TF(term) × IDF(term) where TF uses token count.
```

**Formula:** `TF-IDF(term) = TF(term) × IDF(term)` (token-based TF)

**Used when:** `runnerTaskCategories.length === 0 || runnerTotalTasks === 0` (Line 960)

---

## Step 7 – TF-IDF Weight Computation (Runner Document - Task-Based)

**File:** `app/buddyrunner/home.tsx`  
**Lines:** 779-782 (within `calculateTFIDFVectorWithTaskCount`)  
**Function:** `calculateTFIDFVectorWithTaskCount()`  
**Comment to add:**
```typescript
// STEP 7: Compute TF-IDF weight (TF × IDF) for runner document using task-based TF
// Purpose: Multiplies task-based TF and IDF values for runner history. This is the preferred method for runner documents as it uses task count instead of token count, preventing multi-category tasks from inflating TF values. Formula: TF-IDF(term) = TF(term) × IDF(term) where TF uses task count.
```

**Formula:** `TF-IDF(term) = TF(term) × IDF(term)` (task-based TF)

**Where:**
- `TF(term)` = calculated via `calculateTFWithTaskCount(term, taskCategories, totalTasks)` (Line 780)
- `IDF(term)` = calculated via `calculateIDFAdjusted(term, allDocuments)` (Line 781)
- **Result stored:** Line 782: `tfidfMap.set(term, tf * idf)`

**Used when:** `runnerTaskCategories.length > 0 && runnerTotalTasks > 0` (Lines 955, 957)

---

## Step 8 – TF-IDF Vector Construction (Query Document)

**File:** `app/buddyrunner/home.tsx`  
**Lines:** 755-766  
**Function:** `calculateTFIDFVectorAdjusted()`  
**Comment to add:**
```typescript
// STEP 8: Construct TF-IDF vector for query document
// Purpose: Builds a Map<string, number> representing the TF-IDF vector for the query document (task categories). Iterates through all unique terms in the document, computes TF × IDF for each term, and stores in map. Used for both errands and commissions as the task vector.
```

**Process:**
1. Extract unique terms from document (Line 756)
2. For each term: compute TF × IDF (Lines 759-762)
3. Store TF-IDF weight in map (Line 762)
4. Return map as vector (Line 765)

**Called at:** Line 953 (within `calculateTFIDFCosineSimilarity`)

---

## Step 9 – TF-IDF Vector Construction (Runner Document - Task-Based)

**File:** `app/buddyrunner/home.tsx`  
**Lines:** 770-786  
**Function:** `calculateTFIDFVectorWithTaskCount()`  
**Comment to add:**
```typescript
// STEP 9: Construct TF-IDF vector for runner document using task-based TF
// Purpose: Builds a Map<string, number> representing the TF-IDF vector for runner history using task-based TF calculation. Collects all unique terms from taskCategories array, computes task-based TF × IDF for each term, and stores in map. This is the preferred method for runner vectors as it accurately represents task-level frequency.
```

**Process:**
1. Collect all unique terms from all tasks (Lines 772-775)
2. For each term: compute task-based TF × IDF (Lines 779-782)
3. Store TF-IDF weight in map (Line 782)
4. Return map as vector (Line 785)

**Called at:** Line 957 (within `calculateTFIDFCosineSimilarity` when task data available)

---

## Step 10 – TF-IDF Vector Construction (Runner Document - Token-Based Fallback)

**File:** `app/buddyrunner/home.tsx`  
**Lines:** 755-766  
**Function:** `calculateTFIDFVectorAdjusted()`  
**Comment to add:**
```typescript
// STEP 10: Construct TF-IDF vector for runner document using token-based TF (fallback)
// Purpose: Builds a Map<string, number> representing the TF-IDF vector for runner history using token-based TF calculation. Used as fallback when task data is unavailable. Same process as query document vector construction but applied to runner document.
```

**Process:** Same as Step 8, but applied to `runnerDoc` instead of `queryDoc`

**Called at:** Line 960 (within `calculateTFIDFCosineSimilarity` when task data unavailable)

---

## Step 11 – Document Corpus Construction

**File:** `app/buddyrunner/home.tsx`  
**Lines:** 888  
**Function:** `calculateTFIDFCosineSimilarity()`  
**Comment to add:**
```typescript
// STEP 11: Construct document corpus for IDF calculation
// Purpose: Creates the document corpus array containing query document and runner document. Corpus consists of exactly 2 documents: [queryDoc, runnerDoc]. This corpus is used to calculate IDF values, where N = 2 and df(term) is the count of documents (1 or 2) containing the term.
```

**Formula:** `allDocuments = [queryDoc, runnerDoc]`

**Where:**
- `queryDoc` = normalized task categories (Line 841)
- `runnerDoc` = normalized runner history (Line 844)

**Used for:** IDF calculation (passed to `calculateIDFAdjusted()` at Line 923, 761, 781)

---

## Step 12 – Cosine Similarity: Dot Product Calculation

**File:** `app/buddyrunner/home.tsx`  
**Lines:** 813-819 (within `cosineSimilarity`)  
**Function:** `cosineSimilarity()`  
**Comment to add:**
```typescript
// STEP 12: Calculate dot product for cosine similarity
// Purpose: Computes dot product of two TF-IDF vectors as sum of products of corresponding term weights. Formula: dotProduct = Σ(v1[term] × v2[term]) for all terms. Iterates through union of all terms from both vectors, multiplies corresponding values, and sums the products. Returns 0 for missing terms.
```

**Formula:** `dotProduct = Σ(v1[term] × v2[term])` for all terms

**Where:**
- `v1[term]` = value from `vector1.get(term) || 0` (Line 814)
- `v2[term]` = value from `vector2.get(term) || 0` (Line 815)
- **Summation:** Line 816: `dotProduct += val1 * val2`

**Also computed at:** Lines 969-975 (within `calculateTFIDFCosineSimilarity` for logging)

---

## Step 13 – Cosine Similarity: Vector Magnitude Calculation

**File:** `app/buddyrunner/home.tsx`  
**Lines:** 817-818, 821 (within `cosineSimilarity`)  
**Function:** `cosineSimilarity()`  
**Comment to add:**
```typescript
// STEP 13: Calculate vector magnitudes for cosine similarity
// Purpose: Computes Euclidean magnitude (L2 norm) of each TF-IDF vector as square root of sum of squared term weights. Formula: ||v|| = √(Σ(v[term]²)). Calculates magnitude1 and magnitude2, then multiplies them to get denominator. Used to normalize dot product in cosine similarity calculation.
```

**Formula:** `||v|| = √(Σ(v[term]²))`

**Where:**
- `magnitude1` = `√(Σ(v1[term]²))` (Lines 817, 821)
- `magnitude2` = `√(Σ(v2[term]²))` (Lines 818, 821)
- **Squared values:** Lines 817-818: `magnitude1 += val1 * val1`, `magnitude2 += val2 * val2`
- **Square root:** Line 821: `Math.sqrt(magnitude1) * Math.sqrt(magnitude2)`

**Also computed at:** Lines 973-979 (within `calculateTFIDFCosineSimilarity` for logging)

---

## Step 14 – Cosine Similarity: Final Similarity Calculation

**File:** `app/buddyrunner/home.tsx`  
**Lines:** 821-824 (within `cosineSimilarity`)  
**Function:** `cosineSimilarity()`  
**Comment to add:**
```typescript
// STEP 14: Calculate final cosine similarity score
// Purpose: Computes cosine similarity as (v1 · v2) / (||v1|| × ||v2||) where numerator is dot product and denominator is product of magnitudes. Returns 0 if denominator is 0 (zero vectors). Result is a value between 0 and 1, where 1 indicates perfect similarity and 0 indicates no similarity. Used for both errands and commissions.
```

**Formula:** `cosine_similarity = dotProduct / (magnitude1 × magnitude2)`

**Where:**
- `dotProduct` = sum of products (calculated in Step 12)
- `denominator` = `Math.sqrt(magnitude1) * Math.sqrt(magnitude2)` (Line 821)
- **Safeguard:** Line 822: `if (denominator === 0) return 0;`
- **Final calculation:** Line 824: `return dotProduct / denominator;`

**Called at:** Line 987 (within `calculateTFIDFCosineSimilarity`)

**Also computed at:** Lines 977-979, 987 (within `calculateTFIDFCosineSimilarity`)

---

## Usage Points

### Errands

**Initial Assignment:**
- **File:** `app/buddyrunner/home.tsx`
- **Line:** 1352 (within `shouldShowErrand`)
- **Call:** `calculateTFIDFCosineSimilarity(errandCategories, runnerHistory, runnerHistoryData.taskCategories, runnerHistoryData.totalTasks)`

**Timeout Reassignment:**
- **File:** `app/buddyrunner/home.tsx`
- **Line:** 1575 (within `shouldShowErrand` timeout branch)
- **Call:** `calculateTFIDFCosineSimilarity(errandCategories, runnerHistory, runnerHistoryData.taskCategories, runnerHistoryData.totalTasks)`

### Commissions

**Initial Assignment:**
- **File:** `app/buddyrunner/home.tsx`
- **Line:** 2289 (within `shouldShowCommission`)
- **Call:** `calculateTFIDFCosineSimilarity(commissionTypes, runnerHistory, runnerHistoryData.taskCategories, runnerHistoryData.totalTasks)`

**Timeout Reassignment:**
- **File:** `app/buddyrunner/home.tsx`
- **Line:** 2534 (within `shouldShowCommission` timeout branch)
- **Call:** `calculateTFIDFCosineSimilarity(commissionTypes, runnerHistory, runnerHistoryData.taskCategories, runnerHistoryData.totalTasks)`

---

## Shared Functions

All TF-IDF and Cosine Similarity calculations are performed by **shared utility functions** in `app/buddyrunner/home.tsx` (Lines 707-998). Both errands and commissions use the same mathematical implementations, with only input data differing:
- **Errands:** Single category string → `["category"]`
- **Commissions:** Comma-separated types → `["type1", "type2", ...]`
