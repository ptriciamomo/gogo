import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View, Dimensions, Platform, Modal } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../../lib/supabase";

const colors = { maroon: "#8B0000", light: "#FAF6F5", border: "#E5C8C5", text: "#531010", faint: "#F9F2F1", grayBtn: "#C9C9C9", grayText: "#7A7A7A", white: "#FFFFFF" };

const CANCEL_WINDOW_SEC = 30;
const MODAL_MAX_H = Math.floor(Dimensions.get("window").height * 0.92);

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

export default function ViewCommissionCallerWeb() {
	const router = useRouter();
	const { id } = useLocalSearchParams<{ id?: string | string[] }>();

	const [loading, setLoading] = useState(true);
	const [commission, setCommission] = useState<CommissionRow | null>(null);
	const [runner, setRunner] = useState<UserRow | null>(null);
	const [errorMsg, setErrorMsg] = useState<string | null>(null);

	// for modal visibility (like errand web)
	const [visible, setVisible] = useState(true);
	const goHome = () => {
		setVisible(false);
		try { router.replace("/buddycaller/home" as any); } catch { try { router.replace("/"); } catch {} }
	};

	// in-app cancel confirmation overlay
	const [showCancelConfirm, setShowCancelConfirm] = useState(false);
	const [cancelSubmitting, setCancelSubmitting] = useState(false);

	// countdown ticker
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
			console.error("view_commission_web fetch error:", err);
			setErrorMsg(err?.message ?? "Failed to load commission.");
			setCommission(null);
			setRunner(null);
		} finally { setLoading(false); }
	}, [id]);

	useEffect(() => { fetchData(); }, [fetchData]);

	const createdAtMs = commission?.created_at ? new Date(commission.created_at).getTime() : 0;
	const ageSec = createdAtMs ? Math.floor((now - createdAtMs) / 1000) : Number.MAX_SAFE_INTEGER;
	const remainingSec = Math.max(0, CANCEL_WINDOW_SEC - ageSec);
	const canCancel = commission?.status === "pending" && remainingSec > 0;

	const onCancelRequestPress = () => {
		if (!canCancel) { Alert.alert("Too late", "The 30-second cancellation window has ended."); return; }
		setShowCancelConfirm(true);
	};

	const confirmCancel = async () => {
		if (!commission?.id) return;
		setCancelSubmitting(true);
		const cutoffIso = new Date(Date.now() - CANCEL_WINDOW_SEC * 1000).toISOString();
		const { data, error } = await supabase
			.from("commission")
			.update({ status: "cancelled" })
			.eq("id", commission.id)
			.eq("status", "pending")
			.gte("created_at", cutoffIso)
			.select("id");
		setCancelSubmitting(false);
		setShowCancelConfirm(false);
		if (error) { Alert.alert("Error", error.message); return; }
		if (!data || data.length === 0) { Alert.alert("Unable to cancel", "This commission is no longer eligible for cancellation."); return; }
		goHome();
	};

	if (!visible) return null;

	return (
		<Modal
			visible={visible}
			transparent
			animationType="fade"
			onRequestClose={() => {
				if (showCancelConfirm) { setShowCancelConfirm(false); } else { goHome(); }
			}}
		>
			<View style={ui.overlay}>
				<View style={ui.modal} pointerEvents={showCancelConfirm ? "none" : "auto"}>
					{/* Header */}
					<View style={ui.header}>
						<Text style={ui.headerTitle}>Commission Request</Text>
						<TouchableOpacity onPress={goHome} style={ui.headerClose} activeOpacity={0.9}>
							<Ionicons name="close" size={20} color={colors.maroon} />
						</TouchableOpacity>
					</View>

					{loading ? (
						<View style={ui.loading}><Text>Loading…</Text></View>
					) : !commission ? (
						<View style={ui.body}>
							<Text style={{ color: colors.text, marginBottom: 6 }}>Commission not found.</Text>
							{!!errorMsg && <Text style={{ color: colors.grayText, fontSize: 12 }}>{errorMsg}</Text>}
						</View>
					) : (
						<ScrollView contentContainerStyle={ui.body}>
							{/* Runner Card */}
							<View style={s.runnerCard}>
								<View style={{ flexDirection: "row", alignItems: "center" }}>
									<Image source={runner?.profile_picture_url ? { uri: runner.profile_picture_url } : require("../../assets/images/no_user.png")} style={s.avatar} />
									<View style={{ flex: 1 }}>
										<Text style={s.runnerName}>{runner ? `${runner.first_name ?? ""} ${runner.last_name ?? ""}` : "No BuddyRunner yet"}</Text>
										{!!runner && <Text style={s.runnerMeta}>Student ID: {runner?.student_id_number ?? "—"}</Text>}
										{!!runner && <Text style={s.runnerMeta}>{runner?.course ?? "—"}</Text>}
									</View>
									<Ionicons name="chatbubble-ellipses-outline" size={20} color={colors.maroon} />
								</View>
							</View>

							{/* Details */}
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

							{/* Bottom action: Cancel with 30s gate */}
							<View style={{ paddingTop: 12 }}>
								{canCancel ? (
									<>
										<TouchableOpacity style={s.cancelBtn} onPress={onCancelRequestPress} activeOpacity={0.9}>
											<Text style={s.cancelText}>Cancel Request</Text>
										</TouchableOpacity>
										<Text style={s.countdownNote}>You can cancel for {remainingSec}s.</Text>
									</>
								) : (
									<Text style={s.countdownNoteMuted}>Cancellation window ended.</Text>
								)}
							</View>
						</ScrollView>
					)}
				</View>

				{/* Confirm overlay inside modal */}
				{showCancelConfirm && (
					<View style={confirm.overlay} pointerEvents="auto">
						<View style={confirm.card}>
							<Text style={confirm.title}>Cancel Request</Text>
							<Text style={confirm.msg}>Are you sure you want to cancel this commission?</Text>
							<View style={confirm.row}>
								<TouchableOpacity style={[confirm.btn, confirm.ghost]} onPress={() => setShowCancelConfirm(false)} disabled={cancelSubmitting} activeOpacity={0.9}>
									<Text style={[confirm.btnText, { color: colors.maroon }]}>No</Text>
								</TouchableOpacity>
								<TouchableOpacity style={[confirm.btn, confirm.solid]} onPress={confirmCancel} disabled={cancelSubmitting} activeOpacity={0.9}>
									<Text style={[confirm.btnText, { color: "#fff" }]}>{cancelSubmitting ? "Cancelling..." : "Yes, cancel"}</Text>
								</TouchableOpacity>
							</View>
						</View>
					</View>
				)}
			</View>
		</Modal>
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

// Modal shell styles (copied from view_errand_web)
const ui = StyleSheet.create({
	overlay: { ...StyleSheet.absoluteFillObject, ...(Platform.OS === "web" ? ({ position: "fixed" } as any) : null), zIndex: 9999, backgroundColor: "rgba(0,0,0,0.38)", alignItems: "center", justifyContent: "center", padding: 16 },
	modal: { width: "70%", maxWidth: 520, maxHeight: MODAL_MAX_H, backgroundColor: "#fff", borderRadius: 14, overflow: "hidden", borderWidth: 1, borderColor: colors.border, zIndex: 10000, ...(Platform.OS === "web" ? ({ boxShadow: "0 10px 30px rgba(0,0,0,.25)" } as any) : {}) },
	header: { height: 54, borderBottomWidth: 1, borderBottomColor: colors.border, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: colors.light },
	headerTitle: { color: colors.maroon, fontWeight: "800", fontSize: 16 },
	headerClose: { width: 32, height: 32, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: colors.faint },
	body: { padding: 16 },
	loading: { flex: 1, justifyContent: "center", alignItems: "center", padding: 22 },
});

// Confirm overlay styles
const confirm = StyleSheet.create({
	overlay: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,.45)", zIndex: 11000, padding: 16 },
	card: { width: "60%", maxWidth: 320, backgroundColor: "#fff", borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 16, ...(Platform.OS === "web" ? ({ boxShadow: "0 8px 24px rgba(0,0,0,.25)" } as any) : {}) },
	title: { fontSize: 16, fontWeight: "800", color: colors.maroon },
	msg: { marginTop: 8, color: colors.text },
	row: { flexDirection: "row", gap: 10, justifyContent: "flex-end", marginTop: 16 },
	btn: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 8, borderWidth: 1 },
	ghost: { backgroundColor: "#fff", borderColor: colors.maroon },
	solid: { backgroundColor: colors.maroon, borderColor: colors.maroon },
	btnText: { fontWeight: "700" },
});

const s = StyleSheet.create({
	runnerCard: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 14, marginBottom: 16 },
	avatar: { width: 44, height: 44, borderRadius: 22, marginRight: 12, borderWidth: 1, borderColor: colors.border },
	runnerName: { color: colors.text, fontWeight: "700" },
	runnerMeta: { marginTop: 2, color: colors.grayText, fontSize: 12 },
	detailsCard: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.maroon, borderRadius: 10, padding: 14 },
	row: { flexDirection: "row", alignItems: "center", marginTop: 8, flexWrap: "wrap" },
	pill: { backgroundColor: colors.maroon, borderRadius: 8, paddingVertical: 6, paddingHorizontal: 10, marginRight: 8 },
	pillLabel: { color: colors.white, fontSize: 12, fontWeight: "700" },
	value: { color: colors.text, fontSize: 13, flexShrink: 1 },
	cancelBtn: { backgroundColor: colors.maroon, borderRadius: 10, paddingVertical: 12, alignItems: "center" },
	cancelText: { color: colors.white, fontWeight: "700" },
	countdownNote: { marginTop: 6, color: colors.text, fontSize: 12, opacity: 0.8 },
	countdownNoteMuted: { marginTop: 6, color: colors.grayText, fontSize: 12 },
}); 