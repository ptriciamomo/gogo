import React, { useCallback, useEffect, useMemo, useState, useRef } from "react";
import {
    ActivityIndicator,
    Alert,
    Image,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { supabase } from "../../lib/supabase";
import { sendCommissionAcceptanceMessage } from "../../utils/supabaseHelpers";

/* ===== Theme ===== */
const C = {
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

/** Active statuses that block Rule 3 */
const ACTIVE = ["accepted", "in_progress"] as const;

/** Web-safe alert */
function showMsg(title: string, body?: string, onOK?: () => void) {
    if (Platform.OS === "web") {
        window.alert(body ? `${title}\n\n${body}` : title);
        onOK?.();
    } else {
        Alert.alert(title, body, [{ text: "OK", onPress: onOK }]);
    }
}

/* helpers */
function prettyType(s?: string | null) {
    if (!s) return "General";
    return s
        .toString()
        .replace(/[_-]+/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase()
        .replace(/\b\w/g, (c) => c.toUpperCase());
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

export default function ViewCommissionMobile() {
    const router = useRouter();
    const { id } = useLocalSearchParams<{ id?: string }>();

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

    const goToChat = useCallback(
        (commissionId: string | number) => {
            // Navigate to messages hub for web, ChatScreenRunner for mobile
            const targetPath = Platform.OS === 'web' ? "/buddyrunner/messages_hub" : "/buddyrunner/ChatScreenRunner";
            router.replace({ 
                pathname: targetPath, 
                params: { commissionId: String(commissionId) } 
            });
        },
        [router]
    );

    // Navigate to chat with the caller reflected (name/profile) and proper conversation
    const openChatForCaller = useCallback(
        async (updated: Commission, runner: string) => {
            try {
                const callerId = String(updated.buddycaller_id ?? "");
                if (!callerId) {
                    goToChat(updated.id);
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

                // Navigate to messages hub for web, ChatScreenRunner for mobile
                const targetPath = Platform.OS === 'web' ? "/buddyrunner/messages_hub" : "/buddyrunner/ChatScreenRunner";
                
                router.replace({
                    pathname: targetPath,
                    params: {
                        commissionId: String(updated.id),
                        conversationId,
                        otherUserId: callerId,
                        contactName: requesterName,
                        contactInitials: Platform.OS === 'web' ? `${caller?.first_name?.[0] || ''}${caller?.last_name?.[0] || ''}`.toUpperCase() || 'BC' : undefined,
                        isOnline: Platform.OS === 'web' ? 'true' : undefined,
                        callerFirstName: Platform.OS === 'web' ? undefined : caller?.first_name || "",
                        callerLastName: Platform.OS === 'web' ? undefined : caller?.last_name || "",
                        callerCourse: Platform.OS === 'web' ? undefined : caller?.course || "",
                        callerStatus: Platform.OS === 'web' ? undefined : "In Progress",
                    },
                });
            } catch (error) {
                console.error('ViewCommission: Error in openChatForCaller, falling back to messages hub:', error);
                // Fallback if anything fails – still open the messages hub for web, chat screen for mobile
                goToChat(updated.id);
            }
        },
        [router, goToChat, requesterName]
    );

    // Current user
    useEffect(() => {
        (async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) setUserId(user.id);
        })();
    }, []);

    // Fetch commission + buddycaller
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
                showMsg("Error", e?.message || "Unable to load commission.");
                setCommission(null);
                setCaller(null);
            } finally {
                setLoading(false);
            }
        })();
    }, [id]);

    // Rule 3 check — does runner already have another active commission?
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
            } catch (e) {
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
    
    const accept = useCallback(async () => {
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

            // Re-check Rule 3 at click-time
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

            // Reserve commission and initialize invoice capsule
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

            console.log("BuddyRunner: Commission updated successfully:", {
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
                console.log("BuddyRunner Mobile: Sent commission acceptance message");
            } catch (messageError) {
                console.error("BuddyRunner Mobile: Failed to send commission acceptance message:", messageError);
                // Don't block the flow if message fails
            }

            setCommission(updated as Commission);

            // Show success modal first, then redirect on OK
            setSuccessOpen(true);
        } catch (e: any) {
            // Surface exact Supabase error
            showMsg("Failed", e?.message || "Could not accept commission.");
        } finally {
            setAccepting(false);
        }
    }, [commission, canAccept, accepting, goToChat, openChatForCaller]);

    if (loading) {
        return (
            <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
                <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                    <ActivityIndicator size="large" color={C.maroon} />
                    <Text style={{ color: C.text, marginTop: 10 }}>Loading…</Text>
                </View>
            </SafeAreaView>
        );
    }

    if (!commission) {
        return (
            <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
                <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                    <Text style={{ color: C.maroonDeep }}>Commission not found.</Text>
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
            <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 120 }}>
                <View style={s.headerBar}>
                    <TouchableOpacity onPress={() => router.back()} style={s.backRow}>
                        <Ionicons name="chevron-back" size={22} color={C.maroon} />
                        <Text style={s.headerTitle}>Commission Request</Text>
                    </TouchableOpacity>
                </View>

                {/* Caller Card */}
                <View style={s.card}>
                    <View style={{ flexDirection: "row", alignItems: "center" }}>
                        <Image
                            source={{ uri: caller?.profile_picture_url || "https://i.pravatar.cc/100?img=3" }}
                            style={s.avatar}
                        />
                        <View style={{ flex: 1 }}>
                            <Text style={s.name}>{requesterName}</Text>
                            {!!caller?.student_id_number && <Text style={s.subLine}>Student ID: {caller.student_id_number}</Text>}
                            {!!caller?.course && <Text style={s.subLine}>{caller.course}</Text>}
                            <TouchableOpacity style={s.locationBtn} activeOpacity={0.9}>
                                <Text style={s.locationText}>View Profile</Text>
                            </TouchableOpacity>
                        </View>
                        <View style={s.chatBubble}>
                            <Ionicons name="chatbubble-ellipses" size={16} color={C.white} />
                        </View>
                    </View>
                </View>

                {/* Details */}
                <View style={s.card}>
                    <View style={{ alignItems: "center" }}>
                        <Image source={require("../../assets/images/logo.png")} style={s.logo} />
                    </View>
                    <View style={s.hr} />
                    <ChipRow label="Commission Title:" value={String(commission.title ?? "").trim() || "—"} />
                    <ChipRow label="Commission Description:" value={String(commission.description ?? "").trim() || "—"} />
                    <View style={{ marginBottom: 10 }}>
                        <View style={s.chip}><Text style={s.chipText}>Commission Type:</Text></View>
                        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
                            {parseCommissionTypes(commission.commission_type).length > 0 ? (
                                parseCommissionTypes(commission.commission_type).map((type, index) => (
                                    <View key={index} style={{ backgroundColor: C.chipBg, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 }}>
                                        <Text style={{ color: C.chipText, fontSize: 12, fontWeight: "700" }}>{type}</Text>
                                    </View>
                                ))
                            ) : (
                                <Text style={s.value}>General</Text>
                            )}
                        </View>
                    </View>
                    <ChipRow label="Completion Date:" value={formatDueAt(commission.due_at)} />
                    {commission.scheduled_meetup ? (
                        <View style={{ marginBottom: 10 }}>
                            <View style={s.chip}><Text style={s.chipText}>Scheduled Meet-up</Text></View>
                            <Text style={s.value}>{String(commission.meetup_location ?? "").trim() || "—"}</Text>
                        </View>
                    ) : null}
                </View>
            </ScrollView>

            {/* Accept */}
            <View style={s.footerBar}>
                <TouchableOpacity
                    onPress={accept}
                    disabled={!canAccept || accepting || checkingActive}
                    activeOpacity={0.92}
                    style={[s.acceptBtn, (accepting || !canAccept) && { opacity: 0.85 }]}
                >
                    {accepting || checkingActive ? (
                        <ActivityIndicator color={C.maroon} />
                    ) : (
                        <Text style={s.acceptText}>{acceptCta}</Text>
                    )}
                </TouchableOpacity>
            </View>

            {/* Success Modal */}
            {successOpen && (
                <View style={modalStyles.fullScreenBackdrop}>
                    <View style={modalStyles.centeredCard}>
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
            )}
        </SafeAreaView>
    );
}

function ChipRow({ label, value, emphasizeRight }: { label: string; value: string; emphasizeRight?: boolean }) {
    return (
        <View style={{ marginBottom: 10 }}>
            <View style={s.chip}><Text style={s.chipText}>{label}</Text></View>
            <Text style={[s.value, emphasizeRight && { fontWeight: "600" }]}>{value}</Text>
        </View>
    );
}

const s = StyleSheet.create({
    headerBar: { paddingVertical: 10, borderBottomColor: C.border, borderBottomWidth: 1 },
    backRow: { flexDirection: "row", alignItems: "center", gap: 4, paddingLeft: 12, paddingBottom: 5 },
    headerTitle: { color: C.text, fontSize: 16, fontWeight: "600", flex: 1, textAlign: "left", paddingLeft: 14, paddingBottom: 5 },

    card: { backgroundColor: C.white, borderColor: C.border, borderWidth: 2, borderRadius: 12, padding: 14, marginTop: 14 },

    avatar: { width: 55, height: 55, borderRadius: 30, marginRight: 15, marginLeft: 10 },
    name: { color: C.text, fontWeight: "600" },
    subLine: { color: C.sub, fontSize: 12, marginTop: 2 },

    chatBubble: { width: 34, height: 34, borderRadius: 16, backgroundColor: C.maroon, alignItems: "center", justifyContent: "center", marginRight: 15 },

    locationBtn: { alignSelf: "flex-start", marginTop: 10, backgroundColor: C.maroon, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
    locationText: { color: C.white, fontSize: 12, fontWeight: "600" },

    logo: { width: 60, height: 60, resizeMode: "contain", marginTop: 6, marginBottom: 10 },
    hr: { height: 1, backgroundColor: C.border, marginBottom: 10 },

    chip: { alignSelf: "flex-start", backgroundColor: C.chipBg, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
    chipText: { color: C.chipText, fontSize: 12, fontWeight: "600" },

    value: { color: C.text, fontSize: 14, marginTop: 6 },

    footerBar: {
        position: "absolute", left: 0, right: 0, bottom: 0,
        backgroundColor: C.maroon, padding: 14, paddingBottom: 55, paddingTop: 25,
    },
    acceptBtn: { backgroundColor: C.white, borderRadius: 10, paddingVertical: 12, alignItems: "center", height: 60, justifyContent: "center" },
    acceptText: { color: C.maroonDeep, fontWeight: "600", fontSize: 15 },
});

const modalStyles = StyleSheet.create({
    fullScreenBackdrop: {
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0,0,0,0.4)",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
    },
    centeredCard: {
        width: 360,
        maxWidth: "90%",
        backgroundColor: "#fff",
        borderRadius: 16,
        padding: 24,
        alignItems: "center",
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 12,
        elevation: 8,
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
