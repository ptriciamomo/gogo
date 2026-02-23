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
type Errand = {
    id: string;
    title: string;
    status: "In Progress" | "Pending" | "Completed" | "Cancelled" | "Delivered";
    requester: string;
    created_at: string;
    category?: string;
    amount_price?: number;
};

type ErrandRowDB = {
    id: number;
    title: string | null;
    status: "pending" | "in_progress" | "completed" | "cancelled" | "delivered";
    runner_id: string | null;
    created_at: string;
    buddycaller_id: string;
    category?: string | null;
    amount_price?: number | null;
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

function getStatusColor(status: Errand["status"]): string {
    switch (status) {
        case "Pending": return "#F59E0B";
        case "In Progress": return "#3B82F6";
        case "Completed": return "#10B981";
        case "Delivered": return "#8B5CF6";
        case "Cancelled": return "#EF4444";
        default: return colors.maroon;
    }
}

function isOngoingErrand(status: Errand["status"]): boolean {
    return status === "Pending" || status === "In Progress";
}

function isPastErrand(status: Errand["status"]): boolean {
    return status === "Completed" || status === "Delivered";
}

function isCancelledErrand(status: Errand["status"]): boolean {
    return status === "Cancelled";
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

/* ========= My Errands loader ========= */
function useMyErrands() {
    const [initialLoading, setInitialLoading] = React.useState(true);
    const [refreshing, setRefreshing] = React.useState(false);
    const [rows, setRows] = React.useState<ErrandRowDB[]>([]);
    const [runnerNameMap, setRunnerNameMap] = React.useState<Record<string, string>>({});
    const [uid, setUid] = React.useState<string | null>(null);

    const inFlightRef = React.useRef<Promise<void> | null>(null);
    const realtimeTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

    const fetchRunnerNames = React.useCallback(async (runnerIds: string[]) => {
        const missing = runnerIds.filter((id) => !(id in runnerNameMap));
        if (missing.length === 0) return;

        const { data: runners, error: rErr } = await supabase
            .from("users")
            .select("id, first_name, last_name")
            .in("id", missing);

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
                    setRunnerNameMap({});
                    return;
                }

                const { data, error } = await supabase
                    .from("errand")
                    .select("id, title, status, runner_id, created_at, buddycaller_id, category, amount_price")
                    .eq("buddycaller_id", currentUid)
                    .order("created_at", { ascending: false });

                if (error) throw error;

                const errands = data ?? [];
                setRows(errands);

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

    React.useEffect(() => {
        fetchRows({ silent: false });
    }, [fetchRows]);

    React.useEffect(() => {
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

    useFocusEffect(
        React.useCallback(() => {
            fetchRows({ silent: true });
        }, [fetchRows])
    );

    return { initialLoading, refreshing, rows, runnerNameMap, refetch: fetchRows };
}

/* MAIN */
export default function MyRequestsMobile() {
    const router = useRouter();
    const { loading, firstName } = useAuthProfile();
    const insets = useSafeAreaInsets();
    const { initialLoading, rows: errands, runnerNameMap, refetch } = useMyErrands();
    const [pastErrandsExpanded, setPastErrandsExpanded] = React.useState(false);
    const [cancelledErrandsExpanded, setCancelledErrandsExpanded] = React.useState(false);

    const ongoingErrands = errands
        .map(r => ({
            id: String(r.id),
            title: r.title || "(Untitled)",
            status: toUiStatus(r.status),
            requester: r.runner_id && runnerNameMap[r.runner_id] ? runnerNameMap[r.runner_id] : "No buddyrunner yet",
            created_at: r.created_at,
            category: r.category || undefined,
            amount_price: r.amount_price || undefined,
        }))
        .filter(errand => isOngoingErrand(errand.status));

    const pastErrands = errands
        .map(r => ({
            id: String(r.id),
            title: r.title || "(Untitled)",
            status: toUiStatus(r.status),
            requester: r.runner_id && runnerNameMap[r.runner_id] ? runnerNameMap[r.runner_id] : "No buddyrunner yet",
            created_at: r.created_at,
            category: r.category || undefined,
            amount_price: r.amount_price || undefined,
        }))
        .filter(errand => isPastErrand(errand.status));

    const cancelledErrands = errands
        .map(r => ({
            id: String(r.id),
            title: r.title || "(Untitled)",
            status: toUiStatus(r.status),
            requester: r.runner_id && runnerNameMap[r.runner_id] ? runnerNameMap[r.runner_id] : "No buddyrunner yet",
            created_at: r.created_at,
            category: r.category || undefined,
            amount_price: r.amount_price || undefined,
        }))
        .filter(errand => isCancelledErrand(errand.status));

    const scrollBottomPad = (insets.bottom || 0) + 100;

    return (
        <SAView edges={["top", "bottom"]} style={{ flex: 1, backgroundColor: "#fff" }}>
            <Stack.Screen options={{ animation: "none" }} />

            <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 10 }}>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                        <TouchableOpacity onPress={() => router.push("/buddycaller/home")} style={{ padding: 4 }}>
                            <Ionicons name="arrow-back" size={24} color={colors.text} />
                        </TouchableOpacity>
                        <Image source={require("../../assets/images/logo.png")} style={{ width: 22, height: 22, resizeMode: "contain" }} />
                        <Text style={{ fontWeight: "900", color: colors.text, fontSize: 18 }}>GoBuddy</Text>
                    </View>
                    <TouchableOpacity onPress={() => router.push("/buddycaller/notification")} activeOpacity={0.9}>
                        <Ionicons name="notifications-outline" size={24} color={colors.text} />
                    </TouchableOpacity>
                </View>
            </View>

            <Text style={{ paddingHorizontal: 16, color: colors.text, fontWeight: "800", fontSize: 16, marginBottom: 6 }}>
                {loading ? "Loading…" : `My Requests`}
            </Text>

            <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: scrollBottomPad }}>
                {/* Ongoing Errands Section */}
                <View style={m.section}>
                    <Text style={m.sectionTitle}>Ongoing Errands</Text>
                    {initialLoading ? (
                        <Text style={m.loadingText}>Loading…</Text>
                    ) : ongoingErrands.length === 0 ? (
                        <View style={m.emptyState}>
                            <Ionicons name="time-outline" size={48} color={colors.border} />
                            <Text style={m.emptyText}>No ongoing errands</Text>
                            <Text style={m.emptySubtext}>Your active errands will appear here</Text>
                        </View>
                    ) : (
                        <View style={m.errandsList}>
                            {ongoingErrands.map((errand) => (
                                <ErrandCardMobile key={errand.id} errand={errand} />
                            ))}
                        </View>
                    )}
                </View>

                {/* Past Errands Section */}
                <View style={m.section}>
                    <Text style={m.sectionTitle}>Past Errands</Text>
                    {initialLoading ? (
                        <Text style={m.loadingText}>Loading…</Text>
                    ) : pastErrands.length === 0 ? (
                        <View style={m.emptyState}>
                            <Ionicons name="checkmark-circle-outline" size={48} color={colors.border} />
                            <Text style={m.emptyText}>No completed errands</Text>
                            <Text style={m.emptySubtext}>Your completed errands will appear here</Text>
                        </View>
                    ) : (
                        <>
                            <View style={m.errandsList}>
                                {(pastErrandsExpanded ? pastErrands : pastErrands.slice(0, 5)).map((errand) => (
                                    <ErrandCardMobile key={errand.id} errand={errand} />
                                ))}
                            </View>
                            {pastErrands.length > 5 && (
                                <TouchableOpacity
                                    onPress={() => setPastErrandsExpanded(!pastErrandsExpanded)}
                                    style={m.seeMoreButton}
                                    activeOpacity={0.7}
                                >
                                    <Text style={m.seeMoreText}>
                                        {pastErrandsExpanded ? "See Less" : "See More"}
                                    </Text>
                                </TouchableOpacity>
                            )}
                        </>
                    )}
                </View>

                {/* Cancelled Errands Section */}
                <View style={m.section}>
                    <Text style={m.sectionTitle}>Cancelled Errands</Text>
                    {initialLoading ? (
                        <Text style={m.loadingText}>Loading…</Text>
                    ) : cancelledErrands.length === 0 ? (
                        <View style={m.emptyState}>
                            <Ionicons name="close-circle-outline" size={48} color={colors.border} />
                            <Text style={m.emptyText}>No cancelled errands</Text>
                            <Text style={m.emptySubtext}>Your cancelled errands will appear here</Text>
                        </View>
                    ) : (
                        <>
                            <View style={m.errandsList}>
                                {(cancelledErrandsExpanded ? cancelledErrands : cancelledErrands.slice(0, 5)).map((errand) => (
                                    <ErrandCardMobile key={errand.id} errand={errand} />
                                ))}
                            </View>
                            {cancelledErrands.length > 5 && (
                                <TouchableOpacity
                                    onPress={() => setCancelledErrandsExpanded(!cancelledErrandsExpanded)}
                                    style={m.seeMoreButton}
                                    activeOpacity={0.7}
                                >
                                    <Text style={m.seeMoreText}>
                                        {cancelledErrandsExpanded ? "See Less" : "See More"}
                                    </Text>
                                </TouchableOpacity>
                            )}
                        </>
                    )}
                </View>
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

/* ======================= ERRAND CARD (MOBILE) ======================= */
function ErrandCardMobile({ errand }: { errand: Errand }) {
    const router = useRouter();
    const isOngoing = isOngoingErrand(errand.status);

    return (
        <TouchableOpacity
            style={m.errandCard}
            onPress={() => {
                // Navigate to map page for ongoing errands
                if (isOngoing) {
                    router.push({
                        pathname: "/buddycaller/view_map",
                        params: { id: errand.id },
                    });
                } else if (errand.status === "Completed") {
                    // Navigate to Errand Details page for completed errands
                    router.push({
                        pathname: "/buddycaller/errand_details",
                        params: { id: errand.id },
                    });
                } else {
                    // For other past errands (Delivered, Cancelled), use the old view errand page
                    router.push({
                        pathname: "/buddycaller/view_errand",
                        params: { id: errand.id },
                    });
                }
            }}
        >
            <View style={m.cardHeader}>
                <Text style={m.cardTitle}>{errand.title}</Text>
                <View style={[m.statusBadge, { backgroundColor: getStatusColor(errand.status) }]}>
                    <Text style={m.statusText}>{errand.status}</Text>
                </View>
            </View>
            
            <View style={m.cardContent}>
                {errand.category && (
                    <View style={m.infoRow}>
                        <Ionicons name="folder-outline" size={12} color={colors.maroon} />
                        <Text style={m.infoText}>{errand.category}</Text>
                    </View>
                )}
                
                <View style={m.infoRow}>
                    <Ionicons name="walk-outline" size={12} color={colors.maroon} />
                    <Text style={m.infoText}>{errand.requester}</Text>
                </View>
                
                <View style={m.infoRow}>
                    <Ionicons name="time-outline" size={12} color={colors.maroon} />
                    <Text style={m.infoText}>
                        {new Date(errand.created_at).toLocaleDateString()}
                    </Text>
                </View>
                
                {errand.amount_price && (
                    <View style={m.infoRow}>
                        <Ionicons name="cash-outline" size={12} color={colors.maroon} />
                        <Text style={m.infoText}>₱{errand.amount_price.toFixed(2)}</Text>
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
    errandsList: { gap: 10 },

    errandCard: {
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
    seeMoreButton: {
        marginTop: 10,
        alignItems: "center",
        paddingVertical: 8,
    },
    seeMoreText: {
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
