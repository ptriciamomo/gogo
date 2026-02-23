

import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Dimensions,
    Image,
    Linking,
    Modal,
    Platform,
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
    faint: "#F9F2F1",
    grayBtn: "#C9C9C9",
    grayText: "#7A7A7A",
    white: "#FFFFFF",
};

type ItemRow = {
    id?: string;
    qty?: string | number;
    name?: string;
    url?: string;
    link?: string;
    href?: string;
    file_url?: string;
    download_url?: string;
    bucket?: string;
    path?: string;
};

type FileRow = {
    fileUri?: string;
    url?: string;
    href?: string;
    link?: string;
    name?: string;
    bucket?: string;
    path?: string;
};

type ErrandRow = {
    id: number;
    title: string;
    description: string;
    category?: string | null;
    amount_price?: number | null;
    status?: string | null; // pending | in_progress | completed | cancelled | delivered
    runner_id?: string | null;
    buddycaller_id?: string | null;
    items?: ItemRow[] | null;
    files?: FileRow[] | null;
    created_at?: string; // needed for 30s rule
    pickup_status?: string | null;
    pickup_photo?: string | null;
    pickup_confirmed_at?: string | null;
    delivery_location_id?: string | null;
    delivery_latitude?: number | null;
    delivery_longitude?: number | null;
    is_scheduled?: boolean | null;
    scheduled_time?: string | null;
    scheduled_date?: string | null;
};

type UserRow = {
    id: string;
    first_name?: string | null;
    last_name?: string | null;
    course?: string | null;
    student_id?: string | null;
    avatar_url?: string | null;
};

const MODAL_MAX_H = Math.floor(Dimensions.get("window").height * 0.92);
const CANCEL_WINDOW_SEC = 30;

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

/* ===== small helpers styled like mobile ===== */
function Row({ label, value }: { label: string; value?: string | number | null }) {
    return (
        <View style={s.row}>
            <Text style={s.label}>{label}</Text>
            <Text style={s.value}>{value ?? "—"}</Text>
        </View>
    );
}

function RowSmall({ label, value }: { label: string; value?: string | number | null }) {
    return (
        <View style={[s.row, { marginTop: 8 }]}>
            <Text style={s.label}>{label}</Text>
            <Text style={s.value}>{value ?? "—"}</Text>
        </View>
    );
}

export default function ViewErrandWeb() {
    const router = useRouter();
    const { id } = useLocalSearchParams<{ id?: string | string[] }>();

    const [loading, setLoading] = useState(true);
    const [errand, setErrand] = useState<ErrandRow | null>(null);
    const [runner, setRunner] = useState<UserRow | null>(null);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [visible, setVisible] = useState(true);

    // in-app cancel confirmation
    const [showCancelConfirm, setShowCancelConfirm] = useState(false);
    const [cancelSubmitting, setCancelSubmitting] = useState(false);

    // repost confirmation
    const [showRepostConfirm, setShowRepostConfirm] = useState(false);
    const [repostSubmitting, setRepostSubmitting] = useState(false);

    // ticker so the countdown updates every second
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        const t = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(t);
    }, []);

    const fetchData = useCallback(async () => {
        setLoading(true);
        setErrorMsg(null);
        try {
            const idParam = Array.isArray(id) ? id[0] : id;
            const numericId = idParam ? Number(idParam) : NaN;
            if (!Number.isFinite(numericId)) throw new Error(`Invalid errand id: ${String(idParam)}`);

            const { data: e, error: eErr } = await supabase
                .from("errand")
                .select(
                    `
          id,
          title,
          description,
          category,
          amount_price,
          status,
          runner_id,
          buddycaller_id,
          items,
          files,
          created_at,
          delivery_location_id,
          delivery_latitude,
          delivery_longitude,
          is_scheduled,
          scheduled_time,
          scheduled_date
        `
                )
                .eq("id", numericId)
                .single();

            if (eErr) throw eErr;

            const toArray = (v: any) => {
                if (Array.isArray(v)) return v;
                if (typeof v === "string") {
                    try {
                        const parsed = JSON.parse(v);
                        return Array.isArray(parsed) ? parsed : [];
                    } catch {
                        return [];
                    }
                }
                return [];
            };

            const itemsArr = toArray((e as any).items) as ItemRow[];
            const filesArr = toArray((e as any).files) as FileRow[];

            setErrand({ ...(e as ErrandRow), items: itemsArr ?? [], files: filesArr ?? [] });

            if ((e as ErrandRow).runner_id) {
                const { data: p } = await supabase
                    .from("users")
                    .select("id, first_name, last_name, course, student_id, avatar_url")
                    .eq("id", (e as ErrandRow).runner_id)
                    .single();
                setRunner(p as UserRow);
            } else {
                setRunner(null);
            }
        } catch (err: any) {
            console.error("fetch error:", err);
            setErrorMsg(err?.message ?? "Failed to load errand.");
            setErrand(null);
            setRunner(null);
        } finally {
            setLoading(false);
        }
    }, [id]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const currency = useMemo(
        () => new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }),
        []
    );

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

        const items = errand.items ?? [];
        const category = errand.category || "";

        // Calculate item prices for all categories
        items.forEach((item) => {
            if (item.name && item.qty) {
                // PHASE 2: Use stored price if available, otherwise fallback to parseItemPrice for backward compatibility
                const itemPrice = (item as any).price ?? parseItemPrice(item.name); // Returns 0 if no price found
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
        const totalQuantity = items.reduce((sum, item) => {
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

    /* ---------- file utils ---------- */
    const resolveUrl = (obj: any): string | undefined => {
        const direct =
            obj?.fileUri || obj?.url || obj?.link || obj?.href || obj?.file_url || obj?.download_url;
        if (typeof direct === "string" && /^https?:\/\//i.test(direct)) return direct;

        if (obj?.bucket && obj?.path) {
            try {
                const { data } = supabase.storage.from(String(obj.bucket)).getPublicUrl(String(obj.path));
                if (data?.publicUrl) return data.publicUrl;
            } catch {
                // ignore
            }
        }
        return undefined;
    };

    const nameFromUrl = (url?: string) => {
        if (!url) return undefined;
        try {
            const last = decodeURIComponent(url.split("/").pop() || "");
            return (last.split("?")[0] || "").trim() || undefined;
        } catch {
            return undefined;
        }
    };

    const handleViewFile = async (f: any) => {
        const url = resolveUrl(f);
        if (!url) {
            Alert.alert("No file", "No file link available for this item.");
            return;
        }
        try {
            await Linking.openURL(url);
        } catch {
            Alert.alert("Unable to open", "The file link looks invalid or blocked.");
        }
    };

    /* ---------- navigation helpers ---------- */
    const goHome = () => {
        setVisible(false);
        try {
            router.replace("/buddycaller/home" as any); // trigger refetch on Home
        } catch {
            try {
                router.replace("/buddycaller/home" as any);
            } catch {
                try {
                    router.replace("/");
                } catch { }
            }
        }
    };

    /* ---------- cancel flow with in-app confirm overlay ---------- */
    const onCancelRequestPress = () => {
        if (!canCancel) {
            Alert.alert("Too late", "The 30-second cancellation window has ended.");
            return;
        }
        setShowCancelConfirm(true);
    };

    const confirmCancel = async () => {
        if (!errand?.id) return;
        setCancelSubmitting(true);

        try {
            // Try server-enforced 30s using RPC (uses server time via now()).
            const { data: auth } = await supabase.auth.getUser();
            const uid = auth?.user?.id ?? null;

            if (uid) {
                const { data, error } = await supabase.rpc("cancel_errand_30s", {
                    _id: errand.id,
                    _buddycaller: uid,
                });

                if (!error && data && (Array.isArray(data) ? data.length > 0 : true)) {
                    // success via RPC
                    setCancelSubmitting(false);
                    setShowCancelConfirm(false);
                    goHome();
                    return;
                }
                // If function missing or returns empty, fall through to client-side guard
            }
        } catch (e) {
            // ignore and use fallback
        }

        // Fallback: client-side 30s check (uses device time; less accurate but works if RPC not created)
        const cutoffIso = new Date(Date.now() - CANCEL_WINDOW_SEC * 1000).toISOString();
        const { data, error } = await supabase
            .from("errand")
            .update({ status: "cancelled" }) // double-L to match Home
            .eq("id", errand.id)
            .eq("status", "pending")
            .gte("created_at", cutoffIso)
            .select("id");

        setCancelSubmitting(false);
        setShowCancelConfirm(false);

        if (error) {
            Alert.alert("Error", error.message);
            return;
        }
        if (!data || data.length === 0) {
            Alert.alert("Unable to cancel", "This errand is no longer eligible for cancellation.");
            return;
        }
        goHome();
    };

    /* ---------- repost flow ---------- */
    const onRepostPress = () => {
        setShowRepostConfirm(true);
    };

    const confirmRepost = async () => {
        if (!errand) return;
        setRepostSubmitting(true);

        try {
            const { data: auth } = await supabase.auth.getUser();
            if (!auth?.user) {
                Alert.alert("Error", "You must be logged in to repost an errand.");
                setRepostSubmitting(false);
                setShowRepostConfirm(false);
                return;
            }

            // Prepare items data (preserve price if available)
            const itemsData = (errand.items ?? []).map((item: any) => ({
                name: item.name || "",
                qty: item.qty || 1,
                price: item.price || undefined,
            }));

            // Prepare files data (copy file references)
            const filesData = (errand.files ?? []).map((file: any) => ({
                fileName: file.fileName || file.name || "",
                fileUri: file.fileUri || file.url || file.link || file.href || "",
                bucket: file.bucket || undefined,
                path: file.path || undefined,
            }));

            const payload: any = {
                buddycaller_id: auth.user.id,
                title: errand.title?.trim() || "",
                description: errand.description?.trim() || "",
                category: errand.category || null,
                status: "pending",
                items: itemsData,
                files: filesData,
                is_scheduled: (errand as any).is_scheduled || false,
                scheduled_time: (errand as any).scheduled_time || null,
                scheduled_date: (errand as any).scheduled_date || null,
            };

            // Set pickup_status based on category
            if (errand.category === "Deliver Items") {
                payload.pickup_status = 'pending';
                payload.pickup_photo = null;
                payload.pickup_confirmed_at = null;
            } else {
                payload.pickup_status = null;
                payload.pickup_photo = null;
                payload.pickup_confirmed_at = null;
            }

            // For Deliver Items, preserve delivery location if available
            if (errand.category === "Deliver Items" && (errand as any).delivery_location_id) {
                payload.delivery_location_id = (errand as any).delivery_location_id;
                payload.delivery_latitude = (errand as any).delivery_latitude;
                payload.delivery_longitude = (errand as any).delivery_longitude;
            }

            // Calculate and set amount_price (will be recalculated by backend/formula)
            // We'll let the system recalculate it, but include it for consistency
            if (priceBreakdown.total > 0) {
                payload.amount_price = priceBreakdown.total;
            }

            // Insert new errand
            const { error: insertError, data: insertedData } = await supabase
                .from("errand")
                .insert([payload])
                .select();

            if (insertError) {
                Alert.alert("Error", `Failed to repost errand: ${insertError.message}`);
                setRepostSubmitting(false);
                setShowRepostConfirm(false);
                return;
            }

            // Call Edge Function to assign top runner and notify
            if (insertedData && insertedData.length > 0 && insertedData[0]?.id) {
                try {
                    const { data: { session } } = await supabase.auth.getSession();
                    
                    if (session?.access_token) {
                        await supabase.functions.invoke('assign-errand', {
                            body: { errand_id: insertedData[0].id },
                            headers: {
                                Authorization: `Bearer ${session.access_token}`,
                            },
                        });
                    }
                } catch (assignError) {
                    console.warn('⚠️ [REPOST] Assignment failed:', assignError);
                    // Don't block repost if assignment fails
                }
            }

            setRepostSubmitting(false);
            setShowRepostConfirm(false);
            setVisible(false);
            // Navigate to My Request – Errands page after successful repost
            router.replace("/buddycaller/my_request_errands_web" as any);
        } catch (error: any) {
            console.error("Repost error:", error);
            Alert.alert("Error", `Failed to repost errand: ${error?.message || "Unknown error"}`);
            setRepostSubmitting(false);
            setShowRepostConfirm(false);
        }
    };

    if (!visible) return null;

    const isPrintCategory = !!(errand?.category || "").toLowerCase().match(/print|file|school/);

    // 30-second rule helpers (clamped to avoid >30s due to clock skew)
    const createdAtMs = errand?.created_at ? new Date(errand.created_at).getTime() : 0;
    const ageSecRaw = createdAtMs ? Math.floor((now - createdAtMs) / 1000) : Number.MAX_SAFE_INTEGER;
    const ageSec = Math.max(0, ageSecRaw); // never negative
    const remainingSec = Math.max(0, Math.min(CANCEL_WINDOW_SEC, CANCEL_WINDOW_SEC - ageSec));
    const canCancel = errand?.status === "pending" && remainingSec > 0;

    return (
        <Modal
            visible={visible}
            transparent
            animationType="fade"
            onRequestClose={() => {
                if (showCancelConfirm) {
                    setShowCancelConfirm(false);
                } else if (showRepostConfirm) {
                    setShowRepostConfirm(false);
                } else {
                    goHome();
                }
            }}
        >
            <View style={ui.overlay}>
                {/* Main modal content. Disable pointer events while confirm is open. */}
                <View style={ui.modal} pointerEvents={showCancelConfirm || showRepostConfirm ? "none" : "auto"}>
                    {/* Header */}
                    <View style={ui.header}>
                        <Text style={ui.headerTitle}>Errand Request</Text>
                        <TouchableOpacity onPress={goHome} style={ui.headerClose} activeOpacity={0.9}>
                            <Ionicons name="close" size={20} color={colors.maroon} />
                        </TouchableOpacity>
                    </View>

                    {loading ? (
                        <View style={ui.loading}>
                            <ActivityIndicator />
                        </View>
                    ) : !errand ? (
                        <View style={ui.body}>
                            <Text style={{ color: colors.text, marginBottom: 6 }}>Errand not found.</Text>
                            {!!errorMsg && <Text style={{ color: colors.grayText, fontSize: 12 }}>{errorMsg}</Text>}
                        </View>
                    ) : (
                        <ScrollView contentContainerStyle={ui.body}>
                            {/* Runner Card */}
                            <View style={s.runnerCard}>
                                <View style={{ flexDirection: "row", alignItems: "center" }}>
                                    <Image
                                        source={
                                            runner?.avatar_url ? { uri: runner.avatar_url } : require("../../assets/images/no_user.png")
                                        }
                                        style={s.avatar}
                                    />
                                    <View style={{ flex: 1 }}>
                                        {runner ? (
                                            <>
                                                <Text style={s.runnerName}>
                                                    {(runner?.first_name ?? "") + " " + (runner?.last_name ?? "")}
                                                </Text>
                                                <Text style={s.runnerMeta}>Student ID: {runner?.student_id ?? "—"}</Text>
                                                <Text style={s.runnerMeta}>{runner?.course ?? "—"}</Text>
                                            </>
                                        ) : (
                                            <Text style={s.noRunnerText}>No BuddyRunner yet</Text>
                                        )}
                                    </View>
                                    <Ionicons name="chatbubble-ellipses-outline" size={20} color={colors.maroon} />
                                </View>
                            </View>

                            {/* Errand Details */}
                            <View style={s.detailsCard}>
                                <View style={{ alignItems: "center", marginBottom: 8 }}>
                                    <Image
                                        source={require("../../assets/images/logo.png")}
                                        style={{ width: 90, height: 60, resizeMode: "contain", marginTop: 10 }}
                                    />
                                </View>

                                <Row label="Errand Title:" value={errand.title} />

                                <View style={[s.row, { marginTop: 8 }]}>
                                    <Text style={s.label}>Errand Description:</Text>
                                </View>
                                <Text style={[s.value, { marginTop: 6 }]}>{errand.description}</Text>

                                <View style={s.rowBlock}>
                                    <RowSmall label="Category:" value={errand.category ?? "—"} />

                                    {(() => {
                                        const items = errand.items ?? [];
                                        const files = errand.files ?? [];

                                        const totalQty = items.reduce((sum, it: any) => {
                                            const q = Number(it?.qty ?? 0);
                                            return sum + (Number.isFinite(q) ? q : 0);
                                        }, 0);

                                        return (
                                            <>
                                                <RowSmall
                                                    label="No. of items:"
                                                    value={isPrintCategory ? (files.length || "—") : (totalQty || (items.length || "—"))}
                                                />

                                                {!isPrintCategory && (
                                                    <>
                                                        <View style={[s.row, { marginTop: 8 }]}>
                                                            <Text style={s.label}>Items:</Text>
                                                        </View>
                                                        {items.length > 0 ? (
                                                            <View style={{ marginTop: 6 }}>
                                                                {items.map((it: any, idx: number) => (
                                                                    <Text key={idx} style={s.value}>
                                                                        • {it?.name ?? "Item"}
                                                                    </Text>
                                                                ))}
                                                            </View>
                                                        ) : (
                                                            <Text style={[s.value, { marginTop: 6 }]}>—</Text>
                                                        )}
                                                    </>
                                                )}

                                                {isPrintCategory && (
                                                    <>
                                                        <View style={[s.row, { marginTop: 8 }]}>
                                                            <Text style={s.label}>Files:</Text>
                                                        </View>

                                                        {files.length > 0 ? (
                                                            <View style={{ marginTop: 6, gap: 6 }}>
                                                                {files.map((f: any, idx: number) => {
                                                                    const url = resolveUrl(f);
                                                                    const niceName = f?.name || nameFromUrl(url) || "File";
                                                                    const disabled = !url;
                                                                    return (
                                                                        <View key={idx} style={s.fileRow}>
                                                                            <Text style={[s.value, { flex: 1 }]}>• {niceName}</Text>
                                                                            <TouchableOpacity
                                                                                onPress={() => handleViewFile(f)}
                                                                                disabled={disabled}
                                                                                style={[s.inlineBtn, disabled && { opacity: 0.5 }]}
                                                                                activeOpacity={0.9}
                                                                            >
                                                                                <Ionicons name="download-outline" size={14} color="#fff" />
                                                                                <Text style={s.inlineBtnText}>View</Text>
                                                                            </TouchableOpacity>
                                                                        </View>
                                                                    );
                                                                })}
                                                            </View>
                                                        ) : (
                                                            <Text style={[s.value, { marginTop: 6 }]}>—</Text>
                                                        )}
                                                    </>
                                                )}

                                            </>
                                        );
                                    })()}

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
                                </View>
                            </View>

                            {/* Bottom action: Cancel Request (30s gate) or Repost Errand (cancelled only) */}
                            <View style={{ paddingTop: 12 }}>
                                {errand.status === "cancelled" ? (
                                    <TouchableOpacity style={s.repostBtn} onPress={onRepostPress} activeOpacity={0.9}>
                                        <Text style={s.repostText}>Repost Errand</Text>
                                    </TouchableOpacity>
                                ) : canCancel ? (
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

                {/* ---------- Confirm overlay INSIDE the modal (clickable) ---------- */}
                {showCancelConfirm && (
                    <View style={confirm.overlay} pointerEvents="auto">
                        <View style={confirm.card}>
                            <Text style={confirm.title}>Cancel Request</Text>
                            <Text style={confirm.msg}>Are you sure you want to cancel this errand?</Text>
                            <View style={confirm.row}>
                                <TouchableOpacity
                                    style={[confirm.btn, confirm.ghost]}
                                    onPress={() => setShowCancelConfirm(false)}
                                    disabled={cancelSubmitting}
                                    activeOpacity={0.9}
                                >
                                    <Text style={[confirm.btnText, { color: colors.maroon }]}>No</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[confirm.btn, confirm.solid]}
                                    onPress={confirmCancel}
                                    disabled={cancelSubmitting}
                                    activeOpacity={0.9}
                                >
                                    <Text style={[confirm.btnText, { color: "#fff" }]}>
                                        {cancelSubmitting ? "Cancelling..." : "Yes, cancel"}
                                    </Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    </View>
                )}

                {/* ---------- Repost confirmation overlay ---------- */}
                {showRepostConfirm && (
                    <View style={confirm.overlay} pointerEvents="auto">
                        <View style={confirm.card}>
                            <Text style={confirm.title}>Repost Errand</Text>
                            <Text style={confirm.msg}>Are you sure you want to repost this errand?</Text>
                            <View style={confirm.row}>
                                <TouchableOpacity
                                    style={[confirm.btn, confirm.ghost]}
                                    onPress={() => setShowRepostConfirm(false)}
                                    disabled={repostSubmitting}
                                    activeOpacity={0.9}
                                >
                                    <Text style={[confirm.btnText, { color: colors.maroon }]}>Cancel</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[confirm.btn, confirm.solid]}
                                    onPress={confirmRepost}
                                    disabled={repostSubmitting}
                                    activeOpacity={0.9}
                                >
                                    <Text style={[confirm.btnText, { color: "#fff" }]}>
                                        {repostSubmitting ? "Reposting..." : "Confirm"}
                                    </Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    </View>
                )}
            </View>
        </Modal>
    );
}

/* ===== Modal shell ===== */
const ui = StyleSheet.create({
    overlay: {
        ...StyleSheet.absoluteFillObject,
        ...(Platform.OS === "web" ? ({ position: "fixed" } as any) : null),
        zIndex: 9999,
        backgroundColor: "rgba(0,0,0,0.38)",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
    },
    modal: {
        width: "70%",
        maxWidth: 520,
        maxHeight: MODAL_MAX_H,
        backgroundColor: "#fff",
        borderRadius: 14,
        overflow: "hidden",
        borderWidth: 1,
        borderColor: colors.border,
        zIndex: 10000,
        ...(Platform.OS === "web" ? ({ boxShadow: "0 10px 30px rgba(0,0,0,.25)" } as any) : {}),
    },
    header: {
        height: 54,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        paddingHorizontal: 16,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        backgroundColor: colors.light,
    },
    headerTitle: { color: colors.maroon, fontWeight: "800", fontSize: 16 },
    headerClose: {
        width: 32,
        height: 32,
        borderRadius: 8,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: colors.faint,
    },
    body: { padding: 16 },
    loading: { flex: 1, justifyContent: "center", alignItems: "center", padding: 22 },
});

/* ===== Confirm overlay styles (absolute inside modal) ===== */
const confirm = StyleSheet.create({
    overlay: {
        ...StyleSheet.absoluteFillObject,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "rgba(0,0,0,.45)",
        zIndex: 11000,
        padding: 16,
    },
    card: {
        width: "60%",
        maxWidth: 320,
        backgroundColor: "#fff",
        borderRadius: 12,
        borderWidth: 1,
        borderColor: colors.border,
        padding: 16,
        ...(Platform.OS === "web" ? ({ boxShadow: "0 8px 24px rgba(0,0,0,.25)" } as any) : {}),
    },
    title: { fontSize: 16, fontWeight: "800", color: colors.maroon },
    msg: { marginTop: 8, color: colors.text },
    row: {
        flexDirection: "row",
        gap: 10,
        justifyContent: "flex-end",
        marginTop: 16,
    },
    btn: {
        paddingVertical: 10,
        paddingHorizontal: 14,
        borderRadius: 8,
        borderWidth: 1,
    },
    ghost: { backgroundColor: "#fff", borderColor: colors.maroon },
    solid: { backgroundColor: colors.maroon, borderColor: colors.maroon },
    btnText: { fontWeight: "700" },
});

/* ===== mobile-like styles reused ===== */
const s = StyleSheet.create({
    runnerCard: {
        backgroundColor: colors.white,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 10,
        padding: 14,
        marginBottom: 16,
    },
    avatar: {
        width: 44,
        height: 44,
        borderRadius: 22,
        marginRight: 12,
        borderWidth: 1,
        borderColor: colors.border,
    },
    runnerName: { color: colors.text, fontWeight: "700" },
    runnerMeta: { marginTop: 2, color: colors.grayText, fontSize: 12 },
    noRunnerText: { color: colors.grayText, fontSize: 13, fontStyle: "italic" },

    detailsCard: {
        backgroundColor: colors.white,
        borderWidth: 1,
        borderColor: colors.maroon,
        borderRadius: 10,
        padding: 14,
    },
    row: { flexDirection: "row", alignItems: "center", marginTop: 8, flexWrap: "wrap" },
    rowBlock: { marginTop: 8 },
    label: { color: colors.maroon, fontSize: 13, fontWeight: "700", marginRight: 8 },
    value: { color: colors.text, fontSize: 13, flexShrink: 1 },
    feeText: { color: colors.grayText, fontSize: 12, lineHeight: 18 },
    // Price Breakdown styles
    priceBreakdownContainer: {
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 8,
        backgroundColor: colors.light,
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
        color: colors.text,
        fontWeight: "500",
    },
    priceBreakdownItemQty: {
        fontSize: 12,
        color: colors.grayText,
    },
    priceBreakdownItemTotal: {
        fontSize: 13,
        color: colors.text,
        fontWeight: "600",
    },
    priceBreakdownDivider: {
        height: 1,
        backgroundColor: colors.border,
        marginVertical: 8,
    },
    priceBreakdownLabel: {
        fontSize: 13,
        color: colors.text,
        fontWeight: "500",
    },
    priceBreakdownValue: {
        fontSize: 13,
        color: colors.text,
        fontWeight: "600",
    },
    priceBreakdownTotalRow: {
        marginTop: 4,
    },
    priceBreakdownTotalLabel: {
        fontSize: 15,
        color: colors.maroon,
        fontWeight: "700",
    },
    priceBreakdownTotalValue: {
        fontSize: 15,
        color: colors.maroon,
        fontWeight: "700",
    },
    priceBreakdownEmptyText: {
        fontSize: 12,
        color: colors.grayText,
        fontStyle: "italic",
        textAlign: "center",
        width: "100%",
    },

    cancelBtn: {
        backgroundColor: colors.maroon,
        borderRadius: 10,
        paddingVertical: 12,
        alignItems: "center",
    },
    cancelText: { color: colors.white, fontWeight: "700" },
    repostBtn: {
        backgroundColor: colors.maroon,
        borderRadius: 10,
        paddingVertical: 12,
        alignItems: "center",
    },
    repostText: { color: colors.white, fontWeight: "700" },

    fileRow: { flexDirection: "row", alignItems: "center", gap: 8 },
    inlineBtn: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        backgroundColor: colors.maroon,
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 8,
    },
    inlineBtnText: { color: "#fff", fontSize: 12, fontWeight: "700" },

    countdownNote: { marginTop: 6, color: colors.text, fontSize: 12, opacity: 0.8 },
    countdownNoteMuted: { marginTop: 6, color: colors.grayText, fontSize: 12 },
});
