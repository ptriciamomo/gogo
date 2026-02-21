import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import { Alert, Image, Platform, SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { WebView } from "react-native-webview";
import { supabase } from "../../lib/supabase";

const colors = { maroon: "#8B0000", light: "#FAF6F5", border: "#E5C8C5", text: "#531010", faint: "#F7F1F0" };

type ErrandRow = {
	id: number;
	title: string | null;
	status: string | null;
	runner_id: string | null;
	buddycaller_id: string | null;
	category: string | null;
	delivery_latitude?: number | null;
	delivery_longitude?: number | null;
	pickup_status?: string | null;
	pickup_photo?: string | null;
	pickup_confirmed_at?: string | null;
};

type UserRow = {
	id: string;
	first_name: string | null;
	last_name: string | null;
	course: string | null;
	profile_picture_url: string | null;
	latitude?: number | null;
	longitude?: number | null;
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

// Generate HTML for Leaflet map in WebView
const generateMapHTML = (
	callerLat?: number,
	callerLng?: number,
	runnerLat?: number,
	runnerLng?: number,
	destinationLat?: number,
	destinationLng?: number
): string => {
	return `
<!DOCTYPE html>
<html>
<head>
	<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
	<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
		integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY="
		crossorigin="" />
	<style>
		* {
			margin: 0;
			padding: 0;
			box-sizing: border-box;
		}
		body, html {
			width: 100%;
			height: 100%;
			overflow: hidden;
		}
		#map {
			width: 100%;
			height: 100%;
		}
	</style>
</head>
<body>
	<div id="map"></div>
	<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"
		integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo="
		crossorigin=""></script>
	<script>
		// Default center (Davao City, Philippines - approximate center from images)
		const defaultCenter = [7.0736, 125.6128];
		const defaultZoom = 15;

		// Initialize map with zoom limits (NO rotation for caller side)
		const map = L.map('map', {
			center: defaultCenter,
			zoom: defaultZoom,
			minZoom: 16,
			maxZoom: 18,
		});

		// Add OpenStreetMap tile layer
		L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
			attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
			maxZoom: 18,
		}).addTo(map);

		// Marker references
		let callerMarker = null;
		let runnerMarker = null;
		let destinationMarker = null;
		let polyline = null;
		let deliveryPolyline = null;
		let hasAutoFitted = false;

		// Create caller marker (blue pin) - static
		function createCallerMarker(lat, lng) {
			if (callerMarker) {
				callerMarker.setLatLng([lat, lng]);
				return;
			}
			const blueIcon = L.divIcon({
				className: 'custom-marker',
				html: '<div style="width: 30px; height: 30px; background-color: #3B82F6; border: 3px solid white; border-radius: 50% 50% 50% 0; transform: rotate(-45deg); box-shadow: 0 2px 4px rgba(0,0,0,0.3);"></div>',
				iconSize: [30, 30],
				iconAnchor: [15, 30],
			});
			callerMarker = L.marker([lat, lng], { icon: blueIcon }).addTo(map);
		}

		// Create runner marker (stick figure in white circle) - moves live
		function createRunnerMarker(lat, lng) {
			if (runnerMarker) {
				runnerMarker.setLatLng([lat, lng]);
				return;
			}
			const runnerIcon = L.divIcon({
				className: 'custom-marker',
				html: '<div style="width: 40px; height: 40px; background-color: white; border: 3px solid #3B82F6; border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 4px rgba(0,0,0,0.3);"><svg width="24" height="24" viewBox="0 0 24 24" fill="#3B82F6"><circle cx="12" cy="8" r="3"/><path d="M6 21c0-3.314 2.686-6 6-6s6 2.686 6 6"/></svg></div>',
				iconSize: [40, 40],
				iconAnchor: [20, 20],
			});
			runnerMarker = L.marker([lat, lng], { icon: runnerIcon }).addTo(map);
		}

		// Create destination marker (red pin)
		function createDestinationMarker(lat, lng) {
			if (destinationMarker) {
				destinationMarker.setLatLng([lat, lng]);
				return;
			}
			const redIcon = L.divIcon({
				className: 'custom-marker',
				html: '<div style="width: 26px; height: 26px; background-color: #DC2626; border: 3px solid white; border-radius: 50% 50% 50% 0; transform: rotate(-45deg); box-shadow: 0 2px 4px rgba(0,0,0,0.3);"></div>',
				iconSize: [26, 26],
				iconAnchor: [13, 26],
			});
			destinationMarker = L.marker([lat, lng], { icon: redIcon }).addTo(map);
		}

		// Update runner location (DO NOT call fitBounds - only move marker)
		function updateRunnerLocation(lat, lng) {
			createRunnerMarker(lat, lng);
			// Only update marker position, do NOT change zoom or pan
		}

		// Initialize markers and polyline if coordinates provided
		// Wait for map to fully load before adding markers
		map.whenReady(function() {
			${callerLat && callerLng ? `createCallerMarker(${callerLat}, ${callerLng});` : ''}
			${runnerLat && runnerLng ? `createRunnerMarker(${runnerLat}, ${runnerLng});` : ''}
			${destinationLat && destinationLng ? `createDestinationMarker(${destinationLat}, ${destinationLng});` : ''}

			// Add static polyline between caller and runner (only once)
			${callerLat && callerLng && runnerLat && runnerLng ? `
				if (!polyline) {
					polyline = L.polyline(
						[[${callerLat}, ${callerLng}], [${runnerLat}, ${runnerLng}]],
						{
							color: '#3B82F6',
							weight: 4,
							opacity: 1,
						}
					).addTo(map);
				}
			` : ''}

			// Add delivery polyline from caller to destination (only for Deliver Items)
			${callerLat && callerLng && destinationLat && destinationLng ? `
				if (!deliveryPolyline) {
					deliveryPolyline = L.polyline(
						[[${callerLat}, ${callerLng}], [${destinationLat}, ${destinationLng}]],
						{
							color: '#3B82F6',
							weight: 4,
							opacity: 1,
						}
					).addTo(map);
				}
			` : ''}

			// Auto-fit map ONCE ONLY if both markers exist
			${callerLat && callerLng && runnerLat && runnerLng ? `
				if (!hasAutoFitted) {
					setTimeout(function() {
						const bounds = L.latLngBounds(
							[${callerLat}, ${callerLng}],
							[${runnerLat}, ${runnerLng}]
						);
						map.fitBounds(bounds, {
							paddingTopLeft: [80, 80],
							paddingBottomRight: [80, 80],
						});
						hasAutoFitted = true;
					}, 200);
				}
			` : ''}
		});

		// Expose functions for React Native to call
		window.updateRunnerLocation = updateRunnerLocation;
		window.createCallerMarker = createCallerMarker;
		window.createRunnerMarker = createRunnerMarker;
	</script>
</body>
</html>
	`.trim();
};

export default function ViewMap() {
	const router = useRouter();
	const { id } = useLocalSearchParams<{ id?: string }>();
	const webViewRef = useRef<WebView>(null);
	const realtimeChannelRef = useRef<any>(null);
	const [loading, setLoading] = useState(true);
	const [errand, setErrand] = useState<ErrandRow | null>(null);
	const [runner, setRunner] = useState<UserRow | null>(null);
	const [callerLocation, setCallerLocation] = useState<{ lat: number; lng: number } | null>(null);
	const [runnerLocation, setRunnerLocation] = useState<{ lat: number; lng: number } | null>(null);
	const [destinationLocation, setDestinationLocation] = useState<{ lat: number; lng: number } | null>(null);

	// Fetch errand, caller location, and runner data
	useEffect(() => {
		(async () => {
			if (!id) return;
			setLoading(true);
			try {
				const { data: { user } } = await supabase.auth.getUser();
				if (!user) return;

				const idFilter: string | number = isNaN(Number(id)) ? String(id) : Number(id);
				
				// Fetch errand
				const { data: er, error: erErr } = await supabase
					.from("errand")
					.select("id, title, status, runner_id, buddycaller_id, category, delivery_latitude, delivery_longitude")
					.eq("id", idFilter)
					.single();
				if (erErr) throw erErr;
				setErrand(er as ErrandRow);

				// For Delivery Items, set destination from stored delivery coordinates
				if (er?.category === "Deliver Items" && er?.delivery_latitude && er?.delivery_longitude) {
					const dLat = typeof er.delivery_latitude === "number" ? er.delivery_latitude : parseFloat(String(er.delivery_latitude));
					const dLng = typeof er.delivery_longitude === "number" ? er.delivery_longitude : parseFloat(String(er.delivery_longitude));
					if (!isNaN(dLat) && !isNaN(dLng)) {
						setDestinationLocation({ lat: dLat, lng: dLng });
					}
				}

				// Fetch caller location from users table
				if (er?.buddycaller_id) {
					const { data: callerData, error: callerErr } = await supabase
						.from("users")
						.select("latitude, longitude")
						.eq("id", er.buddycaller_id)
						.single();

					if (!callerErr && callerData?.latitude && callerData?.longitude) {
						const lat = typeof callerData.latitude === 'number' ? callerData.latitude : parseFloat(String(callerData.latitude));
						const lng = typeof callerData.longitude === 'number' ? callerData.longitude : parseFloat(String(callerData.longitude));
						if (!isNaN(lat) && !isNaN(lng)) {
							setCallerLocation({ lat, lng });
						}
					}
				}

				// Fetch runner profile and initial location
				if (er?.runner_id) {
					const { data: u, error: uErr } = await supabase
						.from("users")
						.select("id, first_name, last_name, course, profile_picture_url, latitude, longitude")
						.eq("id", er.runner_id)
						.single();
					if (uErr) throw uErr;
					setRunner(u as UserRow);

					// Set runner initial location
					if (u?.latitude && u?.longitude) {
						const lat = typeof u.latitude === 'number' ? u.latitude : parseFloat(String(u.latitude));
						const lng = typeof u.longitude === 'number' ? u.longitude : parseFloat(String(u.longitude));
						if (!isNaN(lat) && !isNaN(lng)) {
							setRunnerLocation({ lat, lng });
						}
					}
				} else {
					setRunner(null);
				}
			} catch (e) {
				console.error(e);
			} finally {
				setLoading(false);
			}
		})();
	}, [id]);

	// Update markers in WebView when locations are available
	useEffect(() => {
		if (!webViewRef.current) return;

		// Update caller marker
		if (callerLocation) {
			const script = `
				if (window.createCallerMarker) {
					window.createCallerMarker(${callerLocation.lat}, ${callerLocation.lng});
				}
			`;
			webViewRef.current.injectJavaScript(script);
		}

		// Update runner marker
		if (runnerLocation) {
			const script = `
				if (window.createRunnerMarker) {
					window.createRunnerMarker(${runnerLocation.lat}, ${runnerLocation.lng});
				}
				if (window.updateRunnerLocation) {
					window.updateRunnerLocation(${runnerLocation.lat}, ${runnerLocation.lng});
				}
			`;
			webViewRef.current.injectJavaScript(script);
		}

	}, [callerLocation, runnerLocation]);

	// Subscribe to runner location updates via Supabase Realtime
	useEffect(() => {
		if (!errand?.runner_id) return;

		// Subscribe to runner's location updates in users table
		const channel = supabase
			.channel(`runner_location_${errand.runner_id}`)
			.on(
				'postgres_changes',
				{
					event: 'UPDATE',
					schema: 'public',
					table: 'users',
					filter: `id=eq.${errand.runner_id}`,
				},
				(payload: any) => {
					console.log('📍 [Caller Map Mobile] Runner location updated via Realtime:', payload);
					
					const newData = payload.new;
					if (newData?.latitude && newData?.longitude) {
						const lat = typeof newData.latitude === 'number' ? newData.latitude : parseFloat(String(newData.latitude));
						const lng = typeof newData.longitude === 'number' ? newData.longitude : parseFloat(String(newData.longitude));
						
						if (!isNaN(lat) && !isNaN(lng)) {
							setRunnerLocation({ lat, lng });

							// Update marker in WebView
							if (webViewRef.current) {
								const script = `
									if (window.updateRunnerLocation) {
										window.updateRunnerLocation(${lat}, ${lng});
									}
								`;
								webViewRef.current.injectJavaScript(script);
							}
						}
					}
				}
			)
			.subscribe((status) => {
				console.log('Realtime subscription status:', status);
			});

		realtimeChannelRef.current = channel;

		// Cleanup
		return () => {
			if (realtimeChannelRef.current) {
				supabase.removeChannel(realtimeChannelRef.current);
				realtimeChannelRef.current = null;
			}
		};
	}, [errand?.runner_id]);

	const runnerName = runner
		? `${titleCase(runner.first_name)} ${titleCase(runner.last_name)}`.trim()
		: "No BuddyRunner yet";
	const runnerCourse = runner?.course ? titleCase(runner.course) : "";

	/* ---------- MESSAGE ICON CLICK HANDLER ---------- */
	const handleMessageIconClick = async () => {
		if (!runner?.id) {
			Alert.alert("No Runner", "There is no runner assigned to this errand yet.");
			return;
		}

		try {
			// Get current authenticated user
			const { data: { user } } = await supabase.auth.getUser();
			if (!user) {
				Alert.alert("Error", "You must be logged in to send a message.");
				return;
			}

			const runnerId = runner.id;
			console.log("Creating/getting conversation between:", user.id, "and", runnerId);

			// Get or create conversation between current user and the runner
			let conversationId: string | null = null;

			// Look for existing conversation between these users
			const { data: existing } = await supabase
				.from("conversations")
				.select("id")
				.or(`and(user1_id.eq.${user.id},user2_id.eq.${runnerId}),and(user1_id.eq.${runnerId},user2_id.eq.${user.id})`)
				.limit(1);

			if (existing && existing.length) {
				conversationId = String(existing[0].id);
				console.log("Found existing conversation:", conversationId);
			} else {
				// Create new conversation
				const { data: created, error: convErr } = await supabase
					.from("conversations")
					.insert({
						user1_id: user.id,
						user2_id: runnerId,
						created_at: new Date().toISOString(),
						last_message_at: new Date().toISOString(),
					})
					.select("id")
					.single();

				if (convErr) {
					console.error("Error creating conversation:", convErr);
					throw convErr;
				}
				conversationId = String(created.id);
				console.log("Created new conversation:", conversationId);
			}

			// Get runner's name for navigation
			const runnerFirstName = runner?.first_name || "";
			const runnerLastName = runner?.last_name || "";
			const runnerFullName = `${runnerFirstName} ${runnerLastName}`.trim() || "Runner";
			const runnerInitials = `${runnerFirstName?.[0] || ""}${runnerLastName?.[0] || ""}`.toUpperCase() || "R";

			console.log("Navigating to ChatScreenCaller with:", {
				conversationId,
				otherUserId: runnerId,
				contactName: runnerFullName,
				contactInitials: runnerInitials,
			});

			// Navigate directly to ChatScreenCaller (mobile only)
			router.push({
				pathname: "/buddycaller/ChatScreenCaller",
				params: {
					conversationId,
					otherUserId: runnerId,
					contactName: runnerFullName,
					contactInitials: runnerInitials,
					isOnline: "false",
				},
			} as any);
		} catch (error) {
			console.error("Error in handleMessageIconClick:", error);
			Alert.alert("Error", "Failed to open chat. Please try again.");
		}
	};

	// Helper functions to convert status and get color
	const toUiStatus = (s: string | null | undefined): string => {
		if (s === "in_progress") return "In Progress";
		if (s === "completed") return "Completed";
		if (s === "pending") return "Pending";
		if (s === "cancelled") return "Cancelled";
		if (s === "delivered") return "Delivered";
		return "Pending";
	};

	const getStatusColor = (s: string | null | undefined): string => {
		if (s === "pending") return "#F59E0B";
		if (s === "in_progress") return "#3B82F6";
		if (s === "completed") return "#10B981";
		if (s === "delivered") return "#8B5CF6";
		if (s === "cancelled") return "#EF4444";
		return "#F59E0B";
	};

	const displayStatus = toUiStatus(errand?.status);
	const statusColor = getStatusColor(errand?.status);

	return (
		<SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }}>
			{/* Header */}
			<View style={styles.header}>
				<TouchableOpacity onPress={() => router.push("/buddycaller/my_request_errands")} style={styles.backButton}>
					<Ionicons name="arrow-back" size={24} color={colors.text} />
				</TouchableOpacity>
				<Text style={styles.headerTitle}>Map</Text>
				<View style={{ width: 24 }} />
			</View>

			{/* Map Container */}
			<View style={styles.mapContainer}>
				<WebView
					ref={webViewRef}
					source={{ 
						html: generateMapHTML(
							callerLocation?.lat,
							callerLocation?.lng,
							runnerLocation?.lat,
							runnerLocation?.lng,
							errand?.category === "Deliver Items" ? destinationLocation?.lat : undefined,
							errand?.category === "Deliver Items" ? destinationLocation?.lng : undefined
						)
					}}
					style={styles.webview}
					javaScriptEnabled={true}
					domStorageEnabled={true}
					startInLoadingState={true}
					scalesPageToFit={true}
					onMessage={() => {
						// Handle messages from WebView if needed
					}}
					injectedJavaScript={`
						// Ensure functions are available
						true;
					`}
				/>
			</View>

			{/* Footer Card */}
			<View style={styles.footerCard}>
				<View style={styles.footerContent}>
					{/* Profile Section */}
					<View style={styles.profileSection}>
						{runner?.profile_picture_url ? (
							<Image
								source={{ uri: runner.profile_picture_url }}
								style={styles.profileImage}
							/>
						) : (
							<View style={styles.profilePlaceholder}>
								<Ionicons name="person" size={20} color={colors.maroon} />
							</View>
						)}
						<View style={styles.profileInfo}>
							<Text style={styles.profileName}>{runnerName}</Text>
							{runnerCourse && <Text style={styles.profileCourse}>{runnerCourse}</Text>}
						</View>
					</View>

					{/* Status and Actions */}
					<View style={styles.actionsSection}>
						<View style={styles.statusRow}>
							<Text style={styles.statusLabel}>Delivery:</Text>
							<View style={[styles.statusBadge, { backgroundColor: statusColor }]}>
								<Text style={styles.statusText}>{displayStatus}</Text>
							</View>
							<TouchableOpacity 
								style={styles.chatButton}
								onPress={handleMessageIconClick}
								disabled={!runner?.id}
								activeOpacity={0.9}
							>
								<Ionicons name="chatbubble-outline" size={18} color="#fff" />
							</TouchableOpacity>
						</View>
						<TouchableOpacity 
							style={styles.viewRequestButton}
							onPress={() => {
								// If the errand is still pending, show the original Errand Request modal
								// (with 30s timer) instead of the new Errand Details page.
								if (errand?.status === "pending") {
									router.push({
										pathname: "/buddycaller/view_errand",
										params: { id: id },
									});
								} else {
									router.push({
										pathname: "/buddycaller/errand_details",
										params: { id: id },
									});
								}
							}}
						>
							<Ionicons name="document-text-outline" size={14} color="#fff" />
							<Text style={styles.viewRequestText}>View Errand Request</Text>
						</TouchableOpacity>
					</View>
				</View>
			</View>
		</SafeAreaView>
	);
}

/* ======================= STYLES ======================= */
const styles = StyleSheet.create({
	header: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		paddingHorizontal: 16,
		paddingVertical: 12,
		backgroundColor: "#fff",
		borderBottomWidth: 1,
		borderBottomColor: "#EDE9E8",
	},
	backButton: {
		padding: 8,
	},
	headerTitle: {
		color: colors.text,
		fontSize: 18,
		fontWeight: "900",
	},
	mapContainer: {
		flex: 1,
		position: "relative",
	},
	webview: {
		flex: 1,
		backgroundColor: "#f0f0f0",
	},
	footerCard: {
		position: "absolute",
		bottom: 0,
		left: 0,
		right: 0,
		backgroundColor: colors.maroon,
		borderTopLeftRadius: 20,
		borderTopRightRadius: 20,
		padding: 16,
		shadowColor: "#000",
		shadowOffset: { width: 0, height: -2 },
		shadowOpacity: 0.1,
		shadowRadius: 8,
		elevation: 5,
	},
	footerContent: {
		gap: 12,
	},
	profileSection: {
		flexDirection: "row",
		alignItems: "center",
		gap: 10,
	},
	profileImage: {
		width: 45,
		height: 45,
		borderRadius: 22.5,
		backgroundColor: "#fff",
	},
	profilePlaceholder: {
		width: 45,
		height: 45,
		borderRadius: 22.5,
		backgroundColor: "#fff",
		alignItems: "center",
		justifyContent: "center",
	},
	profileInfo: {
		flex: 1,
	},
	profileName: {
		color: "#fff",
		fontSize: 15,
		fontWeight: "800",
		marginBottom: 2,
	},
	profileCourse: {
		color: "#fff",
		fontSize: 11,
		opacity: 0.9,
	},
	actionsSection: {
		gap: 10,
	},
	statusRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
	},
	statusLabel: {
		color: "#fff",
		fontSize: 13,
		fontWeight: "600",
	},
	statusBadge: {
		paddingHorizontal: 10,
		paddingVertical: 5,
		borderRadius: 20,
	},
	statusText: {
		color: "#fff",
		fontSize: 11,
		fontWeight: "700",
	},
	chatButton: {
		marginLeft: "auto",
		padding: 6,
		borderRadius: 8,
		backgroundColor: "rgba(255,255,255,0.2)",
	},
	viewRequestButton: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
		paddingVertical: 8,
	},
	viewRequestText: {
		color: "#fff",
		fontSize: 13,
		fontWeight: "600",
	},
});

