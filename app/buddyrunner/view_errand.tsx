import React, { useCallback, useEffect, useMemo, useState, useRef } from "react";
import {
    ActivityIndicator,
    Alert,
    Image,
    Linking,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as ImagePicker from 'expo-image-picker';
import { supabase } from "../../lib/supabase";
import SlideButton from "../../components/SlideButton";

const C = {
    bg: "#FBF7F6",
    border: "#E5C8C5",
    maroon: "#7E1B16",
    maroonDeep: "#6b1713",
    chipBg: "#7E1B16",
    chipText: "#FFFFFF",
    text: "#4A1916",
    sub: "#6B6B6B",
    faint: "#F3E6E4",
    white: "#FFFFFF",
};

type Errand = {
    id: number | string;
    title?: string | null;
    description?: string | null;
    category?: string | null;
    amount_price?: number | null;
    status?: string | null;
    buddycaller_id?: string | null;
    runner_id?: string | null;
    accepted_at?: string | null;
    completed_at?: string | null;
    items?: any;
    files?: any; // JSONB
    pickup_status?: string | null;
    pickup_photo?: string | null;
    pickup_confirmed_at?: string | null;
    delivery_proof_photo?: string | null;
    delivery_proof_at?: string | null;
};

type BuddyCaller = {
    id: string;
    first_name?: string | null;
    last_name?: string | null;
    student_id_number?: string | null;
    course?: string | null;
    profile_picture_url?: string | null;
};

type FileRow = {
    name?: string | null;
    file_name?: string | null;
    filename?: string | null;

    // direct-link fields (any one is fine)
    url?: string | null;
    public_url?: string | null;
    fileUri?: string | null;

    // storage fields (for bucket objects)
    bucket?: string | null;
    path?: string | null;
    storage_path?: string | null;
    file_path?: string | null;
    filepath?: string | null;
    key?: string | null;
};

const DEFAULT_BUCKET = "errands";
const SIGNED_TTL_SECONDS = 60 * 60;

// Food and drink items for Food Delivery category
const FOOD_ITEMS = {
    "Canteen": [
        { name: "Toppings", price: "₱55" },
        { name: "Biscuits", price: "₱10" },
        { name: "Pansit Canton", price: "₱30" },
        { name: "Waffles", price: "₱35" },
        { name: "Pastel", price: "₱20" },
        { name: "Rice Bowl", price: "₱60 " },
    ],
    "Drinks": [
        { name: "Real Leaf", price: "₱30" },
        { name: "Water (500ml)", price: "₱25" },
        { name: "Minute Maid", price: "₱30" },
        { name: "Kopiko Lucky Day", price: "₱30" },
    ]
} as const;

const SCHOOL_MATERIALS = [
    { name: "Yellowpad", price: "₱10" },
    { name: "Ballpen", price: "₱10" },
] as const;

// Helper function to parse price from FOOD_ITEMS or School Materials
function parseItemPrice(itemName: string): number {
    // Food Delivery items
    for (const category of Object.values(FOOD_ITEMS)) {
        const item = category.find(i => i.name === itemName);
        if (item) {
            const match = item.price.match(/[\d.]+/);
            if (match) return parseFloat(match[0]);
        }
    }
    // School Materials
    const schoolItem = SCHOOL_MATERIALS.find((i) => i.name === itemName);
    if (schoolItem) {
        const match = schoolItem.price.match(/[\d.]+/);
        if (match) return parseFloat(match[0]);
    }
    return 0;
}

export default function ViewErrandRunner() {
    const router = useRouter();
    const { id } = useLocalSearchParams<{ id?: string }>();

    const [loading, setLoading] = useState(true);
    const [errand, setErrand] = useState<Errand | null>(null);
    const [caller, setCaller] = useState<BuddyCaller | null>(null);
    const [files, setFiles] = useState<FileRow[]>([]);
    const [accepting, setAccepting] = useState(false);
    const [confirmingPickup, setConfirmingPickup] = useState(false);
    const [submittingProof, setSubmittingProof] = useState(false);
    const [completingTask, setCompletingTask] = useState(false);
    const [successOpen, setSuccessOpen] = useState(false);
    const proofRequiredCategories = useMemo(
        () => ["Deliver Items", "Food Delivery", "School Materials", "Printing"],
        []
    );

    const requesterName = useMemo(() => {
        const f = (caller?.first_name || "").trim();
        const l = (caller?.last_name || "").trim();
        return [f, l].filter(Boolean).join(" ") || "BuddyCaller";
    }, [caller]);

    const noOfItems = useMemo(() => {
        const it = errand?.items;
        if (!it) return undefined;
        if (Array.isArray(it)) return it.length;
        if (typeof it === "object" && it !== null && Array.isArray((it as any).items))
            return (it as any).items.length;
        return undefined;
    }, [errand]);

    // Calculate price breakdown (must be called before early returns)
    const priceBreakdown = useMemo(() => {
        if (!errand) {
            return {
                itemRows: [],
                subtotal: 0,
                deliveryFee: 0,
                serviceFee: 11.20, // Service fee including VAT
                total: 0,
            };
        }

        const itemRows: Array<{ name: string; qty: number; price: number; total: number }> = [];
        let subtotal = 0;

        const items = Array.isArray(errand.items) ? errand.items : [];
        const category = errand.category || "";

        // Calculate item prices for all categories
        items.forEach((item: any) => {
            if (item.name && item.qty) {
                const itemPrice = parseItemPrice(item.name); // Returns 0 if no price found
                const quantity = parseFloat(String(item.qty)) || 0;
                const itemTotal = itemPrice * quantity;
                
                itemRows.push({
                    name: item.name,
                    qty: quantity,
                    price: itemPrice,
                    total: itemTotal,
                });
                subtotal += itemTotal;
            }
        });

        // Calculate total quantity (sum of all item quantities)
        const totalQuantity = items.reduce((sum: number, item: any) => {
            if (item.name && item.name.trim() !== "") {
                const qty = parseFloat(String(item.qty)) || 0;
                return sum + qty;
            }
            return sum;
        }, 0);

        // Delivery fee calculation: base flat fee + add-on for extra items/pages
        let baseFlatFee = 0;
        let addOnPerExtra = 0;
        
        if (category === "Deliver Items") {
            baseFlatFee = 20; // Base flat fee
            addOnPerExtra = 5; // ₱5 per extra item
        } else if (category === "Food Delivery") {
            baseFlatFee = 15; // Base flat fee
            addOnPerExtra = 5; // ₱5 per extra item
        } else if (category === "School Materials") {
            baseFlatFee = 10; // Base flat fee
            addOnPerExtra = 5; // ₱5 per extra item
        } else if (category === "Printing") {
            baseFlatFee = 5; // Base flat fee
            addOnPerExtra = 2; // ₱2 per extra page
        }
        
        // Formula: baseFee + (addOnFee × max(totalQuantity – 1, 0))
        const extraItems = Math.max(totalQuantity - 1, 0);
        const deliveryFee = baseFlatFee + (addOnPerExtra * extraItems);

        // Service fee: ₱10 flat per transaction
        const serviceFeeBase = 10;
        // VAT: 12% applied only to the service fee
        const vatAmount = serviceFeeBase * 0.12;
        const serviceFeeWithVat = serviceFeeBase + vatAmount;

        // Total
        const total = subtotal + deliveryFee + serviceFeeWithVat;

        return {
            itemRows,
            subtotal,
            deliveryFee,
            serviceFee: serviceFeeWithVat, // Service fee including VAT
            total,
        };
    }, [errand]);

    /* ---------- FILE HELPERS ---------- */
    const fileDisplayName = (f: FileRow) => {
        const candidate =
            f.name ||
            f.file_name ||
            f.filename ||
            f.fileUri ||
            f.public_url ||
            f.url ||
            f.path ||
            f.storage_path ||
            f.file_path ||
            f.filepath ||
            f.key ||
            "";
        const base = (candidate || "").toString().split("?")[0];
        return decodeURIComponent(
            base.substring(base.lastIndexOf("/") + 1) || "file"
        );
    };

    const getBucketAndPath = (f: FileRow) => {
        const direct = f.fileUri || f.public_url || f.url;
        if (direct && /^https?:\/\//i.test(direct)) return null;

        const rawPath =
            f.path || f.storage_path || f.file_path || f.filepath || f.key || "";
        if (!rawPath) return { bucket: null as any, path: null as any };

        const looksPrefixed = rawPath.includes("/");
        const bucket =
            f.bucket ||
            (looksPrefixed ? rawPath.split("/")[0] : DEFAULT_BUCKET) ||
            DEFAULT_BUCKET;

        const path =
            looksPrefixed && rawPath.startsWith(bucket + "/")
                ? rawPath.slice(bucket.length + 1)
                : rawPath;

        return { bucket, path };
    };

    const buildViewUrl = async (f: FileRow): Promise<string | null> => {
        const direct = f.fileUri || f.public_url || f.url;
        if (direct && /^https?:\/\//i.test(direct)) return direct;

        const bp = getBucketAndPath(f);
        if (!bp || !bp.bucket || !bp.path) return null;

        const pub = supabase.storage.from(bp.bucket).getPublicUrl(bp.path).data
            ?.publicUrl;
        if (pub) return pub;

        const signed = await supabase.storage
            .from(bp.bucket)
            .createSignedUrl(bp.path, SIGNED_TTL_SECONDS);
        return signed.data?.signedUrl ?? null;
    };

    const buildDownloadUrl = async (f: FileRow): Promise<string | null> => {
        const direct = f.fileUri || f.public_url || f.url;
        if (direct && /^https?:\/\//i.test(direct)) {
            return direct.includes("?") ? `${direct}&download` : `${direct}?download`;
        }

        const bp = getBucketAndPath(f);
        if (!bp || !bp.bucket || !bp.path) return null;

        const signed = await supabase.storage
            .from(bp.bucket)
            .createSignedUrl(bp.path, SIGNED_TTL_SECONDS, {
                download: fileDisplayName(f),
            });
        if (signed.data?.signedUrl) return signed.data.signedUrl;

        const pub = supabase.storage
            .from(bp.bucket)
            .getPublicUrl(bp.path, { download: fileDisplayName(f) }).data?.publicUrl;
        return pub ?? null;
    };

    const onView = useCallback(async (f: FileRow) => {
        const url = await buildViewUrl(f);
        if (!url) return Alert.alert("File", "No viewable URL was found for this file.");
        try {
            await Linking.openURL(url);
        } catch (e: any) {
            Alert.alert("Open failed", String(e?.message ?? e));
        }
    }, []);

    const onDownload = useCallback(async (f: FileRow) => {
        const url = await buildDownloadUrl(f);
        if (!url) return Alert.alert("File", "No downloadable URL was found for this file.");
        try {
            await Linking.openURL(url);
        } catch (e: any) {
            Alert.alert("Download failed", String(e?.message ?? e));
        }
    }, []);

    /* ---------- DATA ---------- */
    useEffect(() => {
        (async () => {
            if (!id) return;
            setLoading(true);
            try {
                const idFilter: string | number = isNaN(Number(id)) ? String(id) : Number(id);

                const { data: er, error: erErr } = await supabase
                    .from("errand")
                    .select("*")
                    .eq("id", idFilter)
                    .single();
                if (erErr) throw erErr;
                setErrand(er as Errand);

                if (er?.buddycaller_id) {
                    const { data: u, error: uErr } = await supabase
                        .from("users")
                        .select(
                            "id, first_name, last_name, student_id_number, course, profile_picture_url"
                        )
                        .eq("id", er.buddycaller_id)
                        .single();
                    if (uErr) throw uErr;
                    setCaller(u as BuddyCaller);
                } else {
                    setCaller(null);
                }

                const rawFiles = (er?.files ?? []) as any;
                const normalized: FileRow[] = Array.isArray(rawFiles)
                    ? rawFiles.map((x) => {
                        if (typeof x === "object" && x !== null) {
                            const o = x as any;
                            if (o.fileUri && !o.url) o.url = o.fileUri;
                            return o as FileRow;
                        }
                        if (typeof x === "string") {
                            return { fileUri: x } as FileRow;
                        }
                        return { name: "file" } as FileRow;
                    })
                    : [];
                setFiles(normalized);
            } catch (e) {
                console.error(e);
                Alert.alert("Error", "Unable to load errand. Please try again.");
                setErrand(null);
                setCaller(null);
                setFiles([]);
            } finally {
                setLoading(false);
            }
        })();
    }, [id]);

    /* ---------- ACCEPT ---------- */
    const accept = useCallback(async () => {
        if (!errand) return;
        setAccepting(true);
        try {
            const {
                data: { user },
                error: authErr,
            } = await supabase.auth.getUser();
            if (authErr || !user) throw authErr ?? new Error("Not signed in");
            
            // Get runner name for broadcast
            const { data: runnerData } = await supabase
                .from("users")
                .select("first_name, last_name")
                .eq("id", user.id)
                .single();
            
            const runnerName = runnerData 
                ? `${runnerData.first_name || ''} ${runnerData.last_name || ''}`.trim() || 'BuddyRunner'
                : 'BuddyRunner';
            
            const { error } = await supabase
                .from("errand")
                .update({
                    status: "in_progress",
                    runner_id: user.id,
                    accepted_at: new Date().toISOString(),
                })
                .eq("id", errand.id);
            if (error) throw error;
            
            // Immediately send broadcast event to notify caller (DO NOT wait for anything else)
            if (errand.buddycaller_id) {
                try {
                    const channelName = `errand_acceptance_${errand.buddycaller_id}`;
                    console.log('Errand Acceptance: Broadcasting acceptance on channel:', channelName);
                    supabase
                        .channel(channelName)
                        .send({ 
                            type: 'broadcast', 
                            event: 'errand_accepted', 
                            payload: { 
                                errandId: errand.id,
                                runnerName: runnerName
                            } 
                        });
                    console.log('Errand Acceptance: Broadcast sent immediately to caller:', errand.buddycaller_id);
                } catch (error) {
                    console.error('Errand Acceptance: Error sending broadcast:', error);
                    // Continue even if broadcast fails - database update will serve as backup
                }
            }
            
            // Show success modal instead of Alert
            setSuccessOpen(true);
        } catch (e: any) {
            Alert.alert("Failed", String(e?.message ?? e));
        } finally {
            setAccepting(false);
        }
    }, [errand, router]);

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
        } catch (e: any) {
            console.error("Pickup confirmation error:", e);
            Alert.alert("Failed", String(e?.message ?? e));
        } finally {
            setConfirmingPickup(false);
        }
    }, [errand]);

    /* ---------- SUBMIT DELIVERY PROOF (Delivery Items only) ---------- */
    const submitDeliveryProof = useCallback(async () => {
        if (!errand || !proofRequiredCategories.includes(errand.category || "")) return;

        try {
            // Request camera permissions
            const { status } = await ImagePicker.requestCameraPermissionsAsync();
            if (status !== "granted") {
                Alert.alert("Permission Required", "Camera permission is needed to take a proof photo.");
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
                return;
            }

            const asset = result.assets[0];
            setSubmittingProof(true);

            // Upload to Supabase Storage
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
            console.error("Delivery proof submission error:", e);
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
            
            // Update errand status to completed
            // NOTE: This function does NOT open camera, does NOT upload photos, does NOT call confirmPickup
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
            
            Alert.alert("Success", "Task completed successfully!", [
                { text: "OK", onPress: () => router.back() },
            ]);
        } catch (e: any) {
            Alert.alert("Failed", String(e?.message ?? e));
        } finally {
            setCompletingTask(false);
        }
    }, [errand, router]);

    /* ---------- RENDER ---------- */
    if (loading) {
        return (
            <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
                <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                    <ActivityIndicator size="large" color={C.maroon} />
                    <Text style={{ color: C.text, marginTop: 10 }}>Loading…</Text>
                </View>
            </SafeAreaView>
        );
    }

    if (!errand) {
        return (
            <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
                <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                    <Text style={{ color: C.maroonDeep }}>Errand not found.</Text>
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
            {/* Content */}
            <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 120 }}>
                {/* Header */}
                <View style={s.headerBar}>
                    <TouchableOpacity onPress={() => router.back()} style={s.backRow}>
                        <Ionicons name="chevron-back" size={22} color={C.maroon} />
                        <Text style={s.headerTitle}>Errand Request</Text>
                    </TouchableOpacity>
                </View>

                {/* BuddyCaller Card */}
                <View style={s.card}>
                    <View style={{ flexDirection: "row", alignItems: "center" }}>
                        <Image
                            source={{
                                uri: caller?.profile_picture_url || "https://i.pravatar.cc/100?img=3",
                            }}
                            style={s.avatar}
                        />
                        <View style={{ flex: 1 }}>
                            <Text style={s.name}>{requesterName}</Text>
                            {!!caller?.student_id_number && (
                                <Text style={s.subLine}>Student ID: {caller.student_id_number}</Text>
                            )}
                            {!!caller?.course && <Text style={s.subLine}>{caller.course}</Text>}
                            <TouchableOpacity style={s.locationBtn} activeOpacity={0.9}>
                                <Text style={s.locationText}>View Location</Text>
                            </TouchableOpacity>
                        </View>
                        <View style={s.chatBubble}>
                            <Ionicons name="chatbubble-ellipses" size={16} color={C.white} />
                        </View>
                    </View>
                </View>

                {/* Errand Details Card */}
                <View style={s.card}>
                    <View style={{ alignItems: "center" }}>
                        <Image
                            source={require("../../assets/images/logo.png")}
                            style={s.logo}
                        />
                    </View>
                    <View style={s.hr} />

                    <ChipRow label="Errand Title:" value={String(errand.title ?? "").trim() || "—"} />
                    <ChipRow label="Errand Description:" value={String(errand.description ?? "").trim() || "—"} />
                    {typeof noOfItems === "number" && (
                        <ChipRow label="No of items:" value={String(noOfItems)} />
                    )}
                    <ChipRow label="Category:" value={String(errand.category ?? "").trim() || "—"} />

                    {/* Price Breakdown Section */}
                    <View style={{ marginTop: 16 }}>
                        <Text style={[s.label, { marginBottom: 8, fontSize: 14 }]}>Price Breakdown</Text>
                        <View style={s.priceBreakdownContainer}>
                            {/* Item rows */}
                            {priceBreakdown.itemRows.length > 0 ? (
                                <>
                                    {priceBreakdown.itemRows.map((item, idx) => (
                                        <View key={idx} style={s.priceBreakdownRow}>
                                            <View style={s.priceBreakdownItemInfo}>
                                                <Text style={s.priceBreakdownItemName}>{item.name}</Text>
                                                <Text style={s.priceBreakdownItemQty}>x{item.qty} {item.qty === 1 ? 'pc' : 'pcs'}</Text>
                                            </View>
                                            <Text style={s.priceBreakdownItemTotal}>
                                                ₱{item.total.toFixed(2)}
                                            </Text>
                                        </View>
                                    ))}
                                    <View style={s.priceBreakdownDivider} />
                                </>
                            ) : (
                                <View style={s.priceBreakdownRow}>
                                    <Text style={s.priceBreakdownEmptyText}>No items added</Text>
                                </View>
                            )}

                            {/* Subtotal */}
                            <View style={s.priceBreakdownRow}>
                                <Text style={s.priceBreakdownLabel}>Subtotal</Text>
                                <Text style={s.priceBreakdownValue}>
                                    ₱{priceBreakdown.subtotal.toFixed(2)}
                                </Text>
                            </View>

                            {/* Delivery Fee */}
                            {priceBreakdown.deliveryFee > 0 && (
                                <View style={s.priceBreakdownRow}>
                                    <Text style={s.priceBreakdownLabel}>Delivery Fee</Text>
                                    <Text style={s.priceBreakdownValue}>
                                        ₱{priceBreakdown.deliveryFee.toFixed(2)}
                                    </Text>
                                </View>
                            )}

                            {/* Service Fee (incl. VAT) - Only shown when there's subtotal or delivery fee */}
                            {(priceBreakdown.subtotal > 0 || priceBreakdown.deliveryFee > 0) && (
                                <View style={s.priceBreakdownRow}>
                                    <Text style={s.priceBreakdownLabel}>Service Fee (incl. VAT)</Text>
                                    <Text style={s.priceBreakdownValue}>
                                        ₱{priceBreakdown.serviceFee.toFixed(2)}
                                    </Text>
                                </View>
                            )}

                            {/* Total */}
                            {(priceBreakdown.subtotal > 0 || priceBreakdown.deliveryFee > 0) && (
                                <>
                                    <View style={s.priceBreakdownDivider} />
                                    <View style={[s.priceBreakdownRow, s.priceBreakdownTotalRow]}>
                                        <Text style={s.priceBreakdownTotalLabel}>Total</Text>
                                        <Text style={s.priceBreakdownTotalValue}>
                                            ₱{priceBreakdown.total.toFixed(2)}
                                        </Text>
                                    </View>
                                </>
                            )}
                        </View>
                    </View>

                    {/* Files list (Download only) */}
                    {files.length > 0 && (
                        <View style={{ marginTop: 6 }}>
                            <Text style={s.filesHdr}>Printing Files</Text>
                            {files.map((f, i) => (
                                <View key={`${fileDisplayName(f)}-${i}`} style={s.fileRow}>
                                    <Ionicons name="document-text-outline" size={16} color={C.maroon} />
                                    <Text style={s.fileName} numberOfLines={1}>
                                        {fileDisplayName(f)}
                                    </Text>
                                    <TouchableOpacity
                                        onPress={() => onDownload(f)}
                                        hitSlop={10}
                                        style={{ marginLeft: 8 }}
                                    >
                                        <Ionicons name="download-outline" size={19} color={C.maroon} />
                                    </TouchableOpacity>
                                </View>
                            ))}
                        </View>
                    )}
                </View>
            </ScrollView>

            {/* Fixed bottom bar */}
            <View style={s.footerBar}>
                {/* Conditional button rendering */}
                {errand?.status === "in_progress" ? (
                    proofRequiredCategories.includes(errand?.category || "") ? (
                        errand?.category === "Deliver Items" &&
                        (errand?.pickup_status === "pending" || !errand?.pickup_status) ? (
                            <SlideButton
                                text="Slide to Pick Up Item"
                                onConfirm={confirmPickup}
                                isConfirming={confirmingPickup}
                                color="#22c55e"
                            />
                        ) : !errand?.delivery_proof_at ? (
                            <SlideButton
                                text="Slide to Send Proof"
                                onConfirm={submitDeliveryProof}
                                isConfirming={submittingProof}
                                color="#22c55e"
                            />
                        ) : (
                            <TouchableOpacity
                                onPress={completeTask}
                                disabled={completingTask}
                                activeOpacity={0.92}
                                style={[s.acceptBtn, completingTask && { opacity: 0.85 }]}
                            >
                                {completingTask ? (
                                    <ActivityIndicator color={C.maroon} />
                                ) : (
                                    <Text style={s.acceptText}>Task Complete</Text>
                                )}
                            </TouchableOpacity>
                        )
                    ) : (
                        <TouchableOpacity
                            onPress={completeTask}
                            disabled={completingTask}
                            activeOpacity={0.92}
                            style={[s.acceptBtn, completingTask && { opacity: 0.85 }]}
                        >
                            {completingTask ? (
                                <ActivityIndicator color={C.maroon} />
                            ) : (
                                <Text style={s.acceptText}>Task Complete</Text>
                            )}
                        </TouchableOpacity>
                    )
                ) : (
                    // Errand is NOT accepted yet - ALWAYS show "Accept Errand" button
                    <TouchableOpacity
                        onPress={accept}
                        disabled={accepting}
                        activeOpacity={0.92}
                        style={[s.acceptBtn, accepting && { opacity: 0.85 }]}
                    >
                        {accepting ? (
                            <ActivityIndicator color={C.maroon} />
                        ) : (
                            <Text style={s.acceptText}>Accept Errand</Text>
                        )}
                    </TouchableOpacity>
                )}
            </View>

            {/* Accepted Successfully Modal */}
            {successOpen && (
                <View style={modalStyles.fullScreenBackdrop}>
                    <View style={modalStyles.centeredCard}>
                        <View style={modalStyles.iconWrap}>
                            <Ionicons name="checkmark" size={34} color="#fff" />
                        </View>
                        <Text style={modalStyles.title}>Accepted Successfully</Text>
                        <Text style={modalStyles.msg}>You're now assigned to this errand. Opening Errand Details page…</Text>
                        <TouchableOpacity
                            onPress={() => {
                                setSuccessOpen(false);
                                if (errand) {
                                    router.push({ pathname: "/buddyrunner/errand_details", params: { id: errand.id } });
                                }
                            }}
                            style={modalStyles.okBtn}
                            activeOpacity={0.9}
                        >
                            <Text style={modalStyles.okText}>OK</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            )}
        </SafeAreaView>
    );
}

/* ===== Presenters ===== */
function ChipRow({
    label,
    value,
    emphasizeRight,
}: {
    label: string;
    value: string;
    emphasizeRight?: boolean;
}) {
    return (
        <View style={{ marginBottom: 10 }}>
            <Text style={s.label}>{label}</Text>
            <Text style={[s.value, emphasizeRight && { fontWeight: "600" }]}>{value}</Text>
        </View>
    );
}

/* ===== Styles ===== */
const s = StyleSheet.create({
    headerBar: { paddingVertical: 10, borderBottomColor: C.border, borderBottomWidth: 1 },
    backRow: { flexDirection: "row", alignItems: "center", gap: 4, paddingLeft: 12, paddingBottom: 5 },
    headerTitle: { color: C.text, fontSize: 16, fontWeight: "600", flex: 1, textAlign: "left", paddingLeft: 14, paddingBottom: 5 },

    card: { backgroundColor: C.white, borderColor: C.border, borderWidth: 2, borderRadius: 12, padding: 14, marginTop: 14 },

    avatar: { width: 55, height: 55, borderRadius: 30, marginRight: 15, marginLeft: 10 },
    name: { color: C.text, fontWeight: "600" },
    subLine: { color: C.sub, fontSize: 12, marginTop: 2 },

    chatBubble: { width: 34, height: 34, borderRadius: 16, backgroundColor: C.maroon, alignItems: "center", justifyContent: "center", marginRight: 15 },

    locationBtn: { alignSelf: "flex-start", marginTop: 10, backgroundColor: C.maroon, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
    locationText: { color: C.white, fontSize: 12, fontWeight: "600" },

    logo: { width: 60, height: 60, resizeMode: "contain", marginTop: 6, marginBottom: 10 },
    hr: { height: 1, backgroundColor: C.border, marginBottom: 10 },

    label: { color: C.maroon, fontSize: 13, fontWeight: "700", marginBottom: 4 },
    value: { color: C.text, fontSize: 14, marginTop: 2 },

    filesHdr: { color: C.text, fontWeight: "600", marginBottom: 6 },
    fileRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: C.faint },
    fileName: { flex: 1, color: C.text },
    // Price Breakdown styles
    priceBreakdownContainer: {
        borderWidth: 1,
        borderColor: C.border,
        borderRadius: 8,
        backgroundColor: C.bg,
        padding: 12,
        marginTop: 8,
    },
    priceBreakdownRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        paddingVertical: 6,
    },
    priceBreakdownItemInfo: {
        flex: 1,
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
    },
    priceBreakdownItemName: {
        fontSize: 13,
        color: C.text,
        fontWeight: "500",
    },
    priceBreakdownItemQty: {
        fontSize: 12,
        color: C.sub,
    },
    priceBreakdownItemTotal: {
        fontSize: 13,
        color: C.text,
        fontWeight: "600",
    },
    priceBreakdownDivider: {
        height: 1,
        backgroundColor: C.border,
        marginVertical: 8,
    },
    priceBreakdownLabel: {
        fontSize: 13,
        color: C.text,
        fontWeight: "500",
    },
    priceBreakdownValue: {
        fontSize: 13,
        color: C.text,
        fontWeight: "600",
    },
    priceBreakdownTotalRow: {
        marginTop: 4,
    },
    priceBreakdownTotalLabel: {
        fontSize: 15,
        color: C.maroon,
        fontWeight: "700",
    },
    priceBreakdownTotalValue: {
        fontSize: 15,
        color: C.maroon,
        fontWeight: "700",
    },
    priceBreakdownEmptyText: {
        fontSize: 12,
        color: C.sub,
        fontStyle: "italic",
        textAlign: "center",
        width: "100%",
    },

    /* Fixed bottom bar + button */
    footerBar: {
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: C.maroon,
        padding: 14,
        paddingBottom: 55,
        paddingTop: 25,
    },
    acceptBtn: { backgroundColor: C.white, borderRadius: 10, paddingVertical: 12, alignItems: "center", height: 60, justifyContent: "center" },
    acceptText: { color: C.maroonDeep, fontWeight: "600", fontSize: 15 },
});

const modalStyles = StyleSheet.create({
    fullScreenBackdrop: {
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0,0,0,0.4)",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
    },
    centeredCard: {
        width: 360,
        maxWidth: "90%",
        backgroundColor: "#fff",
        borderRadius: 16,
        padding: 24,
        alignItems: "center",
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 12,
        elevation: 8,
    },
    iconWrap: {
        width: 64,
        height: 64,
        borderRadius: 32,
        backgroundColor: C.maroon,
        alignItems: "center",
        justifyContent: "center",
        marginBottom: 16
    },
    title: {
        color: C.text,
        fontSize: 18,
        fontWeight: "700",
        marginBottom: 8,
        textAlign: "center"
    },
    msg: {
        color: C.text,
        fontSize: 14,
        opacity: 0.8,
        marginBottom: 24,
        textAlign: "center",
        lineHeight: 20
    },
    okBtn: {
        backgroundColor: C.maroon,
        paddingVertical: 14,
        borderRadius: 12,
        width: "100%",
        alignItems: "center",
        justifyContent: "center"
    },
    okText: {
        color: "#fff",
        fontWeight: "700",
        fontSize: 15
    }
});
