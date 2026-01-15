import { Ionicons } from "@expo/vector-icons";
import { Stack, usePathname, useRouter } from "expo-router";
import React, { useState } from "react";
import {
    Alert,
    Image,
    Modal,
    Platform,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    useWindowDimensions,
    View,
} from "react-native";
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from "../../lib/supabase";
import LocationService from "../../components/LocationService";

/* ================= COLORS ================= */
const colors = {
    maroon: "#8B0000",
    light: "#FAF6F5",
    border: "#E5C8C5",
    text: "#531010",
    pillText: "#FFFFFF",
    pillTextActive: "#1e293b",
    faint: "#F7F1F0",
};

/* ================= DATA ================= */
type Notif = {
    id: string;
    title: string;
    body: string;
    avatar: string;
    created_at?: string;
    commission_id?: string;
    caller_name?: string;
};

// Helper function to format time as date and hour:minutes
function formatNotificationTime(dateString: string): string {
    try {
        const date = new Date(dateString);
        const dateStr = date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric'
        });
        const timeStr = date.toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        });
        return `${dateStr} at ${timeStr}`;
    } catch (error) {
        return 'Invalid date';
    }
}

// Helper function to create notification from commission
function createNotificationFromCommission(commission: any, callerName: string, callerAvatar?: string): Notif {
    return {
        id: commission.id,
        title: commission.title || 'New Commission',
        body: `New commission from ${callerName}`,
        avatar: callerAvatar || 'https://via.placeholder.com/40x40/8B2323/FFFFFF?text=BC',
        created_at: commission.created_at,
        commission_id: commission.id,
        caller_name: callerName,
    };
}

function titleCase(s?: string | null) {
    return (s || "")
        .split(" ")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(" ");
}

function useAuthProfile() {
    const router = useRouter();
    const [loading, setLoading] = React.useState(true);
    const [firstName, setFirstName] = React.useState<string>("");
    const [fullName, setFullName] = React.useState<string>("");
    const [roleLabel, setRoleLabel] = React.useState<string>("");
    const [profilePictureUrl, setProfilePictureUrl] = React.useState<string | null>(null);

    async function fetchProfile() {
        try {
            const { data: userRes } = await supabase.auth.getUser();
            const user = userRes?.user;
            if (!user) {
                setLoading(false);
                return;
            }

            const { data: row, error } = await supabase
                .from("users")
                .select("id, role, first_name, last_name, is_blocked, is_settlement_blocked, profile_picture_url")
                .eq("id", user.id)
                .single();
            if (error) throw error;

            // Check if user is blocked (disciplinary or settlement-based)
            if (row?.is_blocked || row?.is_settlement_blocked) {
                console.log('User is blocked, logging out...');
                await supabase.auth.signOut();
                router.replace('/login');
                return;
            }

            const f = titleCase(row?.first_name || "");
            const l = titleCase(row?.last_name || "");
            const finalFull =
                (f && l ? `${f} ${l}` : "").trim() ||
                titleCase(
                    (user.user_metadata?.full_name as string) ||
                    (user.user_metadata?.name as string) ||
                    ""
                ) ||
                titleCase((user.email?.split("@")[0] || "").replace(/[._-]+/g, " ")) ||
                "User";

            setFirstName(f || finalFull.split(" ")[0] || "User");
            setFullName(finalFull);

            const roleRaw = (row?.role || "").toString().toLowerCase();
            setRoleLabel(
                roleRaw === "buddyrunner"
                    ? "BuddyRunner"
                    : roleRaw === "buddycaller"
                        ? "BuddyCaller"
                        : ""
            );
            setProfilePictureUrl(row?.profile_picture_url || null);
        } catch {
            setFirstName("User");
            setFullName("User");
            setRoleLabel("");
            setProfilePictureUrl(null);
        } finally {
            setLoading(false);
        }
    }

    React.useEffect(() => {
        fetchProfile();
        const { data: sub } = supabase.auth.onAuthStateChange(() => fetchProfile());
        return () => sub?.subscription?.unsubscribe?.();
    }, []);

    return { loading, firstName, fullName, roleLabel, profilePictureUrl };
}

/* ================= MAIN ================= */
export default function NotificationScreen() {
    const { width } = useWindowDimensions();
    const isWeb = Platform.OS === "web";

    return isWeb ? <NotificationWebInstant /> : <NotificationMobile />;
}

/* 
================================================================================
                                    📱 MOBILE LAYOUT 📱
================================================================================
This section contains all the code for the MOBILE/PHONE version of the notification screen.
It includes the mobile navigation, compact layout, and mobile-specific styling.
================================================================================
*/
function NotificationMobile() {
    const router = useRouter();
    const pathname = usePathname();
    const isWeb = Platform.OS === "web";

    // State for notifications
    const [notifications, setNotifications] = useState<Notif[]>([]);
    const [loading, setLoading] = useState(true);

    // Debug notifications state changes
    React.useEffect(() => {
        console.log('Mobile notifications state updated:', notifications);
    }, [notifications]);

    // Define loadNotifications function
    const loadNotifications = React.useCallback(async () => {
            try {
                // Get current user to filter out declined runners and check if online
                const { data: { user: currentUser } } = await supabase.auth.getUser();
                if (!currentUser) {
                    console.error('No authenticated user found');
                    return;
                }

                // Check if runner is available (online) and has location - only online runners should see commissions
                const { data: runnerData } = await supabase
                    .from("users")
                    .select("is_available, latitude, longitude")
                    .eq("id", currentUser.id)
                    .single();

                if (!runnerData?.is_available) {
                    console.log('Runner is not available (offline), not loading notifications');
                    setNotifications([]);
                    setLoading(false);
                    return;
                }

                // Use device's current GPS location for filtering (not database location)
                console.log('🔄 [Mobile Notification] Getting device current GPS location for filtering...');
                let runnerLat: number = 0;
                let runnerLon: number = 0;
                let locationSource: 'gps' | 'database' = 'gps';

                // Try to get GPS location with retries before falling back to database
                let locationResult;
                const maxRetries = 3;
                let retryCount = 0;
                
                while (retryCount < maxRetries) {
                    try {
                        if (retryCount > 0) {
                            console.log(`🔄 [Mobile Notification] Retrying GPS location (attempt ${retryCount + 1}/${maxRetries})...`);
                            await new Promise(resolve => setTimeout(resolve, 500 * retryCount));
                        }
                        
                        locationResult = await LocationService.getCurrentLocation();
                        
                        if (locationResult.success && locationResult.location) {
                            const accuracy = locationResult.location.accuracy || 0;
                            if (accuracy > 500) {
                                console.warn(`⚠️ [Mobile Notification] GPS accuracy extremely poor: ${accuracy.toFixed(2)}m (max: 500m), retrying...`);
                                retryCount++;
                                if (retryCount >= maxRetries) {
                                    console.warn('⚠️ [Mobile Notification] GPS accuracy still poor after retries, but will use GPS location anyway');
                                } else {
                                    continue;
                                }
                            } else if (accuracy > 100) {
                                console.warn(`⚠️ [Mobile Notification] GPS accuracy is moderate: ${accuracy.toFixed(2)}m (will use it anyway)`);
                            }
                            
                            runnerLat = locationResult.location.latitude;
                            runnerLon = locationResult.location.longitude;
                            locationSource = 'gps';
                            console.log('✅ [Mobile Notification] Device current GPS location obtained:', { 
                                lat: runnerLat, 
                                lon: runnerLon,
                                accuracy: locationResult.location.accuracy,
                                runnerId: currentUser.id,
                                source: locationSource,
                                attempts: retryCount + 1
                            });
                            break;
                        } else {
                            retryCount++;
                            if (retryCount >= maxRetries) {
                                throw new Error(locationResult.error || 'Failed to get GPS location after retries');
                            }
                        }
                    } catch (error: any) {
                        retryCount++;
                        if (retryCount >= maxRetries) {
                            console.warn('⚠️ [Mobile Notification] Failed to get device current GPS location after all retries, falling back to database location:', error);
                            break;
                        }
                    }
                }
                
                // If GPS still failed after retries, fall back to database
                if (!locationResult || !locationResult.success || !locationResult.location) {
                    const dbLat = typeof runnerData?.latitude === 'number' ? runnerData.latitude : parseFloat(String(runnerData?.latitude || ''));
                    const dbLon = typeof runnerData?.longitude === 'number' ? runnerData.longitude : parseFloat(String(runnerData?.longitude || ''));
                    
                    if (!dbLat || !dbLon || isNaN(dbLat) || isNaN(dbLon)) {
                        console.log('❌ [Mobile Notification] Database location also invalid, not loading notifications');
                        setNotifications([]);
                        setLoading(false);
                        return;
                    }
                    
                    runnerLat = dbLat;
                    runnerLon = dbLon;
                    locationSource = 'database';
                    console.log('✅ [Mobile Notification] Using database location as fallback:', { 
                        lat: runnerLat, 
                        lon: runnerLon,
                        runnerId: currentUser.id,
                        source: locationSource
                    });
                }

                // Get GPS accuracy if available
                let gpsAccuracy = 0;
                if (locationSource === 'gps' && locationResult?.location?.accuracy) {
                    gpsAccuracy = locationResult.location.accuracy;
                }

                console.log('✅ [Mobile Notification] Runner location for filtering:', { 
                    lat: runnerLat, 
                    lon: runnerLon, 
                    runnerId: currentUser.id, 
                    source: locationSource,
                    gpsAccuracy: gpsAccuracy > 0 ? `${gpsAccuracy.toFixed(2)}m` : 'N/A'
                });

                // Load recent commissions, excluding those where current user was declined
                const { data: commissions, error } = await supabase
                    .from('commission')
                    .select('id, title, created_at, buddycaller_id, declined_runner_id, commission_type, notified_runner_id, notified_at, timeout_runner_ids')
                    .eq('status', 'pending')
                    .order('created_at', { ascending: false })
                    .limit(20);

                if (error) {
                    console.error('Error loading notifications:', error);
                    return;
                }

                console.log('Commissions loaded:', commissions);

                // Load warning notifications from the notifications table
                const { data: warningNotifications, error: warningError } = await supabase
                    .from('notifications')
                    .select('id, title, message, type, created_at, is_read')
                    .eq('user_id', currentUser.id)
                    .eq('type', 'warning')
                    .order('created_at', { ascending: false })
                    .limit(10);

                if (warningError) {
                    console.error('Error loading warning notifications:', warningError);
                }

                console.log('Warning notifications loaded:', warningNotifications);

                let allNotifications: Notif[] = [];

                // Process commission notifications
                if (commissions && commissions.length > 0) {
                    // Get caller IDs first to fetch locations
                    const callerIds = commissions.map(c => c.buddycaller_id).filter(Boolean);
                    
                    // Fetch caller details and locations
                    const { data: callers, error: callerError } = await supabase
                        .from('users')
                        .select('id, first_name, last_name, profile_picture_url, latitude, longitude')
                        .in('id', callerIds);

                    if (callerError) {
                        console.error('Error loading callers:', callerError);
                    }

                    // Create caller location map
                    const callerLocationMap: Record<string, { latitude: number; longitude: number }> = {};
                    callers?.forEach(caller => {
                        if (caller.latitude && caller.longitude) {
                            callerLocationMap[caller.id] = { latitude: caller.latitude, longitude: caller.longitude };
                        }
                    });

                    // Strict distance limit: 500 meters (no GPS accuracy expansion)
                    const distanceLimit = 500;

                    // Filter out commissions based on distance (500 meters = 0.5 km) and declined status
                    // Need to use async filter pattern since ranking logic requires async operations
                    const filterCommission = async (commission: any): Promise<boolean> => {
                        // Check if current user was declined for this commission
                        if (commission.declined_runner_id === currentUser.id) {
                            console.log('Filtering out commission where user was declined:', commission.id);
                            return false;
                        }
                        
                        // Check distance if caller has location
                        const callerLocation = callerLocationMap[commission.buddycaller_id || ""];
                        if (callerLocation) {
                            const distanceKm = LocationService.calculateDistance(
                                runnerLat,
                                runnerLon,
                                callerLocation.latitude,
                                callerLocation.longitude
                            );
                            const distanceMeters = distanceKm * 1000;
                            
                            console.log(`\n📍 [Notification] Commission ${commission.id} distance calculation:`);
                            console.log(`   Runner location: (${runnerLat}, ${runnerLon}) [source: ${locationSource}]`);
                            if (gpsAccuracy > 0) {
                                console.log(`   GPS accuracy: ${gpsAccuracy.toFixed(2)}m`);
                            }
                            console.log(`   Caller location: (${callerLocation.latitude}, ${callerLocation.longitude})`);
                            console.log(`   Calculated distance: ${distanceMeters.toFixed(2)}m (${distanceKm.toFixed(4)} km)`);
                            console.log(`   Distance limit: 500m`);
                            console.log(`   ${distanceMeters <= 500 ? '✅ WITHIN RANGE' : '❌ EXCEEDS LIMIT'}`);
                            
                            if (distanceMeters > 500) {
                                console.log(`❌ Filtering out commission ${commission.id} - distance: ${distanceMeters.toFixed(2)}m exceeds 500m limit`);
                                return false;
                                } else {
                                    console.log(`✅ Commission ${commission.id} is within range: ${distanceMeters.toFixed(2)}m <= 500m`);
                            }
                        } else {
                            // If caller doesn't have location, exclude the commission
                            console.log(`Filtering out commission ${commission.id} - caller has no location`);
                            return false;
                        }
                        
                        // Apply ranking filter: only show if current runner is the notified runner or eligible after timeout
                        // If no commission type, show to all eligible runners (no ranking)
                        if (!commission.commission_type || commission.commission_type.trim() === '') {
                            console.log(`📊 [Notification Ranking] Commission ${commission.id} has no category/type, showing to all eligible runners`);
                        return true;
                        }
                        
                        // Check if current runner is the notified runner
                        if (commission.notified_runner_id === currentUser.id) {
                            console.log(`✅ [Notification Ranking] Commission ${commission.id}: Current runner is the notified runner`);
                            return true;
                        }
                        
                        // If no runner has been notified yet, perform ranking and assign to top runner
                        if (!commission.notified_runner_id) {
                            console.log(`🔍 [Notification Ranking] Commission ${commission.id}: Finding top-ranked runner...`);
                            
                            // Get caller location for distance calculation
                            const callerLocation = callerLocationMap[commission.buddycaller_id || ""];
                            if (!callerLocation) {
                                console.log(`❌ [Notification Ranking] Commission ${commission.id}: Caller has no location, cannot rank runners`);
                                return false;
                            }
                            
                            // Parse commission types
                            const commissionTypes = commission.commission_type 
                                ? commission.commission_type.split(',').map((t: string) => t.trim()).filter((t: string) => t.length > 0)
                                : [];
                            
                            // Helper function to get runner's completed commissions count
                            const getRunnerCompletedCount = async (runnerId: string, types: string[]): Promise<number> => {
                                if (!types || types.length === 0) return 0;
                                try {
                                    const { data, error } = await supabase
                                        .from("commission")
                                        .select("id, commission_type")
                                        .eq("runner_id", runnerId)
                                        .eq("status", "completed");
                                    if (error) return 0;
                                    if (!data || data.length === 0) return 0;
                                    let count = 0;
                                    data.forEach((c: any) => {
                                        if (!c.commission_type) return;
                                        const completedTypes = c.commission_type.split(',').map((t: string) => t.trim());
                                        const hasMatch = types.some(type => completedTypes.includes(type));
                                        if (hasMatch) count++;
                                    });
                                    return count;
                                } catch {
                                    return 0;
                                }
                            };
                            
                            // Get all available runners
                            const { data: availableRunners, error: runnersError } = await supabase
                                .from("users")
                                .select("id, latitude, longitude")
                                .eq("role", "BuddyRunner")
                                .eq("is_available", true);
                            
                            if (runnersError || !availableRunners || availableRunners.length === 0) {
                                console.log(`❌ [Notification Ranking] No available runners found`);
                                return false;
                            }
                            
                            // Filter runners within 500m and calculate ranks
                            const eligibleRunners: Array<{ id: string; count: number; distance: number }> = [];
                            
                            for (const runner of availableRunners) {
                                if (!runner.latitude || !runner.longitude) continue;
                                const lat = typeof runner.latitude === 'number' ? runner.latitude : parseFloat(String(runner.latitude || ''));
                                const lon = typeof runner.longitude === 'number' ? runner.longitude : parseFloat(String(runner.longitude || ''));
                                if (!lat || !lon || isNaN(lat) || isNaN(lon)) continue;
                                
                                const distanceKm = LocationService.calculateDistance(
                                    lat, lon,
                                    callerLocation.latitude, callerLocation.longitude
                                );
                                const distanceMeters = distanceKm * 1000;
                                
                                if (distanceMeters > 500) continue;
                                
                                const count = await getRunnerCompletedCount(runner.id, commissionTypes);
                                eligibleRunners.push({ id: runner.id, count, distance: distanceMeters });
                            }
                            
                            if (eligibleRunners.length === 0) {
                                console.log(`❌ [Notification Ranking] No eligible runners within range`);
                                return false;
                            }
                            
                            // Sort by count (descending), then distance (ascending)
                            eligibleRunners.sort((a, b) => {
                                if (b.count !== a.count) return b.count - a.count;
                                return a.distance - b.distance;
                            });
                            
                            const topRunner = eligibleRunners[0];
                            console.log(`🏆 [Notification Ranking] Top-ranked runner: ${topRunner.id} with ${topRunner.count} completed commissions`);
                            
                            // Assign to top-ranked runner
                            const { error: updateError } = await supabase.rpc('update_commission_notification', {
                                p_commission_id: commission.id,
                                p_notified_runner_id: topRunner.id,
                                p_notified_at: new Date().toISOString()
                            });
                            
                            if (updateError) {
                                console.error(`❌ [Notification Ranking] Failed to update notified_runner_id for commission ${commission.id}:`, updateError);
                            } else {
                                console.log(`✅ [Notification Ranking] Successfully updated notified_runner_id for commission ${commission.id} to runner ${topRunner.id}`);
                            }
                            
                            // Only show if current runner is the top-ranked runner
                            if (topRunner.id === currentUser.id) {
                                console.log(`✅ [Notification Ranking] Commission ${commission.id}: Assigned to current runner ${currentUser.id} (top-ranked)`);
                                return true;
                            } else {
                                console.log(`❌ [Notification Ranking] Commission ${commission.id}: Assigned to runner ${topRunner.id}, not current runner`);
                                return false;
                            }
                        }
                        
                        // Check if 60 seconds have passed since notification
                        const now = new Date();
                        const notifiedAt = commission.notified_at ? new Date(commission.notified_at) : null;
                        const sixtySecondsAgo = new Date(now.getTime() - 60000);
                        
                        if (notifiedAt && notifiedAt < sixtySecondsAgo) {
                            // 60 seconds passed, current runner might be eligible (ranking will be handled by commission filtering on next refresh)
                            console.log(`⏰ [Notification Ranking] Commission ${commission.id}: 60 seconds passed, current runner may be eligible`);
                            // Still return false here - let the commission filtering logic handle the reassignment
                            return false;
                        } else {
                            // Not yet 60 seconds, don't show to current runner
                            console.log(`⏳ [Notification Ranking] Commission ${commission.id}: Assigned to runner ${commission.notified_runner_id}, waiting for 60 seconds timeout...`);
                            return false;
                        }
                    };
                    
                    // Apply async filter using Promise.all
                    const filterResults = await Promise.all(commissions.map(filterCommission));
                    const filteredCommissions = commissions.filter((_, index) => filterResults[index]);

                    console.log('Filtered commissions (excluding declined, beyond 500m, and ranking):', filteredCommissions);

                    if (filteredCommissions.length > 0) {
                        // Create caller name map from already fetched callers
                            const callerMap: Record<string, { name: string; avatar?: string }> = {};
                            callers?.forEach(caller => {
                                const name = `${caller.first_name || ''} ${caller.last_name || ''}`.trim() || 'BuddyCaller';
                                callerMap[caller.id] = {
                                    name,
                                    avatar: caller.profile_picture_url || undefined
                                };
                            });

                            // Convert commissions to notifications
                            const commissionNotifs = filteredCommissions.map((c: any) => {
                                const callerInfo = callerMap[c.buddycaller_id] || { name: 'BuddyCaller' };
                                console.log('Converting commission to notification:', { commission: c, callerInfo });
                                return createNotificationFromCommission(c, callerInfo.name, callerInfo.avatar);
                            });

                            allNotifications = [...allNotifications, ...commissionNotifs];
                    }
                }

                // Process warning notifications
                if (warningNotifications && warningNotifications.length > 0) {
                    const warningNotifs: Notif[] = warningNotifications.map((notif: any) => ({
                        id: `warning_${notif.id}`,
                        title: notif.title,
                        body: notif.message,
                        avatar: 'https://via.placeholder.com/40x40/FF6B6B/FFFFFF?text=⚠️',
                        created_at: notif.created_at,
                        commission_id: undefined,
                        caller_name: undefined,
                    }));

                    allNotifications = [...allNotifications, ...warningNotifs];
                }

                // Sort all notifications by creation date (newest first)
                allNotifications.sort((a, b) => {
                    const dateA = new Date(a.created_at || 0).getTime();
                    const dateB = new Date(b.created_at || 0).getTime();
                    return dateB - dateA;
                });

                console.log('All notifications loaded:', allNotifications);
                setNotifications(allNotifications);
            } catch (error) {
                console.error('Error loading notifications:', error);
            } finally {
                setLoading(false);
            }
    }, []);

    // Load notifications and set up real-time subscription
    React.useEffect(() => {
        loadNotifications();

        // Set up real-time subscription for commission changes
        const channel = supabase
            .channel('runner_notifications')
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'commission'
                },
                async (payload) => {
                    console.log('New commission notification received:', payload);
                    const commission = payload.new as any;

                    // Only process if status is pending
                    if (commission.status !== 'pending') {
                        console.log('Commission not pending, skipping notification:', commission.status);
                        return;
                    }

                    // Get current user to check if they were declined and if they're online
                    const { data: { user: currentUser } } = await supabase.auth.getUser();
                    if (!currentUser) {
                        console.error('No authenticated user found for real-time notification');
                        return;
                    }

                    // Check if runner is available (online) and has location - only online runners should see commissions
                    const { data: runnerData } = await supabase
                        .from("users")
                        .select("is_available, latitude, longitude")
                        .eq("id", currentUser.id)
                        .single();

                    if (!runnerData?.is_available) {
                        console.log('Runner is not available (offline), skipping notification for commission:', commission.id);
                        return;
                    }

                    if (!runnerData?.latitude || !runnerData?.longitude) {
                        console.log('Runner does not have location set, skipping notification for commission:', commission.id);
                        return;
                    }

                    // Check if current user was declined for this commission
                    if (commission.declined_runner_id === currentUser.id) {
                        console.log('User was declined for this commission, skipping notification:', commission.id);
                        return;
                    }

                    // Get caller details and location
                    const { data: callerData, error: callerError } = await supabase
                        .from('users')
                        .select('first_name, last_name, profile_picture_url, latitude, longitude')
                        .eq('id', commission.buddycaller_id)
                        .single();

                    if (callerError) {
                        console.error('Error fetching caller data:', callerError);
                        return;
                    }

                    // Check distance (500 meters = 0.5 km)
                    if (callerData?.latitude && callerData?.longitude) {
                        const distanceKm = LocationService.calculateDistance(
                            runnerData.latitude,
                            runnerData.longitude,
                            callerData.latitude,
                            callerData.longitude
                        );
                        const distanceMeters = distanceKm * 1000;

                        if (distanceMeters > 500) {
                            console.log(`Skipping notification for commission ${commission.id} - distance: ${distanceMeters.toFixed(2)}m (exceeds 500m)`);
                            return;
                        }
                    } else {
                        console.log(`Skipping notification for commission ${commission.id} - caller has no location`);
                        return;
                    }

                    const callerName = callerData
                        ? `${callerData.first_name || ''} ${callerData.last_name || ''}`.trim() || 'BuddyCaller'
                        : 'BuddyCaller';

                    const newNotification = createNotificationFromCommission(commission, callerName, callerData?.profile_picture_url);

                    console.log('Adding new notification:', newNotification);

                    // Add to beginning of notifications list
                    setNotifications(prev => [newNotification, ...prev]);
                }
            )
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'commission'
                },
                async (payload) => {
                    console.log('Commission update notification received:', payload);
                    const commission = payload.new as any;
                    const oldCommission = payload.old as any;

                    // If commission status changed from pending to something else, remove it from notifications
                    if (oldCommission.status === 'pending' && commission.status !== 'pending') {
                        console.log('Commission no longer pending, removing from notifications:', commission.id);
                        setNotifications(prev => prev.filter(notif => notif.commission_id !== commission.id));
                    }
                }
            )
            .subscribe((status) => {
                console.log('Mobile notification subscription status:', status);
            });

        return () => {
            supabase.removeChannel(channel);
        };
    }, [loadNotifications]);

    // Refresh notifications when screen comes into focus
    useFocusEffect(
        React.useCallback(() => {
            console.log('Mobile notification screen focused, refreshing notifications');
            // Reload notifications to ensure only pending commissions are shown
            const refreshNotifications = async () => {
                try {
                    // Get current user to filter out declined runners and check if online
                    const { data: { user: currentUser } } = await supabase.auth.getUser();
                    if (!currentUser) {
                        console.error('No authenticated user found for refresh');
                        return;
                    }

                    // Check if runner is available (online) - only online runners should see commissions
                    const { data: runnerData } = await supabase
                        .from("users")
                        .select("is_available")
                        .eq("id", currentUser.id)
                        .single();

                    if (!runnerData?.is_available) {
                        console.log('Runner is not available (offline), not showing notifications');
                        setNotifications([]);
                        return;
                    }

                    const { data: commissions, error } = await supabase
                        .from('commission')
                        .select('id, title, created_at, buddycaller_id, declined_runner_id, commission_type, notified_runner_id, notified_at')
                        .eq('status', 'pending')
                        .order('created_at', { ascending: false })
                        .limit(20);

                    if (error) {
                        console.error('Error refreshing notifications:', error);
                        return;
                    }

                    if (!commissions || commissions.length === 0) {
                        setNotifications([]);
                        return;
                    }

                    // Filter out commissions where current user was declined
                    const filteredCommissions = commissions.filter(commission => {
                        return commission.declined_runner_id !== currentUser.id;
                    });

                    if (filteredCommissions.length === 0) {
                        setNotifications([]);
                        return;
                    }

                    // Get caller details
                    const callerIds = filteredCommissions.map(c => c.buddycaller_id).filter(Boolean);
                    const { data: callers } = await supabase
                        .from('users')
                        .select('id, first_name, last_name, profile_picture_url')
                        .in('id', callerIds);

                    const callerMap: Record<string, { name: string; avatar?: string }> = {};
                    callers?.forEach(caller => {
                        const name = `${caller.first_name || ''} ${caller.last_name || ''}`.trim() || 'BuddyCaller';
                        callerMap[caller.id] = {
                            name,
                            avatar: caller.profile_picture_url || undefined
                        };
                    });

                    // Convert commissions to notifications
                    const notifs = filteredCommissions.map((c: any) => {
                        const callerInfo = callerMap[c.buddycaller_id] || { name: 'BuddyCaller' };
                        return createNotificationFromCommission(c, callerInfo.name, callerInfo.avatar);
                    });

                    setNotifications(notifs);
                } catch (error) {
                    console.error('Error refreshing notifications:', error);
                }
            };
            refreshNotifications();
        }, [])
    );

    const onView = (n: Notif) => {
        // Don't navigate for warning notifications
        if (n.id && typeof n.id === 'string' && n.id.startsWith('warning_')) {
            return;
        }
        
        if (n.commission_id) {
            // Navigate to commission details - use mobile version for mobile
            router.push(`/buddyrunner/view_commission?id=${n.commission_id}`);
        } else {
            // Navigate to messages
            router.push('/buddyrunner/messages');
        }
    };

    const onMarkAsRead = (n: Notif) => {
        // Remove from notifications list
        setNotifications(prev => prev.filter(notif => notif.id !== n.id));
    };

    const onDelete = (n: Notif) => {
        Alert.alert(
            'Delete Notification',
            'Are you sure you want to delete this notification?',
            [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Delete', style: 'destructive', onPress: () => onMarkAsRead(n) }
            ]
        );
    };

    return (
        <SafeAreaView style={styles.container}>
            <Stack.Screen
                options={{
                    title: 'Notifications',
                    headerStyle: { backgroundColor: colors.maroon },
                    headerTintColor: '#fff',
                    headerTitleStyle: { fontWeight: 'bold' },
                }}
            />
            <ScrollView style={styles.scrollView}>
                <View style={styles.headerContainer}>
                    <TouchableOpacity 
                        style={styles.backButton}
                        onPress={() => router.push('/buddyrunner/home')}
                    >
                        <Ionicons name="chevron-back" size={20} color={colors.maroon} />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>Notifications</Text>
            </View>
                {loading ? (
                    <View style={styles.loadingContainer}>
                        <Text style={styles.loadingText}>Loading notifications...</Text>
                    </View>
                ) : notifications.length === 0 ? (
                    <View style={styles.emptyContainer}>
                        <Ionicons name="notifications-outline" size={64} color={colors.border} />
                        <Text style={styles.emptyTitle}>No notifications</Text>
                        <Text style={styles.emptySubtitle}>You'll see new commission notifications here</Text>
                    </View>
                ) : (
                    notifications.map((notification, index) => (
                        <TouchableOpacity
                            key={notification.id}
                            style={styles.notificationCard}
                            onPress={() => onView(notification)}
                        >
                            <View style={styles.notificationContent}>
                                {!(notification.id && typeof notification.id === 'string' && notification.id.startsWith('warning_')) && (
                                    <Image
                                        source={{ uri: notification.avatar }}
                                        style={styles.avatar}
                                    />
                                )}
                                <View style={styles.notificationText}>
                                    <Text style={styles.notificationTitle}>
                                        {notification.id && typeof notification.id === 'string' && notification.id.startsWith('warning_') ? '⚠️ Warning' : 'New Commission'}
                                    </Text>
                                    <Text style={styles.notificationBody}>
                                        {notification.id && typeof notification.id === 'string' && notification.id.startsWith('warning_') 
                                            ? notification.body 
                                            : `${notification.caller_name || 'BuddyCaller'} posted a new commission.`
                                        }
                                    </Text>
                                    {notification.created_at && (
                                        <Text style={styles.notificationTime}>
                                            {formatNotificationTime(notification.created_at)}
                                        </Text>
                                    )}
                                </View>
                            </View>
                            {!(notification.id && typeof notification.id === 'string' && notification.id.startsWith('warning_')) && (
                                <TouchableOpacity
                                    style={styles.viewButton}
                                    onPress={() => onView(notification)}
                                >
                                    <Text style={styles.viewButtonText}>View &gt;</Text>
                                </TouchableOpacity>
                            )}
                        </TouchableOpacity>
                    ))
                )}
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.light,
    },
    scrollView: {
        flex: 1,
        padding: 16,
    },
    headerContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 20,
        paddingBottom: 12,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
    },
    backButton: {
        padding: 4,
        marginRight: 4,
    },
    headerTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        color: colors.maroon,
        marginLeft: 8,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingTop: 100,
    },
    loadingText: {
        fontSize: 16,
        color: colors.text,
        marginTop: 16,
    },
    emptyContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingTop: 100,
    },
    emptyTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        color: colors.text,
        marginTop: 16,
        marginBottom: 8,
    },
    emptySubtitle: {
        fontSize: 14,
        color: colors.border,
        textAlign: 'center',
        paddingHorizontal: 32,
    },
    notificationCard: {
        backgroundColor: '#fff',
        borderRadius: 12,
        padding: 16,
        marginBottom: 12,
        flexDirection: 'row',
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
    },
    notificationContent: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
    },
    avatar: {
        width: 40,
        height: 40,
        borderRadius: 20,
        marginRight: 12,
    },
    notificationText: {
        flex: 1,
    },
    notificationTitle: {
        fontSize: 16,
        fontWeight: 'bold',
        color: colors.maroon,
        marginBottom: 4,
    },
    notificationBody: {
        fontSize: 14,
        color: colors.text,
        marginBottom: 4,
    },
    notificationTime: {
        fontSize: 12,
        color: colors.text,
    },
    viewButton: {
        padding: 8,
    },
    viewButtonText: {
        fontSize: 14,
        fontWeight: 'bold',
        color: colors.maroon,
    },
});

/* 
================================================================================
                                    📱 WEB LAYOUT 📱
================================================================================
This section contains all the code for the WEB version of the notification screen.
It includes the sidebar navigation, main content area, and web-specific styling.
================================================================================
*/
function NotificationWebInstant() {
    const router = useRouter();
    const { width } = useWindowDimensions();
    
    // Responsive sidebar: hide completely on small screens (< 1024px), show on larger screens
    const isSmallScreen = width < 1024;
    const [open, setOpen] = useState(!isSmallScreen);
    
    // On small screens, start with sidebar closed (hidden)
    // On larger screens, start with sidebar open
    React.useEffect(() => {
        if (isSmallScreen) {
            setOpen(false);
        } else {
            setOpen(true);
        }
    }, [isSmallScreen]);
    
    const [section, setSection] = useState<"home" | "messages" | "profile">("messages");

    // State for notifications
    const [notifications, setNotifications] = useState<Notif[]>([]);
    const [loading, setLoading] = useState(true);

    // Logout flow: confirm -> sign out -> success -> /login
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [successOpen, setSuccessOpen] = useState(false);
    const [loggingOut, setLoggingOut] = useState(false);

    const requestLogout = () => setConfirmOpen(true);

    const performLogout = async () => {
        if (loggingOut) return;
        setLoggingOut(true);
        setConfirmOpen(false);
        setSuccessOpen(true);
        try {
            const { error } = await supabase.auth.signOut();
            if (error) throw error;
        } catch (e) {
            // optional: console.warn
        } finally {
            setLoggingOut(false);
        }
    };

    // Debug notifications state changes
    React.useEffect(() => {
        console.log('Web notifications state updated:', notifications);
    }, [notifications]);

    // >>> READ LOGGED USER (same as buddyrunner/home)
    const { fullName, roleLabel, profilePictureUrl } = useAuthProfile();

    // Define loadNotifications function
    const loadNotifications = React.useCallback(async () => {
            try {
                // Get current user to filter out declined runners and check if online
                const { data: { user: currentUser } } = await supabase.auth.getUser();
                if (!currentUser) {
                    console.error('No authenticated user found');
                    return;
                }

                // Check if runner is available (online) and has location - only online runners should see commissions
                const { data: runnerData } = await supabase
                    .from("users")
                    .select("is_available, latitude, longitude")
                    .eq("id", currentUser.id)
                    .single();

                if (!runnerData?.is_available) {
                    console.log('Runner is not available (offline), not loading notifications');
                    setNotifications([]);
                    setLoading(false);
                    return;
                }

                // Use device's current GPS location for filtering (not database location)
                console.log('🔄 [Web Notification] Getting device current GPS location for filtering...');
                let runnerLat: number = 0;
                let runnerLon: number = 0;
                let locationSource: 'gps' | 'database' = 'gps';

                // Try to get GPS location with retries before falling back to database
                let locationResult;
                const maxRetries = 3;
                let retryCount = 0;
                
                while (retryCount < maxRetries) {
                    try {
                        if (retryCount > 0) {
                            console.log(`🔄 [Web Notification] Retrying GPS location (attempt ${retryCount + 1}/${maxRetries})...`);
                            await new Promise(resolve => setTimeout(resolve, 500 * retryCount));
                        }
                        
                        locationResult = await LocationService.getCurrentLocation();
                        
                        if (locationResult.success && locationResult.location) {
                            const accuracy = locationResult.location.accuracy || 0;
                            if (accuracy > 500) {
                                console.warn(`⚠️ [Web Notification] GPS accuracy extremely poor: ${accuracy.toFixed(2)}m (max: 500m), retrying...`);
                                retryCount++;
                                if (retryCount >= maxRetries) {
                                    console.warn('⚠️ [Web Notification] GPS accuracy still poor after retries, but will use GPS location anyway');
                                } else {
                                    continue;
                                }
                            } else if (accuracy > 100) {
                                console.warn(`⚠️ [Web Notification] GPS accuracy is moderate: ${accuracy.toFixed(2)}m (will use it anyway)`);
                            }
                            
                            runnerLat = locationResult.location.latitude;
                            runnerLon = locationResult.location.longitude;
                            locationSource = 'gps';
                            console.log('✅ [Web Notification] Device current GPS location obtained:', { 
                                lat: runnerLat, 
                                lon: runnerLon,
                                accuracy: locationResult.location.accuracy,
                                runnerId: currentUser.id,
                                source: locationSource,
                                attempts: retryCount + 1
                            });
                            break;
                        } else {
                            retryCount++;
                            if (retryCount >= maxRetries) {
                                throw new Error(locationResult.error || 'Failed to get GPS location after retries');
                            }
                        }
                    } catch (error: any) {
                        retryCount++;
                        if (retryCount >= maxRetries) {
                            console.warn('⚠️ [Web Notification] Failed to get device current GPS location after all retries, falling back to database location:', error);
                            break;
                        }
                    }
                }
                
                // If GPS still failed after retries, fall back to database
                if (!locationResult || !locationResult.success || !locationResult.location) {
                    const dbLat = typeof runnerData?.latitude === 'number' ? runnerData.latitude : parseFloat(String(runnerData?.latitude || ''));
                    const dbLon = typeof runnerData?.longitude === 'number' ? runnerData.longitude : parseFloat(String(runnerData?.longitude || ''));
                    
                    if (!dbLat || !dbLon || isNaN(dbLat) || isNaN(dbLon)) {
                        console.log('❌ [Web Notification] Database location also invalid, not loading notifications');
                        setNotifications([]);
                        setLoading(false);
                        return;
                    }
                    
                    runnerLat = dbLat;
                    runnerLon = dbLon;
                    locationSource = 'database';
                    console.log('✅ [Web Notification] Using database location as fallback:', { 
                        lat: runnerLat, 
                        lon: runnerLon,
                        runnerId: currentUser.id,
                        source: locationSource
                    });
                }

                // Get GPS accuracy if available
                let gpsAccuracy = 0;
                if (locationSource === 'gps' && locationResult?.location?.accuracy) {
                    gpsAccuracy = locationResult.location.accuracy;
                }

                console.log('✅ [Web Notification] Runner location for filtering:', { 
                    lat: runnerLat, 
                    lon: runnerLon, 
                    runnerId: currentUser.id, 
                    source: locationSource,
                    gpsAccuracy: gpsAccuracy > 0 ? `${gpsAccuracy.toFixed(2)}m` : 'N/A'
                });

                // Load recent commissions, excluding those where current user was declined
                const { data: commissions, error } = await supabase
                    .from('commission')
                    .select('id, title, created_at, buddycaller_id, declined_runner_id, commission_type, notified_runner_id, notified_at, timeout_runner_ids')
                    .eq('status', 'pending')
                    .order('created_at', { ascending: false })
                    .limit(20);

                if (error) {
                    console.error('Error loading notifications:', error);
                    return;
                }

                console.log('Commissions loaded:', commissions);

                // Load warning notifications from the notifications table
                const { data: warningNotifications, error: warningError } = await supabase
                    .from('notifications')
                    .select('id, title, message, type, created_at, is_read')
                    .eq('user_id', currentUser.id)
                    .eq('type', 'warning')
                    .order('created_at', { ascending: false })
                    .limit(10);

                if (warningError) {
                    console.error('Error loading warning notifications:', warningError);
                }

                console.log('Warning notifications loaded:', warningNotifications);

                let allNotifications: Notif[] = [];

                // Process commission notifications
                if (commissions && commissions.length > 0) {
                    // Get caller IDs first to fetch locations
                    const callerIds = commissions.map(c => c.buddycaller_id).filter(Boolean);
                    
                    // Fetch caller details and locations
                    const { data: callers, error: callerError } = await supabase
                        .from('users')
                        .select('id, first_name, last_name, profile_picture_url, latitude, longitude')
                        .in('id', callerIds);

                    if (callerError) {
                        console.error('Error loading callers:', callerError);
                    }

                    // Create caller location map
                    const callerLocationMap: Record<string, { latitude: number; longitude: number }> = {};
                    callers?.forEach(caller => {
                        if (caller.latitude && caller.longitude) {
                            callerLocationMap[caller.id] = { latitude: caller.latitude, longitude: caller.longitude };
                        }
                    });

                    // Strict distance limit: 500 meters (no GPS accuracy expansion)
                    const distanceLimit = 500;

                    // Filter out commissions based on distance (500 meters = 0.5 km) and declined status
                    // Need to use async filter pattern since ranking logic requires async operations
                    const filterCommission = async (commission: any): Promise<boolean> => {
                        // Check if current user was declined for this commission
                        if (commission.declined_runner_id === currentUser.id) {
                            console.log('Filtering out commission where user was declined:', commission.id);
                            return false;
                        }
                        
                        // Check distance if caller has location
                        const callerLocation = callerLocationMap[commission.buddycaller_id || ""];
                        if (callerLocation) {
                            const distanceKm = LocationService.calculateDistance(
                                runnerLat,
                                runnerLon,
                                callerLocation.latitude,
                                callerLocation.longitude
                            );
                            const distanceMeters = distanceKm * 1000;
                            
                            console.log(`\n📍 [Notification] Commission ${commission.id} distance calculation:`);
                            console.log(`   Runner location: (${runnerLat}, ${runnerLon}) [source: ${locationSource}]`);
                            if (gpsAccuracy > 0) {
                                console.log(`   GPS accuracy: ${gpsAccuracy.toFixed(2)}m`);
                            }
                            console.log(`   Caller location: (${callerLocation.latitude}, ${callerLocation.longitude})`);
                            console.log(`   Calculated distance: ${distanceMeters.toFixed(2)}m (${distanceKm.toFixed(4)} km)`);
                            console.log(`   Distance limit: 500m`);
                            console.log(`   ${distanceMeters <= 500 ? '✅ WITHIN RANGE' : '❌ EXCEEDS LIMIT'}`);
                            
                            if (distanceMeters > 500) {
                                console.log(`❌ Filtering out commission ${commission.id} - distance: ${distanceMeters.toFixed(2)}m exceeds 500m limit`);
                                return false;
                                } else {
                                    console.log(`✅ Commission ${commission.id} is within range: ${distanceMeters.toFixed(2)}m <= 500m`);
                            }
                        } else {
                            // If caller doesn't have location, exclude the commission
                            console.log(`Filtering out commission ${commission.id} - caller has no location`);
                            return false;
                        }
                        
                        // Apply ranking filter: only show if current runner is the notified runner or eligible after timeout
                        // If no commission type, show to all eligible runners (no ranking)
                        if (!commission.commission_type || commission.commission_type.trim() === '') {
                            console.log(`📊 [Notification Ranking] Commission ${commission.id} has no category/type, showing to all eligible runners`);
                        return true;
                        }
                        
                        // Check if current runner is the notified runner
                        if (commission.notified_runner_id === currentUser.id) {
                            console.log(`✅ [Notification Ranking] Commission ${commission.id}: Current runner is the notified runner`);
                            return true;
                        }
                        
                        // If no runner has been notified yet, perform ranking and assign to top runner
                        if (!commission.notified_runner_id) {
                            console.log(`🔍 [Notification Ranking] Commission ${commission.id}: Finding top-ranked runner...`);
                            
                            // Get caller location for distance calculation
                            const callerLocation = callerLocationMap[commission.buddycaller_id || ""];
                            if (!callerLocation) {
                                console.log(`❌ [Notification Ranking] Commission ${commission.id}: Caller has no location, cannot rank runners`);
                                return false;
                            }
                            
                            // Parse commission types
                            const commissionTypes = commission.commission_type 
                                ? commission.commission_type.split(',').map((t: string) => t.trim()).filter((t: string) => t.length > 0)
                                : [];
                            
                            // Helper function to get runner's completed commissions count
                            const getRunnerCompletedCount = async (runnerId: string, types: string[]): Promise<number> => {
                                if (!types || types.length === 0) return 0;
                                try {
                                    const { data, error } = await supabase
                                        .from("commission")
                                        .select("id, commission_type")
                                        .eq("runner_id", runnerId)
                                        .eq("status", "completed");
                                    if (error) return 0;
                                    if (!data || data.length === 0) return 0;
                                    let count = 0;
                                    data.forEach((c: any) => {
                                        if (!c.commission_type) return;
                                        const completedTypes = c.commission_type.split(',').map((t: string) => t.trim());
                                        const hasMatch = types.some(type => completedTypes.includes(type));
                                        if (hasMatch) count++;
                                    });
                                    return count;
                                } catch {
                                    return 0;
                                }
                            };
                            
                            // Get all available runners
                            const { data: availableRunners, error: runnersError } = await supabase
                                .from("users")
                                .select("id, latitude, longitude")
                                .eq("role", "BuddyRunner")
                                .eq("is_available", true);
                            
                            if (runnersError || !availableRunners || availableRunners.length === 0) {
                                console.log(`❌ [Notification Ranking] No available runners found`);
                                return false;
                            }
                            
                            // Filter runners within 500m and calculate ranks
                            const eligibleRunners: Array<{ id: string; count: number; distance: number }> = [];
                            
                            for (const runner of availableRunners) {
                                if (!runner.latitude || !runner.longitude) continue;
                                const lat = typeof runner.latitude === 'number' ? runner.latitude : parseFloat(String(runner.latitude || ''));
                                const lon = typeof runner.longitude === 'number' ? runner.longitude : parseFloat(String(runner.longitude || ''));
                                if (!lat || !lon || isNaN(lat) || isNaN(lon)) continue;
                                
                                const distanceKm = LocationService.calculateDistance(
                                    lat, lon,
                                    callerLocation.latitude, callerLocation.longitude
                                );
                                const distanceMeters = distanceKm * 1000;
                                
                                if (distanceMeters > 500) continue;
                                
                                const count = await getRunnerCompletedCount(runner.id, commissionTypes);
                                eligibleRunners.push({ id: runner.id, count, distance: distanceMeters });
                            }
                            
                            if (eligibleRunners.length === 0) {
                                console.log(`❌ [Notification Ranking] No eligible runners within range`);
                                return false;
                            }
                            
                            // Sort by count (descending), then distance (ascending)
                            eligibleRunners.sort((a, b) => {
                                if (b.count !== a.count) return b.count - a.count;
                                return a.distance - b.distance;
                            });
                            
                            const topRunner = eligibleRunners[0];
                            console.log(`🏆 [Notification Ranking] Top-ranked runner: ${topRunner.id} with ${topRunner.count} completed commissions`);
                            
                            // Assign to top-ranked runner
                            const { error: updateError } = await supabase.rpc('update_commission_notification', {
                                p_commission_id: commission.id,
                                p_notified_runner_id: topRunner.id,
                                p_notified_at: new Date().toISOString()
                            });
                            
                            if (updateError) {
                                console.error(`❌ [Notification Ranking] Failed to update notified_runner_id for commission ${commission.id}:`, updateError);
                            } else {
                                console.log(`✅ [Notification Ranking] Successfully updated notified_runner_id for commission ${commission.id} to runner ${topRunner.id}`);
                            }
                            
                            // Only show if current runner is the top-ranked runner
                            if (topRunner.id === currentUser.id) {
                                console.log(`✅ [Notification Ranking] Commission ${commission.id}: Assigned to current runner ${currentUser.id} (top-ranked)`);
                                return true;
                            } else {
                                console.log(`❌ [Notification Ranking] Commission ${commission.id}: Assigned to runner ${topRunner.id}, not current runner`);
                                return false;
                            }
                        }
                        
                        // Check if 60 seconds have passed since notification
                        const now = new Date();
                        const notifiedAt = commission.notified_at ? new Date(commission.notified_at) : null;
                        const sixtySecondsAgo = new Date(now.getTime() - 60000);
                        
                        if (notifiedAt && notifiedAt < sixtySecondsAgo) {
                            // 60 seconds passed, current runner might be eligible (ranking will be handled by commission filtering on next refresh)
                            console.log(`⏰ [Notification Ranking] Commission ${commission.id}: 60 seconds passed, current runner may be eligible`);
                            // Still return false here - let the commission filtering logic handle the reassignment
                            return false;
                        } else {
                            // Not yet 60 seconds, don't show to current runner
                            console.log(`⏳ [Notification Ranking] Commission ${commission.id}: Assigned to runner ${commission.notified_runner_id}, waiting for 60 seconds timeout...`);
                            return false;
                        }
                    };
                    
                    // Apply async filter using Promise.all
                    const filterResults = await Promise.all(commissions.map(filterCommission));
                    const filteredCommissions = commissions.filter((_, index) => filterResults[index]);

                    console.log('Filtered commissions (excluding declined, beyond 500m, and ranking):', filteredCommissions);

                    if (filteredCommissions.length > 0) {
                        // Create caller name map from already fetched callers
                            const callerMap: Record<string, { name: string; avatar?: string }> = {};
                            callers?.forEach(caller => {
                                const name = `${caller.first_name || ''} ${caller.last_name || ''}`.trim() || 'BuddyCaller';
                                callerMap[caller.id] = {
                                    name,
                                    avatar: caller.profile_picture_url || undefined
                                };
                            });

                            // Convert commissions to notifications
                            const commissionNotifs = filteredCommissions.map((c: any) => {
                                const callerInfo = callerMap[c.buddycaller_id] || { name: 'BuddyCaller' };
                                console.log('Converting commission to notification:', { commission: c, callerInfo });
                                return createNotificationFromCommission(c, callerInfo.name, callerInfo.avatar);
                            });

                            allNotifications = [...allNotifications, ...commissionNotifs];
                    }
                }

                // Process warning notifications
                if (warningNotifications && warningNotifications.length > 0) {
                    const warningNotifs: Notif[] = warningNotifications.map((notif: any) => ({
                        id: `warning_${notif.id}`,
                        title: notif.title,
                        body: notif.message,
                        avatar: 'https://via.placeholder.com/40x40/FF6B6B/FFFFFF?text=⚠️',
                        created_at: notif.created_at,
                        commission_id: undefined,
                        caller_name: undefined,
                    }));

                    allNotifications = [...allNotifications, ...warningNotifs];
                }

                // Sort all notifications by creation date (newest first)
                allNotifications.sort((a, b) => {
                    const dateA = new Date(a.created_at || 0).getTime();
                    const dateB = new Date(b.created_at || 0).getTime();
                    return dateB - dateA;
                });

                console.log('All notifications loaded:', allNotifications);
                setNotifications(allNotifications);
            } catch (error) {
                console.error('Error loading notifications:', error);
            } finally {
                setLoading(false);
            }
    }, []);

    // Load notifications and set up real-time subscription
    React.useEffect(() => {
        loadNotifications();

        // Set up real-time subscription for commission changes
        const channel = supabase
            .channel('runner_notifications_web')
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'commission'
                },
                async (payload) => {
                    console.log('New commission notification received (web):', payload);
                    const commission = payload.new as any;

                    // Only process if status is pending
                    if (commission.status !== 'pending') {
                        console.log('Commission not pending, skipping notification:', commission.status);
                        return;
                    }

                    // Get current user to check if they were declined and if they're online
                    const { data: { user: currentUser } } = await supabase.auth.getUser();
                    if (!currentUser) {
                        console.error('No authenticated user found for real-time notification');
                        return;
                    }

                    // Check if runner is available (online) and has location - only online runners should see commissions
                    const { data: runnerData } = await supabase
                        .from("users")
                        .select("is_available, latitude, longitude")
                        .eq("id", currentUser.id)
                        .single();

                    if (!runnerData?.is_available) {
                        console.log('Runner is not available (offline), skipping notification for commission:', commission.id);
                        return;
                    }

                    if (!runnerData?.latitude || !runnerData?.longitude) {
                        console.log('Runner does not have location set, skipping notification for commission:', commission.id);
                        return;
                    }

                    // Check if current user was declined for this commission
                    if (commission.declined_runner_id === currentUser.id) {
                        console.log('User was declined for this commission, skipping notification:', commission.id);
                        return;
                    }

                    // Get caller details and location
                    const { data: callerData, error: callerError } = await supabase
                        .from('users')
                        .select('first_name, last_name, profile_picture_url, latitude, longitude')
                        .eq('id', commission.buddycaller_id)
                        .single();

                    if (callerError) {
                        console.error('Error fetching caller data:', callerError);
                        return;
                    }

                    // Check distance (500 meters = 0.5 km)
                    if (callerData?.latitude && callerData?.longitude) {
                        const distanceKm = LocationService.calculateDistance(
                            runnerData.latitude,
                            runnerData.longitude,
                            callerData.latitude,
                            callerData.longitude
                        );
                        const distanceMeters = distanceKm * 1000;

                        if (distanceMeters > 500) {
                            console.log(`Skipping notification for commission ${commission.id} (web) - distance: ${distanceMeters.toFixed(2)}m (exceeds 500m)`);
                            return;
                        }
                    } else {
                        console.log(`Skipping notification for commission ${commission.id} (web) - caller has no location`);
                        return;
                    }

                    const callerName = callerData
                        ? `${callerData.first_name || ''} ${callerData.last_name || ''}`.trim() || 'BuddyCaller'
                        : 'BuddyCaller';

                    const newNotification = createNotificationFromCommission(commission, callerName, callerData?.profile_picture_url);

                    console.log('Adding new notification (web):', newNotification);

                    // Add to beginning of notifications list
                    setNotifications(prev => [newNotification, ...prev]);
                }
            )
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'commission'
                },
                async (payload) => {
                    console.log('Commission update notification received (web):', payload);
                    const commission = payload.new as any;
                    const oldCommission = payload.old as any;

                    // If commission status changed from pending to something else, remove it from notifications
                    if (oldCommission.status === 'pending' && commission.status !== 'pending') {
                        console.log('Commission no longer pending, removing from notifications (web):', commission.id);
                        setNotifications(prev => prev.filter(notif => notif.commission_id !== commission.id));
                    }
                }
            )
            .subscribe((status) => {
                console.log('Web notification subscription status:', status);
            });

        return () => {
            supabase.removeChannel(channel);
        };
    }, [loadNotifications]);

    // Refresh notifications when screen comes into focus
    useFocusEffect(
        React.useCallback(() => {
            console.log('Web notification screen focused, refreshing notifications');
            // Reload notifications to ensure only pending commissions are shown
            const refreshNotifications = async () => {
                try {
                    // Get current user to filter out declined runners and check if online
                    const { data: { user: currentUser } } = await supabase.auth.getUser();
                    if (!currentUser) {
                        console.error('No authenticated user found for refresh');
                        return;
                    }

                    // Check if runner is available (online) - only online runners should see commissions
                    const { data: runnerData } = await supabase
                        .from("users")
                        .select("is_available")
                        .eq("id", currentUser.id)
                        .single();

                    if (!runnerData?.is_available) {
                        console.log('Runner is not available (offline), not showing notifications');
                        setNotifications([]);
                        return;
                    }

                    const { data: commissions, error } = await supabase
                        .from('commission')
                        .select('id, title, created_at, buddycaller_id, declined_runner_id, commission_type, notified_runner_id, notified_at')
                        .eq('status', 'pending')
                        .order('created_at', { ascending: false })
                        .limit(20);

                    if (error) {
                        console.error('Error refreshing notifications:', error);
                        return;
                    }

                    if (!commissions || commissions.length === 0) {
                        setNotifications([]);
                        return;
                    }

                    // Filter out commissions where current user was declined
                    const filteredCommissions = commissions.filter(commission => {
                        return commission.declined_runner_id !== currentUser.id;
                    });

                    if (filteredCommissions.length === 0) {
                        setNotifications([]);
                        return;
                    }

                    // Get caller details
                    const callerIds = filteredCommissions.map(c => c.buddycaller_id).filter(Boolean);
                    const { data: callers } = await supabase
                        .from('users')
                        .select('id, first_name, last_name, profile_picture_url')
                        .in('id', callerIds);

                    const callerMap: Record<string, { name: string; avatar?: string }> = {};
                    callers?.forEach(caller => {
                        const name = `${caller.first_name || ''} ${caller.last_name || ''}`.trim() || 'BuddyCaller';
                        callerMap[caller.id] = {
                            name,
                            avatar: caller.profile_picture_url || undefined
                        };
                    });

                    // Convert commissions to notifications
                    const notifs = filteredCommissions.map((c: any) => {
                        const callerInfo = callerMap[c.buddycaller_id] || { name: 'BuddyCaller' };
                        return createNotificationFromCommission(c, callerInfo.name, callerInfo.avatar);
                    });

                    setNotifications(notifs);
                } catch (error) {
                    console.error('Error refreshing notifications:', error);
                }
            };
            refreshNotifications();
        }, [])
    );

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }}>
            <Stack.Screen
                options={{
                    title: 'Notifications',
                    headerStyle: { backgroundColor: colors.maroon },
                    headerTintColor: '#fff',
                    headerTitleStyle: { fontWeight: 'bold' },
                }}
            />
            {/* Logout Modals */}
            <ConfirmModal
                visible={confirmOpen}
                title="Log Out?"
                message="Are you sure you want to log out?"
                onCancel={() => setConfirmOpen(false)}
                onConfirm={performLogout}
            />
            <SuccessModal
                visible={successOpen}
                title="Logged out"
                message="You have logged out."
                onClose={() => {
                    setSuccessOpen(false);
                    router.replace("/login");
                }}
            />

            <View style={{ flex: 1, flexDirection: "row", position: "relative" }}>
                {/* Overlay backdrop for small screens when sidebar is open */}
                {isSmallScreen && open && (
                    <TouchableOpacity
                        style={web.sidebarOverlay}
                        activeOpacity={1}
                        onPress={() => setOpen(false)}
                    />
                )}
                <Sidebar
                    open={open}
                    isSmallScreen={isSmallScreen}
                    onToggle={() => setOpen((v) => !v)}
                    onLogout={requestLogout}
                    userName={fullName}
                    userRole={roleLabel || "BuddyRunner"}
                    profilePictureUrl={profilePictureUrl}
                />
                <View style={web.mainArea}>
                    <ScrollView style={web.scrollView}>
                    <View style={web.headerContainer}>
                        {/* Hamburger menu button for small screens */}
                        {isSmallScreen && (
                            <TouchableOpacity
                                onPress={() => setOpen(true)}
                                style={web.hamburgerBtn}
                                activeOpacity={0.7}
                            >
                                <Ionicons name="menu-outline" size={24} color={colors.text} />
                            </TouchableOpacity>
                        )}
                        <TouchableOpacity 
                            style={web.backButton}
                            onPress={() => router.push('/buddyrunner/home')}
                        >
                            <Ionicons name="chevron-back" size={24} color={colors.maroon} />
                        </TouchableOpacity>
                        <Text style={web.headerTitle}>Notifications</Text>
                    </View>
                                {loading ? (
                                    <View style={web.loadingContainer}>
                                        <Text style={web.loadingText}>Loading notifications...</Text>
                                    </View>
                                ) : notifications.length === 0 ? (
                                    <View style={web.emptyContainer}>
                            <Ionicons name="notifications-outline" size={64} color={colors.border} />
                            <Text style={web.emptyTitle}>No notifications</Text>
                            <Text style={web.emptySubtitle}>You'll see new commission notifications here</Text>
                                    </View>
                                ) : (
                        notifications.map((notification, index) => (
                                        <TouchableOpacity
                                key={notification.id}
                                style={web.notificationCard}
                                onPress={() => {
                                    if (notification.commission_id) {
                                        router.push(`/buddyrunner/view_commission_web?id=${notification.commission_id}&withSidebar=1`);
                                    } else {
                                        router.push('/buddyrunner/messages');
                                    }
                                }}
                            >
                                <View style={web.notificationContent}>
                                    {!(notification.id && typeof notification.id === 'string' && notification.id.startsWith('warning_')) && (
                                        <Image
                                            source={{ uri: notification.avatar }}
                                            style={web.avatar}
                                        />
                                    )}
                                    <View style={web.notificationText}>
                                        <Text style={web.notificationTitle}>
                                            {notification.id && typeof notification.id === 'string' && notification.id.startsWith('warning_') ? '⚠️ Warning' : 'New Commission'}
                                        </Text>
                                        <Text style={web.notificationBody}>
                                            {notification.id && typeof notification.id === 'string' && notification.id.startsWith('warning_') 
                                                ? notification.body 
                                                : `${notification.caller_name || 'BuddyCaller'} posted a new commission.`
                                            }
                                        </Text>
                                        {notification.created_at && (
                                            <Text style={web.notificationTime}>
                                                {formatNotificationTime(notification.created_at)}
                                            </Text>
                                        )}
                                    </View>
                                </View>
                                {!(notification.id && typeof notification.id === 'string' && notification.id.startsWith('warning_')) && (
                                    <TouchableOpacity
                                        style={web.viewButton}
                                        onPress={() => {
                                            if (notification.commission_id) {
                                                router.push(`/buddyrunner/view_commission_web?id=${notification.commission_id}&withSidebar=1`);
                                            } else {
                                                router.push('/buddyrunner/messages');
                                            }
                                        }}
                                    >
                                        <Text style={web.viewButtonText}>View &gt;</Text>
                                    </TouchableOpacity>
                                )}
                                        </TouchableOpacity>
                                    ))
                                )}
                    </ScrollView>
                </View>
            </View>
        </SafeAreaView>
    );
}

/* ======================= SIDEBAR (WEB) ======================= */
function Sidebar({
    open,
    isSmallScreen,
    onToggle,
    onLogout,
    userName,
    userRole,
    profilePictureUrl,
}: {
    open: boolean;
    isSmallScreen: boolean;
    onToggle: () => void;
    onLogout: () => void;
    userName: string;
    userRole: string;
    profilePictureUrl?: string | null;
}) {
    const router = useRouter();

    // On small screens, sidebar should be hidden (off-screen) when closed, visible when open
    // On larger screens, sidebar should be visible (collapsed or expanded)
    const sidebarStyle = isSmallScreen
        ? [
              web.sidebar,
              web.sidebarSmallScreen,
              {
                  transform: [{ translateX: open ? 0 : -260 }],
                  width: 260,
              },
          ]
        : [web.sidebar, { width: open ? 260 : 74 }];

    return (
        <View style={sidebarStyle}>
            <View style={{ paddingHorizontal: open ? 12 : 6, paddingVertical: 12 }}>
                <View
                    style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: open ? 10 : 0,
                        justifyContent: open ? "flex-start" : "center",
                    }}
                >
                    <TouchableOpacity onPress={onToggle} style={web.sideMenuBtn}>
                        <Ionicons name="menu-outline" size={20} color={colors.text} />
                    </TouchableOpacity>
                    {open && (
                        <>
                            <Image source={require("../../assets/images/logo.png")} style={{ width: 22, height: 22, resizeMode: "contain" }} />
                            <Text style={web.brand}>GoBuddy</Text>
                        </>
                    )}
                </View>
            </View>

            <View style={{ flex: 1, justifyContent: "space-between" }}>
                <View style={{ paddingTop: 8 }}>
                    <SideItem
                        label="Home"
                        icon="home-outline"
                        open={open}
                        onPress={() => router.push("/buddyrunner/home")}
                    />
                    <Separator />
                    <SideItem
                        label="Messages"
                        icon="chatbubbles-outline"
                        open={open}
                        onPress={() => router.push("/buddyrunner/messages_hub")}
                    />
                    <Separator />
                    <SideItem
                        label="Profile"
                        icon="person-outline"
                        open={open}
                        onPress={() => router.push("/buddyrunner/profile")}
                    />
                    <Separator />
                </View>

                <View style={web.sidebarFooter}>
                    <View style={web.userCard}>
                        <View style={web.userAvatar}>
                            {profilePictureUrl ? (
                                <Image 
                                    source={{ uri: profilePictureUrl }} 
                                    style={{ width: 34, height: 34, borderRadius: 17, overflow: "hidden" }}
                                    resizeMode="cover"
                                />
                            ) : (
                                <Ionicons name="person" size={18} color={colors.maroon} />
                            )}
                        </View>
                        {open && (
                            <View style={{ flex: 1 }}>
                                <Text style={web.userName}>{userName || "User"}</Text>
                                {!!userRole && <Text style={web.userRole}>{userRole}</Text>}
                            </View>
                        )}
                    </View>

                    {open && (
                        <TouchableOpacity onPress={onLogout} activeOpacity={0.9} style={web.logoutBtn}>
                            <Ionicons name="log-out-outline" size={18} color={colors.maroon} />
                            <Text style={web.logoutText}>Logout</Text>
                        </TouchableOpacity>
                    )}
                </View>
            </View>
        </View>
    );
}

function SideItem({
    label,
    icon,
    open,
    active,
    onPress,
}: {
    label: string;
    icon: any;
    open: boolean;
    active?: boolean;
    onPress?: () => void;
}) {
    return (
        <TouchableOpacity
            activeOpacity={0.9}
            onPress={onPress}
            style={[web.sideItem, active && { backgroundColor: colors.maroon }, !open && web.sideItemCollapsed]}
        >
            <Ionicons name={icon} size={18} color={active ? "#fff" : colors.text} />
            {open && (
                <Text style={[web.sideItemText, active && { color: "#fff", fontWeight: "700" }]}>{label}</Text>
            )}
        </TouchableOpacity>
    );
}

function Separator() { return <View style={{ height: 1, backgroundColor: colors.border }} />; }

/* ======================= CONFIRM MODALS FOR LOGOUT ======================= */
function ConfirmModal({
    visible,
    title,
    message,
    onCancel,
    onConfirm,
}: {
    visible: boolean;
    title: string;
    message: string;
    onCancel: () => void;
    onConfirm: () => void;
}) {
    return (
        <Modal transparent visible={visible} animationType="fade" onRequestClose={onCancel}>
            <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.38)", alignItems: "center", justifyContent: "center", padding: 16 }}>
                <View style={{ width: 360, maxWidth: "100%", backgroundColor: "#fff", borderRadius: 14, padding: 18 }}>
                    <Text style={{ color: colors.text, fontSize: 16, fontWeight: "900", marginBottom: 6 }}>{title}</Text>
                    <Text style={{ color: colors.text, fontSize: 13, opacity: 0.9, marginBottom: 14 }}>{message}</Text>
                    <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 10 }}>
                        <TouchableOpacity onPress={onCancel} style={{ paddingVertical: 10, paddingHorizontal: 16, borderRadius: 10, backgroundColor: "#EEE" }} activeOpacity={0.9}>
                            <Text style={{ color: colors.text, fontWeight: "700" }}>Cancel</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={onConfirm} style={{ paddingVertical: 10, paddingHorizontal: 16, borderRadius: 10, backgroundColor: colors.maroon }} activeOpacity={0.9}>
                            <Text style={{ color: "#fff", fontWeight: "700" }}>Log out</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </Modal>
    );
}

function SuccessModal({
    visible,
    title = "Logged out",
    message = "You have logged out.",
    onClose,
}: {
    visible: boolean;
    title?: string;
    message?: string;
    onClose: () => void;
}) {
    return (
        <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
            <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.38)", alignItems: "center", justifyContent: "center", padding: 16 }}>
                <View style={{ width: 360, maxWidth: "100%", backgroundColor: "#fff", borderRadius: 14, padding: 18 }}>
                    <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: "#F4E6E6", alignItems: "center", justifyContent: "center", alignSelf: "center", marginBottom: 16 }}>
                        <Ionicons name="checkmark-circle" size={44} color={colors.maroon} />
                    </View>
                    <Text style={{ color: colors.text, fontSize: 18, fontWeight: "900", textAlign: "center", marginBottom: 8 }}>{title}</Text>
                    <Text style={{ color: colors.text, fontSize: 14, opacity: 0.9, textAlign: "center", marginBottom: 24 }}>{message}</Text>
                    <TouchableOpacity onPress={onClose} style={{ paddingVertical: 10, paddingHorizontal: 16, borderRadius: 10, backgroundColor: colors.maroon, alignSelf: "center" }} activeOpacity={0.9}>
                        <Text style={{ color: "#fff", fontWeight: "700" }}>OK</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </Modal>
    );
}

const web = StyleSheet.create({
    sidebar: { 
        borderRightColor: "#EDE9E8", 
        borderRightWidth: 1, 
        backgroundColor: "#fff"
    },
    sidebarSmallScreen: {
        position: "absolute",
        left: 0,
        top: 0,
        bottom: 0,
        zIndex: 1000,
        elevation: 1000,
        shadowColor: "#000",
        shadowOffset: { width: 2, height: 0 },
        shadowOpacity: 0.25,
        shadowRadius: 4,
    },
    sidebarOverlay: {
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0, 0, 0, 0.5)",
        zIndex: 999,
        elevation: 999,
    },
    hamburgerBtn: {
        padding: 8,
        borderRadius: 8,
        backgroundColor: colors.faint,
        marginRight: 12,
    },
    brand: { 
        color: colors.text, 
        fontWeight: "800", 
        fontSize: 16 
    },
    sideMenuBtn: {
        height: 30,
        width: 30,
        borderRadius: 8,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: colors.faint,
        marginRight: 8,
    },
    sideItem: {
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        paddingVertical: 14,
        paddingHorizontal: 16,
    },
    sideItemCollapsed: { 
        justifyContent: "center", 
        paddingHorizontal: 0, 
        gap: 0, 
        height: 56 
    },
    sideItemText: { 
        color: colors.text, 
        fontSize: 14, 
        fontWeight: "600" 
    },
    sidebarFooter: { 
        padding: 12, 
        gap: 10 
    },
    userCard: {
        backgroundColor: colors.faint,
        borderRadius: 10,
        padding: 10,
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
    },
    userAvatar: {
        width: 34,
        height: 34,
        borderRadius: 999,
        backgroundColor: "#fff",
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 1,
        borderColor: colors.border,
    },
    userName: { 
        color: colors.text, 
        fontSize: 12, 
        fontWeight: "800" 
    },
    userRole: { 
        color: colors.text, 
        fontSize: 10, 
        opacity: 0.7 
    },
    logoutBtn: {
        borderWidth: 1,
        borderColor: colors.maroon,
        borderRadius: 12,
        paddingVertical: 12,
        paddingHorizontal: 16,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        backgroundColor: "#fff",
    },
    logoutText: { 
        color: colors.maroon, 
        fontWeight: "700" 
    },
    mainArea: {
        flex: 1,
        backgroundColor: "#fff",
    },
    scrollView: {
        flex: 1,
        padding: 24,
    },
    headerContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 24,
        paddingBottom: 16,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
    },
    backButton: {
        padding: 6,
        marginRight: 6,
    },
    headerTitle: {
        fontSize: 24,
        fontWeight: 'bold',
        color: colors.maroon,
        marginLeft: 12,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingTop: 100,
    },
    loadingText: {
        fontSize: 16,
        color: colors.text,
        marginTop: 16,
    },
    emptyContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingTop: 100,
    },
    emptyTitle: {
        fontSize: 24,
        fontWeight: 'bold',
        color: colors.text,
        marginTop: 16,
        marginBottom: 8,
    },
    emptySubtitle: {
        fontSize: 16,
        color: colors.border,
        textAlign: 'center',
        paddingHorizontal: 32,
    },
    notificationCard: {
        backgroundColor: '#fff',
        borderRadius: 12,
        padding: 20,
        marginBottom: 16,
        flexDirection: 'row',
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
    },
    notificationContent: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
    },
    avatar: {
        width: 48,
        height: 48,
        borderRadius: 24,
        marginRight: 16,
    },
    notificationText: {
        flex: 1,
    },
    notificationTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: colors.maroon,
        marginBottom: 4,
    },
    notificationBody: {
        fontSize: 16,
        color: colors.text,
        marginBottom: 4,
    },
    notificationTime: {
        fontSize: 14,
        color: colors.text,
    },
    viewButton: {
        padding: 12,
    },
    viewButtonText: {
        fontSize: 16,
        fontWeight: 'bold',
        color: colors.maroon,
    },
});