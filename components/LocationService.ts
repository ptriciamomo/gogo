// Location Service for GoBuddy
// Handles GPS location retrieval and validation

import * as Location from 'expo-location';
import { Platform } from 'react-native';
import { supabase } from '../lib/supabase';

export interface LocationData {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: Date;
}

export interface LocationResult {
  success: boolean;
  location?: LocationData;
  error?: string;
}

export interface LocationCheckResult {
  hasLocation: boolean;
  hasPermission: boolean;
  locationInDatabase: boolean;
}

class LocationService {
  private static instance: LocationService;
  private lastKnownLocation: LocationData | null = null;
  private locationPermissionGranted: boolean = false;

  private constructor() {}

  public static getInstance(): LocationService {
    if (!LocationService.instance) {
      LocationService.instance = new LocationService();
    }
    return LocationService.instance;
  }

  /**
   * Check if running on web platform
   */
  private isWeb(): boolean {
    return Platform.OS === 'web';
  }

  /**
   * Request location permissions
   */
  public async requestLocationPermission(): Promise<boolean> {
    try {
      if (this.isWeb()) {
        // For web, permission is requested automatically when getCurrentPosition is called
        // This method just checks if geolocation is available
        if (!navigator.geolocation) {
          console.error('Geolocation is not supported by this browser');
          return false;
        }
        // Return true to indicate geolocation API is available
        // The actual permission prompt will appear when getCurrentPosition is called
        return true;
      } else {
        // Use expo-location for native platforms
        const { status } = await Location.requestForegroundPermissionsAsync();
        this.locationPermissionGranted = status === 'granted';
        return this.locationPermissionGranted;
      }
    } catch (error) {
      console.error('Error requesting location permission:', error);
      return false;
    }
  }

  /**
   * Get current location with GPS
   */
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

  /**
   * Get last known location (cached)
   */
  public getLastKnownLocation(): LocationData | null {
    return this.lastKnownLocation;
  }

  /**
   * Check if location is within UM campus bounds
   */
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

  /**
   * Calculate distance between two coordinates (in kilometers)
   */
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

  private deg2rad(deg: number): number {
    return deg * (Math.PI/180);
  }

  /**
   * Get location with fallback options
   */
  public async getLocationWithFallback(): Promise<LocationResult> {
    try {
      // Try to get current location first
      const currentLocation = await this.getCurrentLocation();
      
      if (currentLocation.success && currentLocation.location) {
        // Check if location is within campus bounds
        const { latitude, longitude } = currentLocation.location;
        if (this.isWithinCampusBounds(latitude, longitude)) {
          return currentLocation;
        } else {
          if (__DEV__) console.warn('Location is outside campus bounds, using fallback');
        }
      }

      // Fallback to last known location
      if (this.lastKnownLocation) {
        if (__DEV__) console.log('Using last known location as fallback');
        return {
          success: true,
          location: this.lastKnownLocation
        };
      }

      // Final fallback to campus center
      if (__DEV__) console.log('Using campus center as fallback');
      return {
        success: true,
        location: {
          latitude: 7.1100, // Campus center
          longitude: 125.6100,
          accuracy: 1000, // Low accuracy for fallback
          timestamp: new Date()
        }
      };

    } catch (error) {
      console.error('Error in getLocationWithFallback:', error);
      return {
        success: false,
        error: 'Failed to get location'
      };
    }
  }

  /**
   * Watch location changes (for real-time updates)
   */
  public async watchLocation(
    callback: (location: LocationData) => void,
    options: {
      accuracy?: Location.Accuracy;
      timeInterval?: number;
      distanceInterval?: number;
    } = {}
  ): Promise<Location.LocationSubscription | null> {
    try {
      if (!this.locationPermissionGranted) {
        const permissionGranted = await this.requestLocationPermission();
        if (!permissionGranted) {
          return null;
        }
      }

      const subscription = await Location.watchPositionAsync(
        {
          accuracy: options.accuracy || Location.Accuracy.Balanced,
          timeInterval: options.timeInterval || 5000,
          distanceInterval: options.distanceInterval || 10,
        },
        (location) => {
          const locationData: LocationData = {
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
            accuracy: location.coords.accuracy || 0,
            timestamp: new Date(location.timestamp)
          };
          
          this.lastKnownLocation = locationData;
          callback(locationData);
        }
      );

      return subscription;
    } catch (error) {
      console.error('Error watching location:', error);
      return null;
    }
  }

  /**
   * Check if user has location stored in database
   */
  public async hasLocationInDatabase(userId: string): Promise<boolean> {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('latitude, longitude')
        .eq('id', userId)
        .single();

      if (error) {
        console.error('Error checking location in database:', error);
        return false;
      }

      // Check if both latitude and longitude are not null
      return data?.latitude != null && data?.longitude != null;
    } catch (error) {
      console.error('Error in hasLocationInDatabase:', error);
      return false;
    }
  }

  /**
   * Update user location in database
   */
  public async updateLocationInDatabase(userId: string, locationData: LocationData): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('users')
        .update({
          latitude: locationData.latitude,
          longitude: locationData.longitude,
          location_updated_at: new Date().toISOString(),
        })
        .eq('id', userId);

      if (error) {
        console.error('Error updating location in database:', error);
        return false;
      }

      if (__DEV__) console.log('✅ Location updated in database successfully');
      return true;
    } catch (error) {
      console.error('Error in updateLocationInDatabase:', error);
      return false;
    }
  }

  /**
   * Check location status (permission + database)
   */
  public async checkLocationStatus(userId: string): Promise<LocationCheckResult> {
    try {
      let hasPermission = false;

      if (this.isWeb()) {
        // For web, we cannot check permission status without triggering the browser prompt
        // So we only check if geolocation API is available
        // We'll assume permission is not granted if we don't have location in database
        // The actual permission check will happen when user clicks "Enable Location"
        if (navigator.geolocation) {
          // Check if we have a cached permission state (from previous successful request)
          hasPermission = this.locationPermissionGranted;
        }
      } else {
        // Use expo-location for native platforms
        const { status } = await Location.getForegroundPermissionsAsync();
        hasPermission = status === 'granted';
      }
      
      // Check if location is stored in database
      const locationInDatabase = await this.hasLocationInDatabase(userId);

      // For web: if location exists in database, assume permission was granted previously
      // For native: use actual permission status
      if (this.isWeb() && locationInDatabase && !hasPermission) {
        // If location exists in DB but we don't have cached permission state,
        // assume permission might be granted (but we'll verify when user enables)
        hasPermission = true;
      }

      // Determine if user has a valid location setup
      const hasLocation = hasPermission && locationInDatabase;

      return {
        hasLocation,
        hasPermission,
        locationInDatabase,
      };
    } catch (error) {
      console.error('Error checking location status:', error);
      return {
        hasLocation: false,
        hasPermission: false,
        locationInDatabase: false,
      };
    }
  }

  /**
   * Request location and save to database
   * For web browsers, this MUST be called directly from a user gesture (button click)
   * to ensure the browser permission prompt appears
   */
  public async requestAndSaveLocation(userId: string): Promise<LocationResult> {
    try {
      // For web, trigger geolocation immediately to maintain user gesture chain
      // This is critical for mobile browsers - the geolocation call must happen
      // synchronously from the user's click event
      if (this.isWeb()) {
        // CRITICAL: Call getCurrentLocation() immediately (synchronously from user gesture)
        // This triggers navigator.geolocation.getCurrentPosition() which shows the browser prompt
        const result = await this.getCurrentLocation();
        
        if (!result.success || !result.location) {
          return result;
        }

        // Save to database (this can be async, doesn't need user gesture)
        const saved = await this.updateLocationInDatabase(userId, result.location);
        
        if (!saved) {
          return {
            success: false,
            error: 'Failed to save location to database'
          };
        }

        return result;
      } else {
        // Native platforms - standard flow
        const result = await this.getCurrentLocation();
        
        if (!result.success || !result.location) {
          return result;
        }

        const saved = await this.updateLocationInDatabase(userId, result.location);
        
        if (!saved) {
          return {
            success: false,
            error: 'Failed to save location to database'
          };
        }

        return result;
      }
    } catch (error) {
      console.error('Error in requestAndSaveLocation:', error);
      return {
        success: false,
        error: 'Failed to request and save location'
      };
    }
  }
}

export default LocationService.getInstance();
