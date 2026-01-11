import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import { Image, Modal, Platform, SafeAreaView, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from "react-native";
import { supabase } from "../../lib/supabase";

// Web-only component for Leaflet map
const MapContainer = Platform.OS === "web" 
	? ({ mapRef }: { mapRef: React.RefObject<any> }) => {
		// @ts-ignore - React Native Web supports div
		return <div ref={mapRef} id="leaflet-map-container" style={{ width: "100%", height: "100%", zIndex: 0 }} />;
	}
	: () => <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}><Text>Map not available</Text></View>;

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

export default function ViewMapWeb() {
	const router = useRouter();
	const { id } = useLocalSearchParams<{ id?: string }>();
	const { width } = useWindowDimensions();
	const mapRef = useRef<HTMLDivElement | null>(null);
	const mapInstanceRef = useRef<any>(null);
	const runnerMarkerRef = useRef<any>(null);
	const callerMarkerRef = useRef<any>(null);
	const destinationMarkerRef = useRef<any>(null);
	const callerAccuracyCircleRef = useRef<any>(null);
	const polylineRef = useRef<any>(null);
	const deliveryPolylineRef = useRef<any>(null);
	const hasAutoFittedRef = useRef<boolean>(false);
	const realtimeChannelRef = useRef<any>(null);
	const [loading, setLoading] = useState(true);
	const [errand, setErrand] = useState<ErrandRow | null>(null);
	const [runner, setRunner] = useState<UserRow | null>(null);
	const [callerLocation, setCallerLocation] = useState<{ lat: number; lng: number; accuracy?: number } | null>(null);
	const [runnerLocation, setRunnerLocation] = useState<{ lat: number; lng: number } | null>(null);
	const [destinationLocation, setDestinationLocation] = useState<{ lat: number; lng: number } | null>(null);
	const { loading: profileLoading, fullName, roleLabel } = useAuthProfile();

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

	// Initialize Leaflet map and markers (web only)
	useEffect(() => {
		if (Platform.OS !== "web" || mapInstanceRef.current) return;

		// Wait for map container to be rendered
		const timer = setTimeout(() => {
			if (!mapRef.current) return;

			// Dynamically import leaflet only on web
			import("leaflet").then((L) => {
				// Import leaflet CSS (only add once)
				if (typeof document !== 'undefined' && !document.querySelector('link[href*="leaflet"]')) {
					const link = document.createElement('link');
					link.rel = 'stylesheet';
					link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
					link.integrity = 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=';
					link.crossOrigin = '';
					document.head.appendChild(link);
				}

				// Default center (Davao City, Philippines - approximate center from images)
				const defaultCenter: [number, number] = [7.0736, 125.6128];
				const defaultZoom = 15;

				// Initialize map (NO rotation for caller side)
				const map = L.default.map(mapRef.current!, {
					center: defaultCenter,
					zoom: defaultZoom,
					minZoom: 16,
					maxZoom: 18,
				});

				// Add OpenStreetMap tile layer
				L.default.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
					attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
					maxZoom: 18,
				}).addTo(map);

				mapInstanceRef.current = map;
			}).catch((err) => {
				console.error("Failed to load Leaflet:", err);
			});
		}, 100);

		// Cleanup
		return () => {
			clearTimeout(timer);
			if (realtimeChannelRef.current) {
				supabase.removeChannel(realtimeChannelRef.current);
				realtimeChannelRef.current = null;
			}
			if (mapInstanceRef.current) {
				mapInstanceRef.current.remove();
				mapInstanceRef.current = null;
			}
		};
	}, []);

	// Update markers when locations are available
	useEffect(() => {
		if (Platform.OS !== "web" || !mapInstanceRef.current) return;

		import("leaflet").then((L) => {
			const map = mapInstanceRef.current;
			if (!map) return;

			// Create caller marker (blue pin) - static
			if (callerLocation && !callerMarkerRef.current) {
				const blueIcon = L.default.divIcon({
					className: 'custom-marker',
					html: `<div style="
						width: 30px;
						height: 30px;
						background-color: #3B82F6;
						border: 3px solid white;
						border-radius: 50% 50% 50% 0;
						transform: rotate(-45deg);
						box-shadow: 0 2px 4px rgba(0,0,0,0.3);
					"></div>`,
					iconSize: [30, 30],
					iconAnchor: [15, 30],
				});

				callerMarkerRef.current = L.default.marker(
					[callerLocation.lat, callerLocation.lng],
					{ icon: blueIcon }
				).addTo(map);

				// Add accuracy circle for caller's own location (WEB only)
				const accuracyRadius = callerLocation.accuracy && callerLocation.accuracy > 0 
					? callerLocation.accuracy 
					: 27; // Fallback: 27 meters
				callerAccuracyCircleRef.current = L.default.circle(
					[callerLocation.lat, callerLocation.lng],
					{
						radius: accuracyRadius,
						color: '#3B82F6',
						fillColor: '#3B82F6',
						fillOpacity: 0.15,
						weight: 1,
					}
				).addTo(map);
			} else if (callerLocation && callerMarkerRef.current) {
				// Update caller marker and accuracy circle position
				callerMarkerRef.current.setLatLng([callerLocation.lat, callerLocation.lng]);
				if (callerAccuracyCircleRef.current) {
					const accuracyRadius = callerLocation.accuracy && callerLocation.accuracy > 0 
						? callerLocation.accuracy 
						: 27;
					callerAccuracyCircleRef.current.setLatLng([callerLocation.lat, callerLocation.lng]);
					callerAccuracyCircleRef.current.setRadius(accuracyRadius);
				}
			}

			// Create runner marker (stick figure in white circle) - will be updated via subscription
			if (runnerLocation && !runnerMarkerRef.current) {
				const runnerIcon = L.default.divIcon({
					className: 'custom-marker',
					html: `<div style="
						width: 40px;
						height: 40px;
						background-color: white;
						border: 3px solid #3B82F6;
						border-radius: 50%;
						display: flex;
						align-items: center;
						justify-content: center;
						box-shadow: 0 2px 4px rgba(0,0,0,0.3);
					">
						<svg width="24" height="24" viewBox="0 0 24 24" fill="#3B82F6">
							<circle cx="12" cy="8" r="3"/>
							<path d="M6 21c0-3.314 2.686-6 6-6s6 2.686 6 6"/>
						</svg>
					</div>`,
					iconSize: [40, 40],
					iconAnchor: [20, 20],
				});

				runnerMarkerRef.current = L.default.marker(
					[runnerLocation.lat, runnerLocation.lng],
					{ icon: runnerIcon }
				).addTo(map);
			} else if (runnerLocation && runnerMarkerRef.current) {
				// Update existing runner marker position (DO NOT call fitBounds)
				runnerMarkerRef.current.setLatLng([runnerLocation.lat, runnerLocation.lng]);
			}

			 // Create destination marker (red pin) - static for Delivery Items
			if (errand?.category === "Deliver Items" && destinationLocation && !destinationMarkerRef.current) {
				const redIcon = L.default.divIcon({
					className: 'custom-marker',
					html: `<div style="
						width: 26px;
						height: 26px;
						background-color: #DC2626;
						border: 3px solid white;
						border-radius: 50% 50% 50% 0;
						transform: rotate(-45deg);
						box-shadow: 0 2px 4px rgba(0,0,0,0.3);
					"></div>`,
					iconSize: [26, 26],
					iconAnchor: [13, 26],
				});

				destinationMarkerRef.current = L.default.marker(
					[destinationLocation.lat, destinationLocation.lng],
					{ icon: redIcon }
				).addTo(map);
			}

			// Add static polyline between caller and runner (only once when both exist)
			if (callerLocation && runnerLocation && !polylineRef.current) {
				const polyline = L.default.polyline(
					[
						[callerLocation.lat, callerLocation.lng],
						[runnerLocation.lat, runnerLocation.lng]
					],
					{
						color: '#3B82F6',
						weight: 4,
						opacity: 1,
					}
				).addTo(map);
				polylineRef.current = polyline;
			}

			// Add delivery polyline from caller to destination (only for Deliver Items)
			if (errand?.category === "Deliver Items" && callerLocation && destinationLocation && !deliveryPolylineRef.current) {
				const deliveryPolyline = L.default.polyline(
					[
						[callerLocation.lat, callerLocation.lng],
						[destinationLocation.lat, destinationLocation.lng]
					],
					{
						color: '#3B82F6',
						weight: 4,
						opacity: 1,
					}
				).addTo(map);
				deliveryPolylineRef.current = deliveryPolyline;
			}

			// Auto-fit map ONCE ONLY when both markers exist initially
			if (callerLocation && runnerLocation && !hasAutoFittedRef.current) {
				const bounds = L.default.latLngBounds(
					[callerLocation.lat, callerLocation.lng],
					[runnerLocation.lat, runnerLocation.lng]
				);
				map.fitBounds(bounds, {
					paddingTopLeft: [80, 80],
					paddingBottomRight: [80, 80],
				});
				hasAutoFittedRef.current = true;
			} else if (callerLocation && !hasAutoFittedRef.current) {
				map.setView([callerLocation.lat, callerLocation.lng], 16);
			} else if (runnerLocation && !hasAutoFittedRef.current) {
				map.setView([runnerLocation.lat, runnerLocation.lng], 16);
			}
		});
	}, [callerLocation, runnerLocation, errand, destinationLocation]);

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
					if (__DEV__) console.log('📍 [Caller Map] Runner location updated via Realtime:', payload);
					
					const newData = payload.new;
					if (newData?.latitude && newData?.longitude) {
						const lat = typeof newData.latitude === 'number' ? newData.latitude : parseFloat(String(newData.latitude));
						const lng = typeof newData.longitude === 'number' ? newData.longitude : parseFloat(String(newData.longitude));
						
						if (!isNaN(lat) && !isNaN(lng)) {
							setRunnerLocation({ lat, lng });
						}
					}
				}
			)
			.subscribe((status) => {
				if (__DEV__) console.log('Realtime subscription status:', status);
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

	// Note: Caller map doesn't actively track GPS, so permission check is optional
	// Permission blocked detection is primarily for Runner maps where GPS tracking is active

	const runnerName = runner
		? `${titleCase(runner.first_name)} ${titleCase(runner.last_name)}`.trim()
		: "No BuddyRunner yet";
	const runnerCourse = runner?.course ? titleCase(runner.course) : "";

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
				/>

				<View style={web.mainArea}>
					{/* Header */}
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
									<TouchableOpacity onPress={() => router.push("/buddycaller/my_request_errands_web")} style={[web.backButton, web.backButtonSmall]}>
										<Ionicons name="arrow-back" size={18} color={colors.text} />
									</TouchableOpacity>
								</View>
								{/* Center: Map text */}
								<Text style={[web.welcome, web.welcomeSmall, web.welcomeCentered]}>Map</Text>
								{/* Right side: Spacer for centering */}
								<View style={web.leftButtonsContainer} />
							</>
						) : (
							<>
						<TouchableOpacity onPress={() => router.push("/buddycaller/my_request_errands_web")} style={web.backButton}>
							<Ionicons name="arrow-back" size={20} color={colors.text} />
							<Text style={web.backText}>Back</Text>
						</TouchableOpacity>
						<Text style={web.welcome}>Map</Text>
						<View style={{ width: 100 }} />
							</>
						)}
					</View>

					{/* Map Container */}
					<View style={web.mapContainer}>
						<MapContainer mapRef={mapRef} />
					</View>

					{/* Footer Card */}
					<View style={web.footerCard}>
						<View style={web.footerContent}>
							{/* Profile Section */}
							<View style={web.profileSection}>
								{runner?.profile_picture_url ? (
									<Image
										source={{ uri: runner.profile_picture_url }}
										style={web.profileImage}
									/>
								) : (
									<View style={web.profilePlaceholder}>
										<Ionicons name="person" size={20} color={colors.maroon} />
									</View>
								)}
								<View style={web.profileInfo}>
									<Text style={web.profileName}>{runnerName}</Text>
									{runnerCourse && <Text style={web.profileCourse}>{runnerCourse}</Text>}
								</View>
							</View>

							{/* Status and Actions */}
							<View style={web.actionsSection}>
								<View style={web.statusRow}>
									<Text style={web.statusLabel}>Delivery:</Text>
									<View style={[web.statusBadge, { backgroundColor: statusColor }]}>
										<Text style={web.statusText}>{displayStatus}</Text>
									</View>
									<TouchableOpacity style={web.chatButton}>
										<Ionicons name="chatbubble-outline" size={18} color="#fff" />
									</TouchableOpacity>
								</View>
								<TouchableOpacity 
									style={web.viewRequestButton}
									onPress={() => {
										// If the errand is still pending, show the original Errand Request modal
										// (with 30s timer) instead of the new Errand Details page.
										if (errand?.status === "pending") {
											router.push(`/buddycaller/view_errand_web?id=${id}`);
										} else {
											router.push(`/buddycaller/errand_details_web?id=${id}`);
										}
									}}
								>
									<Ionicons name="document-text-outline" size={14} color="#fff" />
									<Text style={web.viewRequestText}>View Errand Request</Text>
								</TouchableOpacity>
							</View>
						</View>
					</View>
				</View>
			</View>
		</SafeAreaView>
	);
}

/* ======================= SIDEBAR ======================= */
function Sidebar({ open, isSmallScreen, onToggle, onLogout, userName, userRole }: { open: boolean; isSmallScreen: boolean; onToggle: () => void; onLogout: () => void; userName: string; userRole: string; }) {
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
					<SideItem label="Home" icon="home-outline" open={open} active onPress={() => router.push("/buddycaller/home")} />
					<Separator />
					<SideItem label="Messages" icon="chatbubbles-outline" open={open} onPress={() => router.push("/buddycaller/messages_hub")} />
					<SideItem label="Profile" icon="person-outline" open={open} onPress={() => router.push("/buddycaller/profile")} />
				</View>

				<View style={web.sidebarFooter}>
					<View style={web.userCard}>
						<View style={web.userAvatar}><Ionicons name="person" size={18} color={colors.maroon} /></View>
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

/* ======================= STYLES ======================= */
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
	backButton: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, backgroundColor: colors.faint },
	backButtonSmall: { paddingVertical: 6, paddingHorizontal: 8, gap: 4 },
	backText: { color: colors.text, fontSize: 14, fontWeight: "600" },
	welcome: { color: colors.text, fontSize: 18, fontWeight: "900" },
	welcomeSmall: { fontSize: 16 },
	welcomeCentered: { flex: 1, textAlign: "center" },
	mapContainer: { flex: 1, position: "relative" },
	mapView: { width: "100%", height: "100%", zIndex: 0 },
	mapPlaceholder: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#f0f0f0" },
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
	footerContent: { gap: 12 },
	profileSection: { flexDirection: "row", alignItems: "center", gap: 10 },
	profileImage: { width: 45, height: 45, borderRadius: 22.5, backgroundColor: "#fff" },
	profilePlaceholder: { width: 45, height: 45, borderRadius: 22.5, backgroundColor: "#fff", alignItems: "center", justifyContent: "center" },
	profileInfo: { flex: 1 },
	profileName: { color: "#fff", fontSize: 15, fontWeight: "800", marginBottom: 2 },
	profileCourse: { color: "#fff", fontSize: 11, opacity: 0.9 },
	actionsSection: { gap: 10 },
	statusRow: { flexDirection: "row", alignItems: "center", gap: 8 },
	statusLabel: { color: "#fff", fontSize: 13, fontWeight: "600" },
	statusBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
	statusText: { color: "#fff", fontSize: 11, fontWeight: "700" },
	chatButton: { marginLeft: "auto", padding: 6, borderRadius: 8, backgroundColor: "rgba(255,255,255,0.2)" },
	viewRequestButton: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 8 },
	viewRequestText: { color: "#fff", fontSize: 13, fontWeight: "600" },
});

