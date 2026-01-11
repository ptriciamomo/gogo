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

export default function AdminHome() {
    const router = useRouter();
    const { loading, fullName, firstName } = useAuthProfile();
    const { width: screenWidth } = useWindowDimensions();
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [confirmLogout, setConfirmLogout] = useState(false);
    const [statsLoading, setStatsLoading] = useState(true);
    const [stats, setStats] = useState({
        totalStudents: 0,
        totalErrands: 0,
        totalCommissions: 0,
    });

    // Responsive breakpoints
    const isSmall = screenWidth < 768;
    const isMedium = screenWidth >= 768 && screenWidth < 1024;
    const isLarge = screenWidth >= 1024;

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

    React.useEffect(() => {
        const fetchStats = async () => {
            try {
                const [studentsRes, errandsRes, commissionsRes] = await Promise.all([
                    supabase.from('users').select('id', { count: 'exact', head: true }).neq('role', 'admin'),
                    supabase.from('errand').select('id', { count: 'exact', head: true }),
                    supabase.from('commission').select('id', { count: 'exact', head: true }),
                ]);
                
                setStats({
                    totalStudents: studentsRes.count || 0,
                    totalErrands: errandsRes.count || 0,
                    totalCommissions: commissionsRes.count || 0,
                });
            } catch (error) {
                console.error('Error fetching stats:', error);
            } finally {
                setStatsLoading(false);
            }
        };
        fetchStats();
    }, []);

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
        // This bypasses React Router and any auth state listeners
        // Do this immediately, don't wait for signOut to complete
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
            // Use window.location.replace for immediate navigation without history entry
            window.location.replace('/login');
        } else {
            router.replace('/login');
        }
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
                />
                
                <View style={styles.mainArea}>
                    <View style={styles.topBar}>
                        <Text style={[styles.welcome, isSmall && styles.welcomeSmall]}>
                            Welcome back, {firstName}!
                        </Text>
                    </View>

                    <ScrollView style={{ flex: 1, backgroundColor: '#fafafa' }}>
                        {Platform.OS === 'web' && (
                            <style>{`
                                .stat-card:hover {
                                    transform: translateY(-4px);
                                    box-shadow: 0 8px 24px rgba(0,0,0,0.2) !important;
                                }
                                .quick-action-card:hover {
                                    transform: translateY(-2px);
                                    box-shadow: 0 4px 16px rgba(0,0,0,0.15) !important;
                                }
                            `}</style>
                        )}
                        <View style={[styles.content, isSmall && styles.contentSmall]}>
                            <Text style={[styles.pageTitle, isSmall && styles.pageTitleSmall]}>
                                Admin Dashboard
                            </Text>
                            
                            {statsLoading ? (
                                <View style={{ padding: 40, alignItems: 'center' }}>
                                    <ActivityIndicator size="large" color={colors.maroon} />
                                </View>
                            ) : (
                                <View style={[styles.statsRow, isSmall && styles.statsRowSmall]}>
                                    <StatsCard
                                        value={stats.totalStudents}
                                        label="Total Students"
                                        icon="people-outline"
                                        isSmall={isSmall}
                                    />
                                    <StatsCard
                                        value={stats.totalErrands}
                                        label="Total Errands"
                                        icon="briefcase-outline"
                                        isSmall={isSmall}
                                    />
                                    <StatsCard
                                        value={stats.totalCommissions}
                                        label="Total Commissions"
                                        icon="document-text-outline"
                                        isSmall={isSmall}
                                    />
                                </View>
                            )}

                            <View style={styles.section}>
                                <Text style={[styles.sectionTitle, isSmall && styles.sectionTitleSmall]}>
                                    Quick Actions
                                </Text>
                                <View style={[styles.quickActions, isSmall && styles.quickActionsSmall]}>
                                    <QuickActionCard
                                        title="List of Students"
                                        description="View all student profiles"
                                        icon="people"
                                        onPress={() => router.push('/admin/students')}
                                        isSmall={isSmall}
                                    />
                                    <QuickActionCard
                                        title="Settlements"
                                        description="View student settlements and payments"
                                        icon="cash"
                                        onPress={() => router.push('/admin/settlements')}
                                        isSmall={isSmall}
                                    />
                                    <QuickActionCard
                                        title="Errands Transactions"
                                        description="View all errand transactions"
                                        icon="briefcase"
                                        onPress={() => router.push('/admin/errands')}
                                        isSmall={isSmall}
                                    />
                                    <QuickActionCard
                                        title="Commission Transactions"
                                        description="View all commission transactions"
                                        icon="document-text"
                                        onPress={() => router.push('/admin/commissions')}
                                        isSmall={isSmall}
                                    />
                                    <QuickActionCard
                                        title="Student ID Approval"
                                        description="Review and approve student ID images"
                                        icon="id-card"
                                        onPress={() => router.push('/admin/id_images')}
                                        isSmall={isSmall}
                                    />
                                </View>
                            </View>
                        </View>
                    </ScrollView>
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
}: {
    open: boolean;
    onToggle: () => void;
    onLogout: () => void;
    userName: string;
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
                        active
                        onPress={() => router.push("/admin/home")}
                    />
                    <Separator />
                    <SideItem
                        label="List of Students"
                        icon="people-outline"
                        open={open}
                        onPress={() => router.push("/admin/students")}
                    />
                    <Separator />
                    <SideItem
                        label="Settlements"
                        icon="cash-outline"
                        open={open}
                        onPress={() => router.push("/admin/settlements")}
                    />
                    <Separator />
                    <SideItem
                        label="Student ID Approval"
                        icon="id-card-outline"
                        open={open}
                        onPress={() => router.push("/admin/id_images")}
                    />
                    <Separator />
                    <SideItem
                        label="Errands Transactions"
                        icon="briefcase-outline"
                        open={open}
                        onPress={() => router.push("/admin/errands")}
                    />
                    <Separator />
                    <SideItem
                        label="Commission Transactions"
                        icon="document-text-outline"
                        open={open}
                        onPress={() => router.push("/admin/commissions")}
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

function StatsCard({ value, label, icon, isSmall }: { value: number; label: string; icon: string; isSmall: boolean }) {
    // Different color schemes for each card - new modern palette
    const getCardStyle = (label: string) => {
        if (label.includes('Students')) {
            return { gradient: ['#10b981', '#059669'], iconBg: '#10b981', iconColor: '#fff' };
        } else if (label.includes('Errands')) {
            return { gradient: ['#f59e0b', '#d97706'], iconBg: '#f59e0b', iconColor: '#fff' };
        } else {
            return { gradient: ['#3b82f6', '#2563eb'], iconBg: '#3b82f6', iconColor: '#fff' };
        }
    };
    
    const cardStyle = getCardStyle(label);
    
    return (
        <View 
            style={[styles.statCard, isSmall && styles.statCardSmall, { 
                backgroundColor: cardStyle.gradient[0],
                ...(Platform.OS === 'web' ? {
                    background: `linear-gradient(135deg, ${cardStyle.gradient[0]} 0%, ${cardStyle.gradient[1]} 100%)`,
                } : {}),
            }]}
            {...(Platform.OS === 'web' ? { className: 'stat-card' } : {})}
        >
            <View style={[styles.statIconContainer, { backgroundColor: 'rgba(255, 255, 255, 0.2)' }]}>
                <Ionicons name={icon as any} size={isSmall ? 24 : 32} color="#fff" />
            </View>
            <Text style={[styles.statValue, isSmall && styles.statValueSmall, { color: '#fff' }]}>{value}</Text>
            <Text style={[styles.statLabel, isSmall && styles.statLabelSmall, { color: '#fff', opacity: 0.95 }]}>{label}</Text>
        </View>
    );
}

function QuickActionCard({
    title,
    description,
    icon,
    onPress,
    isSmall,
}: {
    title: string;
    description: string;
    icon: string;
    onPress: () => void;
    isSmall: boolean;
}) {
    // Different color schemes for each action card - updated to match new stat card colors
    const getCardColors = (title: string) => {
        if (title.includes('Students')) {
            return { bg: '#ecfdf5', iconBg: '#10b981', iconColor: '#fff', border: '#a7f3d0' };
        } else if (title.includes('Settlements')) {
            return { bg: '#fef3c7', iconBg: '#f59e0b', iconColor: '#fff', border: '#fde68a' };
        } else if (title.includes('Errands')) {
            return { bg: '#fffbeb', iconBg: '#f59e0b', iconColor: '#fff', border: '#fde68a' };
        } else if (title.includes('ID Approval') || title.includes('Student ID')) {
            return { bg: '#f3e8ff', iconBg: '#8b5cf6', iconColor: '#fff', border: '#ddd6fe' };
        } else {
            return { bg: '#eff6ff', iconBg: '#3b82f6', iconColor: '#fff', border: '#bfdbfe' };
        }
    };
    
    const cardColors = getCardColors(title);
    
    return (
        <TouchableOpacity 
            style={[
                styles.quickActionCard, 
                isSmall && styles.quickActionCardSmall,
                { 
                    backgroundColor: cardColors.bg,
                    borderColor: cardColors.border,
                }
            ]} 
            onPress={onPress} 
            activeOpacity={0.8}
            {...(Platform.OS === 'web' ? { className: 'quick-action-card' } : {})}
        >
            <View style={[
                styles.quickActionIcon, 
                isSmall && styles.quickActionIconSmall,
                { backgroundColor: cardColors.iconBg }
            ]}>
                <Ionicons name={icon as any} size={isSmall ? 20 : 24} color={cardColors.iconColor} />
            </View>
            <Text style={[styles.quickActionTitle, isSmall && styles.quickActionTitleSmall]}>{title}</Text>
            <Text style={[styles.quickActionDescription, isSmall && styles.quickActionDescriptionSmall]}>{description}</Text>
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
    welcomeSmall: {
        fontSize: 16,
    },
    content: {
        width: "100%",
        maxWidth: 1200,
        alignSelf: "center",
        paddingHorizontal: 24,
        paddingVertical: 24,
        backgroundColor: "#fafafa",
    },
    contentSmall: {
        paddingHorizontal: 16,
        paddingVertical: 16,
    },
    pageTitle: {
        color: colors.text,
        fontSize: 24,
        fontWeight: "900",
        marginBottom: 24,
    },
    pageTitleSmall: {
        fontSize: 20,
        marginBottom: 16,
    },
    statsRow: {
        flexDirection: "row",
        flexWrap: "nowrap",
        gap: 16,
        marginBottom: 32,
    },
    statsRowSmall: {
        flexDirection: "column",
        gap: 12,
        marginBottom: 24,
    },
    statCard: {
        flex: 1,
        height: 140,
        backgroundColor: "#fff",
        borderRadius: 16,
        padding: 20,
        justifyContent: "center",
        alignItems: "center",
        gap: 8,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 12,
        elevation: 8,
        ...(Platform.OS === 'web' ? {
            transition: 'transform 0.2s ease, box-shadow 0.2s ease',
            cursor: 'default',
        } : {}),
    },
    statCardSmall: {
        height: 120,
        padding: 16,
    },
    statIconContainer: {
        width: 56,
        height: 56,
        borderRadius: 16,
        alignItems: "center",
        justifyContent: "center",
        marginBottom: 4,
    },
    statValue: {
        fontSize: 36,
        fontWeight: "900",
        color: colors.text,
        lineHeight: 36,
        textAlign: "center",
        textShadowColor: 'rgba(0, 0, 0, 0.1)',
        textShadowOffset: { width: 0, height: 2 },
        textShadowRadius: 4,
    },
    statValueSmall: {
        fontSize: 28,
        lineHeight: 28,
    },
    statLabel: {
        fontSize: 14,
        fontWeight: "700",
        color: colors.text,
        opacity: 0.85,
        marginTop: 2,
        textAlign: "center",
    },
    statLabelSmall: {
        fontSize: 12,
    },
    section: {
        marginTop: 24,
    },
    sectionTitle: {
        color: colors.text,
        fontWeight: "900",
        fontSize: 18,
        marginBottom: 16,
    },
    sectionTitleSmall: {
        fontSize: 16,
        marginBottom: 12,
    },
    quickActions: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 16,
    },
    quickActionsSmall: {
        flexDirection: "column",
        gap: 12,
    },
    quickActionCard: {
        flex: 1,
        minWidth: 200,
        borderWidth: 2,
        borderRadius: 16,
        padding: 20,
        gap: 12,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
        elevation: 4,
        ...(Platform.OS === 'web' ? {
            transition: 'transform 0.2s ease, box-shadow 0.2s ease',
            cursor: 'pointer',
        } : {}),
    },
    quickActionCardSmall: {
        minWidth: '100%',
        padding: 16,
    },
    quickActionIcon: {
        width: 48,
        height: 48,
        borderRadius: 12,
        backgroundColor: colors.faint,
        alignItems: "center",
        justifyContent: "center",
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 2,
    },
    quickActionIconSmall: {
        width: 40,
        height: 40,
    },
    quickActionTitle: {
        color: colors.text,
        fontSize: 16,
        fontWeight: "700",
    },
    quickActionTitleSmall: {
        fontSize: 14,
    },
    quickActionDescription: {
        color: colors.text,
        fontSize: 13,
        opacity: 0.7,
    },
    quickActionDescriptionSmall: {
        fontSize: 12,
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
