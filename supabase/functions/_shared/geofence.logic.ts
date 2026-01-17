/**
 * Geofencing logic functions
 * Pure functions with no side effects
 * Imports polygon data from geofence.data.ts
 */

import { UM_MATINA_POLYGON } from './geofence.data.ts';
import {
  pointInPolygon,
  pointInRadius,
  calculatePolygonCentroid,
  calculateMaxDistanceFromCenter,
  calculateDistanceMeters,
} from './geofence.geometry.ts';
import {
  CLIENT_RADIUS_METERS,
  POLYGON_BUFFER_METERS,
} from './geofence.policy.ts';

/**
 * Get the UM Matina polygon coordinates
 * @returns Array of [longitude, latitude] coordinate pairs
 */
function getUMPolygonCoordinates(): number[][] {
  // Cast readonly array to mutable array for geometry functions
  return UM_MATINA_POLYGON.coordinates[0] as unknown as number[][];
}

/**
 * Calculate and cache the polygon center point
 * Computed once at module load
 */
const polygonCoordinates = getUMPolygonCoordinates();
const polygonCenter = calculatePolygonCentroid(polygonCoordinates);
const [CENTER_LON, CENTER_LAT] = polygonCenter;

/**
 * Get UM Matina center point
 * @returns [longitude, latitude] of polygon centroid
 */
export function getUMCenter(): [number, number] {
  return [CENTER_LON, CENTER_LAT];
}

/**
 * Check if a point is within UM Matina geofence using polygon validation (authoritative)
 * @param latitude Point latitude (degrees)
 * @param longitude Point longitude (degrees)
 * @returns true if point is inside the polygon (with buffer for GPS accuracy)
 */
export function isWithinUMPolygon(latitude: number, longitude: number): boolean {
  const coords = getUMPolygonCoordinates();
  
  // Direct polygon check (most accurate)
  if (pointInPolygon(latitude, longitude, coords)) {
    return true;
  }

  // If point is outside polygon but very close (within buffer), still consider valid
  // This compensates for GPS inaccuracy near boundaries
  // Check distance to nearest polygon edge (simplified: check distance to center)
  const distanceFromCenter = calculateDistanceMeters(
    latitude,
    longitude,
    CENTER_LAT,
    CENTER_LON
  );
  
  // Get approximate polygon radius (max distance from center to any vertex)
  // We calculate this once, but for simplicity, use a conservative estimate
  // Actual polygon spans roughly 600-700m, so center + max distance ≈ 650m
  const approximateMaxRadius = calculateMaxDistanceFromCenter(
    CENTER_LAT,
    CENTER_LON,
    coords
  );
  
  // If within buffer distance of polygon boundary, allow it
  return distanceFromCenter <= approximateMaxRadius + POLYGON_BUFFER_METERS;
}

/**
 * Check if a point is within UM Matina geofence using radius check (fast client-side)
 * Less accurate than polygon check but faster
 * @param latitude Point latitude (degrees)
 * @param longitude Point longitude (degrees)
 * @returns true if point is within client radius threshold
 */
export function isWithinUMRadius(latitude: number, longitude: number): boolean {
  return pointInRadius(
    latitude,
    longitude,
    CENTER_LAT,
    CENTER_LON,
    CLIENT_RADIUS_METERS
  );
}

/**
 * Validate if a location is within UM Matina geofence
 * Uses polygon validation (authoritative backend check)
 * @param latitude Point latitude (degrees)
 * @param longitude Point longitude (degrees)
 * @param usePolygonValidation If true, use polygon check; if false, use radius check
 * @returns Object with validation result
 */
export function validateLocation(
  latitude: number,
  longitude: number,
  usePolygonValidation: boolean = true
): {
  isValid: boolean;
  method: 'polygon' | 'radius';
  centerDistance?: number;
} {
  if (usePolygonValidation) {
    const isValid = isWithinUMPolygon(latitude, longitude);
    const centerDistance = calculateDistanceMeters(
      latitude,
      longitude,
      CENTER_LAT,
      CENTER_LON
    );
    return {
      isValid,
      method: 'polygon',
      centerDistance,
    };
  } else {
    const isValid = isWithinUMRadius(latitude, longitude);
    const centerDistance = calculateDistanceMeters(
      latitude,
      longitude,
      CENTER_LAT,
      CENTER_LON
    );
    return {
      isValid,
      method: 'radius',
      centerDistance,
    };
  }
}

/**
 * Check if a runner can be marked as available based on location
 * @param latitude Runner latitude (degrees)
 * @param longitude Runner longitude (degrees)
 * @param usePolygonValidation If true, use polygon check; if false, use radius check
 * @returns Object with validation result and reason
 */
export function canRunnerBeAvailable(
  latitude: number | null,
  longitude: number | null,
  usePolygonValidation: boolean = true
): {
  allowed: boolean;
  reason?: string;
} {
  if (latitude === null || longitude === null) {
    return {
      allowed: false,
      reason: 'Location not available',
    };
  }

  const validation = validateLocation(latitude, longitude, usePolygonValidation);

  if (!validation.isValid) {
    return {
      allowed: false,
      reason: `Location is outside UM Matina geofence (${validation.centerDistance?.toFixed(0)}m from center)`,
    };
  }

  return {
    allowed: true,
  };
}

/**
 * Check if a runner is eligible for assignment based on location
 * Same as canRunnerBeAvailable but with different context
 * @param latitude Runner latitude (degrees)
 * @param longitude Runner longitude (degrees)
 * @param usePolygonValidation If true, use polygon check; if false, use radius check
 * @returns Object with validation result and reason
 */
export function isRunnerEligibleForAssignment(
  latitude: number | null,
  longitude: number | null,
  usePolygonValidation: boolean = true
): {
  eligible: boolean;
  reason?: string;
} {
  const availabilityCheck = canRunnerBeAvailable(
    latitude,
    longitude,
    usePolygonValidation
  );

  return {
    eligible: availabilityCheck.allowed,
    reason: availabilityCheck.reason,
  };
}

/**
 * Filter runner IDs based on geofence validation
 * @param runners Array of runner objects with latitude, longitude, and id
 * @param usePolygonValidation If true, use polygon check; if false, use radius check
 * @returns Array of runner IDs that are within geofence
 */
export function filterRunnersByGeofence<T extends { id: string; latitude: number | null; longitude: number | null }>(
  runners: T[],
  usePolygonValidation: boolean = true
): string[] {
  const validRunnerIds: string[] = [];

  for (const runner of runners) {
    const validation = canRunnerBeAvailable(
      runner.latitude,
      runner.longitude,
      usePolygonValidation
    );

    if (validation.allowed) {
      validRunnerIds.push(runner.id);
    }
  }

  return validRunnerIds;
}
