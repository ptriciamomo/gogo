# TF-IDF & Cosine Similarity - Exact Code Forensics

## Step 1 – Count Term Occurrences (Token-Based)

**File:** `app/buddyrunner/home.tsx`  
**Function:** `calculateTF`  
**Lines:** 713  
**Exact code:**
```typescript
const termCount = document.filter(word => word === term).length;
```
**Comment:**
```typescript
// STEP 1: Count term occurrences in document array using filter to match exact term, then get count via .length property
```
**How this code works:**
- `document.filter(word => word === term)` creates array of matching terms
- `.length` property counts total occurrences
- Result stored in `termCount` variable

---

## Step 1B – Get Total Document Length (Token-Based)

**File:** `app/buddyrunner/home.tsx`  
**Function:** `calculateTF`  
**Lines:** 714  
**Exact code:**
```typescript
return termCount / document.length;
```
**Comment:**
```typescript
// STEP 1B: Divide term count by total document length to compute token-based TF
```
**How this code works:**
- `document.length` gets total token count in document array
- Division operator `/` performs mathematical division
- Result is TF value returned directly

---

## Step 2 – Count Tasks Containing Category

**File:** `app/buddyrunner/home.tsx`  
**Function:** `calculateTFWithTaskCount`  
**Lines:** 722-724  
**Exact code:**
```typescript
const tasksWithCategory = taskCategories.filter(taskCats => 
    taskCats.some(cat => cat === term.toLowerCase())
).length;
```
**Comment:**
```typescript
// STEP 2: Count how many tasks contain the category term by filtering tasks where any category matches (case-insensitive), then get count via .length
```
**How this code works:**
- `taskCategories.filter(...)` filters tasks containing the term
- `taskCats.some(cat => cat === term.toLowerCase())` checks if any category in task matches
- `.length` counts matching tasks
- Result stored in `tasksWithCategory`

---

## Step 2B – Divide Tasks Count by Total Tasks

**File:** `app/buddyrunner/home.tsx`  
**Function:** `calculateTFWithTaskCount`  
**Lines:** 725  
**Exact code:**
```typescript
return tasksWithCategory / totalTasks;
```
**Comment:**
```typescript
// STEP 2B: Divide tasks containing category by total tasks to compute task-based TF
```
**How this code works:**
- `tasksWithCategory` is numerator (from Step 2)
- `totalTasks` is denominator (function parameter)
- Division operator `/` performs mathematical division
- Result is TF value returned directly

---

## Step 3 – Count Documents Containing Term (Document Frequency)

**File:** `app/buddyrunner/home.tsx`  
**Function:** `calculateIDFAdjusted`  
**Lines:** 742  
**Exact code:**
```typescript
const documentsContainingTerm = allDocuments.filter(doc => doc.includes(term)).length;
```
**Comment:**
```typescript
// STEP 3: Count documents containing term by filtering documents where term exists, then get count via .length property. This computes Document Frequency (DF).
```
**How this code works:**
- `allDocuments.filter(doc => doc.includes(term))` creates array of documents containing term
- `.length` property counts total documents
- Result stored in `documentsContainingTerm` (this is DF)

---

## Step 4 – Get Total Document Count (N)

**File:** `app/buddyrunner/home.tsx`  
**Function:** `calculateIDFAdjusted`  
**Lines:** 751  
**Exact code:**
```typescript
return Math.log(allDocuments.length / documentsContainingTerm);
```
**Comment:**
```typescript
// STEP 4: Get total document count N via allDocuments.length property, used in IDF calculation
```
**How this code works:**
- `allDocuments.length` gets total number of documents in corpus (N)
- Used as numerator in `N / df` calculation
- Part of larger expression on line 751

---

## Step 5 – Divide N by Document Frequency

**File:** `app/buddyrunner/home.tsx`  
**Function:** `calculateIDFAdjusted`  
**Lines:** 751  
**Exact code:**
```typescript
return Math.log(allDocuments.length / documentsContainingTerm);
```
**Comment:**
```typescript
// STEP 5: Divide total documents N by documents containing term (df) to compute N/df ratio
```
**How this code works:**
- `allDocuments.length` is numerator (N)
- `documentsContainingTerm` is denominator (df)
- Division operator `/` performs mathematical division
- Result is `N / df` ratio

---

## Step 6 – Apply Logarithm to N/df

**File:** `app/buddyrunner/home.tsx`  
**Function:** `calculateIDFAdjusted`  
**Lines:** 751  
**Exact code:**
```typescript
return Math.log(allDocuments.length / documentsContainingTerm);
```
**Comment:**
```typescript
// STEP 6: Apply natural logarithm to N/df ratio using Math.log() to compute IDF value
```
**How this code works:**
- `Math.log(...)` applies natural logarithm function
- Input is `N / df` ratio from Step 5
- Result is IDF value returned directly

---

## Step 7 – Apply IDF Smoothing (0.1)

**File:** `app/buddyrunner/home.tsx`  
**Function:** `calculateIDFAdjusted`  
**Lines:** 746-748  
**Exact code:**
```typescript
if (documentsContainingTerm === allDocuments.length) {
   
    return 0.1;
}
```
**Comment:**
```typescript
// STEP 7: Apply IDF smoothing by returning constant 0.1 when term appears in all documents (prevents zero IDF)
```
**How this code works:**
- Condition checks if `documentsContainingTerm === allDocuments.length` (term in all documents)
- If true, returns literal value `0.1` instead of computing log
- Bypasses division and logarithm operations

---

## Step 8 – Multiply TF × IDF (Query Document)

**File:** `app/buddyrunner/home.tsx`  
**Function:** `calculateTFIDFVectorAdjusted`  
**Lines:** 763-765  
**Exact code:**
```typescript
uniqueTerms.forEach(term => {
    const tf = calculateTF(term, document);
    const idf = calculateIDFAdjusted(term, allDocuments);
    tfidfMap.set(term, tf * idf);
});
```
**Comment:**
```typescript
// STEP 8: Multiply TF and IDF values using multiplication operator * to compute TF-IDF weight for each term in query document
```
**How this code works:**
- `calculateTF(term, document)` computes TF (calls Step 1/1B)
- `calculateIDFAdjusted(term, allDocuments)` computes IDF (calls Steps 3-7)
- `tf * idf` performs multiplication
- Result stored in map via `tfidfMap.set(term, tf * idf)`

---

## Step 9 – Multiply TF × IDF (Runner Document - Task-Based)

**File:** `app/buddyrunner/home.tsx`  
**Function:** `calculateTFIDFVectorWithTaskCount`  
**Lines:** 785-787  
**Exact code:**
```typescript
allTerms.forEach(term => {
    const tf = calculateTFWithTaskCount(term, taskCategories, totalTasks);
    const idf = calculateIDFAdjusted(term, allDocuments);
    tfidfMap.set(term, tf * idf);
});
```
**Comment:**
```typescript
// STEP 9: Multiply task-based TF and IDF values using multiplication operator * to compute TF-IDF weight for each term in runner document
```
**How this code works:**
- `calculateTFWithTaskCount(...)` computes task-based TF (calls Step 2/2B)
- `calculateIDFAdjusted(...)` computes IDF (calls Steps 3-7)
- `tf * idf` performs multiplication
- Result stored in map via `tfidfMap.set(term, tf * idf)`

---

## Step 10 – Multiply TF × IDF (Within calculateTFIDFCosineSimilarity - Runner)

**File:** `app/buddyrunner/home.tsx`  
**Function:** `calculateTFIDFCosineSimilarity`  
**Lines:** 941-943  
**Exact code:**
```typescript
const tf = runnerTFMap.get(term) || 0;
const idf = idfMap.get(term) || 0;
const tfidf = tf * idf;
```
**Comment:**
```typescript
// STEP 10: Multiply TF and IDF values retrieved from maps using multiplication operator * to compute TF-IDF weight for runner terms (for logging)
```
**How this code works:**
- `runnerTFMap.get(term) || 0` retrieves TF value (or 0 if missing)
- `idfMap.get(term) || 0` retrieves IDF value (or 0 if missing)
- `tf * idf` performs multiplication
- Result stored in `tfidf` variable

---

## Step 11 – Multiply TF × IDF (Within calculateTFIDFCosineSimilarity - Query)

**File:** `app/buddyrunner/home.tsx`  
**Function:** `calculateTFIDFCosineSimilarity`  
**Lines:** 952-954  
**Exact code:**
```typescript
const tf = calculateTF(term, queryDoc);
const idf = idfMap.get(term) || 0;
const tfidf = tf * idf;
```
**Comment:**
```typescript
// STEP 11: Multiply TF and IDF values using multiplication operator * to compute TF-IDF weight for query terms (for logging)
```
**How this code works:**
- `calculateTF(term, queryDoc)` computes TF (calls Step 1/1B)
- `idfMap.get(term) || 0` retrieves IDF value (or 0 if missing)
- `tf * idf` performs multiplication
- Result stored in `tfidf` variable

---

## Step 12 – Build Document Corpus Array

**File:** `app/buddyrunner/home.tsx`  
**Function:** `calculateTFIDFCosineSimilarity`  
**Lines:** 897  
**Exact code:**
```typescript
const allDocuments = [queryDoc, runnerDoc];
```
**Comment:**
```typescript
// STEP 12: Build document corpus array containing exactly 2 documents: query document and runner document
```
**How this code works:**
- Array literal `[queryDoc, runnerDoc]` creates 2-element array
- `queryDoc` is first document (task categories)
- `runnerDoc` is second document (runner history)
- Result stored in `allDocuments` variable

---

## Step 13 – Compute Dot Product (Within cosineSimilarity)

**File:** `app/buddyrunner/home.tsx`  
**Function:** `cosineSimilarity`  
**Lines:** 822-825  
**Exact code:**
```typescript
allTerms.forEach(term => {
    const val1 = vector1.get(term) || 0;
    const val2 = vector2.get(term) || 0;
    dotProduct += val1 * val2;
});
```
**Comment:**
```typescript
// STEP 13: Compute dot product by iterating all terms, multiplying corresponding vector values, and accumulating sum using += operator
```
**How this code works:**
- `vector1.get(term) || 0` retrieves value from first vector (or 0 if missing)
- `vector2.get(term) || 0` retrieves value from second vector (or 0 if missing)
- `val1 * val2` multiplies corresponding values
- `dotProduct += ...` accumulates sum using addition assignment operator
- Result accumulates in `dotProduct` variable

---

## Step 14 – Compute Dot Product (Within calculateTFIDFCosineSimilarity)

**File:** `app/buddyrunner/home.tsx`  
**Function:** `calculateTFIDFCosineSimilarity`  
**Lines:** 985-988  
**Exact code:**
```typescript
allTerms.forEach(term => {
    const val1 = queryVector.get(term) || 0;
    const val2 = runnerVector.get(term) || 0;
    dotProduct += val1 * val2;
});
```
**Comment:**
```typescript
// STEP 14: Compute dot product by iterating all terms, multiplying corresponding vector values, and accumulating sum using += operator (for logging)
```
**How this code works:**
- `queryVector.get(term) || 0` retrieves value from query vector (or 0 if missing)
- `runnerVector.get(term) || 0` retrieves value from runner vector (or 0 if missing)
- `val1 * val2` multiplies corresponding values
- `dotProduct += ...` accumulates sum using addition assignment operator
- Result accumulates in `dotProduct` variable

---

## Step 15 – Compute Vector Magnitude Squared (magnitude1)

**File:** `app/buddyrunner/home.tsx`  
**Function:** `cosineSimilarity`  
**Lines:** 826  
**Exact code:**
```typescript
magnitude1 += val1 * val1;
```
**Comment:**
```typescript
// STEP 15: Compute sum of squared values for first vector by squaring each value and accumulating using += operator
```
**How this code works:**
- `val1 * val1` squares the value (multiplies by itself)
- `magnitude1 += ...` accumulates sum using addition assignment operator
- Result accumulates in `magnitude1` variable (this is sum of squares, not final magnitude)

---

## Step 16 – Compute Vector Magnitude Squared (magnitude2)

**File:** `app/buddyrunner/home.tsx`  
**Function:** `cosineSimilarity`  
**Lines:** 827  
**Exact code:**
```typescript
magnitude2 += val2 * val2;
```
**Comment:**
```typescript
// STEP 16: Compute sum of squared values for second vector by squaring each value and accumulating using += operator
```
**How this code works:**
- `val2 * val2` squares the value (multiplies by itself)
- `magnitude2 += ...` accumulates sum using addition assignment operator
- Result accumulates in `magnitude2` variable (this is sum of squares, not final magnitude)

---

## Step 17 – Compute Vector Magnitude Squared (Within calculateTFIDFCosineSimilarity - magnitude1)

**File:** `app/buddyrunner/home.tsx`  
**Function:** `calculateTFIDFCosineSimilarity`  
**Lines:** 989  
**Exact code:**
```typescript
magnitude1 += val1 * val1;
```
**Comment:**
```typescript
// STEP 17: Compute sum of squared values for query vector by squaring each value and accumulating using += operator (for logging)
```
**How this code works:**
- `val1 * val1` squares the value (multiplies by itself)
- `magnitude1 += ...` accumulates sum using addition assignment operator
- Result accumulates in `magnitude1` variable

---

## Step 18 – Compute Vector Magnitude Squared (Within calculateTFIDFCosineSimilarity - magnitude2)

**File:** `app/buddyrunner/home.tsx`  
**Function:** `calculateTFIDFCosineSimilarity`  
**Lines:** 990  
**Exact code:**
```typescript
magnitude2 += val2 * val2;
```
**Comment:**
```typescript
// STEP 18: Compute sum of squared values for runner vector by squaring each value and accumulating using += operator (for logging)
```
**How this code works:**
- `val2 * val2` squares the value (multiplies by itself)
- `magnitude2 += ...` accumulates sum using addition assignment operator
- Result accumulates in `magnitude2` variable

---

## Step 19 – Compute Square Root of Magnitude (magnitude1)

**File:** `app/buddyrunner/home.tsx`  
**Function:** `cosineSimilarity`  
**Lines:** 830  
**Exact code:**
```typescript
const denominator = Math.sqrt(magnitude1) * Math.sqrt(magnitude2);
```
**Comment:**
```typescript
// STEP 19: Compute square root of sum of squares for first vector using Math.sqrt() to get Euclidean magnitude
```
**How this code works:**
- `Math.sqrt(magnitude1)` applies square root function to sum of squares
- Result is Euclidean magnitude (L2 norm) of first vector
- Used as part of denominator calculation

---

## Step 20 – Compute Square Root of Magnitude (magnitude2)

**File:** `app/buddyrunner/home.tsx`  
**Function:** `cosineSimilarity`  
**Lines:** 830  
**Exact code:**
```typescript
const denominator = Math.sqrt(magnitude1) * Math.sqrt(magnitude2);
```
**Comment:**
```typescript
// STEP 20: Compute square root of sum of squares for second vector using Math.sqrt() to get Euclidean magnitude
```
**How this code works:**
- `Math.sqrt(magnitude2)` applies square root function to sum of squares
- Result is Euclidean magnitude (L2 norm) of second vector
- Used as part of denominator calculation

---

## Step 21 – Multiply Magnitudes to Get Denominator

**File:** `app/buddyrunner/home.tsx`  
**Function:** `cosineSimilarity`  
**Lines:** 830  
**Exact code:**
```typescript
const denominator = Math.sqrt(magnitude1) * Math.sqrt(magnitude2);
```
**Comment:**
```typescript
// STEP 21: Multiply two vector magnitudes using * operator to compute denominator for cosine similarity
```
**How this code works:**
- `Math.sqrt(magnitude1)` is first magnitude (from Step 19)
- `Math.sqrt(magnitude2)` is second magnitude (from Step 20)
- `*` operator performs multiplication
- Result stored in `denominator` variable

---

## Step 22 – Compute Square Root of Magnitude (Within calculateTFIDFCosineSimilarity - taskMagnitude)

**File:** `app/buddyrunner/home.tsx`  
**Function:** `calculateTFIDFCosineSimilarity`  
**Lines:** 993  
**Exact code:**
```typescript
const taskMagnitude = Math.sqrt(magnitude1);
```
**Comment:**
```typescript
// STEP 22: Compute square root of sum of squares for query vector using Math.sqrt() to get Euclidean magnitude (for logging)
```
**How this code works:**
- `Math.sqrt(magnitude1)` applies square root function to sum of squares
- Result is Euclidean magnitude of query vector
- Stored in `taskMagnitude` variable

---

## Step 23 – Compute Square Root of Magnitude (Within calculateTFIDFCosineSimilarity - runnerMagnitude)

**File:** `app/buddyrunner/home.tsx`  
**Function:** `calculateTFIDFCosineSimilarity`  
**Lines:** 994  
**Exact code:**
```typescript
const runnerMagnitude = Math.sqrt(magnitude2);
```
**Comment:**
```typescript
// STEP 23: Compute square root of sum of squares for runner vector using Math.sqrt() to get Euclidean magnitude (for logging)
```
**How this code works:**
- `Math.sqrt(magnitude2)` applies square root function to sum of squares
- Result is Euclidean magnitude of runner vector
- Stored in `runnerMagnitude` variable

---

## Step 24 – Multiply Magnitudes to Get Denominator (Within calculateTFIDFCosineSimilarity)

**File:** `app/buddyrunner/home.tsx`  
**Function:** `calculateTFIDFCosineSimilarity`  
**Lines:** 995  
**Exact code:**
```typescript
const denominator = taskMagnitude * runnerMagnitude;
```
**Comment:**
```typescript
// STEP 24: Multiply two vector magnitudes using * operator to compute denominator for cosine similarity (for logging)
```
**How this code works:**
- `taskMagnitude` is query vector magnitude (from Step 22)
- `runnerMagnitude` is runner vector magnitude (from Step 23)
- `*` operator performs multiplication
- Result stored in `denominator` variable

---

## Step 25 – Check for Zero Denominator

**File:** `app/buddyrunner/home.tsx`  
**Function:** `cosineSimilarity`  
**Lines:** 831  
**Exact code:**
```typescript
if (denominator === 0) return 0;
```
**Comment:**
```typescript
// STEP 25: Check if denominator equals zero using === operator, return 0 if true to prevent division by zero
```
**How this code works:**
- `denominator === 0` compares denominator to zero using strict equality
- If true, function returns literal `0` immediately
- Prevents division by zero error

---

## Step 26 – Divide Dot Product by Denominator (Final Cosine Similarity)

**File:** `app/buddyrunner/home.tsx`  
**Function:** `cosineSimilarity`  
**Lines:** 833  
**Exact code:**
```typescript
return dotProduct / denominator;
```
**Comment:**
```typescript
// STEP 26: Divide dot product by product of magnitudes using / operator to compute final cosine similarity score
```
**How this code works:**
- `dotProduct` is numerator (from Step 13)
- `denominator` is product of magnitudes (from Step 21)
- Division operator `/` performs mathematical division
- Result is cosine similarity value (0-1 range) returned directly

---

## Additional Operations

### Count Term Occurrences in Query Document (For Logging)

**File:** `app/buddyrunner/home.tsx`  
**Function:** `calculateTFIDFCosineSimilarity`  
**Lines:** 956  
**Exact code:**
```typescript
const termCount = queryDoc.filter(word => word === term).length;
```
**Comment:**
```typescript
// Count term occurrences in query document for logging purposes (same logic as Step 1)
```

### Count Term Occurrences in Runner Document (For Logging)

**File:** `app/buddyrunner/home.tsx`  
**Function:** `calculateTFIDFCosineSimilarity`  
**Lines:** 920  
**Exact code:**
```typescript
taskCount = runnerDoc.filter(word => word === term).length;
```
**Comment:**
```typescript
// Count term occurrences in runner document for logging purposes (same logic as Step 1)
```

### Count Tasks Per Category (Task-Based Counting)

**File:** `app/buddyrunner/home.tsx`  
**Function:** `calculateTFIDFCosineSimilarity`  
**Lines:** 872-876  
**Exact code:**
```typescript
runnerTaskCategories.forEach(taskCats => {
    const uniqueCatsInTask = Array.from(new Set(taskCats));
    uniqueCatsInTask.forEach(cat => {
        runnerCategoryTaskCounts.set(cat, (runnerCategoryTaskCounts.get(cat) || 0) + 1);
    });
});
```
**Comment:**
```typescript
// Count tasks per category by iterating tasks, extracting unique categories per task, and incrementing count in map using +1
```
**How this code works:**
- `Array.from(new Set(taskCats))` gets unique categories in each task
- `runnerCategoryTaskCounts.get(cat) || 0` retrieves current count (or 0)
- `(... || 0) + 1` increments count by 1
- `set(cat, ...)` stores updated count in map

### Count Categories Per Category (Token-Based Fallback)

**File:** `app/buddyrunner/home.tsx`  
**Function:** `calculateTFIDFCosineSimilarity`  
**Lines:** 880-882  
**Exact code:**
```typescript
runnerDoc.forEach(cat => {
    runnerCategoryTaskCounts.set(cat, (runnerCategoryTaskCounts.get(cat) || 0) + 1);
});
```
**Comment:**
```typescript
// Count category occurrences in runner document by iterating categories and incrementing count in map using +1 (token-based fallback)
```
**How this code works:**
- `runnerDoc.forEach(...)` iterates each category token
- `runnerCategoryTaskCounts.get(cat) || 0` retrieves current count (or 0)
- `(... || 0) + 1` increments count by 1
- `set(cat, ...)` stores updated count in map
