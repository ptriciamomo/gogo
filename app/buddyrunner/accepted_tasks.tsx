import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import React from "react";
import { Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView as SAView, useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "../../lib/supabase";

const colors = { maroon: "#8B0000", light: "#FAF6F5", border: "#E5C8C5", text: "#531010", faint: "#F7F1F0" };

type ErrandRow = { 
	id: number; 
	title: string | null; 
	status: string | null; 
	runner_id: string | null; 
	created_at: string; 
	completed_at?: string | null;
	category?: string | null; 
	pickup_status?: string | null; 
	pickup_photo?: string | null; 
	pickup_confirmed_at?: string | null 
};
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

export default function AcceptedTasksMobile() {
	const router = useRouter();
	const { type } = useLocalSearchParams<{ type?: string }>();
	const mode: "errands" | "commissions" = String(type) === "commissions" ? "commissions" : "errands";
	const insets = useSafeAreaInsets();

	const [loading, setLoading] = React.useState(true);
	const [rows, setRows] = React.useState<Array<ErrandRow | CommissionRow>>([]);

	React.useEffect(() => {
		(async () => {
			setLoading(true);
			try {
				const { data: auth } = await supabase.auth.getUser();
				const uid = auth?.user?.id;
				if (!uid) { setRows([]); return; }
				if (mode === "errands") {
					// For errands, show all assigned errands (no invoice system for errands)
					const { data } = await supabase
						.from("errand")
						.select("id,title,status,runner_id,created_at,completed_at,category")
						.eq("runner_id", uid)
						.order("created_at", { ascending: false });
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
			} finally { setLoading(false); }
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

	const scrollBottomPad = (insets.bottom || 0) + 100;

	return (
		<SAView edges={["top", "bottom"]} style={{ flex: 1, backgroundColor: "#fff" }}>
			<Stack.Screen options={{ animation: "none" }} />

			<View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 10 }}>
				<View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
				<View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
						<TouchableOpacity onPress={() => router.push("/buddyrunner/home")} style={{ padding: 4 }}>
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
				{mode === "commissions" ? "Accepted Commissions" : "Accepted Errands"}
			</Text>

			<ScrollView contentContainerStyle={{ padding: 16, paddingBottom: scrollBottomPad }}>
				{/* Ongoing Section */}
				<View style={m.section}>
					<Text style={m.sectionTitle}>Ongoing {mode === "commissions" ? "Commissions" : "Errands"}</Text>
					{loading ? (
						<Text style={m.loadingText}>Loading…</Text>
					) : ongoing.length === 0 ? (
						<View style={m.emptyState}>
							<Ionicons name="time-outline" size={48} color={colors.border} />
							<Text style={m.emptyText}>No ongoing {mode === "commissions" ? "commissions" : "errands"}</Text>
							<Text style={m.emptySubtext}>Your active {mode === "commissions" ? "commissions" : "errands"} will appear here</Text>
						</View>
					) : (
						<View style={m.tasksList}>
							{ongoing.map((e) => (<TaskCard key={e.id} title={e.title} tag={e.tag} status={e.status} created_at={e.created_at} id={e.id} mode={mode} />))}
						</View>
					)}
				</View>

				{/* Past Section */}
				<View style={m.section}>
					<Text style={m.sectionTitle}>Past {mode === "commissions" ? "Commissions" : "Errands"}</Text>
					{loading ? (
						<Text style={m.loadingText}>Loading…</Text>
					) : past.length === 0 ? (
						<View style={m.emptyState}>
							<Ionicons name="checkmark-circle-outline" size={48} color={colors.border} />
							<Text style={m.emptyText}>No completed {mode === "commissions" ? "commissions" : "errands"}</Text>
							<Text style={m.emptySubtext}>Your completed {mode === "commissions" ? "commissions" : "errands"} will appear here</Text>
						</View>
					) : (
						<View style={m.tasksList}>
							{past.map((e) => (<TaskCard key={e.id} title={e.title} tag={e.tag} status={e.status} created_at={e.created_at} id={e.id} mode={mode} />))}
				</View>
					)}
				</View>
			</ScrollView>

			<MobileBottomBar
				onHome={() => router.replace("/buddyrunner/home")}
				onMessages={() => router.replace("/buddyrunner/messages_list")}
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

/* ======================= TASK CARD (MOBILE) ======================= */
function TaskCard({ title, tag, status, created_at, id, mode }: { title: string; tag?: string; status: UiStatus; created_at: string; id: number; mode: "errands" | "commissions" }) {
	const router = useRouter();
	const isOngoingErrand = isOngoing(status);
	
	return (
		<TouchableOpacity 
			style={m.taskCard}
			onPress={() => {
				// For commissions, always navigate to Task Progress page
				if (mode === "commissions") {
					router.push({
						pathname: "/buddyrunner/task_progress",
						params: { id: id.toString() }
					});
				} else {
					// For errands: navigate to map page for ongoing errands, errand details for completed errands
					if (isOngoingErrand) {
						router.push({
						pathname: "/buddyrunner/view_map",
						params: { id: id.toString() }
					});
				} else if (status === "Completed") {
					router.push({
						pathname: "/buddyrunner/errand_details",
						params: { id: id.toString() }
					});
				} else {
					// For other past errands (Delivered, Cancelled), use task progress
					router.push({
						pathname: "/buddyrunner/task_progress",
						params: { id: id.toString() }
					});
					}
				}
			}}
		>
			<View style={m.cardHeader}>
				<Text style={m.cardTitle}>{title}</Text>
				<View style={[m.statusBadge, { backgroundColor: getStatusColor(status) }]}>
					<Text style={m.statusText}>{status}</Text>
				</View>
			</View>
			
			<View style={m.cardContent}>
				{tag && (
					<View style={m.infoRow}>
						<Ionicons name="briefcase-outline" size={12} color={colors.maroon} />
						<Text style={m.infoText}>{tag}</Text>
					</View>
				)}
				
				<View style={m.infoRow}>
					<Ionicons name="time-outline" size={12} color={colors.maroon} />
					<Text style={m.infoText}>
						{new Date(created_at).toLocaleDateString()}
					</Text>
				</View>
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
	tasksList: { gap: 10 },

	taskCard: {
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