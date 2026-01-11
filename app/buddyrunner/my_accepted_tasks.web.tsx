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
	status: "pending" | "accepted" | "in_progress" | "completed" | "cancelled" | "delivered" | null;
	runner_id: string | null;
	created_at: string | null;
	buddycaller_id: string | null;
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

	const fetchProfile = React.useCallback(async () => {
		try {
			const { data: userRes } = await supabase.auth.getUser();
			const user = userRes?.user;
			if (!user) { setLoading(false); return; }
			const { data: row } = await supabase
				.from("users")
				.select("id, role, first_name, last_name")
				.eq("id", user.id)
				.single<ProfileRow>();
			const f = titleCase(row?.first_name || "");
			const l = titleCase(row?.last_name || "");
			const finalFull = (f && l ? `${f} ${l}` : "").trim() || "User";
			setFullName(finalFull);
			const roleRaw = (row?.role || "").toString().toLowerCase();
			setRoleLabel(roleRaw === "buddyrunner" ? "BuddyRunner" : roleRaw === "buddycaller" ? "BuddyCaller" : "");
		} finally { setLoading(false); }
	}, []);

	React.useEffect(() => {
		fetchProfile();
		const { data: sub } = supabase.auth.onAuthStateChange(() => fetchProfile());
		return () => sub?.subscription?.unsubscribe?.();
	}, [fetchProfile]);

	return { loading, fullName, roleLabel };
}

/* ========= My Commissions loader ========= */
function useMyCommissions() {
	const [initialLoading, setInitialLoading] = React.useState(true);
	const [rows, setRows] = React.useState<CommissionRowDB[]>([]);
	const [uid, setUid] = React.useState<string | null>(null);
	const inFlightRef = React.useRef<Promise<void> | null>(null);
	const realtimeTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

	const fetchRows = React.useCallback(async (opts?: { silent?: boolean }) => {
		const silent = !!opts?.silent;
		if (inFlightRef.current) { try { await inFlightRef.current; } catch {} }
		const exec = (async () => {
			if (initialLoading && !silent) setInitialLoading(true);
			try {
				const { data: ures } = await supabase.auth.getUser();
				const currentUid = ures?.user?.id ?? null;
				setUid(currentUid);
				if (!currentUid) { setRows([]); return; }

				const { data, error } = await supabase
					.from("commission")
					.select("id, title, status, runner_id, created_at, buddycaller_id, commission_type, meetup_location, due_at")
					.eq("runner_id", currentUid)
					.order("created_at", { ascending: false });
				if (error) throw error;
				setRows((data ?? []) as CommissionRowDB[]);
			} finally { setInitialLoading(false); }
		})();
		inFlightRef.current = exec; try { await exec; } finally { inFlightRef.current = null; }
	}, [initialLoading]);

	React.useEffect(() => { fetchRows({ silent: false }); }, [fetchRows]);

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
		return () => { if (realtimeTimer.current) clearTimeout(realtimeTimer.current); supabase.removeChannel(ch); };
	}, [uid, fetchRows]);

	return { initialLoading, rows };
}

/* ============================== WEB LAYOUT ============================== */
export default function MyAcceptedTasksWeb() {
	const router = useRouter();
	const { loading, fullName, roleLabel } = useAuthProfile();
	const { initialLoading, rows } = useMyCommissions();

	const mapped: Commission[] = rows.map((r) => ({
		id: String(r.id),
		title: r.title || "(Untitled)",
		status: toUiStatus(r.status),
		requester: r.buddycaller_id ? "Assigned BuddyCaller" : "No buddycaller yet",
		created_at: r.created_at || new Date().toISOString(),
		commission_type: r.commission_type || undefined,
		meetup_location: r.meetup_location || undefined,
		due_at: r.due_at || undefined,
	}));

	const ongoing = mapped.filter((c) => c && (c.status === "Pending" || c.status === "Accepted" || c.status === "In Progress"));
	const past = mapped.filter((c) => c && (c.status === "Completed" || c.status === "Delivered" || c.status === "Cancelled"));

	return (
		<SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }}>
			<View style={{ flex: 1, flexDirection: "row" }}>
				<Sidebar
					onLogout={() => { supabase.auth.signOut(); router.replace("/login"); }}
					userName={fullName}
					userRole={roleLabel}
				/>

				<View style={web.mainArea}>
					<View style={web.topBar}>
						<TouchableOpacity onPress={() => router.back()} style={web.backButton}>
							<Ionicons name="arrow-back" size={20} color={colors.text} />
							<Text style={web.backText}>Back</Text>
						</TouchableOpacity>
						<Text style={web.welcome}>{loading ? "Loading…" : `My Accepted Tasks`}</Text>
						<TouchableOpacity
							onPress={() => router.push("/buddyrunner/notification")}
							style={web.notificationIcon}
							activeOpacity={0.7}
						>
							<Ionicons name="notifications-outline" size={24} color={colors.text} />
						</TouchableOpacity>
					</View>

					<ScrollView contentContainerStyle={{ paddingVertical: 24 }}>
						<View style={[web.container, { maxWidth: 980 }]}>
							{/* Ongoing */}
							<View style={web.section}>
								<Text style={web.sectionTitle}>Ongoing Commissions</Text>
								{initialLoading ? (
									<Text style={web.loadingText}>Loading…</Text>
								) : ongoing.length === 0 ? (
									<View style={web.emptyState}>
										<Ionicons name="time-outline" size={48} color={colors.border} />
										<Text style={web.emptyText}>No ongoing commissions</Text>
										<Text style={web.emptySubtext}>Your active commissions will appear here</Text>
									</View>
								) : (
									<View style={web.list}>
										{ongoing.map((c) => (<CommissionCardWeb key={c.id} commission={c} />))}
									</View>
								)}
							</View>

							{/* Past */}
							<View style={web.section}>
								<Text style={web.sectionTitle}>Past Commissions</Text>
								{initialLoading ? (
									<Text style={web.loadingText}>Loading…</Text>
								) : past.length === 0 ? (
									<View style={web.emptyState}>
										<Ionicons name="checkmark-circle-outline" size={48} color={colors.border} />
										<Text style={web.emptyText}>No completed commissions</Text>
										<Text style={web.emptySubtext}>Your completed commissions will appear here</Text>
									</View>
								) : (
									<View style={web.list}>
										{past.map((c) => (<CommissionCardWeb key={c.id} commission={c} />))}
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
function Sidebar({ onLogout, userName, userRole }: { onLogout: () => void; userName: string; userRole: string; }) {
	const router = useRouter();
	return (
		<View style={web.sidebar}>
			<View style={{ paddingHorizontal: 12, paddingVertical: 12 }}>
				<View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
					<Image source={require("../../assets/images/logo.png")} style={{ width: 22, height: 22, resizeMode: "contain" }} />
					<Text style={web.brand}>GoBuddy</Text>
				</View>
			</View>

			<View style={{ flex: 1, justifyContent: "space-between" }}>
				<View style={{ paddingTop: 8 }}>
					<SideItem label="Home" icon="home-outline" active onPress={() => router.push("/buddyrunner/home")} />
					<Separator />
					<SideItem label="Messages" icon="chatbubbles-outline" onPress={() => router.push("/buddyrunner/messages_hub")} />
					<SideItem label="Profile" icon="person-outline" onPress={() => router.push("/buddyrunner/profile")} />
				</View>

				<View style={web.sidebarFooter}>
					<View style={web.userCard}>
						<View style={web.userAvatar}><Ionicons name="person" size={18} color={colors.maroon} /></View>
						<View style={{ flex: 1 }}>
							<Text style={web.userName}>{userName || "User"}</Text>
							{!!userRole && <Text style={web.userRole}>{userRole}</Text>}
						</View>
					</View>
					<TouchableOpacity onPress={onLogout} activeOpacity={0.9} style={web.logoutBtn}>
						<Ionicons name="log-out-outline" size={18} color={colors.maroon} />
						<Text style={web.logoutText}>Logout</Text>
					</TouchableOpacity>
				</View>
			</View>
		</View>
	);
}

function Separator() { return <View style={{ height: 1, backgroundColor: colors.border }} />; }

function SideItem({ label, icon, active, onPress }: { label: string; icon: any; active?: boolean; onPress?: () => void; }) {
	return (
		<TouchableOpacity activeOpacity={0.9} onPress={onPress} style={[web.sideItem, active && { backgroundColor: colors.maroon }]}> 
			<Ionicons name={icon} size={18} color={active ? "#fff" : colors.text} />
			<Text style={[web.sideItemText, active && { color: "#fff", fontWeight: "700" }]}>{label}</Text>
		</TouchableOpacity>
	);
}

/* ======================= COMMISSION CARD (WEB) ======================= */
function CommissionCardWeb({ commission }: { commission: Commission }) {
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
		<TouchableOpacity style={web.card} onPress={handlePress}>
			<View style={web.cardHeader}>
				<Text style={web.cardTitle}>{commission.title}</Text>
				<View style={[web.statusBadge, { backgroundColor: getStatusColor(commission.status) }]}>
					<Text style={web.statusText}>{commission.status}</Text>
				</View>
			</View>
			<View style={web.cardContent}>
				{commission.commission_type && (
					<View style={web.infoRow}><Ionicons name="briefcase-outline" size={14} color={colors.maroon} /><Text style={web.infoText}>{commission.commission_type}</Text></View>
				)}
				{commission.meetup_location && (
					<View style={web.infoRow}><Ionicons name="location-outline" size={14} color={colors.maroon} /><Text style={web.infoText}>{commission.meetup_location}</Text></View>
				)}
				<View style={web.infoRow}><Ionicons name="time-outline" size={14} color={colors.maroon} /><Text style={web.infoText}>{new Date(commission.created_at).toLocaleDateString()}</Text></View>
			</View>
			<View style={web.cardFooter}><Text style={web.viewText}>View Details →</Text></View>
		</TouchableOpacity>
	);
}

/* ======================= STYLES (WEB) ======================= */
const web = StyleSheet.create({
	sidebar: { width: 260, borderRightColor: "#EDE9E8", borderRightWidth: 1, backgroundColor: "#fff" },
	brand: { color: colors.text, fontWeight: "800", fontSize: 16 },
	sideItem: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 14, paddingHorizontal: 16 },
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
	notificationIcon: { padding: 8, borderRadius: 8, backgroundColor: colors.faint, position: "relative" },
	backButton: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, backgroundColor: colors.faint },
	backText: { color: colors.text, fontSize: 14, fontWeight: "600" },
	welcome: { color: colors.text, fontSize: 18, fontWeight: "900" },
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
