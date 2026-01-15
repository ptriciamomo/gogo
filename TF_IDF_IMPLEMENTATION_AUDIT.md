# TF-IDF Implementation Audit

## ✅ YES/NO Answer

**Is TF-IDF truly implemented?**  
**Answer: YES, but with significant limitations**

The code implements a **mathematically valid TF-IDF calculation** with cosine similarity, but uses a **severely limited corpus** (only 2 documents), which significantly reduces the effectiveness of IDF.

---

## 📍 Where is tfidfScore Calculated?

### Exact File and Line Numbers

**File:** `app/buddyrunner/home.tsx`

**Main Function:**
- **`calculateTFIDFCosineSimilarity`** — Lines **754-781**
- **`calculateTF`** — Lines **662-666**
- **`calculateIDFAdjusted`** — Lines **681-693**
- **`calculateTFIDFVectorAdjusted`** — Lines **698-709**
- **`cosineSimilarity`** — Lines **730-749**

**Called At:**
- Line **1152**: Errands initial ranking
- Line **1336**: Errands timeout reassignment
- Line **1890**: Commissions initial ranking
- Line **2091**: Commissions timeout reassignment

---

## 🔍 Implementation Details

### Is TF-IDF Explicitly Implemented?

**YES** — Custom implementation (not using a library)

The code implements:
1. Term Frequency (TF) calculation
2. Inverse Document Frequency (IDF) calculation
3. TF-IDF vector construction
4. Cosine similarity between vectors

---

## 📊 Step-by-Step Calculation

### Step 1: Term Frequency (TF)

**Location:** Lines 662-666

```typescript
function calculateTF(term: string, document: string[]): number {
    if (document.length === 0) return 0;
    const termCount = document.filter(word => word === term).length;
    return termCount / document.length;
}
```

**Formula:** `TF(term, document) = count(term in document) / document.length`

**Input:**
- **Task input:** Array of category strings (e.g., `["groceries"]` for errands, `["logos", "posters"]` for commissions)
- **Runner history input:** Array of category strings from completed tasks

**Example:**
- Document: `["groceries", "groceries", "delivery"]`
- Term: `"groceries"`
- TF = 2 / 3 = 0.667

**✅ Mathematically valid TF calculation**

---

### Step 2: Inverse Document Frequency (IDF)

**Location:** Lines 681-693

```typescript
function calculateIDFAdjusted(term: string, allDocuments: string[][]): number {
    const documentsContainingTerm = allDocuments.filter(doc => doc.includes(term)).length;
    if (documentsContainingTerm === 0) return 0;
    
    // If term appears in all documents, use a small positive IDF value instead of 0
    if (documentsContainingTerm === allDocuments.length) {
        return 0.1; // Small epsilon to avoid zero IDF
    }
    
    return Math.log(allDocuments.length / documentsContainingTerm);
}
```

**Formula:** 
- Standard: `IDF(term) = log(total_documents / documents_containing_term)`
- Adjusted: If term appears in all documents, use `0.1` instead of `0`

**⚠️ CRITICAL ISSUE — Corpus Size:**

**Location:** Line 771

```typescript
const allDocuments = [queryDoc, runnerDoc];
```

**The corpus is only 2 documents:**
- Document 1: Query document (task categories)
- Document 2: Runner history document

**Impact:**
- IDF is calculated across only 2 documents
- If a term appears in both documents, IDF = 0.1 (not 0)
- If a term appears in only 1 document, IDF = log(2/1) ≈ 0.693
- This severely limits IDF's ability to distinguish common vs. rare terms

**✅ Mathematically valid IDF formula, but ❌ corpus is too small**

---

### Step 3: TF-IDF Vector Construction

**Location:** Lines 698-709

```typescript
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

**Formula:** `TF-IDF(term, document) = TF(term, document) × IDF(term)`

**Process:**
1. Extract unique terms from document
2. For each term, calculate TF × IDF
3. Store in Map<string, number>

**✅ Mathematically valid TF-IDF vector construction**

---

### Step 4: Cosine Similarity

**Location:** Lines 730-749

```typescript
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

**Formula:** 
```
cosine_similarity = (v1 · v2) / (||v1|| × ||v2||)
```

Where:
- `v1 · v2` = dot product
- `||v1||` = magnitude of vector 1
- `||v2||` = magnitude of vector 2

**✅ Mathematically valid cosine similarity**

---

### Step 5: Final Score Calculation

**Location:** Lines 754-781

```typescript
function calculateTFIDFCosineSimilarity(commissionCategories: string[], runnerHistory: string[]): number {
    if (commissionCategories.length === 0 || runnerHistory.length === 0) {
        return 0;
    }
    
    // Convert to lowercase and trim
    const queryDoc = commissionCategories.map(cat => cat.toLowerCase().trim()).filter(cat => cat.length > 0);
    const runnerDoc = runnerHistory.map(cat => cat.toLowerCase().trim()).filter(cat => cat.length > 0);
    
    if (queryDoc.length === 0 || runnerDoc.length === 0) {
        return 0;
    }
    
    // Build TF-IDF vectors
    const allDocuments = [queryDoc, runnerDoc];
    
    const queryVector = calculateTFIDFVectorAdjusted(queryDoc, allDocuments);
    const runnerVector = calculateTFIDFVectorAdjusted(runnerDoc, allDocuments);
    
    // Calculate cosine similarity
    const similarity = cosineSimilarity(queryVector, runnerVector);
    
    return isNaN(similarity) ? 0 : similarity;
}
```

**Process:**
1. Normalize inputs (lowercase, trim)
2. Create corpus of 2 documents
3. Build TF-IDF vectors for both documents
4. Calculate cosine similarity
5. Return similarity score (0-1)

---

## 📈 Output Range

### Is tfidfScore Guaranteed to be 0-1?

**YES** — Cosine similarity is guaranteed to return values in the range [0, 1]

**Reason:**
- Cosine similarity formula: `dotProduct / (magnitude1 × magnitude2)`
- By definition, cosine similarity is bounded between -1 and 1
- Since TF-IDF values are non-negative (TF ≥ 0, IDF ≥ 0), the result is in [0, 1]

**Edge Cases:**
- Empty input → returns `0` (line 756, 766)
- NaN result → returns `0` (line 780)
- Zero denominator → returns `0` (line 746)

**✅ Output is normalized to 0-1**

---

## ⏰ When in Pipeline is TF-IDF Computed?

### Computation Timing

**Location in Pipeline:**
1. ✅ **After distance filtering** (500m check)
2. ✅ **Before ranking** (used in FinalScore calculation)
3. ❌ **NOT cached** — recomputed each time for each runner

**Execution Flow:**
```
1. Fetch available runners
2. Filter by distance (≤ 500m)
3. For each eligible runner:
   a. Fetch runner history (async database call)
   b. Calculate TF-IDF score (synchronous)
   c. Calculate distanceScore
   d. Calculate ratingScore
   e. Calculate FinalScore
4. Sort by FinalScore
```

**Performance Impact:**
- TF-IDF calculation is synchronous (fast)
- Runner history fetching is async (database call per runner)
- No caching means repeated calculations for same runner

---

## 🎲 Determinism

### Is tfidfScore Deterministic?

**YES** — Same input → same output every time

**Reasons:**
1. **No randomness:** All calculations are deterministic
2. **No time-dependent values:** No timestamps or random seeds
3. **Consistent normalization:** Lowercase and trim applied consistently
4. **Fixed corpus:** Always uses `[queryDoc, runnerDoc]` (2 documents)

**Potential Non-Determinism:**
- ❌ **None identified** — the calculation is purely mathematical

**✅ tfidfScore is deterministic**

---

## 🔧 Shortcuts and Assumptions

### Identified Shortcuts

1. **⚠️ Extremely Small Corpus (2 documents)**
   - **Location:** Line 771
   - **Impact:** IDF loses most of its discriminative power
   - **Why:** Only comparing task vs. runner history, not all tasks/runners

2. **⚠️ Category String Matching Only**
   - **Input:** Array of category strings (e.g., `["groceries"]`, `["logos", "posters"]`)
   - **No text processing:** No tokenization, stemming, or NLP
   - **Exact match required:** Categories must match exactly (after lowercase)

3. **⚠️ Adjusted IDF for Common Terms**
   - **Location:** Lines 686-689
   - **Behavior:** If term appears in both documents, IDF = 0.1 (not 0)
   - **Why:** Avoids zero IDF when corpus is too small
   - **Impact:** Reduces penalty for common terms

4. **✅ No Precomputation**
   - IDF calculated on-the-fly for each comparison
   - No global IDF corpus or precomputed values

5. **✅ Simple Term Matching**
   - Uses `doc.includes(term)` for document matching
   - No fuzzy matching or semantic similarity

---

## ✅ Mathematical Validity

### Is the Implementation Mathematically Valid TF-IDF?

**YES** — The formulas are mathematically correct

**TF Formula:** ✅ Standard normalized TF
```
TF(term, doc) = count(term in doc) / doc.length
```

**IDF Formula:** ✅ Standard IDF with adjustment
```
IDF(term) = log(total_docs / docs_containing_term)
Adjusted: If term in all docs, IDF = 0.1
```

**TF-IDF Formula:** ✅ Standard multiplication
```
TF-IDF(term, doc) = TF(term, doc) × IDF(term)
```

**Cosine Similarity:** ✅ Standard formula
```
similarity = (v1 · v2) / (||v1|| × ||v2||)
```

**✅ All formulas are mathematically valid**

---

## ⚠️ Limitations and Issues

### Critical Issues

1. **❌ Corpus Size (2 documents)**
   - **Problem:** IDF calculated across only 2 documents
   - **Impact:** IDF cannot effectively distinguish common vs. rare terms
   - **Example:** If "groceries" appears in both query and runner history, IDF = 0.1 (very low)
   - **Should be:** IDF calculated across all tasks/runners in the system

2. **❌ No Global IDF Corpus**
   - **Problem:** Each comparison uses its own 2-document corpus
   - **Impact:** IDF values are not comparable across different runner comparisons
   - **Should be:** Single global IDF corpus for all tasks/runners

3. **⚠️ Category-Only Matching**
   - **Problem:** Only matches category strings, not task descriptions
   - **Impact:** Cannot capture semantic similarity beyond category names
   - **Acceptable if:** Categories are the primary matching signal

### Minor Issues

4. **⚠️ No Caching**
   - **Problem:** Runner history fetched and TF-IDF recalculated for each task
   - **Impact:** Performance overhead (though likely minimal)
   - **Acceptable if:** Runner history changes frequently

5. **⚠️ Adjusted IDF Epsilon (0.1)**
   - **Problem:** Arbitrary value when term appears in all documents
   - **Impact:** May not accurately reflect term rarity
   - **Acceptable if:** Small corpus limitation is acknowledged

---

## 📝 Plain-English Explanation

### How It Works

1. **Input:**
   - Task categories: `["groceries"]` (errand) or `["logos", "posters"]` (commission)
   - Runner history: Array of categories from completed tasks (e.g., `["groceries", "groceries", "delivery"]`)

2. **Term Frequency (TF):**
   - Counts how often each category appears in the runner's history
   - Normalizes by total number of categories
   - Example: If runner has 3 tasks with "groceries" out of 10 total categories, TF = 0.3

3. **Inverse Document Frequency (IDF):**
   - Measures how rare/common a category is
   - Calculated across only 2 documents: the task categories and the runner's history
   - If category appears in both, IDF = 0.1 (common)
   - If category appears in only one, IDF ≈ 0.693 (rarer)

4. **TF-IDF Vector:**
   - Creates a vector where each category has a TF-IDF score
   - Higher scores = more relevant categories

5. **Cosine Similarity:**
   - Compares the task's TF-IDF vector with the runner's TF-IDF vector
   - Returns a score between 0 and 1
   - Higher score = better match

### What It Actually Does

**In practice, this is more like "category overlap with frequency weighting" than true TF-IDF.**

Because the corpus is only 2 documents:
- **IDF has limited effect** (only 2 possible values: 0.1 or ~0.693)
- **TF dominates** the calculation
- **Cosine similarity** measures how well categories overlap

**It's a TF-IDF-inspired relevance score, not full TF-IDF.**

---

## 🎯 Summary

### Is TF-IDF Truly Implemented?

**YES** — The formulas are mathematically correct and the implementation follows TF-IDF principles.

**BUT** — The corpus limitation (2 documents) significantly reduces IDF's effectiveness, making it more of a **TF-weighted category matching** system than true TF-IDF.

### Recommendations

1. **Expand Corpus:** Use all tasks/runners in the system for IDF calculation
2. **Precompute IDF:** Calculate global IDF values once, reuse across comparisons
3. **Consider Alternatives:** If corpus expansion is not feasible, consider simpler category matching or explicit category weights

### Current State

- ✅ **Mathematically valid** TF-IDF formulas
- ✅ **Correct cosine similarity** implementation
- ✅ **Normalized output** (0-1 range)
- ✅ **Deterministic** behavior
- ❌ **Limited corpus** (2 documents) reduces IDF effectiveness
- ⚠️ **Category-only matching** (no text processing)

**Verdict:** **Valid TF-IDF implementation with significant corpus limitations.**
