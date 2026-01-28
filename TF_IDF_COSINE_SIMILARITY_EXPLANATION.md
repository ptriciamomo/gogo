# TF-IDF & Cosine Similarity Calculation - Complete Code Explanation

## Location

**File:** `app/buddyrunner/home.tsx`  
**Lines:** 707-1006

All TF-IDF and Cosine Similarity calculation functions are located in this single file, in the section labeled `/* ===================== TF-IDF + COSINE SIMILARITY UTILITIES ===================== */`

---

## Overview: What These Functions Do

The system uses **TF-IDF (Term Frequency-Inverse Document Frequency)** combined with **Cosine Similarity** to match tasks (errands/commissions) with runners based on their category history.

**Simple explanation:**
- **TF (Term Frequency):** How often a category appears in a runner's history
- **IDF (Inverse Document Frequency):** How rare/common a category is across all documents
- **TF-IDF:** Combines both to give importance scores to each category
- **Cosine Similarity:** Compares how similar the task categories are to the runner's history (0 = no match, 1 = perfect match)

---

## Function 1: `calculateTF` - Term Frequency (Token-Based)--for Posted Task(errand/commission)

**File:** `app/buddyrunner/home.tsx`  
**Lines:** 711-717  
**Step:** STEP 1 - Calculate Term Frequency (token-based)

**What it does:** Calculates how often a specific term (category) appears in a document, divided by the total number of terms.

**Code:**
```typescript
function calculateTF(term: string, document: string[]): number {
    if (document.length === 0) return 0;
    // Count how many times the term appears
    const termCount = document.filter(word => word === term).length;
    // Divide by total terms to get frequency (0 to 1)
    return termCount / document.length;
}
```

**Where it's used:**

### 1. **Task Document (Query Document)** - ALWAYS uses `calculateTF`
**File:** `app/buddyrunner/home.tsx`  
**Line:** 945

**What is the "document"?**
- The **task document** (`queryDoc`) is a simple array of category strings from the current task
- **For Errands:** Usually one category, e.g., `["food"]`
- **For Commissions:** Can be multiple categories, e.g., `["logos", "posters"]`

**Example:**
- Task categories: `["food", "delivery"]`
- Document: `["food", "delivery"]` (this is `queryDoc`)
- Term: `"food"`
- Calculation: `1 occurrence / 2 total terms = 0.5`
- **Result:** `0.5`

**Code location:**
```typescript
// STEP 1: Count term occurrences in document array (line 713)
// STEP 1B: Divide term count by total document length (line 715)
// Line 759: Used in calculateTFIDFVectorAdjusted for query vector
// Line 945: Used in calculateTFIDFCosineSimilarity for logging
const tf = calculateTF(term, queryDoc);  // queryDoc = task categories array
```

### 2. **Runner Document** - Uses `calculateTF` ONLY as FALLBACK--(if walay pay completed task ang runner)
**File:** `app/buddyrunner/home.tsx`  
**Line:** 900-910 (fallback path in calculateTFIDFCosineSimilarity)

**What is the "document"?**
- The **runner document** (`runnerDoc`) is a flattened array of all categories from all completed tasks
- **Source:** Comes from `getRunnerErrandCategoryHistory()` which returns:
  - `taskCategories`: 2D array like `[["food"], ["delivery"], ["shopping"]]`
  - This gets flattened: `runnerHistory = taskCategories.flat()` → `["food", "delivery", "shopping"]`

**Example:**
- Runner completed tasks: `[["food"], ["delivery"], ["shopping"], ["food"]]`
- Flattened document: `["food", "delivery", "shopping", "food"]` (this is `runnerDoc`)
- Term: `"food"`
- Calculation: `2 occurrences / 4 total terms = 0.5`
- **Result:** `0.5`

**When is `calculateTF` used for runner?**
- **Only as fallback** when task data is unavailable (`runnerTaskCategories.length === 0`)
- **Preferred method** is `calculateTFWithTaskCount` (uses task count, not token count)

**Code location:**
```typescript
// STEP 1: Used as fallback when task data unavailable
// Lines 900-910: Fallback path inside calculateTFIDFCosineSimilarity
if (runnerTaskCategories.length > 0 && runnerTotalTasks > 0) {
    tf = calculateTFWithTaskCount(term, runnerTaskCategories, runnerTotalTasks);  // PREFERRED: Task-based (STEP 2)
} else {
    tf = calculateTF(term, runnerDoc);   // FALLBACK: Token-based (STEP 1)
}
// Also used in calculateTFIDFVectorAdjusted (line 759) when fallback vector is built
```

**Summary:**
- **Task document:** Always uses `calculateTF` (token-based)
- **Runner document:** Prefers `calculateTFWithTaskCount` (task-based), falls back to `calculateTF` (token-based) if task data unavailable

---

## Function 2: `calculateTFWithTaskCount` - Term Frequency (Task-Based)--(for Runners History)

**File:** `app/buddyrunner/home.tsx`  
**Lines:** 721-729  
**Step:** STEP 2 - Calculate Term Frequency (task-based)

**What it does:** Calculates how many **tasks** contain a category, divided by total tasks. This is better for runners because one task can have multiple categories.

**Code:**
```typescript
function calculateTFWithTaskCount(term: string, taskCategories: string[][], totalTasks: number): number {
    if (totalTasks === 0) return 0;
    // Count how many tasks contain this category
    const tasksWithCategory = taskCategories.filter(taskCats => 
        taskCats.some(cat => cat === term.toLowerCase())
    ).length;
    // Divide by total tasks
    return tasksWithCategory / totalTasks;
}
```

**Example:**
- Tasks: `[["food", "delivery"], ["shopping"], ["food", "grocery"]]`
- Total tasks: `3`
- Term: `"food"`
- Calculation: `2 tasks contain "food" / 3 total tasks = 0.6667`
- **Result:** `0.6667`

**Code location:**
```typescript
// STEP 2: Count how many tasks contain the category term (line 723)
// STEP 2B: Divide tasks containing category by total tasks (line 727)
// Line 782: Used in calculateTFIDFVectorWithTaskCount for runner vector
// Lines 900-910: Used in calculateTFIDFCosineSimilarity (preferred method)
```

**Why it's used:** For runner history - prevents multi-category tasks from inflating the frequency count.

---

## Function 3: `calculateIDFAdjusted` - Inverse Document Frequency (With Smoothing)

**File:** `app/buddyrunner/home.tsx`  
**Lines:** 735-748  
**Steps:** STEP 3 - Calculate Document Frequency (DF), STEP 4 - Calculate Inverse Document Frequency (IDF) with adjustment, STEP 7 - Apply IDF smoothing

**What it does:** Calculates how rare or common a term is across all documents. Rare terms get higher IDF scores. Includes smoothing to prevent zero scores when a term appears in all documents.

**Code:**
```typescript
function calculateIDFAdjusted(term: string, allDocuments: string[][]): number {
    // STEP 3: Count documents containing term (Document Frequency - DF) (line 736)
    const documentsContainingTerm = allDocuments.filter(doc => doc.includes(term)).length;
    if (documentsContainingTerm === 0) return 0;
    
    // STEP 7: Apply IDF smoothing by returning constant 0.1 when term appears in all documents (line 740)
    if (documentsContainingTerm === allDocuments.length) {
        return 0.1; // Smoothing: prevents zero IDF
    }
    
    // STEP 4: Normal IDF calculation (line 747)
    return Math.log(allDocuments.length / documentsContainingTerm);
}
```

**Example:**
- Total documents: `2`
- Documents with term "food": `2` (appears in all)
- Without smoothing: `log(2/2) = log(1) = 0` ❌
- With smoothing: `0.1` ✅

**Another example:**
- Total documents: `2`
- Documents with term "shopping": `1` (appears in only one)
- Calculation: `log(2/1) = log(2) = 0.693` (natural logarithm)

**Why it's used:** Prevents common terms from getting zero importance scores. This is the **only IDF function used** in the system. The original `calculateIDF` function (without smoothing) was removed as legacy code.

---

## Function 4: `calculateTFIDFVectorAdjusted` - Build TF-IDF Vector (Query Document) // this TF-IDF result is for posted task (errand/commission)

**File:** `app/buddyrunner/home.tsx`  
**Lines:** 754-766  
**Steps:** STEP 5 - Compute TF-IDF weight (TF × IDF) for query document, STEP 8 - Construct TF-IDF vector for query document

**What it does:** Creates a vector (map) of TF-IDF scores for all terms in a document. This is used for the **task/query** document.

**Code:**
```typescript
function calculateTFIDFVectorAdjusted(document: string[], allDocuments: string[][]): Map<string, number> {
    // Get all unique terms
    const uniqueTerms = Array.from(new Set(document));
    const tfidfMap = new Map<string, number>();
    
    // For each unique term, calculate TF-IDF
    uniqueTerms.forEach(term => {
        const tf = calculateTF(term, document);                    // STEP 1: Get TF (token-based)
        const idf = calculateIDFAdjusted(term, allDocuments);     // STEP 3 & 4: Get IDF
        // STEP 8: Multiply TF and IDF values to compute TF-IDF weight (line 761)
        const tfidf = tf * idf;
        tfidfMap.set(term, tfidf);                                 // Store in map
    });
    
    return tfidfMap;
}
```
// this TF-IDF result is for posted task (errand/commission)
  **Example:**
  - Document: `["food", "delivery"]`
  - All documents: `[["food", "delivery"], ["shopping", "food"]]`
  - For "food":
    - TF: `1/2 = 0.5` (appears once in 2 terms)
    - IDF: `log(2/2) = 0.1` (appears in all docs, so smoothing = 0.1)
    - TF-IDF: `0.5 × 0.1 = 0.05`
  - For "delivery":
    - TF: `1/2 = 0.5`
    - IDF: `log(2/1) = 0.693` (appears in 1 of 2 docs)
    - TF-IDF: `0.5 × 0.693 = 0.347`
  - **Result:** `Map { "food" => 0.05, "delivery" => 0.347 }`

**Why it's used:** Creates the task's TF-IDF vector for comparison.

---

## Function 5: `calculateTFIDFVectorWithTaskCount` - Build TF-IDF Vector (Runner Document) // this TF-IDF result is for runner history

**File:** `app/buddyrunner/home.tsx`  
**Lines:** 772-789  
**Steps:** STEP 7 - Compute TF-IDF weight (TF × IDF) for runner document using task-based TF, STEP 9 - Construct TF-IDF vector for runner document using task-based TF

**What it does:** Creates a TF-IDF vector for runner history using **task-based TF** (preferred method).

**Code:**
```typescript
function calculateTFIDFVectorWithTaskCount(taskCategories: string[][], totalTasks: number, allDocuments: string[][]): Map<string, number> {
    // Get all unique categories from all tasks
    const allTerms = new Set<string>();
    taskCategories.forEach(taskCats => {
        taskCats.forEach(cat => allTerms.add(cat.toLowerCase()));
    });
    
    const tfidfMap = new Map<string, number>();
    
    // For each unique category, calculate TF-IDF using task-based TF
    allTerms.forEach(term => {
        const tf = calculateTFWithTaskCount(term, taskCategories, totalTasks); // STEP 2: Task-based TF
        const idf = calculateIDFAdjusted(term, allDocuments);                  // STEP 3 & 4: IDF
        // STEP 9: Multiply task-based TF and IDF values to compute TF-IDF weight (line 784)
        const tfidf = tf * idf;
        tfidfMap.set(term, tfidf);
    });
    
    return tfidfMap;
}
```
// this TF-IDF result is for runner history
**Example:**
- Tasks: `[["food", "delivery"], ["shopping"], ["food"]]`
- Total tasks: `3`
- All documents: `[["food", "delivery"], ["shopping"], ["food"]]`
- For "food":
  - TF (task-based): `2 tasks / 3 total = 0.667`
  - IDF: `log(3/2) = 0.405`
  - TF-IDF: `0.667 × 0.405 = 0.270`
- **Result:** `Map { "food" => 0.270, "delivery" => ..., "shopping" => ... }`

**Why it's used:** Creates the runner's TF-IDF vector using task counts (more accurate than token counts).

---

## Function 6: `cosineSimilarity` - Calculate Cosine Similarity

**File:** `app/buddyrunner/home.tsx`  
**Lines:** 797-824  
**Steps:** STEP 12 - Calculate dot product for cosine similarity, STEP 13 - Calculate vector magnitudes for cosine similarity, STEP 14 - Calculate final cosine similarity score

**What it does:** Compares two TF-IDF vectors to see how similar they are. Returns a value between 0 (no similarity) and 1 (perfect match).

**Code:**
```typescript
function cosineSimilarity(vector1: Map<string, number>, vector2: Map<string, number>): number {
    // Get all unique terms from both vectors
    const allTerms = Array.from(new Set([...vector1.keys(), ...vector2.keys()]));
    
    let dotProduct = 0;    // Sum of (v1[term] × v2[term])
    let magnitude1 = 0;    // Sum of (v1[term]²)
    let magnitude2 = 0;    // Sum of (v2[term]²)
    
    // STEP 12 & 13: Calculate dot product and magnitudes
    allTerms.forEach(term => {
        const val1 = vector1.get(term) || 0;
        const val2 = vector2.get(term) || 0;
        
        // STEP 13: Compute dot product (line 807)
        dotProduct += val1 * val2;
        // STEP 15: Compute sum of squared values for first vector (line 809)
        magnitude1 += val1 * val1;
        // STEP 16: Compute sum of squared values for second vector (line 811)
        magnitude2 += val2 * val2;
    });
    
    // STEP 19: Compute square root for first vector magnitude (line 815)
    // STEP 20: Compute square root for second vector magnitude (line 816)
    // STEP 21: Multiply two vector magnitudes to get denominator (line 817)
    const denominator = Math.sqrt(magnitude1) * Math.sqrt(magnitude2);
    
    // STEP 25: Check if denominator equals zero, return 0 if true (line 819)
    if (denominator === 0) return 0;
    
    // STEP 26: Divide dot product by product of magnitudes (line 822)
    // STEP 14: Final cosine similarity score
    return dotProduct / denominator;
}
```

**Example:**
- Vector 1 (Task): `{ "food" => 0.5, "delivery" => 0.3 }`
- Vector 2 (Runner): `{ "food" => 0.4, "shopping" => 0.2 }`
- Dot product: `(0.5 × 0.4) + (0.3 × 0) + (0 × 0.2) = 0.2`
- Magnitude 1: `√(0.5² + 0.3²) = √(0.34) = 0.583`
- Magnitude 2: `√(0.4² + 0.2²) = √(0.20) = 0.447`
- Denominator: `0.583 × 0.447 = 0.261`
- **Result:** `0.2 / 0.261 = 0.766` (76.6% similarity)

**Why it's used:** Measures how well the task categories match the runner's history.

---

## Function 7: `calculateTFIDFCosineSimilarity` - Main Orchestrator Function

**File:** `app/buddyrunner/home.tsx`  
**Lines:** 829-1006  
**Steps:** Orchestrates all steps (STEP 1-14) by calling the helper functions above

**What it does:** This is the **main function** that orchestrates the entire TF-IDF + Cosine Similarity calculation. It calls all the helper functions above.

**Code Structure:**

```typescript
function calculateTFIDFCosineSimilarity(
    commissionCategories: string[],      // Task categories (e.g., ["food", "delivery"])
    runnerHistory: string[],              // Runner's category history (flat array)
    runnerTaskCategories: string[][] = [], // Runner's tasks (each task = array of categories)
    runnerTotalTasks: number = 0         // Total number of completed tasks
): number {
    
    // Normalize inputs (convert to lowercase, trim)// ipantay na tanan font size
    const queryDoc = commissionCategories.map(cat => cat.toLowerCase().trim()).filter(cat => cat.length > 0);
    const runnerDoc = runnerHistory.map(cat => cat.toLowerCase().trim()).filter(cat => cat.length > 0);
    
    // STEP 12: Build document corpus array containing exactly 2 documents (line 887)
    const allDocuments = [queryDoc, runnerDoc];
    
    // STEP 8: Construct TF-IDF vector for query document (line 958)
    const queryVector = calculateTFIDFVectorAdjusted(queryDoc, allDocuments);
    
    let runnerVector: Map<string, number>;
    if (runnerTaskCategories.length > 0 && runnerTotalTasks > 0) {
        // STEP 9: Construct TF-IDF vector for runner document using task-based TF (line 963)
        runnerVector = calculateTFIDFVectorWithTaskCount(runnerTaskCategories, runnerTotalTasks, allDocuments);
    } else {
        // STEP 10: Construct TF-IDF vector for runner document using token-based TF (fallback) (line 967)
        runnerVector = calculateTFIDFVectorAdjusted(runnerDoc, allDocuments);
    }
    
    // STEP 12 & 13: Calculate dot product and vector magnitudes (lines 970-972)
    // STEP 14: Calculate final cosine similarity score (line 1004)
    const similarity = cosineSimilarity(queryVector, runnerVector);
    
    // Return final score (0 to 1)
    return isNaN(similarity) ? 0 : similarity;
}
```

**Complete Flow (with actual steps):**

1. **Input:** Task categories `["food", "delivery"]` and runner history
2. **Normalize:** Convert to lowercase, remove empty strings
3. **STEP 12:** Build document corpus array containing exactly 2 documents: `[queryDoc, runnerDoc]`
4. **STEP 8:** Construct TF-IDF vector for query document:
   - Uses `calculateTFIDFVectorAdjusted` 
   - Calls **STEP 1** (`calculateTF`) for token-based TF
   - Calls **STEP 3 & 4** (`calculateIDFAdjusted`) for IDF
   - Multiplies TF × IDF for each term
5. **STEP 9 or STEP 10:** Construct TF-IDF vector for runner document:
   - **Preferred (STEP 9):** Uses `calculateTFIDFVectorWithTaskCount`
     - Calls **STEP 2** (`calculateTFWithTaskCount`) for task-based TF
     - Calls **STEP 3 & 4** (`calculateIDFAdjusted`) for IDF
   - **Fallback (STEP 10):** Uses `calculateTFIDFVectorAdjusted`
     - Calls **STEP 1** (`calculateTF`) for token-based TF
     - Calls **STEP 3 & 4** (`calculateIDFAdjusted`) for IDF
6. **STEP 12 & 13:** Calculate dot product and vector magnitudes
7. **STEP 14:** Calculate final cosine similarity score using `cosineSimilarity(queryVector, runnerVector)`
8. **Return:** Final score between 0 and 1

**Example Execution (with actual steps):**

```
Input:
- Task categories: ["food", "delivery"]
- Runner tasks: [["food", "delivery"], ["shopping"], ["food"]]
- Total tasks: 3

Normalize:
- queryDoc: ["food", "delivery"]
- runnerDoc: ["food", "delivery", "shopping", "food"]

STEP 12: Build document corpus
- allDocuments: [["food", "delivery"], ["food", "delivery", "shopping", "food"]]

STEP 8: Calculate TF-IDF vector for query document
  - STEP 1: Calculate TF for "food": 1/2 = 0.5
  - STEP 1: Calculate TF for "delivery": 1/2 = 0.5
  - STEP 3: Count documents with "food": 2 (DF)
  - STEP 4: Calculate IDF for "food": log(2/2) = 0 → STEP 7: Apply smoothing = 0.1
  - STEP 3: Count documents with "delivery": 2 (DF)
  - STEP 4: Calculate IDF for "delivery": log(2/2) = 0 → STEP 7: Apply smoothing = 0.1
  - STEP 8: TF-IDF for "food": 0.5 × 0.1 = 0.05
  - STEP 8: TF-IDF for "delivery": 0.5 × 0.1 = 0.05
  - Query vector: { "food" => 0.05, "delivery" => 0.05 }

STEP 9: Calculate TF-IDF vector for runner document (task-based)
  - STEP 2: Calculate TF for "food": 2 tasks / 3 total = 0.667
  - STEP 2: Calculate TF for "delivery": 1 task / 3 total = 0.333
  - STEP 2: Calculate TF for "shopping": 1 task / 3 total = 0.333
  - STEP 3 & 4: Calculate IDF (same as query)
  - STEP 9: TF-IDF for "food": 0.667 × 0.1 = 0.067
  - STEP 9: TF-IDF for "delivery": 0.333 × 0.1 = 0.033
  - STEP 3 & 4: IDF for "shopping": log(2/1) = 0.693
  - STEP 9: TF-IDF for "shopping": 0.333 × 0.693 = 0.231
  - Runner vector: { "food" => 0.067, "delivery" => 0.033, "shopping" => 0.231 }

STEP 12 & 13: Calculate dot product and vector magnitudes
  - Dot product: (0.05 × 0.067) + (0.05 × 0.033) + (0 × 0.231) = 0.005
  - Magnitude 1: √(0.05² + 0.05²) = 0.071
  - Magnitude 2: √(0.067² + 0.033² + 0.231²) = 0.245

STEP 14: Calculate final cosine similarity
  - Similarity: 0.005 / (0.071 × 0.245) = 0.287

Result: 0.287 (28.7% similarity)
```

---

## How It's Called in Queueing

**File:** `app/buddyrunner/home.tsx`  
**Lines:** 
- **Errands - Initial assignment:** Line 1434
- **Errands - Timeout reassignment:** Line 1660
- **Commissions - Initial assignment:** Line 2318
- **Commissions - Timeout reassignment:** Line 2564

**Code:**
```typescript
// Inside the ranking loop for each runner
const runnerHistoryData = await getRunnerErrandCategoryHistory(runner.id);
const runnerHistory = runnerHistoryData.taskCategories.flat();

const errandCategories = [errandCategory.toLowerCase()];
const tfidfScore = calculateTFIDFCosineSimilarity(
    errandCategories,                    // Task categories
    runnerHistory,                       // Runner's flat history
    runnerHistoryData.taskCategories,     // Runner's tasks (2D array)
    runnerHistoryData.totalTasks          // Total tasks
);
```

**What happens:**
1. Fetch runner's completed task history from database
2. Flatten it to a simple array
3. Call `calculateTFIDFCosineSimilarity` with task categories and runner history
4. Get back a score between 0 and 1
5. Use this score in final ranking: `finalScore = (distanceScore * 0.40) + (ratingScore * 0.35) + (tfidfScore * 0.25)`

---

## Summary

**All functions are in:** `app/buddyrunner/home.tsx` (lines 707-1006)

**Note:** The original `calculateIDF` function (without smoothing) was removed as legacy code. Only `calculateIDFAdjusted` (Function 3) is used in the system, which includes smoothing to prevent zero scores.

**Execution order:**
1. `calculateTFIDFCosineSimilarity` (main function) is called
2. It calls `calculateTFIDFVectorAdjusted` for query vector
3. It calls `calculateTFIDFVectorWithTaskCount` for runner vector (preferred) or `calculateTFIDFVectorAdjusted` (fallback)
4. These call `calculateTF` / `calculateTFWithTaskCount` for TF
5. These call `calculateIDFAdjusted` for IDF (only IDF function used)
6. Main function calls `cosineSimilarity` to compare vectors
7. Returns final similarity score (0 to 1)

**The score is then used in:** Final ranking formula (40% distance + 35% rating + 25% TF-IDF)
