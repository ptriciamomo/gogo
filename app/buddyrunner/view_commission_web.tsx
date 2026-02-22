import React, { useCallback, useEffect, useMemo, useState, useRef } from "react";
import {
    ActivityIndicator,
    Alert,
    Image,
    Modal,
    Platform,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
    useWindowDimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { supabase } from "../../lib/supabase";
import { sendCommissionAcceptanceMessage } from "../../utils/supabaseHelpers";

const C = {
    backdrop: "rgba(0,0,0,0.38)",
    bg: "#FBF7F6",
    border: "#E5C8C5",
    maroon: "#7E1B16",
    maroonDeep: "#6b1713",
    chipBg: "#7E1B16",
    chipText: "#FFFFFF",
    text: "#4A1916",
    sub: "#6B6B6B",
    white: "#FFFFFF",
};

type Commission = {
    id: number | string;
    title?: string | null;
    description?: string | null;
    commission_type?: string | null;
    due_at?: string | null;
    scheduled_meetup?: boolean | null;
    meetup_location?: string | null;
    status?: string | null;
    buddycaller_id?: string | null;
    runner_id?: string | null;
    notified_runner_id?: string | null;
    notified_expires_at?: string | null;
    accepted_at?: string | null;
    invoice_status?: string | null;
};

type BuddyCaller = {
    id: string;
    first_name?: string | null;
    last_name?: string | null;
    student_id_number?: string | null;
    course?: string | null;
    profile_picture_url?: string | null;
};

const HIDE_SCROLLBAR_CSS = `
  #commissionScroller { -ms-overflow-style:none; scrollbar-width:none; }
  #commissionScroller::-webkit-scrollbar { display:none; }
`;

const ACTIVE = ["accepted", "in_progress"] as const;
const isWeb = Platform.OS === "web";
function showMsg(title: string, body?: string, onOK?: () => void) {
    if (isWeb) {
        window.alert(body ? `${title}\n\n${body}` : title);
        onOK?.();
    } else {
        Alert.alert(title, body, [{ text: "OK", onPress: onOK }]);
    }
}


function prettyType(s?: string | null) {
    if (!s) return "General";
    return s.toString().replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim().toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

// Helper function to parse comma-separated commission types
function parseCommissionTypes(s?: string | null): string[] {
    if (!s) return [];
    return s
        .split(',')
        .map(type => prettyType(type.trim()))
        .filter(type => type.length > 0);
}
function formatDueAt(due?: string | null) {
    if (!due) return "—";
    try {
        const d = new Date(due);
        const dateStr = d.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
        const timeStr = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
        return `${dateStr} – ${timeStr}`;
    } catch {
        return String(due);
    }
}

export default function ViewCommissionWeb() {
    const router = useRouter();
    const { id, withSidebar } = useLocalSearchParams<{ id?: string; withSidebar?: string }>();

    const [loading, setLoading] = useState(true);
    const [accepting, setAccepting] = useState(false);
    const [commission, setCommission] = useState<Commission | null>(null);
    const [caller, setCaller] = useState<BuddyCaller | null>(null);

    const [userId, setUserId] = useState<string | null>(null);
    const [hasActiveOther, setHasActiveOther] = useState(false);
    const [checkingActive, setCheckingActive] = useState(true);
    const [successOpen, setSuccessOpen] = useState(false);

    const requesterName = useMemo(() => {
        const f = (caller?.first_name || "").trim();
        const l = (caller?.last_name || "").trim();
        return [f, l].filter(Boolean).join(" ") || "BuddyCaller";
    }, [caller]);

    // unchanged simple nav (fallbacks)
    const goToChat = useCallback(
        (commissionId: string | number) => {
            console.log('ViewCommissionWeb: goToChat called, navigating to messages hub');
            router.replace({ 
                pathname: "/buddyrunner/messages_hub", 
                params: { commissionId: String(commissionId) } 
            });
        },
        [router]
    );

    // NEW: open chat with caller reflected
    const openChatForCaller = useCallback(
        async (updated: Commission, runner: string) => {
            try {
                const callerId = String(updated.buddycaller_id ?? "");
                if (!callerId) {
                    console.log('ViewCommissionWeb: No callerId, navigating to messages hub');
                    router.replace({
                        pathname: "/buddyrunner/messages_hub",
                        params: {
                            commissionId: String(updated.id),
                        },
                    });
                    return;
                }

                let conversationId: string | null = null;

                // Look for existing conversation between these users using legacy schema
                const { data: existing } = await supabase
                    .from("conversations")
                    .select("id")
                    .or(`and(user1_id.eq.${runner},user2_id.eq.${callerId}),and(user1_id.eq.${callerId},user2_id.eq.${runner})`)
                    .limit(1);

                if (existing && existing.length) {
                    conversationId = String(existing[0].id);
                } else {
                    // Create new conversation using legacy user1_id/user2_id pattern
                    const { data: created, error: convErr } = await supabase
                        .from("conversations")
                        .insert({
                            user1_id: runner,
                            user2_id: callerId,
                            created_at: new Date().toISOString(),
                        })
                        .select("id")
                        .single();
                    if (convErr) throw convErr;
                    conversationId = String(created.id);
                }

                console.log('ViewCommissionWeb: Navigating to messages hub with params:', {
                    pathname: "/buddyrunner/messages_hub",
                    commissionId: String(updated.id),
                    conversationId,
                    otherUserId: callerId,
                    contactName: requesterName,
                    contactInitials: `${caller?.first_name?.[0] || ''}${caller?.last_name?.[0] || ''}`.toUpperCase() || 'BC',
                    isOnline: 'true',
                });

                console.log('ViewCommissionWeb: About to call router.replace...');
                router.replace({
                    pathname: "/buddyrunner/messages_hub",
                    params: {
                        commissionId: String(updated.id),
                        conversationId,
                        otherUserId: callerId,
                        contactName: requesterName,
                        contactInitials: `${caller?.first_name?.[0] || ''}${caller?.last_name?.[0] || ''}`.toUpperCase() || 'BC',
                        isOnline: 'true',
                    },
                });
                console.log('ViewCommissionWeb: router.replace called successfully');
            } catch (error) {
                console.error('ViewCommissionWeb: Error in openChatForCaller, falling back to messages hub:', error);
                // Fallback to messages hub instead of direct chat screen
                router.replace({
                    pathname: "/buddyrunner/messages_hub",
                    params: {
                        commissionId: String(updated.id),
                    },
                });
            }
        },
        [router, goToChat, requesterName, caller]
    );

    useEffect(() => {
        (async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) setUserId(user.id);
        })();
    }, []);

    useEffect(() => {
        (async () => {
            if (!id) return;
            setLoading(true);
            try {
                const idFilter: string | number = isNaN(Number(id)) ? String(id) : Number(id);
                const { data: cm, error: cErr } = await supabase.from("commission").select("*").eq("id", idFilter).single();
                if (cErr) throw cErr;
                setCommission(cm as Commission);

                if (cm?.buddycaller_id) {
                    const { data: u, error: uErr } = await supabase
                        .from("users")
                        .select("id, first_name, last_name, student_id_number, course, profile_picture_url")
                        .eq("id", cm.buddycaller_id)
                        .single();
                    if (uErr) throw uErr;
                    setCaller(u as BuddyCaller);
                } else {
                    setCaller(null);
                }
            } catch (e: any) {
                if (isWeb) {
                    showMsg("Error", e?.message || "Unable to load commission.");
                } else {
                    Alert.alert("Error", e?.message || "Unable to load commission.");
                }
                setCommission(null);
                setCaller(null);
            } finally {
                setLoading(false);
            }
        })();
    }, [id]);

    // Rule 3
    useEffect(() => {
        (async () => {
            if (!userId || !commission?.id) return;
            setCheckingActive(true);
            try {
                // Check for active commissions with same runner_id
                const { data: activeRunnerCommissions, error: runnerError } = await supabase
                    .from("commission")
                    .select("id")
                    .in("status", ACTIVE as unknown as string[])
                    .eq("runner_id", userId)
                    .neq("id", commission.id)
                    .limit(1);
                
                if (runnerError) throw runnerError;
                
                // Check for active commissions with same caller (buddycaller_id)
                const { data: activeCallerCommissions, error: callerError } = await supabase
                    .from("commission")
                    .select("id")
                    .in("status", ACTIVE as unknown as string[])
                    .eq("buddycaller_id", commission.buddycaller_id)
                    .eq("runner_id", userId)
                    .neq("id", commission.id)
                    .limit(1);
                
                if (callerError) throw callerError;
                
                // Block if runner has any active commissions (either general or with same caller)
                const hasActiveCommissions = (activeRunnerCommissions && activeRunnerCommissions.length > 0) ||
                                          (activeCallerCommissions && activeCallerCommissions.length > 0);
                
                setHasActiveOther(hasActiveCommissions);
            } catch {
                setHasActiveOther(false);
            } finally {
                setCheckingActive(false);
            }
        })();
    }, [userId, commission?.id, commission?.buddycaller_id]);

    const someoneElseTookIt = !!commission?.runner_id && commission.runner_id !== userId;

    const canAccept =
        !checkingActive &&
        !hasActiveOther &&
        !someoneElseTookIt &&
        (!commission?.runner_id || commission.runner_id === userId) &&
        commission?.status !== "accepted" &&
        commission?.status !== "in_progress";

    const acceptCta = someoneElseTookIt
        ? "Already accepted by another runner"
        : hasActiveOther
            ? "Finish the accepted commission first"
            : "Accept Commission";

    /* ---------- TIMEOUT HANDLER ---------- */
    const timeoutTimerRef = useRef<NodeJS.Timeout | null>(null);
    const startedTimerForCommissionIdRef = useRef<number | string | null>(null);
    
    // Start timeout timer when commission is loaded and runner is notified
    useEffect(() => {
        if (!commission) return;
        
        // Only start timer if runner is notified and task is pending
        supabase.auth.getUser().then(({ data: { user } }) => {
            if (!user) return;
            
            if (commission.status === 'pending' && commission.notified_runner_id === user.id && commission.runner_id === null) {
                // Only start timer once per commission ID (prevent restart on re-render)
                if (startedTimerForCommissionIdRef.current === commission.id) {
                    return;
                }
                
                // Clear any existing timer
                if (timeoutTimerRef.current) {
                    clearTimeout(timeoutTimerRef.current);
                    timeoutTimerRef.current = null;
                }
                
                // Calculate remaining time from database field
                const expiresAt = (commission as any).notified_expires_at;
                if (!expiresAt) {
                    console.warn('[Timeout] No notified_expires_at found, skipping timer');
                    startedTimerForCommissionIdRef.current = commission.id;
                    return;
                }
                
                // Validate date before calculating remaining time
                const expiresAtTime = new Date(expiresAt).getTime();
                if (isNaN(expiresAtTime)) {
                    console.warn('[Timeout] Invalid notified_expires_at, skipping timer');
                    startedTimerForCommissionIdRef.current = commission.id;
                    return;
                }
                
                const remainingMs = expiresAtTime - Date.now();
                
                // If already expired, call RPC immediately
                if (remainingMs <= 0) {
                    // Mark that we've handled this commission ID to prevent duplicate calls
                    startedTimerForCommissionIdRef.current = commission.id;
                    (async () => {
                        try {
                            const { data, error } = await supabase.rpc('handle_commission_timeout', {
                                p_commission_id: commission.id,
                                p_runner_id: user.id
                            });
                            
                            if (error) {
                                console.warn('[Timeout] RPC call failed (cron will handle):', error);
                                return;
                            }
                            
                            if (data?.success) {
                                console.log('[Timeout] Handled by runner client (already expired):', data);
                            } else {
                                console.log('[Timeout] Already processed or invalid:', data?.reason);
                            }
                        } catch (e) {
                            console.warn('[Timeout] Error calling RPC (cron will handle):', e);
                        }
                    })();
                    return;
                }
                
                // Mark that we've started a timer for this commission ID
                startedTimerForCommissionIdRef.current = commission.id;
                
                // Start timer with calculated remaining time
                timeoutTimerRef.current = setTimeout(async () => {
                    try {
                        // Call backend RPC function (idempotent, safe)
                        const { data, error } = await supabase.rpc('handle_commission_timeout', {
                            p_commission_id: commission.id,
                            p_runner_id: user.id
                        });
                        
                        if (error) {
                            console.warn('[Timeout] RPC call failed (cron will handle):', error);
                            return;
                        }
                        
                        if (data?.success) {
                            console.log('[Timeout] Handled by runner client:', data);
                            // Task status will update via realtime subscription
                        } else {
                            console.log('[Timeout] Already processed or invalid:', data?.reason);
                        }
                    } catch (e) {
                        console.warn('[Timeout] Error calling RPC (cron will handle):', e);
                    } finally {
                        // Clear the ref when timer fires
                        startedTimerForCommissionIdRef.current = null;
                    }
                }, remainingMs);
            } else {
                // Conditions no longer match, clear timer and ref
                if (timeoutTimerRef.current) {
                    clearTimeout(timeoutTimerRef.current);
                    timeoutTimerRef.current = null;
                }
                startedTimerForCommissionIdRef.current = null;
            }
        });
        
        // Cleanup on unmount or when conditions change
        return () => {
            if (timeoutTimerRef.current) {
                clearTimeout(timeoutTimerRef.current);
                timeoutTimerRef.current = null;
            }
        };
    }, [commission?.id, commission?.status, commission?.notified_runner_id, commission?.runner_id, commission?.notified_expires_at]);
    
    const handleAccept = useCallback(async () => {
        if (!commission || !canAccept || accepting) return;

        // Clear timeout timer immediately on accept
        if (timeoutTimerRef.current) {
            clearTimeout(timeoutTimerRef.current);
            timeoutTimerRef.current = null;
        }
        startedTimerForCommissionIdRef.current = null;

        setAccepting(true);
        try {
            const { data: { user }, error: authErr } = await supabase.auth.getUser();
            if (authErr || !user) throw authErr ?? new Error("Not signed in");

            // Rule 3 re-check
            const { data: activeRows, error: activeErr } = await supabase
                .from("commission")
                .select("id")
                .in("status", ACTIVE as unknown as string[])
                .eq("runner_id", user.id)
                .neq("id", commission.id)
                .limit(1);
            if (activeErr) throw activeErr;
            if (activeRows && activeRows.length > 0) {
                showMsg("Not allowed", "Finish the accepted commission first.");
                return;
            }

            // Additional check: prevent accepting multiple commissions from same caller
            const { data: callerActiveRows, error: callerActiveErr } = await supabase
                .from("commission")
                .select("id")
                .in("status", ACTIVE as unknown as string[])
                .eq("buddycaller_id", commission.buddycaller_id)
                .eq("runner_id", user.id)
                .neq("id", commission.id)
                .limit(1);
            if (callerActiveErr) throw callerActiveErr;
            if (callerActiveRows && callerActiveRows.length > 0) {
                showMsg("Not allowed", "You already have an active commission with this caller.");
                return;
            }

            // Race guard
            const { data: fresh, error: freshErr } = await supabase
                .from("commission")
                .select("runner_id, status")
                .eq("id", commission.id)
                .single();
            if (freshErr) throw freshErr;
            if (fresh?.runner_id && fresh.runner_id !== user.id) {
                showMsg("Unavailable", "This commission was already accepted by another runner.");
                return;
            }
            if (fresh?.status && (ACTIVE as readonly string[]).includes(fresh.status)) {
                showMsg("Unavailable", "This commission is already active.");
                return;
            }

            // Accept + start invoice draft
            const { data: updated, error: updErr } = await supabase
                .from("commission")
                .update({
                    status: "in_progress",  // Changed from "accepted" to "in_progress"
                    runner_id: user.id,
                    accepted_at: new Date().toISOString(),
                    invoice_status: "draft",
                })
                .eq("id", commission.id)
                .select("*")
                .single();
            if (updErr) throw updErr;

            console.log("BuddyRunner Web: Commission updated successfully:", {
                commissionId: updated.id,
                status: updated.status,
                runnerId: updated.runner_id,
                callerId: updated.buddycaller_id
            });

            // Send automatic confirmation message
            try {
                // Get runner and caller details for the message
                const [runnerResult, callerResult] = await Promise.all([
                    supabase.from("users").select("first_name, last_name").eq("id", user.id).single(),
                    supabase.from("users").select("first_name, last_name").eq("id", updated.buddycaller_id).single()
                ]);

                const runnerName = runnerResult.data ? 
                    `${runnerResult.data.first_name || ''} ${runnerResult.data.last_name || ''}`.trim() || 'BuddyRunner' :
                    'BuddyRunner';
                const callerName = callerResult.data ? 
                    `${callerResult.data.first_name || ''} ${callerResult.data.last_name || ''}`.trim() || 'BuddyCaller' :
                    'BuddyCaller';
                const commissionTitle = updated.title || 'Commission';

                // Find or create conversation
                let conversationId: string | null = null;
                const { data: existing } = await supabase
                    .from("conversations")
                    .select("id")
                    .or(`and(user1_id.eq.${user.id},user2_id.eq.${updated.buddycaller_id}),and(user1_id.eq.${updated.buddycaller_id},user2_id.eq.${user.id})`)
                    .limit(1);

                if (existing && existing.length) {
                    conversationId = String(existing[0].id);
                } else {
                    const { data: created, error: convErr } = await supabase
                        .from("conversations")
                        .insert({
                            user1_id: user.id,
                            user2_id: updated.buddycaller_id,
                            created_at: new Date().toISOString(),
                        })
                        .select("id")
                        .single();
                    if (convErr) throw convErr;
                    conversationId = String(created.id);
                }

                // Send the automatic message
                await sendCommissionAcceptanceMessage(
                    conversationId,
                    callerName,
                    runnerName,
                    commissionTitle,
                    user.id // Pass the current user's ID as sender
                );
                console.log("BuddyRunner Web: Sent commission acceptance message");
            } catch (messageError) {
                console.error("BuddyRunner Web: Failed to send commission acceptance message:", messageError);
                // Don't block the flow if message fails
            }

            setCommission(updated as Commission);

            // Show success modal first, then redirect on OK
            setSuccessOpen(true);
        } catch (e: any) {
            showMsg("Failed", e?.message || "Could not accept commission.");
        } finally {
            setAccepting(false);
        }
    }, [commission, canAccept, accepting]);

    const renderInner = (compact: boolean) => (
        <View style={styles.scrollArea}>
            {loading ? (
                <View style={styles.centerBox}>
                    <ActivityIndicator size="large" color={C.maroon} />
                    <Text style={{ color: C.text, marginTop: 10 }}>Loading…</Text>
                </View>
            ) : !commission ? (
                <View style={styles.centerBox}>
                    <Text style={{ color: C.maroonDeep }}>Commission not found.</Text>
                </View>
            ) : (
                <View style={styles.webScroller} nativeID="commissionScroller">
                    <View style={styles.card}>
                        <View style={{ flexDirection: "row", alignItems: "center" }}>
                            <Image
                                source={{ uri: caller?.profile_picture_url || "https://i.pravatar.cc/100?img=3" }}
                                style={styles.avatar}
                            />
                            <View style={{ flex: 1 }}>
                                <Text style={styles.name}>{requesterName}</Text>
                                {!!caller?.student_id_number && <Text style={styles.subLine}>Student ID: {caller.student_id_number}</Text>}
                                {!!caller?.course && <Text style={styles.subLine}>{caller.course}</Text>}
                                <TouchableOpacity 
                                    style={styles.locationBtn} 
                                    activeOpacity={0.9}
                                    onPress={() => {
                                        if (caller?.id) {
                                            router.push({
                                                pathname: "/buddyrunner/profile",
                                                params: {
                                                    userId: caller.id,
                                                    isViewingOtherUser: 'true',
                                                    returnTo: 'ViewCommissionWeb'
                                                }
                                            });
                                        }
                                    }}
                                >
                                    <Text style={styles.locationText}>View Profile</Text>
                                </TouchableOpacity>
                            </View>
                            <TouchableOpacity 
                                style={styles.chatBubble}
                                activeOpacity={0.9}
                                onPress={async () => {
                                    if (!commission || !caller?.id) return;
                                    
                                    try {
                                        const { data: { user } } = await supabase.auth.getUser();
                                        if (!user) return;
                                        
                                        const callerId = String(commission.buddycaller_id ?? "");
                                        if (!callerId) return;
                                        
                                        let conversationId: string | null = null;
                                        
                                        // Look for existing conversation
                                        const { data: existing } = await supabase
                                            .from("conversations")
                                            .select("id")
                                            .or(`and(user1_id.eq.${user.id},user2_id.eq.${callerId}),and(user1_id.eq.${callerId},user2_id.eq.${user.id})`)
                                            .limit(1);
                                        
                                        if (existing && existing.length) {
                                            conversationId = String(existing[0].id);
                                        } else {
                                            // Create new conversation
                                            const { data: created, error: convErr } = await supabase
                                                .from("conversations")
                                                .insert({
                                                    user1_id: user.id,
                                                    user2_id: callerId,
                                                    created_at: new Date().toISOString(),
                                                })
                                                .select("id")
                                                .single();
                                            if (convErr) throw convErr;
                                            conversationId = String(created.id);
                                        }
                                        
                                        // Navigate to messages hub for web
                                        router.replace({
                                            pathname: "/buddyrunner/messages_hub",
                                            params: {
                                                commissionId: String(commission.id),
                                                conversationId,
                                                otherUserId: callerId,
                                                contactName: requesterName,
                                                contactInitials: `${caller?.first_name?.[0] || ''}${caller?.last_name?.[0] || ''}`.toUpperCase() || 'BC',
                                                isOnline: 'true',
                                            },
                                        });
                                    } catch (error) {
                                        console.error('ViewCommissionWeb: Error navigating to chat:', error);
                                    }
                                }}
                            >
                                <Ionicons name="chatbubble-ellipses" size={16} color={C.white} />
                            </TouchableOpacity>
                        </View>
                    </View>

                    <View style={styles.card}>
                        <View style={{ alignItems: "center" }}>
                            <Image source={require("../../assets/images/logo.png")} style={styles.logo} />
                        </View>
                        <View style={styles.hr} />
                        <ChipRow label="Commission Title:" value={String(commission.title ?? "").trim() || "—"} />
                        <ChipRow label="Commission Description:" value={String(commission.description ?? "").trim() || "—"} />
                        <ChipRow label="Commission Type:" value={parseCommissionTypes(commission.commission_type).length > 0 ? parseCommissionTypes(commission.commission_type).join(", ") : "General"} />
                        <ChipRow label="Completion Date:" value={formatDueAt(commission.due_at)} />
                        {commission.scheduled_meetup ? (
                            <ChipRow label="Scheduled Meet-up:" value={String(commission.meetup_location ?? "").trim() || "—"} />
                        ) : null}
                    </View>

                    <View style={styles.bottomMaroon}>
                        <TouchableOpacity
                            onPress={handleAccept}
                            disabled={!canAccept || accepting || checkingActive}
                            activeOpacity={0.9}
                            style={[styles.acceptBtn, compact && styles.acceptBtnCompact, (accepting || !canAccept) && { opacity: 0.85 }]}
                        >
                            {accepting || checkingActive ? (
                                <ActivityIndicator color={C.white} />
                            ) : (
                                <Text style={styles.acceptText}>{acceptCta}</Text>
                            )}
                        </TouchableOpacity>
                    </View>
                </View>
            )}
        </View>
    );

    const showSidebar = isWeb && (withSidebar === "1" || withSidebar === "true");

    // Sidebar helpers (copied from BuddyRunner web pages)
    function ConfirmModalSimple({ visible, title, message, onCancel, onConfirm }: { visible: boolean; title: string; message: string; onCancel: () => void; onConfirm: () => void }) {
        return (
            <View>
                {visible && (
                    <View style={{ position: "fixed" as any, top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.38)", alignItems: "center", justifyContent: "center", padding: 16, zIndex: 9999 }}>
                        <View style={{ width: 360, maxWidth: "100%", backgroundColor: "#fff", borderRadius: 14, padding: 18 }}>
                            <Text style={{ color: C.text, fontSize: 16, fontWeight: "900", marginBottom: 6 }}>{title}</Text>
                            <Text style={{ color: C.text, fontSize: 13, opacity: 0.9, marginBottom: 14 }}>{message}</Text>
                            <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 10 }}>
                                <TouchableOpacity onPress={onCancel} style={{ paddingVertical: 10, paddingHorizontal: 16, borderRadius: 10, backgroundColor: "#EEE" }}>
                                    <Text style={{ color: C.text, fontWeight: "700" }}>Cancel</Text>
                                </TouchableOpacity>
                                <TouchableOpacity onPress={onConfirm} style={{ paddingVertical: 10, paddingHorizontal: 16, borderRadius: 10, backgroundColor: C.maroon }}>
                                    <Text style={{ color: "#fff", fontWeight: "700" }}>Log out</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    </View>
                )}
            </View>
        );
    }

    function SuccessModalSimple({ visible, title = "Logged out", message = "You have logged out.", onClose }: { visible: boolean; title?: string; message?: string; onClose: () => void }) {
        return (
            <View>
                {visible && (
                    <View style={{ position: "fixed" as any, top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.38)", alignItems: "center", justifyContent: "center", padding: 16, zIndex: 9999 }}>
                        <View style={{ width: 400, maxWidth: "100%", backgroundColor: "#fff", borderRadius: 14, padding: 18, alignItems: "center" }}>
                            <View style={{ width: 64, height: 64, borderRadius: 999, backgroundColor: "#F4E6E6", alignItems: "center", justifyContent: "center", marginBottom: 8 }}>
                                <Ionicons name="checkmark-circle" size={44} color={C.maroon} />
                            </View>
                            <Text style={{ color: C.text, fontSize: 16, fontWeight: "900", marginBottom: 6 }}>{title}</Text>
                            <Text style={{ color: C.text, fontSize: 13, opacity: 0.9, marginBottom: 14 }}>{message}</Text>
                            <TouchableOpacity onPress={onClose} style={{ backgroundColor: C.maroon, paddingVertical: 10, paddingHorizontal: 24, borderRadius: 10 }}>
                                <Text style={{ color: "#fff", fontWeight: "800" }}>OK</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                )}
            </View>
        );
    }

    function Sidebar({ open, isSmallScreen, onToggle, onLogout, userName, userRole }: { open: boolean; isSmallScreen: boolean; onToggle: () => void; onLogout: () => void; userName: string; userRole: string }) {
        // On small screens, sidebar should be hidden (off-screen) when closed, visible when open
        // On larger screens, sidebar should be visible (collapsed or expanded)
        const sidebarStyle = isSmallScreen
            ? {
                  borderRightColor: C.border,
                  borderRightWidth: 1,
                  backgroundColor: "#fff",
                  position: "absolute" as const,
                  left: 0,
                  top: 0,
                  bottom: 0,
                  zIndex: 1000,
                  elevation: 1000,
                  shadowColor: "#000",
                  shadowOffset: { width: 2, height: 0 },
                  shadowOpacity: 0.25,
                  shadowRadius: 4,
                  transform: [{ translateX: open ? 0 : -260 }],
                  width: 260,
              }
            : {
                  borderRightColor: C.border,
                  borderRightWidth: 1,
                  backgroundColor: "#fff",
                  width: open ? 260 : 74,
              };
        
        return (
            <View style={sidebarStyle}>
                <View style={{ paddingHorizontal: open ? 12 : 6, paddingVertical: 12 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: open ? 10 : 0, justifyContent: open ? "flex-start" : "center" }}>
                        <TouchableOpacity onPress={onToggle} style={{ height: 30, width: 30, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: "#F7F1F0", marginRight: 8 }}>
                            <Ionicons name="menu-outline" size={20} color={C.text} />
                        </TouchableOpacity>
                        {open && (
                            <>
                                <Image source={require("../../assets/images/logo.png")} style={{ width: 22, height: 22, resizeMode: "contain" }} />
                                <Text style={{ color: C.text, fontWeight: "800", fontSize: 16 }}>GoBuddy</Text>
                            </>
                        )}
                    </View>
                </View>

                <View style={{ flex: 1, justifyContent: "space-between" }}>
                    <View style={{ paddingTop: 8 }}>
                        <TouchableOpacity onPress={() => router.push("/buddyrunner/home")} style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 14, paddingHorizontal: 16, backgroundColor: C.maroon }}>
                            <Ionicons name="home-outline" size={18} color="#fff" />
                            {open && <Text style={{ color: "#fff", fontWeight: "700" }}>Home</Text>}
                        </TouchableOpacity>
                        <View style={{ height: 1, backgroundColor: C.border }} />
                        <TouchableOpacity onPress={() => router.push("/buddyrunner/messages_hub")} style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 14, paddingHorizontal: 16 }}>
                            <Ionicons name="chatbubbles-outline" size={18} color={C.text} />
                            {open && <Text style={{ color: C.text, fontSize: 14, fontWeight: "600" }}>Messages</Text>}
                        </TouchableOpacity>
                        <View style={{ height: 1, backgroundColor: C.border }} />
                        <TouchableOpacity onPress={() => router.push("/buddyrunner/profile")} style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 14, paddingHorizontal: 16 }}>
                            <Ionicons name="person-outline" size={18} color={C.text} />
                            {open && <Text style={{ color: C.text, fontSize: 14, fontWeight: "600" }}>Profile</Text>}
                        </TouchableOpacity>
                        <View style={{ height: 1, backgroundColor: C.border }} />
                    </View>

                    <View style={{ padding: 12, gap: 10 }}>
                        <View style={{ backgroundColor: "#F7F1F0", borderRadius: 10, padding: 10, flexDirection: "row", alignItems: "center", gap: 10 }}>
                            <View style={{ width: 34, height: 34, borderRadius: 999, backgroundColor: "#fff", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: C.border }}>
                                <Ionicons name="person" size={18} color={C.maroon} />
                            </View>
                            {open && (
                                <View style={{ flex: 1 }}>
                                    <Text style={{ color: C.text, fontSize: 12, fontWeight: "800" }}>{userName || "User"}</Text>
                                    {!!userRole && <Text style={{ color: C.text, fontSize: 10, opacity: 0.7 }}>{userRole}</Text>}
                                </View>
                            )}
                        </View>

                        <TouchableOpacity onPress={onLogout} activeOpacity={0.9} style={{ borderWidth: 1, borderColor: C.maroon, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, backgroundColor: "#fff" }}>
                            <Ionicons name="log-out-outline" size={18} color={C.maroon} />
                            {open && <Text style={{ color: C.maroon, fontWeight: "700" }}>Logout</Text>}
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        );
    }

    const { width } = useWindowDimensions();
    const isSmallScreen = width < 1024;
    const [open, setOpen] = useState(!isSmallScreen);
    
    // On small screens, start with sidebar closed (hidden)
    // On larger screens, start with sidebar open
    useEffect(() => {
        if (isSmallScreen) {
            setOpen(false);
        } else {
            setOpen(true);
        }
    }, [isSmallScreen]);
    
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [successOpenLogout, setSuccessOpenLogout] = useState(false);
    const [loggingOut, setLoggingOut] = useState(false);

    const [userName, setUserName] = useState<string>("User");
    const [userRole, setUserRole] = useState<string>("BuddyRunner");

    useEffect(() => {
        (async () => {
            try {
                const { data: userRes } = await supabase.auth.getUser();
                const u = userRes?.user;
                if (!u) return;
                const { data } = await supabase
                    .from("users")
                    .select("first_name, last_name, role")
                    .eq("id", u.id)
                    .single();
                const f = (data?.first_name || "").toString().trim();
                const l = (data?.last_name || "").toString().trim();
                const full = `${f} ${l}`.trim() || "User";
                setUserName(full);
                const roleRaw = (data?.role || "").toString().toLowerCase();
                setUserRole(roleRaw === "buddyrunner" ? "BuddyRunner" : roleRaw === "buddycaller" ? "BuddyCaller" : "");
            } catch {}
        })();
    }, []);

    const performLogout = async () => {
        if (loggingOut) return;
        setLoggingOut(true);
        setConfirmOpen(false);
        setSuccessOpenLogout(true);
        try {
            const { error } = await supabase.auth.signOut();
            if (error) throw error;
        } catch {}
        setLoggingOut(false);
    };

    if (showSidebar) {
        return (
            <View style={{ flex: 1, flexDirection: "row", backgroundColor: "#fff", position: "relative" }}>
                {/* Overlay backdrop for small screens when sidebar is open */}
                {isSmallScreen && open && (
                    <TouchableOpacity
                        style={{
                            position: "absolute",
                            top: 0,
                            left: 0,
                            right: 0,
                            bottom: 0,
                            backgroundColor: "rgba(0, 0, 0, 0.5)",
                            zIndex: 999,
                            elevation: 999,
                        }}
                        activeOpacity={1}
                        onPress={() => setOpen(false)}
                    />
                )}
                <Sidebar open={open} isSmallScreen={isSmallScreen} onToggle={() => setOpen(v => !v)} onLogout={() => setConfirmOpen(true)} userName={userName} userRole={userRole} />
                <View style={{ flex: 1 }}>
                    <View style={{ height: 56, borderBottomWidth: 1, borderBottomColor: C.border, paddingHorizontal: 12, alignItems: "center", flexDirection: "row", justifyContent: "space-between" }}>
                        <View style={{ flexDirection: "row", alignItems: "center" }}>
                            {/* Hamburger menu button for small screens */}
                            {isSmallScreen && (
                                <TouchableOpacity
                                    onPress={() => setOpen(true)}
                                    style={{
                                        padding: 8,
                                        borderRadius: 8,
                                        backgroundColor: "#F7F1F0",
                                        marginRight: 12,
                                    }}
                                    activeOpacity={0.7}
                                >
                                    <Ionicons name="menu-outline" size={24} color={C.text} />
                                </TouchableOpacity>
                            )}
                            <TouchableOpacity onPress={() => router.push('/buddyrunner/home')} style={{ padding: 6, marginRight: 6 }}>
                                <Ionicons name="chevron-back" size={24} color={C.maroon} />
                            </TouchableOpacity>
                            <Text style={{ fontSize: 24, fontWeight: 'bold', color: C.maroon, marginLeft: 6 }}>Commission Request</Text>
                        </View>
                        <TouchableOpacity onPress={() => router.replace("/buddyrunner/home")}>
                            <Ionicons name="close" size={20} color={C.maroon} />
                        </TouchableOpacity>
                    </View>
                    {renderInner(true)}
                </View>

                {/* Accepted Successfully Modal */}
                {successOpen && (
                    <Modal transparent animationType="fade" visible={true} onRequestClose={() => setSuccessOpen(false)}>
                        <View style={modalStyles.backdrop}>
                            <View style={modalStyles.card}>
                                <View style={modalStyles.iconWrap}>
                                    <Ionicons name="checkmark" size={34} color="#fff" />
                                </View>
                                <Text style={modalStyles.title}>Accepted Successfully</Text>
                                <Text style={modalStyles.msg}>You're now assigned to this commission. Opening chat…</Text>
                                <TouchableOpacity
                                    onPress={() => {
                                        setSuccessOpen(false);
                                        if (commission && userId) {
                                            openChatForCaller(commission, userId);
                                        }
                                    }}
                                    style={modalStyles.okBtn}
                                    activeOpacity={0.9}
                                >
                                    <Text style={modalStyles.okText}>OK</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    </Modal>
                )}

                {/* Logout Modals */}
                <ConfirmModalSimple visible={confirmOpen} title="Log Out?" message="Are you sure you want to log out?" onCancel={() => setConfirmOpen(false)} onConfirm={performLogout} />
                <SuccessModalSimple visible={successOpenLogout} title="Logged out" message="You have logged out." onClose={() => { setSuccessOpenLogout(false); router.replace("/login"); }} />
            </View>
        );
    }

    return (
        <View style={styles.root}>
            {Platform.OS === "web" && (
                // @ts-ignore
                <style dangerouslySetInnerHTML={{ __html: HIDE_SCROLLBAR_CSS }} />
            )}
            <View style={styles.sheet}>
                <View style={styles.headerBar}>
                        <Text style={styles.headerTitle}>Commission Request</Text>
                    <TouchableOpacity onPress={() => router.back()} hitSlop={10}>
                        <Ionicons name="close" size={20} color={C.maroon} />
                    </TouchableOpacity>
                </View>
                {renderInner(false)}
            </View>

            {successOpen && (
                <Modal transparent animationType="fade" visible={true} onRequestClose={() => setSuccessOpen(false)}>
                    <View style={modalStyles.backdrop}>
                        <View style={modalStyles.card}>
                            <View style={modalStyles.iconWrap}>
                                <Ionicons name="checkmark" size={34} color="#fff" />
                            </View>
                            <Text style={modalStyles.title}>Accepted Successfully</Text>
                            <Text style={modalStyles.msg}>You're now assigned to this commission. Opening chat…</Text>
                            <TouchableOpacity
                                onPress={() => {
                                    setSuccessOpen(false);
                                    if (commission && userId) {
                                        openChatForCaller(commission, userId);
                                    }
                                }}
                                style={modalStyles.okBtn}
                                activeOpacity={0.9}
                            >
                                <Text style={modalStyles.okText}>OK</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </Modal>
            )}
        </View>
    );
}

function ChipRow({ label, value, emphasizeRight }: { label: string; value: string; emphasizeRight?: boolean }) {
    return (
        <View style={{ marginBottom: 10 }}>
            <Text style={styles.label}>{label}</Text>
            <Text style={[styles.value, emphasizeRight && { fontWeight: "600" }]}>{value}</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    root: {
        flex: 1,
        backgroundColor: C.backdrop,
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
    },
    sheet: {
        width: "100%",
        maxWidth: 420,
        backgroundColor: C.white,
        borderRadius: 16,
        overflow: "hidden",
        borderColor: C.border,
        borderWidth: 1,
        flexDirection: "column",
        ...(Platform.OS === "web"
            ? ({ height: "90vh", boxShadow: "0 12px 36px rgba(0,0,0,.25)" } as any)
            : { maxHeight: 700 }),
    },
    headerBar: {
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderBottomColor: C.border,
        borderBottomWidth: 1,
        backgroundColor: C.bg,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
    },
    headerTitle: { color: C.text, fontSize: 16, fontWeight: "600" },
    scrollArea: { flex: 1, minHeight: 0 },
    webScroller: Platform.OS === "web"
        ? ({ flex: 1, padding: 12, paddingBottom: 12, overflowY: "auto", overscrollBehavior: "contain" } as any)
        : ({} as any),
    centerBox: { padding: 24, alignItems: "center", justifyContent: "center" },

    card: { backgroundColor: C.white, borderColor: C.border, borderWidth: 2, borderRadius: 12, padding: 14, marginTop: 14 },

    avatar: { width: 55, height: 55, borderRadius: 30, marginRight: 15, marginLeft: 10 },
    name: { color: C.text, fontWeight: "600" },
    subLine: { color: C.sub, fontSize: 12, marginTop: 2 },

    chatBubble: { width: 34, height: 34, borderRadius: 16, backgroundColor: C.maroon, alignItems: "center", justifyContent: "center", marginRight: 15 },

    locationBtn: { alignSelf: "flex-start", marginTop: 10, backgroundColor: C.maroon, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
    locationText: { color: C.white, fontSize: 12, fontWeight: "600" },

    logo: { width: 48, height: 48, resizeMode: "contain", marginTop: 6, marginBottom: 10 },
    hr: { height: 1, backgroundColor: C.border, marginBottom: 10 },

    label: { color: C.maroon, fontSize: 13, fontWeight: "700", marginBottom: 4 },
    value: { color: C.text, fontSize: 14, marginTop: 2 },

    bottomMaroon: { backgroundColor: "transparent", borderRadius: 12, padding: 0, marginTop: 16, marginBottom: 4 },
    acceptBtn: { backgroundColor: C.maroon, borderRadius: 12, paddingVertical: 14, alignItems: "center" },
    // Compact variant (used when opened with sidebar) - smaller but still prominent
    acceptBtnCompact: { alignSelf: "center", width: "60%", paddingVertical: 12 },
    acceptText: { color: C.white, fontWeight: "600", fontSize: 16 },
});

const modalStyles = StyleSheet.create({
    backdrop: {
        flex: 1,
        backgroundColor: "rgba(0,0,0,0.4)",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
    },
    card: {
        width: 400,
        maxWidth: "90%",
        backgroundColor: "#fff",
        borderRadius: 16,
        padding: 24,
        alignItems: "center",
        boxShadow: "0 4px 20px rgba(0,0,0,0.15)",
    },
    iconWrap: {
        width: 64,
        height: 64,
        borderRadius: 32,
        backgroundColor: C.maroon,
        alignItems: "center",
        justifyContent: "center",
        marginBottom: 16
    },
    title: {
        color: C.text,
        fontSize: 18,
        fontWeight: "700",
        marginBottom: 8,
        textAlign: "center"
    },
    msg: {
        color: C.text,
        fontSize: 14,
        opacity: 0.8,
        marginBottom: 24,
        textAlign: "center",
        lineHeight: 20
    },
    okBtn: {
        backgroundColor: C.maroon,
        paddingVertical: 14,
        borderRadius: 12,
        width: "100%",
        alignItems: "center",
        justifyContent: "center"
    },
    okText: {
        color: "#fff",
        fontWeight: "700",
        fontSize: 16
    },
});
