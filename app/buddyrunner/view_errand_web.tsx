import React, { useCallback, useEffect, useMemo, useState, useRef } from "react";
import {
    ActivityIndicator,
    Alert,
    Image,
    Linking,
    Modal,
    Platform,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
    ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as ImagePicker from 'expo-image-picker';
import { supabase } from "../../lib/supabase";
import SlideButton from "../../components/SlideButton";

/* ===== Palette (same as mobile) ===== */
const C = {
    backdrop: "rgba(0,0,0,0.38)",
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
    items?: any;
    files?: any;
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
    fileUri?: string | null;
    url?: string | null;
    public_url?: string | null;
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
    Canteen: [
        { name: "Toppings", price: "₱55" },
        { name: "Biscuits", price: "₱10" },
        { name: "Pansit Canton", price: "₱30" },
        { name: "Waffles", price: "₱35" },
        { name: "Pastel", price: "₱20" },
        { name: "Rice Bowl", price: "₱60" },
    ],
    Drinks: [
        { name: "Real Leaf", price: "₱30" },
        { name: "Water (500ml)", price: "₱25" },
        { name: "Minute Maid", price: "₱30" },
        { name: "Kopiko Lucky Day", price: "₱30" },
    ],
} as const;

const SCHOOL_MATERIALS = [
    { name: "Yellowpad", price: "₱10" },
    { name: "Ballpen", price: "₱10" },
] as const;

// Helper function to parse price from FOOD_ITEMS or School Materials
// TODO (Phase 4): Replace duplicated parseItemPrice logic with shared utility from utils/errandItemPricing.ts
// This function is duplicated in: errand_form.tsx, view_errand.tsx, buddyrunner/view_errand.tsx
function parseItemPrice(itemName: string): number {
    // Food Delivery
    for (const category of Object.values(FOOD_ITEMS)) {
        const item = category.find(i => i.name === itemName);
        if (item) {
            // Extract numeric value from price string (e.g., "₱55" -> 55)
            const match = item.price.match(/[\d.]+/);
            if (match) {
                return parseFloat(match[0]);
            }
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

/** Adjust this to your actual home route (e.g., '/buddycaller/home') */
const HOME_PATH = "/home";

/* Hide web scrollbar but keep scrolling (targets element by id) */
const HIDE_SCROLLBAR_CSS = `
  #errandScroller {
    -ms-overflow-style: none;  /* IE/Edge */
    scrollbar-width: none;     /* Firefox */
  }
  #errandScroller::-webkit-scrollbar { display: none; } /* Chrome/Safari */
`;

export default function ViewErrandWeb() {
    const router = useRouter();
    const { id } = useLocalSearchParams<{ id?: string }>();

    const [loading, setLoading] = useState(true);
    const [accepting, setAccepting] = useState(false);
    const [errand, setErrand] = useState<Errand | null>(null);
    const [caller, setCaller] = useState<BuddyCaller | null>(null);
    const [files, setFiles] = useState<FileRow[]>([]);
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

    /* ---------- Files helpers ---------- */
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
        return decodeURIComponent(base.substring(base.lastIndexOf("/") + 1) || "File");
    };

    const getBucketAndPath = (f: FileRow) => {
        const direct = f.fileUri || f.public_url || f.url;
        if (direct && /^https?:\/\//i.test(direct)) return null;
        const rawPath = f.path || f.storage_path || f.file_path || f.filepath || f.key || "";
        if (!rawPath) return { bucket: null as any, path: null as any };
        const looksPrefixed = rawPath.includes("/");
        const bucket = f.bucket || (looksPrefixed ? rawPath.split("/")[0] : DEFAULT_BUCKET) || DEFAULT_BUCKET;
        const path =
            looksPrefixed && rawPath.startsWith(bucket + "/")
                ? rawPath.slice(bucket.length + 1)
                : rawPath;
        return { bucket, path };
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
            .createSignedUrl(bp.path, SIGNED_TTL_SECONDS, { download: fileDisplayName(f) });
        if (signed.data?.signedUrl) return signed.data.signedUrl;
        const pub = supabase.storage
            .from(bp.bucket)
            .getPublicUrl(bp.path, { download: fileDisplayName(f) }).data?.publicUrl;
        return pub ?? null;
    };

    const onDownload = useCallback(async (f: FileRow) => {
        const url = await buildDownloadUrl(f);
        if (!url) return Alert.alert("File", "No downloadable URL was found for this file.");
        try {
            await Linking.openURL(url);
        } catch (e: any) {
            Alert.alert("Download failed", String(e?.message ?? e));
        }
    }, []);

    /* ---------- Data ---------- */
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
                        .select("id, first_name, last_name, student_id_number, course, profile_picture_url")
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
                        if (typeof x === "string") return { fileUri: x } as FileRow;
                        return { name: "File" } as FileRow;
                    })
                    : [];
                setFiles(normalized);
            } catch (e) {
                console.error(e);
                Alert.alert("Error", "Unable to load errand.");
                setErrand(null);
                setCaller(null);
                setFiles([]);
            } finally {
                setLoading(false);
            }
        })();
    }, [id]);

    /* ---------- Navigation (X) ---------- */
    const goHome = useCallback(() => {
        try {
            router.replace("/buddyrunner/home");
        } catch {
            try {
                router.replace("/");
            } catch {/* noop */ }
        }
    }, [router]);

    /* ---------- Accept errand ---------- */
    const accept = useCallback(async () => {
        if (!errand) return;
        setAccepting(true);
        try {
            const { data: { user }, error: authErr } = await supabase.auth.getUser();
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
    }, [errand, goHome]);

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
                console.log('Pickup photo fetched, original size:', blob.size, 'bytes');

                // Optimize image for WEB (resize and compress)
                try {
                    const { optimizeImageForUpload } = await import('../../utils/imageOptimization.web');
                    blob = await optimizeImageForUpload(blob);
                    console.log('Pickup photo optimized, new size:', blob.size, 'bytes');
                } catch (optimizeError) {
                    console.warn('Pickup photo optimization failed, using original:', optimizeError);
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
        if (!errand || !proofRequiredCategories.includes(errand.category || "")) return;

        try {
            // For web, use image library picker
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
            console.error("Delivery proof submission error (web detail):", e);
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
            
            Alert.alert("Task Completed", "You have successfully completed this task.", [
                { text: "OK", onPress: () => router.back() },
            ]);
        } catch (e: any) {
            Alert.alert("Failed", String(e?.message ?? e));
        } finally {
            setCompletingTask(false);
        }
    }, [errand, router]);

    /* =========================
       SINGLE SCROLL CONTAINER
       =========================
       - Web: View with overflowY:auto (no nested ScrollViews at all)
       - Native: real ScrollView
    */
    const SingleScroller: any =
        Platform.OS === "web"
            ? (props: any) => <View {...props} />
            : (props: any) => (
                <ScrollView
                    {...props}
                    contentContainerStyle={[{ padding: 12, paddingBottom: 22 }, props.contentContainerStyle]}
                    showsVerticalScrollIndicator
                />
            );

    return (
        <View style={styles.root}>
            {/* Inject CSS to hide scrollbar on web */}
            {Platform.OS === "web" && (
                // @ts-ignore
                <style dangerouslySetInnerHTML={{ __html: HIDE_SCROLLBAR_CSS }} />
            )}

            {/* SHEET */}
            <View style={styles.sheet}>
                {/* Header */}
                <View style={styles.headerBar}>
                    <Text style={styles.headerTitle}>Errand Request</Text>
                    <TouchableOpacity onPress={goHome} hitSlop={10}>
                        <Ionicons name="close" size={20} color={C.maroon} />
                    </TouchableOpacity>
                </View>

                {/* Scroll Area */}
                <View style={styles.scrollArea}>
                    {loading ? (
                        <View style={styles.centerBox}>
                            <ActivityIndicator size="large" color={C.maroon} />
                            <Text style={{ color: C.text, marginTop: 10 }}>Loading…</Text>
                        </View>
                    ) : !errand ? (
                        <View style={styles.centerBox}>
                            <Text style={{ color: C.maroonDeep }}>Errand not found.</Text>
                        </View>
                    ) : (
                        // NOTE: nativeID added so CSS can target this exact element
                        <SingleScroller style={styles.webScroller} nativeID="errandScroller">
                            {/* BuddyCaller Card */}
                            <View style={styles.card}>
                                <View style={{ flexDirection: "row", alignItems: "center" }}>
                                    <Image
                                        source={{
                                            uri:
                                                caller?.profile_picture_url ||
                                                "https://i.pravatar.cc/100?img=3",
                                        }}
                                        style={styles.avatar}
                                    />
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.name}>{requesterName}</Text>
                                        {!!caller?.student_id_number && (
                                            <Text style={styles.subLine}>Student ID: {caller.student_id_number}</Text>
                                        )}
                                        {!!caller?.course && <Text style={styles.subLine}>{caller.course}</Text>}

                                        <TouchableOpacity style={styles.locationBtn} activeOpacity={0.9}>
                                            <Text style={styles.locationText}>View Location</Text>
                                        </TouchableOpacity>
                                    </View>

                                    <View style={styles.chatBubble}>
                                        <Ionicons name="chatbubble-ellipses" size={16} color={C.white} />
                                    </View>
                                </View>
                            </View>

                            {/* Errand Details Card */}
                            <View style={styles.card}>
                                <View style={{ alignItems: "center" }}>
                                    <Image
                                        source={require("../../assets/images/logo.png")}
                                        style={styles.logo}
                                    />
                                </View>
                                <View style={styles.hr} />

                                <ChipRow label="Errand Title:" value={String(errand.title ?? "").trim() || "—"} />
                                <ChipRow label="Errand Description:" value={String(errand.description ?? "").trim() || "—"} />
                                {typeof noOfItems === "number" && <ChipRow label="No of items:" value={String(noOfItems)} />}
                                <ChipRow label="Category:" value={String(errand.category ?? "").trim() || "—"} />

                                {/* Price Breakdown Section */}
                                <View style={{ marginTop: 16 }}>
                                    <Text style={[styles.label, { marginBottom: 8, fontSize: 14 }]}>Price Breakdown</Text>
                                    <View style={styles.priceBreakdownContainer}>
                                        {/* Item rows */}
                                        {priceBreakdown.itemRows.length > 0 ? (
                                            <>
                                                {priceBreakdown.itemRows.map((item, idx) => (
                                                    <View key={idx} style={styles.priceBreakdownRow}>
                                                        <View style={styles.priceBreakdownItemInfo}>
                                                            <Text style={styles.priceBreakdownItemName}>{item.name}</Text>
                                                            <Text style={styles.priceBreakdownItemQty}>x{item.qty} {item.qty === 1 ? 'pc' : 'pcs'}</Text>
                                                        </View>
                                                        <Text style={styles.priceBreakdownItemTotal}>
                                                            ₱{item.total.toFixed(2)}
                                                        </Text>
                                                    </View>
                                                ))}
                                                <View style={styles.priceBreakdownDivider} />
                                            </>
                                        ) : (
                                            <View style={styles.priceBreakdownRow}>
                                                <Text style={styles.priceBreakdownEmptyText}>No items added</Text>
                                            </View>
                                        )}

                                        {/* Subtotal */}
                                        <View style={styles.priceBreakdownRow}>
                                            <Text style={styles.priceBreakdownLabel}>Subtotal</Text>
                                            <Text style={styles.priceBreakdownValue}>
                                                ₱{priceBreakdown.subtotal.toFixed(2)}
                                            </Text>
                                        </View>

                                        {/* Delivery Fee */}
                                        {priceBreakdown.deliveryFee > 0 && (
                                            <View style={styles.priceBreakdownRow}>
                                                <Text style={styles.priceBreakdownLabel}>Delivery Fee</Text>
                                                <Text style={styles.priceBreakdownValue}>
                                                    ₱{priceBreakdown.deliveryFee.toFixed(2)}
                                                </Text>
                                            </View>
                                        )}

                                        {/* Service Fee (incl. VAT) - Only shown when there's subtotal or delivery fee */}
                                        {(priceBreakdown.subtotal > 0 || priceBreakdown.deliveryFee > 0) && (
                                            <View style={styles.priceBreakdownRow}>
                                                <Text style={styles.priceBreakdownLabel}>Service Fee (incl. VAT)</Text>
                                                <Text style={styles.priceBreakdownValue}>
                                                    ₱{priceBreakdown.serviceFee.toFixed(2)}
                                                </Text>
                                            </View>
                                        )}

                                        {/* Total */}
                                        {(priceBreakdown.subtotal > 0 || priceBreakdown.deliveryFee > 0) && (
                                            <>
                                                <View style={styles.priceBreakdownDivider} />
                                                <View style={[styles.priceBreakdownRow, styles.priceBreakdownTotalRow]}>
                                                    <Text style={styles.priceBreakdownTotalLabel}>Total</Text>
                                                    <Text style={styles.priceBreakdownTotalValue}>
                                                        ₱{priceBreakdown.total.toFixed(2)}
                                                    </Text>
                                                </View>
                                            </>
                                        )}
                                    </View>
                                </View>

                                {/* Files (show exact names + download) */}
                                {files.length > 0 && (
                                    <View style={{ marginTop: 6 }}>
                                        <Text style={styles.filesHdr}>Printing Files</Text>
                                        {files.map((f, i) => (
                                            <View key={`${fileDisplayName(f)}-${i}`} style={styles.fileRow}>
                                                <Ionicons name="document-text-outline" size={16} color={C.maroon} />
                                                <Text style={styles.fileName} numberOfLines={1}>
                                                    {fileDisplayName(f)}
                                                </Text>
                                                <TouchableOpacity onPress={() => onDownload(f)} hitSlop={10} style={{ marginLeft: 8 }}>
                                                    <Ionicons name="download-outline" size={19} color={C.maroon} />
                                                </TouchableOpacity>
                                            </View>
                                        ))}
                                    </View>
                                )}

                            </View>

                            {/* Accept/Pickup button BELOW details card */}
                            <View style={styles.bottomMaroon}>
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
                                    )
                                ) : (
                                    <TouchableOpacity
                                        onPress={accept}
                                        disabled={accepting}
                                        activeOpacity={0.9}
                                        style={[styles.acceptBtn, accepting && { opacity: 0.85 }]}
                                    >
                                        {accepting ? (
                                            <ActivityIndicator color={C.white} />
                                        ) : (
                                            <Text style={styles.acceptText}>Accept Errand</Text>
                                        )}
                                    </TouchableOpacity>
                                )}
                            </View>
                        </SingleScroller>
                    )}
                </View>
            </View>

            {/* Accepted Successfully Modal */}
            {successOpen && (
                <Modal transparent animationType="fade" visible={true} onRequestClose={() => setSuccessOpen(false)}>
                    <View style={modalStyles.backdrop}>
                        <View style={modalStyles.card}>
                            <View style={modalStyles.iconWrap}>
                                <Ionicons name="checkmark" size={34} color="#fff" />
                            </View>
                            <Text style={modalStyles.title}>Accepted Successfully</Text>
                            <Text style={modalStyles.msg}>You're now assigned to this errand. Opening Errand Details page…</Text>
                            <TouchableOpacity
                                onPress={() => {
                                    setSuccessOpen(false);
                                    if (errand) {
                                        router.push({ pathname: "/buddyrunner/errand_details_web", params: { id: errand.id } });
                                    }
                                }}
                                style={modalStyles.okBtn}
                                activeOpacity={0.9}
                            >
                                <Text style={modalStyles.okText}>OK</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </Modal>
            )}
        </View>
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
            <Text style={styles.label}>{label}</Text>
            <Text style={[styles.value, emphasizeRight && { fontWeight: "600" }]}>{value}</Text>
        </View>
    );
}


/* ===== Styles ===== */
const styles = StyleSheet.create({
    /* Fullscreen dim + centering */
    root: {
        flex: 1,
        backgroundColor: C.backdrop,
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
    },

    /* Sheet box with fixed viewport height so inner area can scroll */
    sheet: {
        width: "100%",
        maxWidth: 420,
        backgroundColor: C.white,
        borderRadius: 16,
        overflow: "hidden",
        borderColor: C.border,
        borderWidth: 1,
        display: "flex",
        flexDirection: "column",
        ...(Platform.OS === "web"
            ? ({
                height: "90vh",
                boxShadow: "0 12px 36px rgba(0,0,0,.25)",
            } as any)
            : { maxHeight: 700 }),
    },

    headerBar: {
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderBottomColor: C.border,
        borderBottomWidth: 1,
        backgroundColor: C.bg,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
    },
    headerTitle: { color: C.text, fontSize: 16, fontWeight: "600" },

    /* Critical so the inner scroller can shrink and actually scroll */
    scrollArea: {
        flex: 1,
        minHeight: 0,
    },

    /* On web we scroll this container itself (NO nested ScrollView) */
    webScroller: Platform.OS === "web"
        ? ({
            flex: 1,
            padding: 12,
            paddingBottom: 22,
            overflowY: "auto",      // still scrollable
            overscrollBehavior: "contain",
        } as any)
        : ({} as any),

    centerBox: { padding: 24, alignItems: "center", justifyContent: "center" },

    card: {
        backgroundColor: C.white,
        borderColor: C.border,
        borderWidth: 2,
        borderRadius: 12,
        padding: 14,
        marginTop: 14,
    },

    avatar: { width: 55, height: 55, borderRadius: 30, marginRight: 15, marginLeft: 10 },
    name: { color: C.text, fontWeight: "600" },
    subLine: { color: C.sub, fontSize: 12, marginTop: 2 },

    chatBubble: {
        width: 34,
        height: 34,
        borderRadius: 16,
        backgroundColor: C.maroon,
        alignItems: "center",
        justifyContent: "center",
        marginRight: 15,
    },

    locationBtn: {
        alignSelf: "flex-start",
        marginTop: 10,
        backgroundColor: C.maroon,
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 999,
    },
    locationText: { color: C.white, fontSize: 12, fontWeight: "600" },

    logo: { width: 48, height: 48, resizeMode: "contain", marginTop: 6, marginBottom: 10 },
    hr: { height: 1, backgroundColor: C.border, marginBottom: 10 },

    label: { color: C.maroon, fontSize: 13, fontWeight: "700", marginBottom: 4 },
    value: { color: C.text, fontSize: 14, marginTop: 2 },

    filesHdr: { color: C.text, fontWeight: "600", marginBottom: 6 },
    fileRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        paddingVertical: 6,
        borderBottomWidth: 1,
        borderBottomColor: C.faint,
    },
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

    /* CHANGED: accept section only */
    bottomMaroon: { backgroundColor: "transparent", borderRadius: 12, padding: 0, marginTop: 16, marginBottom: 8 },
    acceptBtn: { backgroundColor: C.maroon, borderRadius: 12, paddingVertical: 14, alignItems: "center" },
    acceptText: { color: C.white, fontWeight: "600", fontSize: 16 },
    completeButton: { backgroundColor: "#22c55e", borderRadius: 12, paddingVertical: 14, alignItems: "center" },
    completeButtonText: { color: C.white, fontWeight: "600", fontSize: 16 },
});

const modalStyles = StyleSheet.create({
    backdrop: {
        flex: 1,
        backgroundColor: "rgba(0,0,0,0.4)",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
    },
    card: {
        width: 400,
        maxWidth: "90%",
        backgroundColor: "#fff",
        borderRadius: 16,
        padding: 24,
        alignItems: "center",
        boxShadow: "0 4px 20px rgba(0,0,0,0.15)",
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
