# Location and Distance Calculation - Exact Implementation

## Location / Distance Step 1 – Get Runner Location via GPS with Retries

**File:** `app/buddyrunner/home.tsx`  
**Lines:** 1114-1148  
**Exact code:**
```typescript
try {
    let locationResult;
    const maxRetries = 3;
    let retryCount = 0;

    while (retryCount < maxRetries) {
        try {
            if (retryCount > 0) {
                await new Promise((resolve) => setTimeout(resolve, 500 * retryCount));
            }

            locationResult = await LocationService.getCurrentLocation();

            if (locationResult.success && locationResult.location) {
                const accuracy = locationResult.location.accuracy || 0;
                gpsAccuracy = accuracy;

                // If accuracy extremely poor (> 500m), allow retry up to max
                if (accuracy > 500 && retryCount + 1 < maxRetries) {
                    retryCount++;
                    continue;
                }

                runnerLat = locationResult.location.latitude;
                runnerLon = locationResult.location.longitude;
                locationSource = "gps";
                break;
            } else {
                retryCount++;
            }
        } catch (err) {
            retryCount++;
            if (retryCount >= maxRetries) break;
        }
    }
} catch (err) {
    if (__DEV__) console.error("❌ Error resolving GPS location for errands:", err);
}
```
**Comment:**
```typescript
// Attempts to get runner's current GPS location via LocationService.getCurrentLocation() with up to 3 retries. If GPS accuracy is > 500m, retries up to maxRetries. On success, extracts latitude and longitude from locationResult.location. Sets locationSource to "gps".
```

---

## Location / Distance Step 2 – Fallback to Database Location

**File:** `app/buddyrunner/home.tsx`  
**Lines:** 1153-1170  
**Exact code:**
```typescript
// GPS failed: fallback to database location
if (runnerLat === null || runnerLon === null) {
    if (
        runnerData &&
        typeof runnerData.latitude === "number" &&
        typeof runnerData.longitude === "number"
    ) {
        runnerLat = runnerData.latitude;
        runnerLon = runnerData.longitude;
        locationSource = "database";
        if (__DEV__) console.log("📍 [ERRANDS] Using database location fallback:", { runnerLat, runnerLon });
    } else {
        if (__DEV__) console.warn("❌ No runner location available; cannot filter errands by distance.");
        setRows([]);
        setLoading(false);
        return;
    }
}
```
**Comment:**
```typescript
// If GPS location retrieval failed (runnerLat or runnerLon is null), falls back to runnerData.latitude and runnerData.longitude from database. Validates that both are numbers before using. If no location available, returns early and sets rows to empty array.
```

---

## Location / Distance Step 3 – Fetch Caller Locations from Database

**File:** `app/buddyrunner/home.tsx`  
**Lines:** 1188-1206  
**Exact code:**
```typescript
const callerIds = Array.from(
    new Set(errands.map((r) => r.buddycaller_id).filter((v): v is string => !!v))
);

let namesById: Record<string, string> = {};
let callerLocations: Record<string, { latitude: number; longitude: number }> = {};
if (callerIds.length) {
    const { data: users } = await supabase
        .from("users")
        .select("id, first_name, last_name, latitude, longitude")
        .in("id", callerIds);
    (users || []).forEach((u: UserRow & { latitude?: number; longitude?: number }) => {
        const full = `${titleCase(u.first_name || "")} ${titleCase(u.last_name || "")}`.trim();
        namesById[u.id] = full || "BuddyCaller";
        if (typeof u.latitude === "number" && typeof u.longitude === "number") {
            callerLocations[u.id] = { latitude: u.latitude, longitude: u.longitude };
        }
    });
}
```
**Comment:**
```typescript
// Extracts unique caller IDs from errands, queries users table for caller locations. Filters results to only include callers where both latitude and longitude are numbers. Stores caller locations in callerLocations map keyed by caller ID.
```

---

## Location / Distance Step 4 – Pre-Ranking Distance Filtering (500m Threshold)

**File:** `app/buddyrunner/home.tsx`  
**Lines:** 1210-1227  
**Exact code:**
```typescript
const filteredErrands = errands.filter((errand) => {
    const callerLocation = callerLocations[errand.buddycaller_id || ""];
    if (!callerLocation) return false;

    const distanceKm = LocationService.calculateDistance(
        runnerLat as number,
        runnerLon as number,
        callerLocation.latitude,
        callerLocation.longitude
    );
    const distanceMeters = distanceKm * 1000;

    if (distanceMeters > 500) {
        return false;
    }

    return true;
});
```
**Comment:**
```typescript
// Filters errands to only those within 500 meters. For each errand, gets caller location from callerLocations map. Calls LocationService.calculateDistance() with runner and caller coordinates. Converts result from kilometers to meters by multiplying by 1000. Excludes errands where distanceMeters > 500.
```

---

## Location / Distance Step 5 – Haversine Distance Calculation Implementation

**File:** `components/LocationService.ts`  
**Lines:** 282-297  
**Exact code:**
```typescript
public calculateDistance(
    lat1: number, 
    lon1: number, 
    lat2: number, 
    lon2: number
): number {
    const R = 6371; // Earth's radius in kilometers
    const dLat = this.deg2rad(lat2 - lat1);
    const dLon = this.deg2rad(lon2 - lon1);
    const a = 
        Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(this.deg2rad(lat1)) * Math.cos(this.deg2rad(lat2)) * 
        Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}
```
**Comment:**
```typescript
// Implements Haversine formula to calculate great-circle distance between two coordinates. Converts latitude/longitude differences to radians using deg2rad(). Computes intermediate value 'a' using sin and cos functions. Computes central angle 'c' using atan2. Returns distance in kilometers by multiplying Earth's radius (6371 km) by central angle.
```

---

## Location / Distance Step 6 – Degree to Radian Conversion

**File:** `components/LocationService.ts`  
**Lines:** 299-301  
**Exact code:**
```typescript
private deg2rad(deg: number): number {
    return deg * (Math.PI/180);
}
```
**Comment:**
```typescript
// Converts degrees to radians by multiplying degree value by Math.PI/180. Used internally by calculateDistance() to convert latitude/longitude differences to radians for trigonometric calculations.
```

---

## Location / Distance Step 7 – Distance Calculation During Runner Ranking

**File:** `app/buddyrunner/home.tsx`  
**Lines:** 1429-1437  
**Exact code:**
```typescript
// STEP 6A: Calculate distance between runner and caller
// Purpose: Uses Haversine formula to compute distance in kilometers, then converts to meters for comparison against 500m threshold.
const distanceKm = LocationService.calculateDistance(
    lat,
    lon,
    callerLocation.latitude,
    callerLocation.longitude
);
const distanceMeters = distanceKm * 1000;
```
**Comment:**
```typescript
// Calculates distance between candidate runner (lat, lon) and caller location using LocationService.calculateDistance(). Converts result from kilometers to meters by multiplying by 1000. Used during runner ranking to filter runners beyond 500m threshold.
```

---

## Location / Distance Step 8 – Distance-Based Runner Filtering (500m Threshold)

**File:** `app/buddyrunner/home.tsx`  
**Lines:** 1441-1446  
**Exact code:**
```typescript
// Only consider runners within 500 meters
if (distanceMeters > 500) {
    console.log(`Runner: ${runnerName} — ${distanceMeters.toFixed(2)}m ❌ excluded`);
    runnersExcluded++;
    continue;
}
```
**Comment:**
```typescript
// Filters out runners where distanceMeters exceeds 500. If distance > 500, logs exclusion message and continues to next runner (skips ranking for this runner). Uses strict > comparison, so exactly 500m is included.
```

---

## Location / Distance Step 9 – Distance Score Calculation (Normalized 0-1)

**File:** `app/buddyrunner/home.tsx`  
**Lines:** 1451-1453  
**Exact code:**
```typescript
// STEP 6B: Calculate distance score

const distanceScore = Math.max(0, 1 - (distanceMeters / 500));
```
**Comment:**
```typescript
// Computes normalized distance score where 0m = 1.0 (best) and 500m = 0.0 (worst). Formula: 1 - (distanceMeters / 500). Uses Math.max(0, ...) to ensure score never goes below 0 for distances > 500m. This score is weighted at 40% in final runner ranking.
```

---

## Location / Distance Step 10 – Get Current Location Implementation (GPS)

**File:** `components/LocationService.ts`  
**Lines:** 78-250  
**Exact code:**
```typescript
public async getCurrentLocation(): Promise<LocationResult> {
    try {
        if (__DEV__) {
            console.log('🔍 [LocationService] Starting getCurrentLocation...');
            console.log('🔍 [LocationService] Platform:', Platform.OS);
            console.log('🔍 [LocationService] Current permission status:', this.locationPermissionGranted);
        }
        
        if (this.isWeb()) {
            // Use browser's geolocation API for web
            if (!navigator.geolocation) {
                return {
                    success: false,
                    error: 'Geolocation is not supported by this browser'
                };
            }

            if (__DEV__) {
                console.log('🔄 [Web] Requesting current GPS position via browser API...');
                console.log('🔄 [Web] This will trigger the browser permission prompt if not already granted');
            }
            const startTime = Date.now();

            return new Promise((resolve) => {
                // Use a longer timeout to allow user to respond to permission prompt
                const timeoutId = setTimeout(() => {
                    console.error('❌ [Web] Location request timeout');
                    this.locationPermissionGranted = false;
                    resolve({
                        success: false,
                        error: 'Location request timeout. Please try again.'
                    });
                }, 30000); // 30 second timeout to allow for permission prompt

                navigator.geolocation.getCurrentPosition(
                    (position) => {
                        clearTimeout(timeoutId);
                        const requestTime = Date.now() - startTime;
                        if (__DEV__) console.log(`✅ [Web] GPS position obtained in ${requestTime}ms`);

                        const locationData: LocationData = {
                            latitude: position.coords.latitude,
                            longitude: position.coords.longitude,
                            accuracy: position.coords.accuracy || 0,
                            timestamp: new Date(position.timestamp)
                        };

                        if (__DEV__) {
                            console.log('📍 [Web] Location data:', {
                                latitude: locationData.latitude,
                                longitude: locationData.longitude,
                                accuracy: locationData.accuracy,
                                timestamp: locationData.timestamp.toISOString()
                            });
                            console.log(`\n📍 [Web] GPS LOCATION OBTAINED: (${locationData.latitude.toFixed(8)}, ${locationData.longitude.toFixed(8)}) accuracy: ${locationData.accuracy.toFixed(2)}m`);
                        }

                        // Cache the location
                        this.lastKnownLocation = locationData;
                        this.locationPermissionGranted = true;

                        resolve({
                            success: true,
                            location: locationData
                        });
                    },
                    (error) => {
                        clearTimeout(timeoutId);
                        console.error('❌ [Web] Error getting current location:', error);
                        console.error('❌ [Web] Error details:', {
                            code: error.code,
                            message: error.message
                        });

                        let errorMessage = 'Failed to get current location';
                        if (error.code === 1) {
                            errorMessage = 'Location permission denied. Please allow location access in your browser settings.';
                            this.locationPermissionGranted = false;
                        } else if (error.code === 2) {
                            errorMessage = 'Location unavailable. Please check your device location settings.';
                        } else if (error.code === 3) {
                            errorMessage = 'Location request timeout. Please try again.';
                        }

                        resolve({
                            success: false,
                            error: errorMessage
                        });
                    },
                    {
                        enableHighAccuracy: true,
                        timeout: 20000, // 20 second timeout for the geolocation API itself
                        maximumAge: 0 // Don't use cached position
                    }
                );
            });
        } else {
            // Use expo-location for native platforms
            // Check if permission is granted
            if (!this.locationPermissionGranted) {
                if (__DEV__) console.log('⚠️ [Native] Permission not granted, requesting...');
                const permissionGranted = await this.requestLocationPermission();
                if (__DEV__) console.log('📋 [Native] Permission request result:', permissionGranted);
                if (!permissionGranted) {
                    console.error('❌ [Native] Location permission denied');
                    return {
                        success: false,
                        error: 'Location permission denied'
                    };
                }
            }

            if (__DEV__) console.log('🔄 [Native] Requesting current GPS position...');
            const startTime = Date.now();
            
            // Get current position with high accuracy for better filtering
            const location = await Location.getCurrentPositionAsync({
                accuracy: Location.Accuracy.High, // Use High accuracy instead of Balanced for better precision
                timeInterval: 15000, // 15 seconds timeout (increased for better accuracy)
            });

            const requestTime = Date.now() - startTime;
            if (__DEV__) console.log(`✅ [Native] GPS position obtained in ${requestTime}ms`);

            const locationData: LocationData = {
                latitude: location.coords.latitude,
                longitude: location.coords.longitude,
                accuracy: location.coords.accuracy || 0,
                timestamp: new Date(location.timestamp)
            };

            if (__DEV__) {
                console.log('📍 [Native] Location data:', {
                    latitude: locationData.latitude,
                    longitude: locationData.longitude,
                    accuracy: locationData.accuracy,
                    timestamp: locationData.timestamp.toISOString(),
                    rawLat: location.coords.latitude,
                    rawLon: location.coords.longitude,
                    rawAccuracy: location.coords.accuracy,
                    heading: location.coords.heading,
                    speed: location.coords.speed,
                    altitude: location.coords.altitude
                });
                // Log location prominently to help debug
                console.log(`\n📍 [Native] GPS LOCATION OBTAINED: (${locationData.latitude.toFixed(8)}, ${locationData.longitude.toFixed(8)}) accuracy: ${locationData.accuracy.toFixed(2)}m`);
            }

            // Cache the location
            this.lastKnownLocation = locationData;

            return {
                success: true,
                location: locationData
            };
        }

    } catch (error: any) {
        console.error('❌ [LocationService] Error getting current location:', error);
        console.error('❌ [LocationService] Error details:', {
            message: error?.message,
            code: error?.code,
            name: error?.name,
            stack: error?.stack
        });
        console.error(`\n❌ [LocationService] GPS LOCATION FAILED - Will fallback to database location`);
        console.error(`❌ [LocationService] This may cause incorrect distance filtering!`);
        return {
            success: false,
            error: error?.message || 'Failed to get current location'
        };
    }
}
```
**Comment:**
```typescript
// Gets current GPS location using platform-specific APIs. For web: uses navigator.geolocation.getCurrentPosition() with 30s timeout. For native: uses expo-location Location.getCurrentPositionAsync() with High accuracy. Returns LocationResult with success flag, location data (latitude, longitude, accuracy, timestamp), or error message. Caches location in lastKnownLocation property.
```

---

## Location / Distance Step 11 – Campus Bounds Check (Geofencing - Not Used in Queueing)

**File:** `components/LocationService.ts`  
**Lines:** 262-277  
**Exact code:**
```typescript
public isWithinCampusBounds(latitude: number, longitude: number): boolean {
    // UM campus approximate boundaries
    const campusBounds = {
        north: 7.1200,
        south: 7.1000,
        east: 125.6200,
        west: 125.6000
    };

    return (
        latitude >= campusBounds.south &&
        latitude <= campusBounds.north &&
        longitude >= campusBounds.west &&
        longitude <= campusBounds.east
    );
}
```
**Comment:**
```typescript
// Checks if coordinates are within UM campus rectangular bounds. Uses simple rectangular boundary check: latitude between 7.1000-7.1200 and longitude between 125.6000-125.6200. Returns boolean. NOTE: This function exists but is NOT used in the task-matching/runner queueing system. It appears to be used only for availability validation (geofence error modal), not for distance filtering or runner ranking.
```

---

## Summary

### Distance Calculation Method
- **Formula:** Haversine formula (great-circle distance)
- **Implementation:** `LocationService.calculateDistance()` in `components/LocationService.ts`
- **Returns:** Distance in kilometers
- **Conversion:** Multiplied by 1000 to get meters

### Location Sources
1. **Primary:** GPS via `LocationService.getCurrentLocation()` (with retries)
2. **Fallback:** Database (`users` table `latitude` and `longitude` columns)

### Distance Thresholds
- **Filtering Threshold:** 500 meters (strict: `distanceMeters > 500` excludes)
- **Distance Score:** Normalized 0-1 where 0m = 1.0, 500m = 0.0
- **Score Weight:** 40% in final runner ranking

### Geofencing
- **Campus Bounds Function:** Exists (`isWithinCampusBounds`) but NOT used in queueing
- **Queueing System:** Uses radius-based distance threshold (500m), not geofencing
- **Geofencing Usage:** Only for availability validation (preventing runners from setting available outside campus)

### Key Files
- `components/LocationService.ts` - Distance calculation and GPS location retrieval
- `app/buddyrunner/home.tsx` - Runner queueing logic using distance calculations
