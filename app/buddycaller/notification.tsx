import { Ionicons } from "@expo/vector-icons";
import { Stack, usePathname, useRouter } from "expo-router";
import React, { useState, useCallback, useEffect } from "react";
import {
    Alert,
    Image,
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

/* ===================== LOGOUT MODALS (WEB-STYLED) ===================== */
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
    if (!visible) return null;
    return (
        <View style={confirm.backdrop} pointerEvents="auto">
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
    );
}

const confirm = StyleSheet.create({
    backdrop: {
        position: "absolute", top: 0, right: 0, bottom: 0, left: 0,
        backgroundColor: "rgba(0,0,0,0.38)", alignItems: "center", justifyContent: "center", zIndex: 9999,
    },
    card: {
        width: 360, maxWidth: "90%", backgroundColor: "#fff",
        borderRadius: 14, padding: 18, borderWidth: 1, borderColor: colors.border,
        ...(Platform.OS === 'web' ? { boxShadow: '0px 4px 12px rgba(0,0,0,0.06)' } : {}),
        elevation: 6,
    },
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
    if (!visible) return null;
    return (
        <View style={success.backdrop} pointerEvents="auto">
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
    card: {
        width: 400,                // a bit wider (optional; remove if you prefer 360)
        maxWidth: "100%",
        backgroundColor: "#fff",
        borderRadius: 14,
        padding: 18,
        alignItems: "center",      // ⬅️ center icon & texts horizontally
    },
    iconWrap: {
        width: 64,
        height: 64,
        borderRadius: 999,
        backgroundColor: colors.faint,
        alignItems: "center",
        justifyContent: "center",
        marginBottom: 10,
    },
    title: {
        color: colors.text,
        fontSize: 16,
        fontWeight: "900",
        marginBottom: 4,
        textAlign: "center",       // ⬅️ center the "Logged out"
    },
    msg: {
        color: colors.text,
        fontSize: 13,
        opacity: 0.9,
        marginBottom: 14,
        textAlign: "center",       // keep centered
    },
    okBtn: {
        backgroundColor: colors.maroon,
        paddingVertical: 14,
        borderRadius: 12,
        width: "70%",             // ⬅️ make the button BIG (full width of card)
        alignItems: "center",
        justifyContent: "center",
    },
    okText: { color: "#fff", fontWeight: "700" },
});
/* ========= REUSE THE SAME AUTH PROFILE HOOK AS buddyrunner/home ========= */
type ProfileRow = {
    id: string;
    role: "buddyrunner" | "buddycaller" | string | null;
    first_name: string | null;
    last_name: string | null;
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

function useAuthProfile() {
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
                .select("id, role, first_name, last_name, profile_picture_url")
                .eq("id", user.id)
                .single<ProfileRow & { profile_picture_url: string | null }>();
            if (error) throw error;

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
            setProfilePictureUrl(row?.profile_picture_url || null);

            const roleRaw = (row?.role || "").toString().toLowerCase();
            setRoleLabel(
                roleRaw === "buddyrunner"
                    ? "BuddyRunner"
                    : roleRaw === "buddycaller"
                        ? "BuddyCaller"
                        : ""
            );
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
    const isWeb = Platform.OS === "web" || width >= 900;
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

    // Define loadNotifications function
    const loadNotifications = useCallback(async () => {
        try {
            const { data: { user: currentUser } } = await supabase.auth.getUser();
            if (!currentUser) {
                console.error('No authenticated user found');
                return;
            }

            // Load notifications from the notifications table
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

            let allNotifications: Notif[] = [];

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

            setNotifications(allNotifications);
        } catch (error) {
            console.error('Error loading notifications:', error);
        } finally {
            setLoading(false);
        }
    }, []);

    // Load notifications on mount
    useEffect(() => {
        loadNotifications();
    }, [loadNotifications]);

    const onView = (n: Notif) => {
        // Don't navigate for warning notifications
        if (n.id && typeof n.id === 'string' && n.id.startsWith('warning_')) {
            return;
        }
        
        if (n.commission_id) {
            router.push(`/buddycaller/view_commission?id=${n.commission_id}`);
        }
    };

    const goHome = () => router.replace("/buddycaller/home");
    const goNotifications = () => {
        if (pathname !== "/buddycaller/notification")
            router.replace("/buddycaller/notification");
    };
    const goProfile = () => router.replace("/buddycaller/profile");

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
                        onPress={() => router.push('/buddycaller/home')}
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
                        <Text style={styles.emptySubtitle}>You'll see notifications here</Text>
                    </View>
                ) : (
                    notifications.map((notification) => (
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
                                        {notification.id && typeof notification.id === 'string' && notification.id.startsWith('warning_') ? '⚠️ Warning' : notification.title}
                                    </Text>
                                    <Text style={styles.notificationBody}>
                                        {notification.body}
                                    </Text>
                                    {notification.created_at && (
                                        <Text style={styles.notificationTime}>
                                            {formatNotificationTime(notification.created_at)}
                                        </Text>
                                    )}
                                </View>
                            </View>
                        </TouchableOpacity>
                    ))
                )}
            </ScrollView>

            {/* Bottom bar */}
            <MobileBottomBar
                onHome={goHome}
                onNotifications={goNotifications}
                onProfile={goProfile}
            />
        </SafeAreaView>
    );
}

/* ---- Mobile bottom nav ---- */
function MobileBottomBar({
    onHome,
    onNotifications,
    onProfile,
}: {
    onHome: () => void;
    onNotifications: () => void;
    onProfile: () => void;
}) {
    return (
        <View style={m.bottomBar}>
            <TouchableOpacity style={m.bottomItem} onPress={onHome} activeOpacity={0.9}>
                <Ionicons name="home" size={22} color="#fff" />
                <Text style={m.bottomText}>Home</Text>
            </TouchableOpacity>
            <TouchableOpacity
                style={m.bottomItem}
                onPress={onNotifications}
                activeOpacity={0.9}
            >
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

/* --------- MOBILE styles --------- */
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
});

const m = StyleSheet.create({
    bottomBar: {
        position: "absolute", left: 0, right: 0, bottom: 0, height: 91, backgroundColor: colors.maroon,
        flexDirection: "row", alignItems: "center", justifyContent: "space-around",
        paddingHorizontal: 16, paddingBottom: 30, paddingTop: 10,
    },
    bottomItem: { alignItems: "center", justifyContent: "center" },
    bottomText: { color: "#fff", fontSize: 12, marginTop: 4 },
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
    
    // Responsive sidebar: collapse on small screens (< 1024px), expand on larger screens
    const isSmallScreen = width < 1024;
    const [open, setOpen] = useState(!isSmallScreen);
    
    // Auto-collapse/expand sidebar based on screen size
    React.useEffect(() => {
        setOpen(!isSmallScreen);
    }, [isSmallScreen]);
    
    const [section, setSection] = useState<"home" | "messages" | "profile">("messages");

    // NEW: logout modal state
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [successOpen, setSuccessOpen] = useState(false);

    // >>> READ LOGGED USER (same as buddyrunner/home)
    const { fullName, roleLabel, profilePictureUrl } = useAuthProfile();

    // 👉 When open: left gutter; when closed: centered
    const contentStyle = open
        ? [web.container, web.contentGutterLeft]
        : [web.container, web.contentCentered];

    // NEW: logout actions (updated to match buddyrunner/home)
    const requestLogout = () => setConfirmOpen(true);
    const performLogout = async () => {
        setConfirmOpen(false);
        try {
            if (Platform.OS === "web") {
                await supabase.auth.signOut({ scope: "local" });
            } else {
                await supabase.auth.signOut();
            }
        } catch { }
        setSuccessOpen(true); // show success and wait for OK before navigating
    };

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }}>
            {/* Logout Modals */}
            <ConfirmModal
                visible={confirmOpen}
                title="Log Out?"
                message="Are you sure want to log out?"
                onCancel={() => setConfirmOpen(false)}
                onConfirm={performLogout}
            />
            <SuccessModal
                visible={successOpen}
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
                <SidebarInstant
                    open={open}
                    isSmallScreen={isSmallScreen}
                    onToggle={() => setOpen((v) => !v)}
                    activeKey={section}
                    onSelect={setSection}
                    onLogout={requestLogout}
                    // >>> pass real user values to the sidebar
                    userName={fullName}
                    userRole={roleLabel || "BuddyCaller"}
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
                            <Text style={[web.pageTitle, { marginBottom: 0 }]} numberOfLines={1}>
                                Notifications
                            </Text>
                        </View>
                    </View>

                    <ScrollView contentContainerStyle={{ paddingVertical: 24 }}>
                        <View style={contentStyle}>
                            <View style={{ gap: 18, marginTop: 8 }}>
                                {[0, 1, 2, 3, 4].map((i) => (
                                    <View key={i} style={web.notifBox} />
                                ))}
                            </View>
                        </View>
                    </ScrollView>
                </View>
            </View>
        </SafeAreaView>
    );
}

function SidebarInstant({
    open,
    isSmallScreen,
    onToggle,
    activeKey,
    onSelect,
    onLogout,
    userName,
    userRole,
    profilePictureUrl,
}: {
    open: boolean;
    isSmallScreen: boolean;
    onToggle: () => void;
    activeKey: "home" | "messages" | "profile";
    onSelect: (k: "home" | "messages" | "profile") => void;
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
            {/* Top brand + hamburger */}
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

            {/* Nav + Footer */}
            <View style={{ flex: 1, justifyContent: "space-between" }}>
                <View style={{ paddingTop: 8 }}>
                    <SideItem
                        label="Home"
                        icon="home-outline"
                        open={open}
                        active={false}
                        onPress={() => router.push("/buddycaller/home")}
                    />
                    <Separator />
                    <SideItem
                        label="Messages"
                        icon="chatbubbles-outline"
                        open={open}
                        active={false}
                        onPress={() => router.push("/buddycaller/messages_list")}
                    />
                    <Separator />
                    <SideItem
                        label="Profile"
                        icon="person-outline"
                        open={open}
                        active={false}
                        onPress={() => router.push("/buddycaller/profile")}
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
                                {/* >>> live values from Supabase */}
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
            style={[web.sideItem, active && web.sideItemActive, !open && web.sideItemCollapsed]}
        >
            <Ionicons name={icon} size={18} color={active ? "#fff" : colors.text} />
            {open && (
                <Text style={[web.sideItemText, active && { color: "#fff", fontWeight: "700" }]}>{label}</Text>
            )}
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
        height: 30, width: 30, borderRadius: 8, alignItems: "center", justifyContent: "center",
        backgroundColor: colors.faint, marginRight: 8,
    },

    sideItem: {
        width: "100%", alignSelf: "stretch", flexDirection: "row", alignItems: "center", gap: 10,
        paddingVertical: 16, paddingHorizontal: 18,
    },
    sideItemActive: { backgroundColor: colors.maroon, borderRadius: 0 },
    sideItemCollapsed: { justifyContent: "center", paddingHorizontal: 0, gap: 0, height: 56 },
    sideItemText: { color: colors.text, fontSize: 14, fontWeight: "600" },

    mainArea: { flex: 1, backgroundColor: "#fff" },
    topBar: { height: 72, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: 1, borderBottomColor: "#EDE9E8", paddingHorizontal: 16 },
    container: { width: "100%" },

    // when sidebar is OPEN: left-biased with gutter
    contentGutterLeft: {
        maxWidth: 980,
        alignSelf: "flex-start",
        paddingLeft: 45,
        paddingRight: 20,
    },
    // when sidebar is CLOSED: center the whole block
    contentCentered: {
        maxWidth: 980,
        alignSelf: "center",
        paddingHorizontal: 16,
    },

    pageTitle: { color: colors.text, fontWeight: "900", fontSize: 20, marginBottom: 12 },

    notifBox: {
        width: "100%",
        height: 78,
        backgroundColor: "#fff",
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 12,
    },

    sidebarFooter: { padding: 12, gap: 10 },
    userCard: {
        backgroundColor: colors.faint, borderRadius: 10, padding: 10,
        flexDirection: "row", alignItems: "center", gap: 10,
    },
    userAvatar: {
        width: 34, height: 34, borderRadius: 999, backgroundColor: "#fff",
        alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border,
    },
    userName: { color: colors.text, fontSize: 12, fontWeight: "800" },
    userRole: { color: colors.text, fontSize: 10, opacity: 0.7 },

    logoutBtn: {
        borderWidth: 1, borderColor: colors.maroon, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 16,
        flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, backgroundColor: "#fff",
    },
    logoutText: { color: colors.maroon, fontWeight: "700" },
});
