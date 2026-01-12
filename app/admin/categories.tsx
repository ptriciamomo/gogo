import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
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
    const [fullName, setFullName] = React.useState<string>("");

    const fetchProfile = React.useCallback(async () => {
        try {
            // UI only - no actual auth check
            setFullName("Admin");
        } catch {
            setFullName("Admin");
        } finally {
            setLoading(false);
        }
    }, [router]);

    React.useEffect(() => {
        fetchProfile();
    }, [fetchProfile]);
    
    return { loading, fullName };
}

export default function AdminCategories() {
    const router = useRouter();
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
        // UI only - no actual logout
        router.replace('/login');
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

    return (
        <SafeAreaView style={styles.container}>
            <View style={{ flex: 1, flexDirection: 'row', backgroundColor: '#fff' }}>
                {/* Sidebar Overlay on small screens */}
                {(isSmall && sidebarOpen) && (
                    <TouchableOpacity 
                        style={[styles.sidebarOverlay, { width: screenWidth }]}
                        activeOpacity={1}
                        onPress={() => setSidebarOpen(false)}
                    />
                )}
                
                <Sidebar
                    open={sidebarOpen}
                    onToggle={() => setSidebarOpen((v) => !v)}
                    onLogout={() => setConfirmLogout(true)}
                    userName={fullName}
                    activeRoute="categories"
                    isSmall={isSmall}
                />
                
                <View style={styles.mainArea}>
                    <View style={styles.topBar}>
                        <Text style={styles.welcome}>Category List</Text>
                    </View>

                    <ScrollView style={{ flex: 1, backgroundColor: '#fff' }}>
                        <View style={styles.content}>
                            {/* Section 1: Errands */}
                            <View style={styles.section}>
                                <Text style={styles.sectionHeader}>Errands</Text>
                                <ScrollView horizontal showsHorizontalScrollIndicator={true}>
                                    <View style={styles.tableContainer}>
                                        <View style={styles.tableHeader}>
                                            <Text style={[styles.tableHeaderText, styles.tableCellOrder]}>Order</Text>
                                            <Text style={[styles.tableHeaderText, styles.tableCellCategory]}>Category</Text>
                                            <Text style={[styles.tableHeaderText, styles.tableCellActive]}>Active</Text>
                                            <Text style={[styles.tableHeaderText, styles.tableCellActions]}>Actions</Text>
                                        </View>
                                        <CategoryTableRow order={1} category="Deliver Items" active={true} index={0} />
                                        <CategoryTableRow order={2} category="Food Delivery" active={true} index={1} />
                                        <CategoryTableRow order={3} category="School Materials" active={true} index={2} />
                                        <CategoryTableRow order={4} category="Printing" active={true} index={3} />
                                    </View>
                                </ScrollView>
                            </View>

                            {/* Section 2: Commissions */}
                            <View style={styles.section}>
                                <Text style={styles.sectionHeader}>Commissions</Text>
                                <View style={styles.comingSoonContainer}>
                                    <Text style={styles.comingSoonText}>Coming soon</Text>
                                </View>
                            </View>
                        </View>
                    </ScrollView>
                </View>
            </View>

            {/* Logout Confirmation Modal */}
            {confirmLogout && (
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>Confirm Logout</Text>
                        <Text style={styles.modalMessage}>Are you sure you want to logout?</Text>
                        <View style={styles.modalActions}>
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
                                <Text style={styles.modalButtonConfirmText}>Logout</Text>
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
    activeRoute,
    isSmall,
}: {
    open: boolean;
    onToggle: () => void;
    onLogout: () => void;
    userName: string;
    activeRoute?: string;
    isSmall: boolean;
}) {
    const router = useRouter();
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

            <View style={{ flex: 1, justifyContent: "space-between", backgroundColor: "#fff" }}>
                <View style={{ paddingTop: 8 }}>
                    <SideItem
                        label="Dashboard"
                        icon="home-outline"
                        open={open}
                        active={activeRoute === 'home'}
                        onPress={() => router.push("/admin/home")}
                    />
                    <Separator />
                    <SideItem
                        label="List of Students"
                        icon="people-outline"
                        open={open}
                        active={activeRoute === 'students'}
                        onPress={() => router.push("/admin/students")}
                    />
                    <Separator />
                    <SideItem
                        label="Settlements"
                        icon="cash-outline"
                        open={open}
                        active={activeRoute === 'settlements'}
                        onPress={() => router.push("/admin/settlements")}
                    />
                    <Separator />
                    <SideItem
                        label="Student ID Approval"
                        icon="id-card-outline"
                        open={open}
                        active={activeRoute === 'id_images'}
                        onPress={() => router.push("/admin/id_images")}
                    />
                    <Separator />
                    <SideItem
                        label="Errands Transactions"
                        icon="briefcase-outline"
                        open={open}
                        active={activeRoute === 'errands'}
                        onPress={() => router.push("/admin/errands")}
                    />
                    <Separator />
                    <SideItem
                        label="Commission Transactions"
                        icon="document-text-outline"
                        open={open}
                        active={activeRoute === 'commissions'}
                        onPress={() => router.push("/admin/commissions")}
                    />
                    <Separator />
                    <SideItem
                        label="Category List"
                        icon="list-outline"
                        open={open}
                        active={activeRoute === 'categories'}
                        onPress={() => router.push("/admin/categories")}
                    />
                    <Separator />
                </View>

                <View style={styles.sidebarFooter}>
                    <View style={styles.userCard}>
                        <View style={styles.userAvatar}>
                            <Ionicons name="person" size={18} color="#fff" />
                        </View>
                        {open && (
                            <View style={{ flex: 1 }}>
                                <Text style={styles.userName}>{userName || "Admin"}</Text>
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

function CategoryTableRow({ order, category, active, index }: { order: number; category: string; active: boolean; index: number }) {
    const rowStyle = index % 2 === 0 ? styles.tableRow : styles.tableRowAlternate;
    
    return (
        <View style={rowStyle}>
            <Text style={[styles.tableCellText, styles.tableCellOrder]}>{order}</Text>
            <Text style={[styles.tableCellText, styles.tableCellCategory]}>{category}</Text>
            <View style={styles.tableCellActive}>
                <View style={styles.activeBadge}>
                    <Text style={styles.activeBadgeText}>Active</Text>
                </View>
            </View>
            <View style={styles.tableCellActions}>
                <TouchableOpacity style={styles.actionButton} disabled>
                    <Ionicons name="chevron-up-outline" size={16} color={colors.text} />
                </TouchableOpacity>
                <TouchableOpacity style={styles.actionButton} disabled>
                    <Ionicons name="chevron-down-outline" size={16} color={colors.text} />
                </TouchableOpacity>
                <TouchableOpacity style={styles.actionButton} disabled>
                    <Ionicons name="create-outline" size={16} color={colors.text} />
                </TouchableOpacity>
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
            style={[styles.sideItem, active && styles.sideItemActive, !open && styles.sideItemCollapsed]}
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
        borderBottomColor: "#8B0000",
    },
    brand: {
        fontSize: 16,
        fontWeight: "700",
        color: "#fff",
    },
    sideMenuBtn: {
        padding: 8,
        borderRadius: 4,
        marginRight: 8,
    },
    sideItem: {
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        paddingHorizontal: 16,
        paddingVertical: 12,
        marginHorizontal: 8,
        borderRadius: 8,
    },
    sideItemCollapsed: {
        justifyContent: "center",
        paddingHorizontal: 8,
    },
    sideItemActive: {
        backgroundColor: colors.faint,
    },
    sideItemText: {
        fontSize: 14,
        color: colors.text,
        fontWeight: "500",
    },
    sideItemTextActive: {
        color: colors.maroon,
        fontWeight: "600",
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
        borderRadius: 8,
        padding: 12,
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
    },
    userAvatar: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: "rgba(255,255,255,0.2)",
        justifyContent: "center",
        alignItems: "center",
    },
    userName: {
        color: "#fff",
        fontSize: 14,
        fontWeight: "600",
    },
    logoutBtn: {
        backgroundColor: "#8B0000",
        borderRadius: 8,
        padding: 12,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
    },
    logoutText: {
        color: "#fff",
        fontSize: 14,
        fontWeight: "600",
    },
    mainArea: {
        flex: 1,
        backgroundColor: "#fff",
    },
    topBar: {
        height: 90,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        paddingHorizontal: 24,
        backgroundColor: "#fff",
        ...(Platform.OS === 'web' ? {
            boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
        } : {
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.05,
            shadowRadius: 4,
            elevation: 2,
        }),
    },
    welcome: {
        color: colors.text,
        fontSize: 18,
        fontWeight: "900",
    },
    content: {
        width: "100%",
        maxWidth: 1200,
        alignSelf: "center",
        paddingHorizontal: 24,
        paddingVertical: 16,
        backgroundColor: "#fafafa",
    },
    section: {
        marginBottom: 40,
    },
    sectionHeader: {
        color: colors.text,
        fontSize: 20,
        fontWeight: "700",
        marginBottom: 16,
    },
    tableContainer: {
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 8,
        backgroundColor: "#fff",
        overflow: "hidden",
        minWidth: 1000,
    },
    tableHeader: {
        flexDirection: "row",
        backgroundColor: colors.faint,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        paddingVertical: 14,
        paddingHorizontal: 20,
    },
    tableHeaderText: {
        color: colors.text,
        fontSize: 13,
        fontWeight: "700",
    },
    tableRow: {
        flexDirection: "row",
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        paddingVertical: 16,
        paddingHorizontal: 20,
        alignItems: "center",
        minHeight: 56,
        backgroundColor: "#fff",
    },
    tableRowAlternate: {
        flexDirection: "row",
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        paddingVertical: 16,
        paddingHorizontal: 20,
        alignItems: "center",
        minHeight: 56,
        backgroundColor: "#F5F5F5",
    },
    tableCellText: {
        color: colors.text,
        fontSize: 13,
    },
    tableCellOrder: {
        width: 150,
        paddingRight: 24,
    },
    tableCellCategory: {
        width: 400,
        paddingRight: 24,
    },
    tableCellActive: {
        width: 180,
        paddingRight: 24,
    },
    tableCellActions: {
        width: 220,
        flexDirection: "row",
        gap: 8,
        alignItems: "center",
    },
    activeBadge: {
        backgroundColor: "#10B981",
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 4,
        alignSelf: "flex-start",
    },
    activeBadgeText: {
        color: "#fff",
        fontSize: 12,
        fontWeight: "600",
    },
    actionButton: {
        padding: 6,
        borderRadius: 4,
        backgroundColor: colors.faint,
        opacity: 0.6,
    },
    comingSoonContainer: {
        backgroundColor: "#fff",
        borderRadius: 8,
        padding: 32,
        borderWidth: 1,
        borderColor: colors.border,
        alignItems: "center",
        justifyContent: "center",
    },
    comingSoonText: {
        fontSize: 16,
        color: colors.text,
        opacity: 0.6,
        fontStyle: "italic",
    },
    modalOverlay: {
        position: 'absolute' as any,
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 1000,
    },
    modalContent: {
        backgroundColor: '#fff',
        borderRadius: 12,
        padding: 24,
        width: '90%',
        maxWidth: 400,
        ...(Platform.OS === 'web' ? {
            boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
        } : {
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.25,
            shadowRadius: 8,
            elevation: 8,
        }),
    },
    modalTitle: {
        fontSize: 20,
        fontWeight: "700",
        color: colors.text,
        marginBottom: 12,
    },
    modalMessage: {
        fontSize: 14,
        color: colors.text,
        opacity: 0.8,
        marginBottom: 24,
    },
    modalActions: {
        flexDirection: "row",
        gap: 12,
        justifyContent: "flex-end",
    },
    modalButton: {
        paddingHorizontal: 20,
        paddingVertical: 10,
        borderRadius: 8,
        minWidth: 80,
        alignItems: "center",
    },
    modalButtonCancel: {
        backgroundColor: colors.faint,
    },
    modalButtonCancelText: {
        color: colors.text,
        fontSize: 14,
        fontWeight: "600",
    },
    modalButtonConfirm: {
        backgroundColor: colors.maroon,
    },
    modalButtonConfirmText: {
        color: "#fff",
        fontSize: 14,
        fontWeight: "600",
    },
});
