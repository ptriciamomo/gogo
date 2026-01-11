import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Image, Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../../lib/supabase";

const colors = { maroon: "#8B0000", light: "#FAF6F5", border: "#E5C8C5", text: "#531010", faint: "#F9F2F1", grayBtn: "#C9C9C9", grayText: "#7A7A7A", white: "#FFFFFF" };

const CANCEL_WINDOW_SEC = 30;

type CommissionRow = {
	id: number;
	title: string | null;
	description?: string | null;
	commission_type?: string | null;
	status?: "pending" | "in_progress" | "completed" | "cancelled" | "delivered" | null;
	runner_id?: string | null;
	buddycaller_id?: string | null;
	meetup_location?: string | null;
	due_at?: string | null;
	created_at?: string | null;
};

type UserRow = { id: string; first_name?: string | null; last_name?: string | null; course?: string | null; student_id_number?: string | null; profile_picture_url?: string | null };

function toUiStatus(s?: CommissionRow["status"]) {
	if (s === "in_progress") return "In Progress";
	if (s === "completed") return "Completed";
	if (s === "pending") return "Pending";
	if (s === "cancelled") return "Cancelled";
	if (s === "delivered") return "Delivered";
	return "Pending";
}

export default function ViewCommissionCaller() {
	const router = useRouter();
	const { id } = useLocalSearchParams<{ id?: string | string[] }>();

	const [loading, setLoading] = useState(true);
	const [commission, setCommission] = useState<CommissionRow | null>(null);
	const [runner, setRunner] = useState<UserRow | null>(null);
	const [errorMsg, setErrorMsg] = useState<string | null>(null);

	// ticker for countdown
	const [now, setNow] = useState(() => Date.now());
	useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);

	const fetchData = useCallback(async () => {
		setLoading(true);
		setErrorMsg(null);
		try {
			const idParam = Array.isArray(id) ? id[0] : id;
			const numericId = idParam ? Number(idParam) : NaN;
			if (!Number.isFinite(numericId)) throw new Error(`Invalid commission id: ${String(idParam)}`);

			const { data: cm, error } = await supabase
				.from("commission")
				.select("id, title, description, commission_type, status, runner_id, buddycaller_id, meetup_location, due_at, created_at")
				.eq("id", numericId)
				.single();
			if (error) throw error;
			setCommission(cm as CommissionRow);

			if ((cm as any)?.runner_id) {
				const { data: p } = await supabase
					.from("users")
					.select("id, first_name, last_name, course, student_id_number, profile_picture_url")
					.eq("id", (cm as any).runner_id)
					.single();
				setRunner((p ?? null) as UserRow | null);
			} else { setRunner(null); }
		} catch (err: any) {
			console.error("view_commission fetch error:", err);
			setErrorMsg(err?.message ?? "Failed to load commission.");
			setCommission(null);
			setRunner(null);
		} finally { setLoading(false); }
	}, [id]);

	useEffect(() => { fetchData(); }, [fetchData]);

	// countdown derive
	const createdAtMs = commission?.created_at ? new Date(commission.created_at).getTime() : 0;
	const ageSec = createdAtMs ? Math.floor((now - createdAtMs) / 1000) : Number.MAX_SAFE_INTEGER;
	const remainingSec = Math.max(0, CANCEL_WINDOW_SEC - ageSec);
	const canCancel = commission?.status === "pending" && remainingSec > 0;

	const onCancelRequest = async () => {
		if (!commission?.id) return;
		if (!canCancel) {
			Alert.alert("Too late", "The 30-second cancellation window has ended.");
			return;
		}

		Alert.alert(
			"Cancel Request",
			"Are you sure you want to cancel this commission?",
			[
				{ text: "No" },
				{ text: "Yes, cancel", style: "destructive", onPress: async () => {
					const cutoffIso = new Date(Date.now() - CANCEL_WINDOW_SEC * 1000).toISOString();
					const { data, error } = await supabase
						.from("commission")
						.update({ status: "cancelled" })
						.eq("id", commission.id)
						.eq("status", "pending")
						.gte("created_at", cutoffIso)
						.select("id");
					if (error) { Alert.alert("Error", error.message); return; }
					if (!data || data.length === 0) { Alert.alert("Unable to cancel", "This commission is no longer eligible for cancellation."); return; }
					router.replace("/buddycaller/home" as any);
				} }
			]
		);
	};

	if (loading) {
		return (
			<SafeAreaView style={{ flex: 1, backgroundColor: colors.light }}>
				<Header router={router} />
				<View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}><ActivityIndicator /></View>
			</SafeAreaView>
		);
	}
	if (!commission) {
		return (
			<SafeAreaView style={{ flex: 1, backgroundColor: colors.light }}>
				<Header router={router} />
				<View style={{ padding: 20 }}>
					<Text style={{ color: colors.text, marginBottom: 6 }}>Commission not found.</Text>
					{!!errorMsg && <Text style={{ color: colors.grayText, fontSize: 12 }}>{errorMsg}</Text>}
				</View>
			</SafeAreaView>
		);
	}

	const hasRunner = !!runner;

	return (
		<SafeAreaView style={{ flex: 1, backgroundColor: colors.light }}>
			<Header router={router} />
			<ScrollView contentContainerStyle={{ padding: 16 }}>
				{/* Runner Card */}
				<View style={s.runnerCard}>
					<View style={{ flexDirection: "row", alignItems: "center" }}>
						<Image source={hasRunner && runner?.profile_picture_url ? { uri: runner.profile_picture_url } : require("../../assets/images/no_user.png")} style={s.avatar} />
						<View style={{ flex: 1 }}>
							{hasRunner ? (
								<>
									<Text style={s.runnerName}>{(runner?.first_name ?? "") + " " + (runner?.last_name ?? "")}</Text>
									<Text style={s.runnerMeta}>Student ID: {runner?.student_id_number ?? "—"}</Text>
									<Text style={s.runnerMeta}>{runner?.course ?? "—"}</Text>
								</>
							) : (
								<Text style={s.noRunnerText}>No BuddyRunner yet</Text>
							)}
						</View>
						<Ionicons name="chatbubble-ellipses-outline" size={20} color={colors.maroon} />
					</View>
					<TouchableOpacity disabled={!hasRunner} onPress={() => hasRunner && router.push({ pathname: "/buddycaller/profile", params: { id: runner?.id } })} style={[s.viewProfileBtn, !hasRunner && { backgroundColor: colors.grayBtn }]}>
						<Text style={[s.viewProfileText, !hasRunner && { color: colors.white }]}>View Profile</Text>
					</TouchableOpacity>
				</View>

				{/* Commission Details */}
				<View style={s.detailsCard}>
					<View style={{ alignItems: "center", marginBottom: 8 }}>
						<Image source={require("../../assets/images/logo.png")} style={{ width: 90, height: 60, resizeMode: "contain", marginTop: 10 }} />
					</View>
					<Row label="Commission Title:" value={commission.title || ""} />
					<View style={s.row}><View style={s.pill}><Text style={s.pillLabel}>Type:</Text></View></View>
					<View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 6, marginBottom: 10 }}>
						{commission.commission_type ? (
							commission.commission_type.split(',').map((type: string, index: number) => {
								const formattedType = type.trim().replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim().toLowerCase().replace(/\b\w/g, (c: string) => c.toUpperCase());
								return formattedType ? (
									<View key={index} style={{ backgroundColor: colors.maroon, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 }}>
										<Text style={{ color: colors.white, fontSize: 12, fontWeight: "700" }}>{formattedType}</Text>
									</View>
								) : null;
							}).filter(Boolean)
						) : (
							<Text style={s.value}>—</Text>
						)}
					</View>
					<Row label="Meetup Location:" value={commission.meetup_location || "—"} />
					<Row label="Due At:" value={commission.due_at ? new Date(commission.due_at).toLocaleString() : "—"} />
					<View style={s.row}><View style={s.pill}><Text style={s.pillLabel}>Commission Description:</Text></View></View>
					<Text style={[s.value, { marginTop: 6 }]}>{commission.description || "—"}</Text>
				</View>
			</ScrollView>

			{/* Cancel section */}
			<View style={{ padding: 16 }}>
				<TouchableOpacity
					style={[s.cancelBtn, !canCancel && { backgroundColor: colors.grayBtn }]}
					onPress={onCancelRequest}
					disabled={!canCancel}
					activeOpacity={0.9}
				>
					<Text style={s.cancelText}>Cancel Request</Text>
				</TouchableOpacity>
				{canCancel ? (
					<Text style={s.countdownNote}>You can cancel for {remainingSec}s.</Text>
				) : (
					<Text style={s.countdownNoteMuted}>Cancellation window ended.</Text>
				)}
			</View>
		</SafeAreaView>
	);
}

function Header({ router }: { router: ReturnType<typeof useRouter> }) {
	return (
		<View style={s.header}>
			<TouchableOpacity onPress={() => router.back()}><Ionicons name="chevron-back" size={22} color={colors.maroon} /></TouchableOpacity>
			<Text style={s.headerTitle}>Commission Request</Text>
			<View style={{ width: 22 }} />
		</View>
	);
}

function Row({ label, value }: { label: string; value?: string | number | null }) {
	return (
		<View style={s.row}>
			<View style={s.pill}><Text style={s.pillLabel}>{label}</Text></View>
			<Text style={s.value}>{value ?? "—"}</Text>
		</View>
	);
}

const s = StyleSheet.create({
	header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, backgroundColor: colors.light, borderBottomWidth: 1, borderBottomColor: colors.border },
	headerTitle: { flex: 1, textAlign: "center", color: colors.text, fontSize: 16, fontWeight: "600" },
	runnerCard: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 14, marginBottom: 16 },
	avatar: { width: 44, height: 44, borderRadius: 22, marginRight: 12, borderWidth: 1, borderColor: colors.border },
	runnerName: { color: colors.text, fontWeight: "700" },
	runnerMeta: { marginTop: 2, color: colors.grayText, fontSize: 12 },
	noRunnerText: { color: colors.grayText, fontSize: 13, fontStyle: "italic" },
	viewProfileBtn: { alignSelf: "flex-start", marginTop: 10, paddingVertical: 6, paddingHorizontal: 12, backgroundColor: colors.maroon, borderRadius: 8 },
	viewProfileText: { color: colors.white, fontSize: 12, fontWeight: "600" },
	detailsCard: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.maroon, borderRadius: 10, padding: 14 },
	row: { flexDirection: "row", alignItems: "center", marginTop: 8, flexWrap: "wrap" },
	pill: { backgroundColor: colors.maroon, borderRadius: 8, paddingVertical: 6, paddingHorizontal: 10, marginRight: 8 },
	pillLabel: { color: colors.white, fontSize: 12, fontWeight: "700" },
	value: { color: colors.text, fontSize: 13, flexShrink: 1 },

	// new styles for cancel
	cancelBtn: { backgroundColor: colors.maroon, borderRadius: 10, paddingVertical: 12, alignItems: "center" },
	cancelText: { color: colors.white, fontWeight: "700" },
	countdownNote: { marginTop: 6, color: colors.text, fontSize: 12, opacity: 0.8, textAlign: "center" },
	countdownNoteMuted: { marginTop: 6, color: colors.grayText, fontSize: 12, textAlign: "center" },
}); 