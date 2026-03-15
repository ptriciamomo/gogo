import { Ionicons } from "@expo/vector-icons";
import { Slot, usePathname, useRouter } from "expo-router";
import React, { useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Image,
    Platform,
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
    faint: "#F7F1F0",
};

/* ===================== AUTH PROFILE HOOK ===================== */
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
    const router = useRouter();
    const [loading, setLoading] = React.useState(true);
    const [firstName, setFirstName] = React.useState<string>("");
    const [fullName, setFullName] = React.useState<string>("");

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
                .select("id, role, first_name, last_name, is_blocked")
                .eq("id", user.id)
                .single();
            if (error) throw error;

            // Check if user is blocked
            if (row?.is_blocked) {
                console.log('User is blocked, logging out...');
                await supabase.auth.signOut();
                router.replace('/login');
                return;
            }

            // Verify admin role
            const roleRaw = (row?.role || "").toString().toLowerCase();
            if (roleRaw !== 'admin') {
                Alert.alert('Access Denied', 'You do not have admin privileges.');
                await supabase.auth.signOut();
                router.replace('/login');
                return;
            }

            const f = titleCase(row?.first_name || "");
            const l = titleCase(row?.last_name || "");
            const finalFull =
                (f && l ? `${f} ${l}` : "").trim() ||
                titleCase((user.user_metadata?.full_name as string) || (user.user_metadata?.name as string) || "") ||
                titleCase((user.email?.split("@")[0] || "").replace(/[._-]+/g, " ")) ||
                "Admin";
            setFirstName(f || finalFull.split(" ")[0] || "Admin");
            setFullName(finalFull);
        } catch {
            setFirstName("Admin");
            setFullName("Admin");
        } finally {
            setLoading(false);
        }
    }, [router]);

    React.useEffect(() => {
        fetchProfile();
        const { data: sub } = supabase.auth.onAuthStateChange(() => fetchProfile());
        return () => sub?.subscription?.unsubscribe?.();
    }, [fetchProfile]);
    return { loading, firstName, fullName };
}

export default function AdminLayout() {
    const router = useRouter();
    const pathname = usePathname();
    const { loading, fullName } = useAuthProfile();
    const { width: screenWidth } = useWindowDimensions();
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [confirmLogout, setConfirmLogout] = useState(false);

    // Responsive breakpoints
    const isSmall = screenWidth < 768;

    React.useEffect(() => {
        if (Platform.OS !== 'web') {
            Alert.alert('Not Available', 'Admin panel is only available on web.');
            router.replace('/login');
            return;
        }
    }, []);

    React.useEffect(() => {
        // Auto-collapse sidebar on small screens
        if (isSmall) {
            setSidebarOpen(false);
        }
    }, [isSmall]);

    const handleLogout = async () => {
        setConfirmLogout(false);
        
        // Clear any cached data immediately (web only)
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
            localStorage.clear();
            sessionStorage.clear();
        }
        
        // Sign out in the background (don't wait for it)
        supabase.auth.signOut().catch((error) => {
            console.error('Error during signOut:', error);
        });
        
        // Force immediate redirect using window.location for hard navigation
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
            window.location.replace('/login');
        } else {
            router.replace('/login');
        }
    };

    // Determine active route
    const getActiveRoute = () => {
        if (pathname?.includes('/admin/home')) return 'home';
        if (pathname?.includes('/admin/student-schedule')) return 'student-schedule';
        if (pathname?.includes('/admin/academic-calendar')) return 'academic-calendar';
        if (pathname?.includes('/admin/students')) return 'students';
        if (pathname?.includes('/admin/id_images')) return 'id_images';
        if (pathname?.includes('/admin/errands')) return 'errands';
        if (pathname?.includes('/admin/commissions')) return 'commissions';
        if (pathname?.includes('/admin/settlements')) return 'settlements';
        if (pathname?.includes('/admin/categories')) return 'categories';
        return '';
    };

    if (loading) {
        return (
            <SafeAreaView style={{ flex: 1, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' }}>
                <ActivityIndicator size="large" color={colors.maroon} />
            </SafeAreaView>
        );
    }

    if (Platform.OS !== 'web') {
        return null;
    }

    const activeRoute = getActiveRoute();

    return (
        <SafeAreaView style={styles.container}>
            <View style={{ flex: 1, flexDirection: 'row', backgroundColor: '#fff' }}>
                {/* Sidebar Overlay on small screens */}
                {(isSmall && sidebarOpen) && (
                    <View 
                        style={[styles.sidebarOverlay, { width: screenWidth }]}
                        onTouchEnd={() => setSidebarOpen(false)}
                    />
                )}
                
                <Sidebar
                    open={sidebarOpen}
                    onToggle={() => setSidebarOpen((v) => !v)}
                    onLogout={() => setConfirmLogout(true)}
                    userName={fullName}
                    isSmall={isSmall}
                    activeRoute={activeRoute}
                />
                
                <View style={styles.mainArea}>
                    <Slot />
                </View>
            </View>

            {/* Logout Confirmation Modal */}
            {confirmLogout && (
                <View style={styles.modalOverlay}>
                    <View style={[styles.modalCard, isSmall && styles.modalCardSmall]}>
                        <Text style={styles.modalTitle}>Log Out?</Text>
                        <Text style={styles.modalMessage}>Are you sure you want to log out?</Text>
                        <View style={styles.modalButtons}>
                            <TouchableOpacity
                                style={[styles.modalButton, styles.modalButtonCancel]}
                                onPress={() => setConfirmLogout(false)}
                            >
                                <Text style={styles.modalButtonCancelText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.modalButton, styles.modalButtonConfirm]}
                                onPress={handleLogout}
                            >
                                <Text style={styles.modalButtonConfirmText}>Log Out</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            )}
        </SafeAreaView>
    );
}

function Sidebar({
    open,
    onToggle,
    onLogout,
    userName,
    isSmall,
    activeRoute,
}: {
    open: boolean;
    onToggle: () => void;
    onLogout: () => void;
    userName: string;
    isSmall: boolean;
    activeRoute: string;
}) {
    const router = useRouter();
    const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
        academic: false,
        students: false,
        transactions: false,
        system: false,
    });

    const toggleSection = (section: string) => {
        setExpandedSections(prev => ({
            ...prev,
            [section]: !prev[section],
        }));
    };

    return (
        <View style={[
            styles.sidebar, 
            { 
                width: open ? (isSmall ? 260 : 260) : 74,
                ...(isSmall && open ? {
                    position: 'absolute' as any,
                    left: 0,
                    top: 0,
                    bottom: 0,
                    zIndex: 1000,
                    elevation: 10,
                } : {}),
            }
        ]}>
            <View style={styles.sidebarHeader}>
                <View
                    style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: open ? 10 : 0,
                        justifyContent: open ? "flex-start" : "center",
                        paddingHorizontal: open ? 16 : 6,
                        paddingVertical: 16,
                    }}
                >
                    <TouchableOpacity onPress={onToggle} style={[styles.sideMenuBtn, !open && { marginRight: 0 }]}>
                        <Ionicons name="menu-outline" size={20} color="#fff" />
                    </TouchableOpacity>
                    {open && (
                        <>
                            <Image source={require("../../assets/images/logo.png")} style={{ width: 22, height: 22, resizeMode: "contain" }} />
                            <Text style={styles.brand}>GoBuddy Admin</Text>
                        </>
                    )}
                </View>
            </View>

            <View style={{ flex: 1, backgroundColor: "#fff" }}>
                <ScrollView 
                    style={{ flex: 1 }} 
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={{ paddingTop: 8, paddingBottom: 8 }}
                >
                    <SideItem
                        label="Dashboard"
                        icon="home-outline"
                        open={open}
                        active={activeRoute === 'home'}
                        onPress={() => router.push("/admin/home")}
                    />
                    <Separator />
                    
                    <DropdownSection
                        title="Academic Management"
                        icon="school-outline"
                        open={open}
                        expanded={expandedSections.academic}
                        onToggle={() => toggleSection('academic')}
                    >
                        <SideItem
                            label="Student Schedule"
                            icon="calendar-outline"
                            open={open}
                            isSubItem
                            active={activeRoute === 'student-schedule'}
                            onPress={() => router.push("/admin/student-schedule")}
                        />
                        <SideItem
                            label="Academic Calendar"
                            icon="calendar-outline"
                            open={open}
                            isSubItem
                            active={activeRoute === 'academic-calendar'}
                            onPress={() => router.push("/admin/academic-calendar")}
                        />
                    </DropdownSection>
                    <Separator />
                    
                    <DropdownSection
                        title="Students"
                        icon="people-outline"
                        open={open}
                        expanded={expandedSections.students}
                        onToggle={() => toggleSection('students')}
                    >
                        <SideItem
                            label="List of Students"
                            icon="people-outline"
                            open={open}
                            isSubItem
                            active={activeRoute === 'students'}
                            onPress={() => router.push("/admin/students")}
                        />
                        <SideItem
                            label="Student ID Approval"
                            icon="id-card-outline"
                            open={open}
                            isSubItem
                            active={activeRoute === 'id_images'}
                            onPress={() => router.push("/admin/id_images")}
                        />
                    </DropdownSection>
                    <Separator />
                    
                    <DropdownSection
                        title="Transactions"
                        icon="receipt-outline"
                        open={open}
                        expanded={expandedSections.transactions}
                        onToggle={() => toggleSection('transactions')}
                    >
                        <SideItem
                            label="Errands Transactions"
                            icon="briefcase-outline"
                            open={open}
                            isSubItem
                            active={activeRoute === 'errands'}
                            onPress={() => router.push("/admin/errands")}
                        />
                        <SideItem
                            label="Commission Transactions"
                            icon="document-text-outline"
                            open={open}
                            isSubItem
                            active={activeRoute === 'commissions'}
                            onPress={() => router.push("/admin/commissions")}
                        />
                        <SideItem
                            label="Settlements"
                            icon="cash-outline"
                            open={open}
                            isSubItem
                            active={activeRoute === 'settlements'}
                            onPress={() => router.push("/admin/settlements")}
                        />
                    </DropdownSection>
                    <Separator />
                    
                    <DropdownSection
                        title="System"
                        icon="settings-outline"
                        open={open}
                        expanded={expandedSections.system}
                        onToggle={() => toggleSection('system')}
                    >
                        <SideItem
                            label="Category List"
                            icon="list-outline"
                            open={open}
                            isSubItem
                            active={activeRoute === 'categories'}
                            onPress={() => router.push("/admin/categories")}
                        />
                    </DropdownSection>
                    <Separator />
                </ScrollView>

                <View style={styles.sidebarFooter}>
                    <View style={styles.userCard}>
                        <View style={styles.userAvatar}>
                            <Ionicons name="person" size={18} color="#fff" />
                        </View>
                        {open && (
                            <View style={{ flex: 1 }}>
                                <Text style={styles.userName}>{userName || "Admin"}</Text>
                                <Text style={styles.userRole}>Administrator</Text>
                            </View>
                        )}
                    </View>

                    <TouchableOpacity onPress={onLogout} activeOpacity={0.8} style={styles.logoutBtn}>
                        <Ionicons name="log-out-outline" size={18} color="#fff" />
                        {open && <Text style={styles.logoutText}>Logout</Text>}
                    </TouchableOpacity>
                </View>
            </View>
        </View>
    );
}

function Separator() {
    return <View style={styles.separator} />;
}

function DropdownSection({
    title,
    icon,
    open,
    expanded,
    onToggle,
    children,
}: {
    title: string;
    icon: any;
    open: boolean;
    expanded: boolean;
    onToggle: () => void;
    children: React.ReactNode;
}) {
    if (!open) {
        return (
            <TouchableOpacity
                activeOpacity={0.9}
                onPress={onToggle}
                style={[styles.sideItem, styles.sideItemCollapsed]}
            >
                <Ionicons name={icon} size={18} color={colors.text} />
            </TouchableOpacity>
        );
    }

    return (
        <View>
            <TouchableOpacity
                activeOpacity={0.9}
                onPress={onToggle}
                style={styles.dropdownHeader}
            >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 12, flex: 1 }}>
                    <Ionicons name={icon} size={18} color={colors.text} />
                    <Text style={styles.dropdownTitle}>{title}</Text>
                </View>
                <Ionicons 
                    name={expanded ? "chevron-down" : "chevron-forward"} 
                    size={16} 
                    color={colors.text} 
                />
            </TouchableOpacity>
            {expanded && (
                <View style={styles.dropdownContent}>
                    {children}
                </View>
            )}
        </View>
    );
}

function SideItem({
    label,
    icon,
    open,
    active,
    isSubItem,
    onPress,
}: {
    label: string;
    icon: any;
    open: boolean;
    active?: boolean;
    isSubItem?: boolean;
    onPress?: () => void;
}) {
    return (
        <TouchableOpacity
            activeOpacity={0.9}
            onPress={onPress}
            style={[
                styles.sideItem, 
                active && styles.sideItemActive, 
                !open && styles.sideItemCollapsed,
                isSubItem && styles.sideItemSub
            ]}
        >
            <Ionicons name={icon} size={18} color={active ? colors.maroon : colors.text} />
            {open && (
                <Text style={[styles.sideItemText, active && styles.sideItemTextActive]}>{label}</Text>
            )}
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: "#fff",
    },
    sidebarOverlay: {
        position: 'absolute' as any,
        top: 0,
        left: 0,
        bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.3)',
        zIndex: 999,
    },
    sidebar: {
        borderRightColor: colors.border,
        borderRightWidth: 1,
        backgroundColor: "#fff",
    },
    sidebarHeader: {
        backgroundColor: "#a01a1a",
        ...(Platform.OS === 'web' ? {
            background: `linear-gradient(135deg, #a01a1a 0%, #8B0000 100%)`,
        } : {}),
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.1)',
    },
    brand: {
        color: "#fff",
        fontWeight: "800",
        fontSize: 16,
    },
    sideMenuBtn: {
        height: 36,
        width: 36,
        borderRadius: 8,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: 'rgba(255,255,255,0.15)',
        marginRight: 8,
    },
    sideItem: {
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        paddingVertical: 12,
        paddingHorizontal: 16,
        marginHorizontal: 8,
        marginVertical: 2,
        borderRadius: 10,
        backgroundColor: "#fff",
    },
    sideItemActive: {
        backgroundColor: "#f2e9e9",
    },
    sideItemCollapsed: {
        justifyContent: "center",
        paddingHorizontal: 0,
        gap: 0,
        height: 56,
        marginHorizontal: 8,
    },
    sideItemText: {
        color: colors.text,
        fontSize: 14,
        fontWeight: "600",
        flex: 1,
    },
    sideItemTextActive: {
        color: colors.maroon,
        fontWeight: "700",
    },
    sideItemSub: {
        paddingLeft: 40,
        marginLeft: 0,
    },
    dropdownHeader: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingVertical: 12,
        paddingHorizontal: 16,
        marginHorizontal: 8,
        marginVertical: 2,
        borderRadius: 10,
        backgroundColor: "#fff",
    },
    dropdownTitle: {
        color: colors.text,
        fontSize: 14,
        fontWeight: "600",
    },
    dropdownContent: {
        paddingLeft: 8,
    },
    separator: {
        height: 1,
        backgroundColor: colors.border,
        marginVertical: 4,
        marginHorizontal: 12,
    },
    sidebarFooter: {
        padding: 12,
        gap: 10,
    },
    userCard: {
        backgroundColor: "#a01a1a",
        ...(Platform.OS === 'web' ? {
            background: `linear-gradient(135deg, #a01a1a 0%, #8B0000 100%)`,
        } : {}),
        borderRadius: 12,
        padding: 12,
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
    },
    userAvatar: {
        width: 40,
        height: 40,
        borderRadius: 999,
        backgroundColor: 'rgba(255,255,255,0.2)',
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 2,
        borderColor: 'rgba(255,255,255,0.3)',
    },
    userName: {
        color: "#fff",
        fontSize: 13,
        fontWeight: "800",
    },
    userRole: {
        color: "#fff",
        fontSize: 11,
        opacity: 0.9,
    },
    logoutBtn: {
        borderWidth: 0,
        borderRadius: 12,
        paddingVertical: 12,
        paddingHorizontal: 16,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        backgroundColor: '#e72a2a',
        ...(Platform.OS === 'web' ? {
            background: `linear-gradient(135deg, #e72a2a 0%, #dc2626 100%)`,
        } : {}),
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.15,
        shadowRadius: 4,
        elevation: 3,
    },
    logoutText: {
        color: "#fff",
        fontWeight: "700",
        fontSize: 13,
    },
    mainArea: {
        flex: 1,
        backgroundColor: "#fafafa",
    },
    modalOverlay: {
        position: "absolute" as any,
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0,0,0,0.5)",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
    },
    modalCard: {
        width: 400,
        maxWidth: "90%",
        backgroundColor: "#fff",
        borderRadius: 12,
        padding: 24,
        gap: 16,
    },
    modalCardSmall: {
        width: "90%",
        padding: 20,
    },
    modalTitle: {
        color: colors.text,
        fontSize: 20,
        fontWeight: "900",
        textAlign: "center",
    },
    modalMessage: {
        color: colors.text,
        fontSize: 14,
        opacity: 0.8,
        textAlign: "center",
    },
    modalButtons: {
        flexDirection: "row",
        gap: 12,
        marginTop: 8,
    },
    modalButton: {
        flex: 1,
        paddingVertical: 12,
        borderRadius: 8,
        alignItems: "center",
        justifyContent: "center",
    },
    modalButtonCancel: {
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: "#fff",
    },
    modalButtonCancelText: {
        color: colors.text,
        fontWeight: "600",
    },
    modalButtonConfirm: {
        backgroundColor: colors.maroon,
    },
    modalButtonConfirmText: {
        color: "#fff",
        fontWeight: "700",
    },
});
