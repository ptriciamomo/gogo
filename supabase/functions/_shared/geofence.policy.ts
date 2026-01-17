/**
 * Geofencing policy constants and configuration
 * No functions, no logic - constants only
 */

/**
 * Client-side radius check threshold (meters)
 * Used for fast client-side validation before backend polygon check
 * Should be larger than actual polygon bounds to account for GPS drift
 */
export const CLIENT_RADIUS_METERS = 650;

/**
 * Grace period for runners who leave the geofence (seconds)
 * Runner can be outside geofence for this duration before being auto-set offline
 */
export const GEOFENCE_EXIT_GRACE_PERIOD_SECONDS = 75; // 60-90s range, using 75s as middle

/**
 * Location freshness threshold for geofence checks (seconds)
 * If location_updated_at is older than this, exclude runner from geofence-validated operations
 */
export const LOCATION_FRESHNESS_THRESHOLD_SECONDS = 90;

/**
 * Buffer radius for polygon validation (meters)
 * Additional buffer beyond polygon boundary for GPS accuracy compensation
 */
export const POLYGON_BUFFER_METERS = 10; // Small buffer for GPS inaccuracy
