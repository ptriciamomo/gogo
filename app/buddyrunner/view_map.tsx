import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useRef, useState, useCallback } from "react";
import { Image, Platform, SafeAreaView, StyleSheet, Text, TouchableOpacity, View, Animated, PanResponder, Alert, ActivityIndicator, Modal } from "react-native";
import { WebView } from "react-native-webview";
import * as ImagePicker from 'expo-image-picker';
import { supabase } from "../../lib/supabase";
import LocationService from "../../components/LocationService";
import ErrandRateAndFeedbackModal from "../../components/ErrandRateAndFeedbackModal";

const colors = { maroon: "#8B0000", light: "#FAF6F5", border: "#E5C8C5", text: "#531010", faint: "#F7F1F0" };
const PROOF_REQUIRED_CATEGORIES = ["Deliver Items", "Food Delivery", "School Materials", "Printing"];

type ErrandRow = {
	id: number;
	title: string | null;
	status: string | null;
	buddycaller_id: string | null;
	category: string | null;
	completed_at?: string | null;
	delivery_latitude?: number | null;
	delivery_longitude?: number | null;
	pickup_status?: string | null;
	pickup_photo?: string | null;
	pickup_confirmed_at?: string | null;
	delivery_proof_photo?: string | null;
	delivery_proof_at?: string | null;
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

		// Initialize map with zoom limits
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

		// Create caller marker (blue pin)
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

		// Create runner marker (stick figure in white circle)
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

		// Listen for messages from React Native
		window.addEventListener('message', function(event) {
			try {
				const data = JSON.parse(event.data);
				if (data.type === 'updateRunnerLocation') {
					updateRunnerLocation(data.lat, data.lng);
				} else if (data.type === 'updateCallerLocation') {
					createCallerMarker(data.lat, data.lng);
				}
			} catch (e) {
				console.error('Error parsing message:', e);
			}
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
	const locationSubscriptionRef = useRef<any>(null);
	const [loading, setLoading] = useState(true);
	const [errand, setErrand] = useState<ErrandRow | null>(null);
	const [caller, setCaller] = useState<UserRow | null>(null);
	const [callerLocation, setCallerLocation] = useState<{ lat: number; lng: number } | null>(null);
	const [runnerLocation, setRunnerLocation] = useState<{ lat: number; lng: number } | null>(null);
	const [destinationLocation, setDestinationLocation] = useState<{ lat: number; lng: number } | null>(null);
	const [confirmingPickup, setConfirmingPickup] = useState(false);
	const [submittingProof, setSubmittingProof] = useState(false);
	const [completingTask, setCompletingTask] = useState(false);
	const [successModalVisible, setSuccessModalVisible] = useState(false);
	const [ratingModalVisible, setRatingModalVisible] = useState(false);

	// Fetch errand, caller data, and locations
	useEffect(() => {
		(async () => {
			if (!id) return;
			setLoading(true);
			try {
				const { data: { user } } = await supabase.auth.getUser();
				if (!user) return;

				const idFilter: string | number = isNaN(Number(id)) ? String(id) : Number(id);
				
				// Fetch errand (including pickup and proof fields)
				const { data: er, error: erErr } = await supabase
					.from("errand")
					.select("id, title, status, buddycaller_id, category, completed_at, delivery_latitude, delivery_longitude, pickup_status, pickup_photo, pickup_confirmed_at, delivery_proof_photo, delivery_proof_at")
					.eq("id", idFilter)
					.single();
				if (erErr) {
					console.error("Error fetching errand:", erErr);
					throw erErr;
				}
				setErrand(er as ErrandRow);

				// For Delivery Items, set destination from stored delivery coordinates
				if (er?.category === "Deliver Items" && er?.delivery_latitude && er?.delivery_longitude) {
					const dLat = typeof er.delivery_latitude === "number" ? er.delivery_latitude : parseFloat(String(er.delivery_latitude));
					const dLng = typeof er.delivery_longitude === "number" ? er.delivery_longitude : parseFloat(String(er.delivery_longitude));
					if (!isNaN(dLat) && !isNaN(dLng)) {
						setDestinationLocation({ lat: dLat, lng: dLng });
					}
				}

				// Fetch caller profile and location
				if (er?.buddycaller_id) {
					const { data: u, error: uErr } = await supabase
						.from("users")
						.select("id, first_name, last_name, course, profile_picture_url, latitude, longitude")
						.eq("id", er.buddycaller_id)
						.single();
					if (uErr) throw uErr;
					setCaller(u as UserRow);

					// Set caller location from users table
					if (u?.latitude && u?.longitude) {
						const lat = typeof u.latitude === 'number' ? u.latitude : parseFloat(String(u.latitude));
						const lng = typeof u.longitude === 'number' ? u.longitude : parseFloat(String(u.longitude));
						if (!isNaN(lat) && !isNaN(lng)) {
							setCallerLocation({ lat, lng });
						}
					}
				} else {
					setCaller(null);
				}

				// Fetch runner initial location from users table
				const { data: runnerData, error: runnerErr } = await supabase
					.from("users")
					.select("latitude, longitude")
					.eq("id", user.id)
					.single();

				if (!runnerErr && runnerData?.latitude && runnerData?.longitude) {
					const lat = typeof runnerData.latitude === 'number' ? runnerData.latitude : parseFloat(String(runnerData.latitude));
					const lng = typeof runnerData.longitude === 'number' ? runnerData.longitude : parseFloat(String(runnerData.longitude));
					if (!isNaN(lat) && !isNaN(lng)) {
						setRunnerLocation({ lat, lng });
					}
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

	// Start real-time GPS tracking for runner
	useEffect(() => {
		const startTracking = async () => {
			try {
				const { data: { user } } = await supabase.auth.getUser();
				if (!user) return;

				// Start watching location changes
				locationSubscriptionRef.current = await LocationService.watchLocation(
					async (location) => {
						if (__DEV__) {
							console.log('📍 [Map Mobile] Runner location updated:', {
								lat: location.latitude.toFixed(6),
								lng: location.longitude.toFixed(6),
							});
						}

						// Update local state immediately
						setRunnerLocation({ lat: location.latitude, lng: location.longitude });

						// Send update to WebView via injected JavaScript
						if (webViewRef.current) {
							const script = `
								if (window.updateRunnerLocation) {
									window.updateRunnerLocation(${location.latitude}, ${location.longitude});
								}
							`;
							webViewRef.current.injectJavaScript(script);
						}

						// Update location in database
						await LocationService.updateLocationInDatabase(user.id, location);
					},
					{
						timeInterval: 5000, // Update every 5 seconds
						distanceInterval: 10, // Or when moved 10 meters
					}
				);
			} catch (error) {
				console.error('Error starting location tracking:', error);
			}
		};

		startTracking();

		// Cleanup
		return () => {
			if (locationSubscriptionRef.current) {
				locationSubscriptionRef.current.remove();
				locationSubscriptionRef.current = null;
			}
		};
	}, []);

	const callerName = caller
		? `${titleCase(caller.first_name)} ${titleCase(caller.last_name)}`.trim()
		: "Unknown User";
	const callerCourse = caller?.course ? titleCase(caller.course) : "";

	/* ---------- MESSAGE ICON CLICK HANDLER ---------- */
	const handleMessageIconClick = async () => {
		if (!caller?.id) {
			Alert.alert("No Caller", "There is no caller assigned to this errand yet.");
			return;
		}

		try {
			// Get current authenticated user
			const { data: { user } } = await supabase.auth.getUser();
			if (!user) {
				Alert.alert("Error", "You must be logged in to send a message.");
				return;
			}

			const callerId = caller.id;
			console.log("Creating/getting conversation between:", user.id, "and", callerId);

			// Get or create conversation between current user and the caller
			let conversationId: string | null = null;

			// Look for existing conversation between these users
			const { data: existing } = await supabase
				.from("conversations")
				.select("id")
				.or(`and(user1_id.eq.${user.id},user2_id.eq.${callerId}),and(user1_id.eq.${callerId},user2_id.eq.${user.id})`)
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
						user2_id: callerId,
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

			// Get caller's name for navigation
			const callerFirstName = caller?.first_name || "";
			const callerLastName = caller?.last_name || "";
			const callerFullName = `${callerFirstName} ${callerLastName}`.trim() || "Caller";
			const callerInitials = `${callerFirstName?.[0] || ""}${callerLastName?.[0] || ""}`.toUpperCase() || "C";

			console.log("Navigating to ChatScreenRunner with:", {
				conversationId,
				otherUserId: callerId,
				contactName: callerFullName,
				contactInitials: callerInitials,
			});

			// Navigate directly to ChatScreenRunner (mobile only)
			router.push({
				pathname: "/buddyrunner/ChatScreenRunner",
				params: {
					conversationId,
					otherUserId: callerId,
					contactName: callerFullName,
					contactInitials: callerInitials,
					isOnline: "false",
				},
			} as any);
		} catch (error) {
			console.error("Error in handleMessageIconClick:", error);
			Alert.alert("Error", "Failed to open chat. Please try again.");
		}
	};

	/* ---------- CONFIRM PICKUP (Delivery Items only) ---------- */
	const confirmPickup = useCallback(async () => {
		if (!errand || errand.category !== "Deliver Items") return;
		
		// Step 1: Open Camera
		try {
			// Request camera permissions
			const { status } = await ImagePicker.requestCameraPermissionsAsync();
			if (status !== 'granted') {
				Alert.alert('Permission Required', 'Camera permission is needed to take a pickup photo.');
				return;
			}

			// Launch camera
			const result = await ImagePicker.launchCameraAsync({
				mediaTypes: ImagePicker.MediaTypeOptions.Images,
				allowsEditing: true,
				aspect: [4, 3],
				quality: 0.8,
			});

			if (result.canceled || !result.assets[0]) {
				// User cancelled camera
				return;
			}

			const asset = result.assets[0];
			setConfirmingPickup(true);

			// Step 2: Upload photo to Supabase Storage
			const { data: { user }, error: authErr } = await supabase.auth.getUser();
			if (authErr || !user) throw authErr ?? new Error("Not signed in");

			// Create unique filename for pickup photo
			const timestamp = Date.now();
			const fileName = `pickup-photos/${errand.id}/${user.id}_${timestamp}.jpg`;

			// Upload using FormData (works for both mobile and web)
			const formData = new FormData();
			formData.append('file', {
				uri: asset.uri,
				type: 'image/jpeg',
				name: `pickup_${timestamp}.jpg`,
			} as any);

			const { data: uploadData, error: uploadError } = await supabase.storage
				.from('errands')
				.upload(fileName, formData, {
					contentType: 'image/jpeg',
					upsert: false,
				});

			if (uploadError) {
				console.error('Upload error:', uploadError);
				throw uploadError;
			}

			// Get public URL
			const { data: urlData } = supabase.storage
				.from('errands')
				.getPublicUrl(fileName);

			if (!urlData?.publicUrl) {
				throw new Error("Failed to get public URL for uploaded photo");
			}

			// Step 3: Update database
			const { error: updateError } = await supabase
				.from("errand")
				.update({
					pickup_status: "picked_up",
					pickup_photo: urlData.publicUrl,
					pickup_confirmed_at: new Date().toISOString(),
				})
				.eq("id", errand.id);

			if (updateError) throw updateError;

			// Step 4: Update local state and refresh UI
			setErrand(prev => prev ? {
				...prev,
				pickup_status: "picked_up",
				pickup_photo: urlData.publicUrl,
				pickup_confirmed_at: new Date().toISOString(),
			} : null);

			Alert.alert("Item Picked Up", "You have confirmed that the item has been picked up.");
		} catch (e: any) {
			console.error("Pickup confirmation error:", e);
			Alert.alert("Failed", String(e?.message ?? e));
		} finally {
			setConfirmingPickup(false);
		}
	}, [errand]);

	/* ---------- SUBMIT DELIVERY PROOF (Delivery Items only) ---------- */
	const submitDeliveryProof = useCallback(async () => {
		if (!errand || !PROOF_REQUIRED_CATEGORIES.includes(errand.category || "")) return;

		try {
			const { status } = await ImagePicker.requestCameraPermissionsAsync();
			if (status !== "granted") {
				Alert.alert("Permission Required", "Camera permission is needed to take a proof photo.");
				return;
			}

			const result = await ImagePicker.launchCameraAsync({
				mediaTypes: ImagePicker.MediaTypeOptions.Images,
				allowsEditing: true,
				aspect: [4, 3],
				quality: 0.8,
			});

			if (result.canceled || !result.assets[0]) {
				return;
			}

			const asset = result.assets[0];
			setSubmittingProof(true);

			const { data: { user }, error: authErr } = await supabase.auth.getUser();
			if (authErr || !user) throw authErr ?? new Error("Not signed in");

			const timestamp = Date.now();
			const fileName = `delivery-proof-photos/${errand.id}/${user.id}_${timestamp}.jpg`;

			const formData = new FormData();
			formData.append("file", {
				uri: asset.uri,
				type: "image/jpeg",
				name: `delivery_proof_${timestamp}.jpg`,
			} as any);

			const { data: uploadData, error: uploadError } = await supabase.storage
				.from("errands")
				.upload(fileName, formData, {
					contentType: "image/jpeg",
					upsert: false,
				});

			if (uploadError) {
				console.error("Delivery proof upload error:", uploadError);
				throw uploadError;
			}

			const { data: urlData } = supabase.storage
				.from("errands")
				.getPublicUrl(fileName);

			if (!urlData?.publicUrl) {
				throw new Error("Failed to get public URL for uploaded delivery proof photo");
			}

			const nowIso = new Date().toISOString();

			const { error: updateError } = await supabase
				.from("errand")
				.update({
					delivery_proof_photo: urlData.publicUrl,
					delivery_proof_at: nowIso,
				})
				.eq("id", errand.id);

			if (updateError) throw updateError;

			setErrand(prev => prev ? {
				...prev,
				delivery_proof_photo: urlData.publicUrl,
				delivery_proof_at: nowIso,
			} : null);

			Alert.alert("Proof Submitted", "Your delivery proof photo has been sent.");
		} catch (e: any) {
			console.error("Delivery proof submission error (map):", e);
			Alert.alert("Failed", String(e?.message ?? e));
		} finally {
			setSubmittingProof(false);
		}
	}, [errand]);

	/* ---------- COMPLETE TASK ---------- */
	const completeTask = useCallback(async () => {
		if (!errand) return;
		setCompletingTask(true);
		try {
			const { data: { user }, error: authErr } = await supabase.auth.getUser();
			if (authErr || !user) throw authErr ?? new Error("Not signed in");
			
			const { error } = await supabase
				.from("errand")
				.update({
					status: "completed",
					completed_at: new Date().toISOString(),
				})
				.eq("id", errand.id);
			
			if (error) throw error;
			
			// Update local state
			setErrand(prev => prev ? {
				...prev,
				status: "completed",
				completed_at: new Date().toISOString(),
			} : null);
			
			// Show success modal
			setSuccessModalVisible(true);
		} catch (e: any) {
			Alert.alert("Failed", String(e?.message ?? e));
		} finally {
			setCompletingTask(false);
		}
	}, [errand]);

	return (
		<SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }}>
			{/* Header */}
			<View style={styles.header}>
				<TouchableOpacity onPress={() => router.push("/buddyrunner/accepted_tasks?type=errands")} style={styles.backButton}>
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
						// Ensure updateRunnerLocation is available
						true;
					`}
				/>
			</View>

			{/* Footer Card */}
			<View style={styles.footerCard}>
				<View style={styles.footerContent}>
					{/* Profile Section */}
					<View style={styles.profileSection}>
						{caller?.profile_picture_url ? (
							<Image
								source={{ uri: caller.profile_picture_url }}
								style={styles.profileImage}
							/>
						) : (
							<View style={styles.profilePlaceholder}>
								<Ionicons name="person" size={20} color={colors.maroon} />
							</View>
						)}
						<View style={styles.profileInfo}>
							<Text style={styles.profileName}>{callerName}</Text>
							{callerCourse && <Text style={styles.profileCourse}>{callerCourse}</Text>}
						</View>
					</View>

					{/* Status and Actions */}
					<View style={styles.actionsSection}>
						<View style={styles.statusRow}>
							<Text style={styles.statusLabel}>Delivery:</Text>
							<View style={[styles.statusBadge, { backgroundColor: "#F59E0B" }]}>
								<Text style={styles.statusText}>In Progress</Text>
							</View>
							<TouchableOpacity 
								style={styles.chatButton}
								onPress={handleMessageIconClick}
								disabled={!caller?.id}
								activeOpacity={0.9}
							>
								<Ionicons name="chatbubble-outline" size={18} color="#fff" />
							</TouchableOpacity>
						</View>
						<TouchableOpacity 
							style={styles.viewRequestButton}
							onPress={() =>
								router.push({
									pathname: "/buddyrunner/errand_details",
									params: { id: id },
								})
							}
						>
							<Ionicons name="document-text-outline" size={14} color="#fff" />
							<Text style={styles.viewRequestText}>View Errand Request</Text>
						</TouchableOpacity>
						
						{/* Conditional button rendering */}
						{PROOF_REQUIRED_CATEGORIES.includes(errand?.category || "") ? (
							errand?.category === "Deliver Items" &&
							(errand?.pickup_status === "pending" || !errand?.pickup_status) ? (
								<SlidingButton
									text="Slide to Pick Up Item"
									onConfirm={confirmPickup}
									isConfirming={confirmingPickup}
									color="#22c55e"
								/>
							) : !errand?.delivery_proof_at ? (
								<SlidingButton
									text="Slide to Send Proof"
									onConfirm={submitDeliveryProof}
									isConfirming={submittingProof}
									color="#22c55e"
								/>
							) : (
								<TouchableOpacity 
									style={styles.completeButton}
									onPress={completeTask}
									disabled={completingTask}
								>
									{completingTask ? (
										<ActivityIndicator color="#fff" size="small" />
									) : (
										<Text style={styles.completeButtonText}>Task Complete</Text>
									)}
								</TouchableOpacity>
							)
						) : (
							<TouchableOpacity 
								style={styles.completeButton}
								onPress={completeTask}
								disabled={completingTask}
							>
								{completingTask ? (
									<ActivityIndicator color="#fff" size="small" />
								) : (
									<Text style={styles.completeButtonText}>Task Complete</Text>
								)}
							</TouchableOpacity>
						)}
					</View>
				</View>
			</View>
			
			{/* Success Modal */}
			<SuccessModal
				visible={successModalVisible}
				title="Task Completed"
				message="Your errand task is already completed."
				onClose={async () => {
					// Immediately send broadcast event to notify caller (DO NOT wait for DB update)
					if (errand?.id && errand?.buddycaller_id) {
						try {
							const channelName = `errand_completion_${errand.buddycaller_id}`;
							console.log('Task Completed: Broadcasting completion on channel:', channelName);
							supabase
								.channel(channelName)
								.send({ 
									type: 'broadcast', 
									event: 'errand_completed', 
									payload: { errandId: errand.id } 
								});
							console.log('Task Completed: Broadcast sent immediately to caller:', errand.buddycaller_id);
						} catch (error) {
							console.error('Task Completed: Error sending broadcast:', error);
							// Continue even if broadcast fails - database update will serve as backup
						}
					}
					
					setSuccessModalVisible(false);
					setRatingModalVisible(true);
				}}
			/>

			{/* Rating Modal */}
			<ErrandRateAndFeedbackModal
				visible={ratingModalVisible}
				onClose={() => {
					setRatingModalVisible(false);
					// Navigation handled inside modal component (mobile only)
				}}
				onSubmit={() => {
					setRatingModalVisible(false);
					// Navigation handled inside modal component (mobile only)
				}}
				taskTitle={errand?.title || ""}
				callerName={callerName}
				errandId={errand?.id}
				buddycallerId={errand?.buddycaller_id || undefined}
			/>
		</SafeAreaView>
	);
}

/* ===== Sliding Button Component ===== */
function SlidingButton({
	text,
	onConfirm,
	isConfirming,
	color = "#7E1B16",
}: {
	text: string;
	onConfirm: () => void;
	isConfirming: boolean;
	color?: string;
}) {
	const slideAnim = useRef(new Animated.Value(0)).current;
	const startX = useRef(0);
	
	const panResponder = useRef(
		PanResponder.create({
			onStartShouldSetPanResponder: () => true,
			onMoveShouldSetPanResponder: () => true,
			onPanResponderGrant: () => {
				slideAnim.stopAnimation((value) => {
					startX.current = value;
					slideAnim.setOffset(value);
					slideAnim.setValue(0);
				});
			},
			onPanResponderMove: (_, gestureState) => {
				const maxSlide = 280;
				const newValue = Math.max(0, Math.min(startX.current + gestureState.dx, maxSlide));
				slideAnim.setValue(newValue - startX.current);
			},
			onPanResponderRelease: (_, gestureState) => {
				slideAnim.flattenOffset();
				const currentValue = startX.current + gestureState.dx;
				const threshold = 240;
				if (currentValue >= threshold && !isConfirming) {
					Animated.spring(slideAnim, {
						toValue: 280,
						useNativeDriver: false,
						tension: 50,
						friction: 7,
					}).start(() => {
						onConfirm();
						setTimeout(() => {
							Animated.spring(slideAnim, {
								toValue: 0,
								useNativeDriver: false,
								tension: 50,
								friction: 7,
							}).start();
						}, 1000);
					});
				} else {
					Animated.spring(slideAnim, {
						toValue: 0,
						useNativeDriver: false,
						tension: 50,
						friction: 7,
					}).start();
				}
			},
		})
	).current;

	return (
		<View style={[styles.slidingButtonContainer, { backgroundColor: color }]}>
			<View style={styles.slidingButtonTrack}>
				<Animated.View
					style={[
						styles.slidingButtonFill,
						{
							width: slideAnim.interpolate({
								inputRange: [0, 280],
								outputRange: ["0%", "100%"],
							}),
						},
					]}
				/>
				<Animated.View
					{...panResponder.panHandlers}
					style={[
						styles.slidingButtonThumb,
						{
							transform: [{ translateX: slideAnim }],
						},
					]}
				>
					{isConfirming ? (
						<ActivityIndicator color={color} size="small" />
					) : (
						<Ionicons name="arrow-forward" size={20} color={color} />
					)}
				</Animated.View>
				<View style={styles.slidingButtonTextContainer}>
					<Text style={styles.slidingButtonText}>
						{isConfirming ? "Confirming..." : text}
					</Text>
				</View>
			</View>
		</View>
	);
}

/* ======================= SUCCESS MODAL ======================= */
function SuccessModal({
	visible,
	title,
	message,
	onClose,
}: {
	visible: boolean;
	title: string;
	message: string;
	onClose: () => void;
}) {
	return (
		<Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
			<View style={modalStyles.backdrop}>
				<View style={modalStyles.card}>
					<View style={modalStyles.iconWrap}>
						<Ionicons name="checkmark-circle" size={44} color={colors.maroon} />
					</View>
					<Text style={modalStyles.title}>{title}</Text>
					<Text style={modalStyles.msg}>{message}</Text>
					<TouchableOpacity onPress={onClose} style={modalStyles.okBtn} activeOpacity={0.9}>
						<Text style={modalStyles.okText}>OK</Text>
					</TouchableOpacity>
				</View>
			</View>
		</Modal>
	);
}

const modalStyles = StyleSheet.create({
	backdrop: {
		flex: 1,
		backgroundColor: "rgba(0,0,0,0.38)",
		alignItems: "center",
		justifyContent: "center",
		padding: 16,
	},
	card: {
		width: 360,
		maxWidth: "100%",
		backgroundColor: "#fff",
		borderRadius: 14,
		padding: 18,
		alignItems: "center",
	},
	iconWrap: {
		width: 64,
		height: 64,
		borderRadius: 999,
		backgroundColor: colors.faint,
		alignItems: "center",
		justifyContent: "center",
		marginBottom: 10,
	},
	title: {
		color: colors.text,
		fontSize: 16,
		fontWeight: "900",
		marginBottom: 4,
		textAlign: "center",
	},
	msg: {
		color: colors.text,
		fontSize: 13,
		opacity: 0.9,
		marginBottom: 14,
		textAlign: "center",
	},
	okBtn: {
		backgroundColor: colors.maroon,
		paddingVertical: 14,
		borderRadius: 12,
		width: "70%",
		alignItems: "center",
		justifyContent: "center",
	},
	okText: {
		color: "#fff",
		fontWeight: "700",
	},
});

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
	completeButton: {
		backgroundColor: "#fff",
		borderRadius: 12,
		paddingVertical: 12,
		alignItems: "center",
		justifyContent: "center",
	},
	completeButtonText: {
		color: colors.maroon,
		fontSize: 15,
		fontWeight: "800",
	},
	/* Sliding button styles */
	slidingButtonContainer: {
		width: "100%",
		height: 50,
		borderRadius: 12,
		overflow: "hidden",
	},
	slidingButtonTrack: {
		width: "100%",
		height: 50,
		backgroundColor: "rgba(255, 255, 255, 0.2)",
		borderRadius: 12,
		position: "relative",
		overflow: "hidden",
	},
	slidingButtonFill: {
		position: "absolute",
		left: 0,
		top: 0,
		height: "100%",
		backgroundColor: "rgba(255, 255, 255, 0.3)",
		borderRadius: 12,
	},
	slidingButtonThumb: {
		position: "absolute",
		left: 4,
		top: 4,
		width: 42,
		height: 42,
		borderRadius: 21,
		backgroundColor: "#fff",
		justifyContent: "center",
		alignItems: "center",
		elevation: 3,
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.25,
		shadowRadius: 3.84,
	},
	slidingButtonTextContainer: {
		position: "absolute",
		width: "100%",
		height: "100%",
		justifyContent: "center",
		alignItems: "center",
		paddingLeft: 50,
		paddingRight: 20,
	},
	slidingButtonText: {
		color: "#fff",
		fontSize: 14,
		fontWeight: "600",
		textAlign: "center",
	},
});

