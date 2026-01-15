# TF-IDF + Cosine Similarity Implementation Audit

## 📋 Summary

**TF-IDF and Cosine Similarity are implemented as a unified scoring system used identically for both Errands and Commissions.**

- **TF-IDF Calculation:** Lines 662-709 in `app/buddyrunner/home.tsx`
- **Cosine Similarity:** Lines 730-749 in `app/buddyrunner/home.tsx`
- **Integration Function:** `calculateTFIDFCosineSimilarity` (Lines 754-781)
- **Usage:** Lines 1152, 1336 (Errands), 1890, 2091 (Commissions)
- **Input:** Category strings only (no titles/descriptions)
- **IDF Scope:** Pairwise (2 documents: query + runner history)
- **Output:** Directly assigned to `tfidfScore` (0-1 range)

---

## 🔍 TF-IDF Implementation

### Where Exactly is TF-IDF Calculated?

**File:** `app/buddyrunner/home.tsx`

**Functions:**
1. **`calculateTF`** — Lines 662-666
   - Calculates Term Frequency

2. **`calculateIDF`** — Lines 671-675
   - Calculates standard Inverse Document Frequency (unused in current flow)

3. **`calculateIDFAdjusted`** — Lines 681-693
   - Calculates adjusted IDF (used in current flow)

4. **`calculateTFIDFVector`** — Lines 714-725
   - Builds TF-IDF vector with standard IDF (unused in current flow)

5. **`calculateTFIDFVectorAdjusted`** — Lines 698-709
   - Builds TF-IDF vector with adjusted IDF (**actively used**)

6. **`calculateTFIDFCosineSimilarity`** — Lines 754-781
   - Main integration function (**actively used**)

**Called At:**
- Line **1152**: Errands initial ranking
- Line **1336**: Errands timeout reassignment
- Line **1890**: Commissions initial ranking
- Line **2091**: Commissions timeout reassignment

---

### What Inputs Are Used to Build TF-IDF Vectors?

**Inputs:** Category strings only

**For Errands:**
- **Query Document:** `[errandCategory.toLowerCase()]` (single category)
- **Runner History Document:** Array of category strings from completed errands
- **Source:** `errand.category` field only

**For Commissions:**
- **Query Document:** `commissionTypes` (array of categories from comma-separated `commission_type`)
- **Runner History Document:** Array of category strings from completed commissions
- **Source:** `commission.commission_type` field only

**Not Used:**
- ❌ **Titles:** Fetched but not passed to TF-IDF
- ❌ **Descriptions:** Not in database schema
- ❌ **Notes:** Not in database schema

---

### How Are TF, IDF, and TF-IDF Computed?

#### Term Frequency (TF)

**Function:** `calculateTF(term: string, document: string[]): number`

**Location:** Lines 662-666

```typescript
function calculateTF(term: string, document: string[]): number {
    if (document.length === 0) return 0;
    const termCount = document.filter(word => word === term).length;
    return termCount / document.length;
}
```

**Formula:**
```
TF(term, document) = count(term in document) / document.length
```

**Example:**
- Document: `["groceries", "groceries", "delivery"]`
- Term: `"groceries"`
- TF = 2 / 3 = 0.667

**✅ Standard normalized TF formula**

---

#### Inverse Document Frequency (IDF)

**Function:** `calculateIDFAdjusted(term: string, allDocuments: string[][]): number`

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
```
Standard: IDF(term) = log(total_documents / documents_containing_term)
Adjusted: If term in all documents, IDF = 0.1 (not 0)
```

**Example:**
- Corpus: 2 documents (query + runner history)
- Term appears in both: IDF = 0.1
- Term appears in only 1: IDF = log(2/1) ≈ 0.693

**⚠️ IDF is pairwise (only 2 documents), not global**

---

#### TF-IDF Vector

**Function:** `calculateTFIDFVectorAdjusted(document: string[], allDocuments: string[][]): Map<string, number>`

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

**Formula:**
```
TF-IDF(term, document) = TF(term, document) × IDF(term)
```

**Process:**
1. Extract unique terms from document
2. For each term: calculate `TF × IDF`
3. Store in `Map<string, number>` (term → TF-IDF score)

**Example:**
- Document: `["groceries", "groceries"]`
- Unique terms: `["groceries"]`
- TF("groceries") = 2/2 = 1.0
- IDF("groceries") = 0.1 (if appears in both documents)
- TF-IDF("groceries") = 1.0 × 0.1 = 0.1

**✅ Standard TF-IDF vector construction**

---

### Is IDF Global or Pairwise?

**Answer: Pairwise** (only 2 documents per comparison)

**Evidence:**
- **Line 771:** `const allDocuments = [queryDoc, runnerDoc];`
- **Corpus:** Only 2 documents: query document + runner history document
- **IDF calculation:** Uses only these 2 documents (line 682)
- **Not global:** Does not use all tasks/runners in the system

**Impact:**
- IDF is calculated **per comparison** (not globally)
- If term appears in both documents: IDF = 0.1
- If term appears in only one: IDF ≈ 0.693
- Limited discriminative power (only 2 possible IDF values)

---

## 📐 Cosine Similarity Implementation

### Where is Cosine Similarity Implemented?

**File:** `app/buddyrunner/home.tsx`

**Function:** `cosineSimilarity(vector1: Map<string, number>, vector2: Map<string, number>): number`

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

---

### Is the Implementation Mathematically Standard?

**YES** — Standard cosine similarity formula

**Formula:**
```
cosine_similarity(v1, v2) = (v1 · v2) / (||v1|| × ||v2||)
```

**Where:**
- `v1 · v2` = dot product (sum of element-wise products)
- `||v1||` = magnitude of vector 1 (sqrt of sum of squares)
- `||v2||` = magnitude of vector 2 (sqrt of sum of squares)

**Implementation Steps:**
1. **Collect all terms:** Union of terms from both vectors (line 731)
2. **Calculate dot product:** Sum of `val1 × val2` for all terms (lines 737-740)
3. **Calculate magnitudes:** Sum of squares for each vector (lines 741-742)
4. **Normalize:** Divide dot product by product of magnitudes (line 748)

**✅ Mathematically standard implementation**

---

### Is the Output Always Between 0 and 1?

**YES** — Output is guaranteed to be in range [0, 1]

**Why:**
1. **TF-IDF values are non-negative:**
   - TF ≥ 0 (term count / document length)
   - IDF ≥ 0 (log value or 0.1)
   - TF-IDF = TF × IDF ≥ 0

2. **Cosine similarity with non-negative vectors:**
   - Dot product ≥ 0 (product of non-negative values)
   - Magnitudes ≥ 0 (sum of squares)
   - Result = dotProduct / (magnitude1 × magnitude2) ≥ 0
   - Maximum value = 1 (when vectors are identical)

3. **Edge case handling:**
   - **Zero denominator:** Returns `0` (line 746)
   - **Empty input:** Returns `0` (handled in `calculateTFIDFCosineSimilarity`)

**Range:** [0, 1]
- **0:** No similarity (orthogonal or zero vectors)
- **1:** Perfect match (identical vectors)
- **In between:** Degree of similarity

**✅ Output is guaranteed to be between 0 and 1**

---

### Is the Output Clamped or Adjusted?

**NO** — No clamping or adjustment needed

**Evidence:**
- **Line 748:** `return dotProduct / denominator;`
- **No Math.max() or Math.min():** No explicit clamping
- **No scaling:** No multiplication/addition after calculation
- **NaN handling:** Checked in wrapper function (line 780)

**Why not needed:**
- Cosine similarity with non-negative TF-IDF vectors naturally produces [0, 1]
- Zero denominator returns 0 (not NaN)
- Empty input returns 0 (checked before calculation)

**✅ No clamping or adjustment — natural [0, 1] range**

---

### Does Cosine Similarity Operate Directly on TF-IDF Vectors?

**YES** — Operates directly on TF-IDF vectors

**Evidence:**
- **Line 774:** `const queryVector = calculateTFIDFVectorAdjusted(queryDoc, allDocuments);`
- **Line 775:** `const runnerVector = calculateTFIDFVectorAdjusted(runnerDoc, allDocuments);`
- **Line 778:** `const similarity = cosineSimilarity(queryVector, runnerVector);`

**Input Type:**
- `vector1: Map<string, number>` — TF-IDF vector (term → TF-IDF score)
- `vector2: Map<string, number>` — TF-IDF vector (term → TF-IDF score)

**Process:**
1. Build TF-IDF vectors for query and runner history
2. Pass TF-IDF vectors directly to `cosineSimilarity`
3. Calculate cosine similarity between TF-IDF vectors

**✅ Cosine similarity operates directly on TF-IDF vectors**

---

## 🔗 Integration

### How is the Cosine Similarity Result Used?

**Direct Assignment to `tfidfScore`**

**Function:** `calculateTFIDFCosineSimilarity`

**Location:** Lines 754-781

```typescript
function calculateTFIDFCosineSimilarity(commissionCategories: string[], runnerHistory: string[]): number {
    // ... normalization ...
    
    const queryVector = calculateTFIDFVectorAdjusted(queryDoc, allDocuments);
    const runnerVector = calculateTFIDFVectorAdjusted(runnerDoc, allDocuments);
    
    // Calculate cosine similarity
    const similarity = cosineSimilarity(queryVector, runnerVector);
    
    return isNaN(similarity) ? 0 : similarity;
}
```

**Usage:**
- **Line 1152 (Errands):** `const tfidfScore = calculateTFIDFCosineSimilarity(errandCategories, runnerHistory);`
- **Line 1336 (Errands):** `const tfidfScore = calculateTFIDFCosineSimilarity(errandCategories, runnerHistory);`
- **Line 1890 (Commissions):** `const tfidfScore = calculateTFIDFCosineSimilarity(commissionTypes, runnerHistory);`
- **Line 2091 (Commissions):** `const tfidfScore = calculateTFIDFCosineSimilarity(commissionTypes, runnerHistory);`

**Result:**
- `tfidfScore` = cosine similarity result (0-1)
- No transformation after calculation
- Directly used in FinalScore calculation

---

### Is it Directly Assigned to tfidfScore?

**YES** — Direct assignment, no transformation

**Evidence:**
- **Line 1152:** `const tfidfScore = calculateTFIDFCosineSimilarity(...);`
- **Line 1170:** `tfidfScore: tfidfScore` (stored as-is)
- **Line 1159:** `finalScore = (distanceScore * 0.40) + (ratingScore * 0.35) + (tfidfScore * 0.25)`

**Flow:**
```
cosineSimilarity() → similarity (0-1)
  ↓
calculateTFIDFCosineSimilarity() → similarity (or 0 if NaN)
  ↓
tfidfScore = result (direct assignment)
  ↓
FinalScore = (distanceScore * 0.40) + (ratingScore * 0.35) + (tfidfScore * 0.25)
```

**No transformation:**
- ❌ No scaling (no multiplication)
- ❌ No offset (no addition)
- ❌ No clamping (not needed)
- ✅ Direct assignment

---

### Is it Transformed Afterward?

**NO** — No transformation after cosine similarity calculation

**Evidence:**
- **Line 778:** `const similarity = cosineSimilarity(...);`
- **Line 780:** `return isNaN(similarity) ? 0 : similarity;` (only NaN check)
- **Line 1152:** `const tfidfScore = calculateTFIDFCosineSimilarity(...);` (direct assignment)

**After assignment:**
- **Line 1159:** Used in FinalScore calculation with weight 0.25
- **No transformation:** `tfidfScore` is used directly in weighted sum

**✅ No transformation — used directly in FinalScore**

---

### Is the Same Logic Used for Errands and Commissions?

**YES** — Identical logic for both

**Evidence:**

**Same Function:**
- Both use `calculateTFIDFCosineSimilarity` (line 754)
- Same TF-IDF functions (`calculateTF`, `calculateIDFAdjusted`, `calculateTFIDFVectorAdjusted`)
- Same cosine similarity function (`cosineSimilarity`)

**Same Usage:**
- **Errands (Line 1152):** `const tfidfScore = calculateTFIDFCosineSimilarity(errandCategories, runnerHistory);`
- **Commissions (Line 1890):** `const tfidfScore = calculateTFIDFCosineSimilarity(commissionTypes, runnerHistory);`

**Same Weight:**
- **Line 1159 (Errands):** `finalScore = (distanceScore * 0.40) + (ratingScore * 0.35) + (tfidfScore * 0.25)`
- **Line 1897 (Commissions):** `finalScore = (distanceScore * 0.40) + (ratingScore * 0.35) + (tfidfScore * 0.25)`

**Only Difference:**
- **Input format:**
  - Errands: Single category → wrapped in array `[category]`
  - Commissions: Comma-separated string → split into array `["cat1", "cat2"]`
- **History source:**
  - Errands: `getRunnerErrandCategoryHistory()` (from `errand.category`)
  - Commissions: `getRunnerCategoryHistory()` (from `commission.commission_type`)

**✅ Identical TF-IDF and Cosine Similarity logic for both**

---

## 📊 Step-by-Step Flow

### Complete Flow: Task Category → tfidfScore

**Step 1: Input Preparation**
```
Errands:
  errand.category → [errandCategory.toLowerCase()]
  
Commissions:
  commission.commission_type → split(',') → ["cat1", "cat2"]
```

**Step 2: Runner History Fetching**
```
Errands:
  getRunnerErrandCategoryHistory(runner.id)
  → SELECT category FROM errand WHERE runner_id = ? AND status = 'completed'
  → ["groceries", "groceries", "delivery"]
  
Commissions:
  getRunnerCategoryHistory(runner.id)
  → SELECT commission_type FROM commission WHERE runner_id = ? AND status = 'completed'
  → ["logos", "posters", "logos"]
```

**Step 3: Normalization**
```
Line 760: queryDoc = commissionCategories.map(cat => cat.toLowerCase().trim())
Line 763: runnerDoc = runnerHistory.map(cat => cat.toLowerCase().trim())
```

**Step 4: TF-IDF Vector Construction**
```
Line 771: allDocuments = [queryDoc, runnerDoc]  // 2-document corpus
Line 774: queryVector = calculateTFIDFVectorAdjusted(queryDoc, allDocuments)
Line 775: runnerVector = calculateTFIDFVectorAdjusted(runnerDoc, allDocuments)

For each unique term:
  TF = count(term) / document.length
  IDF = calculateIDFAdjusted(term, allDocuments)
  TF-IDF = TF × IDF
```

**Step 5: Cosine Similarity**
```
Line 778: similarity = cosineSimilarity(queryVector, runnerVector)

Calculate:
  dotProduct = Σ(val1 × val2)
  magnitude1 = √(Σ(val1²))
  magnitude2 = √(Σ(val2²))
  similarity = dotProduct / (magnitude1 × magnitude2)
```

**Step 6: Result Assignment**
```
Line 780: return isNaN(similarity) ? 0 : similarity
Line 1152: const tfidfScore = result  // Direct assignment
```

**Step 7: FinalScore Calculation**
```
Line 1159: finalScore = (distanceScore * 0.40) + (ratingScore * 0.35) + (tfidfScore * 0.25)
```

---

## ✅ Summary

### TF-IDF Calculation
- **Location:** Lines 662-709 in `app/buddyrunner/home.tsx`
- **Input:** Category strings only (no titles/descriptions)
- **Formulas:** Standard TF, adjusted IDF, TF × IDF
- **IDF Scope:** Pairwise (2 documents: query + runner history)

### Cosine Similarity
- **Location:** Lines 730-749 in `app/buddyrunner/home.tsx`
- **Implementation:** Mathematically standard (dot product / magnitudes)
- **Output Range:** [0, 1] (guaranteed, no clamping needed)
- **Input:** Directly on TF-IDF vectors

### Integration
- **Function:** `calculateTFIDFCosineSimilarity` (Lines 754-781)
- **Result:** Directly assigned to `tfidfScore` (no transformation)
- **Usage:** Weight 0.25 in FinalScore calculation
- **Consistency:** Same logic for Errands and Commissions

### Complete Flow
```
Category → Normalize → TF-IDF Vectors → Cosine Similarity → tfidfScore → FinalScore
```
