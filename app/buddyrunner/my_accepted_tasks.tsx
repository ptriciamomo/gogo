import { Ionicons } from "@expo/vector-icons";
import { Stack, useFocusEffect, useRouter } from "expo-router";
import React from "react";
import {
    Image,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { SafeAreaView as SAView, useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "../../lib/supabase";
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
type Commission = {
    id: string;
    title: string;
    status: "In Progress" | "Pending" | "Accepted" | "Completed" | "Cancelled" | "Delivered";
    requester: string;
    created_at: string;
    commission_type?: string;
    meetup_location?: string | null;
    due_at?: string | null;
};

type CommissionRowDB = {
    id: number;
    title: string | null;
    status: "pending" | "accepted" | "in_progress" | "completed" | "cancelled" | "delivered";
    runner_id: string | null;
    created_at: string;
    buddycaller_id: string;
    commission_type?: string | null;
    meetup_location?: string | null;
    due_at?: string | null;
};

function toUiStatus(s: CommissionRowDB["status"]): Commission["status"] {
    if (s === "in_progress") return "In Progress";
    if (s === "completed") return "Completed";
    if (s === "pending") return "Pending";
    if (s === "accepted") return "Accepted";
    if (s === "cancelled") return "Cancelled";
    if (s === "delivered") return "Delivered";
    return "Pending";
}

function getStatusColor(status: Commission["status"]): string {
    switch (status) {
        case "Pending": return "#F59E0B";
        case "Accepted": return "#10B981";
        case "In Progress": return "#3B82F6";
        case "Completed": return "#10B981";
        case "Delivered": return "#8B5CF6";
        case "Cancelled": return "#EF4444";
        default: return colors.maroon;
    }
}

function isOngoingCommission(status: Commission["status"]): boolean {
    return status === "Pending" || status === "Accepted" || status === "In Progress";
}

function isPastCommission(status: Commission["status"]): boolean {
    return status === "Completed" || status === "Delivered" || status === "Cancelled";
}

/* ===================== AUTH PROFILE HOOK ===================== */
type ProfileRow = { id: string; role: "buddyrunner" | "buddycaller" | string | null; first_name: string | null; last_name: string | null; };

function titleCase(s?: string | null) {
    if (!s) return "";
    return s
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean)
        .map((w) => (w[0] ? w[0].toUpperCase() + w.slice(1) : w))
        .join(" ");
}

function useAuthProfile() {
    const [loading, setLoading] = React.useState(true);
    const [firstName, setFirstName] = React.useState<string>("");
    const [fullName, setFullName] = React.useState<string>("");
    const [roleLabel, setRoleLabel] = React.useState<string>("");

    const fetchProfile = React.useCallback(async () => {
        try {
            const { data: userRes } = await supabase.auth.getUser();
            const user = userRes?.user;
            if (!user) {
                setLoading(false);
                return;
            }
            const { data: row, error } = await supabase
                .from("users")
                .select("id, role, first_name, last_name")
                .eq("id", user.id)
                .single<ProfileRow>();
            if (error) throw error;

            const f = titleCase(row?.first_name || "");
            const l = titleCase(row?.last_name || "");
            const finalFull =
                (f && l ? `${f} ${l}` : "").trim() ||
                titleCase((user.user_metadata?.full_name as string) || (user.user_metadata?.name as string) || "") ||
                titleCase((user.email?.split("@")[0] || "").replace(/[._-]+/g, " ")) ||
                "User";
            setFirstName(f || finalFull.split(" ")[0] || "User");
            setFullName(finalFull);

            const roleRaw = (row?.role || "").toString().toLowerCase();
            setRoleLabel(roleRaw === "buddyrunner" ? "BuddyRunner" : roleRaw === "buddycaller" ? "BuddyCaller" : "");
        } catch {
            setFirstName("User");
            setFullName("User");
            setRoleLabel("");
        } finally {
            setLoading(false);
        }
    }, []);

    React.useEffect(() => {
        fetchProfile();
        const { data: sub } = supabase.auth.onAuthStateChange(() => fetchProfile());
        return () => sub?.subscription?.unsubscribe?.();
    }, [fetchProfile]);
    return { loading, firstName, fullName, roleLabel };
}

/* ========= My Commissions loader ========= */
function useMyCommissions() {
    const [initialLoading, setInitialLoading] = React.useState(true);
    const [refreshing, setRefreshing] = React.useState(false);
    const [rows, setRows] = React.useState<CommissionRowDB[]>([]);
    const [callerNameMap, setCallerNameMap] = React.useState<Record<string, string>>({});
    const [uid, setUid] = React.useState<string | null>(null);

    const inFlightRef = React.useRef<Promise<void> | null>(null);
    const realtimeTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

    const fetchCallerNames = React.useCallback(async (callerIds: string[]) => {
        const missing = callerIds.filter((id) => !(id in callerNameMap));
        if (missing.length === 0) return;

        const { data: callers, error: cErr } = await supabase
            .from("users")
            .select("id, first_name, last_name")
            .in("id", missing);

        if (cErr) return;

        setCallerNameMap((prev) => {
            const next = { ...prev };
            for (const u of callers ?? []) {
                const first = (u.first_name || "").trim();
                const last = (u.last_name || "").trim();
                next[u.id] = [first, last].filter(Boolean).join(" ").trim() || "BuddyCaller";
            }
            return next;
        });
    }, [callerNameMap]);

    const fetchRows = React.useCallback(async (opts?: { silent?: boolean }) => {
        const silent = !!opts?.silent;

        if (inFlightRef.current) {
            try { await inFlightRef.current; } catch { /* ignore */ }
        }

        const exec = (async () => {
            if (initialLoading && !silent) {
                setInitialLoading(true);
            } else {
                setRefreshing(true);
            }

            try {
                const { data: ures } = await supabase.auth.getUser();
                const currentUid = ures?.user?.id ?? null;
                setUid(currentUid);

                if (!currentUid) {
                    setRows([]);
                    setCallerNameMap({});
                    return;
                }

                const { data, error } = await supabase
                    .from("commission")
                    .select("id, title, status, runner_id, created_at, buddycaller_id, commission_type, meetup_location, due_at")
                    .eq("runner_id", currentUid)
                    .order("created_at", { ascending: false });

                if (error) throw error;

                const commissions = data ?? [];
                setRows(commissions);

                const callerIds = Array.from(new Set(commissions.map((r) => r.buddycaller_id).filter(Boolean) as string[]));
                if (callerIds.length) await fetchCallerNames(callerIds);
            } finally {
                setInitialLoading(false);
                setRefreshing(false);
            }
        })();

        inFlightRef.current = exec;
        try { await exec; } finally { inFlightRef.current = null; }
    }, [fetchCallerNames, initialLoading]);

    React.useEffect(() => {
        fetchRows({ silent: false });
    }, [fetchRows]);

    React.useEffect(() => {
        if (!uid) return;

        const ch = supabase
            .channel(`commission_changes_${uid}`)
            .on(
                "postgres_changes",
                { event: "*", schema: "public", table: "commission", filter: `runner_id=eq.${uid}` },
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

    useFocusEffect(
        React.useCallback(() => {
            fetchRows({ silent: true });
        }, [fetchRows])
    );

    return { initialLoading, refreshing, rows, callerNameMap, refetch: fetchRows };
}

/* MAIN */
export default function MyAcceptedTasks() {
    const router = useRouter();
    const { loading, firstName } = useAuthProfile();
    const insets = useSafeAreaInsets();
    const { initialLoading, rows: commissions, callerNameMap, refetch } = useMyCommissions();

    const ongoingCommissions = commissions
        .map(r => ({
            id: String(r.id),
            title: r.title || "(Untitled)",
            status: toUiStatus(r.status),
            requester: r.buddycaller_id && callerNameMap[r.buddycaller_id] ? callerNameMap[r.buddycaller_id] : "No buddycaller yet",
            created_at: r.created_at,
            commission_type: r.commission_type || undefined,
            meetup_location: r.meetup_location || undefined,
            due_at: r.due_at || undefined,
        }))
        .filter(commission => isOngoingCommission(commission.status));

    const pastCommissions = commissions
        .map(r => ({
            id: String(r.id),
            title: r.title || "(Untitled)",
            status: toUiStatus(r.status),
            requester: r.buddycaller_id && callerNameMap[r.buddycaller_id] ? callerNameMap[r.buddycaller_id] : "No buddycaller yet",
            created_at: r.created_at,
            commission_type: r.commission_type || undefined,
            meetup_location: r.meetup_location || undefined,
            due_at: r.due_at || undefined,
        }))
        .filter(commission => isPastCommission(commission.status));

    const scrollBottomPad = (insets.bottom || 0) + 100;

    return (
        <SAView edges={["top", "bottom"]} style={{ flex: 1, backgroundColor: "#fff" }}>
            <Stack.Screen options={{ animation: "none" }} />

            <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 10 }}>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                        <TouchableOpacity onPress={() => router.back()} style={{ padding: 4 }}>
                            <Ionicons name="arrow-back" size={24} color={colors.text} />
                        </TouchableOpacity>
                        <Image source={require("../../assets/images/logo.png")} style={{ width: 22, height: 22, resizeMode: "contain" }} />
                        <Text style={{ fontWeight: "900", color: colors.text, fontSize: 18 }}>GoBuddy</Text>
                    </View>
                    <TouchableOpacity onPress={() => router.push("/buddyrunner/notification")} activeOpacity={0.9}>
                        <Ionicons name="notifications-outline" size={24} color={colors.text} />
                    </TouchableOpacity>
                </View>
            </View>

            <Text style={{ paddingHorizontal: 16, color: colors.text, fontWeight: "800", fontSize: 16, marginBottom: 6 }}>
                {loading ? "Loading…" : `My Accepted Tasks`}
            </Text>

            <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: scrollBottomPad }}>
                {/* Ongoing Commissions Section */}
                <View style={m.section}>
                    <Text style={m.sectionTitle}>Ongoing Commissions</Text>
                    {initialLoading ? (
                        <Text style={m.loadingText}>Loading…</Text>
                    ) : ongoingCommissions.length === 0 ? (
                        <View style={m.emptyState}>
                            <Ionicons name="time-outline" size={48} color={colors.border} />
                            <Text style={m.emptyText}>No ongoing commissions</Text>
                            <Text style={m.emptySubtext}>Your active commissions will appear here</Text>
                        </View>
                    ) : (
                        <View style={m.commissionsList}>
                            {ongoingCommissions.map((commission) => (
                                <CommissionCardMobile key={commission.id} commission={commission} />
                            ))}
                        </View>
                    )}
                </View>

                {/* Past Commissions Section */}
                <View style={m.section}>
                    <Text style={m.sectionTitle}>Past Commissions</Text>
                    {initialLoading ? (
                        <Text style={m.loadingText}>Loading…</Text>
                    ) : pastCommissions.length === 0 ? (
                        <View style={m.emptyState}>
                            <Ionicons name="checkmark-circle-outline" size={48} color={colors.border} />
                            <Text style={m.emptyText}>No completed commissions</Text>
                            <Text style={m.emptySubtext}>Your completed commissions will appear here</Text>
                        </View>
                    ) : (
                        <View style={m.commissionsList}>
                            {pastCommissions.map((commission) => (
                                <CommissionCardMobile key={commission.id} commission={commission} />
                            ))}
                        </View>
                    )}
                </View>
            </ScrollView>

            <MobileBottomBar
                onHome={() => router.replace("/buddyrunner/home")}
                onMessages={() => router.replace("/buddyrunner/messages_hub")}
                onProfile={() => router.replace("/buddyrunner/profile")}
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

/* ======================= COMMISSION CARD (MOBILE) ======================= */
function CommissionCardMobile({ commission }: { commission: Commission }) {
    const router = useRouter();

    const handlePress = () => {
        if (commission.status === "Accepted" || commission.status === "In Progress") {
            // Navigate to chat screen for ongoing tasks
            router.push({
                pathname: "/buddyrunner/ChatScreenRunner",
                params: {
                    conversationId: commission.id, // Using commission id as conversation identifier
                    otherUserId: commission.requester, // This will be the caller ID
                    contactName: commission.requester,
                    contactInitials: commission.requester.split(" ").map(n => n[0]).join("").toUpperCase() || "C",
                    isOnline: "true",
                },
            });
        }
    };

    return (
        <TouchableOpacity
            style={m.commissionCard}
            onPress={handlePress}
        >
            <View style={m.cardHeader}>
                <Text style={m.cardTitle}>{commission.title}</Text>
                <View style={[m.statusBadge, { backgroundColor: getStatusColor(commission.status) }]}>
                    <Text style={m.statusText}>{commission.status}</Text>
                </View>
            </View>
            
            <View style={m.cardContent}>
                {commission.commission_type && (
                    <View style={m.infoRow}>
                        <Ionicons name="briefcase-outline" size={12} color={colors.maroon} />
                        <Text style={m.infoText}>{commission.commission_type}</Text>
                    </View>
                )}
                
                <View style={m.infoRow}>
                    <Ionicons name="person-outline" size={12} color={colors.maroon} />
                    <Text style={m.infoText}>{commission.requester}</Text>
                </View>
                
                <View style={m.infoRow}>
                    <Ionicons name="time-outline" size={12} color={colors.maroon} />
                    <Text style={m.infoText}>
                        {new Date(commission.created_at).toLocaleDateString()}
                    </Text>
                </View>
                
                {commission.meetup_location && (
                    <View style={m.infoRow}>
                        <Ionicons name="location-outline" size={12} color={colors.maroon} />
                        <Text style={m.infoText}>{commission.meetup_location}</Text>
                    </View>
                )}
            </View>
            
            <View style={m.cardFooter}>
                <Text style={m.viewText}>View Details →</Text>
            </View>
        </TouchableOpacity>
    );
}

/* ======================= STYLES (MOBILE) ======================= */
const m = StyleSheet.create({
    section: { marginBottom: 24 },
    sectionTitle: { 
        color: colors.text, 
        fontWeight: "900", 
        fontSize: 16, 
        marginBottom: 12 
    },
    loadingText: { 
        color: colors.text, 
        opacity: 0.7, 
        fontSize: 14,
        textAlign: "center",
        paddingVertical: 20
    },
    emptyState: {
        alignItems: "center",
        paddingVertical: 30,
        paddingHorizontal: 20,
    },
    emptyText: {
        color: colors.text,
        fontSize: 14,
        fontWeight: "600",
        marginTop: 12,
        marginBottom: 4,
    },
    emptySubtext: {
        color: colors.text,
        fontSize: 12,
        opacity: 0.7,
        textAlign: "center",
    },
    commissionsList: { gap: 10 },

    commissionCard: {
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 12,
        backgroundColor: "#fff",
        padding: 12,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
        elevation: 2,
    },
    cardHeader: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "flex-start",
        marginBottom: 8,
    },
    cardTitle: {
        flex: 1,
        fontSize: 14,
        fontWeight: "800",
        color: colors.text,
        marginRight: 8,
    },
    statusBadge: {
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 12,
    },
    statusText: {
        color: "#fff",
        fontSize: 10,
        fontWeight: "700",
    },
    cardContent: {
        gap: 6,
        marginBottom: 8,
    },
    infoRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
    },
    infoText: {
        fontSize: 12,
        color: colors.text,
        opacity: 0.8,
    },
    cardFooter: {
        alignItems: "flex-end",
    },
    viewText: {
        color: colors.maroon,
        fontSize: 12,
        fontWeight: "600",
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
