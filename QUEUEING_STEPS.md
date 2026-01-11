STEP 1 — Errands: rule-based eligibility (auth + availability)  
app/buddyrunner/home.tsx — lines 722–751 (useAvailableErrands)
```722:751:app/buddyrunner/home.tsx
const { data: auth } = await supabase.auth.getUser();
const uid = auth?.user?.id ?? null;
if (!uid) { setRows([]); setLoading(false); return; }
const { data: runnerData } = await supabase
  .from("users").select("is_available, latitude, longitude")
  .eq("id", uid).single();
if (!runnerData?.is_available) { setRows([]); setLoading(false); return; }
```
Explanation: Errands (mobile/web) – only authenticated, online runners proceed.

STEP 2 — Errands: GPS resolve + 500m distance filter  
app/buddyrunner/home.tsx — lines 752–830 (useAvailableErrands)
```752:830:app/buddyrunner/home.tsx
locationResult = await LocationService.getCurrentLocation();
// retries, fall back to DB location
const distanceKm = LocationService.calculateDistance(
  runnerLat, runnerLon, callerLocation.latitude, callerLocation.longitude);
const distanceMeters = distanceKm * 1000;
if (distanceMeters > effectiveDistanceLimit) return false;
```
Explanation: Errands – fetch runner location, adjust effectiveDistanceLimit, filter to <=500m (buffered when GPS is poor).

STEP 3 — Errands: ranking + scoring + assignment  
app/buddyrunner/home.tsx — lines 1004–1123 (useAvailableErrands → shouldShowErrand)
```1004:1123:app/buddyrunner/home.tsx
if (!errand.notified_runner_id) {
  // rank eligible runners
  const count = await getRunnerCompletedErrandsCount(runner.id, errandCategory);
  const runnerHistory = await getRunnerErrandCategoryHistory(runner.id);
  const tfidfScore = calculateTFIDFCosineSimilarity(errandCategories, runnerHistory);
  const rating = (runner.average_rating || 0) / 5;
  const finalScore = (count * 0.5) + (tfidfScore * 0.2) + (rating * 0.3);
  eligibleRunners.sort((a,b)=> b.finalScore - a.finalScore || a.distance - b.distance);
  const topRunner = eligibleRunners[0];
  await updateErrandNotification(errand.id, topRunner.id, new Date().toISOString());
  if (topRunner.id === uid) return true; return false;
}
```
Explanation: Errands – compute weighted score (experience 50%, TF-IDF 20%, rating 30%), distance tiebreaker, assign top runner and gate visibility to them for 60s.

STEP 4 — Commissions: rule-based eligibility (auth + availability)  
app/buddyrunner/home.tsx — lines 1331–1364 (useAvailableCommissions)
```1331:1364:app/buddyrunner/home.tsx
const { data: auth } = await supabase.auth.getUser();
const uid = auth?.user?.id ?? null;
if (!uid) { setRows([]); setLoading(false); return; }
const { data: runnerData } = await supabase
  .from("users").select("is_available, latitude, longitude")
  .eq("id", uid).single();
if (!runnerData?.is_available) { setRows([]); setLoading(false); return; }
```
Explanation: Commissions – same rule gate before any ranking.

STEP 5 — Commissions: GPS resolve + 500m distance filter  
app/buddyrunner/home.tsx — lines 1378–1642 (useAvailableCommissions)
```1378:1642:app/buddyrunner/home.tsx
locationResult = await LocationService.getCurrentLocation(); // retries then DB fallback
// effectiveDistanceLimit = 500m, buffered if GPS accuracy > 500
const distanceKm = LocationService.calculateDistance(
  runnerLat, runnerLon, callerLocation.latitude, callerLocation.longitude);
const distanceMeters = distanceKm * 1000;
if (distanceMeters > effectiveDistanceLimit) return false;
```
Explanation: Commissions – resolve runner location, adjust distance limit, keep only callers within range.

STEP 6 — Commissions: ranking + scoring + assignment  
app/buddyrunner/home.tsx — lines 1748–1878 (useAvailableCommissions → shouldShowCommission)
```1748:1878:app/buddyrunner/home.tsx
if (!commission.notified_runner_id) {
  const count = await getRunnerCompletedCount(runner.id, commissionTypes);
  const runnerHistory = await getRunnerCategoryHistory(runner.id);
  const tfidfScore = calculateTFIDFCosineSimilarity(commissionTypes, runnerHistory);
  const rating = (runner.average_rating || 0) / 5;
  const finalScore = (count * 0.5) + (tfidfScore * 0.2) + (rating * 0.3);
  eligibleRunners.sort((a,b)=> b.finalScore - a.finalScore || a.distance - b.distance);
  const topRunner = eligibleRunners[0];
  await supabase.rpc('update_commission_notification', { ... });
  if (topRunner.id === uid) return true; return false;
}
```
Explanation: Commissions – same weighted score and distance tiebreaker; RPC sets `notified_runner_id` and visibility.

STEP 7 — TF-IDF + cosine similarity helper (shared)  
app/buddyrunner/home.tsx — lines 629–711
```629:711:app/buddyrunner/home.tsx
const queryVector = calculateTFIDFVectorAdjusted(queryDoc, allDocuments);
const runnerVector = calculateTFIDFVectorAdjusted(runnerDoc, allDocuments);
const similarity = cosineSimilarity(queryVector, runnerVector);
```
Explanation: Shared scoring term for errands and commissions.

STEP 8 — Distance helper (used by both flows)  
components/LocationService.ts — lines 27–120
```27:60:components/LocationService.ts
class LocationService {
  public static getInstance(): LocationService { ... }
  public async getCurrentLocation(): Promise<LocationResult> { ... }
}
```
Explanation: Provides GPS/web geolocation used in runner home filters and distance checks.

STEP 9 — Mapping (Leaflet + OpenStreetMap) mobile  
app/buddyrunner/view_map.tsx — lines 50–108 (WebView HTML generator)
```50:108:app/buddyrunner/view_map.tsx
const generateMapHTML = (...) => `
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18 }).addTo(map);
`;
```
Explanation: Mobile (React Native) renders Leaflet + OSM inside a WebView.

STEP 10 — Mapping (Leaflet + OpenStreetMap) web  
app/buddyrunner/view_map_web.tsx — lines 92–173
```92:173:app/buddyrunner/view_map_web.tsx
const map = L.map('map', { center: defaultCenter, zoom: defaultZoom });
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenStreetMap contributors', maxZoom: 18,
}).addTo(map);
```
Explanation: Web map uses Leaflet directly with OSM tiles.

