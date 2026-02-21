// app/buddycaller/errand_details.tsx
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
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
    SafeAreaView,
} from "react-native";
import { supabase } from "../../lib/supabase";

/* ================= COLORS ================= */
const colors = {
    maroon: "#8B0000",
    light: "#FAF6F5",
    border: "#E5C8C5",
    text: "#531010",
    faint: "#F9F2F1",
    grayText: "#7A7A7A",
    white: "#FFFFFF",
};

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

type ItemRow = {
    id?: string;
    qty?: string | number;
    name?: string;
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
    status?: string | null;
    runner_id?: string | null;
    buddycaller_id?: string | null;
    items?: ItemRow[] | null;
    files?: FileRow[] | null;
    pickup_status?: string | null;
    pickup_photo?: string | null;
    pickup_confirmed_at?: string | null;
    delivery_proof_photo?: string | null;
    delivery_proof_at?: string | null;
};

type UserRow = {
    id: string;
    first_name?: string | null;
    last_name?: string | null;
    course?: string | null;
    student_id_number?: string | null;
    profile_picture_url?: string | null;
};

export default function ErrandDetails() {
    const router = useRouter();
    const { id } = useLocalSearchParams<{ id?: string | string[] }>();

    const [loading, setLoading] = useState(true);
    const [errand, setErrand] = useState<ErrandRow | null>(null);
    const [runner, setRunner] = useState<UserRow | null>(null);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    const fetchData = useCallback(async () => {
        setLoading(true);
        setErrorMsg(null);
        try {
            const idParam = Array.isArray(id) ? id[0] : id;
            const numericId = idParam ? Number(idParam) : NaN;
            if (!Number.isFinite(numericId)) {
                throw new Error(`Invalid errand id: ${String(idParam)}`);
            }

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
          pickup_status,
          pickup_photo,
          pickup_confirmed_at,
          delivery_proof_photo,
          delivery_proof_at
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
                    .select("id, first_name, last_name, course, student_id_number, profile_picture_url")
                    .eq("id", (e as ErrandRow).runner_id)
                    .single();

                setRunner((p ?? null) as UserRow | null);
            } else {
                setRunner(null);
            }
        } catch (err: any) {
            console.error("errand_details fetch error:", err);
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

    const hasRunner = !!runner;
    const isPrintCategory = !!(errand?.category || "").toLowerCase().match(/print|file|school/);
    const isDeliverItemsCategory =
        (errand?.category || "").toLowerCase() === "deliver items".toLowerCase();

    const items = errand?.items ?? [];
    const files = errand?.files ?? [];

    const totalQty = items.reduce((sum, it: any) => {
        const q = Number(it?.qty ?? 0);
        return sum + (Number.isFinite(q) ? q : 0);
    }, 0);

    const itemCount = isPrintCategory ? (files.length || "—") : (totalQty || (items.length || "—"));

    const itemsLabelValue = !isPrintCategory
        ? (items.length > 0 ? items.map((it: any) => it?.name ?? "Item").join(", ") : "—")
        : (files.length > 0 ? files.map((f: any) => f?.name ?? "File").join(", ") : "—");

    // Runner display strings – same as web version
    const runnerName =
        (hasRunner
            ? `${runner?.first_name || ""} ${runner?.last_name || ""}`.trim()
            : "") || "BuddyRunner";
    const runnerInfo =
        (hasRunner
            ? [runner?.course, runner?.student_id_number].filter(Boolean).join(" • ")
            : "") || "No info";

    const openProofImage = async (url?: string | null) => {
        if (!url) {
            Alert.alert("No photo", "There is no photo available yet.");
            return;
        }
        try {
            await Linking.openURL(url);
        } catch {
            Alert.alert("Unable to open", "The photo link looks invalid or unavailable.");
        }
    };

    const handleMessageIconClick = async () => {
        if (!hasRunner || !runner?.id) {
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
            const runnerName = `${runnerFirstName} ${runnerLastName}`.trim() || "Runner";
            const runnerInitials = `${runnerFirstName?.[0] || ""}${runnerLastName?.[0] || ""}`.toUpperCase() || "R";

            console.log("Navigating to ChatScreenCaller with:", {
                conversationId,
                otherUserId: runnerId,
                contactName: runnerName,
                contactInitials: runnerInitials,
            });

            // Navigate directly to ChatScreenCaller (mobile only)
            router.push({
                pathname: "/buddycaller/ChatScreenCaller",
                params: {
                    conversationId,
                    otherUserId: runnerId,
                    contactName: runnerName,
                    contactInitials: runnerInitials,
                    isOnline: "false",
                },
            } as any);
        } catch (error) {
            console.error("Error in handleMessageIconClick:", error);
            Alert.alert("Error", "Failed to open chat. Please try again.");
        }
    };

    const content = () => {
        if (loading) {
            return (
                <View style={ui.bodyCenter}>
                    <ActivityIndicator />
                </View>
            );
        }

        if (!errand) {
            return (
                <View style={ui.body}>
                    <Text style={{ color: colors.text, marginBottom: 6 }}>Errand not found.</Text>
                    {!!errorMsg && <Text style={{ color: colors.grayText, fontSize: 12 }}>{errorMsg}</Text>}
                </View>
            );
        }

        return (
            <ScrollView contentContainerStyle={ui.body}>
                {/* Runner Card – same as web version */}
                <View style={s.profileCard}>
                    <View style={s.profileHeader}>
                        <View style={s.profileImageContainer}>
                            {hasRunner && runner?.profile_picture_url ? (
                                <Image 
                                    source={{ uri: runner.profile_picture_url }} 
                                    style={s.profileImage} 
                                    resizeMode="cover"
                                />
                            ) : (
                                <Ionicons name="person" size={24} color={colors.maroon} />
                            )}
                        </View>
                        <View style={s.runnerInfo}>
                            {hasRunner ? (
                                <>
                                    <Text style={s.runnerName}>{runnerName}</Text>
                                    <Text style={s.runnerDetails}>{runnerInfo}</Text>
                                    <Text style={s.runnerRole}>BuddyRunner</Text>
                                </>
                            ) : (
                                <Text style={s.noRunnerText}>No BuddyRunner yet</Text>
                            )}
                        </View>
                        <TouchableOpacity
                            style={s.chatButton}
                            disabled={!hasRunner}
                            activeOpacity={0.9}
                            onPress={handleMessageIconClick}
                        >
                            <Ionicons name="chatbubbles" size={20} color={colors.maroon} />
                        </TouchableOpacity>
                    </View>

                    <TouchableOpacity
                        disabled={!hasRunner}
                        onPress={() =>
                            hasRunner &&
                            router.push({ pathname: "/buddycaller/profile", params: { id: runner?.id } })
                        }
                        style={[s.viewProfileButton, !hasRunner && { opacity: 0.7 }]}
                        activeOpacity={0.9}
                    >
                        <Text style={s.viewProfileText}>View Profile</Text>
                    </TouchableOpacity>
                </View>

                {/* Errand Details Card – same as web version */}
                <View style={s.taskDetailsCard}>
                    <View style={s.taskDetailsHeader}>
                        <View style={s.taskDetailsIcon}>
                            <Ionicons name="briefcase" size={20} color={colors.maroon} />
                        </View>
                        <Text style={s.taskDetailsTitle}>Errand Details</Text>
                    </View>

                    <View style={s.taskDetailsContent}>
                        <View style={s.taskDetailRow}>
                            <Text style={s.taskDetailLabel}>Errand Title:</Text>
                            <Text style={s.taskDetailValue}>{errand.title}</Text>
                        </View>

                        <View style={s.taskDetailRow}>
                            <Text style={s.taskDetailLabel}>Category:</Text>
                            <Text style={s.taskDetailValue}>{errand.category ?? "—"}</Text>
                        </View>

                        <View style={s.taskDetailRow}>
                            <Text style={s.taskDetailLabel}>Number of Items:</Text>
                            <Text style={s.taskDetailValue}>{itemCount}</Text>
                        </View>

                        <View style={s.taskDetailRow}>
                            <Text style={s.taskDetailLabel}>
                                {isPrintCategory ? "Files / Documents:" : "Items List:"}
                            </Text>
                            <Text style={[s.taskDetailValue, { textAlign: "right" }]}>
                                {itemsLabelValue || "—"}
                            </Text>
                        </View>

                        <View style={s.taskDetailDivider} />

                        <Text style={s.detailLabelText}>Errand Description:</Text>
                        <Text style={s.detailText}>
                            {errand.description || "No description provided."}
                        </Text>

                        <View style={s.taskDetailDivider} />

                        {/* Price Breakdown Section */}
                        <View style={{ marginTop: 16 }}>
                            <Text style={[s.taskDetailLabel, { marginBottom: 8, fontSize: 14 }]}>Price Breakdown</Text>
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

                {/* Proof of Picked Up Item (Deliver Items only) */}
                {isDeliverItemsCategory && (
                    <View style={s.proofCard}>
                        <Text style={s.proofTitle}>Proof of Picked Up Item</Text>
                        {errand.pickup_photo ? (
                            <TouchableOpacity
                                activeOpacity={0.9}
                                onPress={() => openProofImage(errand.pickup_photo)}
                            >
                                <Image source={{ uri: errand.pickup_photo }} style={s.proofImage} />
                                <Text style={s.proofHint}>Click to view full photo</Text>
                            </TouchableOpacity>
                        ) : (
                            <Text style={s.proofEmpty}>No pickup proof photo yet.</Text>
                        )}
                    </View>
                )}

                {/* Proof of Delivery (all categories) */}
                <View style={s.proofCard}>
                    <Text style={s.proofTitle}>Proof of Delivery</Text>
                    {errand.delivery_proof_photo ? (
                        <TouchableOpacity
                            activeOpacity={0.9}
                            onPress={() => openProofImage(errand.delivery_proof_photo)}
                        >
                            <Image
                                source={{ uri: errand.delivery_proof_photo }}
                                style={s.proofImage}
                            />
                            <Text style={s.proofHint}>Click to view full photo</Text>
                        </TouchableOpacity>
                    ) : (
                        <Text style={s.proofEmpty}>No delivery proof photo yet.</Text>
                    )}
                </View>
            </ScrollView>
        );
    };

    return (
        <SafeAreaView style={ui.container}>
            <Header router={router} />
            {content()}
        </SafeAreaView>
    );
}

/* ============== Header Component ============== */
function Header({
    router,
}: {
    router: ReturnType<typeof useRouter>;
}) {
    return (
        <View style={ui.header}>
            <TouchableOpacity
                onPress={() => router.back()}
                style={ui.backBtn}
                activeOpacity={0.9}
            >
                <Ionicons name="arrow-back" size={20} color={colors.text} />
                <Text style={ui.backText}>Back</Text>
            </TouchableOpacity>

            <Text style={ui.headerTitle}>Errand Details</Text>

            <TouchableOpacity
                onPress={() => router.push("/buddycaller/notification")}
                style={ui.notificationIcon}
                activeOpacity={0.9}
            >
                <Ionicons
                    name="notifications-outline"
                    size={24}
                    color={colors.text}
                />
            </TouchableOpacity>
        </View>
    );
}

/* ===== Page layout styles ===== */
const ui = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.light,
    },
    header: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        backgroundColor: colors.white,
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: "800",
        color: colors.text,
        flex: 1,
        textAlign: "center",
    },
    backBtn: {
        flexDirection: "row",
        gap: 8,
        borderRadius: 8,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: colors.faint,
        paddingVertical: 8,
        paddingHorizontal: 12,
    },
    backText: { color: colors.text, fontSize: 14, fontWeight: "600" },
    body: {
        paddingHorizontal: 16,
        paddingVertical: 20,
    },
    bodyCenter: {
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
        padding: 20,
    },
    notificationIcon: {
        padding: 8,
        borderRadius: 8,
        backgroundColor: colors.faint,
    },
});

/* ===== Shared card styles ===== */
const s = StyleSheet.create({
    // Runner profile card – same as web version
    profileCard: {
        backgroundColor: "#fff",
        borderRadius: 12,
        padding: 20,
        marginBottom: 24,
        borderWidth: 1,
        borderColor: colors.border,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
    },
    profileHeader: {
        flexDirection: "row",
        alignItems: "center",
        marginBottom: 16,
    },
    profileImageContainer: {
        width: 60,
        height: 60,
        borderRadius: 30,
        backgroundColor: colors.faint,
        alignItems: "center",
        justifyContent: "center",
        marginRight: 16,
        overflow: "hidden",
    },
    profileImage: {
        width: 60,
        height: 60,
        borderRadius: 30,
    },
    runnerInfo: {
        flex: 1,
    },
    runnerName: {
        fontSize: 18,
        fontWeight: "800",
        color: colors.text,
        marginBottom: 4,
    },
    runnerDetails: {
        fontSize: 14,
        color: colors.text,
        opacity: 0.7,
        marginBottom: 4,
    },
    runnerRole: {
        fontSize: 14,
        color: colors.text,
        opacity: 0.7,
    },
    noRunnerText: { color: colors.grayText, fontSize: 13, fontStyle: "italic" },
    chatButton: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: colors.faint,
        alignItems: "center",
        justifyContent: "center",
    },
    viewProfileButton: {
        backgroundColor: colors.maroon,
        paddingVertical: 10,
        paddingHorizontal: 20,
        borderRadius: 8,
        alignSelf: "flex-start",
    },
    viewProfileText: {
        color: "#fff",
        fontSize: 14,
        fontWeight: "600",
    },

    // Errand Details card styling – same as web version
    taskDetailsCard: {
        backgroundColor: "#fff",
        borderRadius: 12,
        padding: 20,
        marginTop: 24,
        marginBottom: 24,
        borderWidth: 1,
        borderColor: colors.border,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
    },
    taskDetailsHeader: {
        flexDirection: "row",
        alignItems: "center",
        marginBottom: 20,
    },
    taskDetailsIcon: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: colors.faint,
        alignItems: "center",
        justifyContent: "center",
        marginRight: 16,
    },
    taskDetailsTitle: {
        fontSize: 18,
        fontWeight: "800",
        color: colors.text,
    },
    taskDetailsContent: {
        marginBottom: 0,
    },
    taskDetailRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 12,
    },
    taskDetailLabel: {
        fontSize: 16,
        fontWeight: "600",
        color: colors.maroon,
        flex: 1,
    },
    taskDetailValue: {
        fontSize: 16,
        color: colors.text,
        flex: 2,
        textAlign: "right",
    },
    taskDetailDivider: {
        height: 1,
        backgroundColor: "#E0E0E0",
        marginVertical: 16,
    },
    detailLabelText: {
        fontSize: 14,
        fontWeight: "600",
        color: colors.maroon,
        marginBottom: 8,
    },
    detailText: {
        fontSize: 16,
        color: colors.text,
        lineHeight: 24,
    },

    proofCard: {
        marginTop: 16,
        padding: 14,
        borderRadius: 10,
        backgroundColor: colors.white,
        borderWidth: 1,
        borderColor: colors.border,
    },
    proofTitle: {
        fontSize: 14,
        fontWeight: "700",
        color: colors.text,
        marginBottom: 8,
    },
    proofImage: {
        width: "100%",
        height: 260,
        borderRadius: 10,
        backgroundColor: colors.faint,
        resizeMode: "cover",
    },
    proofHint: {
        marginTop: 6,
        fontSize: 12,
        color: colors.grayText,
        textAlign: "center",
    },
    proofEmpty: {
        fontSize: 13,
        color: colors.grayText,
    },
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
});
