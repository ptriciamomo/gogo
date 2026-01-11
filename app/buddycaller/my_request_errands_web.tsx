import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import {
    Image,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
    useWindowDimensions,
} from "react-native";
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
    const [profilePictureUrl, setProfilePictureUrl] = React.useState<string | null>(null);

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
                .select("id, role, first_name, last_name, profile_picture_url")
                .eq("id", user.id)
                .single<ProfileRow & { profile_picture_url: string | null }>();
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
            setProfilePictureUrl(row?.profile_picture_url || null);

            const roleRaw = (row?.role || "").toString().toLowerCase();
            setRoleLabel(roleRaw === "buddyrunner" ? "BuddyRunner" : roleRaw === "buddycaller" ? "BuddyCaller" : "");
        } catch {
            setFirstName("User");
            setFullName("User");
            setRoleLabel("");
            setProfilePictureUrl(null);
        } finally {
            setLoading(false);
        }
    }, []);

    React.useEffect(() => {
        fetchProfile();
        const { data: sub } = supabase.auth.onAuthStateChange(() => fetchProfile());
        return () => sub?.subscription?.unsubscribe?.();
    }, [fetchProfile]);
    return { loading, firstName, fullName, roleLabel, profilePictureUrl };
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

    return { initialLoading, refreshing, rows, runnerNameMap, refetch: fetchRows };
}

/* ============================== WEB LAYOUT ============================== */
export default function MyRequestsWeb() {
    const router = useRouter();
    const { loading, firstName, fullName, roleLabel, profilePictureUrl } = useAuthProfile();
    const { initialLoading, rows: errands, runnerNameMap, refetch } = useMyErrands();
    const { width } = useWindowDimensions();

    // Responsive sidebar: hide on small screens (< 1024px) and show via hamburger
    const isSmallScreen = width < 1024;
    const [open, setOpen] = React.useState(!isSmallScreen);

    React.useEffect(() => {
        setOpen(!isSmallScreen);
    }, [isSmallScreen]);

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

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }}>
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
                    onLogout={() => {
                        supabase.auth.signOut();
                        router.replace("/login");
                    }}
                    userName={fullName}
                    userRole={roleLabel}
                    profilePictureUrl={profilePictureUrl}
                />

                <View style={web.mainArea}>
                    <View style={[web.topBar, isSmallScreen && { gap: 12 }]}>
                        <View style={web.topBarSide}>
                            {isSmallScreen && (
                                <TouchableOpacity
                                    onPress={() => setOpen(true)}
                                    style={web.hamburgerBtn}
                                    activeOpacity={0.7}
                                >
                                    <Ionicons name="menu-outline" size={24} color={colors.text} />
                                </TouchableOpacity>
                            )}
                            {isSmallScreen ? (
                                <TouchableOpacity onPress={() => router.push("/buddycaller/home")} style={web.backButtonIcon} activeOpacity={0.8}>
                                    <Ionicons name="arrow-back" size={20} color={colors.text} />
                                </TouchableOpacity>
                            ) : (
                                <TouchableOpacity onPress={() => router.push("/buddycaller/home")} style={web.backButton}>
                                    <Ionicons name="arrow-back" size={20} color={colors.text} />
                                    <Text style={web.backText}>Back</Text>
                                </TouchableOpacity>
                            )}
                        </View>

                        <View style={web.topBarTitleWrap}>
                            <Text style={[web.welcome, isSmallScreen && { textAlign: "center" }]} numberOfLines={1}>
                                {loading ? "Loading…" : `My Requests`}
                            </Text>
                        </View>

                        <View style={web.topBarSideRight}>
                            <TouchableOpacity
                                onPress={() => router.push("/buddycaller/notification")}
                                style={web.notificationIcon}
                                activeOpacity={0.9}
                            >
                                <Ionicons name="notifications-outline" size={24} color={colors.text} />
                            </TouchableOpacity>
                        </View>
                    </View>

                    <ScrollView contentContainerStyle={{ paddingVertical: 24 }}>
                        <View style={[web.container, { maxWidth: 980 }]}>
                            {/* Ongoing Errands Section */}
                            <View style={web.section}>
                                <Text style={web.sectionTitle}>Ongoing Errands</Text>
                                {initialLoading ? (
                                    <Text style={web.loadingText}>Loading…</Text>
                                ) : ongoingErrands.length === 0 ? (
                                    <View style={web.emptyState}>
                                        <Ionicons name="time-outline" size={48} color={colors.border} />
                                        <Text style={web.emptyText}>No ongoing errands</Text>
                                        <Text style={web.emptySubtext}>Your active errands will appear here</Text>
                                    </View>
                                ) : (
                                    <View style={web.errandsList}>
                                        {ongoingErrands.map((errand) => (
                                            <ErrandCardWeb key={errand.id} errand={errand} />
                                        ))}
                                    </View>
                                )}
                            </View>

                            {/* Past Errands Section */}
                            <View style={web.section}>
                                <Text style={web.sectionTitle}>Past Errands</Text>
                                {initialLoading ? (
                                    <Text style={web.loadingText}>Loading…</Text>
                                ) : pastErrands.length === 0 ? (
                                    <View style={web.emptyState}>
                                        <Ionicons name="checkmark-circle-outline" size={48} color={colors.border} />
                                        <Text style={web.emptyText}>No completed errands</Text>
                                        <Text style={web.emptySubtext}>Your completed errands will appear here</Text>
                                    </View>
                                ) : (
                                    <View style={web.errandsList}>
                                        {pastErrands.map((errand) => (
                                            <ErrandCardWeb key={errand.id} errand={errand} />
                                        ))}
                                    </View>
                                )}
                            </View>
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
                { transform: [{ translateX: open ? 0 : -260 }], width: 260 },
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
            style={[
                web.sideItem,
                active && { backgroundColor: colors.maroon },
                !open && web.sideItemCollapsed,
            ]}
        >
            <Ionicons name={icon} size={18} color={active ? "#fff" : colors.text} />
            {open && (
                <Text style={[web.sideItemText, active && { color: "#fff", fontWeight: "700" }]}>{label}</Text>
            )}
        </TouchableOpacity>
    );
}

/* ======================= ERRAND CARD (WEB) ======================= */
function ErrandCardWeb({ errand }: { errand: Errand }) {
    const router = useRouter();
    const isOngoing = isOngoingErrand(errand.status);

    return (
        <TouchableOpacity
            style={web.errandCard}
            onPress={() => {
                // Navigate to map page for ongoing errands
                if (isOngoing) {
                    router.push({
                        pathname: "/buddycaller/view_map_web",
                        params: { id: errand.id }
                    });
                } else if (errand.status === "Completed") {
                    // Navigate to Errand Details page for completed errands
                    router.push(`/buddycaller/errand_details_web?id=${errand.id}`);
                } else {
                    // For other past errands (Delivered, Cancelled), use the old view errand page
                    router.push(`/buddycaller/view_errand_web?id=${errand.id}`);
                }
            }}
        >
            <View style={web.cardHeader}>
                <Text style={web.cardTitle}>{errand.title}</Text>
                <View style={[web.statusBadge, { backgroundColor: getStatusColor(errand.status) }]}>
                    <Text style={web.statusText}>{errand.status}</Text>
                </View>
            </View>
            
            <View style={web.cardContent}>
                {errand.category && (
                    <View style={web.infoRow}>
                        <Ionicons name="folder-outline" size={14} color={colors.maroon} />
                        <Text style={web.infoText}>{errand.category}</Text>
                    </View>
                )}
                
                <View style={web.infoRow}>
                    <Ionicons name="walk-outline" size={14} color={colors.maroon} />
                    <Text style={web.infoText}>{errand.requester}</Text>
                </View>
                
                <View style={web.infoRow}>
                    <Ionicons name="time-outline" size={14} color={colors.maroon} />
                    <Text style={web.infoText}>
                        {new Date(errand.created_at).toLocaleDateString()}
                    </Text>
                </View>
                
                {errand.amount_price && (
                    <View style={web.infoRow}>
                        <Ionicons name="cash-outline" size={14} color={colors.maroon} />
                        <Text style={web.infoText}>₱{errand.amount_price.toFixed(2)}</Text>
                    </View>
                )}
            </View>
            
            <View style={web.cardFooter}>
                <Text style={web.viewText}>View Details →</Text>
            </View>
        </TouchableOpacity>
    );
}

/* ======================= STYLES (WEB) ======================= */
const web = StyleSheet.create({
    sidebar: { 
        width: 260, 
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
        paddingHorizontal: 16 
    },
    sideItemCollapsed: { justifyContent: "center", paddingHorizontal: 0, gap: 0, height: 56 },
    sideItemText: { color: colors.text, fontSize: 14, fontWeight: "600" },
    sidebarFooter: { padding: 12, gap: 10 },
    userCard: { 
        backgroundColor: colors.faint, 
        borderRadius: 10, 
        padding: 10, 
        flexDirection: "row", 
        alignItems: "center", 
        gap: 10 
    },
    userAvatar: { 
        width: 34, 
        height: 34, 
        borderRadius: 999, 
        backgroundColor: "#fff", 
        alignItems: "center", 
        justifyContent: "center", 
        borderWidth: 1, 
        borderColor: colors.border 
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

    mainArea: { flex: 1, backgroundColor: "#fff" },
    topBar: { 
        height: 90, 
        flexDirection: "row", 
        alignItems: "center", 
        justifyContent: "space-between",
        borderBottomWidth: 1, 
        borderBottomColor: "#EDE9E8", 
        paddingHorizontal: 16,
        gap: 16
    },
    notificationIcon: { padding: 8, borderRadius: 8, backgroundColor: colors.faint, position: "relative" },
    topBarSide: { flexDirection: "row", alignItems: "center", gap: 10, minWidth: 150 },
    topBarTitleWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
    topBarSideRight: { minWidth: 60, alignItems: "flex-end", justifyContent: "center" },
    backButton: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 8,
        backgroundColor: colors.faint,
    },
    backButtonIcon: {
        width: 44,
        height: 44,
        borderRadius: 12,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: colors.faint,
    },
    backText: { color: colors.text, fontSize: 14, fontWeight: "600" },
    welcome: { color: colors.text, fontSize: 18, fontWeight: "900" },

    container: { width: "100%", maxWidth: 980, alignSelf: "center", paddingHorizontal: 8 },
    section: { marginBottom: 32 },
    sectionTitle: { 
        color: colors.text, 
        fontWeight: "900", 
        fontSize: 18, 
        marginBottom: 16 
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
        paddingVertical: 40,
        paddingHorizontal: 20,
    },
    emptyText: {
        color: colors.text,
        fontSize: 16,
        fontWeight: "600",
        marginTop: 12,
        marginBottom: 4,
    },
    emptySubtext: {
        color: colors.text,
        fontSize: 14,
        opacity: 0.7,
        textAlign: "center",
    },
    errandsList: { gap: 12 },

    errandCard: {
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 12,
        backgroundColor: "#fff",
        padding: 16,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
    },
    cardHeader: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "flex-start",
        marginBottom: 12,
    },
    cardTitle: {
        flex: 1,
        fontSize: 16,
        fontWeight: "800",
        color: colors.text,
        marginRight: 12,
    },
    statusBadge: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 20,
    },
    statusText: {
        color: "#fff",
        fontSize: 12,
        fontWeight: "700",
    },
    cardContent: {
        gap: 8,
        marginBottom: 12,
    },
    infoRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
    },
    infoText: {
        fontSize: 14,
        color: colors.text,
        opacity: 0.8,
    },
    cardFooter: {
        alignItems: "flex-end",
    },
    viewText: {
        color: colors.maroon,
        fontSize: 14,
        fontWeight: "600",
    },
});
