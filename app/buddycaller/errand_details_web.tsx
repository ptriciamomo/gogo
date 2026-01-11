// app/buddycaller/errand_details_web.tsx
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
    useWindowDimensions,
} from "react-native";
import { supabase } from "../../lib/supabase";

/* ========= Shared helpers (copied from view_map_web for profile info) ========= */
function titleCase(s?: string | null) {
    if (!s) return "";
    return s
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean)
        .map((w) => (w[0] ? w[0].toUpperCase() + w.slice(1) : w))
        .join(" ");
}

type ProfileRow = {
    id: string;
    role: string | null;
    first_name: string | null;
    last_name: string | null;
    profile_picture_url: string | null;
};

function useAuthProfile() {
    const [loading, setLoading] = React.useState(true);
    const [fullName, setFullName] = React.useState<string>("");
    const [roleLabel, setRoleLabel] = React.useState<string>("");
    const [profilePictureUrl, setProfilePictureUrl] = React.useState<string | null>(null);

    const fetchProfile = React.useCallback(async () => {
        try {
            const { data: userRes } = await supabase.auth.getUser();
            const user = userRes?.user;
            if (!user) {
                setLoading(false);
                return;
            }
            const { data: row } = await supabase
                .from("users")
                .select("id, role, first_name, last_name, profile_picture_url")
                .eq("id", user.id)
                .single<ProfileRow>();
            const f = titleCase(row?.first_name || "");
            const l = titleCase(row?.last_name || "");
            const finalFull = (f && l ? `${f} ${l}` : "").trim() || "User";
            setFullName(finalFull);
            const roleRaw = (row?.role || "").toString().toLowerCase();
            setRoleLabel(
                roleRaw === "buddyrunner" ? "BuddyRunner" : roleRaw === "buddycaller" ? "BuddyCaller" : ""
            );
            setProfilePictureUrl(row?.profile_picture_url || null);
        } finally {
            setLoading(false);
        }
    }, []);

    React.useEffect(() => {
        fetchProfile();
        const { data: sub } = supabase.auth.onAuthStateChange(() => fetchProfile());
        return () => sub?.subscription?.unsubscribe?.();
    }, [fetchProfile]);

    return { loading, fullName, roleLabel, profilePictureUrl };
}

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

export default function ErrandDetailsWeb() {
    const router = useRouter();
    const { id } = useLocalSearchParams<{ id?: string | string[] }>();
    const { width } = useWindowDimensions();
    const { fullName, roleLabel, profilePictureUrl } = useAuthProfile();

    // Match Task Progress / View Map sidebar behavior
    const isSmallScreen = width < 1024;
    const isSmallContent = width < 600;
    const isMediumContent = width >= 600 && width < 900;
    const [open, setOpen] = useState(!isSmallScreen);

    useEffect(() => {
        setOpen(!isSmallScreen);
    }, [isSmallScreen]);

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
            console.error("errand_details_web fetch error:", err);
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

    // Runner display strings – copied from Task Progress web
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
                {/* Runner Card – copy layout & proportions from Task Progress */}
                <View style={s.profileCard}>
                    <View style={s.profileHeader}>
                        <View style={s.profileImage}>
                            {hasRunner && runner?.profile_picture_url ? (
                                <Image source={{ uri: runner.profile_picture_url }} style={s.profileImage} />
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

                {/* Errand Details Card – mirrors Task Details card from Commission */}
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
                    onLogout={async () => {
                        await supabase.auth.signOut();
                        router.replace("/login");
                    }}
                    userName={fullName}
                    userRole={roleLabel}
                    userAvatarUrl={profilePictureUrl}
                />

                 <View style={web.mainArea}>
                     <Header router={router} isSmallContent={isSmallContent} isMediumContent={isMediumContent} isSmallScreen={isSmallScreen} onMenuPress={() => setOpen(true)} />
                    {content()}
                </View>
            </View>
        </SafeAreaView>
    );
}

/* ============== Small UI helpers ============== */
 function Header({
     router,
     isSmallContent,
     isMediumContent,
     isSmallScreen,
     onMenuPress,
 }: {
     router: ReturnType<typeof useRouter>;
     isSmallContent: boolean;
     isMediumContent: boolean;
     isSmallScreen?: boolean;
     onMenuPress?: () => void;
 }) {
     return (
         <View
             style={[
                 ui.header,
                 {
                     height: isSmallContent ? 70 : 90,
                     paddingHorizontal: isSmallContent ? 12 : 16,
                 },
             ]}
         >
             {isSmallScreen ? (
                 <>
                     {/* Left side: Hamburger menu and back button together */}
                     <View style={web.leftButtonsContainer}>
                         {onMenuPress && (
                             <TouchableOpacity
                                 onPress={onMenuPress}
                                 style={web.hamburgerBtn}
                                 activeOpacity={0.7}
                             >
                                 <Ionicons name="menu-outline" size={24} color={colors.text} />
                             </TouchableOpacity>
                         )}
                         <TouchableOpacity
                             onPress={() => router.back()}
                             style={[
                                 ui.backBtn,
                                 {
                                     paddingVertical: 6,
                                     paddingHorizontal: 8,
                                     gap: 4,
                                 },
                             ]}
                             activeOpacity={0.9}
                         >
                             <Ionicons name="arrow-back" size={18} color={colors.text} />
                         </TouchableOpacity>
                     </View>
                     {/* Center: Errand Details text */}
                     <Text
                         style={[
                             ui.headerTitle,
                             ui.headerTitleCentered,
                             { fontSize: 16 },
                         ]}
                     >
                         Errand Details
                     </Text>
                     {/* Right side: Notification icon */}
                     <TouchableOpacity
                         onPress={() => router.push("/buddycaller/notification")}
                         style={[
                             ui.notificationIcon,
                             { padding: 6 },
                         ]}
                         activeOpacity={0.9}
                     >
                         <Ionicons
                             name="notifications-outline"
                             size={20}
                             color={colors.text}
                         />
                     </TouchableOpacity>
                 </>
             ) : (
                 <>
             <TouchableOpacity
                 onPress={() => router.back()}
                 style={[
                     ui.backBtn,
                     {
                         paddingVertical: isSmallContent ? 6 : 8,
                         paddingHorizontal: isSmallContent ? 10 : 12,
                     },
                 ]}
                 activeOpacity={0.9}
             >
                 <Ionicons name="arrow-back" size={isSmallContent ? 18 : 20} color={colors.text} />
                 <Text
                     style={[
                         ui.backText,
                         { fontSize: isSmallContent ? 13 : 14 },
                     ]}
                 >
                     Back
                 </Text>
             </TouchableOpacity>

             <Text
                 style={[
                     ui.headerTitle,
                     { fontSize: isSmallContent ? 16 : isMediumContent ? 17 : 18 },
                 ]}
             >
                 Errand Details
             </Text>

             <TouchableOpacity
                 onPress={() => router.push("/buddycaller/notification")}
                 style={[
                     ui.notificationIcon,
                     { padding: isSmallContent ? 6 : 8 },
                 ]}
                 activeOpacity={0.9}
             >
                 <Ionicons
                     name="notifications-outline"
                     size={isSmallContent ? 20 : 24}
                     color={colors.text}
                 />
             </TouchableOpacity>
                 </>
             )}
         </View>
     );
 }

function Row({ label, value }: { label: string; value?: string | number | null }) {
    return (
        <View style={s.row}>
            <View style={s.pill}>
                <Text style={s.pillLabel}>{label}</Text>
            </View>
            <Text style={s.value}>{value ?? "—"}</Text>
        </View>
    );
}

function RowSmall({ label, value }: { label: string; value?: string | number | null }) {
    return (
        <View style={[s.row, { marginTop: 8 }]}>
            <View style={s.pillSmall}>
                <Text style={s.pillLabel}>{label}</Text>
            </View>
            <Text style={s.value}>{value ?? "—"}</Text>
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
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        backgroundColor: colors.white,
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: "800",
        color: colors.text,
    },
    headerTitleCentered: {
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
    },
    backText: { color: colors.text, fontSize: 14, fontWeight: "600" },
    body: {
        paddingHorizontal: 32,
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
    // Runner profile card – copied from Task Progress web
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
    profileImage: {
        width: 60,
        height: 60,
        borderRadius: 30,
        backgroundColor: colors.faint,
        alignItems: "center",
        justifyContent: "center",
        marginRight: 16,
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

    // Simple pill/row styles used by Row / RowSmall helpers
    row: {
        flexDirection: "row",
        alignItems: "center",
        marginTop: 8,
        flexWrap: "wrap",
    },
    pill: {
        backgroundColor: colors.maroon,
        borderRadius: 8,
        paddingVertical: 6,
        paddingHorizontal: 10,
        marginRight: 8,
    },
    pillSmall: {
        backgroundColor: colors.maroon,
        borderRadius: 8,
        paddingVertical: 4,
        paddingHorizontal: 8,
        marginRight: 8,
    },
    pillLabel: {
        color: "#fff",
        fontSize: 12,
        fontWeight: "700",
    },
    value: {
        color: colors.text,
        fontSize: 13,
        flexShrink: 1,
    },

    // Errand Details card styling copied from Commission Task Progress (web)
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
        marginBottom: 16,
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

/* ============== Sidebar (same behavior as Task Progress / View Map) ============== */
function Sidebar({
    open,
    isSmallScreen,
    onToggle,
    onLogout,
    userName,
    userRole,
    userAvatarUrl,
}: {
    open: boolean;
    isSmallScreen: boolean;
    onToggle: () => void;
    onLogout: () => void;
    userName: string;
    userRole: string;
    userAvatarUrl?: string | null;
}) {
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
                            <Image
                                source={require("../../assets/images/logo.png")}
                                style={{ width: 22, height: 22, resizeMode: "contain" }}
                            />
                            <Text style={web.brand}>GoBuddy</Text>
                        </>
                    )}
                </View>
            </View>

            <View style={{ flex: 1, justifyContent: "space-between" }}>
                <View style={{ paddingTop: 8 }}>
                    <SideItem
                        label="Home"
                        icon="home-outline"
                        open={open}
                        active
                        onPress={() => router.push("/buddycaller/home")}
                    />
                    <Separator />
                    <SideItem
                        label="Messages"
                        icon="chatbubbles-outline"
                        open={open}
                        onPress={() => router.push("/buddycaller/messages_hub")}
                    />
                    <SideItem
                        label="Profile"
                        icon="person-outline"
                        open={open}
                        onPress={() => router.push("/buddycaller/profile")}
                    />
                </View>

                <View style={web.sidebarFooter}>
                    <View style={web.userCard}>
                        <View style={web.userAvatar}>
                            {userAvatarUrl ? (
                                <Image
                                    source={{ uri: userAvatarUrl }}
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

function Separator() {
    return <View style={{ height: 1, backgroundColor: colors.border }} />;
}

function SideItem({
    label,
    icon,
    open,
    active,
    onPress,
}: {
    label: string;
    icon: any;
    open: boolean;
    active?: boolean;
    onPress?: () => void;
}) {
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

/* ============== Sidebar / layout styles ============== */
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
    sideItem: {
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        paddingVertical: 14,
        paddingHorizontal: 16,
    },
    sideItemCollapsed: { justifyContent: "center", paddingHorizontal: 0 },
    sideItemText: { color: colors.text, fontSize: 14, fontWeight: "600" },
    sidebarFooter: { padding: 12, gap: 10 },
    userCard: {
        backgroundColor: colors.faint,
        borderRadius: 10,
        padding: 10,
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
    },
    userAvatar: {
        width: 34,
        height: 34,
        borderRadius: 999,
        backgroundColor: "#fff",
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 1,
        borderColor: colors.border,
    },
    userName: { color: colors.text, fontSize: 12, fontWeight: "800" },
    userRole: { color: colors.text, fontSize: 10, opacity: 0.7 },
    logoutBtn: {
        borderWidth: 1,
        borderColor: colors.maroon,
        borderRadius: 12,
        paddingVertical: 12,
        paddingHorizontal: 16,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        backgroundColor: "#fff",
    },
    logoutText: { color: colors.maroon, fontWeight: "700" },
    mainArea: { flex: 1, backgroundColor: "#fff" },
});


