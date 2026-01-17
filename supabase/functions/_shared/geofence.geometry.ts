/**
 * Pure geometric functions for geofencing
 * No database, no Supabase, no network calls
 */

/**
 * Convert degrees to radians
 */
function deg2rad(deg: number): number {
  return deg * (Math.PI / 180);
}

/**
 * Calculate distance between two points using Haversine formula
 * @param lat1 Latitude of first point (degrees)
 * @param lon1 Longitude of first point (degrees)
 * @param lat2 Latitude of second point (degrees)
 * @param lon2 Longitude of second point (degrees)
 * @returns Distance in meters
 */
export function calculateDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000; // Earth's radius in meters
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) *
      Math.cos(deg2rad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Check if a point is within a radius from a center point
 * @param pointLat Point latitude (degrees)
 * @param pointLon Point longitude (degrees)
 * @param centerLat Center latitude (degrees)
 * @param centerLon Center longitude (degrees)
 * @param radiusMeters Radius in meters
 * @returns true if point is within radius
 */
export function pointInRadius(
  pointLat: number,
  pointLon: number,
  centerLat: number,
  centerLon: number,
  radiusMeters: number
): boolean {
  const distance = calculateDistanceMeters(pointLat, pointLon, centerLat, centerLon);
  return distance <= radiusMeters;
}

/**
 * Ray casting algorithm to check if a point is inside a polygon
 * Works with GeoJSON polygon coordinates: [[lon, lat], [lon, lat], ...]
 * @param pointLat Point latitude (degrees)
 * @param pointLon Point longitude (degrees)
 * @param polygonCoordinates Array of [longitude, latitude] coordinate pairs (closed polygon)
 * @returns true if point is inside polygon
 */
export function pointInPolygon(
  pointLat: number,
  pointLon: number,
  polygonCoordinates: number[][]
): boolean {
  let inside = false;

  // Remove last point if it's a duplicate of first (closed polygon)
  const coords = polygonCoordinates.length > 0 && 
    polygonCoordinates[0][0] === polygonCoordinates[polygonCoordinates.length - 1][0] &&
    polygonCoordinates[0][1] === polygonCoordinates[polygonCoordinates.length - 1][1]
    ? polygonCoordinates.slice(0, -1)
    : polygonCoordinates;

  if (coords.length < 3) {
    return false; // Not a valid polygon
  }

  for (let i = 0, j = coords.length - 1; i < coords.length; j = i++) {
    const [xi, yi] = [coords[i][0], coords[i][1]]; // lon, lat
    const [xj, yj] = [coords[j][0], coords[j][1]]; // lon, lat

    const intersect =
      yi > pointLon !== yj > pointLon &&
      pointLat < ((xj - xi) * (pointLon - yi)) / (yj - yi) + xi;

    if (intersect) {
      inside = !inside;
    }
  }

  return inside;
}

/**
 * Calculate the centroid (geometric center) of a polygon
 * @param polygonCoordinates Array of [longitude, latitude] coordinate pairs
 * @returns [longitude, latitude] of centroid
 */
export function calculatePolygonCentroid(
  polygonCoordinates: number[][]
): [number, number] {
  // Remove last point if it's a duplicate of first (closed polygon)
  const coords = polygonCoordinates.length > 0 && 
    polygonCoordinates[0][0] === polygonCoordinates[polygonCoordinates.length - 1][0] &&
    polygonCoordinates[0][1] === polygonCoordinates[polygonCoordinates.length - 1][1]
    ? polygonCoordinates.slice(0, -1)
    : polygonCoordinates;

  if (coords.length === 0) {
    throw new Error('Empty polygon coordinates');
  }

  let sumLon = 0;
  let sumLat = 0;

  for (const [lon, lat] of coords) {
    sumLon += lon;
    sumLat += lat;
  }

  return [sumLon / coords.length, sumLat / coords.length];
}

/**
 * Calculate the maximum distance from a center point to any vertex in a polygon
 * @param centerLat Center latitude (degrees)
 * @param centerLon Center longitude (degrees)
 * @param polygonCoordinates Array of [longitude, latitude] coordinate pairs
 * @returns Maximum distance in meters
 */
export function calculateMaxDistanceFromCenter(
  centerLat: number,
  centerLon: number,
  polygonCoordinates: number[][]
): number {
  // Remove last point if it's a duplicate of first (closed polygon)
  const coords = polygonCoordinates.length > 0 && 
    polygonCoordinates[0][0] === polygonCoordinates[polygonCoordinates.length - 1][0] &&
    polygonCoordinates[0][1] === polygonCoordinates[polygonCoordinates.length - 1][1]
    ? polygonCoordinates.slice(0, -1)
    : polygonCoordinates;

  let maxDistance = 0;

  for (const [lon, lat] of coords) {
    const distance = calculateDistanceMeters(centerLat, centerLon, lat, lon);
    if (distance > maxDistance) {
      maxDistance = distance;
    }
  }

  return maxDistance;
}
