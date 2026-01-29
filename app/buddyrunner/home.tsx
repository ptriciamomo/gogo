import { Ionicons } from "@expo/vector-icons";
import { Stack, usePathname, useRouter } from "expo-router";
import React, { useState, useRef } from "react";
import {
    Alert,
    Image,
    InteractionManager,
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
import { supabase } from "../../lib/supabase";
import LocationService from "../../components/LocationService";
import LocationPromptModal from "../../components/LocationPromptModal";
import LocationPromptModalWeb from "../../components/LocationPromptModalWeb";
import { useNotificationBadge } from "./_layout";

/* ================= COLORS ================= */
const colors = {
    maroon: "#8B0000",
    light: "#FAF6F5",
    border: "#E5C8C5",
    text: "#531010",
    faint: "#F7F1F0",
};

/* ================ DB TYPES ================== */
type ErrandRowDB = {
    id: number;
    title: string | null;
    category: string | null;
    status: "pending" | "in_progress" | "completed" | "cancelled" | "delivered" | null;
    created_at: string;
    buddycaller_id: string | null;
    runner_id: string | null;
    notified_runner_id?: string | null;
    notified_at?: string | null;
    timeout_runner_ids?: string[] | null;
    pickup_status?: string | null;
    pickup_photo?: string | null;
    pickup_confirmed_at?: string | null;
};

type CommissionRowDB = {
    id: number;
    title: string | null;
    commission_type: string | null;
    created_at?: string | null;
    buddycaller_id?: string | null;
    status?: string | null;
    runner_id?: string | null;
    declined_runner_id?: string | null;
    notified_runner_id?: string | null;
    notified_at?: string | null;
    timeout_runner_ids?: string[] | null;
};

type UserRow = {
    id: string;
    first_name: string | null;
    last_name: string | null;
};

/* ================ UI TYPES ================== */
type UiStatus = "Pending" | "In Progress" | "Completed" | "Cancelled" | "Delivered";

type ErrandUI = {
    id: number;
    requester: string;
    title: string;
    category?: string;
    status: UiStatus;
    created_at: string;
};

type CommissionUI = {
    id: number;
    requester: string;
    commissionType: string;
    created_at?: string;
    rating?: number;
    title?: string;
};

/* ================ helpers ================== */
function titleCase(s?: string | null) {
    if (!s) return "";
    return s
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean)
        .map((w) => w[0].toUpperCase() + w.slice(1))
        .join(" ");
}

// Helper to format runner name with short ID for logging
function formatRunnerName(firstName: string | null, lastName: string | null, id: string): string {
    const name = `${titleCase(firstName || "")} ${titleCase(lastName || "")}`.trim() || "BuddyRunner";
    const shortId = id.substring(0, 8);
    return `${name} (id: ${shortId})`;
}

const prettyType = (s?: string | null) => {
    if (!s) return "General";
    return s
        .toString()
        .replace(/[_-]+/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase()
        .replace(/\b\w/g, (c) => c.toUpperCase());
};

// Helper function to parse comma-separated commission types
const parseCommissionTypes = (s?: string | null): string[] => {
    if (!s) return [];
    return s
        .split(',')
        .map(type => prettyType(type.trim()))
        .filter(type => type.length > 0);
};

type ProfileRow = {
    id: string;
    role: "buddyrunner" | "buddycaller" | string | null;
    first_name: string | null;
    last_name: string | null;
};

// Hook to calculate tab-specific rating (Errands or Commissions)
function useTabSpecificRating(tabType: "Errands" | "Commissions") {
    const [rating, setRating] = React.useState<number>(0.0);
    const [loading, setLoading] = React.useState<boolean>(true);

    React.useEffect(() => {
        const calculateRating = async () => {
            try {
                const { data: { user } } = await supabase.auth.getUser();
                if (!user) {
                    setLoading(false);
                    return;
                }

                // Build query based on tab type
                let query = supabase
                    .from('rate_and_feedback')
                    .select('rating')
                    .or(`buddycaller_id.eq.${user.id},buddyrunner_id.eq.${user.id}`)
                    .neq('rater_id', user.id);

                // Filter by errand_id for Errands tab, commission_id for Commissions tab
                // For Errands: only ratings with errand_id (exclude commission ratings)
                // For Commissions: only ratings with commission_id (exclude errand ratings)
                if (tabType === "Errands") {
                    query = query.not('errand_id', 'is', null).is('commission_id', null);
                } else {
                    query = query.not('commission_id', 'is', null).is('errand_id', null);
                }

                const { data: ratingsData, error } = await query;

                if (error) {
                    if (__DEV__) console.error(`Error fetching ${tabType} ratings:`, error);
                    setRating(0.0);
                    setLoading(false);
                    return;
                }

                if (ratingsData && ratingsData.length > 0) {
                    // Calculate weighted average where weight = rating value
                    // Formula: sum(rating²) / sum(rating)
                    const weightedSum = ratingsData.reduce((sum, r) => sum + (r.rating * r.rating), 0);
                    const totalWeight = ratingsData.reduce((sum, r) => sum + r.rating, 0);
                    
                    if (totalWeight > 0) {
                        const calculatedRating = Math.round((weightedSum / totalWeight) * 100) / 100;
                        setRating(calculatedRating);
                    } else {
                        setRating(0.0);
                    }
                } else {
                    setRating(0.0);
                }
            } catch (error) {
                if (__DEV__) console.error(`Error calculating ${tabType} rating:`, error);
                setRating(0.0);
            } finally {
                setLoading(false);
            }
        };

        calculateRating();
    }, [tabType]);

    return { rating, loading };
}

function useAuthProfile() {
    const router = useRouter();
    const [loading, setLoading] = React.useState(true);
    const [firstName, setFirstName] = React.useState<string>("User");
    const [fullName, setFullName] = React.useState<string>("User");
    const [roleLabel, setRoleLabel] = React.useState<string>("");
    const [averageRating, setAverageRating] = React.useState<number>(0.0);
    const [profilePictureUrl, setProfilePictureUrl] = React.useState<string | null>(null);

    async function fetchProfile() {
        try {
            const { data: userRes } = await supabase.auth.getUser();
            const user = userRes?.user;
            if (!user) return;

            const { data: row } = await supabase
                .from("users")
                .select("id, role, first_name, last_name, average_rating, is_blocked, is_settlement_blocked, id_image_approved, id_image_path, warning_count, created_at, profile_picture_url")
                .eq("id", user.id)
                .single<ProfileRow & { average_rating: number; is_blocked: boolean; is_settlement_blocked?: boolean | null; id_image_approved: boolean | null; id_image_path: string | null; warning_count: number; created_at: string; profile_picture_url: string | null }>();

            if (__DEV__) console.log('🔍 User profile data:', {
                userId: user.id,
                isBlocked: row?.is_blocked,
                isSettlementBlocked: row?.is_settlement_blocked,
                idImageApproved: row?.id_image_approved,
                warningCount: row?.warning_count,
                userName: `${row?.first_name} ${row?.last_name}`,
                timestamp: new Date().toISOString()
            });

            // Check if user is blocked (disciplinary or settlement-based)
            if (row?.is_blocked || row?.is_settlement_blocked) {
                if (__DEV__) console.log('🚨 BLOCKED USER DETECTED:', {
                    userId: user.id,
                    isBlocked: row.is_blocked,
                    userName: `${row.first_name} ${row.last_name}`,
                    timestamp: new Date().toISOString()
                });
                
                // Clear any cached data immediately (web only)
                if (Platform.OS === 'web') {
                    localStorage.clear();
                    sessionStorage.clear();
                    if (__DEV__) console.log('✅ Local storage cleared');
                }
                
                // Force redirect to login immediately (synchronous)
                if (__DEV__) console.log('🚀 Redirecting to login page...');
                if (Platform.OS === 'web') {
                    window.location.href = '/login';
                } else {
                    // For mobile, use router
                    router.replace('/login');
                }
                
                // Also try Supabase logout (but don't wait for it)
                supabase.auth.signOut().then(() => {
                    if (__DEV__) console.log('✅ Supabase logout completed');
                }).catch((error) => {
                    if (__DEV__) console.error('❌ Supabase logout error:', error);
                });
                
                return;
            }

            // SECURITY: Check ID approval status for non-admin users
            if (row && row.role !== 'admin') {
                if (row.id_image_path) {
                    if (row.id_image_approved === false || row.id_image_approved === null) {
                        if (__DEV__) console.log('🚨 ID NOT APPROVED - BLOCKING ACCESS:', {
                            userId: user.id,
                            idImageApproved: row.id_image_approved,
                            idImagePath: row.id_image_path ? 'exists' : 'missing',
                            timestamp: new Date().toISOString()
                        });
                        
                        // Clear any cached data immediately (web only)
                        if (Platform.OS === 'web') {
                            localStorage.clear();
                            sessionStorage.clear();
                        }
                        
                        // Force redirect to login immediately
                        if (Platform.OS === 'web') {
                            window.location.href = '/login';
                        } else {
                            router.replace('/login');
                        }
                        
                        // Also try Supabase logout (but don't wait for it)
                        supabase.auth.signOut().then(() => {
                            if (__DEV__) console.log('✅ Supabase logout completed');
                        }).catch((error) => {
                            if (__DEV__) console.error('❌ Supabase logout error:', error);
                        });
                        
                        return;
                    }
                } else {
                    // User hasn't uploaded ID - block access
                    if (__DEV__) console.log('🚨 NO ID IMAGE - BLOCKING ACCESS:', {
                        userId: user.id,
                        timestamp: new Date().toISOString()
                    });
                    
                    // Clear any cached data immediately (web only)
                    if (Platform.OS === 'web') {
                        localStorage.clear();
                        sessionStorage.clear();
                    }
                    
                    // Force redirect to login immediately
                    if (Platform.OS === 'web') {
                        window.location.href = '/login';
                    } else {
                        router.replace('/login');
                    }
                    
                    // Also try Supabase logout (but don't wait for it)
                    supabase.auth.signOut().then(() => {
                        if (__DEV__) console.log('✅ Supabase logout completed');
                    }).catch((error) => {
                        if (__DEV__) console.error('❌ Supabase logout error:', error);
                    });
                    
                    return;
                }
            }

            // Account locking is now handled by SQL functions based on overdue settlements
            // The is_blocked check above is sufficient - no need for additional settlement checks here

            if (__DEV__) console.log('✅ User authentication check passed:', {
                userId: user.id,
                isBlocked: row?.is_blocked || false,
                userName: `${row?.first_name} ${row?.last_name}`,
                timestamp: new Date().toISOString()
            });

            const f = titleCase(row?.first_name || "");
            const l = titleCase(row?.last_name || "");
            const finalFull = (f && l ? `${f} ${l}` : "").trim() || "User";
            let averageRating = row?.average_rating || 0.0;

            // If average_rating is 0 or null, try to calculate weighted average manually
            // This implements weighted statistical tool: sum(rating × weight) / sum(weight) where weight = rating
            if (averageRating === 0.0 || averageRating === null) {
                if (__DEV__) console.log('🔍 Average rating is 0, attempting manual weighted calculation...');
                try {
                    const { data: ratingsData } = await supabase
                        .from('rate_and_feedback')
                        .select('rating')
                        .or(`buddycaller_id.eq.${user.id},buddyrunner_id.eq.${user.id}`)
                        .neq('rater_id', user.id);

                    if (ratingsData && ratingsData.length > 0) {
                        // CALCULATIONS SA RATE AND FEEDBACK
                        // Calculate weighted average where weight = rating value
                        // Formula: sum(rating²) / sum(rating)
                        const weightedSum = ratingsData.reduce((sum, r) => sum + (r.rating * r.rating), 0);
                        const totalWeight = ratingsData.reduce((sum, r) => sum + r.rating, 0);
                        
                        if (totalWeight > 0) {
                            averageRating = Math.round((weightedSum / totalWeight) * 100) / 100;
                        } else {
                            averageRating = 0.0;
                        }
                        
                        if (__DEV__) console.log('🔍 Manual weighted calculation result:', {
                            ratingsCount: ratingsData.length,
                            weightedSum,
                            totalWeight,
                            calculatedAverage: averageRating
                        });
                    }
                } catch (error) {
                    if (__DEV__) console.error('🔍 Error in manual weighted calculation:', error);
                }
            }

            if (__DEV__) console.log('🔍 Profile fetch debug:', {
                userId: user.id,
                firstName: f,
                lastName: l,
                averageRating: averageRating,
                rawAverageRating: row?.average_rating
            });

            const newFirstName = f || finalFull.split(" ")[0] || "User";
            const roleRaw = (row?.role || "").toString().toLowerCase();
            const newRoleLabel = roleRaw === "buddyrunner" ? "BuddyRunner" : roleRaw === "buddycaller" ? "BuddyCaller" : "";

            setFirstName(newFirstName);
            setFullName(finalFull);
            setAverageRating(averageRating);
            setProfilePictureUrl(row?.profile_picture_url || null);
            setRoleLabel(newRoleLabel);

            // WEB CACHING: Cache the profile data (web only)
            if (Platform.OS === 'web') {
                const { setCachedData } = await import('../../utils/webCache');
                const cacheKey = `runner_profile_${user.id}`;
                setCachedData(cacheKey, {
                    firstName: newFirstName,
                    fullName: finalFull,
                    roleLabel: newRoleLabel,
                    averageRating: averageRating,
                    profilePictureUrl: row?.profile_picture_url || null,
                });
            }
            
            // Validate role and redirect if necessary (web version only)
            if (Platform.OS === 'web' && roleRaw === 'buddycaller') {
                if (__DEV__) console.log('Role mismatch detected: user is BuddyCaller but on BuddyRunner page, redirecting...');
                router.replace('/buddycaller/home');
                return;
            }
        } finally {
            setLoading(false);
        }
    }

    React.useEffect(() => {
        // WEB CACHING: Try to load profile from cache first
        if (Platform.OS === 'web') {
            (async () => {
                try {
                    const { data: userRes } = await supabase.auth.getUser();
                    const user = userRes?.user;
                    if (!user) {
                        fetchProfile();
                        return;
                    }

                    const { getCachedData, setCachedData } = await import('../../utils/webCache');
                    const cacheKey = `runner_profile_${user.id}`;
                    const cached = getCachedData<{
                        firstName: string;
                        fullName: string;
                        roleLabel: string;
                        averageRating: number;
                        profilePictureUrl: string | null;
                    }>(cacheKey);
                    
                    if (cached) {
                        // Use cached data immediately
                        setFirstName(cached.firstName);
                        setFullName(cached.fullName);
                        setRoleLabel(cached.roleLabel);
                        setAverageRating(cached.averageRating);
                        setProfilePictureUrl(cached.profilePictureUrl);
                        setLoading(false);
                        
                        // Fetch fresh data in background
                        fetchProfile();
                        return;
                    }
                } catch {
                    // Fall through to normal fetch
                }
            })();
        }
        
        fetchProfile();
        const { data: sub } = supabase.auth.onAuthStateChange((event) => {
            // Clear cache on logout (web only)
            if (Platform.OS === 'web' && (event === 'SIGNED_OUT' || event === 'TOKEN_REFRESHED')) {
                import('../../utils/webCache').then(({ clearAllCaches }) => {
                    clearAllCaches();
                });
            }
            fetchProfile();
        });
        return () => sub?.subscription?.unsubscribe?.();
    }, []);

    // Immediate blocked user check on component mount
    React.useEffect(() => {
        const checkBlockedUserImmediately = async () => {
            try {
                const { data: { user } } = await supabase.auth.getUser();
                if (!user) return;

                if (__DEV__) console.log('🔍 IMMEDIATE BLOCKED USER CHECK for:', user.id);
                
                const { data: userData } = await supabase
                    .from('users')
                    .select('id, first_name, last_name, is_blocked, warning_count')
                    .eq('id', user.id)
                    .single();

                if (__DEV__) console.log('🔍 IMMEDIATE CHECK RESULT:', userData);

                if (userData?.is_blocked) {
                    if (__DEV__) console.log('🚨 IMMEDIATE BLOCKED USER DETECTED:', {
                        userId: user.id,
                        userName: `${userData.first_name} ${userData.last_name}`,
                        isBlocked: userData.is_blocked,
                        warningCount: userData.warning_count,
                        timestamp: new Date().toISOString()
                    });
                    
                    // Clear any cached data immediately (web only)
                    if (Platform.OS === 'web') {
                        localStorage.clear();
                        sessionStorage.clear();
                        if (__DEV__) console.log('✅ Immediate local storage cleared');
                    }
                    
                    // Force redirect to login immediately (synchronous)
                    if (__DEV__) console.log('🚀 Immediate redirect to login page...');
                    if (Platform.OS === 'web') {
                        window.location.href = '/login';
                    } else {
                        // For mobile, use router
                        router.replace('/login');
                    }
                    
                    // Also try Supabase logout (but don't wait for it)
                    supabase.auth.signOut().then(() => {
                        if (__DEV__) console.log('✅ Immediate Supabase logout completed');
                    }).catch((error) => {
                        if (__DEV__) console.error('❌ Immediate Supabase logout error:', error);
                    });
                }
            } catch (error) {
                if (__DEV__) console.error('Error in immediate blocked user check:', error);
            }
        };

        checkBlockedUserImmediately();
    }, [router]);

    // Debug function to test blocking (remove in production)
    const testBlockUser = async () => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            if (__DEV__) console.log('🧪 Testing user blocking for:', user.id);
            
            // Manually set user as blocked for testing
            const { error } = await supabase
                .from('users')
                .update({ 
                    is_blocked: true, 
                    warning_count: 3,
                    blocked_at: new Date().toISOString()
                })
                .eq('id', user.id);

            if (error) {
                if (__DEV__) console.error('Error blocking user:', error);
            } else {
                if (__DEV__) console.log('✅ User blocked for testing. Refresh page to see logout.');
            }
        } catch (error) {
            if (__DEV__) console.error('Error in testBlockUser:', error);
        }
    };

    // Add test function to window for debugging
    if (typeof window !== 'undefined') {
        (window as any).testBlockUser = testBlockUser;
        (window as any).checkUserStatus = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;
            
            const { data: userData } = await supabase
                .from('users')
                .select('id, first_name, last_name, is_blocked, warning_count, blocked_at')
                .eq('id', user.id)
                .single();
            
            if (__DEV__) console.log('👤 Current user status:', userData);
            return userData;
        };
        (window as any).checkStephanieStatus = async () => {
            const stephanieId = '4344f7dd-05dd-44db-87e1-074c7adf945b';
            const { data: userData } = await supabase
                .from('users')
                .select('id, first_name, last_name, is_blocked, warning_count, blocked_at')
                .eq('id', stephanieId)
                .single();
            
            return userData;
        };
        (window as any).forceLogout = () => {
            if (__DEV__) console.log('🚨 FORCING LOGOUT...');
            
            // Clear any cached data immediately (web only)
            if (Platform.OS === 'web') {
                localStorage.clear();
                sessionStorage.clear();
                if (__DEV__) console.log('✅ Local storage cleared');
            }
            
            // Force redirect to login immediately (synchronous)
            if (__DEV__) console.log('🚀 Redirecting to login page...');
            if (Platform.OS === 'web') {
                window.location.href = '/login';
            } else {
                // For mobile, use router
                router.replace('/login');
            }
            
            // Also try Supabase logout (but don't wait for it)
            supabase.auth.signOut().then(() => {
                if (__DEV__) console.log('✅ Supabase logout completed');
            }).catch((error) => {
                if (__DEV__) console.error('❌ Supabase logout error:', error);
            });
            
            if (__DEV__) console.log('✅ LOGOUT INITIATED - REDIRECTING TO LOGIN');
        };
        (window as any).testBlockedUserRegistration = async () => {
            if (__DEV__) console.log('🧪 Testing blocked user registration prevention...');
            
            try {
                // Try to register with Stephanie's email (she's blocked)
                const testData = {
                    email: 'stephanie.delfin@example.com', // Stephanie's email
                    password: 'testpassword123',
                    firstName: 'Test',
                    lastName: 'User',
                    role: 'buddyrunner'
                };
                
                if (__DEV__) console.log('📧 Attempting registration with blocked email:', testData.email);
                
                // Import the registerUser function
                const { registerUser } = await import('../../utils/supabaseHelpers');
                
                const result = await registerUser(testData);
                if (__DEV__) console.log('❌ Registration should have failed but succeeded:', result);
                
            } catch (error: unknown) {
                if (error instanceof Error) {
                    if (__DEV__) console.log('✅ Registration correctly blocked:', error.message);
                } else {
                    if (__DEV__) console.log('✅ Registration correctly blocked:', error);
                }
                if (__DEV__) console.log('🎯 Blocked user registration prevention is working!');
            }
        };
        (window as any).testValidUserRegistration = async () => {
            if (__DEV__) console.log('🧪 Testing valid user registration...');
            
            try {
                // Try to register with a new email (not blocked)
                const testData = {
                    email: `test.user.${Date.now()}@example.com`, // Unique email
                    password: 'testpassword123',
                    firstName: 'Test',
                    lastName: 'User',
                    role: 'buddyrunner'
                };
                
                if (__DEV__) console.log('📧 Attempting registration with valid email:', testData.email);
                
                // Import the registerUser function
                const { registerUser } = await import('../../utils/supabaseHelpers');
                
                const result = await registerUser(testData);
                if (__DEV__) console.log('✅ Valid registration succeeded:', result);
                if (__DEV__) console.log('🎯 Valid user registration is working!');
                
            } catch (error: unknown) {
                if (error instanceof Error) {
                    if (__DEV__) console.log('❌ Valid registration failed:', error.message);
                } else {
                    if (__DEV__) console.log('❌ Valid registration failed:', error);
                }
            }
        };
        // Global test function that works from any page
        (window as any).testStephanieStatus = async () => {
            try {
                const { data: userData } = await supabase
                    .from('users')
                    .select('id, first_name, last_name, email, is_blocked, warning_count, blocked_at')
                    .eq('email', 's.delfin.535754@umindanao.edu.ph')
                    .single();
                
                return userData;
            } catch (error: unknown) {
                // Error handling without logging
            }
        };
    }

    return { loading, firstName, fullName, roleLabel, averageRating, profilePictureUrl };
}

function toUiStatus(s: ErrandRowDB["status"]): UiStatus {
    if (s === "in_progress") return "In Progress";
    if (s === "completed") return "Completed";
    if (s === "pending") return "Pending";
    if (s === "cancelled") return "Cancelled";
    if (s === "delivered") return "Delivered";
    return "Pending";
}

/* ===================== TF-IDF + COSINE SIMILARITY UTILITIES ===================== */

// TF-IDF STEP 1: Calculate Term Frequency (token-based)
function calculateTF(term: string, document: string[]): number {
    if (document.length === 0) return 0;
    // Count term occurrences in document
    const termCount = document.filter(word => word === term).length;
    // Divide by total terms to get frequency (0 to 1)
    return termCount / document.length;
}

// TF-IDF STEP 2: Calculate Term Frequency (task-based)
function calculateTFWithTaskCount(term: string, taskCategories: string[][], totalTasks: number): number {
    if (totalTasks === 0) return 0;
    // Count how many tasks contain this category
    const tasksWithCategory = taskCategories.filter(taskCats => 
        taskCats.some(cat => cat === term.toLowerCase())
    ).length;
    // Divide by total tasks to get frequency (0 to 1)
    return tasksWithCategory / totalTasks;
}

// TF-IDF STEP 3: Calculate Document Frequency (DF)
// TF-IDF STEP 4: Calculate Inverse Document Frequency (IDF) with adjustment
// TF-IDF STEP 7: Apply IDF smoothing (prevents zero IDF when term appears in all documents)
function calculateIDFAdjusted(term: string, allDocuments: string[][]): number {
    // STEP 3: Count documents containing term (Document Frequency)
    const documentsContainingTerm = allDocuments.filter(doc => doc.includes(term)).length;
    if (documentsContainingTerm === 0) return 0;
    
    // STEP 7: Apply smoothing - return 0.1 if term appears in all documents
    if (documentsContainingTerm === allDocuments.length) {
        return 0.1;
    }
    
    // STEP 4: Calculate IDF using natural logarithm
    return Math.log(allDocuments.length / documentsContainingTerm);
}

// TF-IDF STEP 8: Construct TF-IDF vector for query document
function calculateTFIDFVectorAdjusted(document: string[], allDocuments: string[][]): Map<string, number> {
    const uniqueTerms = Array.from(new Set(document));
    const tfidfMap = new Map<string, number>();
    
    uniqueTerms.forEach(term => {
        const tf = calculateTF(term, document);                    //  Get TF 
        const idf = calculateIDFAdjusted(term, allDocuments);      //  Get IDF
        // STEP 8: Multiply TF × IDF to compute TF-IDF weight
        tfidfMap.set(term, tf * idf);
    });
    
    return tfidfMap;
}

// TF-IDF STEP 9: Construct TF-IDF vector for runner document using task-based TF (preferred method)
function calculateTFIDFVectorWithTaskCount(taskCategories: string[][], totalTasks: number, allDocuments: string[][]): Map<string, number> {
    // Get all unique categories from all tasks
    const allTerms = new Set<string>();
    taskCategories.forEach(taskCats => {
        taskCats.forEach(cat => allTerms.add(cat.toLowerCase()));
    });
    
    const tfidfMap = new Map<string, number>();
    
    allTerms.forEach(term => {
        const tf = calculateTFWithTaskCount(term, taskCategories, totalTasks); // STEP 2: Get TF (task-based)
        const idf = calculateIDFAdjusted(term, allDocuments);                  // STEP 3 & 4: Get IDF
        // STEP 9: Multiply TF × IDF to compute TF-IDF weight
        tfidfMap.set(term, tf * idf);
    });
    
    return tfidfMap;
}

// TF-IDF STEP 12: Calculate dot product for cosine similarity
// TF-IDF STEP 13: Calculate vector magnitudes for cosine similarity
// TF-IDF STEP 14: Calculate final cosine similarity score
function cosineSimilarity(vector1: Map<string, number>, vector2: Map<string, number>): number {
    const allTerms = Array.from(new Set([...vector1.keys(), ...vector2.keys()]));
    
    let dotProduct = 0;
    let magnitude1 = 0;
    let magnitude2 = 0;
    
    // STEP 12 & 13: Calculate dot product and vector magnitudes
    allTerms.forEach(term => {
        const val1 = vector1.get(term) || 0;
        const val2 = vector2.get(term) || 0;
        
        dotProduct += val1 * val2;        // STEP 12: Dot product
        magnitude1 += val1 * val1;        // STEP 13: Sum of squares for vector 1
        magnitude2 += val2 * val2;        // STEP 13: Sum of squares for vector 2
    });
    
    // STEP 13: Calculate Euclidean magnitudes
    const denominator = Math.sqrt(magnitude1) * Math.sqrt(magnitude2);
    
    // Prevent division by zero
    if (denominator === 0) return 0;
    
    // STEP 14: Final cosine similarity: (v1 · v2) / (||v1|| × ||v2||)
    return dotProduct / denominator;
}

/**
 * Calculate TF-IDF + Cosine Similarity score between commission category and runner history
 */
function calculateTFIDFCosineSimilarity(commissionCategories: string[], runnerHistory: string[], runnerTaskCategories: string[][] = [], runnerTotalTasks: number = 0): number {
    // 1️⃣ Start of TF-IDF calculation
    console.log(`[TFIDF] ===== TF-IDF CALCULATION START =====`);
    
    if (commissionCategories.length === 0 || runnerHistory.length === 0) {
        console.log(`[TFIDF] Empty input - returning 0`);
        console.log(`[TFIDF] ===== TF-IDF CALCULATION END =====`);
        return 0;
    }
    
    // Convert commission categories to query document (lowercase for consistency)
    const queryDoc = commissionCategories.map(cat => cat.toLowerCase().trim()).filter(cat => cat.length > 0);
    
    // Convert runner history to document (lowercase for consistency)
    const runnerDoc = runnerHistory.map(cat => cat.toLowerCase().trim()).filter(cat => cat.length > 0);
    
    // 2️⃣ Task categories
    console.log(`[TFIDF] Task categories:`);
    queryDoc.forEach(cat => {
        console.log(`[TFIDF] - ${cat}`);
    });
    
    if (queryDoc.length === 0 || runnerDoc.length === 0) {
        console.log(`[TFIDF] Empty document after normalization - returning 0`);
        console.log(`[TFIDF] ===== TF-IDF CALCULATION END =====`);
        return 0;
    }
    
    // 3️⃣ Runner history categories (with task counts)
    // Count tasks per category (not category tokens)
    const runnerCategoryTaskCounts = new Map<string, number>();
    if (runnerTaskCategories.length > 0 && runnerTotalTasks > 0) {
        // Use task-based counting
        // Count tasks per category by iterating tasks, extracting unique categories per task, and incrementing count in map using +1
        runnerTaskCategories.forEach(taskCats => {
            const uniqueCatsInTask = Array.from(new Set(taskCats));
            uniqueCatsInTask.forEach(cat => {
                runnerCategoryTaskCounts.set(cat, (runnerCategoryTaskCounts.get(cat) || 0) + 1);
            });
        });
    } else {
        // Fallback to token-based counting (backward compatibility)
        // Count category occurrences in runner document by iterating categories and incrementing count in map using +1 (token-based fallback)
        runnerDoc.forEach(cat => {
            runnerCategoryTaskCounts.set(cat, (runnerCategoryTaskCounts.get(cat) || 0) + 1);
        });
    }
    
    console.log(`[TFIDF] Runner history categories:`);
    runnerCategoryTaskCounts.forEach((taskCount, cat) => {
        console.log(`[TFIDF] - ${cat} (${taskCount} task${taskCount !== 1 ? 's' : ''})`);
    });
    
    // Log total completed tasks
    if (runnerTotalTasks > 0) {
        console.log(`[TFIDF] Total completed tasks: ${runnerTotalTasks}`);
    }
    
    // TF-IDF STEP 12: Build document corpus (2 documents: query + runner)
    const allDocuments = [queryDoc, runnerDoc];
    
    // Calculate TF, IDF, and TF-IDF for logging
    const uniqueRunnerTerms = Array.from(new Set(runnerDoc));
    const uniqueQueryTerms = Array.from(new Set(queryDoc));
    const allUniqueTerms = Array.from(new Set([...uniqueRunnerTerms, ...uniqueQueryTerms]));
    
    // 4️⃣ Term Frequency (TF) - Runner (for logging)
    console.log(`[TFIDF] Term Frequency (Runner):`);
    const runnerTFMap = new Map<string, number>();
    uniqueRunnerTerms.forEach(term => {
        let tf: number;
        let taskCount: number;
        let denominator: number;
        
        if (runnerTaskCategories.length > 0 && runnerTotalTasks > 0) {
            // STEP 2: Use task-based TF calculation (preferred)
            tf = calculateTFWithTaskCount(term, runnerTaskCategories, runnerTotalTasks);
            taskCount = runnerCategoryTaskCounts.get(term) || 0;
            denominator = runnerTotalTasks;
        } else {
            // STEP 1: Use token-based TF calculation (fallback)
            tf = calculateTF(term, runnerDoc);
            taskCount = runnerDoc.filter(word => word === term).length;
            denominator = runnerDoc.length;
        }
        
        runnerTFMap.set(term, tf);
        console.log(`[TFIDF] - ${term}: ${taskCount} / ${denominator} = ${tf.toFixed(4)}`);
    });
    
    // 5️⃣ Inverse Document Frequency (IDF) (for logging)
    console.log(`[TFIDF] Inverse Document Frequency:`);
    const idfMap = new Map<string, number>();
    allUniqueTerms.forEach(term => {
        const idf = calculateIDFAdjusted(term, allDocuments); // STEP 3 & 4
        idfMap.set(term, idf);
        console.log(`[TFIDF] - ${term}: ${idf.toFixed(4)}`);
    });
    
    // 6️⃣ TF-IDF weights - Runner (for logging)
    console.log(`[TFIDF] TF-IDF weights (Runner):`);
    const runnerTFIDFMap = new Map<string, number>();
    uniqueRunnerTerms.forEach(term => {
        const tf = runnerTFMap.get(term) || 0;
        const idf = idfMap.get(term) || 0;
        const tfidf = tf * idf;
        runnerTFIDFMap.set(term, tfidf);
        console.log(`[TFIDF] - ${term}: ${tf.toFixed(4)} × ${idf.toFixed(4)} = ${tfidf.toFixed(4)}`);
    });
    
    // 7️⃣ TF-IDF weights - Task (for logging)
    console.log(`[TFIDF] TF-IDF weights (Task):`);
    const queryTFIDFMap = new Map<string, number>();
    uniqueQueryTerms.forEach(term => {
        const tf = calculateTF(term, queryDoc); // STEP 1
        const idf = idfMap.get(term) || 0;
        const tfidf = tf * idf;
        queryTFIDFMap.set(term, tfidf);
        const termCount = queryDoc.filter(word => word === term).length;
        console.log(`[TFIDF] - ${term}: ${termCount} / ${queryDoc.length} × ${idf.toFixed(4)} = ${tfidf.toFixed(4)}`);
    });
    
    // TF-IDF STEP 8: Construct TF-IDF vector for query document
    const queryVector = calculateTFIDFVectorAdjusted(queryDoc, allDocuments);
    
    let runnerVector: Map<string, number>;
    if (runnerTaskCategories.length > 0 && runnerTotalTasks > 0) {
        // TF-IDF STEP 9: Construct TF-IDF vector for runner document using task-based TF (preferred)
        runnerVector = calculateTFIDFVectorWithTaskCount(runnerTaskCategories, runnerTotalTasks, allDocuments);
    } else {
        // TF-IDF STEP 10: Construct TF-IDF vector for runner document using token-based TF (fallback)
        runnerVector = calculateTFIDFVectorAdjusted(runnerDoc, allDocuments);
    }
    
    // TF-IDF STEP 12 & 13: Calculate dot product and vector magnitudes (for logging)
    const allTerms = Array.from(new Set([...queryVector.keys(), ...runnerVector.keys()]));
    let dotProduct = 0;
    let magnitude1 = 0;
    let magnitude2 = 0;
    
    allTerms.forEach(term => {
        const val1 = queryVector.get(term) || 0;
        const val2 = runnerVector.get(term) || 0;
        dotProduct += val1 * val2;        // STEP 12: Dot product
        magnitude1 += val1 * val1;        // STEP 13: Sum of squares for vector 1
        magnitude2 += val2 * val2;        // STEP 13: Sum of squares for vector 2
    });
    
    const taskMagnitude = Math.sqrt(magnitude1);
    const runnerMagnitude = Math.sqrt(magnitude2);
    const denominator = taskMagnitude * runnerMagnitude;
    
    console.log(`[TFIDF] Cosine similarity calculation:`);
    console.log(`[TFIDF] - Dot product: ${dotProduct.toFixed(4)}`);
    console.log(`[TFIDF] - Task magnitude: ${taskMagnitude.toFixed(4)}`);
    console.log(`[TFIDF] - Runner magnitude: ${runnerMagnitude.toFixed(4)}`);
    
    // TF-IDF STEP 14: Calculate final cosine similarity score
    const similarity = cosineSimilarity(queryVector, runnerVector);
    
    // 9️⃣ Final TF-IDF similarity score
    const finalScore = isNaN(similarity) ? 0 : similarity;
    console.log(`[TFIDF] Final cosine similarity (tfidfScore):`);
    console.log(`[TFIDF] → ${finalScore.toFixed(4)}`);
    
    // 🔟 End of calculation
    console.log(`[TFIDF] ===== TF-IDF CALCULATION END =====`);
    
    return finalScore;
}

/* ===================== DATA: AVAILABLE ERRANDS ===================== */
function useAvailableErrands(options?: { availableMode?: boolean }) {
    const [loading, setLoading] = React.useState(true);
    const [rows, setRows] = React.useState<ErrandUI[]>([]);
    const isInitialLoadRef = React.useRef(true);
    const availableMode = options?.availableMode ?? false;
    
  
    const availableModeRef = React.useRef(availableMode);

    const refetch = React.useCallback(async () => {
        const isInitialLoad = isInitialLoadRef.current;
        if (isInitialLoad) {
            isInitialLoadRef.current = false;
        }
        
        // P0:— Check runner authentication and availability
        setLoading(true);
        try {
            const { data: auth } = await supabase.auth.getUser();
            const uid = auth?.user?.id ?? null;

            // Authentication part
            if (!uid) {
                setRows([]);
                setLoading(false);
                return;
            }

           
            if (Platform.OS === 'web' && isInitialLoad) {
                const { getCachedData } = await import('../../utils/webCache');
                const cacheKey = `runner_available_errands_${uid}`;
                const cached = getCachedData<ErrandUI[]>(cacheKey);
                
                if (cached) {
                 
                    setRows(cached);
                    setLoading(false);
                    
                    return;
                }
            }
            // Check kung kinsa ang online na runner 
            const { data: runnerData, error: runnerError } = await supabase
                .from("users")
                .select("is_available, latitude, longitude")
                .eq("id", uid)
                .single();

            if (runnerError) {
                if (__DEV__) console.error("Error checking runner availability for errands:", runnerError);
                setRows([]);
                setLoading(false);
                return;
            }

            if (!runnerData?.is_available) {
                if (__DEV__) console.log("❌ Runner is inactive/offline, not fetching errands");
                setRows([]);
                setLoading(false);
                return; 
            }

            // Resolve runner location (GPS with database fallback)
         //GPS try to get the runner's location up to 3 times lang if it fails kay kwaon sa ang last know loc sa runner
            let runnerLat: number | null = null;
            let runnerLon: number | null = null;
            let gpsAccuracy = 0;
            let locationSource: "gps" | "database" = "database";

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

            //P1: — Icheck ang mga pending errands
            
            const distanceLimit = 500;

            const { data: eData, error } = await supabase
                .from("errand")
                .select("id, title, category, status, created_at, buddycaller_id, runner_id, notified_runner_id, notified_at, timeout_runner_ids")
                .eq("status", "pending")
                .is("runner_id", null)
                .order("created_at", { ascending: false })
                .neq(uid ? "buddycaller_id" : "id", uid ?? -1);
            if (error) throw error;
            const errands = (eData || []) as ErrandRowDB[];

            // P2 — Fetch caller names and locations
            // Purpose: Get caller location data needed for distance calculations.
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

            // P3 : Pre-ranking distance filtering
            // Purpose: Filter errands to only those within 500 meters of the runner before ranking. 
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

            
            const getRunnerErrandCategoryHistory = async (runnerId: string): Promise<{ taskCategories: string[][]; totalTasks: number }> => {
                try {
                    const { data, error } = await supabase
                        .from("errand")
                        .select("category")
                        .eq("runner_id", runnerId)
                        .eq("status", "completed");
                    
                    if (error) {
                        if (__DEV__) console.error(`Error fetching runner errand category history for ${runnerId}:`, error);
                        return { taskCategories: [], totalTasks: 0 };
                    }
                    
                    if (!data || data.length === 0) return { taskCategories: [], totalTasks: 0 };
                    
                    // Count total completed tasks (each errand is one task)
                    const totalTasks = data.length;
                    
                    // Build array of arrays: each task is represented by an array of its categories
                    const taskCategories: string[][] = [];
                    data.forEach((completedErrand: any) => {
                        if (!completedErrand.category) return;
                        // Each errand has one category, so each task is an array with one element
                        taskCategories.push([completedErrand.category.trim().toLowerCase()]);
                    });
                    
                    return { taskCategories, totalTasks };
                } catch (error) {
                    if (__DEV__) console.error(`Error calculating errand category history for runner ${runnerId}:`, error);
                    return { taskCategories: [], totalTasks: 0 };
                }
            };

      
         // Q0: Check if the errand should be shown to the runner (READ-ONLY)
            const shouldShowErrand = async (errand: ErrandRowDB): Promise<boolean> => {
                if (!uid) return false;
                
                // READ-ONLY: Only check if errand is assigned to current runner
                // Server (Edge Functions + cron) handles all assignment and timeout reassignment
                if (errand.notified_runner_id === uid) {
                    console.log(`✅ [ERRAND RANKING] Errand ${errand.id}: Showing to notified runner ${uid}`);
                    return true;
                }
                
                // Not assigned to current runner
                console.log(`❌ [ERRAND RANKING] Errand ${errand.id}: Assigned to different runner ${errand.notified_runner_id}`);
                return false;
            };

            // STEP 10: Apply ranking filter to determine visibility
            // Purpose: For each distance-filtered errand, run the ranking logic (shouldShowErrand) to determine if current runner should see it. Only errands assigned to current runner (or unassigned errands where current runner is top-ranked) are shown.
            const rankingFilteredErrands: ErrandRowDB[] = [];
            for (const errand of filteredErrands) {
                const shouldShow = await shouldShowErrand(errand);
                if (shouldShow) {
                    rankingFilteredErrands.push(errand);
                }
            }

            console.log('✅ [ERRAND RANKING] Errands after ranking filter:', rankingFilteredErrands.length);
            console.log('✅ [ERRAND RANKING] Errands IDs:', rankingFilteredErrands.map(e => e.id));

            const mapped: ErrandUI[] = rankingFilteredErrands.map((r) => ({
                id: r.id,
                requester: namesById[r.buddycaller_id || ""] || "BuddyCaller",
                title: (r.title || "").trim() || "(No title)",
                category: (r.category || "").trim() || undefined,
                status: toUiStatus(r.status),
                created_at: r.created_at,
            }));

            // WEB CACHING: Cache the final UI result (web only, short TTL due to ranking dependencies)
            if (Platform.OS === 'web' && uid) {
                const { setCachedData } = await import('../../utils/webCache');
                const cacheKey = `runner_available_errands_${uid}`;
                setCachedData(cacheKey, mapped);
            }

            setRows(mapped);
        } catch (e) {
            if (__DEV__) console.error("fetch errands error:", e);
            setRows([]);
        } finally {
            setLoading(false);
        }
    }, []);

    // Update ref whenever availableMode changes (does not recreate subscription)
    React.useEffect(() => {
        availableModeRef.current = availableMode;
        console.log('[REALTIME ERRAND] 🔄 availableModeRef updated to:', availableMode);
    }, [availableMode]);

    // Initial fetch effect - runs when availableMode changes to true
    React.useEffect(() => {
        if (availableMode) {
            console.log('[REALTIME ERRAND] ✅ Runner became available, triggering initial refetch');
            refetch();
        }
    }, [availableMode, refetch]);

    // Realtime subscription - created once, long-lived
    React.useEffect(() => {
        let mounted = true;

        console.log('[REALTIME ERRAND] 🔌 Creating realtime subscription (long-lived)');

        // Realtime subscription for errand changes
        const channel = supabase
            .channel("rt-available-errands")
            .on("postgres_changes", { event: "*", schema: "public", table: "errand" }, () => {
                if (!mounted) return;

                console.log('[REALTIME ERRAND] 📨 Realtime event received for errand table');
                
                // Read from ref to get latest availableMode without recreating subscription
                const isAvailable = availableModeRef.current;
                console.log('[REALTIME ERRAND] Checking availability - availableModeRef.current:', isAvailable);

                // Guard logic: Only block when explicitly false (OFF)
                // Allow when true OR undefined (loading state)
                if (isAvailable === undefined) {
                    console.log('[REALTIME ERRAND] ⏳ Availability is undefined (loading), allowing refetch');
                }
                
                if (isAvailable === false) {
                    console.log('[REALTIME ERRAND] ❌ Runner is explicitly OFF, skipping refetch');
                    return;
                }

                console.log('[REALTIME ERRAND] ✅ Availability guard passed, calling refetch()');

                    // Invalidate cache on realtime update (web only)
                    if (Platform.OS === 'web') {
                        (async () => {
                            try {
                                const { data: auth } = await supabase.auth.getUser();
                                const uid = auth?.user?.id ?? null;
                                if (uid) {
                                    const { invalidateCache } = await import('../../utils/webCache');
                                    invalidateCache(`runner_available_errands_${uid}`);
                                }
                            } catch {
                                // Silent fail
                            }
                        })();
                    }
                    refetch();
            })
            .subscribe();

        return () => {
            console.log('[REALTIME ERRAND] 🔌 Cleaning up realtime subscription');
            mounted = false;
            supabase.removeChannel(channel);
        };
    }, [refetch]); // Only depends on refetch, NOT availableMode

    // NOTE: Periodic timeout check removed - server (reassign-timed-out-tasks cron) now handles timeout reassignment
    // Client-side logic is READ-ONLY and only checks visibility (notified_runner_id === currentUserId)

    return { loading, rows, refetch };
}

/* ===================== DATA: COMMISSIONS ===================== */
function useAvailableCommissions(options?: { availableMode?: boolean }) {
    const [loading, setLoading] = React.useState(true);
    const [rows, setRows] = React.useState<CommissionUI[]>([]);
    const [errorText, setErrorText] = React.useState<string | null>(null);
    const isInitialLoadRef = React.useRef(true);
    const availableMode = options?.availableMode ?? false;
    
    // useRef to store latest availableMode without recreating subscription
    const availableModeRef = React.useRef(availableMode);

    const refetch = React.useCallback(async () => {
        const isInitialLoad = isInitialLoadRef.current;
        if (isInitialLoad) {
            isInitialLoadRef.current = false;
        }
        
        setLoading(true);
        setErrorText(null);
        try {
            const { data: auth } = await supabase.auth.getUser();
            const uid = auth?.user?.id ?? null;

            // First sa rule based, icheck if the current runner is available (online)
            if (!uid) {
                setRows([]);
                setLoading(false);
                return;
            }

            // WEB CACHING: Try to load from cache first (only on initial load)
            if (Platform.OS === 'web' && isInitialLoad) {
                const { getCachedData } = await import('../../utils/webCache');
                const cacheKey = `runner_available_commissions_${uid}`;
                const cached = getCachedData<CommissionUI[]>(cacheKey);
                
                if (cached) {
                    // Use cached data immediately
                    setRows(cached);
                    setLoading(false);
                    setErrorText(null);
                    // Realtime subscription will trigger fresh fetch when data changes
                    return;
                }
            }

            // first rule based rules, Check if and runner  available (online) og get location
            const { data: runnerData, error: runnerError } = await supabase
                .from("users")
                .select("is_available, latitude, longitude")
                .eq("id", uid)
                .single();

            if (runnerError) {
                if (__DEV__) console.error("Error checking runner availability:", runnerError);
                setRows([]);
                setLoading(false);
                return;
            }

            // Only show commissions sa mga runner na available (online)
            if (!runnerData?.is_available) {
                if (__DEV__) console.log('❌ Runner is not available (offline), not showing commissions');
                setRows([]);
                setLoading(false);
                return;
            }
            
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
                        // Wait a bit before retry (exponential backoff)
                        await new Promise(resolve => setTimeout(resolve, 500 * retryCount));
                    }
                    
                    locationResult = await LocationService.getCurrentLocation();
                    
                    if (locationResult.success && locationResult.location) {
                        // Check GPS accuracy - warn if accuracy is poor, but still use it if reasonable (< 500 meters)
                        // We only reject GPS if accuracy is extremely poor (> 500m, which is our distance limit anyway)
                        const accuracy = locationResult.location.accuracy || 0;
                        if (accuracy > 500) {
                            retryCount++;
                            if (retryCount >= maxRetries) {
                                // Don't throw - use the GPS location even if accuracy is poor
                                // It's still better than database location which might be from another device
                            } else {
                                continue; // Retry for better accuracy
                            }
                        }
                        
                        runnerLat = locationResult.location.latitude;
                        runnerLon = locationResult.location.longitude;
                        locationSource = 'gps';
                        break; // Success, exit retry loop
                    } else {
                        retryCount++;
                        if (retryCount >= maxRetries) {
                            const errorMsg = locationResult.error || 'Failed to get GPS location after retries';
                            if (__DEV__) console.error('❌ [COMMISSION FILTER] GPS location failed after all retries:', errorMsg);
                            throw new Error(errorMsg);
                        }
                    }
                } catch (error: any) {
                    retryCount++;
                    if (retryCount >= maxRetries) {
                        if (__DEV__) console.warn('⚠️ [COMMISSION FILTER] Failed to get device current GPS location after all retries, falling back to database location');
                        break; // Exit retry loop, will fall back to database
                    }
                }
            }
            
            // If GPS still failed after retries, fall back to database
            if (!locationResult || !locationResult.success || !locationResult.location) {
                
                // Fallback to database location if GPS fails
                const dbLat = typeof runnerData?.latitude === 'number' ? runnerData.latitude : parseFloat(String(runnerData?.latitude || ''));
                const dbLon = typeof runnerData?.longitude === 'number' ? runnerData.longitude : parseFloat(String(runnerData?.longitude || ''));
                
                if (!dbLat || !dbLon || isNaN(dbLat) || isNaN(dbLon)) {
                    if (__DEV__) console.error('❌ [COMMISSION FILTER] Database location also invalid, cannot filter commissions');
                    setRows([]);
                    setLoading(false);
                    return;
                }
                
                runnerLat = dbLat;
                runnerLon = dbLon;
                locationSource = 'database';
            }

            // Get GPS accuracy if available (from last successful GPS result)
            let gpsAccuracy = 0;
            if (locationSource === 'gps' && locationResult?.location?.accuracy) {
                gpsAccuracy = locationResult.location.accuracy;
            }

            const { data, error } = await supabase
                .from("commission")
                .select("id, title, commission_type, created_at, buddycaller_id, status, runner_id, declined_runner_id, notified_runner_id, notified_at, timeout_runner_ids")
                .eq("status", "pending")
                .is("runner_id", null)
                .order("created_at", { ascending: false })
                .neq(uid ? "buddycaller_id" : "id", uid ?? -1);

            if (error) {
                if (__DEV__) console.error('Error fetching commissions:', error);
                throw error;
            }

            const raw = (data || []) as CommissionRowDB[];

            // Get caller locations and names for distance calculation
            const callerIds = Array.from(
                new Set(raw.map((r) => r.buddycaller_id).filter((v): v is string => !!v))
            );
            
            const callerLocations: Record<string, { latitude: number; longitude: number }> = {};
            const commissionCallerNamesById: Record<string, string> = {};
            if (callerIds.length) {
                const { data: callers, error: callerError } = await supabase
                    .from("users")
                    .select("id, first_name, last_name, latitude, longitude")
                    .in("id", callerIds);
                
                if (callerError) {
                    if (__DEV__) console.error('Error fetching caller locations:', callerError);
                } else {
                    (callers || []).forEach((c: any) => {
                        // Store caller name
                        const full = `${titleCase(c.first_name || "")} ${titleCase(c.last_name || "")}`.trim();
                        commissionCallerNamesById[c.id] = full || "BuddyCaller";
                        
                        // Ensure latitude and longitude are numbers, not strings
                        const lat = typeof c.latitude === 'number' ? c.latitude : parseFloat(String(c.latitude || ''));
                        const lon = typeof c.longitude === 'number' ? c.longitude : parseFloat(String(c.longitude || ''));
                        if (lat && lon && !isNaN(lat) && !isNaN(lon)) {
                            callerLocations[c.id] = { latitude: lat, longitude: lon };
                        }
                    });
                }
            }
            
            // Strict distance limit: 500 meters (no GPS accuracy expansion)
            const distanceLimit = 500;

            // Filter out commissions based on distance (500 meters = 0.5 km) and declined status
            const filteredRaw = raw.filter(commission => {
                // Check if current user was declined for this commission
                if (commission.declined_runner_id === uid) {
                    return false;
                }
                
                // Check distance if caller has location
                const callerLocation = callerLocations[commission.buddycaller_id || ""];
                if (callerLocation) {
                    const distanceKm = LocationService.calculateDistance(
                        runnerLat,
                        runnerLon,
                        callerLocation.latitude,
                        callerLocation.longitude
                    );
                    const distanceMeters = distanceKm * 1000;
                    
                    if (distanceMeters > 500) {
                        return false;
                    }
                } else {
                    // If caller doesn't have location, exclude the commission
                    return false;
                }
                
                return true;
            });

            // Apply ranking-based filtering: only top-ranked runner sees the commission first
            // Helper function to get runner's category history from all completed commissions
            // Returns array of arrays: each inner array represents one task's categories
            const getRunnerCategoryHistory = async (runnerId: string): Promise<{ taskCategories: string[][]; totalTasks: number }> => {
                try {
                    // Get all completed commissions for this runner
                    const { data, error } = await supabase
                        .from("commission")
                        .select("commission_type")
                        .eq("runner_id", runnerId)
                        .eq("status", "completed");
                    
                    if (error) {
                        if (__DEV__) console.error(`Error fetching runner category history for ${runnerId}:`, error);
                        return { taskCategories: [], totalTasks: 0 };
                    }
                    
                    if (!data || data.length === 0) return { taskCategories: [], totalTasks: 0 };
                    
                    // Count total completed tasks (each commission is one task, even if it has multiple categories)
                    const totalTasks = data.length;
                    
                    // Build array of arrays: each task is represented by an array of its categories
                    const taskCategories: string[][] = [];
                    data.forEach((completedCommission: any) => {
                        if (!completedCommission.commission_type) return;
                        // commission_type is stored as comma-separated string (e.g., "logos,posters")
                        const categories = completedCommission.commission_type.split(',').map((t: string) => t.trim().toLowerCase()).filter((t: string) => t.length > 0);
                        if (categories.length > 0) {
                            taskCategories.push(categories);
                        }
                    });
                    
                    return { taskCategories, totalTasks };
                } catch (error) {
                    if (__DEV__) console.error(`Error calculating category history for runner ${runnerId}:`, error);
                    return { taskCategories: [], totalTasks: 0 };
                }
            };

            // Helper function to rank eligible runners and determine if current runner should see commission
            const shouldShowCommission = async (commission: CommissionRowDB): Promise<boolean> => {
                if (!uid) return false;
                
                // READ-ONLY: Only check if commission is assigned to current runner
                // Server (Edge Functions + cron) handles all assignment and timeout reassignment
                if (commission.notified_runner_id === uid) {
                    console.log(`✅ [RANKING] Commission ${commission.id}: Showing to notified runner ${uid}`);
                    return true;
                }
                
                // Not assigned to current runner
                console.log(`❌ [RANKING] Commission ${commission.id}: Assigned to different runner ${commission.notified_runner_id}`);
                return false;
            };

            // Apply ranking filter to distance-filtered commissions
            const rankingFilteredRaw: CommissionRowDB[] = [];
            for (const commission of filteredRaw) {
                const shouldShow = await shouldShowCommission(commission);
                if (shouldShow) {
                    rankingFilteredRaw.push(commission);
                }
            }

            // Get caller names (already have IDs from ranking-filtered commissions)
            const filteredCallerIds = Array.from(
                new Set(rankingFilteredRaw.map((r) => r.buddycaller_id).filter((v): v is string => !!v))
            );
            
            const names: Record<string, string> = {};
            if (filteredCallerIds.length) {
                const { data: users, error: usersError } = await supabase
                    .from("users")
                    .select("id, first_name, last_name")
                    .in("id", filteredCallerIds);
                
                if (usersError) {
                    if (__DEV__) console.error('❌ [COMMISSION FILTER] Error fetching caller names:', usersError);
                } else {
                    (users || []).forEach((u: any) => {
                        const full = `${titleCase(u.first_name || "")} ${titleCase(u.last_name || "")}`.trim();
                        names[u.id] = full || "BuddyCaller";
                    });
                }
            }

            const list: CommissionUI[] = rankingFilteredRaw.map((r) => ({
                id: r.id,
                requester: names[r.buddycaller_id || ""] || "BuddyCaller",
                commissionType: r.commission_type || "", // Store raw commission_type for parsing
                created_at: r.created_at || undefined,
                rating: 5.0,
                title: (r.title || "").trim() || "(No title)",
            }));

            list.sort((a, b) => (a.created_at || "").localeCompare(b.created_at || "")).reverse();

            setRows(list);
            if (!error && (data?.length ?? 0) === 0) {
                // ok
            }
        } catch (e: any) {
            if (__DEV__) console.error("fetch commissions error:", e);
            setRows([]);
            setErrorText(e?.message || "Failed to load commissions");
        } finally {
            setLoading(false);
        }
    }, []);

    // Update ref whenever availableMode changes (does not recreate subscription)
    React.useEffect(() => {
        availableModeRef.current = availableMode;
        console.log('[REALTIME COMMISSION] 🔄 availableModeRef updated to:', availableMode);
    }, [availableMode]);

    // Initial fetch effect - runs when availableMode changes to true
    React.useEffect(() => {
        if (availableMode) {
            console.log('[REALTIME COMMISSION] ✅ Runner became available, triggering initial refetch');
            refetch();
        }
    }, [availableMode, refetch]);

    // Realtime subscription - created once, long-lived
    React.useEffect(() => {
        let mounted = true;

        console.log('[REALTIME COMMISSION] 🔌 Creating realtime subscription (long-lived)');

        // Realtime subscription for commission changes
        const channel = supabase
            .channel("rt-available-commissions")
            .on("postgres_changes", { event: "*", schema: "public", table: "commission" }, () => {
                if (!mounted) return;

                console.log('[REALTIME COMMISSION] 📨 Realtime event received for commission table');
                
                // Read from ref to get latest availableMode without recreating subscription
                const isAvailable = availableModeRef.current;
                console.log('[REALTIME COMMISSION] Checking availability - availableModeRef.current:', isAvailable);

                // Guard logic: Only block when explicitly false (OFF)
                // Allow when true OR undefined (loading state)
                if (isAvailable === undefined) {
                    console.log('[REALTIME COMMISSION] ⏳ Availability is undefined (loading), allowing refetch');
                }
                
                if (isAvailable === false) {
                    console.log('[REALTIME COMMISSION] ❌ Runner is explicitly OFF, skipping refetch');
                    return;
                }

                console.log('[REALTIME COMMISSION] ✅ Availability guard passed, calling refetch()');

                    // Invalidate cache on realtime update (web only)
                    if (Platform.OS === 'web') {
                        (async () => {
                            try {
                                const { data: auth } = await supabase.auth.getUser();
                                const uid = auth?.user?.id ?? null;
                                if (uid) {
                                    const { invalidateCache } = await import('../../utils/webCache');
                                    invalidateCache(`runner_available_commissions_${uid}`);
                                }
                            } catch {
                                // Silent fail
                            }
                        })();
                    }
                    refetch();
            })
            .on("postgres_changes", { 
                event: "UPDATE", 
                schema: "public", 
                table: "users",
                filter: "latitude=not.is.null"
            }, () => {
                // Refetch when user locations are updated (caller or runner)
                // This ensures commissions are refetched when locations change
                if (!mounted) return;

                if (__DEV__) console.log('[REALTIME COMMISSION] 📨 Location update event received');
                
                // Read from ref to get latest availableMode without recreating subscription
                const isAvailable = availableModeRef.current;
                console.log('[REALTIME COMMISSION] Checking availability - availableModeRef.current:', isAvailable);

                // Guard logic: Only block when explicitly false (OFF)
                // Allow when true OR undefined (loading state)
                if (isAvailable === undefined) {
                    console.log('[REALTIME COMMISSION] ⏳ Availability is undefined (loading), allowing refetch');
                }
                
                if (isAvailable === false) {
                    console.log('[REALTIME COMMISSION] ❌ Runner is explicitly OFF, skipping refetch');
                    return;
                }

                console.log('[REALTIME COMMISSION] ✅ Availability guard passed, calling refetch()');

                    // Invalidate cache on location update (web only)
                    if (Platform.OS === 'web') {
                        (async () => {
                            try {
                                const { data: auth } = await supabase.auth.getUser();
                                const uid = auth?.user?.id ?? null;
                                if (uid) {
                                    const { invalidateCache } = await import('../../utils/webCache');
                                    invalidateCache(`runner_available_commissions_${uid}`);
                                }
                            } catch {
                                // Silent fail
                            }
                        })();
                    }
                    refetch();
            })
            .subscribe();

        return () => {
            console.log('[REALTIME COMMISSION] 🔌 Cleaning up realtime subscription');
            mounted = false;
            supabase.removeChannel(channel);
        };
    }, [refetch]); // Only depends on refetch, NOT availableMode

    // NOTE: Periodic timeout check removed - server (reassign-timed-out-tasks cron) now handles timeout reassignment
    // Client-side logic is READ-ONLY and only checks visibility (notified_runner_id === currentUserId)

    return { loading, rows, errorText, refetch };
}

/* ===================== DATA: TODAY'S COMPLETED COMMISSIONS ===================== */
function useTodayCompletedCommissions() {
    const [loading, setLoading] = React.useState(true);
    const [count, setCount] = React.useState(0);

    const fetchCount = React.useCallback(async () => {
        setLoading(true);
        try {
            const { data: auth } = await supabase.auth.getUser();
            const uid = auth?.user?.id ?? null;

            if (!uid) {
                setCount(0);
                setLoading(false);
                return;
            }

            // Get start and end of today in UTC
            const now = new Date();
            const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            const endOfToday = new Date(startOfToday);
            endOfToday.setDate(endOfToday.getDate() + 1);

            const startOfTodayISO = startOfToday.toISOString();
            const endOfTodayISO = endOfToday.toISOString();

            // Query for commissions completed today (status='completed' and updated_at within today)
            const { data, error } = await supabase
                .from("commission")
                .select("id")
                .eq("runner_id", uid)
                .eq("status", "completed")
                .gte("updated_at", startOfTodayISO)
                .lt("updated_at", endOfTodayISO);

            if (error) {
                console.error("Error fetching today's completed commissions:", error);
                setCount(0);
            } else {
                setCount(data?.length ?? 0);
            }
        } catch (error) {
            console.error("Error in useTodayCompletedCommissions:", error);
            setCount(0);
        } finally {
            setLoading(false);
        }
    }, []);

    React.useEffect(() => {
        fetchCount();

        // Refetch every minute to keep count updated
        const interval = setInterval(() => {
            fetchCount();
        }, 60000);

        return () => clearInterval(interval);
    }, [fetchCount]);

    return { loading, count, refetch: fetchCount };
}

/* ===================== DATA: TODAY'S COMPLETED ERRANDS ===================== */
function useTodayCompletedErrands() {
    const [loading, setLoading] = React.useState(true);
    const [count, setCount] = React.useState(0);

    const fetchCount = React.useCallback(async () => {
        setLoading(true);
        try {
            const { data: auth } = await supabase.auth.getUser();
            const uid = auth?.user?.id ?? null;

            if (!uid) {
                setCount(0);
                setLoading(false);
                return;
            }

            // Get start and end of today in UTC (match the timezone used by database)
            const now = new Date();
            // Create date in UTC to avoid timezone issues
            const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
            const endOfToday = new Date(startOfToday);
            endOfToday.setUTCDate(endOfToday.getUTCDate() + 1);

            const startOfTodayISO = startOfToday.toISOString();
            const endOfTodayISO = endOfToday.toISOString();

            if (__DEV__) {
                console.log('🔍 [Today Completed Errands] Date range:', {
                    startOfToday: startOfTodayISO,
                    endOfToday: endOfTodayISO,
                    runnerId: uid
                });
            }

            // Query for errands completed today (status='completed' and completed_at within today)
            // Use completed_at column to match when errand was actually completed
            const { data, error } = await supabase
                .from("errand")
                .select("id, completed_at, status")
                .eq("runner_id", uid)
                .eq("status", "completed")
                .not("completed_at", "is", null)
                .gte("completed_at", startOfTodayISO)
                .lt("completed_at", endOfTodayISO);

            if (__DEV__) {
                console.log('🔍 [Today Completed Errands] Query result:', {
                    count: data?.length ?? 0,
                    error: error?.message,
                    data: data
                });
            }

            if (error) {
                console.error("Error fetching today's completed errands:", error);
                setCount(0);
            } else {
                setCount(data?.length ?? 0);
            }
        } catch (error) {
            console.error("Error in useTodayCompletedErrands:", error);
            setCount(0);
        } finally {
            setLoading(false);
        }
    }, []);

    React.useEffect(() => {
        fetchCount();

        // Refetch every minute to keep count updated
        const interval = setInterval(() => {
            fetchCount();
        }, 60000);

        return () => clearInterval(interval);
    }, [fetchCount]);

    return { loading, count, refetch: fetchCount };
}

/* ================= CONFIRM MODALS FOR LOGOUT (match BuddyCaller) ================= */
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
        backgroundColor: "#F4E6E6",
        alignItems: "center",
        justifyContent: "center",
        marginBottom: 8,
    },
    title: { color: colors.text, fontSize: 16, fontWeight: "900", marginBottom: 6 },
    msg: { color: colors.text, fontSize: 13, opacity: 0.9, marginBottom: 14 },
    okBtn: { backgroundColor: colors.maroon, paddingVertical: 10, paddingHorizontal: 24, borderRadius: 10 },
    okText: { color: "#fff", fontWeight: "800" },
});

function GeofenceErrorModal({
    visible,
    onClose,
}: {
    visible: boolean;
    onClose: () => void;
}) {
    return (
        <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
            <View style={geofenceError.backdrop}>
                <View style={geofenceError.card}>
                    <Text style={geofenceError.title}>Unavailable Outside UM Matina</Text>
                    <Text style={geofenceError.msg}>
                        You are currently outside the University of Mindanao – Matina campus.
                        To go online and accept errands or commissions, please return inside the campus area and try again.
                    </Text>
                    <TouchableOpacity onPress={onClose} style={geofenceError.okBtn} activeOpacity={0.9}>
                        <Text style={geofenceError.okText}>OK</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </Modal>
    );
}
const geofenceError = StyleSheet.create({
    backdrop: {
        flex: 1,
        backgroundColor: "rgba(0,0,0,0.38)",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
    },
    card: { width: 400, maxWidth: "100%", backgroundColor: "#fff", borderRadius: 14, padding: 18 },
    title: { color: colors.text, fontSize: 16, fontWeight: "900", marginBottom: 6 },
    msg: { color: colors.text, fontSize: 13, opacity: 0.9, marginBottom: 14, lineHeight: 18 },
    okBtn: { backgroundColor: colors.maroon, paddingVertical: 10, paddingHorizontal: 24, borderRadius: 10, alignSelf: "flex-end" },
    okText: { color: "#fff", fontWeight: "800" },
});

function WaitingForLocationModal({
    visible,
    onClose,
}: {
    visible: boolean;
    onClose: () => void;
}) {
    return (
        <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
            <View style={waitingForLocation.backdrop}>
                <View style={waitingForLocation.card}>
                    <Text style={waitingForLocation.title}>Waiting for Location</Text>
                    <Text style={waitingForLocation.msg}>
                        We are still trying to get your current location.
                        Please make sure location services are enabled and try again in a moment.
                    </Text>
                    <TouchableOpacity onPress={onClose} style={waitingForLocation.okBtn} activeOpacity={0.9}>
                        <Text style={waitingForLocation.okText}>OK</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </Modal>
    );
}
const waitingForLocation = StyleSheet.create({
    backdrop: {
        flex: 1,
        backgroundColor: "rgba(0,0,0,0.38)",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
    },
    card: { width: 400, maxWidth: "100%", backgroundColor: "#fff", borderRadius: 14, padding: 18 },
    title: { color: colors.text, fontSize: 16, fontWeight: "900", marginBottom: 6 },
    msg: { color: colors.text, fontSize: 13, opacity: 0.9, marginBottom: 14, lineHeight: 18 },
    okBtn: { backgroundColor: colors.maroon, paddingVertical: 10, paddingHorizontal: 24, borderRadius: 10, alignSelf: "flex-end" },
    okText: { color: "#fff", fontWeight: "800" },
});

/* MAIN */
export default function HomeScreen() {
    const { width } = useWindowDimensions();
    const isWeb = Platform.OS === "web" || width >= 900;

    // Development-only, web-only: mark when the first Runner screen tree mounts.
    React.useEffect(() => {
        if (Platform.OS === "web" && __DEV__ && typeof window !== "undefined") {
            const w = window as any;
            if (w.__WEB_TOTAL_STARTUP_TIMER_STARTED__ && !w.__WEB_RUNNER_FIRST_SCREEN_MOUNT_ENDED__) {
                w.__WEB_RUNNER_FIRST_SCREEN_MOUNT_ENDED__ = true;
                console.timeEnd("WEB_RUNNER_FIRST_SCREEN_MOUNT");
                console.log("[PERF] WEB_RUNNER_FIRST_SCREEN_MOUNT ended in HomeScreen");
            }
        }
    }, []);

    return isWeb ? <HomeWeb /> : <HomeMobile />;
}

/* =============================== WEB LAYOUT =============================== */
function HomeWeb() {
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
    
    const [activeTab, setActiveTab] = useState<"Errands" | "Commissions">("Errands");
    const [availableMode, setAvailableMode] = useState<boolean>(false);
    const [availabilityLoading, setAvailabilityLoading] = useState<boolean>(true);

    const [, setSignedOut] = useState(false);
    const [loggingOut, setLoggingOut] = useState(false);

    // Global notification badge
    const { unreadCount, incrementUnread, clearUnread } = useNotificationBadge();

    // Location prompt modal state
    const [locationPromptVisible, setLocationPromptVisible] = useState(false);
    const [locationPromptLoading, setLocationPromptLoading] = useState(false);
    const [permissionBlockedVisible, setPermissionBlockedVisible] = useState(false);
    
    // Geofence error modal state
    const [geofenceErrorVisible, setGeofenceErrorVisible] = useState(false);
    
    // Waiting for location modal state
    const [waitingForLocationVisible, setWaitingForLocationVisible] = useState(false);

    // Function to toggle availability and save to database
    const toggleAvailability = async (newStatus: boolean) => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                console.log('❌ No user found when trying to toggle availability');
                return;
            }

            console.log(`🔄 Toggling availability for user ${user.id} to:`, newStatus);

            // PRE-VALIDATION FLOW: When turning ON, validate BEFORE updating state or database
            // UI must remain OFF until validation succeeds
            if (newStatus) {
                // PRE-VALIDATION STEP 1: Fetch GPS location (one-time fetch, not tracking)
                // Location can be fetched even while status is OFF - this is the pre-validation check
                let locationResult = null;
                
                try {
                    // GPS Warm-up / Retry: Attempt to get GPS up to 3 times within ~3-5 seconds
                    const maxRetries = 3;
                    const retryDelayMs = 1000; // 1 second between retries
                    
                    for (let attempt = 1; attempt <= maxRetries; attempt++) {
                        if (attempt > 1) {
                            // Wait before retry (except first attempt)
                            await new Promise(resolve => setTimeout(resolve, retryDelayMs));
                        }
                        
                        // Wrap each GPS attempt in try/catch to prevent exceptions from bypassing retry logic
                        try {
                            locationResult = await LocationService.getCurrentLocation();
                            
                            if (locationResult.success && locationResult.location) {
                                break; // GPS acquired successfully
                            }
                            
                            if (__DEV__) {
                                console.log(`🔄 GPS attempt ${attempt}/${maxRetries} failed, retrying...`);
                            }
                        } catch (gpsError) {
                            // GPS attempt threw an exception - catch it and continue retrying
                            if (__DEV__) {
                                console.log(`🔄 GPS attempt ${attempt}/${maxRetries} threw exception:`, gpsError);
                            }
                            locationResult = {
                                success: false,
                                error: gpsError instanceof Error ? gpsError.message : 'GPS acquisition failed'
                            };
                            // Continue to next retry attempt
                        }
                    }
                    
                    // PRE-VALIDATION STEP 2: Check GPS availability
                    // If GPS is still not available after retries
                    if (!locationResult || !locationResult.success || !locationResult.location) {
                        // Status remains OFF, show modal, return early
                        setWaitingForLocationVisible(true);
                        return; // Early return - UI and database remain OFF
                    }

                    const { latitude, longitude } = locationResult.location;

                    // PRE-VALIDATION STEP 3: Validate GPS coordinates
                    // Client-side guard: Validate GPS coordinates before calling Edge Function
                    if (latitude === null || latitude === undefined || longitude === null || longitude === undefined) {
                        // Status remains OFF, show modal, return early
                        setWaitingForLocationVisible(true);
                        return; // Early return - UI and database remain OFF
                    }

                    if (isNaN(latitude) || isNaN(longitude)) {
                        // Status remains OFF, show modal, return early
                        setWaitingForLocationVisible(true);
                        return; // Early return - UI and database remain OFF
                    }

                    // PRE-VALIDATION STEP 4: Geofence validation (authoritative backend check)
                    // Call backend Edge Function for authoritative geofence validation
                    const { data: validationResult, error: validationError } = await supabase.functions.invoke(
                        'validate-availability',
                        {
                            body: {
                                runner_id: user.id,
                                latitude: latitude,
                                longitude: longitude,
                            },
                        }
                    );

                    // PRE-VALIDATION STEP 5: Handle geofence validation result
                    if (validationError) {
                        // Network/server error - status remains OFF
                        console.error('❌ Geofence validation error:', validationError);
                        Alert.alert(
                            'Validation Error',
                            'Unable to validate location. Please try again.'
                        );
                        return; // Early return - UI and database remain OFF
                    }

                    if (!validationResult?.allowed) {
                        // Geofence violation - status remains OFF, show modal
                        setGeofenceErrorVisible(true);
                        return; // Early return - UI and database remain OFF
                    }

                    // ✅ PRE-VALIDATION PASSED: Runner is inside UM Matina
                    // Now we can proceed with updating availability
                    console.log('✅ Geofence validation passed - proceeding with availability update');
                    
                } catch (geofenceError) {
                    // Outer catch: Only for network errors or unexpected errors (not GPS availability)
                    // Status remains OFF on error
                    console.error('❌ Error during geofence validation:', geofenceError);
                    Alert.alert(
                        'Validation Error',
                        'An error occurred while validating your location. Please try again.'
                    );
                    return; // Early return - UI and database remain OFF
                }
                
                // ✅ VALIDATION SUCCEEDED: Only reach here if geofence validation passed
                // Now update UI state and database - this is the ONLY place status changes to ON
            }

            // POST-VALIDATION: Update state and database
            // This only executes if:
            // - Turning OFF (no validation needed), OR
            // - Turning ON AND validation succeeded (all early returns avoided)
            setAvailableMode(newStatus);

            // Prepare update data
            const updateData: any = { is_available: newStatus };
            
            // If turning OFF, clear location data
            if (!newStatus) {
                updateData.latitude = null;
                updateData.longitude = null;
                updateData.location_updated_at = null;
                if (__DEV__) console.log('🗑️ [Web] Clearing location data (going offline)');
            }

            // Save to database - try to update is_available field
            const { error } = await supabase
                .from('users')
                .update(updateData)
                .eq('id', user.id);

            if (error) {
                console.error('❌ Could not update is_available field:', error.message);
                console.error('Full error:', error);
                // If the field doesn't exist, we'll just keep the local state
            } else {
                if (__DEV__) console.log('✅ Successfully updated is_available to:', newStatus);
                if (!newStatus) {
                    if (__DEV__) console.log('✅ [Web] Location data cleared from database');
                }
                
                // Verify the update by querying the user again
                const { data: updatedUser, error: verifyError } = await supabase
                    .from('users')
                    .select('id, first_name, last_name, is_available')
                    .eq('id', user.id)
                    .single();
                
                if (verifyError) {
                    console.error('❌ Could not verify update:', verifyError);
                } else {
                    console.log('✅ Verification - User availability is now:', updatedUser.is_available);
                }
            }
        } catch (error) {
            console.error('❌ Error updating availability:', error);
        }
    };

    const { loading, firstName, fullName, roleLabel, averageRating, profilePictureUrl } = useAuthProfile();

    // Get tab-specific ratings
    const { rating: errandsRating } = useTabSpecificRating("Errands");
    const { rating: commissionsRating } = useTabSpecificRating("Commissions");

    const { loading: errandsLoading, rows: errands, refetch: refetchErrands } = useAvailableErrands({ availableMode });
    const {
        loading: commLoading,
        rows: commissions,
        errorText: commError,
        refetch: refetchCommissions,
    } = useAvailableCommissions({ availableMode });
    const { count: todayCompletedCount, loading: todayCompletedLoading } = useTodayCompletedCommissions();
    const { count: todayCompletedErrandsCount, loading: todayCompletedErrandsLoading } = useTodayCompletedErrands();

    // Load current availability status from database on component mount
    React.useEffect(() => {
        const loadAvailabilityStatus = async () => {
            try {
                const { data: { user } } = await supabase.auth.getUser();
                if (!user) {
                    setAvailabilityLoading(false);
                    return;
                }

                const { data, error } = await supabase
                    .from('users')
                    .select('is_available')
                    .eq('id', user.id)
                    .single();

                if (error) {
                    console.log('Error loading availability status:', error);
                    // Keep default false if there's an error
                    setAvailableMode(false);
                    setAvailabilityLoading(false);
                    return;
                }

                // Honor what's in DB; do not force it here so it persists across navigations
                const dbAvailability = data?.is_available ?? false;
                setAvailableMode(dbAvailability);
                setAvailabilityLoading(false);
                    
                console.log('✅ Loaded availability status from database:', dbAvailability);
            } catch (error) {
                console.error('Error loading availability status:', error);
                setAvailableMode(false);
                setAvailabilityLoading(false);
            }
        };

        loadAvailabilityStatus();
    }, []);

    // Refetch errands when availability changes
    React.useEffect(() => {
        if (!availabilityLoading && refetchErrands) {
            refetchErrands();
        }
    }, [availableMode, availabilityLoading, refetchErrands]);

    // Refetch commissions when availability changes
    React.useEffect(() => {
        if (!availabilityLoading && refetchCommissions) {
            refetchCommissions();
        }
    }, [availableMode, availabilityLoading, refetchCommissions]);

    // Check location status and immediately update when availability is turned ON
    React.useEffect(() => {
        const checkAndUpdateLocation = async () => {
            if (!availableMode || availabilityLoading) {
                return;
            }

            try {
                const { data: { user } } = await supabase.auth.getUser();
                if (!user) return;

                if (__DEV__) console.log('🔍 [Web] Checking location status for user:', user.id);
                const locationStatus = await LocationService.checkLocationStatus(user.id);

                if (__DEV__) console.log('📍 [Web] Location status:', locationStatus);

                // For web browsers, we should NOT automatically request location (triggers browser prompt)
                // Only show modal if location is not in database
                // User must click "Enable Location" button to trigger the browser permission prompt
                if (!locationStatus.locationInDatabase) {
                    if (__DEV__) console.log('⚠️ [Web] Location not in database, showing prompt modal');
                    setLocationPromptVisible(true);
                    return;
                }

                // If location exists in database, we're good - don't request again automatically
                // This prevents triggering browser prompt on page load
                if (__DEV__) console.log('✅ [Web] Location exists in database, no need to request again');
            } catch (error) {
                console.error('❌ [Web] Error checking/updating location:', error);
            }
        };

        checkAndUpdateLocation();
    }, [availableMode, availabilityLoading, refetchCommissions]);

    // Real-time location tracking when status is ON (Web)
    React.useEffect(() => {
        let locationSubscription: any = null;

        const startLocationTracking = async () => {
            // Only track if available mode is ON and not loading
            if (!availableMode || availabilityLoading) {
                if (__DEV__) console.log('📍 [Web] Location tracking not started - status is OFF or loading');
                return;
            }

            try {
                const { data: { user } } = await supabase.auth.getUser();
                if (!user) {
                    if (__DEV__) console.log('❌ [Web] No user found for location tracking');
                    return;
                }

                if (__DEV__) console.log('🔄 [Web] Starting real-time location tracking for user:', user.id);

                // Immediately update location when tracking starts (ensures fresh location on mount or toggle)
                if (__DEV__) console.log('🔄 [Web] Immediately updating location when tracking starts...');
                try {
                    const immediateResult = await LocationService.requestAndSaveLocation(user.id);
                    if (immediateResult.success) {
                        if (__DEV__) console.log('✅ [Web] Immediate location updated when tracking started');
                        // Refetch commissions after immediate location update
                        if (refetchCommissions) {
                            setTimeout(() => {
                                refetchCommissions();
                            }, 500);
                        }
                    } else {
                        if (__DEV__) console.warn('⚠️ [Web] Failed to get immediate location when tracking started:', immediateResult.error);
                        // Check if error is PERMISSION_DENIED (code 1)
                        if (immediateResult.error && immediateResult.error.toLowerCase().includes('permission denied')) {
                            setPermissionBlockedVisible(true);
                            // Turn availability OFF when permission is denied
                            await toggleAvailability(false);
                        }
                    }
                } catch (error) {
                    console.error('❌ [Web] Error getting immediate location when tracking started:', error);
                }

                // Start watching location changes
                locationSubscription = await LocationService.watchLocation(
                    async (location) => {
                        if (__DEV__) {
                            console.log('📍 [Web] Location updated:', {
                                lat: location.latitude.toFixed(6),
                                lng: location.longitude.toFixed(6),
                                accuracy: location.accuracy.toFixed(2)
                            });
                        }

                        // Update location in database
                        const updated = await LocationService.updateLocationInDatabase(user.id, location);
                        if (updated) {
                            if (__DEV__) console.log('✅ [Web] Location saved to database');
                            // Refetch commissions after location is saved to update distance filtering
                            if (refetchCommissions) {
                                if (__DEV__) console.log('🔄 [Web] Refetching commissions after location update');
                                setTimeout(() => {
                                    refetchCommissions();
                                }, 500); // Small delay to ensure database update is complete
                            }
                        } else {
                            if (__DEV__) console.warn('⚠️ [Web] Failed to save location to database');
                        }
                    },
                    {
                        // Update every 30 seconds or when user moves 50 meters
                        timeInterval: 30000,
                        distanceInterval: 50,
                    }
                );

                if (locationSubscription) {
                    if (__DEV__) console.log('✅ [Web] Location tracking started successfully');
                } else {
                    if (__DEV__) console.warn('⚠️ [Web] Failed to start location tracking');
                    // If watchLocation returns null, it may indicate permission denied
                    // Check permission status
                    if (typeof navigator !== 'undefined' && navigator.geolocation) {
                        navigator.geolocation.getCurrentPosition(
                            () => {
                                // Permission granted, hide modal
                                setPermissionBlockedVisible(false);
                            },
                            async (error) => {
                                if (error.code === 1) {
                                    setPermissionBlockedVisible(true);
                                    // Turn availability OFF when permission is denied
                                    await toggleAvailability(false);
                                }
                            },
                            { timeout: 1000, maximumAge: 0 }
                        );
                    }
                }
            } catch (error: any) {
                console.error('❌ [Web] Error starting location tracking:', error);
                // If error indicates permission denied, turn availability OFF
                if (error?.message?.includes('permission') || error?.code === 1) {
                    setPermissionBlockedVisible(true);
                    await toggleAvailability(false);
                }
            }
        };

        startLocationTracking();

        // Cleanup function - stop tracking when component unmounts or availability changes
        return () => {
            if (locationSubscription) {
                if (__DEV__) console.log('🛑 [Web] Stopping location tracking');
                try {
                    if (typeof locationSubscription.remove === 'function') {
                locationSubscription.remove();
                    }
                } catch (error) {
                    if (__DEV__) console.warn('⚠️ [Web] Error removing location subscription:', error);
                }
                locationSubscription = null;
            }
        };
    }, [availableMode, availabilityLoading, refetchCommissions]);

    React.useEffect(() => {
        const { data: sub } = supabase.auth.onAuthStateChange(async (event) => {
            if (event === "SIGNED_IN") {
                try {
                    const { data: { user } } = await supabase.auth.getUser();
                    if (user) {
                        await supabase
                            .from('users')
                            .update({ is_available: false })
                            .eq('id', user.id);
                        setAvailableMode(false);
                        console.log('✅ Defaulted availability to OFF on login');
                    }
                } catch (error) {
                    console.error('Error defaulting availability to OFF on login:', error);
                }
            } else if (event === "SIGNED_OUT") {
                // Set availability to OFF when user logs out
                try {
                    const { data: { user } } = await supabase.auth.getUser();
                    if (user) {
                        await supabase
                            .from('users')
                            .update({ is_available: false })
                            .eq('id', user.id);
                        console.log('✅ Set availability to OFF on logout');
                    }
                } catch (error) {
                    console.error('Error setting availability to OFF on logout:', error);
                }
                
                // keep UI stable; success modal will handle navigation
                setSignedOut(true);
            }
        });
        return () => sub?.subscription?.unsubscribe?.();
    }, []);

    // Set up real-time subscription for new commissions
    React.useEffect(() => {
        const channel = supabase
            .channel('home_notifications_web')
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'commission',
                    filter: 'status=eq.pending'
                },
                async (payload) => {
                    console.log('New commission detected on home screen:', payload);
                    
                    // Check if runner is online and within distance before showing notification
                    try {
                        const { data: { user } } = await supabase.auth.getUser();
                        if (!user) return;

                        const commission = payload.new as any;

                        const { data: runnerData } = await supabase
                            .from("users")
                            .select("is_available, latitude, longitude")
                            .eq("id", user.id)
                            .single();

                        // Only increment notification count if runner is online (available)
                        if (!runnerData?.is_available) {
                            console.log('Runner is offline, not showing notification');
                            return;
                        }

                        // Use device's current GPS location for filtering (not database location)
                        if (__DEV__) console.log('🔄 [Web Real-time] Getting device current GPS location for notification check...');
                        let runnerLat: number;
                        let runnerLon: number;
                        let locationSource: 'gps' | 'database' = 'gps';

                        try {
                            const locationResult = await LocationService.getCurrentLocation();
                            
                            if (locationResult.success && locationResult.location) {
                                runnerLat = locationResult.location.latitude;
                                runnerLon = locationResult.location.longitude;
                                locationSource = 'gps';
                                if (__DEV__) {
                                    console.log('✅ [Web Real-time] Device current GPS location obtained:', { 
                                        lat: runnerLat, 
                                        lon: runnerLon,
                                        accuracy: locationResult.location.accuracy,
                                        runnerId: user.id,
                                        source: locationSource
                                    });
                                }
                            } else {
                                throw new Error(locationResult.error || 'Failed to get GPS location');
                            }
                        } catch (error) {
                            if (__DEV__) console.warn('⚠️ [Web Real-time] Failed to get device current GPS location, falling back to database location:', error);
                            
                            // Fallback to database location if GPS fails
                            const dbLat = typeof runnerData?.latitude === 'number' ? runnerData.latitude : parseFloat(String(runnerData?.latitude || ''));
                            const dbLon = typeof runnerData?.longitude === 'number' ? runnerData.longitude : parseFloat(String(runnerData?.longitude || ''));
                            
                            if (!dbLat || !dbLon || isNaN(dbLat) || isNaN(dbLon)) {
                                if (__DEV__) console.log('❌ [Web Real-time] Database location also invalid, not showing notification');
                                return;
                            }
                            
                            runnerLat = dbLat;
                            runnerLon = dbLon;
                            locationSource = 'database';
                            if (__DEV__) {
                                console.log('✅ [Web Real-time] Using database location as fallback:', { 
                                    lat: runnerLat, 
                                    lon: runnerLon,
                                    runnerId: user.id,
                                    source: locationSource
                                });
                            }
                        }

                        // Check distance (500 meters = 0.5 km)
                        const { data: callerData } = await supabase
                            .from("users")
                            .select("latitude, longitude")
                            .eq("id", commission.buddycaller_id)
                            .single();

                        if (callerData?.latitude && callerData?.longitude) {
                            const distanceKm = LocationService.calculateDistance(
                                runnerLat,
                                runnerLon,
                                callerData.latitude,
                                callerData.longitude
                            );
                            const distanceMeters = distanceKm * 1000;

                            if (__DEV__) console.log(`📍 [Web Real-time] Commission ${commission.id} distance check: ${distanceMeters.toFixed(2)}m [runner source: ${locationSource}]`);

                            if (distanceMeters > 500) {
                                if (__DEV__) console.log(`❌ [Web Real-time] Skipping notification for commission ${commission.id} - distance: ${distanceMeters.toFixed(2)}m (exceeds 500m)`);
                                return;
                            }

                            if (__DEV__) console.log('✅ [Web Real-time] Runner is online and within 500m, showing notification');
                            incrementUnread();
                        } else {
                            if (__DEV__) console.log('❌ [Web Real-time] Caller has no location, not showing notification');
                        }
                    } catch (error) {
                        console.error('Error checking runner availability for notification:', error);
                    }
                }
            )
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'errand',
                    filter: 'status=eq.pending'
                },
                async (payload) => {
                    console.log('New errand detected on home screen:', payload);
                    
                    // Check if runner is online and within distance before showing notification
                    try {
                        const { data: { user } } = await supabase.auth.getUser();
                        if (!user) return;

                        const errand = payload.new as any;

                        const { data: runnerData } = await supabase
                            .from("users")
                            .select("is_available, latitude, longitude")
                            .eq("id", user.id)
                            .single();

                        // Only increment notification count if runner is online (available)
                        if (!runnerData?.is_available) {
                            console.log('Runner is offline, not showing errand notification');
                            return;
                        }

                        // Use device's current GPS location for filtering (not database location)
                        if (__DEV__) console.log('🔄 [Web Real-time] Getting device current GPS location for errand notification check...');
                        let runnerLat: number;
                        let runnerLon: number;
                        let locationSource: 'gps' | 'database' = 'gps';

                        try {
                            const locationResult = await LocationService.getCurrentLocation();
                            
                            if (locationResult.success && locationResult.location) {
                                runnerLat = locationResult.location.latitude;
                                runnerLon = locationResult.location.longitude;
                                locationSource = 'gps';
                                if (__DEV__) {
                                    console.log('✅ [Web Real-time] Device current GPS location obtained for errand:', { 
                                        lat: runnerLat, 
                                        lon: runnerLon,
                                        accuracy: locationResult.location.accuracy,
                                        runnerId: user.id,
                                        source: locationSource
                                    });
                                }
                            } else {
                                throw new Error(locationResult.error || 'Failed to get GPS location');
                            }
                        } catch (error) {
                            if (__DEV__) console.warn('⚠️ [Web Real-time] Failed to get device current GPS location, falling back to database location:', error);
                            
                            // Fallback to database location if GPS fails
                            const dbLat = typeof runnerData?.latitude === 'number' ? runnerData.latitude : parseFloat(String(runnerData?.latitude || ''));
                            const dbLon = typeof runnerData?.longitude === 'number' ? runnerData.longitude : parseFloat(String(runnerData?.longitude || ''));
                            
                            if (!dbLat || !dbLon || isNaN(dbLat) || isNaN(dbLon)) {
                                if (__DEV__) console.log('❌ [Web Real-time] Database location also invalid, not showing errand notification');
                                return;
                            }
                            
                            runnerLat = dbLat;
                            runnerLon = dbLon;
                            locationSource = 'database';
                        }

                        // Check distance (500 meters = 0.5 km)
                        const { data: callerData } = await supabase
                            .from("users")
                            .select("latitude, longitude")
                            .eq("id", errand.buddycaller_id)
                            .single();

                        if (callerData?.latitude && callerData?.longitude) {
                            const distanceKm = LocationService.calculateDistance(
                                runnerLat,
                                runnerLon,
                                callerData.latitude,
                                callerData.longitude
                            );
                            const distanceMeters = distanceKm * 1000;

                            if (__DEV__) console.log(`📍 [Web Real-time] Errand ${errand.id} distance check: ${distanceMeters.toFixed(2)}m [runner source: ${locationSource}]`);

                            if (distanceMeters > 500) {
                                if (__DEV__) console.log(`❌ [Web Real-time] Skipping notification for errand ${errand.id} - distance: ${distanceMeters.toFixed(2)}m (exceeds 500m)`);
                                return;
                            }

                            if (__DEV__) console.log('✅ [Web Real-time] Runner is online and within 500m, showing errand notification');
                            incrementUnread();
                        } else {
                            if (__DEV__) console.log('❌ [Web Real-time] Caller has no location, not showing errand notification');
                        }
                    } catch (error) {
                        console.error('Error checking runner availability for errand notification:', error);
                    }
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [incrementUnread]);

    const goToAcceptedTasks = () => {
        const type = activeTab === "Commissions" ? "commissions" : "errands";
        router.push(`/buddyrunner/accepted_tasks_web?type=${encodeURIComponent(type)}` as any);
    };

    // Location prompt handlers
    const handleEnableLocation = async () => {
        setLocationPromptLoading(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                console.error('No user found');
                setLocationPromptLoading(false);
                return;
            }

            if (__DEV__) console.log('🔄 Requesting location permission and saving to database...');
            const result = await LocationService.requestAndSaveLocation(user.id);

            if (result.success) {
                if (__DEV__) console.log('✅ Location enabled and saved successfully');
                setLocationPromptVisible(false);
                // Only turn availability ON if location permission is actually granted and geolocation succeeds
                await toggleAvailability(true);
                // Refetch commissions after location is enabled to update distance filtering
                if (refetchCommissions) {
                    if (__DEV__) console.log('🔄 [Web] Refetching commissions after location enabled');
                    setTimeout(() => {
                        refetchCommissions();
                    }, 500); // Small delay to ensure database update is complete
                }
            } else {
                console.error('❌ Failed to enable location:', result.error);
                // Check if error is PERMISSION_DENIED (code 1)
                if (result.error && result.error.toLowerCase().includes('permission denied')) {
                    // Hide the generic location prompt modal
                    setLocationPromptVisible(false);
                    // Show the blocked-permission modal - do NOT set availability to ON
                    setPermissionBlockedVisible(true);
                    // Ensure availability stays OFF (it should already be OFF, but be explicit)
                    await toggleAvailability(false);
                } else {
                    // Show generic alert for other errors (timeout, unavailable, etc.)
                    Alert.alert(
                        'Location Error',
                        result.error || 'Failed to enable location. Please check your device settings and try again.'
                    );
                    // For other errors, also keep availability OFF
                    await toggleAvailability(false);
                }
            }
        } catch (error) {
            console.error('Error enabling location:', error);
            Alert.alert('Error', 'An unexpected error occurred. Please try again.');
            // Ensure availability stays OFF on error
            await toggleAvailability(false);
        } finally {
            setLocationPromptLoading(false);
        }
    };

    const handleCancelLocationPrompt = async () => {
        setLocationPromptVisible(false);
        // Turn off availability since location is required
        await toggleAvailability(false);
    };

    /* ---------- Logout flow: confirm -> sign out -> success -> /login ---------- */
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [successOpen, setSuccessOpen] = useState(false);

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
    /* ------------------------------------------------------------------------- */

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }}>
            {/* Modals */}
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
                    // 3) Navigate AFTER user taps OK (matches your screenshot flow)
                    router.replace("/login");
                }}
            />
            <GeofenceErrorModal
                visible={geofenceErrorVisible}
                onClose={() => setGeofenceErrorVisible(false)}
            />
            <WaitingForLocationModal
                visible={waitingForLocationVisible}
                onClose={() => setWaitingForLocationVisible(false)}
            />
            <LocationPromptModalWeb
                visible={locationPromptVisible}
                onEnableLocation={handleEnableLocation}
                onCancel={handleCancelLocationPrompt}
                isLoading={locationPromptLoading}
            />

            {/* Permission Blocked Modal (WEB only) */}
            {Platform.OS === "web" && (
                <Modal transparent animationType="fade" visible={permissionBlockedVisible} onRequestClose={() => setPermissionBlockedVisible(false)}>
                    <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)", alignItems: "center", justifyContent: "center", padding: 16 }}>
                        <View style={{ width: 400, maxWidth: "90%", backgroundColor: "#fff", borderRadius: 16, padding: 24, alignItems: "center", boxShadow: "0 4px 20px rgba(0,0,0,0.15)" }}>
                            <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: "#EF4444", alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
                                <Ionicons name="location-outline" size={32} color="#fff" />
                            </View>
                            <Text style={{ color: colors.text, fontSize: 18, fontWeight: "700", marginBottom: 8, textAlign: "center" }}>
                                Location Access Blocked
                            </Text>
                            <Text style={{ color: colors.text, fontSize: 14, opacity: 0.8, marginBottom: 24, textAlign: "center", lineHeight: 20 }}>
                                You blocked location access in your browser. Please enable it in Site Settings.
                            </Text>
                            <TouchableOpacity
                                onPress={async () => {
                                    setPermissionBlockedVisible(false);
                                    // Automatically set availability to OFF when permission is blocked
                                    await toggleAvailability(false);
                                }}
                                style={{ backgroundColor: colors.maroon, paddingVertical: 14, borderRadius: 12, width: "100%", alignItems: "center", justifyContent: "center" }}
                            >
                                <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>OK</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </Modal>
            )}

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
                    <View style={web.topBar}>
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
                        <Text style={web.welcome}>
                            {loading ? "Loading…" : `Welcome back, ${firstName}!`}
                        </Text>
                        <TouchableOpacity
                            onPress={() => {
                                router.push("/buddyrunner/notification");
                            }}
                            style={web.notificationIcon}
                            activeOpacity={0.7}
                        >
                            <Ionicons name="notifications-outline" size={24} color={colors.text} />
                            {unreadCount > 0 && (
                                <View style={web.notificationBadge}>
                                    <Text style={web.notificationBadgeText}>
                                        {unreadCount > 99 ? '99+' : unreadCount}
                                    </Text>
                                </View>
                            )}
                        </TouchableOpacity>
                    </View>
                    

                    {/* Tabs */}
                    <View style={web.tabsWrapper}>
                        <View style={[web.tabsContainer, { maxWidth: 980 }]}>
                            <TouchableOpacity
                                style={[web.tabItem, activeTab === "Errands" && web.tabItemActive]}
                                onPress={() => setActiveTab("Errands")}
                            >
                                <Text style={[web.tabText, activeTab === "Errands" && web.tabTextActive]}>
                                    Errands
                                </Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[web.tabItem, activeTab === "Commissions" && web.tabItemActive]}
                                onPress={() => setActiveTab("Commissions")}
                            >
                                <Text style={[web.tabText, activeTab === "Commissions" && web.tabTextActive]}>
                                    Commissions
                                </Text>
                            </TouchableOpacity>
                        </View>
                    </View>

                    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingVertical: 24 }}>
                        <View style={[web.container, { maxWidth: 980 }]}>
                            {activeTab === "Errands" ? (
                                <>
                                    <StatsRow
                                        availableMode={availableMode}
                                        availabilityLoading={availabilityLoading}
                                        onToggleAvailable={() => toggleAvailability(!availableMode)}
                                        onAcceptedPress={goToAcceptedTasks}
                                        ratingValue={errandsRating}
                                        completedCount={todayCompletedErrandsCount}
                                    />
                                    <Text style={web.sectionTitle}>Available List of Errands</Text>

                                    {availableMode && !availabilityLoading ? (
                                        errandsLoading ? (
                                        <Text style={{ color: colors.text }}>Loading errands…</Text>
                                    ) : errands.length === 0 ? (
                                            <Text style={{ color: colors.text, opacity: 0.7 }}>
                                                No nearby errands available. Try changing your location or checking again later.
                                            </Text>
                                    ) : (
                                        <View style={{ gap: 12, marginBottom: 36 }}>
                                            {errands.map((e) => (
                                                <ErrandRow
                                                    key={e.id}
                                                    data={{
                                                        id: String(e.id),
                                                        title: e.title,
                                                        category: e.category,
                                                        status: e.status,
                                                        requester: e.requester,
                                                    }}
                                                />
                                            ))}
                                        </View>
                                        )
                                    ) : (
                                        <Text style={{ color: colors.text, opacity: 0.7, marginTop: 16 }}>
                                            You are currently inactive. Turn your status ON to see available errands.
                                        </Text>
                                    )}
                                </>
                            ) : (
                                <>
                                    <StatsRow
                                        availableMode={availableMode}
                                        availabilityLoading={availabilityLoading}
                                        onToggleAvailable={() => toggleAvailability(!availableMode)}
                                        onAcceptedPress={goToAcceptedTasks}
                                        ratingValue={commissionsRating}
                                        completedCount={todayCompletedCount}
                                    />
                                    {availableMode && !availabilityLoading ? (
                                        <>
                                    <Text style={web.sectionTitle}>Available List of Commission</Text>

                                            {(() => {
                                                console.log('🎨 [RENDER] Commission section rendering:', {
                                                    availableMode,
                                                    availabilityLoading,
                                                    commLoading,
                                                    commError: commError || null,
                                                    commissionsCount: commissions.length,
                                                    commissions: commissions.map(c => ({ id: c.id, title: c.title }))
                                                });
                                                
                                                if (commLoading) {
                                                    return <Text style={{ color: colors.text }}>Loading commissions…</Text>;
                                                } else if (commError) {
                                                    return <Text style={{ color: "#b91c1c" }}>Error: {commError}</Text>;
                                                } else if (commissions.length === 0) {
                                                    return <Text style={{ color: colors.text, opacity: 0.7 }}>No commissions available.</Text>;
                                                } else {
                                                    console.log('✅ [RENDER] Rendering', commissions.length, 'commissions');
                                                    return (
                                        <View style={{ gap: 12, marginBottom: 36 }}>
                                            {commissions.map((c) => (
                                                <CommissionRow key={c.id} c={c} />
                                            ))}
                                        </View>
                                                    );
                                                }
                                            })()}
                                        </>
                                    ) : (
                                        <Text style={{ color: colors.text, opacity: 0.7, marginTop: 16 }}>
                                            Turn your status ON to see available commissions.
                                        </Text>
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
                    <TouchableOpacity onPress={onToggle} style={[web.sideMenuBtn, !open && { marginRight: 0 }]}>
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
                        active
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
            {open && (
                <Text style={[web.sideItemText, active && { color: "#fff", fontWeight: "700" }]}>{label}</Text>
            )}
        </TouchableOpacity>
    );
}

/* ======================= STATS (WEB) ======================= */
function StatsRow({
    availableMode,
    availabilityLoading,
    onToggleAvailable,
    onAcceptedPress,
    ratingValue,
    completedCount,
}: {
    availableMode: boolean;
    availabilityLoading: boolean;
    onToggleAvailable: () => void;
    onAcceptedPress: () => void;
    ratingValue: number;
    completedCount?: number;
}) {
    const { width } = useWindowDimensions();
    const isSmallScreen = width < 768;
    const isMediumScreen = width >= 768 && width < 1024;
    
    // Responsive sizes
    const iconSize = isSmallScreen ? 28 : isMediumScreen ? 34 : 40;
    const cardHeight = isSmallScreen ? 90 : isMediumScreen ? 105 : 120;
    const cardPadding = isSmallScreen ? 12 : isMediumScreen ? 15 : 18;
    const statValueSize = isSmallScreen ? 24 : isMediumScreen ? 30 : 36;
    const statLabelSize = isSmallScreen ? 11 : isMediumScreen ? 12 : 14;
    const gap = isSmallScreen ? 8 : isMediumScreen ? 12 : 16;
    
    return (
        <View style={[web.statRow, { gap, flexWrap: isSmallScreen ? 'wrap' : 'nowrap' }]}>
            <TouchableOpacity 
                activeOpacity={0.9} 
                style={[web.statCard, { height: cardHeight, padding: cardPadding }]} 
                onPress={onAcceptedPress}
            >
                <Ionicons name="time-outline" size={iconSize} color={colors.maroon} style={{ marginBottom: 0 }} />
                <Text style={[web.statLabel, { fontSize: statLabelSize }]}>Accepted Tasks</Text>
            </TouchableOpacity>

            <View style={[web.statCard, { height: cardHeight, padding: cardPadding }]}>
                <Text style={[web.statValue, { fontSize: statValueSize, lineHeight: statValueSize }]}>
                    {completedCount !== undefined ? completedCount : 7}
                </Text>
                <Text style={[web.statLabel, { fontSize: statLabelSize }]}>Completed Tasks</Text>
            </View>

            <TouchableOpacity 
                activeOpacity={0.9} 
                onPress={onToggleAvailable} 
                style={[web.statCard, { height: cardHeight, padding: cardPadding }]}
            >
                <Text style={[
                    web.statValue, 
                    { fontSize: statValueSize, lineHeight: statValueSize },
                    availabilityLoading ? web.statValueOff : (availableMode ? web.statValueAccent : web.statValueOff)
                ]}>
                    {availabilityLoading ? "..." : (availableMode ? "ON" : "OFF")}
                </Text>
                <Text style={[web.statLabel, { fontSize: statLabelSize }]}>
                    {availableMode ? "Active" : "Inactive"}
                </Text>
            </TouchableOpacity>

            <View style={[web.statCard, { height: cardHeight, padding: cardPadding }]}>
                <Text style={[web.statValue, { fontSize: statValueSize, lineHeight: statValueSize }]}>
                    {ratingValue.toFixed(1)}
                </Text>
                <Text style={[web.statLabel, { fontSize: statLabelSize }]}>Rating</Text>
            </View>
        </View>
    );
}

/* ======================= ROWS (WEB) ======================= */
function ErrandRow({
    data,
}: {
    data: { id: string; title: string; category?: string; status: UiStatus; requester: string };
}) {
    const router = useRouter();
    const openWebView = () => {
        router.push(`/buddyrunner/view_errand_web?id=${encodeURIComponent(data.id)}`);
    };

    return (
        <TouchableOpacity style={web.errandRow} onPress={openWebView} activeOpacity={0.9}>
            <View
                style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 4,
                    width: "100%",
                }}
            >
                <Text style={{ fontWeight: "900", color: colors.text, fontSize: 14 }}>{data.title}</Text>
                <Text style={{ color: colors.maroon, fontWeight: "700", fontSize: 12 }}>View &gt;</Text>
            </View>

            <View style={web.pill}>
                <Text style={web.pillText}>{data.category || data.title}</Text>
            </View>

            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6 }}>
                <Ionicons name="location-outline" size={12} color={colors.maroon} />
                <Text style={{ color: colors.text, fontSize: 11 }}>Location</Text>
            </View>
        </TouchableOpacity>
    );
}

function CommissionRow({ c }: { c: CommissionUI }) {
    const router = useRouter();
    const openCommissionWeb = () => {
        router.push(`/buddyrunner/view_commission_web?id=${encodeURIComponent(String(c.id))}`);
    };

    const types = parseCommissionTypes(c.commissionType);
    const displayTypes = types.length > 0 ? types : ["General"];

    return (
        <TouchableOpacity style={web.commRow} onPress={openCommissionWeb} activeOpacity={0.9}>
            <View
                style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 4,
                    width: "100%",
                }}
            >
                <Text style={{ fontWeight: "900", color: colors.text, fontSize: 14 }}>
                    {c.title || "(No title)"}
                </Text>
                <Text style={{ color: colors.maroon, fontWeight: "700", fontSize: 12 }}>View &gt;</Text>
            </View>

            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                {displayTypes.map((type, index) => (
                    <View key={index} style={web.pillSmall}>
                        <Text style={web.pillSmallText}>{type}</Text>
                    </View>
                ))}
            </View>

            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 }}>
                <Ionicons name="star" size={14} color="#F59E0B" />
                <Text style={{ color: colors.text, fontSize: 12 }}>{(c.rating ?? 5).toFixed(1)}</Text>
            </View>
        </TouchableOpacity>
    );
}

/* =============================== WEB STYLES =============================== */
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
        marginRight: 12,
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
    sideItem: {
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        paddingVertical: 14,
        paddingHorizontal: 16,
    },
    sideItemCollapsed: { justifyContent: "center", paddingHorizontal: 0, gap: 0, height: 56 },
    sideItemText: { color: colors.text, fontSize: 14, fontWeight: "600" },

    mainArea: { flex: 1, backgroundColor: "#fff" },
    topBar: {
        height: 90,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        borderBottomWidth: 1,
        borderBottomColor: "#EDE9E8",
        paddingHorizontal: 16,
    },
    welcome: { color: colors.text, fontSize: 18, fontWeight: "900" },
    notificationIcon: { padding: 8, borderRadius: 8, backgroundColor: colors.faint, position: "relative" },
    notificationBadge: {
        position: "absolute",
        top: 2,
        right: 2,
        backgroundColor: "#FF4444",
        borderRadius: 10,
        minWidth: 20,
        height: 20,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 2,
        borderColor: "#fff",
    },
    notificationBadgeText: {
        color: "#fff",
        fontSize: 10,
        fontWeight: "700",
        textAlign: "center",
    },

    tabsWrapper: { paddingHorizontal: 16, paddingVertical: 12, alignItems: "center" },
    tabsContainer: {
        flexDirection: "row",
        backgroundColor: colors.maroon,
        borderRadius: 12,
        padding: 4,
        width: "100%",
    },
    tabItem: {
        flex: 1,
        paddingVertical: 11,
        borderRadius: 10,
        alignItems: "center",
        justifyContent: "center",
    },
    tabItemActive: { backgroundColor: "#fff" },
    tabText: { fontSize: 15, fontWeight: "600", color: "#fff" },
    tabTextActive: { color: colors.text },

    container: { width: "100%", maxWidth: 980, alignSelf: "center", paddingHorizontal: 8 },

    statRow: { flexDirection: "row", flexWrap: "nowrap", gap: 16, marginBottom: 18 },
    statCard: {
        flex: 1,
        minWidth: 140, // Minimum width for small screens
        backgroundColor: "#fff",
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 12,
        padding: 18,
        justifyContent: "center",
        alignItems: "center",
        gap: 6,
    },
    statValue: {
        fontSize: 36,
        fontWeight: "900",
        color: colors.text,
        lineHeight: 36,
        textAlign: "center",
    },
    statValueAccent: { color: "#39d353" },
    statValueOff: { color: "#9CA3AF" },
    statLabel: {
        fontSize: 14,
        fontWeight: "700",
        color: colors.text,
        opacity: 0.85,
        marginTop: 2,
        textAlign: "center",
    },

    sectionTitle: { color: colors.text, fontWeight: "900", fontSize: 16, marginBottom: 10 },

    errandRow: {
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 12,
        paddingVertical: 10,
        paddingHorizontal: 14,
        backgroundColor: "#fff",
    },
    commRow: {
        borderWidth: 1,
        borderColor: colors.maroon,
        borderRadius: 12,
        paddingVertical: 10,
        paddingHorizontal: 14,
        backgroundColor: "#fff",
    },

    sidebarFooter: { padding: 12, gap: 10 },
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

    pill: {
        backgroundColor: colors.maroon,
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 999,
        alignSelf: "flex-start",
    },
    pillText: { color: "#fff", fontSize: 11, fontWeight: "800" },

    pillSmall: {
        backgroundColor: colors.maroon,
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 999,
        alignSelf: "flex-start",
    },
    pillSmallText: { color: "#fff", fontSize: 11, fontWeight: "800" },
});

/* =============================== MOBILE LAYOUT =============================== */
function HomeMobile() {
    const router = useRouter();
    const pathname = usePathname();
    const [activeTab, setActiveTab] = useState<"Errands" | "Commissions">("Errands");
    const [availableMode, setAvailableMode] = useState<boolean>(false);
    const [availabilityLoading, setAvailabilityLoading] = useState<boolean>(true);

    // Global notification badge
    const { unreadCount, incrementUnread, clearUnread } = useNotificationBadge();
    if (__DEV__) console.log('🔔 [HOME MOBILE] Rendering with unreadCount:', unreadCount);
    
    // Location prompt modal state
    const [locationPromptVisible, setLocationPromptVisible] = useState(false);
    const [locationPromptLoading, setLocationPromptLoading] = useState(false);
    
    // Geofence error modal state
    const [geofenceErrorVisible, setGeofenceErrorVisible] = useState(false);
    
    // Waiting for location modal state
    const [waitingForLocationVisible, setWaitingForLocationVisible] = useState(false);

    // Get window dimensions for mobile browser detection
    const { width } = useWindowDimensions();

    // CRITICAL: Ref to store direct geolocation call function for MOBILE BROWSERS ONLY
    // This must be set up BEFORE the click handler to preserve gesture chain
    const directGeolocationCallRef = useRef<(() => void) | null>(null);

    // Helper to detect if this is a mobile browser (not desktop browser, not native app)
    const isMobileBrowser = (): boolean => {
        if (Platform.OS !== 'web') return false;
        if (typeof window === 'undefined') return false;
        
        const isSmallScreen = width < 900;
        const userAgent = (window as any).navigator?.userAgent || (window as any).navigator?.vendor || (window as any).opera || '';
        const isMobileUserAgent = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent.toLowerCase());
        
        return isSmallScreen && isMobileUserAgent;
    };

    // Set up direct geolocation call on mount (for MOBILE BROWSERS ONLY)
    React.useEffect(() => {
        if (isMobileBrowser() && (window as any).navigator?.geolocation) {
            directGeolocationCallRef.current = () => {
                // This function does NOTHING except call geolocation immediately
                // NO checks, NO conditions, NO property access - just direct call
                ((window as any).navigator.geolocation as any).getCurrentPosition(
                    async (position: GeolocationPosition) => {
                        setLocationPromptLoading(true);
                        if (__DEV__) console.log('✅ [Mobile Browser] Location obtained successfully');
                        
                        const locationData = {
                            latitude: position.coords.latitude,
                            longitude: position.coords.longitude,
                            accuracy: position.coords.accuracy || 0,
                            timestamp: new Date(position.timestamp)
                        };
                        
                        try {
                            const { data: { user } } = await supabase.auth.getUser();
                            if (!user) {
                                Alert.alert('Error', 'User not found');
                                setLocationPromptLoading(false);
                                return;
                            }
                            
                            const saved = await LocationService.updateLocationInDatabase(user.id, locationData);
                            
                            if (saved) {
                                if (__DEV__) console.log('✅ [Web] Location saved to database');
                                setLocationPromptVisible(false);
                                setLocationPromptLoading(false);
                                if (refetchCommissionsMobile) {
                                    setTimeout(() => {
                                        refetchCommissionsMobile();
                                    }, 500);
                                }
                            } else {
                                Alert.alert('Error', 'Failed to save location to database');
                                setLocationPromptLoading(false);
                            }
                        } catch (error: any) {
                            console.error('[Mobile Browser] Error saving location:', error);
                            Alert.alert('Error', 'Failed to save location');
                            setLocationPromptLoading(false);
                        }
                    },
                    (error: GeolocationPositionError) => {
                        console.error('❌ [Mobile Browser] Geolocation error:', error);
                        setLocationPromptLoading(false);
                        
                        let errorMessage = 'Failed to get location';
                        let showManualInstructions = false;
                        
                        if (error.code === 1) {
                            errorMessage = 'Location permission was denied.';
                            showManualInstructions = true;
                        } else if (error.code === 2) {
                            errorMessage = 'Location is unavailable.';
                            showManualInstructions = true;
                        } else if (error.code === 3) {
                            errorMessage = 'Location request timed out. Please try again.';
                        }
                        
                        const fullMessage = showManualInstructions
                            ? `${errorMessage}\n\nPlease enable location access manually:\n\n1. Open your browser settings\n2. Go to Site Settings or Permissions\n3. Enable Location access for this site\n\nOr enable location in your phone's Settings app.`
                            : errorMessage;
                        
                        Alert.alert('Location Access Required', fullMessage);
                    },
                    {
                        enableHighAccuracy: true,
                        timeout: 20000,
                        maximumAge: 0
                    }
                );
            };
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [width]);


    // Function to toggle availability and save to database
    const toggleAvailability = async (newStatus: boolean) => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                console.log('❌ No user found when trying to toggle availability');
                return;
            }

            console.log(`🔄 Toggling availability for user ${user.id} to:`, newStatus);

            // PRE-VALIDATION FLOW: When turning ON, validate BEFORE updating state or database
            // UI must remain OFF until validation succeeds
            if (newStatus) {
                // PRE-VALIDATION STEP 1: Fetch GPS location (one-time fetch, not tracking)
                // Location can be fetched even while status is OFF - this is the pre-validation check
                let locationResult = null;
                
                try {
                    // GPS Warm-up / Retry: Attempt to get GPS up to 3 times within ~3-5 seconds
                    const maxRetries = 3;
                    const retryDelayMs = 1000; // 1 second between retries
                    
                    for (let attempt = 1; attempt <= maxRetries; attempt++) {
                        if (attempt > 1) {
                            // Wait before retry (except first attempt)
                            await new Promise(resolve => setTimeout(resolve, retryDelayMs));
                        }
                        
                        // Wrap each GPS attempt in try/catch to prevent exceptions from bypassing retry logic
                        try {
                            locationResult = await LocationService.getCurrentLocation();
                            
                            if (locationResult.success && locationResult.location) {
                                break; // GPS acquired successfully
                            }
                            
                            if (__DEV__) {
                                console.log(`🔄 GPS attempt ${attempt}/${maxRetries} failed, retrying...`);
                            }
                        } catch (gpsError) {
                            // GPS attempt threw an exception - catch it and continue retrying
                            if (__DEV__) {
                                console.log(`🔄 GPS attempt ${attempt}/${maxRetries} threw exception:`, gpsError);
                            }
                            locationResult = {
                                success: false,
                                error: gpsError instanceof Error ? gpsError.message : 'GPS acquisition failed'
                            };
                            // Continue to next retry attempt
                        }
                    }
                    
                    // PRE-VALIDATION STEP 2: Check GPS availability
                    // If GPS is still not available after retries
                    if (!locationResult || !locationResult.success || !locationResult.location) {
                        // Status remains OFF, show modal, return early
                        setWaitingForLocationVisible(true);
                        return; // Early return - UI and database remain OFF
                    }

                    const { latitude, longitude } = locationResult.location;

                    // PRE-VALIDATION STEP 3: Validate GPS coordinates
                    // Client-side guard: Validate GPS coordinates before calling Edge Function
                    if (latitude === null || latitude === undefined || longitude === null || longitude === undefined) {
                        // Status remains OFF, show modal, return early
                        setWaitingForLocationVisible(true);
                        return; // Early return - UI and database remain OFF
                    }

                    if (isNaN(latitude) || isNaN(longitude)) {
                        // Status remains OFF, show modal, return early
                        setWaitingForLocationVisible(true);
                        return; // Early return - UI and database remain OFF
                    }

                    // PRE-VALIDATION STEP 4: Geofence validation (authoritative backend check)
                    // Call backend Edge Function for authoritative geofence validation
                    const { data: validationResult, error: validationError } = await supabase.functions.invoke(
                        'validate-availability',
                        {
                            body: {
                                runner_id: user.id,
                                latitude: latitude,
                                longitude: longitude,
                            },
                        }
                    );

                    // PRE-VALIDATION STEP 5: Handle geofence validation result
                    if (validationError) {
                        // Network/server error - status remains OFF
                        console.error('❌ Geofence validation error:', validationError);
                        Alert.alert(
                            'Validation Error',
                            'Unable to validate location. Please try again.'
                        );
                        return; // Early return - UI and database remain OFF
                    }

                    if (!validationResult?.allowed) {
                        // Geofence violation - status remains OFF, show modal
                        setGeofenceErrorVisible(true);
                        return; // Early return - UI and database remain OFF
                    }

                    // ✅ PRE-VALIDATION PASSED: Runner is inside UM Matina
                    // Now we can proceed with updating availability
                    console.log('✅ Geofence validation passed - proceeding with availability update');
                    
                } catch (geofenceError) {
                    // Outer catch: Only for network errors or unexpected errors (not GPS availability)
                    // Status remains OFF on error
                    console.error('❌ Error during geofence validation:', geofenceError);
                    Alert.alert(
                        'Validation Error',
                        'An error occurred while validating your location. Please try again.'
                    );
                    return; // Early return - UI and database remain OFF
                }
                
                // ✅ VALIDATION SUCCEEDED: Only reach here if geofence validation passed
                // Now update UI state and database - this is the ONLY place status changes to ON
            }

            // POST-VALIDATION: Update state and database
            // This only executes if:
            // - Turning OFF (no validation needed), OR
            // - Turning ON AND validation succeeded (all early returns avoided)
            setAvailableMode(newStatus);

            // Prepare update data
            const updateData: any = { is_available: newStatus };
            
            // If turning OFF, clear location data
            if (!newStatus) {
                updateData.latitude = null;
                updateData.longitude = null;
                updateData.location_updated_at = null;
                if (__DEV__) console.log('🗑️ [Mobile] Clearing location data (going offline)');
            }

            // Save to database - try to update is_available field
            const { error } = await supabase
                .from('users')
                .update(updateData)
                .eq('id', user.id);

            if (error) {
                console.error('❌ Could not update is_available field:', error.message);
                console.error('Full error:', error);
                // If the field doesn't exist, we'll just keep the local state
            } else {
                if (__DEV__) console.log('✅ Successfully updated is_available to:', newStatus);
                if (!newStatus) {
                    if (__DEV__) console.log('✅ [Mobile] Location data cleared from database');
                }
                
                // Verify the update by querying the user again
                const { data: updatedUser, error: verifyError } = await supabase
                    .from('users')
                    .select('id, first_name, last_name, is_available')
                    .eq('id', user.id)
                    .single();
                
                if (verifyError) {
                    console.error('❌ Could not verify update:', verifyError);
                } else {
                    console.log('✅ Verification - User availability is now:', updatedUser.is_available);
                }
            }
        } catch (error) {
            console.error('❌ Error updating availability:', error);
        }
    };

    const { loading, firstName, averageRating } = useAuthProfile();

    // Get tab-specific ratings
    const { rating: errandsRating } = useTabSpecificRating("Errands");
    const { rating: commissionsRating } = useTabSpecificRating("Commissions");

    const { loading: errandsLoading, rows: errands, refetch: refetchErrands } = useAvailableErrands({ availableMode });
    const {
        loading: commLoading,
        rows: commissions,
        errorText: commError,
        refetch: refetchCommissionsMobile,
    } = useAvailableCommissions({ availableMode });
    const { count: todayCompletedCount } = useTodayCompletedCommissions();
    const { count: todayCompletedErrandsCount } = useTodayCompletedErrands();

    // Load current availability status from database on component mount
    React.useEffect(() => {
        const loadAvailabilityStatus = async () => {
            try {
                const { data: { user } } = await supabase.auth.getUser();
                if (!user) {
                    setAvailabilityLoading(false);
                    return;
                }

                const { data, error } = await supabase
                    .from('users')
                    .select('is_available')
                    .eq('id', user.id)
                    .single();

                if (error) {
                    console.log('Error loading availability status:', error);
                    // Keep default false if there's an error
                    setAvailableMode(false);
                    setAvailabilityLoading(false);
                    return;
                }

                // Use the actual database value instead of forcing false
                const dbAvailability = data?.is_available ?? false;
                setAvailableMode(dbAvailability);
                setAvailabilityLoading(false);
                    
                console.log('✅ Loaded availability status from database:', dbAvailability);
            } catch (error) {
                console.error('Error loading availability status:', error);
                setAvailableMode(false);
                setAvailabilityLoading(false);
            }
        };

        loadAvailabilityStatus();
    }, []);

    // Refetch errands when availability changes (Mobile)
    React.useEffect(() => {
        if (!availabilityLoading && refetchErrands) {
            refetchErrands();
        }
    }, [availableMode, availabilityLoading, refetchErrands]);

    // Refetch commissions when availability changes (Mobile)
    React.useEffect(() => {
        if (!availabilityLoading && refetchCommissionsMobile) {
            refetchCommissionsMobile();
        }
    }, [availableMode, availabilityLoading, refetchCommissionsMobile]);

    // Check location status and immediately update when availability is turned ON (Mobile)
    React.useEffect(() => {
        const checkAndUpdateLocation = async () => {
            if (!availableMode || availabilityLoading) {
                return;
            }

            try {
                const { data: { user } } = await supabase.auth.getUser();
                if (!user) return;

                if (__DEV__) console.log('🔍 [Mobile] Checking location status for user:', user.id);
                const locationStatus = await LocationService.checkLocationStatus(user.id);

                if (__DEV__) console.log('📍 [Mobile] Location status:', locationStatus);

                // For native mobile apps, check permission and request location if needed
                if (Platform.OS === 'web') {
                    // For web browsers, don't automatically request location
                    // Only show modal if location is not in database
                    if (!locationStatus.locationInDatabase) {
                        if (__DEV__) console.log('⚠️ [Mobile Web] Location not in database, showing prompt modal');
                        setLocationPromptVisible(true);
                        return;
                    }
                    if (__DEV__) console.log('✅ [Mobile Web] Location exists in database, no need to request again');
                } else {
                    // Native mobile app - can check permission and request location
                    if (!locationStatus.hasPermission) {
                        if (__DEV__) console.log('⚠️ [Mobile Native] Location permission not granted, showing prompt modal');
                        setLocationPromptVisible(true);
                        return;
                    }

                    // If permission is granted, immediately request and save current location
                    if (__DEV__) console.log('🔄 [Mobile Native] Status is ON and permission granted - immediately updating location...');
                    const locationResult = await LocationService.requestAndSaveLocation(user.id);
                    
                    if (locationResult.success) {
                        if (__DEV__) console.log('✅ [Mobile Native] Immediate location updated successfully');
                        // Refetch commissions after location is saved
                        if (refetchCommissionsMobile) {
                            setTimeout(() => {
                                refetchCommissionsMobile();
                            }, 500);
                        }
                    } else {
                        if (__DEV__) console.warn('⚠️ [Mobile Native] Failed to get immediate location:', locationResult.error);
                        // Show modal if location couldn't be obtained
                        setLocationPromptVisible(true);
                    }
                }
            } catch (error) {
                console.error('❌ [Mobile] Error checking/updating location:', error);
            }
        };

        checkAndUpdateLocation();
    }, [availableMode, availabilityLoading, refetchCommissionsMobile]);

    // Real-time location tracking when status is ON (Mobile)
    React.useEffect(() => {
        let locationSubscription: any = null;

        const startLocationTracking = async () => {
            // Only track if available mode is ON and not loading
            if (!availableMode || availabilityLoading) {
                if (__DEV__) console.log('📍 [Mobile] Location tracking not started - status is OFF or loading');
                return;
            }

            try {
                const { data: { user } } = await supabase.auth.getUser();
                if (!user) {
                    if (__DEV__) console.log('❌ [Mobile] No user found for location tracking');
                    return;
                }

                if (__DEV__) console.log('🔄 [Mobile] Starting real-time location tracking for user:', user.id);

                // Immediately update location when tracking starts (ensures fresh location on mount or toggle)
                if (__DEV__) console.log('🔄 [Mobile] Immediately updating location when tracking starts...');
                try {
                    const immediateResult = await LocationService.requestAndSaveLocation(user.id);
                    if (immediateResult.success) {
                        if (__DEV__) console.log('✅ [Mobile] Immediate location updated when tracking started');
                        // Refetch commissions after immediate location update
                        if (refetchCommissionsMobile) {
                            setTimeout(() => {
                                refetchCommissionsMobile();
                            }, 500);
                        }
                    } else {
                        if (__DEV__) console.warn('⚠️ [Mobile] Failed to get immediate location when tracking started:', immediateResult.error);
                    }
                } catch (error) {
                    console.error('❌ [Mobile] Error getting immediate location when tracking started:', error);
                }

                // Start watching location changes
                locationSubscription = await LocationService.watchLocation(
                    async (location) => {
                        if (__DEV__) {
                            console.log('📍 [Mobile] Location updated:', {
                                lat: location.latitude.toFixed(6),
                                lng: location.longitude.toFixed(6),
                                accuracy: location.accuracy.toFixed(2)
                            });
                        }

                        // Update location in database
                        const updated = await LocationService.updateLocationInDatabase(user.id, location);
                        if (updated) {
                            if (__DEV__) console.log('✅ [Mobile] Location saved to database');
                            // Refetch commissions after location is saved to update distance filtering
                            if (refetchCommissionsMobile) {
                                if (__DEV__) console.log('🔄 [Mobile] Refetching commissions after location update');
                                setTimeout(() => {
                                    refetchCommissionsMobile();
                                }, 500); // Small delay to ensure database update is complete
                            }
                        } else {
                            if (__DEV__) console.warn('⚠️ [Mobile] Failed to save location to database');
                        }
                    },
                    {
                        // Update every 30 seconds or when user moves 50 meters
                        timeInterval: 30000,
                        distanceInterval: 50,
                    }
                );

                if (locationSubscription) {
                    if (__DEV__) console.log('✅ [Mobile] Location tracking started successfully');
                } else {
                    if (__DEV__) console.warn('⚠️ [Mobile] Failed to start location tracking');
                }
            } catch (error) {
                console.error('❌ [Mobile] Error starting location tracking:', error);
            }
        };

        startLocationTracking();

        // Cleanup function - stop tracking when component unmounts or availability changes
        return () => {
            if (locationSubscription) {
                if (__DEV__) console.log('🛑 [Mobile] Stopping location tracking');
                locationSubscription.remove();
                locationSubscription = null;
            }
        };
    }, [availableMode, availabilityLoading, refetchCommissionsMobile]);

    // Set availability to OFF when user logs out
    React.useEffect(() => {
        const handleLogout = async () => {
            try {
                const { data: { user } } = await supabase.auth.getUser();
                if (!user) return;

                // Set availability to OFF in database
                await supabase
                    .from('users')
                    .update({ is_available: false })
                    .eq('id', user.id);
                    
                console.log('✅ Set availability to OFF on logout');
            } catch (error) {
                console.error('Error setting availability to OFF on logout:', error);
            }
        };

        // Listen for auth state changes (login/logout)
        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event) => {
            if (event === 'SIGNED_IN') {
                try {
                    const { data: { user } } = await supabase.auth.getUser();
                    if (user) {
                        await supabase
                            .from('users')
                            .update({ is_available: false })
                            .eq('id', user.id);
                        setAvailableMode(false);
                        console.log('✅ Defaulted availability to OFF on login');
                    }
                } catch (error) {
                    console.error('Error defaulting availability to OFF on login:', error);
                }
            } else if (event === 'SIGNED_OUT') {
                handleLogout();
            }
        });

        return () => subscription.unsubscribe();
    }, []);

    // Set up real-time subscription for new commissions
    // Wait for availability status to load before setting up subscription
    React.useEffect(() => {
        // Only set up subscription after availability status is loaded
        if (availabilityLoading) {
            console.log('⏳ Waiting for availability status to load before setting up notification subscription');
            return;
        }

        let mounted = true;
        let subscriptionChannel: any = null;
        let retryTimer: any = null;
        let isResubscribing = false;
        let retryAttempts = 0;
        
        const setupSubscription = async () => {
            try {
                // Get current user first to verify authentication
                const { data: { user } } = await supabase.auth.getUser();
                if (!user) {
                    console.log('❌ No user found, skipping notification subscription setup');
                    return;
                }

                console.log('🔧 Setting up mobile notification subscription for user:', user.id);
                console.log('   Current availability status:', availableMode);
                
                const RETRY_DELAY_MS = 3000;
                const MAX_RETRIES = 3;

                subscriptionChannel = supabase
                    .channel('home_notifications_mobile_' + user.id + '_' + Date.now())
                    .on(
                        'postgres_changes',
                        {
                            event: 'INSERT',
                            schema: 'public',
                            table: 'commission',
                            filter: 'status=eq.pending'
                        },
                        async (payload) => {
                            if (!mounted) {
                                console.log('Component unmounted, ignoring notification');
                                return;
                            }
                            
                            // Log minimal details to avoid RN console deep-inspection overhead
                            console.log('🔔 New commission detected on mobile home screen:', {
                                id: payload.new?.id,
                                status: payload.new?.status,
                            });
                            
                            // Check if runner is online before showing notification
                            try {
                                const { data: { user: currentUser } } = await supabase.auth.getUser();
                                if (!currentUser || !mounted) {
                                    console.log('No user or component unmounted');
                                    return;
                                }

                                const commission = payload.new;
                                
                                // Don't show notification if commission already has a runner assigned
                                if (commission?.runner_id) {
                                    console.log('❌ Commission already has a runner, skipping notification');
                                    return;
                                }
                                
                                // Don't show notification if this commission was posted by the current user
                                if (commission?.buddycaller_id === currentUser.id) {
                                    console.log('❌ Commission was posted by current user, skipping notification');
                                    return;
                                }
                                
                                // Don't show notification if current user was declined for this commission
                                if (commission?.declined_runner_id === currentUser.id) {
                                    console.log('❌ User was declined for this commission, skipping notification');
                                    return;
                                }

                                // Check if runner is online (available) and has location - use fresh database check
                                const { data: runnerData, error: runnerError } = await supabase
                                    .from("users")
                                    .select("is_available, latitude, longitude")
                                    .eq("id", currentUser.id)
                                    .single();

                                if (runnerError) {
                                    console.error('❌ Error checking runner availability:', runnerError);
                                    return;
                                }

                                console.log('   Runner availability check:', {
                                    is_available: runnerData?.is_available,
                                    has_location: !!(runnerData?.latitude && runnerData?.longitude),
                                    mounted: mounted,
                                    user_id: currentUser.id
                                });

                                if (!runnerData?.is_available) {
                                    console.log('❌ Runner is offline, not showing notification');
                                    return;
                                }

                                // Use device's current GPS location for filtering (not database location)
                                if (__DEV__) console.log('🔄 [Mobile Real-time] Getting device current GPS location for notification check...');
                                let runnerLat: number;
                                let runnerLon: number;
                                let locationSource: 'gps' | 'database' = 'gps';

                                try {
                                    const locationResult = await LocationService.getCurrentLocation();
                                    
                                    if (locationResult.success && locationResult.location) {
                                        runnerLat = locationResult.location.latitude;
                                        runnerLon = locationResult.location.longitude;
                                        locationSource = 'gps';
                                        if (__DEV__) {
                                            console.log('✅ [Mobile Real-time] Device current GPS location obtained:', { 
                                                lat: runnerLat, 
                                                lon: runnerLon,
                                                accuracy: locationResult.location.accuracy,
                                                runnerId: currentUser.id,
                                                source: locationSource
                                            });
                                        }
                                    } else {
                                        throw new Error(locationResult.error || 'Failed to get GPS location');
                                    }
                                } catch (error) {
                                    if (__DEV__) console.warn('⚠️ [Mobile Real-time] Failed to get device current GPS location, falling back to database location:', error);
                                    
                                    // Fallback to database location if GPS fails
                                    const dbLat = typeof runnerData?.latitude === 'number' ? runnerData.latitude : parseFloat(String(runnerData?.latitude || ''));
                                    const dbLon = typeof runnerData?.longitude === 'number' ? runnerData.longitude : parseFloat(String(runnerData?.longitude || ''));
                                    
                                    if (!dbLat || !dbLon || isNaN(dbLat) || isNaN(dbLon)) {
                                        if (__DEV__) console.log('❌ [Mobile Real-time] Database location also invalid, not showing notification');
                                        return;
                                    }
                                    
                                    runnerLat = dbLat;
                                    runnerLon = dbLon;
                                    locationSource = 'database';
                                    if (__DEV__) {
                                        console.log('✅ [Mobile Real-time] Using database location as fallback:', { 
                                            lat: runnerLat, 
                                            lon: runnerLon,
                                            runnerId: currentUser.id,
                                            source: locationSource
                                        });
                                    }
                                }

                                // Check distance (500 meters = 0.5 km)
                                const { data: callerData } = await supabase
                                    .from("users")
                                    .select("latitude, longitude")
                                    .eq("id", commission.buddycaller_id)
                                    .single();

                                if (callerData?.latitude && callerData?.longitude) {
                                    const distanceKm = LocationService.calculateDistance(
                                        runnerLat,
                                        runnerLon,
                                        callerData.latitude,
                                        callerData.longitude
                                    );
                                    const distanceMeters = distanceKm * 1000;

                                    if (__DEV__) console.log(`📍 [Mobile Real-time] Commission ${commission.id} distance check: ${distanceMeters.toFixed(2)}m [runner source: ${locationSource}]`);

                                    if (distanceMeters > 500) {
                                        if (__DEV__) console.log(`❌ [Mobile Real-time] Skipping notification for commission ${commission.id} - distance: ${distanceMeters.toFixed(2)}m (exceeds 500m)`);
                                        return;
                                    }

                                    // Only increment notification count if runner is online, has location, within 500m, and component is mounted
                                    if (mounted) {
                                        if (__DEV__) console.log('✅ Runner is online and within 500m, incrementing notification count');
                                        incrementUnread();
                                    }
                                } else {
                                    if (__DEV__) console.log('❌ Caller has no location, not showing notification');
                                }
                            } catch (error) {
                                console.error('❌ Error checking runner availability for notification:', error);
                            }
                        }
                    )
                    .on(
                        'postgres_changes',
                        {
                            event: 'INSERT',
                            schema: 'public',
                            table: 'errand',
                            filter: 'status=eq.pending'
                        },
                        async (payload) => {
                            if (!mounted) {
                                console.log('Component unmounted, ignoring errand notification');
                                return;
                            }
                            
                            console.log('🔔 New errand detected on mobile home screen:', {
                                id: payload.new?.id,
                                status: payload.new?.status,
                            });
                            
                            // Check if runner is online before showing notification
                            try {
                                const { data: { user: currentUser } } = await supabase.auth.getUser();
                                if (!currentUser || !mounted) {
                                    console.log('No user or component unmounted');
                                    return;
                                }

                                const errand = payload.new;
                                
                                // Don't show notification if errand already has a runner assigned
                                if (errand?.runner_id) {
                                    console.log('❌ Errand already has a runner, skipping notification');
                                    return;
                                }
                                
                                // Don't show notification if this errand was posted by the current user
                                if (errand?.buddycaller_id === currentUser.id) {
                                    console.log('❌ Errand was posted by current user, skipping notification');
                                    return;
                                }

                                // Check if runner is online (available) and has location
                                const { data: runnerData, error: runnerError } = await supabase
                                    .from("users")
                                    .select("is_available, latitude, longitude")
                                    .eq("id", currentUser.id)
                                    .single();

                                if (runnerError) {
                                    console.error('❌ Error checking runner availability:', runnerError);
                                    return;
                                }

                                if (!runnerData?.is_available) {
                                    console.log('❌ Runner is offline, not showing errand notification');
                                    return;
                                }

                                // Use device's current GPS location for filtering
                                if (__DEV__) console.log('🔄 [Mobile Real-time] Getting device current GPS location for errand notification check...');
                                let runnerLat: number;
                                let runnerLon: number;
                                let locationSource: 'gps' | 'database' = 'gps';

                                try {
                                    const locationResult = await LocationService.getCurrentLocation();
                                    
                                    if (locationResult.success && locationResult.location) {
                                        runnerLat = locationResult.location.latitude;
                                        runnerLon = locationResult.location.longitude;
                                        locationSource = 'gps';
                                        if (__DEV__) {
                                            console.log('✅ [Mobile Real-time] Device current GPS location obtained for errand:', { 
                                                lat: runnerLat, 
                                                lon: runnerLon,
                                                accuracy: locationResult.location.accuracy,
                                                runnerId: currentUser.id,
                                                source: locationSource
                                            });
                                        }
                                    } else {
                                        throw new Error(locationResult.error || 'Failed to get GPS location');
                                    }
                                } catch (error) {
                                    if (__DEV__) console.warn('⚠️ [Mobile Real-time] Failed to get device current GPS location, falling back to database location:', error);
                                    
                                    // Fallback to database location if GPS fails
                                    const dbLat = typeof runnerData?.latitude === 'number' ? runnerData.latitude : parseFloat(String(runnerData?.latitude || ''));
                                    const dbLon = typeof runnerData?.longitude === 'number' ? runnerData.longitude : parseFloat(String(runnerData?.longitude || ''));
                                    
                                    if (!dbLat || !dbLon || isNaN(dbLat) || isNaN(dbLon)) {
                                        if (__DEV__) console.log('❌ [Mobile Real-time] Database location also invalid, not showing errand notification');
                                        return;
                                    }
                                    
                                    runnerLat = dbLat;
                                    runnerLon = dbLon;
                                    locationSource = 'database';
                                }

                                // Check distance (500 meters = 0.5 km)
                                const { data: callerData } = await supabase
                                    .from("users")
                                    .select("latitude, longitude")
                                    .eq("id", errand.buddycaller_id)
                                    .single();

                                if (callerData?.latitude && callerData?.longitude) {
                                    const distanceKm = LocationService.calculateDistance(
                                        runnerLat,
                                        runnerLon,
                                        callerData.latitude,
                                        callerData.longitude
                                    );
                                    const distanceMeters = distanceKm * 1000;

                                    if (__DEV__) console.log(`📍 [Mobile Real-time] Errand ${errand.id} distance check: ${distanceMeters.toFixed(2)}m [runner source: ${locationSource}]`);

                                    if (distanceMeters > 500) {
                                        if (__DEV__) console.log(`❌ [Mobile Real-time] Skipping notification for errand ${errand.id} - distance: ${distanceMeters.toFixed(2)}m (exceeds 500m)`);
                                        return;
                                    }

                                    // Only increment notification count if runner is online, has location, within 500m, and component is mounted
                                    if (mounted) {
                                        if (__DEV__) console.log('✅ Runner is online and within 500m, incrementing errand notification count');
                                        incrementUnread();
                                    }
                                } else {
                                    if (__DEV__) console.log('❌ Caller has no location, not showing errand notification');
                                }
                            } catch (error) {
                                console.error('❌ Error checking runner availability for errand notification:', error);
                            }
                        }
                    )
                    .subscribe((status) => {
                        console.log('📡 Mobile notification subscription status:', status);
                        if (status === 'SUBSCRIBED') {
                            console.log('✅ Mobile notification subscription is active and ready');
                            return;
                        }

                        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
                            // Avoid red screen: warn instead of error, and retry with backoff
                            console.warn('⚠️ Mobile notification subscription encountered an issue. Retrying shortly...');
                            if (!isResubscribing && mounted && retryAttempts < MAX_RETRIES) {
                                isResubscribing = true;
                                if (subscriptionChannel) {
                                    try { supabase.removeChannel(subscriptionChannel); } catch {}
                                    subscriptionChannel = null;
                                }
                                if (retryTimer) { clearTimeout(retryTimer); }
                                retryTimer = setTimeout(() => {
                                    if (mounted) {
                                        retryAttempts += 1;
                                        isResubscribing = false;
                                        setupSubscription();
                                    }
                                }, RETRY_DELAY_MS);
                            }
                            return;
                        }

                        console.log('ℹ️ Mobile notification subscription status:', status);
                    });

                if (!subscriptionChannel) {
                    console.error('❌ Failed to create subscription channel');
                } else {
                    console.log('✅ Subscription channel created successfully');
                }
            } catch (error) {
                console.error('❌ Error setting up mobile notification subscription:', error);
            }
        };

        setupSubscription();

        return () => {
            mounted = false;
            console.log('🧹 Cleaning up mobile notification subscription');
            if (subscriptionChannel) {
                supabase.removeChannel(subscriptionChannel);
                subscriptionChannel = null;
            }
            if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
        };
    }, [availabilityLoading]);

    const onAcceptedPressMobile = () => {
        const type = activeTab === "Commissions" ? "commissions" : "errands";
        router.push(`/buddyrunner/accepted_tasks?type=${encodeURIComponent(type)}` as any);
    };

    const goHome = () => {
        if (pathname !== "/buddyrunner/home") router.replace("/buddyrunner/home");
    };
    const goMessages = () => {
        if (pathname !== "/buddyrunner/messages_list") router.replace("/buddyrunner/messages_list");
    };
    const goProfile = () => {
        if (pathname !== "/buddyrunner/profile") router.replace("/buddyrunner/profile");
    };

    // Location prompt handlers (Mobile)
    const handleEnableLocationMobile = () => {
        // CRITICAL: For MOBILE BROWSERS ONLY, call ref function IMMEDIATELY
        // This preserves the gesture chain required for native permission prompt
        if (isMobileBrowser() && directGeolocationCallRef.current) {
            directGeolocationCallRef.current();
            return;
        }
        
        // For desktop browser and native mobile app, use LocationService
        (async () => {
            setLocationPromptLoading(true);
            try {
                const { data: { user } } = await supabase.auth.getUser();
                if (!user) {
                    console.error('No user found');
                    setLocationPromptLoading(false);
                    return;
                }

                const platformLabel = Platform.OS === 'web' ? 'Desktop Browser' : 'Mobile Native';
                if (__DEV__) console.log(`🔄 [${platformLabel}] Requesting location permission and saving to database...`);
                const result = await LocationService.requestAndSaveLocation(user.id);

                if (result.success) {
                    if (__DEV__) console.log(`✅ [${platformLabel}] Location enabled and saved successfully`);
                    setLocationPromptVisible(false);
                    if (refetchCommissionsMobile) {
                        setTimeout(() => {
                            refetchCommissionsMobile();
                        }, 500);
                    }
                } else {
                    console.error(`❌ [${platformLabel}] Failed to enable location:`, result.error);
                    Alert.alert(
                        'Location Error',
                        result.error || 'Failed to enable location. Please check your device settings and try again.'
                    );
                }
            } catch (error) {
                console.error('Error enabling location:', error);
                Alert.alert('Error', 'An unexpected error occurred. Please try again.');
            } finally {
                setLocationPromptLoading(false);
            }
        })();
    };

    const handleCancelLocationPromptMobile = async () => {
        setLocationPromptVisible(false);
        // Turn off availability since location is required
        await toggleAvailability(false);
    };

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }}>
            {Platform.OS !== "web" && <Stack.Screen options={{ animation: "none" }} />}
            {/* Geofence Error Modal */}
            <GeofenceErrorModal
                visible={geofenceErrorVisible}
                onClose={() => setGeofenceErrorVisible(false)}
            />
            {/* Waiting for Location Modal */}
            <WaitingForLocationModal
                visible={waitingForLocationVisible}
                onClose={() => setWaitingForLocationVisible(false)}
            />

            {/* Location Prompt Modal */}
            <LocationPromptModal
                visible={locationPromptVisible}
                onEnableLocation={handleEnableLocationMobile}
                onCancel={handleCancelLocationPromptMobile}
                isLoading={locationPromptLoading}
                onGeolocationSuccess={async (position: GeolocationPosition) => {
                    setLocationPromptLoading(true);
                    if (__DEV__) console.log('✅ [Mobile Browser] Location obtained successfully');
                    
                    const locationData = {
                        latitude: position.coords.latitude,
                        longitude: position.coords.longitude,
                        accuracy: position.coords.accuracy || 0,
                        timestamp: new Date(position.timestamp)
                    };
                    
                    try {
                        const { data: { user } } = await supabase.auth.getUser();
                        if (!user) {
                            Alert.alert('Error', 'User not found');
                            setLocationPromptLoading(false);
                            return;
                        }
                        
                        const saved = await LocationService.updateLocationInDatabase(user.id, locationData);
                        
                        if (saved) {
                            if (__DEV__) console.log('✅ [Mobile Browser] Location saved to database');
                            setLocationPromptVisible(false);
                            setLocationPromptLoading(false);
                            if (refetchCommissionsMobile) {
                                setTimeout(() => {
                                    refetchCommissionsMobile();
                                }, 500);
                            }
                        } else {
                            Alert.alert('Error', 'Failed to save location to database');
                            setLocationPromptLoading(false);
                        }
                    } catch (error: any) {
                        console.error('[Mobile Browser] Error saving location:', error);
                        Alert.alert('Error', 'Failed to save location');
                        setLocationPromptLoading(false);
                    }
                }}
                onGeolocationError={(error: GeolocationPositionError) => {
                    console.error('❌ [Mobile Browser] Geolocation error:', error);
                    setLocationPromptLoading(false);
                    
                    let errorMessage = 'Failed to get location';
                    let showManualInstructions = false;
                    
                    if (error.code === 1) {
                        errorMessage = 'Location permission was denied.';
                        showManualInstructions = true;
                    } else if (error.code === 2) {
                        errorMessage = 'Location is unavailable.';
                        showManualInstructions = true;
                    } else if (error.code === 3) {
                        errorMessage = 'Location request timed out. Please try again.';
                    }
                    
                    const fullMessage = showManualInstructions
                        ? `${errorMessage}\n\nPlease enable location access manually:\n\n1. Open your browser settings\n2. Go to Site Settings or Permissions\n3. Enable Location access for this site\n\nOr enable location in your phone's Settings app.`
                        : errorMessage;
                    
                    Alert.alert('Location Access Required', fullMessage);
                }}
            />

            {/* Top brand */}
            <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 10 }}>
                <View
                    style={{
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "space-between",
                    }}
                >
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                        <Image source={require("../../assets/images/logo.png")} style={{ width: 22, height: 22, resizeMode: "contain" }} />
                        <Text style={{ fontWeight: "900", color: colors.text, fontSize: 18 }}>GoBuddy</Text>
                    </View>
                    <TouchableOpacity
                        onPress={() => {
                            router.push("/buddyrunner/notification");
                        }}
                        activeOpacity={0.9}
                        style={{ position: "relative" }}
                    >
                        <Ionicons name="notifications-outline" size={24} color={colors.text} />
                        {unreadCount > 0 && (
                            <View style={m.notificationBadge}>
                                <Text style={m.notificationBadgeText}>
                                    {unreadCount > 99 ? '99+' : unreadCount}
                                </Text>
                            </View>
                        )}
                    </TouchableOpacity>
                </View>
                <Text style={{ color: colors.text, fontSize: 16, fontWeight: "700", marginTop: 8 }}>
                    {loading ? "Loading…" : `Welcome back, ${firstName}!`}
                </Text>
            </View>

            {/* Tabs */}
            <View style={m.tabsWrap}>
                <View style={m.tabsTrack}>
                    <TouchableOpacity
                        onPress={() => setActiveTab("Errands")}
                        style={[m.tab, activeTab === "Errands" && m.tabActive]}
                        activeOpacity={0.9}
                    >
                        <Text style={[m.tabText, activeTab === "Errands" && m.tabTextActive]}>Errands</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        onPress={() => setActiveTab("Commissions")}
                        style={[m.tab, activeTab === "Commissions" && m.tabActive]}
                        activeOpacity={0.9}
                    >
                        <Text style={[m.tabText, activeTab === "Commissions" && m.tabTextActive]}>
                            Commission
                        </Text>
                    </TouchableOpacity>
                </View>
            </View>

            <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 90 }}>
                {activeTab === "Commissions" ? (
                    <>
                        <MobileStatsCard
                            availableOn={availableMode}
                            ratingValue={commissionsRating}
                            completed={todayCompletedCount}
                            availabilityLoading={availabilityLoading}
                            onToggleAvailable={() => toggleAvailability(!availableMode)}
                            onAcceptedPress={onAcceptedPressMobile}
                        />
                        {availableMode && !availabilityLoading ? (
                            <>
                        <Text style={m.sectionHeader}>Available Commissions</Text>

                                {(() => {
                                    console.log('🎨 [RENDER MOBILE] Commission section rendering:', {
                                        availableMode,
                                        availabilityLoading,
                                        commLoading,
                                        commError: commError || null,
                                        commissionsCount: commissions.length,
                                        commissions: commissions.map(c => ({ id: c.id, title: c.title }))
                                    });
                                    
                                    if (commLoading) {
                                        return <Text style={{ color: colors.text }}>Loading commissions…</Text>;
                                    } else if (commError) {
                                        return <Text style={{ color: "#b91c1c" }}>Error: {commError}</Text>;
                                    } else if (commissions.length === 0) {
                                        return <Text style={{ color: colors.text, opacity: 0.7 }}>No commissions available.</Text>;
                                    } else {
                                        console.log('✅ [RENDER MOBILE] Rendering', commissions.length, 'commissions');
                                        return (
                            <View style={{ gap: 10 }}>
                                {commissions.map((c) => (
                                    <CommissionerCardMobile key={c.id} c={c} />
                                ))}
                            </View>
                                        );
                                    }
                                })()}
                            </>
                        ) : (
                            <Text style={{ color: colors.text, opacity: 0.7, marginTop: 16 }}>
                                Turn your status ON to see available commissions.
                            </Text>
                        )}
                    </>
                ) : (
                    <>
                        <MobileStatsCard
                            availableOn={availableMode}
                            ratingValue={errandsRating}
                            completed={todayCompletedErrandsCount}
                            availabilityLoading={availabilityLoading}
                            onToggleAvailable={() => toggleAvailability(!availableMode)}
                            onAcceptedPress={onAcceptedPressMobile}
                        />
                        <Text style={m.sectionHeader}>Available List of Errands</Text>

                        {availableMode && !availabilityLoading ? (
                            errandsLoading ? (
                            <Text style={{ color: colors.text }}>Loading errands…</Text>
                        ) : errands.length === 0 ? (
                                <Text style={{ color: colors.text, opacity: 0.7 }}>
                                    No nearby errands available. Try changing your location or checking again later.
                                </Text>
                        ) : (
                            <View style={{ gap: 10 }}>
                                {errands.map((e) => (
                                    <ErrandCardMobile
                                        key={e.id}
                                        data={{
                                            id: e.id,
                                            title: e.title,
                                            category: e.category,
                                            status: e.status,
                                            requester: e.requester,
                                        }}
                                    />
                                ))}
                            </View>
                            )
                        ) : (
                            <Text style={{ color: colors.text, opacity: 0.7, marginTop: 12 }}>
                                You are currently inactive. Turn your status ON to see available errands.
                            </Text>
                        )}
                    </>
                )}
            </ScrollView>

            <MobileBottomBar onHome={goHome} onMessages={goMessages} onProfile={goProfile} />
        </SafeAreaView>
    );
}

/* ===== Mobile shared components ===== */
function MobileStatsCard({
    availableOn,
    availabilityLoading,
    ratingValue,
    completed,
    onToggleAvailable,
    onAcceptedPress,
}: {
    availableOn: boolean;
    availabilityLoading: boolean;
    ratingValue: number;
    completed: number;
    onToggleAvailable: () => void;
    onAcceptedPress: () => void;
}) {
    return (
        <View style={m.statsCard}>
            <View style={m.statsRow}>
                <TouchableOpacity style={m.statItem} activeOpacity={0.9} onPress={onAcceptedPress}>
                    <Ionicons name="time-outline" size={32} color={colors.maroon} />
                    <Text style={m.statLabel}>Accepted Tasks</Text>
                </TouchableOpacity>

                <TouchableOpacity style={m.statItem} activeOpacity={0.9} onPress={onToggleAvailable}>
                    <Text style={[m.statBig, { color: availabilityLoading ? "#9CA3AF" : (availableOn ? "#22C55E" : "#9CA3AF") }]}>
                        {availabilityLoading ? "..." : (availableOn ? "ON" : "OFF")}
                    </Text>
                    <Text style={m.statLabel}>{availableOn ? "Active" : "Inactive"}</Text>
                </TouchableOpacity>
            </View>

            <View style={[m.statsRow, { marginTop: 10 }]}>
                <View style={m.statItem}>
                    <Text style={m.statBig}>{ratingValue.toFixed(1)}</Text>
                    <Text style={m.statLabel}>Rates</Text>
                </View>

                <View style={m.statItem}>
                    <Text style={[m.statBig, { color: colors.maroon }]}>{completed}</Text>
                    <Text style={m.statLabel}>Completed Tasks</Text>
                </View>
            </View>
        </View>
    );
}

function ErrandCardMobile({
    data,
}: {
    data: { id: number; title: string; category?: string; status: UiStatus; requester: string };
}) {
    const router = useRouter();
    const openMobileView = () => {
        router.push(`/buddyrunner/view_errand?id=${encodeURIComponent(String(data.id))}`);
    };

    return (
        <TouchableOpacity
            style={{
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 12,
                padding: 12,
                backgroundColor: "#fff",
            }}
            onPress={openMobileView}
            activeOpacity={0.9}
        >
            <View
                style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 4,
                }}
            >
                <Text style={{ fontWeight: "900", color: colors.text, fontSize: 14 }}>{data.title}</Text>
                <Text style={{ color: colors.maroon, fontWeight: "700", fontSize: 12 }}>View &gt;</Text>
            </View>

            <View
                style={{
                    backgroundColor: colors.maroon,
                    paddingHorizontal: 10,
                    paddingVertical: 4,
                    borderRadius: 999,
                    alignSelf: "flex-start",
                }}
            >
                <Text style={{ color: "#fff", fontWeight: "800", fontSize: 11 }}>
                    {data.category || data.title}
                </Text>
            </View>

            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6 }}>
                <Ionicons name="location-outline" size={12} color={colors.maroon} />
                <Text style={{ color: colors.text, fontSize: 11 }}>Location</Text>
            </View>
        </TouchableOpacity>
    );
}

function CommissionerCardMobile({ c }: { c: CommissionUI }) {
    const router = useRouter();
    const openCommissionMobile = () => {
        router.push(`/buddyrunner/view_commission?id=${encodeURIComponent(String(c.id))}`);
    };

    const types = parseCommissionTypes(c.commissionType);
    const displayTypes = types.length > 0 ? types : ["General"];

    return (
        <TouchableOpacity
            style={{
                borderWidth: 1,
                borderColor: colors.maroon,
                borderRadius: 12,
                padding: 12,
                backgroundColor: "#fff",
            }}
            onPress={openCommissionMobile}
            activeOpacity={0.9}
        >
            <View
                style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 4,
                }}
            >
                <Text style={{ fontWeight: "900", color: colors.text, fontSize: 14 }}>
                    {c.title || "(No title)"}
                </Text>
                <Text style={{ color: colors.maroon, fontWeight: "700", fontSize: 12 }}>View &gt;</Text>
            </View>

            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                {displayTypes.map((type, index) => (
                    <View
                        key={index}
                        style={{
                            backgroundColor: colors.maroon,
                            paddingHorizontal: 10,
                            paddingVertical: 4,
                            borderRadius: 999,
                            alignSelf: "flex-start",
                        }}
                    >
                        <Text style={{ color: "#fff", fontWeight: "800", fontSize: 11 }}>{type}</Text>
                    </View>
                ))}
            </View>

            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 }}>
                <Ionicons name="star" size={14} color="#F59E0B" />
                <Text style={{ color: colors.text, fontSize: 12 }}>{(c.rating ?? 5).toFixed(1)}</Text>
            </View>
        </TouchableOpacity>
    );
}

function MobileBottomBar({
    onHome,
    onMessages,
    onProfile,
}: {
    onHome: () => void;
    onMessages: () => void;
    onProfile: () => void;
}) {
    return (
        <View style={m.bottomBar}>
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
        </View>
    );
}

/* =============================== MOBILE STYLES =============================== */
const m = StyleSheet.create({
    tabsWrap: { paddingHorizontal: 16, paddingBottom: 8 },
    tabsTrack: {
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: colors.maroon,
        borderRadius: 14,
        padding: 6,
    },
    tab: {
        flex: 1,
        height: 42,
        borderRadius: 10,
        alignItems: "center",
        justifyContent: "center",
    },
    tabActive: { backgroundColor: "#fff", borderWidth: 2, borderColor: colors.maroon, elevation: 2 },
    tabText: { fontSize: 15, fontWeight: "700", color: "#fff" },
    tabTextActive: { color: colors.text },

    sectionHeader: { color: colors.text, fontWeight: "900", marginVertical: 12 },

    statsCard: {
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 12,
        padding: 14,
        backgroundColor: "#fff",
        marginBottom: 14,
    },
    statsRow: { flexDirection: "row", gap: 18 },
    statItem: { flex: 1, alignItems: "center" },
    statBig: {
        fontSize: 28,
        fontWeight: "900",
        color: colors.text,
        lineHeight: 30,
        marginTop: 2,
        textAlign: "center",
    },
    statLabel: {
        marginTop: 6,
        fontSize: 11,
        fontWeight: "700",
        color: colors.text,
        opacity: 0.85,
        textAlign: "center",
    },

    bottomBar: {
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        height: 91,
        backgroundColor: colors.maroon,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-around",
        paddingHorizontal: 16,
        paddingBottom: 30,
        paddingTop: 10,
    },
    bottomItem: { alignItems: "center", justifyContent: "center" },
    bottomText: { color: "#fff", fontSize: 12, marginTop: 4 },

    notificationBadge: {
        position: "absolute",
        top: -2,
        right: -2,
        backgroundColor: "#FF4444",
        borderRadius: 10,
        minWidth: 20,
        height: 20,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 2,
        borderColor: "#fff",
    },
    notificationBadgeText: {
        color: "#fff",
        fontSize: 10,
        fontWeight: "700",
        textAlign: "center",
    },
});
