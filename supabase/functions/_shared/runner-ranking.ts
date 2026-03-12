// Shared Runner Ranking Module


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

// Step 1: Calculate Term Frequency (Task)
function calculateTF(term: string, document: string[]): number {
  if (document.length === 0) return 0;
  const termCount = document.filter(word => word === term).length;
  return termCount / document.length;
}
// Step 2: TF Calculation (Runner)
function calculateTFWithTaskCount(term: string, taskCategories: string[][], totalTasks: number): number {
  if (totalTasks === 0) return 0;
  const tasksWithCategory = taskCategories.filter(taskCats => 
    taskCats.some(cat => cat === term.toLowerCase())
  ).length;
  return tasksWithCategory / totalTasks;
}

// Step 3 & 4: Calculate Document Frequency & Inverse Document Frequency
function calculateIDFAdjusted(term: string, allDocuments: string[][]): number {
  const documentsContainingTerm = allDocuments.filter(doc => doc.includes(term)).length;
  if (documentsContainingTerm === 0) return 0;
  if (documentsContainingTerm === allDocuments.length) return 0.1; 
  return Math.log(allDocuments.length / documentsContainingTerm); // Step 4: IDF
}
//  Step 6: Construct TF-IDF Vector for Query Document 
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
// Step 7: Construct TF-IDF Vector for Runner Document
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
// Step 8: Calculate Cosine Similarity
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
// Step 9: // Main TF-IDF calculation function
function calculateTFIDFCosineSimilarity(
  taskCategories: string[],
  runnerHistory: string[],
  runnerTaskCategories: string[][] = [],
  runnerTotalTasks: number = 0
): number {
  if (taskCategories.length === 0 || runnerHistory.length === 0) {
    return 0;
  }
  // Collect Task Category
  const queryDoc = taskCategories.map(cat => cat.toLowerCase().trim()).filter(cat => cat.length > 0);
  const runnerDoc = runnerHistory.map(cat => cat.toLowerCase().trim()).filter(cat => cat.length > 0);
  if (queryDoc.length === 0 || runnerDoc.length === 0) {
    return 0;
  }
  // Step 5: Build Document Corpus
  const allDocuments = [queryDoc, runnerDoc];
  const queryVector = calculateTFIDFVectorAdjusted(queryDoc, allDocuments);
  // Step 7: Choose vector calculation method
  let runnerVector: Map<string, number>;
  if (runnerTaskCategories.length > 0 && runnerTotalTasks > 0) {
    runnerVector = calculateTFIDFVectorWithTaskCount(runnerTaskCategories, runnerTotalTasks, allDocuments);
  } else {
    runnerVector = calculateTFIDFVectorAdjusted(runnerDoc, allDocuments);
  }
  const similarity = cosineSimilarity(queryVector, runnerVector);
  return isNaN(similarity) ? 0 : similarity;
}

// Runner interface for ranking
export interface RunnerForRanking {
  id: string;
  latitude: number | null;
  longitude: number | null;
  average_rating: number | null;
}

// Ranked runner result
export interface RankedRunner {
  id: string;
  distance: number;
  distanceScore: number;
  ratingScore: number;
  tfidfScore: number;
  finalScore: number;
}

// Main ranking function
// Returns array of runner IDs in ranked order (highest score first)
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
