import { Ionicons } from "@expo/vector-icons";
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import React from "react";
import {
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
    Alert,
} from "react-native";
import { SafeAreaView as SAView, useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "../../lib/supabase";
import { sendCommissionAcceptanceMessage } from "../../utils/supabaseHelpers";
import AsyncStorage from '@react-native-async-storage/async-storage';
import NoRunnersAvailableModal from "../../components/NoRunnersAvailableModal";
import NoRunnersAvailableModalWeb from "../../components/NoRunnersAvailableModalWeb";
import NoRunnersAvailableCard from "../../components/NoRunnersAvailableCard";
import { noRunnersAvailableService } from "../../services/NoRunnersAvailableService";
import { errandAcceptanceService } from "../../services/ErrandAcceptanceService";
import LocationService from "../../components/LocationService";
import { logCaller, logCallerError, logCallerWarn, initCallerLogger } from "./utils/callerLogger";

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

/* ================ TYPES ================== */
type Commissioner = {
    id: string;
    name: string;
    category: "Logos" | "Posters" | "Videography" | "Photography";
    rating: number;
    profile_picture_url?: string | null;
    is_available?: boolean | null;
    status: "Online" | "Offline";
};

const SAMPLE_COMMISSIONS: Commissioner[] = [
    { id: "1", name: "Patricia Momo", category: "Logos", rating: 5.0, status: "Online" },
    { id: "2", name: "Abby Abellon", category: "Videography", rating: 4.0, status: "Online" },
    { id: "3", name: "Gwyn Razonable", category: "Logos", rating: 5.0, status: "Online" },
    { id: "4", name: "Kai Apostol", category: "Photography", rating: 5.0, status: "Online" },
    { id: "5", name: "Aubrey Joy Alido", category: "Posters", rating: 5.0, status: "Online" },
];


/* ===================== AUTH PROFILE HOOK ===================== */
type ProfileRow = {
    id: string;
    role: "buddyrunner" | "buddycaller" | string | null;
    first_name: string | null;
    last_name: string | null;
    is_blocked?: boolean | null;
    profile_picture_url?: string | null;
};

function titleCase(s?: string | null) {
    if (!s) return "";
    return s
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean)
        .map((w) => (w[0] ? w[0].toUpperCase() + w.slice(1) : w))
        .join(" ");
}

/* ===================== WEB CALLER AUTH CACHE (WEB ONLY) ===================== */

// Debug flag for performance and cache logs (default: false, set to true to enable noisy logs)
const DEBUG_CALLER_PERF = false;

// Safe timer helpers to avoid "already exists/does not exist" warnings on web
const webTimersStarted = new Set<string>();
function webPerfTime(label?: string) {
    if (!label) return;
    if (!__DEV__ || !DEBUG_CALLER_PERF) return; // Gate performance logs
    if (webTimersStarted.has(label)) return; // already started, avoid duplicate start
    webTimersStarted.add(label);
    console.time(label);
}
function webPerfTimeEnd(label?: string) {
    if (!label) return;
    if (!__DEV__ || !DEBUG_CALLER_PERF) return; // Gate performance logs
    if (!webTimersStarted.has(label)) return; // only end if started
    webTimersStarted.delete(label);
    console.timeEnd(label);
}

let webCallerAuthUserCache: any | null = null;
let webCallerAuthUserInFlight: Promise<any | null> | null = null;

async function getCallerAuthUser(label?: string): Promise<any | null> {
    const isWeb = Platform.OS === "web";
    const isWebDev = isWeb && __DEV__ && typeof window !== "undefined";

    if (isWebDev && label) {
        webPerfTime(label);
    }

    const endTimer = () => {
        if (isWebDev && label) {
            webPerfTimeEnd(label);
        }
    };

    if (isWeb) {
        // Return cached user if available
        if (webCallerAuthUserCache) {
            endTimer();
            return webCallerAuthUserCache;
        }

        // If a request is already in-flight, await it instead of starting a new one
        if (webCallerAuthUserInFlight) {
            const user = await webCallerAuthUserInFlight;
            endTimer();
            return user;
        }

        // Start a new request and cache both the promise and the result
        webCallerAuthUserInFlight = (async () => {
            const { data } = await supabase.auth.getUser();
            const user = data?.user ?? null;
            webCallerAuthUserCache = user;
            return user;
        })();

        try {
            const user = await webCallerAuthUserInFlight;
            endTimer();
            return user;
        } finally {
            webCallerAuthUserInFlight = null;
        }
    }

    // Non-web: keep existing behavior (no caching, no timers)
    const { data } = await supabase.auth.getUser();
    const user = data?.user ?? null;
    return user;
}

function resetCallerAuthUserCache() {
    webCallerAuthUserCache = null;
    webCallerAuthUserInFlight = null;
}

function useAuthProfile() {
    const router = useRouter();
    // Critical loading: blocks screen render (profile/auth data required for first render)
    const [criticalLoading, setCriticalLoading] = React.useState(true);
    const [firstName, setFirstName] = React.useState<string>("");
    const [fullName, setFullName] = React.useState<string>("");
    const [roleLabel, setRoleLabel] = React.useState<string>("");
    const [profilePictureUrl, setProfilePictureUrl] = React.useState<string | null>(null);

    const fetchProfile = React.useCallback(async () => {
        try {
            const user = await getCallerAuthUser('WEB_CALLER_AUTH_GET_USER');
            if (!user) {
                setCriticalLoading(false);
                return;
            }

            // WEB CACHING: Try to load from cache first
            if (Platform.OS === 'web') {
                const { getCachedData, setCachedData } = await import('../../utils/webCache');
                const cacheKey = `caller_profile_${user.id}`;
                const cached = getCachedData<{
                    firstName: string;
                    fullName: string;
                    roleLabel: string;
                    profilePictureUrl: string | null;
                }>(cacheKey);
                
                if (cached) {
                    // Use cached data immediately
                    setFirstName(cached.firstName);
                    setFullName(cached.fullName);
                    setRoleLabel(cached.roleLabel);
                    setProfilePictureUrl(cached.profilePictureUrl);
                    setCriticalLoading(false);
                    
                    // Fetch fresh data in background (don't await)
                    (async () => {
                        try {
                            if (Platform.OS === 'web' && __DEV__) {
                                webPerfTime('WEB_CALLER_AUTH_PROFILE_QUERY');
                            }
                            const { data: row, error } = await supabase
                                .from("users")
                                .select("id, role, first_name, last_name, is_blocked, id_image_approved, id_image_path, profile_picture_url")
                                .eq("id", user.id)
                                .single<ProfileRow & { is_blocked: boolean | null; id_image_approved: boolean | null; id_image_path: string | null; profile_picture_url: string | null }>();
                            if (Platform.OS === 'web' && __DEV__) {
                                webPerfTimeEnd('WEB_CALLER_AUTH_PROFILE_QUERY');
                            }
                            if (error) throw error;

                            // Check if user is blocked
                            if (row?.is_blocked) {
                                if (__DEV__) console.log('User is blocked, logging out...');
                                await supabase.auth.signOut();
                                router.replace('/login');
                                return;
                            }

                            // SECURITY: Check ID approval status for non-admin users
                            if (row && row.role !== 'admin') {
                                if (row.id_image_path) {
                                    if (row.id_image_approved === false || row.id_image_approved === null) {
                                        if (__DEV__) console.log('User ID not approved, logging out...');
                                        await supabase.auth.signOut();
                                        router.replace('/login');
                                        return;
                                    }
                                } else {
                                    // User hasn't uploaded ID - block access
                                    if (__DEV__) console.log('User has no ID image, logging out...');
                                    await supabase.auth.signOut();
                                    router.replace('/login');
                                    return;
                                }
                            }

                            const f = titleCase(row?.first_name || "");
                            const l = titleCase(row?.last_name || "");
                            const finalFull =
                                (f && l ? `${f} ${l}` : "").trim() ||
                                titleCase((user.user_metadata?.full_name as string) || (user.user_metadata?.name as string) || "") ||
                                titleCase((user.email?.split("@")[0] || "").replace(/[._-]+/g, " ")) ||
                                "User";
                            const newFirstName = f || finalFull.split(" ")[0] || "User";
                            const newRoleRaw = (row?.role || "").toString().toLowerCase();
                            const newRoleLabel = newRoleRaw === "buddyrunner" ? "BuddyRunner" : newRoleRaw === "buddycaller" ? "BuddyCaller" : "";

                            // Update state with fresh data
                            setFirstName(newFirstName);
                            setFullName(finalFull);
                            setProfilePictureUrl(row?.profile_picture_url || null);
                            setRoleLabel(newRoleLabel);

                            // Update cache
                            setCachedData(cacheKey, {
                                firstName: newFirstName,
                                fullName: finalFull,
                                roleLabel: newRoleLabel,
                                profilePictureUrl: row?.profile_picture_url || null,
                            });

                            // Validate role and redirect if necessary (web version only)
                            if (Platform.OS === 'web' && newRoleRaw === 'buddyrunner') {
                                if (__DEV__) console.log('Role mismatch detected: user is BuddyRunner but on BuddyCaller page, redirecting...');
                                router.replace('/buddyrunner/home');
                                return;
                            }
                        } catch {
                            // Silent fail in background refresh
                        }
                    })();
                    return;
                }
            }

            // No cache or not web: fetch normally
            if (Platform.OS === 'web' && __DEV__) {
                webPerfTime('WEB_CALLER_AUTH_PROFILE_QUERY');
            }
            const { data: row, error } = await supabase
                .from("users")
                .select("id, role, first_name, last_name, is_blocked, id_image_approved, id_image_path, profile_picture_url")
                .eq("id", user.id)
                .single<ProfileRow & { is_blocked: boolean | null; id_image_approved: boolean | null; id_image_path: string | null; profile_picture_url: string | null }>();
            if (Platform.OS === 'web' && __DEV__) {
                webPerfTimeEnd('WEB_CALLER_AUTH_PROFILE_QUERY');
            }
            if (error) throw error;

            // Check if user is blocked
            if (row?.is_blocked) {
                if (__DEV__) console.log('User is blocked, logging out...');
                await supabase.auth.signOut();
                router.replace('/login');
                return;
            }

            // SECURITY: Check ID approval status for non-admin users
            if (row && row.role !== 'admin') {
                if (row.id_image_path) {
                    if (row.id_image_approved === false || row.id_image_approved === null) {
                        if (__DEV__) console.log('User ID not approved, logging out...');
                        await supabase.auth.signOut();
                        router.replace('/login');
                        return;
                    }
                } else {
                    // User hasn't uploaded ID - block access
                    if (__DEV__) console.log('User has no ID image, logging out...');
                    await supabase.auth.signOut();
                    router.replace('/login');
                    return;
                }
            }

            const f = titleCase(row?.first_name || "");
            const l = titleCase(row?.last_name || "");
            const finalFull =
                (f && l ? `${f} ${l}` : "").trim() ||
                titleCase((user.user_metadata?.full_name as string) || (user.user_metadata?.name as string) || "") ||
                titleCase((user.email?.split("@")[0] || "").replace(/[._-]+/g, " ")) ||
                "User";
            setFirstName(f || finalFull.split(" ")[0] || "User");
            setFullName(finalFull);
            setProfilePictureUrl(row?.profile_picture_url || null);

            const roleRaw = (row?.role || "").toString().toLowerCase();
            const newRoleLabel = roleRaw === "buddyrunner" ? "BuddyRunner" : roleRaw === "buddycaller" ? "BuddyCaller" : "";
            setRoleLabel(newRoleLabel);

            // Cache the result (web only)
            if (Platform.OS === 'web') {
                const { setCachedData } = await import('../../utils/webCache');
                const cacheKey = `caller_profile_${user.id}`;
                setCachedData(cacheKey, {
                    firstName: f || finalFull.split(" ")[0] || "User",
                    fullName: finalFull,
                    roleLabel: newRoleLabel,
                    profilePictureUrl: row?.profile_picture_url || null,
                });
            }
            
            // Validate role and redirect if necessary (web version only)
            if (Platform.OS === 'web' && roleRaw === 'buddyrunner') {
                if (__DEV__) console.log('Role mismatch detected: user is BuddyRunner but on BuddyCaller page, redirecting...');
                router.replace('/buddyrunner/home');
                return;
            }
        } catch {
            setFirstName("User");
            setFullName("User");
            setRoleLabel("");
        } finally {
            setCriticalLoading(false);
        }
    }, [router]);

    React.useEffect(() => {
        // one-time load
        fetchProfile();
        // keep sign-out success modal behavior (see Web)
        const { data: sub } = supabase.auth.onAuthStateChange((event) => {
            resetCallerAuthUserCache();
            // Clear cache on logout (web only)
            if (Platform.OS === 'web' && (event === 'SIGNED_OUT' || event === 'TOKEN_REFRESHED')) {
                import('../../utils/webCache').then(({ clearAllCaches }) => {
                    clearAllCaches();
                });
            }
            fetchProfile();
        });
        return () => sub?.subscription?.unsubscribe?.();
    }, [fetchProfile]);
    // Return criticalLoading as 'loading' for backward compatibility (will be refactored in next step)
    return { loading: criticalLoading, criticalLoading, firstName, fullName, roleLabel, profilePictureUrl };
}

/* ========= Available Runners loader ========= */
type Runner = {
    id: string;
    name: string;
    status: "Online" | "Offline" | "Busy";
    role: string;
    profile_picture_url?: string;
};

type RunnerRowDB = {
    id: string;
    first_name: string | null;
    last_name: string | null;
    role: string | null;
    profile_picture_url: string | null;
    created_at: string;
    is_available?: boolean | null;
};

/* ========= Posted-Errands loader ========= */
type Errand = {
    id: string;
    title: string;
    status: "In Progress" | "Pending" | "Completed" | "Cancelled" | "Delivered";
    requester: string;
};

type ErrandRowDB = {
    id: number;
    title: string | null;
    status: "pending" | "in_progress" | "accepted" | "completed" | "cancelled" | "delivered";
    runner_id: string | null;
    created_at: string;
    buddycaller_id: string;
    pickup_status?: string | null;
    pickup_photo?: string | null;
    pickup_confirmed_at?: string | null;
};

function toUiStatus(s: ErrandRowDB["status"]): Errand["status"] {
    if (s === "in_progress") return "In Progress";
    if (s === "completed") return "Completed";
    if (s === "pending") return "Pending";
    if (s === "cancelled") return "Cancelled";
    if (s === "delivered") return "Delivered";
    return "Pending";
}

/**
 * Faster feel for "Posted Errands":
 * - initialLoading: spinner only the first time
 * - refreshing: silent refetch (keeps old list visible)
 * - debounced realtime updates
 * - runner names cache
 */
function useMyErrands(options?: { enableInitialFetch?: boolean }) {
    const enableInitialFetch = options?.enableInitialFetch ?? true;
    const [initialLoading, setInitialLoading] = React.useState(true);
    const [refreshing, setRefreshing] = React.useState(false);
    const [rows, setRows] = React.useState<ErrandRowDB[]>([]);
    const [runnerNameMap, setRunnerNameMap] = React.useState<Record<string, string>>({});
    const [uid, setUid] = React.useState<string | null>(null);

    // avoid overlapping fetches
    const inFlightRef = React.useRef<Promise<void> | null>(null);
    const realtimeTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

    const fetchRunnerNames = React.useCallback(async (runnerIds: string[]) => {
        const missing = runnerIds.filter((id) => !(id in runnerNameMap));
        if (missing.length === 0) return;

        if (Platform.OS === 'web' && __DEV__) {
            webPerfTime('WEB_CALLER_MY_ERRANDS_RUNNER_NAMES');
        }
        const { data: runners, error: rErr } = await supabase
            .from("users")
            .select("id, first_name, last_name")
            .in("id", missing);
        if (Platform.OS === 'web' && __DEV__) {
            webPerfTimeEnd('WEB_CALLER_MY_ERRANDS_RUNNER_NAMES');
        }

        if (rErr) return;

        setRunnerNameMap((prev) => {
            const next = { ...prev };
            for (const u of runners ?? []) {
                const first = (u.first_name || "").trim();
                const last = (u.last_name || "").trim();
                next[u.id] = [first, last].filter(Boolean).join(" ").trim() || "BuddyRunner";
            }
            return next;
        });
    }, [runnerNameMap]);

    const fetchRows = React.useCallback(async (opts?: { silent?: boolean }) => {
        const silent = !!opts?.silent;

        // prevent stacking multiple fetches
        if (inFlightRef.current) {
            try { await inFlightRef.current; } catch { /* ignore */ }
        }

        const exec = (async () => {
            // spinner only the first time, never during later refreshes
            if (initialLoading && !silent) {
                setInitialLoading(true);
            } else {
                setRefreshing(true);
            }

            try {
                const user = await getCallerAuthUser('WEB_CALLER_MY_ERRANDS_GET_USER');
                const currentUid = user?.id ?? null;
                setUid(currentUid);

                if (!currentUid) {
                    setRows([]);
                    setRunnerNameMap({});
                    return;
                }

                // WEB CACHING: Try to load from cache first
                if (Platform.OS === 'web' && initialLoading && !silent) {
                    const { getCachedData, setCachedData } = await import('../../utils/webCache');
                    const cacheKey = `caller_errands_${currentUid}`;
                    const cached = getCachedData<ErrandRowDB[]>(cacheKey);
                    
                    if (cached) {
                        // Use cached data immediately
                        setRows(cached);
                        setInitialLoading(false);
                        
                        // Fetch fresh data in background (don't await)
                        (async () => {
                            try {
                                if (Platform.OS === 'web' && __DEV__) {
                                    webPerfTime('WEB_CALLER_MY_ERRANDS_QUERY');
                                }
                                const { data, error } = await supabase
                                    .from("errand")
                                    .select("id, title, status, runner_id, created_at, buddycaller_id")
                                    .eq("buddycaller_id", currentUid)
                                    .order("created_at", { ascending: false });
                                if (Platform.OS === 'web' && __DEV__) {
                                    webPerfTimeEnd('WEB_CALLER_MY_ERRANDS_QUERY');
                                }

                                if (error) throw error;

                                const errands = data ?? [];
                                setRows(errands);
                                setCachedData(cacheKey, errands);

                                // prefetch runner names only for IDs we don't have yet
                                const runnerIds = Array.from(new Set(errands.map((r) => r.runner_id).filter(Boolean) as string[]));
                                if (runnerIds.length) await fetchRunnerNames(runnerIds);
                            } catch {
                                // Silent fail in background refresh
                            }
                        })();
                        return;
                    }
                }

                // No cache or not web: fetch normally
                if (Platform.OS === 'web' && __DEV__) {
                    webPerfTime('WEB_CALLER_MY_ERRANDS_QUERY');
                }
                const { data, error } = await supabase
                    .from("errand")
                    .select("id, title, status, runner_id, created_at, buddycaller_id")
                    .eq("buddycaller_id", currentUid)
                    .order("created_at", { ascending: false });
                if (Platform.OS === 'web' && __DEV__) {
                    webPerfTimeEnd('WEB_CALLER_MY_ERRANDS_QUERY');
                }

                if (error) throw error;

                const errands = data ?? [];
                setRows(errands);

                // Cache the result (web only)
                if (Platform.OS === 'web') {
                    const { setCachedData } = await import('../../utils/webCache');
                    const cacheKey = `caller_errands_${currentUid}`;
                    setCachedData(cacheKey, errands);
                }

                // prefetch runner names only for IDs we don't have yet
                const runnerIds = Array.from(new Set(errands.map((r) => r.runner_id).filter(Boolean) as string[]));
                if (runnerIds.length) await fetchRunnerNames(runnerIds);
            } finally {
                setInitialLoading(false);
                setRefreshing(false);
            }
        })();

        inFlightRef.current = exec;
        try { await exec; } finally { inFlightRef.current = null; }
    }, [fetchRunnerNames, initialLoading]);

    // initial load
    React.useEffect(() => {
        if (!enableInitialFetch) return;
        fetchRows({ silent: false });
    }, [fetchRows, enableInitialFetch]);

    // realtime: debounce to batch events
    React.useEffect(() => {
        if (!enableInitialFetch) return;
        if (!uid) return;

        const ch = supabase
            .channel(`errand_changes_${uid}`)
            .on(
                "postgres_changes",
                { event: "*", schema: "public", table: "errand", filter: `buddycaller_id=eq.${uid}` },
                () => {
                    if (realtimeTimer.current) clearTimeout(realtimeTimer.current);
                    realtimeTimer.current = setTimeout(() => fetchRows({ silent: true }), 250);
                }
            )
            .subscribe();

        return () => {
            if (realtimeTimer.current) clearTimeout(realtimeTimer.current);
            supabase.removeChannel(ch);
        };
    }, [uid, fetchRows]);

    // refetch on screen focus, but silently (no spinner flash)
    useFocusEffect(
        React.useCallback(() => {
            if (!enableInitialFetch) return;
            fetchRows({ silent: true });
        }, [fetchRows, enableInitialFetch])
    );

    return { initialLoading, refreshing, rows, runnerNameMap, refetch: fetchRows };
}

/**
 * Fetch available runners (buddyrunners):
 * - initialLoading: spinner only the first time
 * - refreshing: silent refetch (keeps old list visible)
 * - debounced realtime updates
 */
function useAvailableRunners(options?: { enableInitialFetch?: boolean }) {
    const enableInitialFetch = options?.enableInitialFetch ?? true;
    const [initialLoading, setInitialLoading] = React.useState(true);
    const [refreshing, setRefreshing] = React.useState(false);
    const [rows, setRows] = React.useState<RunnerRowDB[]>([]);
    const [uid, setUid] = React.useState<string | null>(null);

    // avoid overlapping fetches
    const inFlightRef = React.useRef<Promise<void> | null>(null);
    const realtimeTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

    // Helper function to filter runners by distance (≤ 500m)
    const filterRunnersByDistance = (
        runners: any[],
        callerLat: number,
        callerLon: number
    ): any[] => {
        return runners.filter(runner => {
            if (!runner.latitude || !runner.longitude) return false;
            const lat = typeof runner.latitude === 'number' ? runner.latitude : parseFloat(String(runner.latitude || ''));
            const lon = typeof runner.longitude === 'number' ? runner.longitude : parseFloat(String(runner.longitude || ''));
            if (!lat || !lon || isNaN(lat) || isNaN(lon)) return false;

            const distanceKm = LocationService.calculateDistance(lat, lon, callerLat, callerLon);
            const distanceMeters = distanceKm * 1000;
            return distanceMeters <= 500;
        });
    };

    const fetchRows = React.useCallback(async (opts?: { silent?: boolean }) => {
        const silent = !!opts?.silent;

        // prevent stacking multiple fetches
        if (inFlightRef.current) {
            try { await inFlightRef.current; } catch { /* ignore */ }
        }

        const exec = (async () => {
            // spinner only the first time, never during later refreshes
            if (initialLoading && !silent) {
                setInitialLoading(true);
            } else {
                setRefreshing(true);
            }

            try {
                const user = await getCallerAuthUser('WEB_CALLER_AVAILABLE_RUNNERS_GET_USER');
                const currentUid = user?.id ?? null;
                setUid(currentUid);

                if (!currentUid) {
                    setRows([]);
                    return;
                }

                // Fetch caller's location for distance filtering
                const { data: callerData, error: callerError } = await supabase
                    .from('users')
                    .select('latitude, longitude')
                    .eq('id', currentUid)
                    .single();

                // Caller location is required to show nearby runners
                // Without valid caller coordinates, distance filtering is impossible
                if (callerError || !callerData || !callerData.latitude || !callerData.longitude) {
                    setRows([]);
                    setInitialLoading(false);
                    setRefreshing(false);
                    return;
                }

                const callerLat = typeof callerData.latitude === 'number' ? callerData.latitude : parseFloat(String(callerData.latitude || ''));
                const callerLon = typeof callerData.longitude === 'number' ? callerData.longitude : parseFloat(String(callerData.longitude || ''));

                // Caller location is required to show nearby runners
                if (!callerLat || !callerLon || isNaN(callerLat) || isNaN(callerLon)) {
                    setRows([]);
                    setInitialLoading(false);
                    setRefreshing(false);
                    return;
                }

                // WEB CACHING: Try to load from cache first
                if (Platform.OS === 'web' && initialLoading && !silent) {
                    const { getCachedData, setCachedData } = await import('../../utils/webCache');
                    const cacheKey = `caller_available_runners_${currentUid}`;
                    const cached = getCachedData<RunnerRowDB[]>(cacheKey);
                    
                    if (cached) {
                        // Use cached data immediately
                        setRows(cached);
                        setInitialLoading(false);
                        
                        // Fetch fresh data in background (don't await)
                        (async () => {
                            try {
                                if (Platform.OS === 'web' && __DEV__) {
                                    webPerfTime('WEB_CALLER_AVAILABLE_RUNNERS_QUERY');
                                }
                                // Calculate presence thresholds (aligned with assignment eligibility)
                                // Runner heartbeat updates: last_seen_at every ~60s
                                // Thresholds: 75s (buffered to prevent flapping between heartbeats)
                                const seventyFiveSecondsAgo = new Date(Date.now() - 75 * 1000).toISOString();
                                
                                // Fetch runners with full assignment eligibility filters:
                                // role = BuddyRunner, is_available = true, last_seen_at >= 75s, location_updated_at >= 75s OR NULL
                                let { data, error } = await supabase
                                    .from("users")
                                    .select("id, first_name, last_name, role, profile_picture_url, created_at, is_available, latitude, longitude")
                                    .eq("role", "BuddyRunner")
                                    .eq("is_available", true)
                                    .not("latitude", "is", null)
                                    .not("longitude", "is", null)
                                    .gte("last_seen_at", seventyFiveSecondsAgo)
                                    .or(`location_updated_at.gte.${seventyFiveSecondsAgo},location_updated_at.is.null`)
                                    .neq("id", currentUid)
                                    .order("first_name", { ascending: true });

                                // If the is_available field doesn't exist, fall back to getting all runners
                                if (error && typeof error === 'object' && 'message' in error && 
                                    typeof (error as { message?: string }).message === 'string' &&
                                    (error as { message: string }).message.includes('column "is_available" does not exist')) {
                                    if (Platform.OS === 'web' && __DEV__) {
                                        webPerfTimeEnd('WEB_CALLER_AVAILABLE_RUNNERS_QUERY');
                                        webPerfTime('WEB_CALLER_AVAILABLE_RUNNERS_FALLBACK_QUERY');
                                    }
                                    const fallbackResult = await supabase
                                        .from("users")
                                        .select("id, first_name, last_name, role, profile_picture_url, created_at, latitude, longitude")
                                        .eq("role", "BuddyRunner")
                                        .neq("id", currentUid)
                                        .order("first_name", { ascending: true });
                                    
                                    // Add is_available: true to all fallback data since we're getting all runners
                                    data = fallbackResult.data?.map(runner => ({ ...runner, is_available: true })) || null;
                                    error = fallbackResult.error;
                                    if (Platform.OS === 'web' && __DEV__) {
                                        webPerfTimeEnd('WEB_CALLER_AVAILABLE_RUNNERS_FALLBACK_QUERY');
                                    }
                                }

                                if (error) throw error;

                                if (Platform.OS === 'web' && __DEV__ && !error) {
                                    webPerfTimeEnd('WEB_CALLER_AVAILABLE_RUNNERS_QUERY');
                                }

                                // Apply distance filter (≤ 500m)
                                const runnersWithinDistance = filterRunnersByDistance(data ?? [], callerLat, callerLon);
                                setRows(runnersWithinDistance);
                                setCachedData(cacheKey, runnersWithinDistance);
                            } catch {
                                // Silent fail in background refresh
                            }
                        })();
                        return;
                    }
                }

                // No cache or not web: fetch normally
                // Fetch runners with full assignment eligibility filters
                if (Platform.OS === 'web' && __DEV__) {
                    webPerfTime('WEB_CALLER_AVAILABLE_RUNNERS_QUERY');
                }
                // Calculate presence thresholds (aligned with assignment eligibility)
                // Runner heartbeat updates: last_seen_at every ~60s
                // Thresholds: 75s (buffered to prevent flapping between heartbeats)
                const seventyFiveSecondsAgo = new Date(Date.now() - 75 * 1000).toISOString();
                
                // Fetch runners with full assignment eligibility filters:
                // role = BuddyRunner, is_available = true, last_seen_at >= 75s, location_updated_at >= 75s OR NULL
                let { data, error } = await supabase
                    .from("users")
                    .select("id, first_name, last_name, role, profile_picture_url, created_at, is_available, latitude, longitude")
                    .eq("role", "BuddyRunner")
                    .eq("is_available", true)
                    .not("latitude", "is", null)
                    .not("longitude", "is", null)
                    .gte("last_seen_at", seventyFiveSecondsAgo)
                    .or(`location_updated_at.gte.${seventyFiveSecondsAgo},location_updated_at.is.null`)
                    .neq("id", currentUid)
                    .order("first_name", { ascending: true });

                // If the is_available field doesn't exist, fall back to getting all runners
                if (error && typeof error === 'object' && 'message' in error && 
                    typeof (error as { message?: string }).message === 'string' &&
                    (error as { message: string }).message.includes('column "is_available" does not exist')) {
                    if (Platform.OS === 'web' && __DEV__) {
                        webPerfTimeEnd('WEB_CALLER_AVAILABLE_RUNNERS_QUERY');
                        webPerfTime('WEB_CALLER_AVAILABLE_RUNNERS_FALLBACK_QUERY');
                    }
                    const fallbackResult = await supabase
                        .from("users")
                        .select("id, first_name, last_name, role, profile_picture_url, created_at, latitude, longitude")
                        .eq("role", "BuddyRunner")
                        .neq("id", currentUid)
                        .order("first_name", { ascending: true });
                    
                    // Add is_available: true to all fallback data since we're getting all runners
                    data = fallbackResult.data?.map(runner => ({ ...runner, is_available: true })) || null;
                    error = fallbackResult.error;
                    if (Platform.OS === 'web' && __DEV__) {
                        webPerfTimeEnd('WEB_CALLER_AVAILABLE_RUNNERS_FALLBACK_QUERY');
                    }
                }

                if (error) {
                    throw error;
                }

                if (Platform.OS === 'web' && __DEV__ && !error) {
                    webPerfTimeEnd('WEB_CALLER_AVAILABLE_RUNNERS_QUERY');
                }

                // Apply distance filter (≤ 500m)
                const runnersWithinDistance = filterRunnersByDistance(data ?? [], callerLat, callerLon);
                setRows(runnersWithinDistance);

                // Cache the result (web only)
                if (Platform.OS === 'web') {
                    const { setCachedData } = await import('../../utils/webCache');
                    const cacheKey = `caller_available_runners_${currentUid}`;
                    setCachedData(cacheKey, runnersWithinDistance);
                }
            } finally {
                setInitialLoading(false);
                setRefreshing(false);
            }
        })();

        inFlightRef.current = exec;
        try { await exec; } finally { inFlightRef.current = null; }
    }, [initialLoading]);

    // initial load
    React.useEffect(() => {
        if (!enableInitialFetch) return;
        fetchRows({ silent: false });
    }, [fetchRows, enableInitialFetch]);

    // realtime: debounce to batch events
    React.useEffect(() => {
        if (!enableInitialFetch) return;
        if (!uid) return;

        const ch = supabase
            .channel(`runners_changes_${uid}`)
            .on(
                "postgres_changes",
                { event: "*", schema: "public", table: "users", filter: `role=eq.BuddyRunner` },
                (payload) => {
                    if (realtimeTimer.current) clearTimeout(realtimeTimer.current);
                    realtimeTimer.current = setTimeout(() => {
                        fetchRows({ silent: true });
                    }, 250);
                }
            )
            .subscribe();

        return () => {
            if (realtimeTimer.current) clearTimeout(realtimeTimer.current);
            supabase.removeChannel(ch);
        };
    }, [uid, fetchRows]);

    // refetch on screen focus, but silently (no spinner flash)
    useFocusEffect(
        React.useCallback(() => {
            if (!enableInitialFetch) return;
            fetchRows({ silent: true });
        }, [fetchRows, enableInitialFetch])
    );

    return { initialLoading, refreshing, rows, refetch: fetchRows };
}

/* ================= CONFIRM MODALS FOR LOGOUT (unchanged visuals) ================= */
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
            <View style={confirm.backdrop}>
                <View style={confirm.card}>
                    <Text style={confirm.title}>{title}</Text>
                    <Text style={confirm.msg}>{message}</Text>
                    <View style={confirm.actions}>
                        <TouchableOpacity onPress={onCancel} style={confirm.btnGhost} activeOpacity={0.9}>
                            <Text style={confirm.btnGhostText}>Cancel</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={onConfirm} style={confirm.btnSolid} activeOpacity={0.9}>
                            <Text style={confirm.btnSolidText}>Log out</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </Modal>
    );
}
const confirm = StyleSheet.create({
    backdrop: {
        flex: 1,
        backgroundColor: "rgba(0,0,0,0.38)",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
    },
    card: { width: 360, maxWidth: "100%", backgroundColor: "#fff", borderRadius: 14, padding: 18 },
    title: { color: colors.text, fontSize: 16, fontWeight: "900", marginBottom: 6 },
    msg: { color: colors.text, fontSize: 13, opacity: 0.9, marginBottom: 14 },
    actions: { flexDirection: "row", justifyContent: "flex-end", gap: 10 },
    btnGhost: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 10, backgroundColor: "#EEE" },
    btnGhostText: { color: colors.text, fontWeight: "700" },
    btnSolid: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 10, backgroundColor: colors.maroon },
    btnSolidText: { color: "#fff", fontWeight: "700" },
});

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
            <View style={success.backdrop}>
                <View style={success.card}>
                    <View style={success.iconWrap}>
                        <Ionicons name="checkmark-circle" size={44} color={colors.maroon} />
                    </View>
                    <Text style={success.title}>{title}</Text>
                    <Text style={success.msg}>{message}</Text>
                    <TouchableOpacity onPress={onClose} style={success.okBtn} activeOpacity={0.9}>
                        <Text style={success.okText}>OK</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </Modal>
    );
}
const success = StyleSheet.create({
    backdrop: {
        flex: 1,
        backgroundColor: "rgba(0,0,0,0.38)",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
    },
    card: { width: 400, maxWidth: "100%", backgroundColor: "#fff", borderRadius: 14, padding: 18, alignItems: "center" },
    iconWrap: {
        width: 64,
        height: 64,
        borderRadius: 999,
        backgroundColor: colors.faint,
        alignItems: "center",
        justifyContent: "center",
        marginBottom: 10,
    },
    title: { color: colors.text, fontSize: 16, fontWeight: "900", marginBottom: 4, textAlign: "center" },
    msg: { color: colors.text, fontSize: 13, opacity: 0.9, marginBottom: 14, textAlign: "center" },
    okBtn: { backgroundColor: colors.maroon, paddingVertical: 14, borderRadius: 12, width: "70%", alignItems: "center", justifyContent: "center" },
    okText: { color: "#fff", fontWeight: "700" },
});

/* ================= REDIRECT TRACKING ================= */
// Session-based redirect tracking to prevent repeated redirects
const REDIRECTED_COMMISSIONS_KEY = 'redirected_commissions';
const SESSION_REDIRECTED_COMMISSIONS = new Set<string>();
const REDIRECTED_ERRANDS_KEY = 'redirected_errands';
const SESSION_REDIRECTED_ERRANDS = new Set<string>();

// Check if commission has already been redirected
async function hasCommissionBeenRedirected(commissionId: string): Promise<boolean> {
    // Check session memory first (fastest)
    if (SESSION_REDIRECTED_COMMISSIONS.has(commissionId)) {
        return true;
    }

    // Check local storage
    try {
        const stored = await AsyncStorage.getItem(REDIRECTED_COMMISSIONS_KEY);
        if (stored) {
            const redirectedCommissions = JSON.parse(stored);
            return Array.isArray(redirectedCommissions) && redirectedCommissions.includes(commissionId);
        }
    } catch (error) {
        if (__DEV__) console.warn('Error checking redirect status:', error);
    }

    return false;
}

// Mark commission as redirected
async function markCommissionAsRedirected(commissionId: string): Promise<void> {
    // Add to session memory
    SESSION_REDIRECTED_COMMISSIONS.add(commissionId);

    // Add to local storage
    try {
        const stored = await AsyncStorage.getItem(REDIRECTED_COMMISSIONS_KEY);
        const redirectedCommissions = stored ? JSON.parse(stored) : [];
        
        // Ensure redirectedCommissions is an array
        const commissionsArray = Array.isArray(redirectedCommissions) ? redirectedCommissions : [];

        if (!commissionsArray.includes(commissionId)) {
            commissionsArray.push(commissionId);
            await AsyncStorage.setItem(REDIRECTED_COMMISSIONS_KEY, JSON.stringify(commissionsArray));
        }
    } catch (error) {
        if (__DEV__) console.warn('Error marking commission as redirected:', error);
    }
}

// Clean up old redirect records (optional - keeps storage clean)
async function cleanupOldRedirects(): Promise<void> {
    try {
        const stored = await AsyncStorage.getItem(REDIRECTED_COMMISSIONS_KEY);
        if (stored) {
            const redirectedCommissions = JSON.parse(stored);
            // Keep only last 50 redirects to prevent storage bloat
            if (redirectedCommissions.length > 50) {
                const recentRedirects = redirectedCommissions.slice(-50);
                await AsyncStorage.setItem(REDIRECTED_COMMISSIONS_KEY, JSON.stringify(recentRedirects));
            }
        }
        
        // Also clean up errand redirects
        const errandStored = await AsyncStorage.getItem(REDIRECTED_ERRANDS_KEY);
        if (errandStored) {
            const redirectedErrands = JSON.parse(errandStored);
            // Keep only last 50 redirects to prevent storage bloat
            if (redirectedErrands.length > 50) {
                const recentRedirects = redirectedErrands.slice(-50);
                await AsyncStorage.setItem(REDIRECTED_ERRANDS_KEY, JSON.stringify(recentRedirects));
            }
        }
    } catch (error) {
        if (__DEV__) console.warn('Error cleaning up redirects:', error);
    }
}

// Helper function to check if all eligible runners have timed out for a commission
async function checkIfAllRunnersTimedOut(commissionId: number): Promise<boolean> {
    try {
        logCaller(`Timeout check: Starting check for commission ${commissionId}`);
        
        // Get the commission with all relevant fields
        const { data: commission, error: commissionError } = await supabase
            .from('commission')
            .select('id, title, status, buddycaller_id, commission_type, timeout_runner_ids, declined_runner_id, notified_at, notified_runner_id, created_at')
            .eq('id', commissionId)
            .single();

        if (commissionError || !commission) {
            logCallerError('Timeout check: Error fetching commission', commissionError);
            return false;
        }

        // Only check pending commissions
        if (commission.status !== 'pending') {
            logCaller(`Timeout check: Commission ${commissionId} is not pending (status: ${commission.status}), skipping`);
            return false;
        }

        // If there's a runner currently notified, wait for them to respond or timeout
        if (commission.notified_runner_id !== null) {
            logCaller(`Timeout check: Commission ${commissionId} has a notified runner, waiting...`);
            return false;
        }

        // Get caller location for distance calculation
        const { data: callerData, error: callerError } = await supabase
            .from('users')
            .select('latitude, longitude')
            .eq('id', commission.buddycaller_id)
            .single();

        if (callerError || !callerData || !callerData.latitude || !callerData.longitude) {
            logCaller(`Timeout check: Caller has no location, cannot check`);
            return false;
        }

        const callerLat = typeof callerData.latitude === 'number' ? callerData.latitude : parseFloat(String(callerData.latitude || ''));
        const callerLon = typeof callerData.longitude === 'number' ? callerData.longitude : parseFloat(String(callerData.longitude || ''));

        if (!callerLat || !callerLon || isNaN(callerLat) || isNaN(callerLon)) {
            logCaller(`Timeout check: Invalid caller location for commission ${commissionId}`);
            return false;
        }

        // Parse commission types (if any)
        const commissionTypes = commission.commission_type 
            ? commission.commission_type.split(',').map((t: string) => t.trim()).filter((t: string) => t.length > 0)
            : [];

        // Get ALL available runners (online and available)
        const { data: allRunners, error: runnersError } = await supabase
            .from('users')
            .select('id, latitude, longitude, is_available')
            .eq('role', 'BuddyRunner')
            .eq('is_available', true);

        if (runnersError) {
            logCallerError('Timeout check: Error fetching runners', runnersError);
            return false;
        }

        if (!allRunners || allRunners.length === 0) {
            logCaller(`Timeout check: No runners available at all - all have timed out`);
            // Ensure at least 60 seconds have passed since commission creation
            const createdAt = new Date(commission.created_at);
            const now = new Date();
            const secondsSinceCreation = (now.getTime() - createdAt.getTime()) / 1000;
            return secondsSinceCreation >= 60;
        }

        logCaller(`Timeout check: Found ${allRunners.length} total available runners`);

        // Filter runners within 500m of caller
        const eligibleRunners = allRunners.filter(runner => {
            if (!runner.latitude || !runner.longitude) return false;
            const lat = typeof runner.latitude === 'number' ? runner.latitude : parseFloat(String(runner.latitude || ''));
            const lon = typeof runner.longitude === 'number' ? runner.longitude : parseFloat(String(runner.longitude || ''));
            if (!lat || !lon || isNaN(lat) || isNaN(lon)) return false;

            const distanceKm = LocationService.calculateDistance(lat, lon, callerLat, callerLon);
            const distanceMeters = distanceKm * 1000;
            return distanceMeters <= 500;
        });

        logCaller(`Timeout check: Found ${eligibleRunners.length} eligible runners within 500m`);

        if (eligibleRunners.length === 0) {
            logCaller(`Timeout check: No eligible runners within 500m - all have timed out`);
            // Ensure at least 60 seconds have passed since commission creation
            const createdAt = new Date(commission.created_at);
            const now = new Date();
            const secondsSinceCreation = (now.getTime() - createdAt.getTime()) / 1000;
            if (secondsSinceCreation >= 60) {
                logCaller(`Timeout check: Commission ${commissionId} has been pending for ${secondsSinceCreation.toFixed(1)}s, no eligible runners - TRIGGERING MODAL`);
                return true;
            }
            return false;
        }

        // Get timeout_runner_ids array (ensure it's an array)
        const timeoutRunnerIds = Array.isArray(commission.timeout_runner_ids) 
            ? commission.timeout_runner_ids 
            : (commission.timeout_runner_ids ? [commission.timeout_runner_ids] : []);

        logCaller(`Timeout check: Commission ${commissionId} details`, {
            totalEligibleRunners: eligibleRunners.length,
            timeoutRunnerIdsCount: timeoutRunnerIds.length,
            declinedRunnerId: commission.declined_runner_id ? 'present' : 'none',
            eligibleRunnerIds: eligibleRunners.map(r => r.id.substring(0, 8))
        });

        // Check if ALL eligible runners are either:
        // 1. In timeout_runner_ids (they timed out/ignored)
        // 2. Equal to declined_runner_id (caller declined them)
        const timedOutOrDeclinedRunners = eligibleRunners.filter(runner => {
            const isTimedOut = timeoutRunnerIds.includes(runner.id);
            const isDeclined = commission.declined_runner_id === runner.id;
            return isTimedOut || isDeclined;
        });

        logCaller(`Timeout check: Runners that timed out or were declined: ${timedOutOrDeclinedRunners.length} out of ${eligibleRunners.length}`);

        // Check if all eligible runners have timed out or been declined
        const allTimedOut = timedOutOrDeclinedRunners.length === eligibleRunners.length && eligibleRunners.length > 0;

        if (allTimedOut) {
            // Ensure at least 60 seconds have passed since commission creation
            const createdAt = new Date(commission.created_at);
            const now = new Date();
            const secondsSinceCreation = (now.getTime() - createdAt.getTime()) / 1000;
            
            if (secondsSinceCreation >= 60) {
                logCaller(`Timeout check: ✅ ALL ${eligibleRunners.length} eligible runners have timed out/declined for commission ${commissionId} (${secondsSinceCreation.toFixed(1)}s since creation) - TRIGGERING MODAL`);
                return true;
            } else {
                logCaller(`Timeout check: All runners timed out but only ${secondsSinceCreation.toFixed(1)}s since creation, waiting...`);
                return false;
            }
        } else {
            const remainingRunners = eligibleRunners.length - timedOutOrDeclinedRunners.length;
            logCaller(`Timeout check: ⏳ Commission ${commissionId} still has ${remainingRunners} available runner(s) - not all timed out yet`);
            return false;
        }
    } catch (error) {
        logCallerError('Timeout check: Error checking if all runners timed out', error);
        return false;
    }
}

// Track commissions that have already triggered notifications (to prevent duplicates)
const notifiedCommissions = new Set<number>();

// Track errands that have already triggered notifications (to prevent duplicates)
const notifiedErrands = new Set<number>();

// Helper function to check if all eligible runners have timed out for an errand
async function checkIfAllRunnersTimedOutForErrand(errandId: number): Promise<boolean> {
    try {
        logCaller(`Errand timeout check: Starting check for errand ${errandId}`);
        
        // Get the errand with all relevant fields
        const { data: errand, error: errandError } = await supabase
            .from('errand')
            .select('id, title, status, buddycaller_id, category, timeout_runner_ids, notified_at, notified_runner_id, created_at')
            .eq('id', errandId)
            .single();

        if (errandError || !errand) {
            logCallerError('Errand timeout check: Error fetching errand', errandError);
            return false;
        }

        // Only check pending errands
        if (errand.status !== 'pending') {
            logCaller(`Errand timeout check: Errand ${errandId} is not pending (status: ${errand.status}), skipping`);
            return false;
        }

        // If there's a runner currently notified, wait for them to respond or timeout
        if (errand.notified_runner_id !== null) {
            logCaller(`Errand timeout check: Errand ${errandId} has a notified runner, waiting...`);
            return false;
        }

        // Get caller location for distance calculation
        const { data: callerData, error: callerError } = await supabase
            .from('users')
            .select('latitude, longitude')
            .eq('id', errand.buddycaller_id)
            .single();

        if (callerError || !callerData || !callerData.latitude || !callerData.longitude) {
            logCaller(`Errand timeout check: Caller has no location, cannot check`);
            return false;
        }

        const callerLat = typeof callerData.latitude === 'number' ? callerData.latitude : parseFloat(String(callerData.latitude || ''));
        const callerLon = typeof callerData.longitude === 'number' ? callerData.longitude : parseFloat(String(callerData.longitude || ''));

        if (!callerLat || !callerLon || isNaN(callerLat) || isNaN(callerLon)) {
            logCaller(`Errand timeout check: Invalid caller location for errand ${errandId}`);
            return false;
        }

        // Get ALL available runners (online and available)
        const { data: allRunners, error: runnersError } = await supabase
            .from('users')
            .select('id, latitude, longitude, is_available')
            .eq('role', 'BuddyRunner')
            .eq('is_available', true);

        if (runnersError) {
            logCallerError('Errand timeout check: Error fetching runners', runnersError);
            return false;
        }

        if (!allRunners || allRunners.length === 0) {
            logCaller(`Errand timeout check: No runners available at all - all have timed out`);
            // Ensure at least 60 seconds have passed since errand creation
            const createdAt = new Date(errand.created_at);
            const now = new Date();
            const secondsSinceCreation = (now.getTime() - createdAt.getTime()) / 1000;
            return secondsSinceCreation >= 60;
        }

        logCaller(`Errand timeout check: Found ${allRunners.length} total available runners`);

        // Filter runners within 500m of caller
        const eligibleRunners = allRunners.filter(runner => {
            if (!runner.latitude || !runner.longitude) return false;
            const lat = typeof runner.latitude === 'number' ? runner.latitude : parseFloat(String(runner.latitude || ''));
            const lon = typeof runner.longitude === 'number' ? runner.longitude : parseFloat(String(runner.longitude || ''));
            if (!lat || !lon || isNaN(lat) || isNaN(lon)) return false;

            const distanceKm = LocationService.calculateDistance(lat, lon, callerLat, callerLon);
            const distanceMeters = distanceKm * 1000;
            return distanceMeters <= 500;
        });

        logCaller(`Errand timeout check: Found ${eligibleRunners.length} eligible runners within 500m`);

        if (eligibleRunners.length === 0) {
            logCaller(`Errand timeout check: No eligible runners within 500m - all have timed out`);
            // Ensure at least 60 seconds have passed since errand creation
            const createdAt = new Date(errand.created_at);
            const now = new Date();
            const secondsSinceCreation = (now.getTime() - createdAt.getTime()) / 1000;
            if (secondsSinceCreation >= 60) {
                logCaller(`Errand timeout check: Errand ${errandId} has been pending for ${secondsSinceCreation.toFixed(1)}s, no eligible runners - TRIGGERING MODAL`);
                return true;
            }
            return false;
        }

        // Get timeout_runner_ids array (ensure it's an array)
        const timeoutRunnerIds = Array.isArray(errand.timeout_runner_ids) 
            ? errand.timeout_runner_ids 
            : (errand.timeout_runner_ids ? [errand.timeout_runner_ids] : []);

        logCaller(`Errand timeout check: Errand ${errandId} details`, {
            totalEligibleRunners: eligibleRunners.length,
            timeoutRunnerIdsCount: timeoutRunnerIds.length,
            eligibleRunnerIds: eligibleRunners.map(r => r.id.substring(0, 8))
        });

        // Check if ALL eligible runners are in timeout_runner_ids
        const timedOutRunners = eligibleRunners.filter(runner => {
            return timeoutRunnerIds.includes(runner.id);
        });

        logCaller(`Errand timeout check: Runners that timed out: ${timedOutRunners.length} out of ${eligibleRunners.length}`);

        // Check if all eligible runners have timed out
        const allTimedOut = timedOutRunners.length === eligibleRunners.length && eligibleRunners.length > 0;

        if (allTimedOut) {
            // Ensure at least 60 seconds have passed since errand creation
            const createdAt = new Date(errand.created_at);
            const now = new Date();
            const secondsSinceCreation = (now.getTime() - createdAt.getTime()) / 1000;
            
            if (secondsSinceCreation >= 60) {
                logCaller(`Errand timeout check: ✅ ALL ${eligibleRunners.length} eligible runners have timed out for errand ${errandId} (${secondsSinceCreation.toFixed(1)}s since creation) - TRIGGERING MODAL`);
                return true;
            } else {
                logCaller(`Errand timeout check: All runners timed out but only ${secondsSinceCreation.toFixed(1)}s since creation, waiting...`);
                return false;
            }
        } else {
            const remainingRunners = eligibleRunners.length - timedOutRunners.length;
            logCaller(`Errand timeout check: ⏳ Errand ${errandId} still has ${remainingRunners} available runner(s) - not all timed out yet`);
            return false;
        }
    } catch (error) {
        logCallerError('Errand timeout check: Error checking if all runners timed out', error);
        return false;
    }
}

// Monitor errands and trigger notification if all runners have timed out
async function monitorErrandsForTimeout(userId: string, errandId?: number) {
    try {
        // Check for "all runners timed out" notification (when notified_runner_id is NULL)
        // NOTE: Timeout enforcement (notified_expires_at) is handled by backend cron + Edge Function only
        // If specific errand ID provided, check only that one
        let errands;
        if (errandId) {
            const { data: errand, error } = await supabase
                .from('errand')
                .select('id, title, status, notified_at, notified_runner_id, timeout_runner_ids')
                .eq('id', errandId)
                .eq('buddycaller_id', userId)
                .eq('status', 'pending')
                .single();
            
            if (error || !errand) {
                return;
            }
            errands = [errand];
        } else {
            // Get all pending errands for this caller that might need checking
            const { data: data, error } = await supabase
                .from('errand')
                .select('id, title, status, notified_at, notified_runner_id, timeout_runner_ids')
                .eq('buddycaller_id', userId)
                .eq('status', 'pending');

            if (error || !data || data.length === 0) {
                return;
            }
            errands = data;
        }

        // Check each errand
        for (const errand of errands) {
            // Skip if we've already triggered a notification for this errand
            if (notifiedErrands.has(errand.id)) {
                continue;
            }

            // Skip if already has a notified runner (still waiting for response)
            if (errand.notified_runner_id !== null) {
                continue;
            }

            // Check if all runners have timed out
            // The checkIfAllRunnersTimedOutForErrand function will verify:
            // 1. Errand is pending
            // 2. No runner is currently notified (notified_runner_id is NULL)
            // 3. At least 60 seconds have passed since creation
            // 4. ALL eligible runners have timed out
            logCaller(`Errand timeout monitor: Checking errand ${errand.id} for all runners timed out`);
            
            const allTimedOut = await checkIfAllRunnersTimedOutForErrand(errand.id);
            
            if (allTimedOut) {
                logCaller(`Errand timeout monitor: ✅ All runners have timed out for errand ${errand.id}, triggering notification`);
                // Mark as notified to prevent duplicate notifications
                notifiedErrands.add(errand.id);
                // Trigger the notification
                noRunnersAvailableService.notify({
                    type: 'errand',
                    errandId: errand.id,
                    errandTitle: errand.title || 'Untitled Errand'
                });
            } else {
                logCaller(`Errand timeout monitor: ⏳ Errand ${errand.id} still has available runners or waiting`);
            }
        }
    } catch (error) {
        logCallerError('Error monitoring errands for timeout', error);
    }
}

// Monitor commissions and trigger notification if all runners have timed out
async function monitorCommissionsForTimeout(userId: string, commissionId?: number) {
    try {
        // Check for "all runners timed out" notification (when notified_runner_id is NULL)
        // NOTE: Timeout enforcement (notified_expires_at) is handled by backend cron + Edge Function only
        // If specific commission ID provided, check only that one
        let commissions;
        if (commissionId) {
            const { data: commission, error } = await supabase
                .from('commission')
                .select('id, title, status, notified_at, notified_runner_id, timeout_runner_ids')
                .eq('id', commissionId)
                .eq('buddycaller_id', userId)
                .eq('status', 'pending')
                .single();
            
            if (error || !commission) {
                return;
            }
            commissions = [commission];
        } else {
            // Get all pending commissions for this caller that might need checking
            const { data: data, error } = await supabase
                .from('commission')
                .select('id, title, status, notified_at, notified_runner_id, timeout_runner_ids')
                .eq('buddycaller_id', userId)
                .eq('status', 'pending');

            if (error || !data || data.length === 0) {
                return;
            }
            commissions = data;
        }

        // Check each commission
        for (const commission of commissions) {
            // Skip if we've already triggered a notification for this commission
            if (notifiedCommissions.has(commission.id)) {
                continue;
            }

            // Skip if already has a notified runner (still waiting for response)
            if (commission.notified_runner_id !== null) {
                continue;
            }

            // Check if all runners have timed out
            // The checkIfAllRunnersTimedOut function will verify:
            // 1. Commission is pending
            // 2. No runner is currently notified (notified_runner_id is NULL)
            // 3. At least 60 seconds have passed since creation
            // 4. ALL eligible runners have timed out or been declined
            logCaller(`Timeout monitor: Checking commission ${commission.id} for all runners timed out`);
            
            const allTimedOut = await checkIfAllRunnersTimedOut(commission.id);
            
            if (allTimedOut) {
                logCaller(`Timeout monitor: ✅ All runners have timed out for commission ${commission.id}, triggering notification`);
                // Mark as notified to prevent duplicate notifications
                notifiedCommissions.add(commission.id);
                // Trigger the notification
                noRunnersAvailableService.notify({
                    type: 'commission',
                    commissionId: commission.id,
                    commissionTitle: commission.title || 'Untitled Commission'
                });
            } else {
                logCaller(`Timeout monitor: ⏳ Commission ${commission.id} still has available runners or waiting`);
            }
        }
    } catch (error) {
        logCallerError('Error monitoring commissions for timeout', error);
    }
}

// Helper function to handle commission updates
async function handleCommissionUpdate(
    commission: any,
    oldCommission: any,
    userId: string,
    router: any,
    showAcceptedModal?: (runnerName: string, onOk: () => void) => void
) {
    logCaller("Commission update: Handling commission update", {
        commissionId: commission.id,
        status: commission.status,
        oldStatus: oldCommission.status,
        runnerId: commission.runner_id ? commission.runner_id.substring(0, 8) : 'none'
    });

    // Check if commission was just accepted by runner (status changed to "in_progress")
    if (commission.status === "in_progress" && oldCommission.status !== "in_progress") {
        logCaller("Commission update: Commission was accepted, checking redirect guard...");
        logCaller(`Commission update: Status change detected - Old: ${oldCommission.status}, New: ${commission.status}`);

        // Check if we've already redirected for this commission
        const hasBeenRedirected = await hasCommissionBeenRedirected(String(commission.id));
        if (hasBeenRedirected) {
            logCaller(`Commission update: Redirect guard active - commission already redirected: ${commission.id}`);
            return;
        }

        logCaller("Commission update: First-time redirect for commission, processing...");

        try {
            // Get runner details
            const { data: runnerData } = await supabase
                .from("users")
                .select("id, first_name, last_name, profile_picture_url")
                .eq("id", commission.runner_id)
                .single();

            logCaller("Commission update: Runner data fetched", runnerData ? `${runnerData.first_name || ''} ${runnerData.last_name || ''}`.trim() || 'BuddyRunner' : 'none');

            if (runnerData) {
                // Find or create conversation using legacy schema
                let conversationId: string | null = null;

                // Look for existing conversation between these users using legacy schema
                const { data: existing } = await supabase
                    .from("conversations")
                    .select("id")
                    .or(`and(user1_id.eq.${userId},user2_id.eq.${commission.runner_id}),and(user1_id.eq.${commission.runner_id},user2_id.eq.${userId})`)
                    .limit(1);

                logCaller("Commission update: Existing conversation search", existing && existing.length ? `Found: ${existing[0].id}` : 'Not found');

                if (existing && existing.length) {
                    conversationId = String(existing[0].id);
                    logCaller(`Commission update: Using existing conversation: ${conversationId}`);
                } else {
                    // Create new conversation using legacy user1_id/user2_id pattern
                    const { data: created, error: convErr } = await supabase
                        .from("conversations")
                        .insert({
                            user1_id: userId,
                            user2_id: commission.runner_id,
                            created_at: new Date().toISOString(),
                        })
                        .select("id")
                        .single();
                    if (convErr) throw convErr;
                    conversationId = String(created.id);
                    logCaller(`Commission update: Created new conversation: ${conversationId}`);
                }

                // Note: Automatic message is sent by the BuddyRunner when they accept the commission
                // No need to send duplicate message from BuddyCaller side

                // Mark this commission as redirected BEFORE navigation
                await markCommissionAsRedirected(String(commission.id));
                logCaller(`Commission update: Marked commission as redirected: ${commission.id}`);

                // Prepare navigation params
                const runnerName = `${runnerData.first_name || ''} ${runnerData.last_name || ''}`.trim() || 'BuddyRunner';
                const navigateToChat = () => {
                    // Platform-specific navigation: messages hub for web, direct chat for mobile
                    const chatPath = Platform.OS === 'web' 
                        ? "/buddycaller/messages_hub" 
                        : "/buddycaller/ChatScreenCaller";
                    
                    logCaller(`Commission update: Navigating to: ${chatPath}`);
                    logCaller(`Commission update: Platform: ${Platform.OS}`);
                    
                    router.replace({
                        pathname: chatPath,
                        params: {
                            conversationId,
                            otherUserId: commission.runner_id,
                            contactName: runnerName,
                            contactInitials: `${runnerData.first_name?.[0] || ''}${runnerData.last_name?.[0] || ''}`.toUpperCase() || 'BR',
                            isOnline: 'true',
                        }
                    });
                };

                // Show confirmation message before navigating
                if (Platform.OS === 'web' && showAcceptedModal) {
                    showAcceptedModal(runnerName, navigateToChat);
                } else {
                    Alert.alert(
                        'Accepted Successfully',
                        "You're now assigned to this commission. Opening chat…",
                        [
                            {
                                text: 'OK',
                                onPress: navigateToChat,
                            },
                        ],
                        { cancelable: false }
                    );
                }
            } else {
                logCaller(`Commission update: No runner data found for ID: ${commission.runner_id ? commission.runner_id.substring(0, 8) : 'none'}`);
            }
        } catch (error) {
            logCallerError("Commission update: Error handling commission acceptance", error);
        }
    }
}

// Helper functions for errand redirect guard (similar to commission)
async function hasErrandBeenRedirected(errandId: string): Promise<boolean> {
    // Check session memory first (fastest)
    if (SESSION_REDIRECTED_ERRANDS.has(errandId)) {
        return true;
    }

    // Check local storage
    try {
        const stored = await AsyncStorage.getItem(REDIRECTED_ERRANDS_KEY);
        if (stored) {
            const redirectedErrands = JSON.parse(stored);
            return Array.isArray(redirectedErrands) && redirectedErrands.includes(errandId);
        }
    } catch (error) {
        console.warn('Error checking errand redirect status:', error);
    }

    return false;
}

async function markErrandAsRedirected(errandId: string): Promise<void> {
    // Add to session memory
    SESSION_REDIRECTED_ERRANDS.add(errandId);

    // Add to local storage
    try {
        const stored = await AsyncStorage.getItem(REDIRECTED_ERRANDS_KEY);
        const redirectedErrands = stored ? JSON.parse(stored) : [];
        
        // Ensure redirectedErrands is an array
        const errandsArray = Array.isArray(redirectedErrands) ? redirectedErrands : [];

        if (!errandsArray.includes(errandId)) {
            errandsArray.push(errandId);
            await AsyncStorage.setItem(REDIRECTED_ERRANDS_KEY, JSON.stringify(errandsArray));
        }
    } catch (error) {
        console.warn('Error marking errand as redirected:', error);
    }
}

// Helper function to handle errand updates
async function handleErrandUpdate(
    errand: any,
    oldErrand: any,
    userId: string,
    router: any
) {
    logCaller("Errand update: Handling errand update", {
        errandId: errand.id,
        status: errand.status,
        oldStatus: oldErrand.status,
        runnerId: errand.runner_id ? errand.runner_id.substring(0, 8) : 'none'
    });

    // Check if errand was just accepted by runner (status changed to "in_progress")
    if (errand.status === "in_progress" && oldErrand.status !== "in_progress") {
        logCaller("Errand update: Errand was accepted, checking redirect guard...");
        logCaller(`Errand update: Status change detected - Old: ${oldErrand.status}, New: ${errand.status}`);

        // Check if we've already redirected for this errand
        const hasBeenRedirected = await hasErrandBeenRedirected(String(errand.id));
        if (hasBeenRedirected) {
            logCaller(`Errand update: Redirect guard active - errand already redirected: ${errand.id}`);
            return;
        }

        logCaller("Errand update: First-time redirect for errand, processing...");

        try {
            // Get runner details
            const { data: runnerData } = await supabase
                .from("users")
                .select("id, first_name, last_name, profile_picture_url")
                .eq("id", errand.runner_id)
                .single();

            logCaller("Errand update: Runner data fetched", runnerData ? `${runnerData.first_name || ''} ${runnerData.last_name || ''}`.trim() || 'BuddyRunner' : 'none');

            if (runnerData) {
                // Mark this errand as redirected BEFORE showing modal
                await markErrandAsRedirected(String(errand.id));
                logCaller(`Errand update: Marked errand as redirected: ${errand.id}`);

                // Prepare runner name
                const runnerName = `${runnerData.first_name || ''} ${runnerData.last_name || ''}`.trim() || 'BuddyRunner';
                
                // Notify global service to show modal
                logCaller("Errand update: Notifying errand acceptance service");
                errandAcceptanceService.notifyAcceptance({
                    runnerName,
                    errandId: errand.id,
                });
            } else {
                logCaller(`Errand update: No runner data found for ID: ${errand.runner_id ? errand.runner_id.substring(0, 8) : 'none'}`);
            }
        } catch (error) {
            logCallerError("Errand update: Error handling errand acceptance", error);
        }
    }
}

/* MAIN */
export default function HomeScreen() {
    const { width } = useWindowDimensions();
    const isWeb = Platform.OS === "web" || width >= 900;
    return isWeb ? <HomeWeb /> : <HomeMobile />;
}

/* ============================== WEB LAYOUT ============================== */
function HomeWeb() {
    const router = useRouter();
    const params = useLocalSearchParams();
    const { width } = useWindowDimensions();
    const isWeb = Platform.OS === "web";
    
    // Responsive sidebar: collapse on small screens (< 1024px), expand on larger screens
    const isSmallScreen = width < 1024;
    const [open, setOpen] = React.useState(!isSmallScreen);
    
    // Auto-collapse/expand sidebar based on screen size
    React.useEffect(() => {
        setOpen(!isSmallScreen);
    }, [isSmallScreen]);
    
    const [activeTab, setActiveTab] = React.useState<"Errands" | "Commissions">("Errands");

    // logout flow states
    const [confirmOpen, setConfirmOpen] = React.useState(false);
    const [successOpen, setSuccessOpen] = React.useState(false);
    const [loggingOut, setLoggingOut] = React.useState(false);

    // Phase gating (WEB only). Non-web defaults to ready.
    const [webPhase1Ready, setWebPhase1Ready] = React.useState(!isWeb);
    const [webPhase2Ready, setWebPhase2Ready] = React.useState(!isWeb);
    const [webPhase3Ready, setWebPhase3Ready] = React.useState(!isWeb);

    const { loading, criticalLoading, firstName, fullName, roleLabel, profilePictureUrl } = useAuthProfile();
    
    // Initialize caller logger with name (web only)
    // Call it whenever fullName changes, even if initially undefined
    // This ensures the logger is updated once fullName becomes available
    React.useEffect(() => {
        if (Platform.OS === 'web') {
            initCallerLogger(fullName);
        }
    }, [fullName]);

    // Phase 1: resolve user identity (web only) without blocking rendering
    React.useEffect(() => {
        if (!isWeb) return;
        let cancelled = false;
        (async () => {
            webPerfTime('WEB_CALLER_PHASE1_GET_USER');
            const user = await getCallerAuthUser('WEB_CALLER_PHASE1_GET_USER');
            if (cancelled) return;
            webPerfTimeEnd('WEB_CALLER_PHASE1_GET_USER');
            // Phase 1 considered ready once auth check is attempted (user may be null)
            setWebPhase1Ready(true);
        })();
        return () => { cancelled = true; };
    }, [isWeb]);

    // Phase 2: primary data after Phase 1
    React.useEffect(() => {
        if (!isWeb) return;
        if (!webPhase1Ready) return;
        setWebPhase2Ready(true);
    }, [isWeb, webPhase1Ready]);

    // Phase 3: observers after Phase 2
    React.useEffect(() => {
        if (!isWeb) return;
        if (!webPhase2Ready) return;
        setWebPhase3Ready(true);
    }, [isWeb, webPhase2Ready]);

    React.useEffect(() => {
        const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
            if (event === "SIGNED_OUT" && !session) setSuccessOpen(true);
        });
        return () => sub?.subscription?.unsubscribe?.();
    }, []);

    // Clean up old redirects on app start
    React.useEffect(() => {
        if (isWeb && !webPhase2Ready) return;
        cleanupOldRedirects();
    }, [isWeb, webPhase2Ready]);

    // NOTE: Timeout enforcement removed from client - handled by backend cron + Edge Function only

    // Web-only: accepted popup before redirect
    const [acceptedOpen, setAcceptedOpen] = React.useState(false);
    const [acceptedRunner, setAcceptedRunner] = React.useState<string>("BuddyRunner");
    const [acceptedOnOk, setAcceptedOnOk] = React.useState<() => void>(() => () => {});

    const showAcceptedModal = (runnerName: string, onOk: () => void) => {
        setAcceptedRunner(runnerName || "BuddyRunner");
        setAcceptedOnOk(() => onOk);
        setAcceptedOpen(true);
    };

    // Monitor commission acceptance and redirect to chat
    React.useEffect(() => {
        if (isWeb && !webPhase3Ready) return;
        const setupCommissionMonitoring = async () => {
            const user = await getCallerAuthUser('WEB_CALLER_COMMISSION_MONITOR_GET_USER');
            if (!user) return;

            logCaller(`Commission monitor: Setting up commission monitoring for user: ${user.id.substring(0, 8)}`);

            const channel = supabase
                .channel(`commission_acceptance_${user.id}`)
                .on(
                    "postgres_changes",
                    {
                        event: "UPDATE",
                        schema: "public",
                        table: "commission",
                        filter: `buddycaller_id=eq.${user.id}`
                    },
                    async (payload) => {
                        logCaller(`Commission monitor: Real-time update received: ${payload.new?.id || 'unknown'}`);
                        await handleCommissionUpdate(payload.new, payload.old, user.id, router, showAcceptedModal);
                    }
                )
                .subscribe((status) => {
                    logCaller(`Commission monitor: Subscription status: ${status}`);
                });

            // Set up polling as fallback (check every 3 seconds)
            const pollInterval = setInterval(async () => {
                try {
                    // Only check commissions accepted in the last 5 minutes
                    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

                    const { data: commissions, error } = await supabase
                        .from("commission")
                        .select("*")
                        .eq("buddycaller_id", user.id)
                        .eq("status", "in_progress")
                        .gte("accepted_at", fiveMinutesAgo); // Only recently accepted

                    if (error) {
                        // Use warn instead of error for expected polling failures (network issues, etc.)
                        const errorMsg = error instanceof Error 
                            ? error.message 
                            : (error && typeof error === 'object' && 'message' in error
                                ? (error as { message?: string; details?: string; hint?: string }).message || 
                                  (error as { message?: string; details?: string; hint?: string }).details || 
                                  (error as { message?: string; details?: string; hint?: string }).hint || 
                                  JSON.stringify(error) || 
                                  String(error)
                                : String(error));
                        logCallerWarn("Commission monitor: Polling error", errorMsg);
                        return;
                    }

                    if (commissions && commissions.length > 0) {
                        // Check each commission for redirect guard
                        for (const commission of commissions) {
                            const hasBeenRedirected = await hasCommissionBeenRedirected(String(commission.id));
                            if (!hasBeenRedirected) {
                                logCaller(`Commission monitor: Polling found unprocessed commission: ${commission.id}`);
                        await handleCommissionUpdate(commission, { status: "pending" }, user.id, router, showAcceptedModal);
                                break; // Only process one commission per polling cycle
                            } else {
                                logCaller(`Commission monitor: Polling found commission but already redirected: ${commission.id}`);
                            }
                        }
                    }
                } catch (error) {
                    // Use warn instead of error for expected polling failures (network issues, etc.)
                    const errorMsg = error instanceof Error 
                        ? error.message 
                        : (error && typeof error === 'object' && ('message' in error || 'details' in error || 'hint' in error)
                            ? ((error as { message?: string; details?: string; hint?: string }).message || 
                               (error as { message?: string; details?: string; hint?: string }).details || 
                               (error as { message?: string; details?: string; hint?: string }).hint || 
                               JSON.stringify(error))
                            : String(error));
                    logCallerWarn("Commission monitor: Polling error", errorMsg);
                }
            }, 3000);

            // NOTE: Timeout enforcement (notified_expires_at) is handled by backend cron + Edge Function only
            // Client no longer polls for timeouts - backend is single source of truth

            // Also monitor on commission updates - specifically when notified_runner_id becomes NULL
            const timeoutCheckChannel = supabase
                .channel(`commission_timeout_check_${user.id}`)
                .on(
                    "postgres_changes",
                    {
                        event: "UPDATE",
                        schema: "public",
                        table: "commission",
                        filter: `buddycaller_id=eq.${user.id}`
                    },
                    async (payload) => {
                        logCaller(`Timeout monitor: Commission update detected: ${payload.new?.id || 'unknown'}`);
                        const oldData = payload.old as any;
                        const newData = payload.new as any;
                        
                        // Check if notified_runner_id changed from non-null to null
                        // This indicates clear_commission_notification was called
                        if (oldData?.notified_runner_id && !newData?.notified_runner_id) {
                            logCaller(`Timeout monitor: notified_runner_id cleared for commission ${newData.id}, checking immediately`);
                            // Check this specific commission immediately
                            await monitorCommissionsForTimeout(user.id, newData.id);
                        } else {
                            // Also do a general check for other commissions
                            monitorCommissionsForTimeout(user.id);
                        }
                    }
                )
                .subscribe();

            // Also monitor on errand updates - specifically when notified_runner_id becomes NULL
            const errandTimeoutCheckChannel = supabase
                .channel(`errand_timeout_check_${user.id}`)
                .on(
                    "postgres_changes",
                    {
                        event: "UPDATE",
                        schema: "public",
                        table: "errand",
                        filter: `buddycaller_id=eq.${user.id}`
                    },
                    async (payload) => {
                        logCaller(`Timeout monitor: Errand update detected: ${payload.new?.id || 'unknown'}`);
                        const oldData = payload.old as any;
                        const newData = payload.new as any;
                        
                        // Check if notified_runner_id changed from non-null to null
                        // This indicates clear_errand_notification was called
                        if (oldData?.notified_runner_id && !newData?.notified_runner_id) {
                            logCaller(`Timeout monitor: notified_runner_id cleared for errand ${newData.id}, checking immediately`);
                            // Check this specific errand immediately
                            await monitorErrandsForTimeout(user.id, newData.id);
                        } else {
                            // Also do a general check for other errands
                            monitorErrandsForTimeout(user.id);
                        }
                    }
                )
                .subscribe();

            return () => {
                logCaller("Commission monitor: Cleaning up subscription and polling");
                supabase.removeChannel(channel);
                supabase.removeChannel(timeoutCheckChannel);
                supabase.removeChannel(errandTimeoutCheckChannel);
                clearInterval(pollInterval);
            };
        };

        const cleanup = setupCommissionMonitoring();
        return () => {
            cleanup.then(cleanupFn => cleanupFn?.());
        };
    }, [router, isWeb, webPhase3Ready]);

    // Monitor for timeout-based cancellations (row-based modal trigger)
    React.useEffect(() => {
        if (isWeb && !webPhase3Ready) return;
        const setupCancellationMonitoring = async () => {
            const user = await getCallerAuthUser('WEB_CALLER_CANCELLATION_MONITOR_GET_USER');
            if (!user) return;

            logCaller(`Cancellation monitor: Setting up row-based cancellation monitoring for user: ${user.id.substring(0, 8)}`);

            // Track handled task IDs to prevent duplicate modals
            const handledTaskIds = new Set<string>();

            // Monitor errand cancellations
            const errandCancellationChannel = supabase
                .channel(`errand_cancellation_${user.id}`)
                .on(
                    'postgres_changes',
                    {
                        event: 'UPDATE',
                        schema: 'public',
                        table: 'errand',
                        filter: `buddycaller_id=eq.${user.id}`
                    },
                    (payload) => {
                        const oldData = payload.old as any;
                        const newData = payload.new as any;
                        const taskId = String(newData?.id || '');

                        // DEBUG: Log all realtime events
                        console.log('[CANCELLATION MONITOR] Errand update received:', {
                            taskId,
                            oldStatus: oldData?.status,
                            newStatus: newData?.status,
                            oldRunnerId: oldData?.runner_id,
                            newRunnerId: newData?.runner_id,
                            oldNotifiedRunnerId: oldData?.notified_runner_id,
                            newNotifiedRunnerId: newData?.notified_runner_id,
                            timeoutRunnerIds: newData?.timeout_runner_ids,
                            timeoutRunnerIdsLength: Array.isArray(newData?.timeout_runner_ids) ? newData.timeout_runner_ids.length : 0,
                            alreadyHandled: handledTaskIds.has(taskId)
                        });

                        // Check all conditions for timeout-based cancellation
                        const condition1 = newData?.status === 'cancelled';
                        const condition2 = oldData?.status === 'pending';
                        const condition3 = newData?.runner_id === null;
                        const condition4 = newData?.notified_runner_id === null;
                        const condition5 = Array.isArray(newData?.timeout_runner_ids) && newData.timeout_runner_ids.length > 0;
                        const condition6 = oldData?.notified_runner_id !== null;
                        const condition7 = !handledTaskIds.has(taskId);

                        console.log('[CANCELLATION MONITOR] Condition check:', {
                            condition1,
                            condition2,
                            condition3,
                            condition4,
                            condition5,
                            condition6,
                            condition7,
                            allConditionsMet: condition1 && condition2 && condition3 && condition4 && condition5 && condition6 && condition7
                        });

                        if (condition1 && condition2 && condition3 && condition4 && condition5 && condition6 && condition7) {
                            handledTaskIds.add(taskId);
                            console.log('[CANCELLATION MONITOR] ✅ ALL CONDITIONS MET - Triggering modal for errand', taskId);
                            logCaller(`Cancellation monitor: ✅ Triggering modal for cancelled errand ${taskId}`);
                            
                            noRunnersAvailableService.notify({
                                type: 'errand',
                                errandId: Number(taskId),
                                errandTitle: newData.title || 'Untitled Errand'
                            });

                            // Clean up handled ID after 5 seconds to allow re-trigger if needed
                            setTimeout(() => {
                                handledTaskIds.delete(taskId);
                                console.log('[CANCELLATION MONITOR] Cleared handled ID for errand', taskId);
                            }, 5000);
                        } else {
                            console.log('[CANCELLATION MONITOR] Conditions not met, skipping modal trigger');
                        }
                    }
                )
                .subscribe((status) => {
                    logCaller(`Cancellation monitor: Errand subscription status: ${status}`);
                });

            // Monitor commission cancellations
            const commissionCancellationChannel = supabase
                .channel(`commission_cancellation_${user.id}`)
                .on(
                    'postgres_changes',
                    {
                        event: 'UPDATE',
                        schema: 'public',
                        table: 'commission',
                        filter: `buddycaller_id=eq.${user.id}`
                    },
                    (payload) => {
                        const oldData = payload.old as any;
                        const newData = payload.new as any;
                        const taskId = String(newData?.id || '');

                        // DEBUG: Log all realtime events
                        console.log('[CANCELLATION MONITOR] Commission update received:', {
                            taskId,
                            oldStatus: oldData?.status,
                            newStatus: newData?.status,
                            oldRunnerId: oldData?.runner_id,
                            newRunnerId: newData?.runner_id,
                            oldNotifiedRunnerId: oldData?.notified_runner_id,
                            newNotifiedRunnerId: newData?.notified_runner_id,
                            timeoutRunnerIds: newData?.timeout_runner_ids,
                            timeoutRunnerIdsLength: Array.isArray(newData?.timeout_runner_ids) ? newData.timeout_runner_ids.length : 0,
                            alreadyHandled: handledTaskIds.has(taskId)
                        });

                        // Check all conditions for timeout-based cancellation
                        const condition1 = newData?.status === 'cancelled';
                        const condition2 = oldData?.status === 'pending';
                        const condition3 = newData?.runner_id === null;
                        const condition4 = newData?.notified_runner_id === null;
                        const condition5 = Array.isArray(newData?.timeout_runner_ids) && newData.timeout_runner_ids.length > 0;
                        const condition6 = oldData?.notified_runner_id !== null;
                        const condition7 = !handledTaskIds.has(taskId);

                        console.log('[CANCELLATION MONITOR] Condition check:', {
                            condition1,
                            condition2,
                            condition3,
                            condition4,
                            condition5,
                            condition6,
                            condition7,
                            allConditionsMet: condition1 && condition2 && condition3 && condition4 && condition5 && condition6 && condition7
                        });

                        if (condition1 && condition2 && condition3 && condition4 && condition5 && condition6 && condition7) {
                            handledTaskIds.add(taskId);
                            console.log('[CANCELLATION MONITOR] ✅ ALL CONDITIONS MET - Triggering modal for commission', taskId);
                            logCaller(`Cancellation monitor: ✅ Triggering modal for cancelled commission ${taskId}`);
                            
                            noRunnersAvailableService.notify({
                                type: 'commission',
                                commissionId: Number(taskId),
                                commissionTitle: newData.title || 'Untitled Commission'
                            });

                            // Clean up handled ID after 5 seconds to allow re-trigger if needed
                            setTimeout(() => {
                                handledTaskIds.delete(taskId);
                                console.log('[CANCELLATION MONITOR] Cleared handled ID for commission', taskId);
                            }, 5000);
                        } else {
                            console.log('[CANCELLATION MONITOR] Conditions not met, skipping modal trigger');
                        }
                    }
                )
                .subscribe((status) => {
                    logCaller(`Cancellation monitor: Commission subscription status: ${status}`);
                });

            return () => {
                logCaller("Cancellation monitor: Cleaning up subscriptions");
                supabase.removeChannel(errandCancellationChannel);
                supabase.removeChannel(commissionCancellationChannel);
            };
        };

        const cleanup = setupCancellationMonitoring();
        return () => {
            cleanup.then(cleanupFn => cleanupFn?.());
        };
    }, [isWeb, webPhase3Ready]);

    // Monitor errand acceptance and redirect to map
    React.useEffect(() => {
        if (isWeb && !webPhase3Ready) return;
        const setupErrandMonitoring = async () => {
            const user = await getCallerAuthUser('WEB_CALLER_ERRAND_MONITOR_GET_USER');
            if (!user) return;

            logCaller(`Errand monitor: Setting up errand monitoring for user: ${user.id.substring(0, 8)}`);

            const channel = supabase
                .channel(`errand_acceptance_${user.id}`)
                .on(
                    "postgres_changes",
                    {
                        event: "UPDATE",
                        schema: "public",
                        table: "errand",
                        filter: `buddycaller_id=eq.${user.id}`
                    },
                    async (payload) => {
                        logCaller(`Errand monitor: Real-time errand update received: ${payload.new?.id || 'unknown'}`);
                        await handleErrandUpdate(payload.new, payload.old, user.id, router);
                    }
                )
                .subscribe((status) => {
                    logCaller(`Errand monitor: Subscription status: ${status}`);
                });

            // Set up polling as fallback (check every 3 seconds)
            const pollInterval = setInterval(async () => {
                try {
                    // Only check errands accepted in the last 5 minutes
                    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

                    const { data: errands, error } = await supabase
                        .from("errand")
                        .select("*")
                        .eq("buddycaller_id", user.id)
                        .eq("status", "in_progress")
                        .gte("accepted_at", fiveMinutesAgo); // Only recently accepted

                    if (error) {
                        // Use warn instead of error for expected polling failures (network issues, etc.)
                        const errorMsg = error instanceof Error 
                            ? error.message 
                            : (error && typeof error === 'object' && 'message' in error
                                ? (error as { message?: string; details?: string; hint?: string }).message || 
                                  (error as { message?: string; details?: string; hint?: string }).details || 
                                  (error as { message?: string; details?: string; hint?: string }).hint || 
                                  JSON.stringify(error) || 
                                  String(error)
                                : String(error));
                        logCallerWarn("Errand monitor: Polling error", errorMsg);
                        return;
                    }

                    if (errands && errands.length > 0) {
                        // Check each errand for redirect guard
                        for (const errand of errands) {
                            const hasBeenRedirected = await hasErrandBeenRedirected(String(errand.id));
                            if (!hasBeenRedirected) {
                                logCaller(`Errand monitor: Polling found unprocessed errand: ${errand.id}`);
                                await handleErrandUpdate(errand, { status: "pending" }, user.id, router);
                                break; // Only process one errand per polling cycle
                            } else {
                                logCaller(`Errand monitor: Polling found errand but already redirected: ${errand.id}`);
                            }
                        }
                    }
                } catch (error) {
                    // Use warn instead of error for expected polling failures (network issues, etc.)
                    const errorMsg = error instanceof Error 
                        ? error.message 
                        : (error && typeof error === 'object' && ('message' in error || 'details' in error || 'hint' in error)
                            ? ((error as { message?: string; details?: string; hint?: string }).message || 
                               (error as { message?: string; details?: string; hint?: string }).details || 
                               (error as { message?: string; details?: string; hint?: string }).hint || 
                               JSON.stringify(error))
                            : String(error));
                    logCallerWarn("Errand monitor: Polling error", errorMsg);
                }
            }, 3000);

            return () => {
                logCaller("Errand monitor: Cleaning up subscription and polling");
                supabase.removeChannel(channel);
                clearInterval(pollInterval);
            };
        };

        const cleanup = setupErrandMonitoring();
        return () => {
            cleanup.then(cleanupFn => cleanupFn?.());
        };
    }, [router, isWeb, webPhase3Ready]);

    const requestLogout = () => setConfirmOpen(true);
    const performLogout = async () => {
        if (loggingOut) return;
        setLoggingOut(true);
        try {
            if (Platform.OS === 'web') {
                await supabase.auth.signOut({ scope: 'local' } as any);
            } else {
                await supabase.auth.signOut();
            }
            // After logout, clear cached auth user to avoid stale data on next login
            resetCallerAuthUserCache();
        } catch (e) {
            console.warn("signOut error:", e);
        }
        setConfirmOpen(false);
        setSuccessOpen(false);
        router.replace('/login');
        setLoggingOut(false);
    };

    const { initialLoading, rows: errands, runnerNameMap, refetch } = useMyErrands({ enableInitialFetch: webPhase2Ready });
    const { initialLoading: runnersLoading, rows: runners, refetch: refetchRunners } = useAvailableRunners({ enableInitialFetch: webPhase2Ready });

    // Non-critical loading: data queries (errands, runners) - does NOT block screen render
    // Currently kept for backward compatibility, will be used to unblock in next step
    const dataLoading = initialLoading || runnersLoading;

    // Convert runners to commissioners format for filtering
    const commissioners = React.useMemo(() => {
        if (!runners || runners.length === 0) return [];
        return runners.map(runner => ({
            id: runner.id,
            name: `${titleCase(runner.first_name || "")} ${titleCase(runner.last_name || "")}`.trim() || "BuddyRunner",
            category: "Logos" as const, // Default category, could be enhanced later
            rating: 5.0, // Default rating, could be enhanced later
            profile_picture_url: runner.profile_picture_url,
            is_available: runner.is_available,
            status: "Online" as const // Add online status like runner cards
        }));
    }, [runners]);

    const filtered = React.useMemo(
        () => commissioners,
        [commissioners]
    );

    // if we came from post with ?refresh=1 trigger explicit refetch (silent)
    React.useEffect(() => {
        if (params?.refresh) {
            refetch({ silent: true });
            refetchRunners({ silent: true });
        }
    }, [params, refetch, refetchRunners]);

    // refetch on focus for web too (silent)
    useFocusEffect(
        React.useCallback(() => {
            refetch({ silent: true });
            refetchRunners({ silent: true });
        }, [refetch, refetchRunners])
    );

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }}>
            {/* Accepted popup (web) */}
            {acceptedOpen && (
                <Modal transparent animationType="fade" visible={true} onRequestClose={() => setAcceptedOpen(false)}>
                    <View style={success.backdrop}>
                        <View style={success.card}>
                            <View style={success.iconWrap}>
                                <Ionicons name="checkmark-circle" size={44} color={colors.maroon} />
                            </View>
                            <Text style={success.title}>Accepted Successfully</Text>
                            <Text style={success.msg}>{acceptedRunner} accepted your commission. Opening chat…</Text>
                            <TouchableOpacity
                                onPress={() => { setAcceptedOpen(false); acceptedOnOk(); }}
                                style={success.okBtn}
                                activeOpacity={0.9}
                            >
                                <Text style={success.okText}>OK</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </Modal>
            )}
            <ConfirmModal
                visible={confirmOpen}
                title="Log Out?"
                message="Are you sure want to log out?"
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
            <NoRunnersAvailableModalWeb />

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
                    userRole={roleLabel}
                    profilePictureUrl={profilePictureUrl}
                />

                <View style={web.mainArea}>
                    <View style={[web.topBar, isSmallScreen && { gap: 12 }]}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 12, flex: 1 }}>
                            {isSmallScreen && (
                                <TouchableOpacity
                                    onPress={() => setOpen(true)}
                                    style={web.hamburgerBtn}
                                    activeOpacity={0.7}
                                >
                                    <Ionicons name="menu-outline" size={24} color={colors.text} />
                                </TouchableOpacity>
                            )}
                            <View style={{ flex: 1 }}>
                                <Text style={web.welcome}>
                                    {loading ? "Loading…" : `Hi, ${firstName} 👋`}
                                </Text>
                                <Text style={[web.welcome, { fontSize: 16, fontWeight: "400", marginTop: 4 }]}>
                                    What do you need help with?
                                </Text>
                            </View>
                        </View>
                        <TouchableOpacity onPress={() => router.push("/buddycaller/notification")} activeOpacity={0.9}>
                            <Ionicons name="notifications-outline" size={24} color={colors.text} />
                        </TouchableOpacity>
                    </View>

                    <View style={web.tabsWrapper}>
                        <View style={[web.tabsContainer, { maxWidth: 980 }]}>
                            <TouchableOpacity
                                style={[web.tabItem, activeTab === "Errands" && web.tabItemActive]}
                                onPress={() => setActiveTab("Errands")}
                            >
                                <Ionicons 
                                    name="checkmark-circle-outline" 
                                    size={18} 
                                    color={activeTab === "Errands" ? colors.maroon : "#fff"} 
                                    style={{ marginRight: 6 }}
                                />
                                <Text style={[web.tabText, activeTab === "Errands" && web.tabTextActive]}>Errands</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[web.tabItem, activeTab === "Commissions" && web.tabItemActive]}
                                onPress={() => setActiveTab("Commissions")}
                            >
                                <Ionicons 
                                    name="person-outline" 
                                    size={18} 
                                    color={activeTab === "Commissions" ? colors.maroon : "#fff"} 
                                    style={{ marginRight: 6 }}
                                />
                                <Text style={[web.tabText, activeTab === "Commissions" && web.tabTextActive]}>
                                    Commissions
                                </Text>
                            </TouchableOpacity>
                        </View>
                    </View>

                    <ScrollView contentContainerStyle={{ paddingVertical: 24 }}>
                        <View style={[web.container, { maxWidth: 1400 }]}>
                            {activeTab === "Errands" ? (
                                <>
                                    <View style={[web.bigCardsRow, width <= 768 && { flexDirection: "column", gap: 16 }]}>
                                        <BigActionCard
                                            title="Post an Errand"
                                            icon="document-text-outline"
                                            filled
                                            subtitle="Get help from runners near you"
                                            onPress={() => router.push("/buddycaller/errand_form")}
                                        />
                                        <BigActionCard 
                                            title="My Requests" 
                                            icon="document-text-outline" 
                                            onPress={() => router.push("/buddycaller/my_request_errands_web")}
                                        />
                                    </View>

                                    <Text style={web.sectionTitle}>Available Runners</Text>

                                    {runnersLoading ? (
                                        <Text style={{ color: colors.text, opacity: 0.7 }}>Loading…</Text>
                                    ) : runners.length === 0 ? (
                                        <NoRunnersAvailableCard />
                                    ) : (
                                        <View style={{ gap: 12, marginBottom: 36 }}>
                                            {runners.map((r) => (
                                                <RunnerRow
                                                    key={r.id}
                                                    data={{
                                                        id: r.id,
                                                        name: `${titleCase(r.first_name || "")} ${titleCase(r.last_name || "")}`.trim() || "BuddyRunner",
                                                        status: "Online" as const,
                                                        role: r.role || "buddyrunner",
                                                        profile_picture_url: r.profile_picture_url || undefined,
                                                    }}
                                                />
                                            ))}
                                        </View>
                                    )}
                                </>
                            ) : (
                                <>
                                    <View style={[web.bigCardsRow, width <= 768 && { flexDirection: "column", gap: 16 }]}>
                                        <BigActionCard
                                            title="Post Commission"
                                            icon="document-text-outline"
                                            filled
                                            subtitle="Get help from runners near you"
                                            onPress={() => router.push("/buddycaller/commission_form_web")}
                                        />
                                        <BigActionCard 
                                            title="My Requests" 
                                            icon="calendar-outline" 
                                            onPress={() => router.push("/buddycaller/my_request_commission_web")}
                                        />
                                    </View>

                                    <Text style={web.sectionTitle}>Available Runners</Text>
                                    {runnersLoading ? (
                                        <Text style={{ color: colors.text, opacity: 0.7 }}>Loading…</Text>
                                    ) : filtered.length === 0 ? (
                                        <NoRunnersAvailableCard />
                                    ) : (
                                        <View style={{ gap: 12, marginBottom: 36 }}>
                                            {filtered.map((c) => (
                                                <CommissionerRow key={c.id} c={c} />
                                            ))}
                                        </View>
                                    )}
                                </>
                            )}
                        </View>
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

    // On small screens, hide sidebar off-canvas when closed; on larger screens, collapse width
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
                    <TouchableOpacity onPress={onToggle} style={[web.sideMenuBtn, !open && { marginRight: 0 }]}>
                        <Ionicons name="menu-outline" size={20} color={colors.text} />
                    </TouchableOpacity>
                    {open && (
                        <>
                            <Image
                                source={require("../../assets/images/logo.png")}
                                style={{ width: 22, height: 22, resizeMode: "contain" }}
                            />
                            <Text style={web.brand}>GoBuddy</Text>
                        </>
                    )}
                </View>
            </View>

            <View style={{ flex: 1, justifyContent: "space-between" }}>
                <View style={{ paddingTop: 8 }}>
                    <SideItem label="Home" icon="home-outline" open={open} active onPress={() => router.push("/buddycaller/home")} />
                    <Separator />
                    <SideItem label="Messages" icon="chatbubbles-outline" open={open} onPress={() => router.push("/buddycaller/messages_hub")} />
                    <SideItem label="Profile" icon="person-outline" open={open} onPress={() => router.push("/buddycaller/profile")} />
                </View>

                <View style={web.sidebarFooter}>
                    <View style={web.userCard}>
                        <View style={web.userAvatar}>
                            {profilePictureUrl ? (
                                <Image 
                                    source={{ uri: profilePictureUrl }} 
                                    style={{ width: 34, height: 34, borderRadius: 17, overflow: 'hidden' }}
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

                    <TouchableOpacity onPress={onLogout} activeOpacity={0.9} style={web.logoutBtn}>
                        <Ionicons name="log-out-outline" size={18} color={colors.maroon} />
                        {open && <Text style={web.logoutText}>Logout</Text>}
                    </TouchableOpacity>
                </View>
            </View>
        </View>
    );
}
function Separator() {
    return <View style={{ height: 1, backgroundColor: colors.border }} />;
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
            {open && <Text style={[web.sideItemText, active && { color: "#fff", fontWeight: "700" }]}>{label}</Text>}
        </TouchableOpacity>
    );
}

/* ======================= BIG ACTION CARD (WEB) ======================= */
function BigActionCard({
    title,
    icon,
    filled,
    onPress,
    subtitle,
}: {
    title: string;
    icon: any;
    filled?: boolean;
    onPress?: () => void;
    subtitle?: string;
}) {
    const { width } = useWindowDimensions();
    const isMobileBrowser = width <= 768;
    
    if (isMobileBrowser && !filled) {
        // My Requests card - mobile browser: horizontal layout
        return (
            <TouchableOpacity
                activeOpacity={0.9}
                onPress={onPress}
                style={[
                    web.bigCard,
                    web.bigCardMobile,
                    { backgroundColor: "#fff", borderColor: colors.border, borderWidth: 1.2 },
                ]}
            >
                <View style={{ flexDirection: "row", alignItems: "center", flex: 1, gap: 12 }}>
                    <Ionicons name={icon} size={32} color={colors.maroon} />
                    <Text style={{ color: colors.text, fontSize: 16, fontWeight: "700", flex: 1 }}>{title}</Text>
                    <Ionicons name="chevron-forward-outline" size={20} color={colors.text} style={{ opacity: 0.5 }} />
                </View>
            </TouchableOpacity>
        );
    }
    
    if (isMobileBrowser && filled) {
        // Post an Errand card - mobile browser: vertical layout with subtitle
        return (
            <TouchableOpacity
                activeOpacity={0.9}
                onPress={onPress}
                style={[
                    web.bigCard,
                    web.bigCardMobileFilled,
                    { backgroundColor: colors.maroon },
                ]}
            >
                <Ionicons name={icon} size={56} color="#fff" style={{ marginBottom: 20 }} />
                <Text style={{ color: "#fff", fontSize: 20, fontWeight: "700", marginBottom: 8, textAlign: "center" }}>{title}</Text>
                {subtitle && (
                    <Text style={{ color: "#fff", fontSize: 14, fontWeight: "400", opacity: 0.9, textAlign: "center" }}>{subtitle}</Text>
                )}
            </TouchableOpacity>
        );
    }
    
    // Desktop: original layout
    return (
        <TouchableOpacity
            activeOpacity={0.9}
            onPress={onPress}
            style={[
                web.bigCard,
                filled ? { backgroundColor: colors.maroon } : { backgroundColor: "#fff", borderColor: colors.border, borderWidth: 1.2 },
            ]}
        >
            <Ionicons name={icon} size={44} color={filled ? "#fff" : colors.maroon} style={{ marginBottom: 16 }} />
            <Text style={{ color: filled ? "#fff" : colors.text, fontSize: 16, fontWeight: "700" }}>{title}</Text>
        </TouchableOpacity>
    );
}

/* ======================= ROWS (WEB) ======================= */
function RunnerRow({ data }: { data: Runner }) {
    const router = useRouter();
    const { width } = useWindowDimensions();
    const isWeb = Platform.OS === "web" || width >= 900; // detect platform

    return (
        <TouchableOpacity
            style={web.runnerRow}
            onPress={() => {
                // Use the same route for both web and mobile, let the component handle the differences
                router.push({
                    pathname: "/buddyrunner/profile",
                    params: { 
                        userId: data.id, 
                        isViewingOtherUser: 'true', 
                        returnTo: isWeb ? '/buddycaller/home' : 'BuddyCallerHome' 
                    },
                });
            }}
        >
            {/* Profile Picture - Left */}
            <View style={web.runnerAvatar}>
                {data.profile_picture_url ? (
                    <Image 
                        source={{ uri: data.profile_picture_url }} 
                        style={web.runnerAvatarImage}
                    />
                ) : (
                    <Ionicons name="person" size={24} color={colors.border} />
                )}
            </View>

            {/* Center Section - Name, Status, Role */}
            <View style={{ flex: 1, marginLeft: 12, gap: 6 }}>
                <Text style={{ fontWeight: "800", color: colors.text, fontSize: 14 }}>{data.name}</Text>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <View style={web.onlineIndicator} />
                    <Text style={{ color: colors.text, fontSize: 13, opacity: 0.8 }}>Online</Text>
                </View>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Ionicons name="walk-outline" size={14} color={colors.maroon} />
                    <Text style={{ color: colors.text, fontSize: 13, opacity: 0.8 }}>BuddyRunner</Text>
                </View>
            </View>

            {/* View Profile - Right */}
            <Text style={{ color: colors.maroon, fontWeight: "700", fontSize: 13 }}>View Profile &gt;</Text>
        </TouchableOpacity>
    );
}

function ErrandRow({ data }: { data: Errand }) {
    const router = useRouter();
    const isWeb = Platform.OS === "web"; // detect platform

    return (
        <TouchableOpacity
            style={web.errandRow}
            onPress={() =>
                isWeb
                    ? router.push(`/buddycaller/view_errand_web?id=${data.id}`) // web
                    : router.push({
                        pathname: "/buddycaller/view_errand", // mobile
                        params: { id: data.id },
                    })
            }
        >
            <View style={{ flex: 1, gap: 6 }}>
                <Text style={{ fontWeight: "800", color: colors.text, fontSize: 14 }}>{data.title}</Text>
                <View style={web.pill}>
                    <Text style={web.pillText}>{data.status}</Text>
                </View>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Ionicons name="walk-outline" size={12} color={colors.maroon} />
                    <Text style={{ color: colors.text, fontSize: 11 }}>{data.requester}</Text>
                </View>
            </View>
            <Text style={{ color: colors.maroon, fontWeight: "700", fontSize: 12 }}>View &gt;</Text>
        </TouchableOpacity>
    );
}

function CommissionerRow({ c }: { c: Commissioner }) {
    const router = useRouter();
    const { width } = useWindowDimensions();
    const isWeb = Platform.OS === "web" || width >= 900; // detect platform

    return (
        <TouchableOpacity 
            style={web.commRow}
            onPress={() => {
                // Use the same route for both web and mobile, let the component handle the differences
                router.push({
                    pathname: "/buddyrunner/profile",
                    params: { 
                        userId: c.id, 
                        isViewingOtherUser: 'true', 
                        returnTo: isWeb ? '/buddycaller/home' : 'BuddyCallerHome' 
                    },
                });
            }}
        >
            {/* Profile Picture - Left */}
            <View style={web.runnerAvatar}>
                {c.profile_picture_url ? (
                    <Image 
                        source={{ uri: c.profile_picture_url }} 
                        style={web.runnerAvatarImage}
                    />
                ) : (
                    <Ionicons name="person" size={24} color={colors.border} />
                )}
            </View>

            {/* Center Section - Name, Status, Role */}
            <View style={{ flex: 1, marginLeft: 12, gap: 6 }}>
                <Text style={{ fontWeight: "800", color: colors.text, fontSize: 14 }}>{c.name}</Text>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <View style={web.onlineIndicator} />
                    <Text style={{ color: colors.text, fontSize: 13, opacity: 0.8 }}>Online</Text>
                </View>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Ionicons name="walk-outline" size={14} color={colors.maroon} />
                    <Text style={{ color: colors.text, fontSize: 13, opacity: 0.8 }}>BuddyRunner</Text>
                </View>
            </View>

            {/* View Profile - Right */}
            <Text style={{ color: colors.maroon, fontWeight: "700", fontSize: 13 }}>View Profile &gt;</Text>
        </TouchableOpacity>
    );
}

/* ======================= STYLES (WEB) ======================= */
const web = StyleSheet.create({
    sidebar: { borderRightColor: "#EDE9E8", borderRightWidth: 1, backgroundColor: "#fff" },
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
    },
    brand: { color: colors.text, fontWeight: "800", fontSize: 16 },
    sideMenuBtn: {
        height: 30,
        width: 30,
        borderRadius: 8,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: colors.faint,
        marginRight: 8,
    },
    sideItem: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 14, paddingHorizontal: 16 },
    sideItemCollapsed: { justifyContent: "center", paddingHorizontal: 0, gap: 0, height: 56 },
    sideItemText: { color: colors.text, fontSize: 14, fontWeight: "600" },

    mainArea: { flex: 1, backgroundColor: "#fff" },
    topBar: { height: 90, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: 1, borderBottomColor: "#EDE9E8", paddingHorizontal: 16 },
    welcome: { color: colors.text, fontSize: 18, fontWeight: "900" },

    tabsWrapper: { paddingHorizontal: 16, paddingVertical: 12, alignItems: "center" },
    tabsContainer: { flexDirection: "row", backgroundColor: colors.maroon, borderRadius: 12, padding: 4, width: "100%" },
    tabItem: { flex: 1, paddingVertical: 11, borderRadius: 10, flexDirection: "row", alignItems: "center", justifyContent: "center" },
    tabItemActive: { backgroundColor: "#fff" },
    tabText: { fontSize: 15, fontWeight: "600", color: colors.pillText },
    tabTextActive: { color: colors.pillTextActive },

    container: { width: "100%", maxWidth: 1400, alignSelf: "center", paddingHorizontal: 8 },
    bigCardsRow: { flexDirection: "row", gap: 22, flexWrap: "wrap", marginBottom: 22 },
    bigCard: { 
        flex: 1, 
        minWidth: 360, 
        height: 200, 
        borderRadius: 12, 
        padding: 22, 
        justifyContent: "center", 
        alignItems: "center",
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.1,
        shadowRadius: 10,
        elevation: 3,
    },
    bigCardMobile: { minWidth: "auto", width: "100%", height: 80, flexDirection: "row", padding: 16, justifyContent: "flex-start" },
    bigCardMobileFilled: { minWidth: "auto", width: "100%", height: "auto", minHeight: 200, padding: 32, marginBottom: 16 },

    sectionTitle: { color: colors.text, fontWeight: "900", fontSize: 16, marginBottom: 10 },

    filterRow: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 16 },
    filterChip: { borderWidth: 1, borderColor: colors.maroon, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: "#fff" },
    filterChipActive: { backgroundColor: colors.maroon },
    filterText: { fontSize: 13, fontWeight: "700", color: colors.maroon },
    filterTextActive: { color: "#fff" },

    runnerRow: {
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 12,
        paddingVertical: 12,
        paddingHorizontal: 16,
        backgroundColor: "#fff",
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
        elevation: 1,
    },
    runnerAvatar: {
        width: 50,
        height: 50,
        borderRadius: 25,
        backgroundColor: colors.faint,
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
    },
    runnerAvatarImage: {
        width: 50,
        height: 50,
        borderRadius: 25,
    },
    onlineIndicator: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: "#22c55e",
    },
    errandRow: {
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 12,
        paddingVertical: 10,
        paddingHorizontal: 14,
        backgroundColor: "#fff",
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
    },
    commRow: {
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 12,
        paddingVertical: 12,
        paddingHorizontal: 16,
        backgroundColor: "#fff",
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
        elevation: 1,
    },

    sidebarFooter: { padding: 12, gap: 10 },
    userCard: { backgroundColor: colors.faint, borderRadius: 10, padding: 10, flexDirection: "row", alignItems: "center", gap: 10 },
    userAvatar: { width: 34, height: 34, borderRadius: 999, backgroundColor: "#fff", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border },
    userName: { color: colors.text, fontSize: 12, fontWeight: "800" },
    userRole: { color: colors.text, fontSize: 10, opacity: 0.7 },

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
    logoutText: { color: colors.maroon, fontWeight: "700" },

    pill: { backgroundColor: colors.maroon, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, alignSelf: "flex-start" },
    pillText: { color: "#fff", fontSize: 11, fontWeight: "800" },
    pillSmall: { backgroundColor: colors.maroon, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, alignSelf: "flex-start" },
    pillSmallText: { color: "#fff", fontSize: 11, fontWeight: "800" },
});

/* ============================= MOBILE LAYOUT ============================ */
function HomeMobile() {
    const router = useRouter();
    const isWeb = Platform.OS === "web";
    const { loading, criticalLoading, firstName, fullName } = useAuthProfile();
    const insets = useSafeAreaInsets();
    const [activeTab, setActiveTab] = React.useState<"Errands" | "Commissions">("Errands");

    // Initialize caller logger for mobile
    // Call it whenever fullName changes, even if initially undefined
    // This ensures the logger is updated once fullName becomes available
    React.useEffect(() => {
        initCallerLogger(fullName);
    }, [fullName]);

    const { initialLoading, rows: errands, runnerNameMap, refetch } = useMyErrands();
    const { initialLoading: runnersLoading, rows: runners, refetch: refetchRunners } = useAvailableRunners();

    // Non-critical loading: data queries (errands, runners) - does NOT block screen render
    // Currently kept for backward compatibility, will be used to unblock in next step
    const dataLoading = initialLoading || runnersLoading;

    // Convert runners to commissioners format for filtering
    const commissioners = React.useMemo(() => {
        if (!runners || runners.length === 0) return [];
        return runners.map(runner => ({
            id: runner.id,
            name: `${titleCase(runner.first_name || "")} ${titleCase(runner.last_name || "")}`.trim() || "BuddyRunner",
            category: "Logos" as const, // Default category, could be enhanced later
            rating: 5.0, // Default rating, could be enhanced later
            profile_picture_url: runner.profile_picture_url,
            is_available: runner.is_available,
            status: "Online" as const // Add online status like runner cards
        }));
    }, [runners]);

    const filtered = React.useMemo(
        () => commissioners,
        [commissioners]
    );

    const scrollBottomPad = (insets.bottom || 0) + 100;

    // refetch on focus for mobile too (silent)
    useFocusEffect(
        React.useCallback(() => {
            refetch({ silent: true });
            refetchRunners({ silent: true });
        }, [refetch, refetchRunners])
    );

    // Clean up old redirects on app start
    React.useEffect(() => {
        cleanupOldRedirects();
    }, []);

    // NOTE: Timeout enforcement removed from client - handled by backend cron + Edge Function only

    // Monitor commission acceptance and redirect to chat
    React.useEffect(() => {
        const setupCommissionMonitoring = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            logCaller('Commission monitor: Setting up realtime subscription');

            const channel = supabase
                .channel(`commission_acceptance_mobile_${user.id}`)
                .on(
                    "postgres_changes",
                    {
                        event: "UPDATE",
                        schema: "public",
                        table: "commission",
                        filter: `buddycaller_id=eq.${user.id}`
                    },
                    async (payload) => {
                        logCaller('Commission monitor: Real-time update received', {
                            commissionId: payload.new?.id,
                            status: payload.new?.status,
                            oldStatus: payload.old?.status
                        });
                        await handleCommissionUpdate(payload.new, payload.old, user.id, router);
                    }
                )
                .subscribe((status) => {
                    logCaller(`Commission monitor: Subscription ${status === 'SUBSCRIBED' ? 'SUBSCRIBED' : status === 'CHANNEL_ERROR' ? 'ERROR' : 'UNSUBSCRIBED'}`);
                });

            // Set up polling as fallback (check every 3 seconds)
            const pollInterval = setInterval(async () => {
                try {
                    // Only check commissions accepted in the last 5 minutes
                    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

                    const { data: commissions, error } = await supabase
                        .from("commission")
                        .select("*")
                        .eq("buddycaller_id", user.id)
                        .eq("status", "in_progress")
                        .gte("accepted_at", fiveMinutesAgo); // Only recently accepted

                    if (error) {
                        // Use warn instead of error for expected polling failures (network issues, etc.)
                        const errorMsg = error instanceof Error 
                            ? error.message 
                            : (error && typeof error === 'object' && 'message' in error
                                ? (error as { message?: string; details?: string; hint?: string }).message || 
                                  (error as { message?: string; details?: string; hint?: string }).details || 
                                  (error as { message?: string; details?: string; hint?: string }).hint || 
                                  JSON.stringify(error) || 
                                  String(error)
                                : String(error));
                        logCallerWarn("Commission monitor: Polling error", errorMsg);
                        return;
                    }

                    if (commissions && commissions.length > 0) {
                        // Check each commission for redirect guard
                        for (const commission of commissions) {
                            const hasBeenRedirected = await hasCommissionBeenRedirected(String(commission.id));
                            if (!hasBeenRedirected) {
                                logCaller(`Commission monitor: Polling found unprocessed commission: ${commission.id}`);
                                await handleCommissionUpdate(commission, { status: "pending" }, user.id, router);
                                break; // Only process one commission per polling cycle
                            }
                            // Note: Excluding "already redirected" log to reduce noise
                        }
                    }
                } catch (error) {
                    // Use warn instead of error for expected polling failures (network issues, etc.)
                    const errorMsg = error instanceof Error 
                        ? error.message 
                        : (error && typeof error === 'object' && ('message' in error || 'details' in error || 'hint' in error)
                            ? ((error as { message?: string; details?: string; hint?: string }).message || 
                               (error as { message?: string; details?: string; hint?: string }).details || 
                               (error as { message?: string; details?: string; hint?: string }).hint || 
                               JSON.stringify(error))
                            : String(error));
                    logCallerWarn("Commission monitor: Polling error", errorMsg);
                }
            }, 3000);

            // NOTE: Timeout enforcement (notified_expires_at) is handled by backend cron + Edge Function only
            // Client no longer polls for timeouts - backend is single source of truth

            // Also monitor on commission updates - specifically when notified_runner_id becomes NULL
            const timeoutCheckChannel = supabase
                .channel(`commission_timeout_check_mobile_${user.id}`)
                .on(
                    "postgres_changes",
                    {
                        event: "UPDATE",
                        schema: "public",
                        table: "commission",
                        filter: `buddycaller_id=eq.${user.id}`
                    },
                    async (payload) => {
                        const oldData = payload.old as any;
                        const newData = payload.new as any;
                        
                        // Check if notified_runner_id changed from non-null to null
                        // This indicates clear_commission_notification was called
                        if (oldData?.notified_runner_id && !newData?.notified_runner_id) {
                            logCaller(`Timeout monitor: notified_runner_id cleared for commission ${newData.id}, checking immediately`);
                            // Check this specific commission immediately
                            await monitorCommissionsForTimeout(user.id, newData.id);
                        } else {
                            // Also do a general check for other commissions
                            monitorCommissionsForTimeout(user.id);
                        }
                    }
                )
                .subscribe();

            // Also monitor on errand updates - specifically when notified_runner_id becomes NULL
            const errandTimeoutCheckChannel = supabase
                .channel(`errand_timeout_check_mobile_${user.id}`)
                .on(
                    "postgres_changes",
                    {
                        event: "UPDATE",
                        schema: "public",
                        table: "errand",
                        filter: `buddycaller_id=eq.${user.id}`
                    },
                    async (payload) => {
                        const oldData = payload.old as any;
                        const newData = payload.new as any;
                        
                        // Check if notified_runner_id changed from non-null to null
                        // This indicates clear_errand_notification was called
                        if (oldData?.notified_runner_id && !newData?.notified_runner_id) {
                            logCaller(`Timeout monitor: notified_runner_id cleared for errand ${newData.id}, checking immediately`);
                            // Check this specific errand immediately
                            await monitorErrandsForTimeout(user.id, newData.id);
                        } else {
                            // Also do a general check for other errands
                            monitorErrandsForTimeout(user.id);
                        }
                    }
                )
                .subscribe();

            return () => {
                logCaller('Commission monitor: Cleaning up subscription and polling');
                supabase.removeChannel(channel);
                supabase.removeChannel(timeoutCheckChannel);
                supabase.removeChannel(errandTimeoutCheckChannel);
                clearInterval(pollInterval);
            };
        };

        const cleanup = setupCommissionMonitoring();
        return () => {
            cleanup.then(cleanupFn => cleanupFn?.());
        };
    }, [router]);

    // Monitor errand acceptance and redirect to map
    React.useEffect(() => {
        const setupErrandMonitoring = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            logCaller('Errand monitor: Setting up realtime subscription');

            const channel = supabase
                .channel(`errand_acceptance_mobile_${user.id}`)
                .on(
                    "postgres_changes",
                    {
                        event: "UPDATE",
                        schema: "public",
                        table: "errand",
                        filter: `buddycaller_id=eq.${user.id}`
                    },
                    async (payload) => {
                        logCaller('Errand monitor: Real-time update received', {
                            errandId: payload.new?.id,
                            status: payload.new?.status,
                            oldStatus: payload.old?.status
                        });
                        await handleErrandUpdate(payload.new, payload.old, user.id, router);
                    }
                )
                .subscribe((status) => {
                    logCaller(`Errand monitor: Subscription ${status === 'SUBSCRIBED' ? 'SUBSCRIBED' : status === 'CHANNEL_ERROR' ? 'ERROR' : 'UNSUBSCRIBED'}`);
                });

            // Set up polling as fallback (check every 3 seconds)
            const pollInterval = setInterval(async () => {
                try {
                    // Only check errands accepted in the last 5 minutes
                    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

                    const { data: errands, error } = await supabase
                        .from("errand")
                        .select("*")
                        .eq("buddycaller_id", user.id)
                        .eq("status", "in_progress")
                        .gte("accepted_at", fiveMinutesAgo); // Only recently accepted

                    if (error) {
                        // Use warn instead of error for expected polling failures (network issues, etc.)
                        const errorMsg = error instanceof Error 
                            ? error.message 
                            : (error && typeof error === 'object' && 'message' in error
                                ? (error as { message?: string; details?: string; hint?: string }).message || 
                                  (error as { message?: string; details?: string; hint?: string }).details || 
                                  (error as { message?: string; details?: string; hint?: string }).hint || 
                                  JSON.stringify(error) || 
                                  String(error)
                                : String(error));
                        logCallerWarn("Errand monitor: Polling error", errorMsg);
                        return;
                    }

                    if (errands && errands.length > 0) {
                        // Check each errand for redirect guard
                        for (const errand of errands) {
                            const hasBeenRedirected = await hasErrandBeenRedirected(String(errand.id));
                            if (!hasBeenRedirected) {
                                logCaller(`Errand monitor: Polling found unprocessed errand: ${errand.id}`);
                                await handleErrandUpdate(errand, { status: "pending" }, user.id, router);
                                break; // Only process one errand per polling cycle
                            }
                            // Note: Excluding "already redirected" log to reduce noise
                        }
                    }
                } catch (error) {
                    // Use warn instead of error for expected polling failures (network issues, etc.)
                    const errorMsg = error instanceof Error 
                        ? error.message 
                        : (error && typeof error === 'object' && ('message' in error || 'details' in error || 'hint' in error)
                            ? ((error as { message?: string; details?: string; hint?: string }).message || 
                               (error as { message?: string; details?: string; hint?: string }).details || 
                               (error as { message?: string; details?: string; hint?: string }).hint || 
                               JSON.stringify(error))
                            : String(error));
                    logCallerWarn("Errand monitor: Polling error", errorMsg);
                }
            }, 3000);

            return () => {
                logCaller('Errand monitor: Cleaning up subscription and polling');
                supabase.removeChannel(channel);
                clearInterval(pollInterval);
            };
        };

        const cleanup = setupErrandMonitoring();
        return () => {
            cleanup.then(cleanupFn => cleanupFn?.());
        };
    }, [router]);

    // Monitor for timeout-based cancellations (row-based modal trigger) - Mobile
    React.useEffect(() => {
        const setupCancellationMonitoring = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            logCaller(`Cancellation monitor (mobile): Setting up row-based cancellation monitoring for user: ${user.id.substring(0, 8)}`);

            // Track handled task IDs to prevent duplicate modals
            const handledTaskIds = new Set<string>();

            // Monitor errand cancellations
            const errandCancellationChannel = supabase
                .channel(`errand_cancellation_mobile_${user.id}`)
                .on(
                    'postgres_changes',
                    {
                        event: 'UPDATE',
                        schema: 'public',
                        table: 'errand',
                        filter: `buddycaller_id=eq.${user.id}`
                    },
                    (payload) => {
                        const oldData = payload.old as any;
                        const newData = payload.new as any;
                        const taskId = String(newData?.id || '');

                        // DEBUG: Log all realtime events
                        console.log('[CANCELLATION MONITOR MOBILE] Errand update received:', {
                            taskId,
                            oldStatus: oldData?.status,
                            newStatus: newData?.status,
                            oldRunnerId: oldData?.runner_id,
                            newRunnerId: newData?.runner_id,
                            oldNotifiedRunnerId: oldData?.notified_runner_id,
                            newNotifiedRunnerId: newData?.notified_runner_id,
                            timeoutRunnerIds: newData?.timeout_runner_ids,
                            timeoutRunnerIdsLength: Array.isArray(newData?.timeout_runner_ids) ? newData.timeout_runner_ids.length : 0,
                            alreadyHandled: handledTaskIds.has(taskId)
                        });

                        // Check all conditions for timeout-based cancellation
                        const condition1 = newData?.status === 'cancelled';
                        const condition2 = oldData?.status === 'pending';
                        const condition3 = newData?.runner_id === null;
                        const condition4 = newData?.notified_runner_id === null;
                        const condition5 = Array.isArray(newData?.timeout_runner_ids) && newData.timeout_runner_ids.length > 0;
                        const condition6 = oldData?.notified_runner_id !== null;
                        const condition7 = !handledTaskIds.has(taskId);

                        console.log('[CANCELLATION MONITOR MOBILE] Condition check:', {
                            condition1,
                            condition2,
                            condition3,
                            condition4,
                            condition5,
                            condition6,
                            condition7,
                            allConditionsMet: condition1 && condition2 && condition3 && condition4 && condition5 && condition6 && condition7
                        });

                        if (condition1 && condition2 && condition3 && condition4 && condition5 && condition6 && condition7) {
                            handledTaskIds.add(taskId);
                            console.log('[CANCELLATION MONITOR MOBILE] ✅ ALL CONDITIONS MET - Triggering modal for errand', taskId);
                            logCaller(`Cancellation monitor (mobile): ✅ Triggering modal for cancelled errand ${taskId}`);
                            
                            noRunnersAvailableService.notify({
                                type: 'errand',
                                errandId: Number(taskId),
                                errandTitle: newData.title || 'Untitled Errand'
                            });

                            // Clean up handled ID after 5 seconds to allow re-trigger if needed
                            setTimeout(() => {
                                handledTaskIds.delete(taskId);
                                console.log('[CANCELLATION MONITOR MOBILE] Cleared handled ID for errand', taskId);
                            }, 5000);
                        } else {
                            console.log('[CANCELLATION MONITOR MOBILE] Conditions not met, skipping modal trigger');
                        }
                    }
                )
                .subscribe((status) => {
                    logCaller(`Cancellation monitor (mobile): Errand subscription status: ${status}`);
                });

            // Monitor commission cancellations
            const commissionCancellationChannel = supabase
                .channel(`commission_cancellation_mobile_${user.id}`)
                .on(
                    'postgres_changes',
                    {
                        event: 'UPDATE',
                        schema: 'public',
                        table: 'commission',
                        filter: `buddycaller_id=eq.${user.id}`
                    },
                    (payload) => {
                        const oldData = payload.old as any;
                        const newData = payload.new as any;
                        const taskId = String(newData?.id || '');

                        // DEBUG: Log all realtime events
                        console.log('[CANCELLATION MONITOR MOBILE] Commission update received:', {
                            taskId,
                            oldStatus: oldData?.status,
                            newStatus: newData?.status,
                            oldRunnerId: oldData?.runner_id,
                            newRunnerId: newData?.runner_id,
                            oldNotifiedRunnerId: oldData?.notified_runner_id,
                            newNotifiedRunnerId: newData?.notified_runner_id,
                            timeoutRunnerIds: newData?.timeout_runner_ids,
                            timeoutRunnerIdsLength: Array.isArray(newData?.timeout_runner_ids) ? newData.timeout_runner_ids.length : 0,
                            alreadyHandled: handledTaskIds.has(taskId)
                        });

                        // Check all conditions for timeout-based cancellation
                        const condition1 = newData?.status === 'cancelled';
                        const condition2 = oldData?.status === 'pending';
                        const condition3 = newData?.runner_id === null;
                        const condition4 = newData?.notified_runner_id === null;
                        const condition5 = Array.isArray(newData?.timeout_runner_ids) && newData.timeout_runner_ids.length > 0;
                        const condition6 = oldData?.notified_runner_id !== null;
                        const condition7 = !handledTaskIds.has(taskId);

                        console.log('[CANCELLATION MONITOR MOBILE] Condition check:', {
                            condition1,
                            condition2,
                            condition3,
                            condition4,
                            condition5,
                            condition6,
                            condition7,
                            allConditionsMet: condition1 && condition2 && condition3 && condition4 && condition5 && condition6 && condition7
                        });

                        if (condition1 && condition2 && condition3 && condition4 && condition5 && condition6 && condition7) {
                            handledTaskIds.add(taskId);
                            console.log('[CANCELLATION MONITOR MOBILE] ✅ ALL CONDITIONS MET - Triggering modal for commission', taskId);
                            logCaller(`Cancellation monitor (mobile): ✅ Triggering modal for cancelled commission ${taskId}`);
                            
                            noRunnersAvailableService.notify({
                                type: 'commission',
                                commissionId: Number(taskId),
                                commissionTitle: newData.title || 'Untitled Commission'
                            });

                            // Clean up handled ID after 5 seconds to allow re-trigger if needed
                            setTimeout(() => {
                                handledTaskIds.delete(taskId);
                                console.log('[CANCELLATION MONITOR MOBILE] Cleared handled ID for commission', taskId);
                            }, 5000);
                        } else {
                            console.log('[CANCELLATION MONITOR MOBILE] Conditions not met, skipping modal trigger');
                        }
                    }
                )
                .subscribe((status) => {
                    logCaller(`Cancellation monitor (mobile): Commission subscription status: ${status}`);
                });

            return () => {
                logCaller("Cancellation monitor (mobile): Cleaning up subscriptions");
                supabase.removeChannel(errandCancellationChannel);
                supabase.removeChannel(commissionCancellationChannel);
            };
        };

        const cleanup = setupCancellationMonitoring();
        return () => {
            cleanup.then(cleanupFn => cleanupFn?.());
        };
    }, [router]);

    return (
        <SAView edges={["top", "bottom"]} style={{ flex: 1, backgroundColor: "#fff" }}>
            {!isWeb && <Stack.Screen options={{ animation: "none" }} />}
            <NoRunnersAvailableModal />

            <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 10 }}>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                        <Image source={require("../../assets/images/logo.png")} style={{ width: 22, height: 22, resizeMode: "contain" }} />
                        <Text style={{ fontWeight: "900", color: colors.text, fontSize: 18 }}>GoBuddy</Text>
                    </View>
                    <TouchableOpacity onPress={() => router.push("/buddycaller/notification")} activeOpacity={0.9}>
                        <Ionicons name="notifications-outline" size={24} color={colors.text} />
                    </TouchableOpacity>
                </View>
            </View>

            <View style={{ paddingHorizontal: 16, marginBottom: 6 }}>
                <Text style={{ color: colors.text, fontWeight: "800", fontSize: 16 }}>
                    {loading ? "Loading…" : `Hi, ${firstName || "User"} 👋`}
            </Text>
                <Text style={{ color: colors.text, fontSize: 16, fontWeight: "400", marginTop: 4, marginBottom: 8 }}>
                    What do you need help with?
                </Text>
            </View>

            <View style={m.tabsWrap}>
                <View style={m.tabsTrack}>
                    <TouchableOpacity onPress={() => setActiveTab("Errands")} style={[m.tab, activeTab === "Errands" && m.tabActive]} activeOpacity={0.9}>
                        <Ionicons 
                            name="checkmark-circle-outline" 
                            size={18} 
                            color={activeTab === "Errands" ? colors.maroon : "#fff"} 
                            style={{ marginRight: 6 }}
                        />
                        <Text style={[m.tabText, activeTab === "Errands" && m.tabTextActive]}>Errands</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => setActiveTab("Commissions")} style={[m.tab, activeTab === "Commissions" && m.tabActive]} activeOpacity={0.9}>
                        <Ionicons 
                            name="person-outline" 
                            size={18} 
                            color={activeTab === "Commissions" ? colors.maroon : "#fff"} 
                            style={{ marginRight: 6 }}
                        />
                        <Text style={[m.tabText, activeTab === "Commissions" && m.tabTextActive]}>Commissions</Text>
                    </TouchableOpacity>
                </View>
            </View>

            <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 8, paddingBottom: scrollBottomPad }}>
                {activeTab === "Errands" ? (
                    <>
                        <View style={m.twoUp}>
                            <OutlineButton label="Post an Errand" icon="document-text-outline" onPress={() => router.push("/buddycaller/errand_form")} />
                            <OutlineButton 
                                label="My Requests" 
                                icon="document-text-outline" 
                                onPress={() => router.push("/buddycaller/my_request_errands")}
                            />
                        </View>

                        <Text style={{ color: colors.text, fontWeight: "900", fontSize: 17, marginBottom: 10 }}>Available Runners</Text>

                        {runnersLoading ? (
                            <Text style={{ color: colors.text, opacity: 0.7 }}>Loading…</Text>
                        ) : runners.length === 0 ? (
                            <View style={m.noRunnersCard}>
                                <View style={m.noRunnersIconContainer}>
                                    <Ionicons name="footsteps-outline" size={48} color={colors.maroon} />
                                </View>
                                <Text style={m.noRunnersTitle}>No runners available right now</Text>
                                <Text style={m.noRunnersDescription}>
                                    Check back in a few minutes or post an errand to notify runners.
                                </Text>
                            </View>
                        ) : (
                            <View style={{ gap: 10 }}>
                                {runners.map((r) => (
                                    <RunnerCardMobile
                                        key={r.id}
                                        data={{
                                            id: r.id,
                                            name: `${titleCase(r.first_name || "")} ${titleCase(r.last_name || "")}`.trim() || "BuddyRunner",
                                            status: "Online" as const,
                                            role: r.role || "buddyrunner",
                                            profile_picture_url: r.profile_picture_url || undefined,
                                        }}
                                    />
                                ))}
                            </View>
                        )}
                    </>
                ) : (
                    <>
                        <View style={m.twoUp}>
                            <OutlineButton label="Request Commission" icon="document-text-outline" onPress={() => router.push("/buddycaller/commission_form")} />
                            <OutlineButton 
                                label="My Requests" 
                                icon="document-text-outline" 
                                onPress={() => router.push("/buddycaller/my_request_commission")}
                            />
                        </View>

                        <Text style={{ color: colors.text, fontWeight: "900", fontSize: 17, marginBottom: 10 }}>Available Runners</Text>

                        {runnersLoading ? (
                            <Text style={{ color: colors.text, opacity: 0.7 }}>Loading…</Text>
                        ) : filtered.length === 0 ? (
                            <View style={m.noRunnersCard}>
                                <View style={m.noRunnersIconContainer}>
                                    <Ionicons name="footsteps-outline" size={48} color={colors.maroon} />
                                </View>
                                <Text style={m.noRunnersTitle}>No runners available right now</Text>
                                <Text style={m.noRunnersDescription}>
                                    Check back in a few minutes or post an errand to notify runners.
                                </Text>
                            </View>
                        ) : (
                            <View style={{ gap: 10 }}>
                                {filtered.map((c) => (
                                    <CommissionerCardMobile key={c.id} c={c} />
                                ))}
                            </View>
                        )}
                    </>
                )}
            </ScrollView>

            <MobileBottomBar
                onHome={() => router.replace("/buddycaller/home")}
                onMessages={() => router.replace("/buddycaller/messages_list")}
                onProfile={() => router.replace("/buddycaller/profile")}
            />
        </SAView>
    );
}

/* ---- Mobile bottom nav ---- */
function MobileBottomBar({
    onHome,
    onMessages,
    onProfile,
}: {
    onHome: () => void;
    onMessages: () => void;
    onProfile: () => void;
}) {
    const insets = useSafeAreaInsets();
    return (
        <View style={[m.bottomBar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
            <TouchableOpacity style={m.bottomItem} onPress={onHome} activeOpacity={0.9}>
                <Ionicons name="home" size={22} color="#fff" />
                <Text style={m.bottomText}>Home</Text>
            </TouchableOpacity>
            <TouchableOpacity style={m.bottomItem} onPress={onMessages} activeOpacity={0.9}>
                <Ionicons name="chatbubbles" size={22} color="#fff" />
                <Text style={m.bottomText}>Messages</Text>
            </TouchableOpacity>
            <TouchableOpacity style={m.bottomItem} onPress={onProfile} activeOpacity={0.9}>
                <Ionicons name="person" size={22} color="#fff" />
                <Text style={m.bottomText}>Profile</Text>
            </TouchableOpacity>
            <SAView edges={["bottom"]} style={{ position: "absolute", bottom: 0, left: 0, right: 0, backgroundColor: colors.maroon }} />
        </View>
    );
}

/* Mobile helpers */
function OutlineButton({ label, icon, onPress }: { label: string; icon: any; onPress?: () => void }) {
    return (
        <TouchableOpacity
            activeOpacity={0.9}
            onPress={onPress}
            style={{ flex: 1, borderWidth: 1, borderColor: colors.maroon, borderRadius: 12, paddingVertical: 14, alignItems: "center", gap: 6, backgroundColor: "#fff" }}
        >
            <Ionicons name={icon} size={22} color={colors.maroon} />
            <Text style={{ color: colors.text, fontWeight: "700", fontSize: 12, textAlign: "center" }}>{label}</Text>
        </TouchableOpacity>
    );
}
function RunnerCardMobile({ data }: { data: Runner }) {
    const router = useRouter();
    const { width } = useWindowDimensions();
    const isWeb = Platform.OS === "web" || width >= 900; // detect platform

    return (
        <TouchableOpacity
            style={m.runnerCard}
            onPress={() => {
                // Use the same route for both web and mobile, let the component handle the differences
                router.push({
                    pathname: "/buddyrunner/profile",
                    params: { 
                        userId: data.id, 
                        isViewingOtherUser: 'true', 
                        returnTo: isWeb ? '/buddycaller/home' : 'BuddyCallerHome' 
                    },
                });
            }}
        >
            {/* Profile Picture - Left */}
            <View style={m.runnerAvatar}>
                {data.profile_picture_url ? (
                    <Image 
                        source={{ uri: data.profile_picture_url }} 
                        style={m.runnerAvatarImage}
                    />
                ) : (
                    <Ionicons name="person" size={24} color={colors.border} />
                )}
            </View>

            {/* Center Section - Name, Status, Role */}
            <View style={{ flex: 1, marginLeft: 12, gap: 6 }}>
                <Text style={{ fontWeight: "800", color: colors.text, fontSize: 14 }}>{data.name}</Text>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <View style={m.onlineIndicator} />
                    <Text style={{ color: colors.text, fontSize: 13, opacity: 0.8 }}>Online</Text>
            </View>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Ionicons name="walk-outline" size={14} color={colors.maroon} />
                    <Text style={{ color: colors.text, fontSize: 13, opacity: 0.8 }}>BuddyRunner</Text>
            </View>
            </View>

            {/* View Profile - Right */}
            <Text style={{ color: colors.maroon, fontWeight: "700", fontSize: 13 }}>View Profile &gt;</Text>
        </TouchableOpacity>
    );
}

function ErrandCardMobile({ data }: { data: Errand }) {
    const router = useRouter();
    const isWeb = Platform.OS === "web"; // detect platform

    return (
        <TouchableOpacity
            style={{
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 12,
                padding: 10,
                backgroundColor: "#fff",
            }}
            onPress={() =>
                isWeb
                    ? router.push(`/buddycaller/view_errand_web?id=${data.id}`) // web
                    : router.push({
                        pathname: "/buddycaller/view_errand", // mobile
                        params: { id: data.id },
                    })
            }
        >
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                <Text style={{ fontWeight: "900", color: colors.text, fontSize: 14 }}>{data.title}</Text>
                <Text style={{ color: colors.maroon, fontWeight: "700", fontSize: 12 }}>View &gt;</Text>
            </View>
            <View style={{ backgroundColor: colors.maroon, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, alignSelf: "flex-start" }}>
                <Text style={{ color: "#fff", fontWeight: "800", fontSize: 11 }}>{data.status}</Text>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6 }}>
                <Ionicons name="walk-outline" size={12} color={colors.maroon} />
                <Text style={{ color: colors.text, fontSize: 11 }}>{data.requester}</Text>
            </View>
        </TouchableOpacity>
    );
}

function CommissionerCardMobile({ c }: { c: Commissioner }) {
    const router = useRouter();
    const { width } = useWindowDimensions();
    const isWeb = Platform.OS === "web" || width >= 900; // detect platform

    return (
        <TouchableOpacity 
            style={m.runnerCard}
            onPress={() => {
                // Use the same route for both web and mobile, let the component handle the differences
                router.push({
                    pathname: "/buddyrunner/profile",
                    params: { 
                        userId: c.id, 
                        isViewingOtherUser: 'true', 
                        returnTo: isWeb ? '/buddycaller/home' : 'BuddyCallerHome' 
                    },
                });
            }}
        >
            {/* Profile Picture - Left */}
            <View style={m.runnerAvatar}>
                {c.profile_picture_url ? (
                    <Image 
                        source={{ uri: c.profile_picture_url }} 
                        style={m.runnerAvatarImage}
                    />
                ) : (
                    <Ionicons name="person" size={24} color={colors.border} />
                )}
            </View>

            {/* Center Section - Name, Status, Role */}
            <View style={{ flex: 1, marginLeft: 12, gap: 6 }}>
                <Text style={{ fontWeight: "800", color: colors.text, fontSize: 14 }}>{c.name}</Text>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <View style={m.onlineIndicator} />
                    <Text style={{ color: colors.text, fontSize: 13, opacity: 0.8 }}>Online</Text>
            </View>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Ionicons name="walk-outline" size={14} color={colors.maroon} />
                    <Text style={{ color: colors.text, fontSize: 13, opacity: 0.8 }}>BuddyRunner</Text>
            </View>
            </View>

            {/* View Profile - Right */}
            <Text style={{ color: colors.maroon, fontWeight: "700", fontSize: 13 }}>View Profile &gt;</Text>
        </TouchableOpacity>
    );
}

/* --------- MOBILE styles --------- */
const m = StyleSheet.create({
    tabsWrap: { paddingHorizontal: 16, paddingBottom: 4 },
    tabsTrack: { flexDirection: "row", alignItems: "center", backgroundColor: colors.maroon, borderRadius: 14, padding: 6 },
    tab: { flex: 1, height: 42, borderRadius: 10, flexDirection: "row", alignItems: "center", justifyContent: "center" },
    tabActive: { backgroundColor: "#fff", borderWidth: 2, borderColor: colors.maroon, elevation: 2 },
    tabText: { fontSize: 15, fontWeight: "700", color: "#fff" },
    tabTextActive: { color: colors.text },

    twoUp: { flexDirection: "row", gap: 16, marginBottom: 18 },

    filterRow: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 16 },
    filterChip: { borderWidth: 1, borderColor: colors.maroon, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 18, backgroundColor: "#fff" },
    filterChipActive: { backgroundColor: colors.maroon },
    filterText: { fontSize: 13, fontWeight: "700", color: colors.maroon },
    filterTextActive: { color: "#fff" },

    noRunnersCard: {
        backgroundColor: '#fff',
        borderRadius: 12,
        padding: 32,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: colors.border,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.1,
        shadowRadius: 10,
        elevation: 3,
        marginBottom: 36,
    },
    noRunnersIconContainer: {
        marginBottom: 16,
    },
    noRunnersTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: colors.text,
        textAlign: 'center',
        marginBottom: 8,
    },
    noRunnersDescription: {
        fontSize: 14,
        color: colors.text,
        opacity: 0.7,
        textAlign: 'center',
        lineHeight: 20,
    },

    runnerCard: {
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 12,
        paddingVertical: 12,
        paddingHorizontal: 16,
        backgroundColor: "#fff",
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
        elevation: 1,
        marginBottom: 12,
    },
    runnerAvatar: {
        width: 50,
        height: 50,
        borderRadius: 25,
        backgroundColor: colors.faint,
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
    },
    runnerAvatarImage: {
        width: 50,
        height: 50,
        borderRadius: 25,
    },
    onlineIndicator: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: "#22c55e",
    },

    bottomBar: {
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: colors.maroon,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-around",
        paddingHorizontal: 16,
        paddingTop: 10,
    },
    bottomItem: { alignItems: "center", justifyContent: "center" },
    bottomText: { color: "#fff", fontSize: 12, marginTop: 4 },
});
