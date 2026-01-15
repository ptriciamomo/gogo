# TF-IDF Input Source Clarification

## ✅ Summary

**TF-IDF uses ONLY category strings — no free-text fields are used.**

- **Errands:** Uses `errand.category` field only
- **Commissions:** Uses `commission.commission_type` field only
- **Category strings are treated as whole tokens** (not split into words)
- **Task title:** ❌ NOT used
- **Task description:** ❌ NOT used
- **Notes:** ❌ NOT used

---

## 📋 Exact Fields Used

### For Errands

**Task Input (Query Document):**
- **Field:** `errand.category` (type: `string | null`)
- **Location:** Line 1041 in `app/buddyrunner/home.tsx`
- **Code:**
  ```typescript
  const errandCategory = errand.category ? errand.category.trim() : null;
  ```
- **Usage:** Line 1151
  ```typescript
  const errandCategories = [errandCategory.toLowerCase()];
  const tfidfScore = calculateTFIDFCosineSimilarity(errandCategories, runnerHistory);
  ```
- **Database Query:** Line 911
  ```typescript
  .select("id, title, category, status, created_at, buddycaller_id, runner_id, notified_runner_id, notified_at, timeout_runner_ids")
  ```
  - Note: `title` is fetched but **NOT used** in TF-IDF

**Runner History Input:**
- **Field:** `errand.category` from completed errands
- **Location:** Lines 961-988 (`getRunnerErrandCategoryHistory`)
- **Database Query:** Line 965
  ```typescript
  .select("category")
  .eq("runner_id", runnerId)
  .eq("status", "completed")
  ```
- **Processing:** Lines 978-981
  ```typescript
  data.forEach((completedErrand: any) => {
      if (!completedErrand.category) return;
      allCategories.push(completedErrand.category.trim().toLowerCase());
  });
  ```
- **Result:** Array of category strings (e.g., `["groceries", "groceries", "delivery"]`)

---

### For Commissions

**Task Input (Query Document):**
- **Field:** `commission.commission_type` (type: `string | null`)
- **Location:** Lines 1766-1768 in `app/buddyrunner/home.tsx`
- **Code:**
  ```typescript
  const commissionTypes = commission.commission_type 
      ? commission.commission_type.split(',').map(t => t.trim()).filter(t => t.length > 0)
      : [];
  ```
- **Usage:** Line 1890
  ```typescript
  const tfidfScore = calculateTFIDFCosineSimilarity(commissionTypes, runnerHistory);
  ```
- **Database Query:** Line 1651
  ```typescript
  .select("id, title, commission_type, created_at, buddycaller_id, status, runner_id, declined_runner_id, notified_runner_id, notified_at, timeout_runner_ids")
  ```
  - Note: `title` is fetched but **NOT used** in TF-IDF

**Runner History Input:**
- **Field:** `commission.commission_type` from completed commissions
- **Location:** Lines 1729-1758 (`getRunnerCategoryHistory`)
- **Database Query:** Line 1734
  ```typescript
  .select("commission_type")
  .eq("runner_id", runnerId)
  .eq("status", "completed")
  ```
- **Processing:** Lines 1747-1751
  ```typescript
  data.forEach((completedCommission: any) => {
      if (!completedCommission.commission_type) return;
      // commission_type is stored as comma-separated string (e.g., "logos,posters")
      const categories = completedCommission.commission_type.split(',').map((t: string) => t.trim()).filter((t: string) => t.length > 0);
      allCategories.push(...categories);
  });
  ```
- **Result:** Array of category strings (e.g., `["logos", "posters", "logos"]`)

---

## 🔍 How Category Strings Are Treated

### Whole Tokens (Not Split into Words)

**Evidence:**
- **Line 760:** `commissionCategories.map(cat => cat.toLowerCase().trim())`
- **Line 763:** `runnerHistory.map(cat => cat.toLowerCase().trim())`
- **Line 664:** `document.filter(word => word === term)` — exact string matching

**Processing Steps:**
1. **Lowercase:** `"Groceries"` → `"groceries"`
2. **Trim:** `" groceries "` → `"groceries"`
3. **Exact Match:** `"groceries" === "groceries"` (whole string comparison)

**No Word Splitting:**
- `"grocery shopping"` is treated as **one token**: `"grocery shopping"`
- It is **NOT** split into `["grocery", "shopping"]`
- Matching requires exact string match: `"grocery shopping" === "grocery shopping"`

---

## ❌ Fields NOT Used

### Task Title

**Status:** ❌ **NOT USED**

**Evidence:**
- **Errands:** `title` is fetched (line 911) but never passed to TF-IDF
- **Commissions:** `title` is fetched (line 1651) but never passed to TF-IDF
- **Type Definition:** `title: string | null` exists in both `ErrandRowDB` and `CommissionRowDB` (lines 35, 51)
- **Usage:** Only used for UI display (line 1447), not for TF-IDF calculation

**Code Reference:**
- Line 911: `.select("id, title, category, ...")` — `title` fetched but unused
- Line 1151: `const errandCategories = [errandCategory.toLowerCase()];` — only category used
- Line 1890: `calculateTFIDFCosineSimilarity(commissionTypes, runnerHistory)` — only commission_type used

---

### Task Description

**Status:** ❌ **NOT USED**

**Evidence:**
- **Not in Database Schema:** No `description` field in `ErrandRowDB` or `CommissionRowDB` types
- **Not in Database Queries:** No `.select("description")` calls found
- **Not in TF-IDF Input:** Never passed to `calculateTFIDFCosineSimilarity`

**Type Definitions:**
- `ErrandRowDB` (lines 33-47): No `description` field
- `CommissionRowDB` (lines 49-61): No `description` field

---

### Notes

**Status:** ❌ **NOT USED**

**Evidence:**
- **Not in Database Schema:** No `notes` field in `ErrandRowDB` or `CommissionRowDB` types
- **Not in Database Queries:** No `.select("notes")` calls found
- **Not in TF-IDF Input:** Never passed to `calculateTFIDFCosineSimilarity`

---

## 🔄 Differences: Errands vs Commissions

### Input Format

**Errands:**
- **Single category:** `errand.category` is a single string (e.g., `"groceries"`)
- **Array creation:** Wrapped in array: `[errandCategory.toLowerCase()]`
- **Result:** Array with 1 element: `["groceries"]`

**Commissions:**
- **Comma-separated:** `commission.commission_type` can be comma-separated (e.g., `"logos,posters"`)
- **Array creation:** Split by comma: `commission.commission_type.split(',')`
- **Result:** Array with multiple elements: `["logos", "posters"]`

### Processing

**Errands:**
- Line 1041: `errand.category.trim()`
- Line 1151: `[errandCategory.toLowerCase()]`
- Line 980: Runner history: `completedErrand.category.trim().toLowerCase()`

**Commissions:**
- Line 1767: `commission.commission_type.split(',').map(t => t.trim())`
- Line 1750: Runner history: `commission_type.split(',').map(t => t.trim())`

**Both:**
- Lowercase conversion
- Trim whitespace
- Filter empty strings
- Exact string matching (no word splitting)

---

## 📊 Data Flow Summary

### Errands TF-IDF Input

```
Database Query (Line 911)
  ↓
errand.category (string | null)
  ↓
errandCategory = errand.category.trim() (Line 1041)
  ↓
errandCategories = [errandCategory.toLowerCase()] (Line 1151)
  ↓
calculateTFIDFCosineSimilarity(errandCategories, runnerHistory) (Line 1152)
```

**Runner History:**
```
Database Query (Line 965)
  ↓
SELECT category FROM errand WHERE runner_id = ? AND status = 'completed'
  ↓
allCategories.push(completedErrand.category.trim().toLowerCase()) (Line 980)
  ↓
runnerHistory = ["groceries", "groceries", "delivery"] (example)
```

---

### Commissions TF-IDF Input

```
Database Query (Line 1651)
  ↓
commission.commission_type (string | null, comma-separated)
  ↓
commissionTypes = commission.commission_type.split(',').map(t => t.trim()) (Line 1767)
  ↓
calculateTFIDFCosineSimilarity(commissionTypes, runnerHistory) (Line 1890)
```

**Runner History:**
```
Database Query (Line 1734)
  ↓
SELECT commission_type FROM commission WHERE runner_id = ? AND status = 'completed'
  ↓
commission_type.split(',').map(t => t.trim()) (Line 1750)
  ↓
runnerHistory = ["logos", "posters", "logos"] (example)
```

---

## ✅ Confirmation Checklist

### Task Input Fields

- ✅ **Category (Errands):** `errand.category` — **USED**
- ✅ **Commission Type (Commissions):** `commission.commission_type` — **USED**
- ❌ **Task Title:** `errand.title` / `commission.title` — **NOT USED**
- ❌ **Task Description:** Not in schema — **NOT USED**
- ❌ **Notes:** Not in schema — **NOT USED**

### Runner History Fields

- ✅ **Category (Errands):** `errand.category` from completed errands — **USED**
- ✅ **Commission Type (Commissions):** `commission.commission_type` from completed commissions — **USED**
- ❌ **Task Title:** Not fetched — **NOT USED**
- ❌ **Task Description:** Not in schema — **NOT USED**
- ❌ **Notes:** Not in schema — **NOT USED**

### String Processing

- ✅ **Whole tokens:** Category strings treated as complete units
- ❌ **Word splitting:** Categories are NOT split into individual words
- ✅ **Case normalization:** All converted to lowercase
- ✅ **Whitespace:** Trimmed but not split
- ✅ **Exact matching:** String equality comparison (`===`)

---

## 🎯 Final Answer

**Exactly which fields are used to generate the TF-IDF "terms"?**

- **Errands:** `errand.category` field only
- **Commissions:** `commission.commission_type` field only

**Confirm whether TF-IDF uses ONLY category strings or any free-text fields.**

- ✅ **ONLY category strings** — no free-text fields used

**Are category strings treated as whole tokens or split into words?**

- ✅ **Whole tokens** — categories are treated as complete strings, not split into words

**For errands vs commissions, are the TF-IDF inputs identical or different?**

- ⚠️ **Different format:**
  - **Errands:** Single category string → wrapped in array
  - **Commissions:** Comma-separated string → split into array
- ✅ **Same processing:** Both use lowercase, trim, exact matching

**Confirm explicitly:**

- **Task title:** ❌ **NOT USED** (fetched but not passed to TF-IDF)
- **Task description:** ❌ **NOT USED** (not in database schema)
- **Notes:** ❌ **NOT USED** (not in database schema)
