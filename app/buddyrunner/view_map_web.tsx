import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useRef, useState, useCallback } from "react";
import { Image, Platform, SafeAreaView, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions, Alert, ActivityIndicator, Modal } from "react-native";
import * as ImagePicker from 'expo-image-picker';
import { supabase } from "../../lib/supabase";
import LocationService from "../../components/LocationService";
import ErrandRateAndFeedbackModalWeb from "../../components/ErrandRateAndFeedbackModalWeb";

// Web-only component for Leaflet map
const MapContainer = Platform.OS === "web" 
	? ({ mapRef }: { mapRef: React.RefObject<any> }) => {
		// @ts-ignore - React Native Web supports div
		return <div ref={mapRef} id="leaflet-map-container" style={{ width: "100%", height: "100%", zIndex: 0 }} />;
	}
	: () => <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}><Text>Map not available</Text></View>;

const colors = { maroon: "#8B0000", light: "#FAF6F5", border: "#E5C8C5", text: "#531010", faint: "#F7F1F0" };
const PROOF_REQUIRED_CATEGORIES = ["Deliver Items", "Food Delivery", "School Materials", "Printing"];

type ErrandRow = {
	id: number;
	title: string | null;
	status: string | null;
	buddycaller_id: string | null;
	category: string | null;
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

export default function ViewMapWeb() {
	const router = useRouter();
	const { id } = useLocalSearchParams<{ id?: string }>();
	const { width } = useWindowDimensions();
	const mapRef = useRef<HTMLDivElement | null>(null);
	const mapInstanceRef = useRef<any>(null);
	const runnerMarkerRef = useRef<any>(null);
	const callerMarkerRef = useRef<any>(null);
	const destinationMarkerRef = useRef<any>(null);
	const runnerAccuracyCircleRef = useRef<any>(null);
	const polylineRef = useRef<any>(null);
	const deliveryPolylineRef = useRef<any>(null);
	const hasAutoFittedRef = useRef<boolean>(false);
	const locationSubscriptionRef = useRef<any>(null);
	// Hidden file input for mobile web browsers
	const fileInputRef = useRef<HTMLInputElement | null>(null);
	const [loading, setLoading] = useState(true);
	const [errand, setErrand] = useState<ErrandRow | null>(null);
	const [caller, setCaller] = useState<UserRow | null>(null);
	const [callerLocation, setCallerLocation] = useState<{ lat: number; lng: number } | null>(null);
	const [runnerLocation, setRunnerLocation] = useState<{ lat: number; lng: number; accuracy?: number } | null>(null);
	const [destinationLocation, setDestinationLocation] = useState<{ lat: number; lng: number } | null>(null);
	const [permissionBlockedVisible, setPermissionBlockedVisible] = useState(false);
	const [confirmingPickup, setConfirmingPickup] = useState(false);
	const [submittingProof, setSubmittingProof] = useState(false);
	const [completingTask, setCompletingTask] = useState(false);
	const [successModalVisible, setSuccessModalVisible] = useState(false);
	const [ratingModalVisible, setRatingModalVisible] = useState(false);
	const { loading: profileLoading, fullName, roleLabel, profilePictureUrl } = useAuthProfile();

	// Responsive sidebar: hide completely on small screens (< 1024px), show on larger screens
	const isSmallScreen = width < 1024;
	const isMediumScreen = width >= 1024 && width < 1440;
	const isLargeScreen = width >= 1440;
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

	/* ---------- Logout flow: confirm -> sign out -> success -> /login ---------- */
	const [confirmOpen, setConfirmOpen] = React.useState(false);
	const [successOpen, setSuccessOpen] = React.useState(false);
	const [loggingOut, setLoggingOut] = React.useState(false);

	const requestLogout = () => setConfirmOpen(true);

	const performLogout = async () => {
		if (loggingOut) return;
		setLoggingOut(true);
		setConfirmOpen(false);
		setSuccessOpen(true);
		try {
			const { error } = await supabase.auth.signOut();
			if (error) throw error;
		} catch (e) {
			// optional: console.warn
		} finally {
			setLoggingOut(false);
		}
	};
	/* ------------------------------------------------------------------------- */

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
					.select("id, title, status, buddycaller_id, category, delivery_latitude, delivery_longitude, pickup_status, pickup_photo, pickup_confirmed_at, delivery_proof_photo, delivery_proof_at")
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

				// Initialize map (rotation is enabled by default on touch devices)
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
			if (locationSubscriptionRef.current) {
				try {
					// Check if remove method exists before calling
					if (typeof locationSubscriptionRef.current.remove === 'function') {
						locationSubscriptionRef.current.remove();
					}
				} catch (error) {
					console.error('Error removing location subscription:', error);
				}
				locationSubscriptionRef.current = null;
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
			}

			// Create runner marker (stick figure in white circle) - will be updated
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

				// Add accuracy circle for runner's own location (WEB only)
				const accuracyRadius = runnerLocation.accuracy && runnerLocation.accuracy > 0 
					? runnerLocation.accuracy 
					: 27; // Fallback: 27 meters
				runnerAccuracyCircleRef.current = L.default.circle(
					[runnerLocation.lat, runnerLocation.lng],
					{
						radius: accuracyRadius,
						color: '#3B82F6',
						fillColor: '#3B82F6',
						fillOpacity: 0.15,
						weight: 1,
					}
				).addTo(map);
			} else if (runnerLocation && runnerMarkerRef.current) {
				// Update existing runner marker position (DO NOT call fitBounds)
				runnerMarkerRef.current.setLatLng([runnerLocation.lat, runnerLocation.lng]);
				// Update accuracy circle position and radius
				if (runnerAccuracyCircleRef.current) {
					const accuracyRadius = runnerLocation.accuracy && runnerLocation.accuracy > 0 
						? runnerLocation.accuracy 
						: 27;
					runnerAccuracyCircleRef.current.setLatLng([runnerLocation.lat, runnerLocation.lng]);
					runnerAccuracyCircleRef.current.setRadius(accuracyRadius);
				}
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

	// Start real-time GPS tracking for runner
	useEffect(() => {
		if (Platform.OS !== "web") return;

		const startTracking = async () => {
			try {
				const { data: { user } } = await supabase.auth.getUser();
				if (!user) return;

				// Start watching location changes
					locationSubscriptionRef.current = await LocationService.watchLocation(
						async (location) => {
							if (__DEV__) console.log('📍 [Map] Runner location updated:', {
								lat: location.latitude.toFixed(6),
								lng: location.longitude.toFixed(6),
							accuracy: location.accuracy,
						});

						// Update local state immediately with accuracy
						setRunnerLocation({ 
							lat: location.latitude, 
							lng: location.longitude,
							accuracy: location.accuracy 
						});

						// Update location in database
						await LocationService.updateLocationInDatabase(user.id, location);
					},
					{
						timeInterval: 5000, // Update every 5 seconds
						distanceInterval: 10, // Or when moved 10 meters
					}
				);

				// If watchLocation returns null, it may indicate permission denied
				if (!locationSubscriptionRef.current) {
					// Check permission status
					if (navigator.geolocation) {
						navigator.geolocation.getCurrentPosition(
							() => {
								// Permission granted, hide modal
								setPermissionBlockedVisible(false);
							},
							(error) => {
								if (error.code === 1) {
									setPermissionBlockedVisible(true);
								}
							},
							{ timeout: 1000, maximumAge: 0 }
						);
					}
				}
			} catch (error: any) {
				console.error('Error starting location tracking:', error);
				// Check if error indicates permission denied
				if (error?.message?.includes('permission') || error?.code === 1) {
					setPermissionBlockedVisible(true);
				}
			}
		};

		startTracking();

		// Cleanup
		return () => {
			if (locationSubscriptionRef.current) {
				try {
					// Check if remove method exists before calling
					if (typeof locationSubscriptionRef.current.remove === 'function') {
						locationSubscriptionRef.current.remove();
					}
				} catch (error) {
					console.error('Error removing location subscription:', error);
				}
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

			console.log("Navigating to messages hub with:", {
				conversationId,
				otherUserId: callerId,
				contactName: callerFullName,
				contactInitials: callerInitials,
			});

			// Navigate to messages hub (web version)
			router.push({
				pathname: "/buddyrunner/messages_hub",
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
		
		// Step 1: Open Camera (or image picker for web)
		try {
			if (Platform.OS === 'web') {
				// For web, use image library picker since camera may not be available
				const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
				if (status !== 'granted') {
					Alert.alert('Permission Required', 'Photo library permission is needed to select a pickup photo.');
					return;
				}

				const result = await ImagePicker.launchImageLibraryAsync({
					mediaTypes: ImagePicker.MediaTypeOptions.Images,
					allowsEditing: true,
					aspect: [4, 3],
					quality: 0.8,
				});

				if (result.canceled || !result.assets[0]) {
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

				// For web, we need to fetch the image and convert to blob
				const response = await fetch(asset.uri);
				let blob = await response.blob();

				// Optimize image for WEB (resize and compress)
				try {
					const { optimizeImageForUpload } = await import('../../utils/imageOptimization.web');
					blob = await optimizeImageForUpload(blob);
				} catch (optimizeError) {
					if (__DEV__) console.warn('Pickup photo optimization failed, using original:', optimizeError);
					// Continue with original blob if optimization fails
				}

				const { data: uploadData, error: uploadError } = await supabase.storage
					.from('errands')
					.upload(fileName, blob, {
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
			} else {
				// For mobile, use camera
				const { status } = await ImagePicker.requestCameraPermissionsAsync();
				if (status !== 'granted') {
					Alert.alert('Permission Required', 'Camera permission is needed to take a pickup photo.');
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
				setConfirmingPickup(true);

				// Step 2: Upload photo to Supabase Storage
				const { data: { user }, error: authErr } = await supabase.auth.getUser();
				if (authErr || !user) throw authErr ?? new Error("Not signed in");

				// Create unique filename for pickup photo
				const timestamp = Date.now();
				const fileName = `pickup-photos/${errand.id}/${user.id}_${timestamp}.jpg`;

				// Upload using FormData (works for React Native)
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
			}
		} catch (e: any) {
			console.error("Pickup confirmation error:", e);
			Alert.alert("Failed", String(e?.message ?? e));
		} finally {
			setConfirmingPickup(false);
		}
	}, [errand]);

	/* ---------- SUBMIT DELIVERY PROOF (web: image picker) ---------- */
	const submitDeliveryProof = useCallback(async () => {
		if (!errand || !PROOF_REQUIRED_CATEGORIES.includes(errand.category || "")) return;

		// Desktop web: use Expo ImagePicker (existing behavior)
		// Note: Mobile browser file input is triggered directly in handlePointerUp
		try {
			const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
			if (status !== "granted") {
				Alert.alert("Permission Required", "Photo library permission is needed to select a proof photo.");
				return;
			}

			const result = await ImagePicker.launchImageLibraryAsync({
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

			const response = await fetch(asset.uri);
			const blob = await response.blob();

			const { data: uploadData, error: uploadError } = await supabase.storage
				.from("errands")
				.upload(fileName, blob, {
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
			console.error("Delivery proof submission error (web map):", e);
			Alert.alert("Failed", String(e?.message ?? e));
		} finally {
			setSubmittingProof(false);
		}
	}, [errand]);

	// Handle file selection from native file input (mobile web only)
	const handleFileInputChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		if (!file || !errand || !PROOF_REQUIRED_CATEGORIES.includes(errand.category || "")) {
			// Reset input for next selection
			if (fileInputRef.current) {
				fileInputRef.current.value = "";
			}
			return;
		}

		// Validate file type
		if (!file.type.startsWith("image/")) {
			Alert.alert("Invalid File", "Please select an image file.");
			if (fileInputRef.current) {
				fileInputRef.current.value = "";
			}
			return;
		}

		try {
			setSubmittingProof(true);

			const { data: { user }, error: authErr } = await supabase.auth.getUser();
			if (authErr || !user) throw authErr ?? new Error("Not signed in");

			const timestamp = Date.now();
			const fileName = `delivery-proof-photos/${errand.id}/${user.id}_${timestamp}.jpg`;

			// Convert File to Blob (File extends Blob, but ensure it's a Blob for consistency)
			let blob: Blob = file;
			
			// Optimize image for web if needed (resize and compress)
			try {
				const { optimizeImageForUpload } = await import('../../utils/imageOptimization.web');
				blob = await optimizeImageForUpload(blob);
			} catch (optimizeError) {
				if (__DEV__) console.warn('Delivery proof optimization failed, using original:', optimizeError);
				// Continue with original blob if optimization fails
			}

			const { data: uploadData, error: uploadError } = await supabase.storage
				.from("errands")
				.upload(fileName, blob, {
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
			console.error("Delivery proof submission error (mobile web):", e);
			Alert.alert("Failed", String(e?.message ?? e));
		} finally {
			setSubmittingProof(false);
			// Reset input for next selection
			if (fileInputRef.current) {
				fileInputRef.current.value = "";
			}
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
		<>
		<SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }}>
			{/* Modals */}
			<ConfirmModal
				visible={confirmOpen}
				title="Log Out?"
				message="Are you sure you want to log out?"
				onCancel={() => setConfirmOpen(false)}
				onConfirm={performLogout}
			/>
			<SuccessModal
				visible={successOpen}
				title="Logged out"
				message="You have logged out."
				onClose={() => {
					setSuccessOpen(false);
					router.replace("/login");
				}}
			/>
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
					onLogout={requestLogout}
					userName={fullName}
					userRole={roleLabel}
					profilePictureUrl={profilePictureUrl}
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
									<TouchableOpacity onPress={() => router.push("/buddyrunner/accepted_tasks_web?type=errands")} style={[web.backButton, web.backButtonSmall]}>
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
								<TouchableOpacity onPress={() => router.push("/buddyrunner/accepted_tasks_web?type=errands")} style={web.backButton}>
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
					<View style={[web.footerCard, isSmallScreen && web.footerCardSmall]}>
						<View style={[web.footerContent, isSmallScreen && web.footerContentSmall]}>
							{/* Profile Section */}
							<View style={[web.profileSection, isSmallScreen && web.profileSectionSmall]}>
								{caller?.profile_picture_url ? (
									<Image
										source={{ uri: caller.profile_picture_url }}
										style={[web.profileImage, isSmallScreen && web.profileImageSmall]}
									/>
								) : (
									<View style={[web.profilePlaceholder, isSmallScreen && web.profilePlaceholderSmall]}>
										<Ionicons name="person" size={isSmallScreen ? 16 : 20} color={colors.maroon} />
									</View>
								)}
								<View style={web.profileInfo}>
									<Text style={[web.profileName, isSmallScreen && web.profileNameSmall]} numberOfLines={1}>{callerName}</Text>
									{callerCourse && <Text style={[web.profileCourse, isSmallScreen && web.profileCourseSmall]} numberOfLines={1}>{callerCourse}</Text>}
								</View>
							</View>

							{/* Status and Actions */}
							<View style={[web.actionsSection, isSmallScreen && web.actionsSectionSmall]}>
								<View style={[web.statusRow, isSmallScreen && web.statusRowSmall]}>
									<Text style={[web.statusLabel, isSmallScreen && web.statusLabelSmall]}>Delivery:</Text>
									<View style={[web.statusBadge, { backgroundColor: "#3B82F6" }, isSmallScreen && web.statusBadgeSmall]}>
										<Text style={[web.statusText, isSmallScreen && web.statusTextSmall]}>In Progress</Text>
									</View>
									<TouchableOpacity 
										style={[web.chatButton, isSmallScreen && web.chatButtonSmall]}
										onPress={handleMessageIconClick}
										disabled={!caller?.id}
										activeOpacity={0.9}
									>
										<Ionicons name="chatbubble-outline" size={isSmallScreen ? 16 : 18} color="#fff" />
									</TouchableOpacity>
								</View>
								<TouchableOpacity 
									style={[web.viewRequestButton, isSmallScreen && web.viewRequestButtonSmall]}
									onPress={() =>
										router.push({
											pathname: "/buddyrunner/errand_details_web",
											params: { id: id },
										})
									}
								>
									<Ionicons name="document-text-outline" size={isSmallScreen ? 12 : 14} color="#fff" />
									<Text style={[web.viewRequestText, isSmallScreen && web.viewRequestTextSmall]} numberOfLines={1}>View Errand Request</Text>
								</TouchableOpacity>
								
								{/* Conditional button rendering */}
								{PROOF_REQUIRED_CATEGORIES.includes(errand?.category || "") ? (
									errand?.category === "Deliver Items" &&
									(errand?.pickup_status === "pending" || !errand?.pickup_status) ? (
										<TouchableOpacity
											style={[
												web.completeButton,
												isSmallScreen && web.completeButtonSmall,
												{ backgroundColor: "#22c55e" },
											]}
											onPress={confirmPickup}
											disabled={confirmingPickup}
										>
											{confirmingPickup ? (
												<ActivityIndicator color="#fff" size="small" />
											) : (
												<Text
													style={[
														web.completeButtonText,
														isSmallScreen && web.completeButtonTextSmall,
													]}
												>
													Tap to Confirm Pickup
												</Text>
											)}
										</TouchableOpacity>
									) : !errand?.delivery_proof_at ? (
										<TouchableOpacity
											style={[
												web.completeButton,
												isSmallScreen && web.completeButtonSmall,
												{ backgroundColor: "#22c55e" },
											]}
											onPress={submitDeliveryProof}
											disabled={submittingProof}
										>
											{submittingProof ? (
												<ActivityIndicator color="#fff" size="small" />
											) : (
												<Text
													style={[
														web.completeButtonText,
														isSmallScreen && web.completeButtonTextSmall,
													]}
												>
													Tap to Upload Proof
												</Text>
											)}
										</TouchableOpacity>
									) : (
										<TouchableOpacity 
											style={[web.completeButton, isSmallScreen && web.completeButtonSmall]}
											onPress={completeTask}
											disabled={completingTask}
										>
											{completingTask ? (
												<ActivityIndicator color="#fff" size="small" />
											) : (
												<Text style={[web.completeButtonText, isSmallScreen && web.completeButtonTextSmall]}>
													Task Complete
												</Text>
											)}
										</TouchableOpacity>
									)
								) : (
									<TouchableOpacity 
										style={[web.completeButton, isSmallScreen && web.completeButtonSmall]}
										onPress={completeTask}
										disabled={completingTask}
									>
										{completingTask ? (
											<ActivityIndicator color="#fff" size="small" />
										) : (
											<Text style={[web.completeButtonText, isSmallScreen && web.completeButtonTextSmall]}>Task Complete</Text>
										)}
									</TouchableOpacity>
								)}
							</View>
						</View>
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
							supabase
								.channel(channelName)
								.send({
									type: 'broadcast',
									event: 'errand_completed',
									payload: { errandId: errand.id } 
								});
						} catch (error) {
							if (__DEV__) console.error('Task Completed: Error sending broadcast:', error);
							// Continue even if broadcast fails - database update will serve as backup
						}
					}
					
					setSuccessModalVisible(false);
					setRatingModalVisible(true);
				}}
			/>

			{/* Rating Modal */}
			<ErrandRateAndFeedbackModalWeb
				visible={ratingModalVisible}
				onClose={() => {
					setRatingModalVisible(false);
					router.push("/buddyrunner/accepted_tasks_web?type=errands");
				}}
				onSubmit={() => {
					setRatingModalVisible(false);
					router.push("/buddyrunner/accepted_tasks_web?type=errands");
				}}
				taskTitle={errand?.title || ""}
				callerName={callerName}
				errandId={errand?.id}
				buddycallerId={errand?.buddycaller_id || undefined}
			/>

			{/* Permission Blocked Modal (WEB only) */}
			{Platform.OS === "web" && (
				<Modal transparent animationType="fade" visible={permissionBlockedVisible} onRequestClose={() => setPermissionBlockedVisible(false)}>
					<View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)", alignItems: "center", justifyContent: "center", padding: 16 }}>
						<View style={{ width: 400, maxWidth: "90%", backgroundColor: "#fff", borderRadius: 16, padding: 24, alignItems: "center", boxShadow: "0 4px 20px rgba(0,0,0,0.15)" }}>
							<View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: "#EF4444", alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
								<Ionicons name="location-outline" size={32} color="#fff" />
							</View>
							<Text style={{ color: colors.text, fontSize: 18, fontWeight: "700", marginBottom: 8, textAlign: "center" }}>
								Location Access Blocked
							</Text>
							<Text style={{ color: colors.text, fontSize: 14, opacity: 0.8, marginBottom: 24, textAlign: "center", lineHeight: 20 }}>
								You blocked location access in your browser. Please enable it in Site Settings.
							</Text>
							<TouchableOpacity
								onPress={() => setPermissionBlockedVisible(false)}
								style={{ backgroundColor: colors.maroon, paddingVertical: 14, borderRadius: 12, width: "100%", alignItems: "center", justifyContent: "center" }}
							>
								<Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>OK</Text>
							</TouchableOpacity>
						</View>
					</View>
				</Modal>
			)}
		</SafeAreaView>
		{/* Hidden file input for mobile web browsers */}
		{Platform.OS === "web" && (
			<input
				ref={fileInputRef}
				type="file"
				accept="image/*"
				capture="environment"
				onChange={handleFileInputChange}
				style={{
					position: "absolute",
					opacity: 0,
					width: 0,
					height: 0,
					pointerEvents: "none",
				}}
			/>
		)}
		</>
	);
}


/* ======================= CONFIRM MODAL ======================= */
function ConfirmModal({
	visible,
	title,
	message,
	onCancel,
	onConfirm,
}: {
	visible: boolean;
	title: string;
	message: string;
	onCancel: () => void;
	onConfirm: () => void;
}) {
	return (
		<Modal transparent visible={visible} animationType="fade" onRequestClose={onCancel}>
			<View style={modalStyles.backdrop}>
				<View style={[modalStyles.card, { alignItems: "flex-start" }]}>
					<Text style={modalStyles.title}>{title}</Text>
					<Text style={modalStyles.msg}>{message}</Text>
					<View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 10, width: "100%" }}>
						<TouchableOpacity onPress={onCancel} style={{ paddingVertical: 10, paddingHorizontal: 16, borderRadius: 10, backgroundColor: "#EEE" }} activeOpacity={0.9}>
							<Text style={{ color: colors.text, fontWeight: "700" }}>Cancel</Text>
						</TouchableOpacity>
						<TouchableOpacity onPress={onConfirm} style={{ paddingVertical: 10, paddingHorizontal: 16, borderRadius: 10, backgroundColor: colors.maroon }} activeOpacity={0.9}>
							<Text style={{ color: "#fff", fontWeight: "700" }}>Log out</Text>
						</TouchableOpacity>
					</View>
				</View>
			</View>
		</Modal>
	);
}

/* ======================= SUCCESS MODAL ======================= */
function SuccessModal({
	visible,
	title = "Logged out",
	message = "You have logged out.",
	onClose,
}: {
	visible: boolean;
	title?: string;
	message?: string;
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
		width: 400,
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

/* ======================= SIDEBAR ======================= */
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
	footerCardSmall: {
		padding: 12,
		borderTopLeftRadius: 16,
		borderTopRightRadius: 16,
	},
	footerContent: { gap: 12 },
	footerContentSmall: { gap: 10 },
	profileSection: { flexDirection: "row", alignItems: "center", gap: 10 },
	profileSectionSmall: { gap: 8 },
	profileImage: { width: 45, height: 45, borderRadius: 22.5, backgroundColor: "#fff" },
	profileImageSmall: { width: 38, height: 38, borderRadius: 19 },
	profilePlaceholder: { width: 45, height: 45, borderRadius: 22.5, backgroundColor: "#fff", alignItems: "center", justifyContent: "center" },
	profilePlaceholderSmall: { width: 38, height: 38, borderRadius: 19 },
	profileInfo: { flex: 1 },
	profileName: { color: "#fff", fontSize: 15, fontWeight: "800", marginBottom: 2 },
	profileNameSmall: { fontSize: 13, marginBottom: 1 },
	profileCourse: { color: "#fff", fontSize: 11, opacity: 0.9 },
	profileCourseSmall: { fontSize: 10 },
	actionsSection: { gap: 10 },
	actionsSectionSmall: { gap: 8 },
	statusRow: { flexDirection: "row", alignItems: "center", gap: 8 },
	statusRowSmall: { gap: 6, flexWrap: "wrap" },
	statusLabel: { color: "#fff", fontSize: 13, fontWeight: "600" },
	statusLabelSmall: { fontSize: 12 },
	statusBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
	statusBadgeSmall: { paddingHorizontal: 8, paddingVertical: 4 },
	statusText: { color: "#fff", fontSize: 11, fontWeight: "700" },
	statusTextSmall: { fontSize: 10 },
	chatButton: { marginLeft: "auto", padding: 6, borderRadius: 8, backgroundColor: "rgba(255,255,255,0.2)" },
	chatButtonSmall: { padding: 5, marginLeft: "auto" },
	viewRequestButton: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 8 },
	viewRequestButtonSmall: { gap: 4, paddingVertical: 6 },
	viewRequestText: { color: "#fff", fontSize: 13, fontWeight: "600" },
	viewRequestTextSmall: { fontSize: 12 },
	completeButton: { backgroundColor: "#fff", borderRadius: 12, paddingVertical: 12, alignItems: "center", justifyContent: "center" },
	completeButtonSmall: { borderRadius: 10, paddingVertical: 10 },
	completeButtonText: { color: colors.maroon, fontSize: 15, fontWeight: "800" },
	completeButtonTextSmall: { fontSize: 13 },
});

