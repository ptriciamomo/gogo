import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React from "react";
import { Image, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from "react-native";
import { supabase } from "../../lib/supabase";

const colors = { maroon: "#8B0000", light: "#FAF6F5", border: "#E5C8C5", text: "#531010", faint: "#F7F1F0" };

type ErrandRow = { id: number; title: string | null; status: string | null; runner_id: string | null; created_at: string; category?: string | null; pickup_status?: string | null; pickup_photo?: string | null; pickup_confirmed_at?: string | null };
type CommissionRow = { id: number; title: string | null; status: string | null; runner_id: string | null; created_at: string; commission_type?: string | null };

type UiStatus = "Pending" | "In Progress" | "Completed" | "Cancelled" | "Delivered";
const toUi = (s?: string | null): UiStatus => s === "in_progress" ? "In Progress" : s === "completed" ? "Completed" : s === "cancelled" ? "Cancelled" : s === "delivered" ? "Delivered" : "Pending";
const isOngoing = (s: UiStatus) => s === "Pending" || s === "In Progress";
const isPast = (s: UiStatus) => s === "Completed" || s === "Delivered" || s === "Cancelled";

function getStatusColor(status: UiStatus): string {
    switch (status) {
        case "Pending": return "#F59E0B";
        case "In Progress": return "#3B82F6";
        case "Completed": return "#10B981";
        case "Delivered": return "#8B5CF6";
        case "Cancelled": return "#EF4444";
        default: return colors.maroon;
    }
}

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

type ProfileRow = { id: string; role: string | null; first_name: string | null; last_name: string | null };

function useAuthProfile() {
    const [loading, setLoading] = React.useState(true);
    const [fullName, setFullName] = React.useState<string>("");
    const [roleLabel, setRoleLabel] = React.useState<string>("");
    const [profilePictureUrl, setProfilePictureUrl] = React.useState<string | null>(null);

    const fetchProfile = React.useCallback(async () => {
        try {
            const { data: userRes } = await supabase.auth.getUser();
            const user = userRes?.user;
            if (!user) { setLoading(false); return; }
            const { data: row } = await supabase
                .from("users")
                .select("id, role, first_name, last_name, profile_picture_url")
                .eq("id", user.id)
                .single<ProfileRow & { profile_picture_url: string | null }>();
            const f = titleCase(row?.first_name || "");
            const l = titleCase(row?.last_name || "");
            const finalFull = (f && l ? `${f} ${l}` : "").trim() || "User";
            setFullName(finalFull);
            const roleRaw = (row?.role || "").toString().toLowerCase();
            setRoleLabel(roleRaw === "buddyrunner" ? "BuddyRunner" : roleRaw === "buddycaller" ? "BuddyCaller" : "");
            setProfilePictureUrl(row?.profile_picture_url || null);
        } finally { setLoading(false); }
    }, []);

    React.useEffect(() => {
        fetchProfile();
        const { data: sub } = supabase.auth.onAuthStateChange(() => fetchProfile());
        return () => sub?.subscription?.unsubscribe?.();
    }, [fetchProfile]);

    return { loading, fullName, roleLabel, profilePictureUrl };
}

export default function AcceptedTasksWeb() {
	const router = useRouter();
	const { type } = useLocalSearchParams<{ type?: string }>();
	const mode: "errands" | "commissions" = String(type) === "commissions" ? "commissions" : "errands";
	const { loading, fullName, roleLabel, profilePictureUrl } = useAuthProfile();
	const { width } = useWindowDimensions();

	// Responsive sidebar: hide completely on small screens (< 1024px), show on larger screens
	const isSmallScreen = width < 1024;
	const [open, setOpen] = React.useState(!isSmallScreen);
	
	// On small screens, start with sidebar closed (hidden)
	// On larger screens, start with sidebar open
	React.useEffect(() => {
		if (isSmallScreen) {
			setOpen(false);
		} else {
			setOpen(true);
		}
	}, [isSmallScreen]);

	const [dataLoading, setDataLoading] = React.useState(true);
	const [rows, setRows] = React.useState<Array<ErrandRow | CommissionRow>>([]);

	React.useEffect(() => {
		(async () => {
			setDataLoading(true);
			try {
				const { data: auth } = await supabase.auth.getUser();
				const uid = auth?.user?.id;
				if (!uid) { setRows([]); return; }
				if (mode === "errands") {
					// For errands, show all assigned errands (no invoice system for errands)
					const { data } = await supabase.from("errand").select("id,title,status,runner_id,created_at,category").eq("runner_id", uid).order("created_at", { ascending: false });
					setRows((data || []) as ErrandRow[]);
				} else {
					// For commissions, only show those with accepted invoices
					const { data } = await supabase
						.from("commission")
						.select(`
							id,
							title,
							status,
							runner_id,
							created_at,
							commission_type,
							invoices!inner(
								id,
								status
							)
						`)
						.eq("runner_id", uid)
						.eq("invoices.status", "accepted")
						.order("created_at", { ascending: false });
					setRows((data || []) as CommissionRow[]);
				}
			} finally { setDataLoading(false); }
		})();
	}, [mode]);

	const mapped = rows.map((r: any) => ({ 
		id: r.id, 
		title: r.title || "(Untitled)", 
		tag: (r.category || r.commission_type || "").toString(), 
		status: mode === "commissions" ? toUi(r.status) : toUi(r.status), // Use actual status from database
		created_at: r.created_at 
	}));
	const ongoing = mapped.filter(x => isOngoing(x.status));
	const past = mapped.filter(x => isPast(x.status));

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
					onToggle={() => setOpen(!open)}
					onLogout={() => { supabase.auth.signOut(); router.replace("/login"); }}
					userName={fullName}
					userRole={roleLabel}
					profilePictureUrl={profilePictureUrl}
				/>

				<View style={web.mainArea}>
					<View style={[web.topBar, isSmallScreen && web.topBarSmall]}>
						{isSmallScreen ? (
							<>
								{/* Left side: Hamburger menu and back button together */}
								<View style={web.leftButtonsContainer}>
							<TouchableOpacity
								onPress={() => setOpen(true)}
								style={web.hamburgerBtn}
								activeOpacity={0.7}
							>
								<Ionicons name="menu-outline" size={24} color={colors.text} />
							</TouchableOpacity>
									<TouchableOpacity onPress={() => router.push("/buddyrunner/home")} style={[web.backButton, web.backButtonSmall]}>
										<Ionicons name="arrow-back" size={18} color={colors.text} />
									</TouchableOpacity>
								</View>
								{/* Center: Accepted Errands text */}
								<Text style={[web.welcome, web.welcomeSmall, web.welcomeCentered]}>{loading ? "Loading…" : mode === "commissions" ? "Accepted Commissions" : "Accepted Errands"}</Text>
								{/* Right side: Notification icon */}
								<TouchableOpacity
									onPress={() => router.push("/buddyrunner/notification")}
									style={web.notificationIcon}
									activeOpacity={0.7}
								>
									<Ionicons name="notifications-outline" size={20} color={colors.text} />
								</TouchableOpacity>
							</>
						) : (
							<>
						<TouchableOpacity onPress={() => router.push("/buddyrunner/home")} style={web.backButton}>
							<Ionicons name="arrow-back" size={20} color={colors.text} />
							<Text style={web.backText}>Back</Text>
						</TouchableOpacity>
						<Text style={web.welcome}>{loading ? "Loading…" : mode === "commissions" ? "Accepted Commissions" : "Accepted Errands"}</Text>
						<TouchableOpacity
							onPress={() => router.push("/buddyrunner/notification")}
							style={web.notificationIcon}
							activeOpacity={0.7}
						>
							<Ionicons name="notifications-outline" size={24} color={colors.text} />
						</TouchableOpacity>
							</>
						)}
					</View>

					<ScrollView contentContainerStyle={{ paddingVertical: 24 }}>
						<View style={[web.container, { maxWidth: 980 }]}>
							{/* Ongoing */}
							<View style={web.section}>
								<Text style={web.sectionTitle}>Ongoing {mode === "commissions" ? "Commissions" : "Errands"}</Text>
								{dataLoading ? (
									<Text style={web.loadingText}>Loading…</Text>
								) : ongoing.length === 0 ? (
									<View style={web.emptyState}>
										<Ionicons name="time-outline" size={48} color={colors.border} />
										<Text style={web.emptyText}>No ongoing {mode === "commissions" ? "commissions" : "errands"}</Text>
										<Text style={web.emptySubtext}>Your active {mode === "commissions" ? "commissions" : "errands"} will appear here</Text>
									</View>
								) : (
									<View style={web.list}>
										{ongoing.map((e) => (<TaskCardWeb key={e.id} title={e.title} tag={e.tag} status={e.status} created_at={e.created_at} id={e.id} mode={mode} />))}
									</View>
								)}
			</View>

							{/* Past */}
							<View style={web.section}>
								<Text style={web.sectionTitle}>Past {mode === "commissions" ? "Commissions" : "Errands"}</Text>
								{dataLoading ? (
									<Text style={web.loadingText}>Loading…</Text>
								) : past.length === 0 ? (
									<View style={web.emptyState}>
										<Ionicons name="checkmark-circle-outline" size={48} color={colors.border} />
										<Text style={web.emptyText}>No completed {mode === "commissions" ? "commissions" : "errands"}</Text>
										<Text style={web.emptySubtext}>Your completed {mode === "commissions" ? "commissions" : "errands"} will appear here</Text>
									</View>
								) : (
									<View style={web.list}>
										{past.map((e) => (<TaskCardWeb key={e.id} title={e.title} tag={e.tag} status={e.status} created_at={e.created_at} id={e.id} mode={mode} />))}
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
function Sidebar({ open, isSmallScreen, onToggle, onLogout, userName, userRole, profilePictureUrl }: { open: boolean; isSmallScreen: boolean; onToggle: () => void; onLogout: () => void; userName: string; userRole: string; profilePictureUrl?: string | null; }) {
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
					<SideItem label="Home" icon="home-outline" open={open} active onPress={() => router.push("/buddyrunner/home")} />
					<Separator />
					<SideItem label="Messages" icon="chatbubbles-outline" open={open} onPress={() => router.push("/buddyrunner/messages_hub")} />
					<SideItem label="Profile" icon="person-outline" open={open} onPress={() => router.push("/buddyrunner/profile")} />
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

function Separator() { return <View style={{ height: 1, backgroundColor: colors.border }} />; }

function SideItem({ label, icon, open, active, onPress }: { label: string; icon: any; open: boolean; active?: boolean; onPress?: () => void; }) {
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

/* ======================= TASK CARD (WEB) ======================= */
function TaskCardWeb({ title, tag, status, created_at, id, mode }: { title: string; tag?: string; status: UiStatus; created_at: string; id: number; mode: "errands" | "commissions" }) {
	const router = useRouter();
	const isOngoingErrand = isOngoing(status);
	
	return (
		<TouchableOpacity 
			style={web.card}
			onPress={() => {
				// For commissions, always navigate to Task Progress page
				if (mode === "commissions") {
					router.push({
						pathname: "/buddyrunner/task_progress_web",
						params: { id: id.toString() }
					});
				} else {
					// For errands: navigate to map page for ongoing errands, errand details for completed errands
					if (isOngoingErrand) {
						router.push({
						pathname: "/buddyrunner/view_map_web",
						params: { id: id.toString() }
					});
				} else if (status === "Completed") {
					router.push({
						pathname: "/buddyrunner/errand_details_web",
						params: { id: id.toString() }
					});
				} else {
					// For other past errands (Delivered, Cancelled), use task progress
					router.push({
						pathname: "/buddyrunner/task_progress_web",
						params: { id: id.toString() }
					});
					}
				}
			}}
		>
			<View style={web.cardHeader}>
				<Text style={web.cardTitle}>{title}</Text>
				<View style={[web.statusBadge, { backgroundColor: getStatusColor(status) }]}>
					<Text style={web.statusText}>{status}</Text>
				</View>
			</View>
			<View style={web.cardContent}>
				{tag && (
					<View style={web.infoRow}><Ionicons name="briefcase-outline" size={14} color={colors.maroon} /><Text style={web.infoText}>{tag}</Text></View>
				)}
				<View style={web.infoRow}><Ionicons name="time-outline" size={14} color={colors.maroon} /><Text style={web.infoText}>{new Date(created_at).toLocaleDateString()}</Text></View>
			</View>
			<View style={web.cardFooter}><Text style={web.viewText}>View Details →</Text></View>
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
		marginRight: 8,
	},
	leftButtonsContainer: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
	},
	brand: { color: colors.text, fontWeight: "800", fontSize: 16 },
	sideMenuBtn: {
		width: 40,
		height: 40,
		borderRadius: 10,
		backgroundColor: colors.faint,
		alignItems: "center",
		justifyContent: "center",
		marginRight: 10,
	},
	sideItem: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 14, paddingHorizontal: 16 },
	sideItemCollapsed: { justifyContent: "center", paddingHorizontal: 0 },
	sideItemText: { color: colors.text, fontSize: 14, fontWeight: "600" },
	sidebarFooter: { padding: 12, gap: 10 },
	userCard: { backgroundColor: colors.faint, borderRadius: 10, padding: 10, flexDirection: "row", alignItems: "center", gap: 10 },
	userAvatar: { width: 34, height: 34, borderRadius: 999, backgroundColor: "#fff", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border },
	userName: { color: colors.text, fontSize: 12, fontWeight: "800" },
	userRole: { color: colors.text, fontSize: 10, opacity: 0.7 },
	logoutBtn: { borderWidth: 1, borderColor: colors.maroon, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, backgroundColor: "#fff" },
	logoutText: { color: colors.maroon, fontWeight: "700" },
	mainArea: { flex: 1, backgroundColor: "#fff" },
	topBar: { height: 90, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: 1, borderBottomColor: "#EDE9E8", paddingHorizontal: 16, gap: 16 },
	topBarSmall: { height: 70, paddingHorizontal: 12, gap: 12 },
	notificationIcon: { padding: 8, borderRadius: 8, backgroundColor: colors.faint, position: "relative" },
	backButton: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, backgroundColor: colors.faint },
	backButtonSmall: { paddingVertical: 6, paddingHorizontal: 8, gap: 4 },
	backText: { color: colors.text, fontSize: 14, fontWeight: "600" },
	welcome: { color: colors.text, fontSize: 18, fontWeight: "900" },
	welcomeSmall: { fontSize: 16 },
	welcomeCentered: { flex: 1, textAlign: "center" },
	container: { width: "100%", maxWidth: 980, alignSelf: "center", paddingHorizontal: 8 },
	section: { marginBottom: 32 },
	sectionTitle: { color: colors.text, fontWeight: "900", fontSize: 18, marginBottom: 16 },
	loadingText: { color: colors.text, opacity: 0.7, fontSize: 14, textAlign: "center", paddingVertical: 20 },
	emptyState: { alignItems: "center", paddingVertical: 40, paddingHorizontal: 20 },
	emptyText: { color: colors.text, fontSize: 16, fontWeight: "600", marginTop: 12, marginBottom: 4 },
	emptySubtext: { color: colors.text, fontSize: 14, opacity: 0.7, textAlign: "center" },
	list: { gap: 12 },
	card: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, backgroundColor: "#fff", padding: 16, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 3 },
	cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 },
	cardTitle: { flex: 1, fontSize: 16, fontWeight: "800", color: colors.text, marginRight: 12 },
	statusBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
	statusText: { color: "#fff", fontSize: 12, fontWeight: "700" },
	cardContent: { gap: 8, marginBottom: 12 },
	infoRow: { flexDirection: "row", alignItems: "center", gap: 8 },
	infoText: { fontSize: 14, color: colors.text, opacity: 0.8 },
	cardFooter: { alignItems: "flex-end" },
	viewText: { color: colors.maroon, fontSize: 14, fontWeight: "600" },
});