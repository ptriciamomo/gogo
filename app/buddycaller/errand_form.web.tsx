// app/buddycaller/errand_form.tsx
import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import {
    Alert,
    Modal,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    TouchableWithoutFeedback,
    View,
} from "react-native";
import { supabase } from "../../lib/supabase";

// Web-only file; mobile variant removed

const colors = {
    maroon: "#8B2323",
    light: "#FFFFFF",
    border: "#8B2323",
    text: "#333333",
    faint: "#F7F1F0",
    white: "#FFFFFF",
};

const CATEGORY_OPTIONS = [
    "Deliver Items",
    "Food Delivery",
    "School Materials",
    "Printing",
] as const;

type CampusLocation = {
    id: string;
    name: string;
    latitude: number;
    longitude: number;
};


// ---- Web-only helpers to keep dropdowns anchored while the page scrolls/resizes
const useAnchoredPanel = (ref: React.MutableRefObject<View | null>, open: boolean) => {
    const [anchor, setAnchor] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
    const [panelMaxH, setPanelMaxH] = useState<number>(320);
    const isWeb = Platform.OS === "web";

    const measure = React.useCallback(() => {
        if (!ref.current) return;
        ref.current.measureInWindow((x, y, w, h) => {
            setAnchor({ x, y, w, h });
            if (isWeb) {
                // keep panel on-screen and tall enough to scroll
                const spaceBelow = window.innerHeight - (y + h) - 12; // 12px padding
                const maxH = Math.max(220, Math.min(440, spaceBelow)); // clamp
                setPanelMaxH(maxH);
            }
        });
    }, [ref, isWeb]);

    // Re-measure on open + while scrolling / resizing
    useEffect(() => {
        if (!isWeb || !open) return;
        measure(); // initial
        const onScroll = () => requestAnimationFrame(measure);
        const onResize = () => requestAnimationFrame(measure);
        window.addEventListener("scroll", onScroll, { passive: true });
        window.addEventListener("resize", onResize, { passive: true });
        return () => {
            window.removeEventListener("scroll", onScroll);
            window.removeEventListener("resize", onResize);
        };
    }, [isWeb, open, measure]);

    return { anchor, panelMaxH, measure };
};

/* ------------------------------------------------------------------ */
/* Dropdown (unchanged behavior)                                      */
/* ------------------------------------------------------------------ */
function Dropdown({ value, placeholder, onSelect, options }: {
    value?: string;
    placeholder?: string;
    onSelect: (v: string) => void;
    options: readonly string[];
}) {
    const [open, setOpen] = useState(false);
    const isWeb = Platform.OS === "web";
    const controlRef = useRef<View | null>(null);

    const { anchor, panelMaxH, measure } = useAnchoredPanel(controlRef, open);

    const openDropdown = () => {
        setOpen((prev) => !prev);
        requestAnimationFrame(measure);
    };
    const closeDropdown = () => setOpen(false);

    useEffect(() => {
        if (!isWeb || !open) return;
        const onKey = (e: any) => e.key === "Escape" && closeDropdown();
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [isWeb, open]);

    return (
        <>
            <View ref={controlRef} style={s.selectRow}>
                <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={openDropdown}
                    accessibilityRole="button"
                    style={[s.input as any, (s.selectInput as any)]}
                >
                    <Text style={{ color: value ? colors.text : "#999" }}>
                        {value || placeholder || "Select…"}
                    </Text>
                </TouchableOpacity>
                <View pointerEvents="none" style={s.caretWrap}>
                    <Ionicons name={open ? "chevron-up" : "chevron-down"} size={18} color={colors.maroon} />
                </View>
            </View>

            {open && anchor && (
                <Modal transparent animationType="fade" onRequestClose={closeDropdown} visible>
                    <TouchableWithoutFeedback onPress={closeDropdown}>
                        <View style={s.modalBackdrop} />
                    </TouchableWithoutFeedback>
                    <View
                        pointerEvents="box-none"
                        // fixed on web so it tracks viewport; absolute on native
                        style={[
                            isWeb ? s.modalRootWeb : s.modalRoot,
                            { top: anchor.y + anchor.h, left: anchor.x, width: anchor.w }
                        ]}
                    >
                        <View style={[s.dropdownPanelElevated, { maxHeight: panelMaxH }]}>
                            <ScrollView
                                style={{ maxHeight: panelMaxH }}
                                showsVerticalScrollIndicator
                                keyboardShouldPersistTaps="handled"
                                onStartShouldSetResponderCapture={() => true}
                                nestedScrollEnabled
                                scrollEnabled
                            >
                                {options.map((opt, idx) => (
                                    <TouchableOpacity
                                        key={opt}
                                        onPress={() => { onSelect(opt); closeDropdown(); }}
                                        style={[
                                            s.dropdownItem,
                                            { backgroundColor: idx % 2 === 0 ? colors.white : colors.faint },
                                        ]}
                                        activeOpacity={0.8}
                                    >
                                        <Text style={s.dropdownItemText}>{opt}</Text>
                                    </TouchableOpacity>
                                ))}
                            </ScrollView>
                        </View>
                    </View>
                </Modal>
            )}
        </>
    );
}

/* ------------------------------------------------------------------ */
/* Category Dropdown with Printing submenu                            */
/* ------------------------------------------------------------------ */
function CategoryDropdown({
    value,
    printingSize,
    printingColor,
    onSelect,
    onPrintingSizeSelect,
    onPrintingColorSelect,
    placeholder = "Select Category",
    categoryOptions,
}: {
    value?: string;
    printingSize?: string;
    printingColor?: string;
    onSelect: (v: string) => void;
    onPrintingSizeSelect: (size: string) => void;
    onPrintingColorSelect: (color: string) => void;
    placeholder?: string;
    categoryOptions?: readonly string[];
}) {
    const [open, setOpen] = useState(false);
    const [printingExpanded, setPrintingExpanded] = useState(false);
    const isWeb = Platform.OS === "web";
    const controlRef = useRef<View | null>(null);

    // Use provided categoryOptions or empty array
    const options = categoryOptions ?? [];

    // For web display: move "Printing" to the bottom
    const displayOptions = isWeb 
        ? [...options.filter(opt => opt !== "Printing"), ...options.filter(opt => opt === "Printing")]
        : options;

    const { anchor, panelMaxH, measure } = useAnchoredPanel(controlRef, open);

    const openDropdown = () => {
        setOpen((prev) => !prev);
        requestAnimationFrame(measure);
    };
    const closeDropdown = () => {
        setOpen(false);
        setPrintingExpanded(false);
    };

    useEffect(() => {
        if (!isWeb || !open) return;
        const onKey = (e: any) => e.key === "Escape" && closeDropdown();
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [isWeb, open]);

    const handleCategorySelect = (cat: string) => {
        if (cat === "Printing") {
            setPrintingExpanded(true);
        } else {
            onSelect(cat);
            onPrintingSizeSelect(""); // Clear printing size when selecting other category
            onPrintingColorSelect("");
            closeDropdown();
        }
    };

    const handlePrintingSizeSelect = (size: string) => {
        onPrintingSizeSelect(size);
        onSelect("Printing");
        // Keep expanded so user can choose color
        setPrintingExpanded(true);
    };

    const handlePrintingColorSelect = (color: string) => {
        onPrintingColorSelect(color);
        closeDropdown();
    };

    const displayValue = value === "Printing" && printingSize 
        ? `Printing-${printingSize}${printingColor ? `-${printingColor}` : ""}` 
        : value || placeholder;

    return (
        <>
            <View ref={controlRef} style={s.selectRow}>
                <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={openDropdown}
                    accessibilityRole="button"
                    style={[s.input as any, (s.selectInput as any)]}
                >
                    <Text style={{ color: value ? colors.text : "#999" }}>
                        {displayValue}
                    </Text>
                </TouchableOpacity>
                <View pointerEvents="none" style={s.caretWrap}>
                    <Ionicons name={open ? "chevron-up" : "chevron-down"} size={18} color={colors.maroon} />
                </View>

                {/* WEB: inline panel */}
                {isWeb && open && (
                    <View style={s.categoryContainer}>
                        {displayOptions.map((opt) => (
                            <View key={opt} style={s.categorySection}>
                                <TouchableOpacity
                                    style={s.categoryHeader}
                                    onPress={() => handleCategorySelect(opt)}
                                    activeOpacity={0.8}
                                >
                                    {opt === "Printing" ? (
                                        <Ionicons
                                            name={printingExpanded ? "chevron-down" : "chevron-forward"}
                                            size={16}
                                            color="#8B2323"
                                        />
                                    ) : (
                                        <View style={[s.checkbox, value === opt && s.checkboxSelected]}>
                                            {value === opt && <Ionicons name="checkmark" size={12} color="white" />}
                                        </View>
                                    )}
                                    <Text style={s.categoryTitle}>{opt}</Text>
                                </TouchableOpacity>
                                {opt === "Printing" && printingExpanded && (
                                    <View style={s.categoryContent}>
                                        {/* Size selection */}
                                        <TouchableOpacity
                                            style={s.checkboxContainer}
                                            onPress={() => handlePrintingSizeSelect("A3")}
                                            activeOpacity={0.8}
                                        >
                                            <View style={[s.checkbox, printingSize === "A3" && s.checkboxSelected]}>
                                                {printingSize === "A3" && <Ionicons name="checkmark" size={12} color="white" />}
                                            </View>
                                            <Text style={s.checkboxLabel}>A3</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            style={s.checkboxContainer}
                                            onPress={() => handlePrintingSizeSelect("A4")}
                                            activeOpacity={0.8}
                                        >
                                            <View style={[s.checkbox, printingSize === "A4" && s.checkboxSelected]}>
                                                {printingSize === "A4" && <Ionicons name="checkmark" size={12} color="white" />}
                                            </View>
                                            <Text style={s.checkboxLabel}>A4</Text>
                                        </TouchableOpacity>

                                        {/* Color selection, shown after size is chosen */}
                                        {printingSize ? (
                                            <View style={{ marginTop: 8 }}>
                                                <Text style={[s.checkboxLabel, { marginBottom: 4 }]}>
                                                    Color:
                                                </Text>
                                                <TouchableOpacity
                                                    style={s.checkboxContainer}
                                                    onPress={() => handlePrintingColorSelect("Colored")}
                                                    activeOpacity={0.8}
                                                >
                                                    <View style={[s.checkbox, printingColor === "Colored" && s.checkboxSelected]}>
                                                        {printingColor === "Colored" && (
                                                            <Ionicons name="checkmark" size={12} color="white" />
                                                        )}
                                                    </View>
                                                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                                                        <Text style={s.checkboxLabel}>Colored</Text>
                                                        {printingSize === "A3" ? (
                                                            <Text style={s.printingPrice}>₱25</Text>
                                                        ) : printingSize === "A4" ? (
                                                            <Text style={s.printingPrice}>₱5</Text>
                                                        ) : null}
                                                    </View>
                                                </TouchableOpacity>
                                                <TouchableOpacity
                                                    style={s.checkboxContainer}
                                                    onPress={() => handlePrintingColorSelect("Not Colored")}
                                                    activeOpacity={0.8}
                                                >
                                                    <View style={[s.checkbox, printingColor === "Not Colored" && s.checkboxSelected]}>
                                                        {printingColor === "Not Colored" && (
                                                            <Ionicons name="checkmark" size={12} color="white" />
                                                        )}
                                                    </View>
                                                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                                                        <Text style={s.checkboxLabel}>Not Colored</Text>
                                                        {printingSize === "A3" ? (
                                                            <Text style={s.printingPrice}>₱15</Text>
                                                        ) : printingSize === "A4" ? (
                                                            <Text style={s.printingPrice}>₱2</Text>
                                                        ) : null}
                                                    </View>
                                                </TouchableOpacity>
                                            </View>
                                        ) : null}
                                    </View>
                                )}
                            </View>
                        ))}
                    </View>
                )}
            </View>

            {/* NATIVE: Modal */}
            {!isWeb && open && anchor && (
                <Modal transparent animationType="fade" onRequestClose={closeDropdown} visible>
                    <TouchableWithoutFeedback onPress={closeDropdown}>
                        <View style={s.modalBackdrop} />
                    </TouchableWithoutFeedback>
                    <View
                        pointerEvents="box-none"
                        style={[
                            s.modalRoot,
                            { top: anchor.y + anchor.h, left: anchor.x, width: anchor.w }
                        ]}
                    >
                        <View style={[s.dropdownPanelElevated, { maxHeight: panelMaxH }]}>
                            <ScrollView
                                style={{ maxHeight: panelMaxH }}
                                showsVerticalScrollIndicator
                                keyboardShouldPersistTaps="handled"
                                onStartShouldSetResponderCapture={() => true}
                                nestedScrollEnabled
                                scrollEnabled
                            >
                                <View style={s.categoryContainer}>
                                    {options.map((opt) => (
                                        <View key={opt} style={s.categorySection}>
                                            <TouchableOpacity
                                                style={s.categoryHeader}
                                                onPress={() => handleCategorySelect(opt)}
                                                activeOpacity={0.8}
                                            >
                                                {opt === "Printing" ? (
                                                    <Ionicons
                                                        name={printingExpanded ? "chevron-down" : "chevron-forward"}
                                                        size={16}
                                                        color="#8B2323"
                                                    />
                                                ) : (
                                                    <View style={[s.checkbox, value === opt && s.checkboxSelected]}>
                                                        {value === opt && <Ionicons name="checkmark" size={12} color="white" />}
                                                    </View>
                                                )}
                                                <Text style={s.categoryTitle}>{opt}</Text>
                                            </TouchableOpacity>
                                            {opt === "Printing" && printingExpanded && (
                                                <View style={s.categoryContent}>
                                                    <TouchableOpacity
                                                        style={s.checkboxContainer}
                                                        onPress={() => handlePrintingSizeSelect("A3")}
                                                        activeOpacity={0.8}
                                                    >
                                                        <View style={[s.checkbox, printingSize === "A3" && s.checkboxSelected]}>
                                                            {printingSize === "A3" && <Ionicons name="checkmark" size={12} color="white" />}
                                                        </View>
                                                        <Text style={s.checkboxLabel}>A3</Text>
                                                    </TouchableOpacity>
                                                    <TouchableOpacity
                                                        style={s.checkboxContainer}
                                                        onPress={() => handlePrintingSizeSelect("A4")}
                                                        activeOpacity={0.8}
                                                    >
                                                        <View style={[s.checkbox, printingSize === "A4" && s.checkboxSelected]}>
                                                            {printingSize === "A4" && <Ionicons name="checkmark" size={12} color="white" />}
                                                        </View>
                                                        <Text style={s.checkboxLabel}>A4</Text>
                                                    </TouchableOpacity>
                                                </View>
                                            )}
                                        </View>
                                    ))}
                                </View>
                            </ScrollView>
                        </View>
                    </View>
                </Modal>
            )}
        </>
    );
}


/* Mobile confirm bar and related styles removed */

type ItemRow = { id: string; name: string; qty: string; files?: any[] };

/* ------------------------------------------------------------------ */
/* Success modal (unchanged visuals)                                   */
/* ------------------------------------------------------------------ */
function PostSuccessModal({
    visible,
    onClose,
}: {
    visible: boolean;
    onClose: () => void;
}) {
    if (!visible) return null;
    return (
        <View style={success.fixedOverlay} pointerEvents="auto">
            <View style={success.card} pointerEvents="auto">
                <View style={success.successModalContent}>
                    <View style={success.successIconContainer}>
                        <Ionicons name="checkmark-circle" size={64} color="#10B981" />
                </View>
                    <Text style={success.successModalTitle}>Success</Text>
                    <Text style={success.successModalMessage}>Your errand has been posted.</Text>
                    <TouchableOpacity onPress={onClose} style={success.successModalButton} activeOpacity={0.9}>
                        <Text style={success.successModalButtonText}>OK</Text>
                </TouchableOpacity>
                </View>
            </View>
        </View>
    );
}

const success = StyleSheet.create({
    backdrop: {
        flex: 1,
        backgroundColor: "rgba(0,0,0,0.38)",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
    },
    card: {
        backgroundColor: "#fff",
        borderRadius: 12,
        padding: 24,
        minWidth: 320,
        maxWidth: 400,
        alignItems: "center",
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.25,
        shadowRadius: 8,
        elevation: 8,
    },
    successModalContent: {
        alignItems: "center",
        width: "100%",
    },
    successIconContainer: {
        marginBottom: 16,
    },
    successModalTitle: {
        fontSize: 24,
        fontWeight: "700",
        color: "#10B981",
        marginBottom: 8,
    },
    successModalMessage: {
        fontSize: 16,
        color: "#374151",
        textAlign: "center",
        marginBottom: 24,
        lineHeight: 22,
    },
    successModalButton: {
        backgroundColor: "#8B2323",
        borderRadius: 8,
        paddingVertical: 12,
        paddingHorizontal: 24,
        minWidth: 100,
    },
    successModalButtonText: {
        color: "white",
        fontSize: 16,
        fontWeight: "600",
        textAlign: "center",
    },
    fixedOverlay: {
        position: "fixed" as any,
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
        backgroundColor: "rgba(0,0,0,0.5)",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        zIndex: 9999999,
    },
});


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

// Helper for Printing prices (only when size is A3)
function getPrintingColorPrice(size?: string, color?: string): number {
    if (size === "A3") {
        if (color === "Colored") return 25;
        if (color === "Not Colored") return 15;
    } else if (size === "A4") {
        if (color === "Colored") return 5;
        if (color === "Not Colored") return 2;
    }
    return 0;
}

/* ---------- School Material Dropdown for School Materials category ---------- */
function SchoolMaterialDropdown({
    value,
    onSelect,
    placeholder = "Select material",
}: {
    value: string;
    onSelect: (item: string) => void;
    placeholder?: string;
}) {
    const [open, setOpen] = useState(false);
    const isWeb = Platform.OS === "web";
    const controlRef = useRef<View | null>(null);

    const { anchor, panelMaxH, measure } = useAnchoredPanel(controlRef, open);

    const openDropdown = () => {
        setOpen((prev) => !prev);
        requestAnimationFrame(measure);
    };
    const closeDropdown = () => {
        setOpen(false);
    };

    useEffect(() => {
        if (!isWeb || !open) return;
        const onKey = (e: any) => e.key === "Escape" && closeDropdown();
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [isWeb, open]);

    const renderOption = (opt: { name: string; price: string }) => (
        <TouchableOpacity
            key={opt.name}
            onPress={() => {
                onSelect(opt.name);
                closeDropdown();
            }}
            style={[s.dropdownItem, { borderBottomWidth: 0 }]}
            activeOpacity={0.8}
        >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <View style={[s.checkbox, value === opt.name && s.checkboxSelected]}>
                    {value === opt.name && <Ionicons name="checkmark" size={12} color="white" />}
                </View>
                <View style={{ flex: 1 }}>
                    <Text style={s.checkboxLabel}>{opt.name}</Text>
                    <Text style={s.schoolItemPrice}>{opt.price}</Text>
                </View>
            </View>
        </TouchableOpacity>
    );

    return (
        <>
            <View ref={controlRef} style={s.selectRow}>
                <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={openDropdown}
                    accessibilityRole="button"
                    style={[s.input as any, (s.selectInput as any)]}
                >
                    <Text style={{ color: value ? colors.text : "#999" }}>
                        {value || placeholder}
                    </Text>
                </TouchableOpacity>
                <View pointerEvents="none" style={s.caretWrap}>
                    <Ionicons name={open ? "chevron-up" : "chevron-down"} size={18} color={colors.maroon} />
                </View>
            </View>

            {open && anchor && (
                <Modal transparent animationType="fade" onRequestClose={closeDropdown} visible>
                    <TouchableWithoutFeedback onPress={closeDropdown}>
                        <View style={s.modalBackdrop} />
                    </TouchableWithoutFeedback>
                    <View
                        pointerEvents="box-none"
                        style={[
                            isWeb ? s.modalRootWeb : s.modalRoot,
                            { top: anchor.y + anchor.h, left: anchor.x, width: anchor.w }
                        ]}
                    >
                        <View style={[s.dropdownPanelElevated, { maxHeight: panelMaxH }]}>
                            <ScrollView
                                style={{ maxHeight: panelMaxH }}
                                showsVerticalScrollIndicator
                                keyboardShouldPersistTaps="handled"
                                onStartShouldSetResponderCapture={() => true}
                                nestedScrollEnabled
                                scrollEnabled
                            >
                                {SCHOOL_MATERIALS.map(renderOption)}
                            </ScrollView>
                        </View>
                    </View>
                </Modal>
            )}
        </>
    );
}

function FoodItemDropdown({
    value,
    onSelect,
    placeholder = "Select item",
}: {
    value: string;
    onSelect: (item: string) => void;
    placeholder?: string;
}) {
    const [open, setOpen] = useState(false);
    const [expandedSections, setExpandedSections] = useState<{ [key: string]: boolean }>({
        Canteen: true,
        Drinks: true,
    });

    const controlRef = useRef<View | null>(null);
    const isWeb = Platform.OS === "web";
    const { anchor, panelMaxH, measure } = useAnchoredPanel(controlRef, open);

    const openDropdown = () => {
        setOpen(true);
        requestAnimationFrame(measure);
    };
    const closeDropdown = () => setOpen(false);

    const toggleSection = (sectionName: string) =>
        setExpandedSections((prev) => ({ ...prev, [sectionName]: !prev[sectionName] }));

    const toggleItem = (itemName: string) => {
        onSelect(itemName);
        closeDropdown();
    };

    return (
        <>
            <View style={s.selectRow} ref={controlRef}>
                <TouchableOpacity onPress={openDropdown} style={[s.input, s.selectInput]} activeOpacity={0.8}>
                    <Text style={{ color: value ? "#333" : "#999" }}>{value || placeholder}</Text>
                    <View style={s.caretWrap}>
                        <Ionicons name="chevron-down" size={16} color={colors.maroon} />
                    </View>
                </TouchableOpacity>
            </View>

            {open && anchor && (
                <Modal transparent visible animationType="fade" onRequestClose={closeDropdown}>
                    <TouchableOpacity style={s.modalBackdrop} onPress={closeDropdown} activeOpacity={1} />
                    <View
                        style={[
                            isWeb ? s.modalRootWeb : s.modalRoot,
                            { left: anchor.x, top: anchor.y + anchor.h }
                        ]}
                        pointerEvents="box-none"
                    >
                        <View
                            style={[
                                s.foodDropdownPanel,
                                { width: anchor.w, maxHeight: panelMaxH }
                            ]}
                        >
                            <ScrollView
                                style={{ maxHeight: panelMaxH }}
                                showsVerticalScrollIndicator
                                keyboardShouldPersistTaps="handled"
                                onStartShouldSetResponderCapture={() => true}
                                nestedScrollEnabled
                                scrollEnabled
                            >
                                {Object.entries(FOOD_ITEMS).map(([category, items]) => (
                                    <View key={category} style={s.foodSection}>
                                        <TouchableOpacity style={s.foodSectionHeader} onPress={() => toggleSection(category)}>
                                            <View style={s.foodSection}>
                                                <Text style={s.foodSectionText}>{category}</Text>
                                            </View>
                                            <Ionicons
                                                name={expandedSections[category] ? "chevron-down" : "chevron-forward"}
                                                size={16}
                                                color={colors.maroon}
                                            />
                                        </TouchableOpacity>

                                        {expandedSections[category] && (
                                            <View style={s.foodSectionContent}>
                                                {items.map((item, idx) => (
                                                    <TouchableOpacity key={idx} style={s.foodItemRow} onPress={() => toggleItem(item.name)}>
                                                        <View style={s.foodCheckbox}>
                                                            {value === item.name && <Ionicons name="checkmark" size={12} color="white" />}
                                                        </View>
                                                        <View style={s.foodItemInfo}>
                                                            <Text style={s.foodItemName}>{item.name}</Text>
                                                            <Text style={s.foodItemPrice}>{item.price}</Text>
                                                        </View>
                                                    </TouchableOpacity>
                                                ))}
                                            </View>
                                        )}
                                    </View>
                                ))}
                            </ScrollView>
                        </View>
                    </View>
                </Modal>
            )}
        </>
    );
}

/* ---------- File Upload Component for Printing category ---------- */
function FileUpload({
    files,
    onFilesChange,
    onFilePicked,
    onFilePress,
}: {
    files: any[];
    onFilesChange: (files: any[]) => void;
    onFilePicked?: (displayName: string) => void;
    onFilePress?: (file: any) => void;
}) {
    const isWeb = Platform.OS === "web";
    const pickDocument = async () => {
        try {
            const result = await DocumentPicker.getDocumentAsync({
                type: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
                multiple: false, // Only allow single file selection
                copyToCacheDirectory: true,
            });

            if (!result.canceled && result.assets && result.assets.length > 0) {
                const asset: any = result.assets[0];
                onFilesChange([asset]);
                const displayName = asset?.name || asset?.fileName || "Selected file";
                onFilePicked?.(displayName);
            }
        } catch (error) {
            console.error('Error picking documents:', error);
            Alert.alert('Error', 'Failed to pick documents');
        }
    };

    const pickImage = async () => {
        try {
            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.Images,
                allowsMultipleSelection: false, // Only allow single image selection
                quality: 0.8,
                base64: false,
            });

            if (!result.canceled && result.assets && result.assets.length > 0) {
                const asset: any = result.assets[0];
                onFilesChange([asset]);
                const displayName = asset?.name || asset?.fileName || `Image ${1}`;
                onFilePicked?.(displayName);
            }
        } catch (error) {
            console.error('Error picking images:', error);
            Alert.alert('Error', 'Failed to pick images');
        }
    };

    const showPickerOptions = () => {
        // If a file is already selected, don't reopen
        if (files.length > 0) return;
        if (isWeb) {
            // On web, open a single chooser that also accepts images
            (async () => {
                try {
                    const result = await DocumentPicker.getDocumentAsync({
                        type: ['image/*', 'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
                        multiple: false,
                        copyToCacheDirectory: true,
                    });
                    if (!result.canceled && result.assets && result.assets.length > 0) {
                        const asset: any = result.assets[0];
                        onFilesChange([asset]);
                        const displayName = asset?.name || asset?.fileName || 'Selected file';
                        onFilePicked?.(displayName);
                    }
                } catch (error) {
                    console.error('Error picking on web:', error);
                }
            })();
            return;
        }
        // Native: let users choose document or image source
        Alert.alert(
            'Select File',
            'Choose what type of file you want to upload',
            [
                { text: 'Document (PDF, Word)', onPress: pickDocument },
                { text: 'Image', onPress: pickImage },
                { text: 'Cancel', style: 'cancel' }
            ]
        );
    };

    const removeFile = (index: number) => {
        const newFiles = files.filter((_, i) => i !== index);
        onFilesChange(newFiles);
    };

    return (
        <View style={{ flex: 1, marginRight: 8 }}>
            {files.length === 0 && (
                <TouchableOpacity
                    style={[s.fileUploadButton, { width: '100%' }]}
                    onPress={showPickerOptions}
                    activeOpacity={0.8}
                >
                    <Ionicons name="cloud-upload-outline" size={20} color={colors.maroon} />
                    <Text style={s.fileUploadText}>Select file to print</Text>
                    <Ionicons name="chevron-down" size={16} color={colors.maroon} />
                </TouchableOpacity>
            )}

            {files.length > 0 && (
                <View style={s.fileList}>
                    {files.slice(0, 1).map((file, index) => {
                        const isImage = (file as any)?.type === 'image' || (file as any)?.mimeType?.startsWith?.('image/');
                        const isDocument = !!(file as any)?.mimeType && !(file as any)?.mimeType?.startsWith?.('image/');
                        const fileName = isImage ? ((file as any)?.fileName || (file as any)?.name || `Image ${index + 1}`) : ((file as any)?.name || `File ${index + 1}`);

                        return (
                            <View key={index} style={s.fileItem}>
                                <TouchableOpacity
                                    style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 6 }}
                                    activeOpacity={0.8}
                                    onPress={() => onFilePress?.(file)}
                                >
                                    <Ionicons
                                        name={isImage ? "image-outline" :
                                            (isDocument && file.mimeType?.includes('pdf')) ? "document-text-outline" :
                                                "document-outline"}
                                        size={16}
                                        color={colors.maroon}
                                    />
                                    <Text style={s.fileName} numberOfLines={1}>
                                        {fileName}
                                    </Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={s.removeFileBtn}
                                    onPress={() => removeFile(index)}
                                >
                                    <Ionicons name="close" size={14} color={colors.maroon} />
                                </TouchableOpacity>
                            </View>
                        );
                    })}
                </View>
            )}
        </View>
    );
}

/* ------------------------------------------------------------------ */

export default function ErrandForm() {
    const router = useRouter();
    const isWeb = Platform.OS === "web";

    const [step, setStep] = useState<"FORM" | "SUMMARY">("FORM");
    const [showTerms, setShowTerms] = useState(false);
    const [agree, setAgree] = useState(false);

    const [title, setTitle] = useState("");
    const [desc, setDesc] = useState("");
    const [category, setCategory] = useState<string>("");
    const [printingSize, setPrintingSize] = useState<string>(""); // A3 or A4
    const [printingColor, setPrintingColor] = useState<string>(""); // Colored or Not Colored
    const [items, setItems] = useState<ItemRow[]>([{ id: "0", name: "", qty: "" }]);
    const [estPrice, setEstPrice] = useState("");
    const [printingFiles, setPrintingFiles] = useState<Record<string, any[]>>({});
    const [campusLocations, setCampusLocations] = useState<CampusLocation[]>([]);
    const [categoryOptions, setCategoryOptions] = useState<string[]>([]);
    const [deliveryLocationName, setDeliveryLocationName] = useState<string>("");

    const [isScheduled, setIsScheduled] = useState(false);
    const [scheduledTime, setScheduledTime] = useState("00:00");
    const [timePicked, setTimePicked] = useState(false);
    const [showTimePicker, setShowTimePicker] = useState(false);
    const [hour, setHour] = useState(12);
    const [minute, setMinute] = useState(0);
    const [period, setPeriod] = useState<"AM" | "PM">("PM");

    const [posting, setPosting] = useState(false);
    const [successOpen, setSuccessOpen] = useState(false);

    // location confirmation & posting state
    const [showLocationConfirm, setShowLocationConfirm] = useState(false);
    const [savingLocationAndPosting, setSavingLocationAndPosting] = useState(false);

    // printing file preview (shared for form + summary)
    const [previewFile, setPreviewFile] = useState<any | null>(null);
    const [previewVisible, setPreviewVisible] = useState(false);

    const isPrintingCategory = category?.startsWith("Printing");

    const openFilePreview = (file: any) => {
        setPreviewFile(file);
        setPreviewVisible(true);
    };

    const closeFilePreview = () => {
        setPreviewVisible(false);
        setPreviewFile(null);
    };
    const [showLocationPermissionModal, setShowLocationPermissionModal] = useState(false);

    // fetch errand categories from database - fetch when component mounts (modal opens)
    useEffect(() => {
        const fetchCategories = async () => {
            try {
                const { data, error } = await supabase
                    .from("errand_categories")
                    .select("code, name")
                    .eq("is_active", true)
                    .order("order");
                
                if (error) {
                    throw error;
                }
                
                if (data && Array.isArray(data)) {
                    const categoryNames = data.map((cat: { code: string; name: string }) => cat.name);
                    setCategoryOptions(categoryNames);
                } else {
                    setCategoryOptions([]);
                }
            } catch (err) {
                console.error("Error fetching errand categories:", err);
                setCategoryOptions([]);
            }
        };
        fetchCategories();
    }, []);

    // fetch campus delivery locations once
    useEffect(() => {
        const fetchLocations = async () => {
            try {
                const { data, error } = await supabase
                    .from("campus_locations")
                    .select("id, name, latitude, longitude")
                    .order("name", { ascending: true } as any);
                if (error) {
                    console.error("Error loading campus locations:", error);
                    return;
                }
                setCampusLocations((data ?? []) as CampusLocation[]);
            } catch (err) {
                console.error("Unexpected error loading campus locations:", err);
            }
        };
        fetchLocations();
    }, []);

    // Web-only helpers to prevent selecting a past time
    const toMinutes = (h: number, m: number, p: "AM" | "PM") => {
        let h24 = h % 12;
        if (p === "PM") h24 += 12;
        return h24 * 60 + m;
    };
    const nowMinutes = () => {
        const now = new Date();
        return now.getHours() * 60 + now.getMinutes();
    };
    const isHourDisabled = (h: number, p: "AM" | "PM") => {
        if (Platform.OS !== "web") return false;
        return toMinutes(h, 59, p) < nowMinutes();
    };
    const isMinuteDisabled = (h: number, m: number, p: "AM" | "PM") => {
        if (Platform.OS !== "web") return false;
        return toMinutes(h, m, p) < nowMinutes();
    };
    const normalizeSelectionToFuture = () => {
        if (Platform.OS !== "web") return;
        const selected = toMinutes(hour, minute, period);
        const cur = nowMinutes();
        if (selected <= cur) {
            const d = new Date();
            d.setMinutes(d.getMinutes() + 1);
            const h24 = d.getHours();
            const m = d.getMinutes();
            const p: "AM" | "PM" = h24 >= 12 ? "PM" : "AM";
            const h12 = (h24 % 12) === 0 ? 12 : (h24 % 12);
            setPeriod(p);
            setHour(h12);
            setMinute(m);
            setScheduledTime(`${h12}:${String(m).padStart(2, "0")} ${p}`);
            setTimePicked(true);
        }
    };

    useEffect(() => {
        if (Platform.OS !== "web") return;
        const id = "errand-scrollbar-style-hidden";
        if (document.getElementById(id)) return;
        const style = document.createElement("style");
        style.id = id;
        style.innerHTML =
            `[data-errandscroll="1"]{scrollbar-width:none!important;-ms-overflow-style:none!important}` +
            `[data-errandscroll="1"]::-webkit-scrollbar{width:0!important;height:0!important}`;
        document.head.appendChild(style);
    }, []);

    const Wrapper: React.ComponentType<any> = useMemo(() => {
        const WebWrapper = ({ children }: any) => (
            <View style={s.webOverlay}>
                <View style={s.webCard}>{children}</View>
            </View>
        );
        WebWrapper.displayName = "WebWrapper";
        return WebWrapper;
    }, []);

    const close = () => router.back();

    const addItem = () =>
        setItems((p) => [...p, { id: String(Date.now() + Math.random()), name: "", qty: "" }]);
    const updateItem = (id: string, patch: Partial<ItemRow>) =>
        setItems((p) => p.map((it) => (it.id === id ? { ...it, ...patch } : it)));
    const removeItem = (id: string) => {
        setItems((p) => p.filter((it) => it.id !== id));
        setPrintingFiles((prev) => {
            const next = { ...prev } as Record<string, any[]>;
            delete next[id];
            return next;
        });
    };
    const setItemFiles = (id: string, files: any[]) => {
        setPrintingFiles((prev) => ({ ...prev, [id]: files }));
        // Mirror files onto the corresponding item (aligns with mobile logic)
        setItems((prev) => prev.map((it) => (it.id === id ? { ...it, files } : it)));
    };

    // Calculate price breakdown
    const priceBreakdown = useMemo(() => {
        const itemRows: Array<{ name: string; qty: number; price: number; total: number }> = [];
        let subtotal = 0;

        // Calculate item prices for all categories (Food Delivery has prices, Printing uses size/color pricing)
        items.forEach((item) => {
            if (item.name && item.qty) {
                let itemPrice = 0;
                if (category === "Printing") {
                    itemPrice = getPrintingColorPrice(printingSize, printingColor);
                } else {
                    itemPrice = parseItemPrice(item.name); // Returns 0 if no price found
                }
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
    }, [items, category, printingSize, printingColor]);

    const applyTime = (h: number, m: number, p: "AM" | "PM") => {
        setScheduledTime(`${h}:${String(m).padStart(2, "0")} ${p}`);
        setTimePicked(true);
    };
    const selectHour = (h: number) => {
        setHour(h);
        applyTime(h, minute, period);
    };
    const selectMinute = (m: number) => {
        setMinute(m);
        applyTime(hour, m, period);
    };
    const selectPeriod = (p: "AM" | "PM") => {
        setPeriod(p);
        applyTime(hour, minute, p);
    };

    const handleSubmit = () => {
        if (!title.trim()) { Alert.alert("Missing Information", "Please enter an errand title."); return; }
        if (!desc.trim()) { Alert.alert("Missing Information", "Please enter an errand description."); return; }
        if (!category) { Alert.alert("Missing Information", "Please select a category."); return; }
        // Prevent proceeding if any item is missing quantity (mobile parity)
        const itemsWithoutQuantity = items.filter((item) => !item.qty || item.qty.trim() === "");
        if (itemsWithoutQuantity.length > 0) {
            Alert.alert("Missing Information", "Please fill in the quantity for all items before proceeding.");
            return;
        }
        setStep("SUMMARY");
    };

    /**
     * Single-shot caller location capture for web using the browser Geolocation API.
     * Updates public.users (latitude, longitude, location_updated_at).
     */
    const captureAndSaveCallerLocation = async (): Promise<boolean> => {
        try {
            if (typeof navigator === "undefined" || !navigator.geolocation) {
                setShowLocationPermissionModal(true);
                return false;
            }

            const getPosition = () =>
                new Promise<GeolocationPosition>((resolve, reject) => {
                    navigator.geolocation.getCurrentPosition(
                        (pos) => resolve(pos),
                        (err) => reject(err),
                        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
                    );
                });

            const position = await getPosition();

            const { data: userData, error: getUserErr } = await supabase.auth.getUser();
            if (getUserErr) {
                console.error("Error getting user for location update (web):", getUserErr);
                setShowLocationPermissionModal(true);
                return false;
            }
            const user = userData?.user;
            if (!user) {
                Alert.alert("Not signed in", "Please log in first.");
                return false;
            }

            const { latitude, longitude } = position.coords;

            const { error: updateErr } = await supabase
                .from("users")
                .update({
                    latitude,
                    longitude,
                    location_updated_at: new Date().toISOString(),
                })
                .eq("id", user.id);

            if (updateErr) {
                console.error("Error updating user location (web):", updateErr);
                setShowLocationPermissionModal(true);
                return false;
            }

            return true;
        } catch (e: any) {
            console.error("captureAndSaveCallerLocation (web) error:", e);
            // Most commonly permission denied or timeout – surface permission-required modal
            setShowLocationPermissionModal(true);
            return false;
        }
    };

    const openLocationConfirmModal = () => {
        setShowLocationConfirm(true);
    };

    const handleCancelLocationConfirm = () => {
        if (savingLocationAndPosting) return;
        setShowLocationConfirm(false);
    };

    /**
     * Existing errand creation logic (no GPS side effects).
     */
    const confirmErrand = async () => {
        try {
            if (posting) return;
            if (!agree) {
                Alert.alert("Error", "Please agree to Terms and Conditions.");
                return;
            }
            setPosting(true);

            // Web: block submitting a past time
            if (Platform.OS === "web" && isScheduled) {
                const composed = timePicked ? scheduledTime : `${hour}:${String(minute).padStart(2, "0")} ${period}`;
                const m = /^(\d{1,2}):(\d{2})\s?(AM|PM)$/i.exec(composed);
                if (m) {
                    const h12 = parseInt(m[1], 10);
                    const mm = parseInt(m[2], 10);
                    const pp = (m[3].toUpperCase() as "AM" | "PM");
                    if (toMinutes(h12, mm, pp) <= nowMinutes()) {
                        Alert.alert("Invalid Time", "Please select a future time for the errand.");
                        setPosting(false);
                        return;
                    }
                }
            }

            // Validate that all items have quantities
            const itemsWithoutQuantity = items.filter((item) => !item.qty || item.qty.trim() === "");
            if (itemsWithoutQuantity.length > 0) {
                Alert.alert("Missing Information", "Please fill in the quantity for all items before proceeding.");
                return;
            }

            const { data: userData, error: getUserErr } = await supabase.auth.getUser();
            if (getUserErr) throw getUserErr;
            const user = userData?.user;
            if (!user) {
                Alert.alert("Not signed in", "Please log in first.");
                return;
            }

            // Require campus delivery destination when Deliver Items is selected
            let selectedDeliveryLocation: CampusLocation | undefined;
            if (category === "Deliver Items") {
                if (!deliveryLocationName) {
                    Alert.alert("Missing Information", "Please select a Delivery Destination.");
                    setPosting(false);
                    return;
                }
                selectedDeliveryLocation = campusLocations.find((loc) => loc.name === deliveryLocationName);
                if (!selectedDeliveryLocation) {
                    Alert.alert("Invalid Location", "The selected Delivery Destination is not available. Please choose again.");
                    setPosting(false);
                    return;
                }
            }

            // Prepare items data (name and qty only)
            const itemsData = items.map((item) => ({ id: item.id, name: item.name, qty: item.qty }));

            // Upload files for Printing category
            const allFiles: Array<{ fileName: string; fileUri: string }> = [];
            const fileCounter: Record<string, number> = {};

            if (isPrintingCategory) {
                for (const item of items) {
                    const filesForItem = (item.files && item.files.length ? item.files : ((printingFiles as Record<string, any[]>)[item.id] || []));
                    for (const file of filesForItem) {
                        try {
                            const originalFileName = file?.name || file?.fileName || `Upload_${Date.now()}`;

                            // Ensure unique file names
                            let storageFileName = originalFileName;
                            if (fileCounter[originalFileName]) {
                                fileCounter[originalFileName] += 1;
                                const ext = originalFileName.includes(".") ? originalFileName.split(".").pop() : undefined;
                                const base = ext ? originalFileName.slice(0, -(ext.length + 1)) : originalFileName;
                                storageFileName = ext ? `${base}_${fileCounter[originalFileName]}.${ext}` : `${base}_${fileCounter[originalFileName]}`;
                            } else {
                                fileCounter[originalFileName] = 1;
                                const ext = originalFileName.includes(".") ? originalFileName.split(".").pop() : undefined;
                                const base = ext ? originalFileName.slice(0, -(ext.length + 1)) : originalFileName;
                                storageFileName = ext ? `${base}_${Date.now()}.${ext}` : `${base}_${Date.now()}`;
                            }

                            const uploadUri: string = file?.uri;
                            const uploadMime: string | undefined = file?.mimeType;

                            const response = await fetch(uploadUri);
                            const arrayBuffer = await response.arrayBuffer();

                            const { data: uploadData, error: uploadError } = await supabase.storage
                                .from("errand-files")
                                .upload(`errands/${user.id}/${storageFileName}`, arrayBuffer, {
                                    contentType: uploadMime || "application/octet-stream",
                                    upsert: true,
                                });

                            if (uploadError) {
                                console.error("File upload error:", uploadError);
                                Alert.alert("Storage Error", `Failed to upload file: ${uploadError.message}. Please make sure the storage bucket exists.`);
                                return;
                            }

                            const { data: { publicUrl } } = supabase.storage
                                .from("errand-files")
                                .getPublicUrl(uploadData.path);

                            allFiles.push({ fileName: storageFileName, fileUri: publicUrl });
                        } catch (error: any) {
                            console.error("Error uploading file:", error);
                            Alert.alert("Upload Error", `Failed to upload file: ${error?.message || "Unknown error"}`);
                            return;
                        }
                    }
                }
            }

            const payload: any = {
                buddycaller_id: user.id,
                title: title.trim(),
                description: desc.trim(),
                category,
                status: "pending",
                items: itemsData,
                files: allFiles,
                is_scheduled: isScheduled,
                scheduled_time: isScheduled ? (timePicked ? scheduledTime : "00:00") : null,
                scheduled_date: isScheduled ? new Date().toISOString().split("T")[0] : null,
            };

            // Set pickup_status based on category
            if (category === "Deliver Items") {
                payload.pickup_status = 'pending';
                payload.pickup_photo = null;
                payload.pickup_confirmed_at = null;
            } else {
                payload.pickup_status = null;
                payload.pickup_photo = null;
                payload.pickup_confirmed_at = null;
            }

            // For Deliver Items, attach campus delivery destination to errand
            if (category === "Deliver Items" && selectedDeliveryLocation) {
                payload.delivery_location_id = selectedDeliveryLocation.id;
                payload.delivery_latitude = selectedDeliveryLocation.latitude;
                payload.delivery_longitude = selectedDeliveryLocation.longitude;
            }

            // Use calculated total (subtotal + delivery fee + service fee) as the canonical amount
            if (priceBreakdown.total > 0) {
                payload.amount_price = priceBreakdown.total;
            }

            const { error: insertError } = await supabase.from("errand").insert([payload]);
            if (insertError) throw insertError;

            setSuccessOpen(true);
        } catch (e: any) {
            console.error("confirmErrand error:", e);
            Alert.alert("Error", `Failed to submit errand: ${e?.message || "Unknown error"}`);
        } finally {
            setPosting(false);
        }
    };

    /**
     * Wrapper when caller taps "Yes, Confirm" in the location modal on web:
     * 1) Capture GPS once with browser geolocation
     * 2) Update users table
     * 3) Post errand via confirmErrand
     */
    const handleConfirmLocationAndPost = async () => {
        if (savingLocationAndPosting) return;
        setSavingLocationAndPosting(true);
        try {
            const ok = await captureAndSaveCallerLocation();
            if (!ok) return;
            await confirmErrand();
        } finally {
            setSavingLocationAndPosting(false);
            setShowLocationConfirm(false);
        }
    };

    const TermsModal = () => (
        <View style={terms.overlay}>
            <View style={s.webCard}>
                <View style={s.cardBody}>
                    <View style={s.headerRow}>
                        <Text style={s.headerText}>Terms and Conditions</Text>
                        <TouchableOpacity 
                            onPress={() => {
                                setShowTerms(false);
                                setStep("FORM");
                                router.replace('/buddycaller/home');
                            }} 
                            accessibilityRole="button"
                        >
                            <Text style={s.closeX}>X</Text>
                        </TouchableOpacity>
                    </View>

                    <ScrollView
                        style={{ flex: 1 }}
                        contentContainerStyle={{ paddingHorizontal: 4, paddingBottom: 12 }}
                        showsVerticalScrollIndicator={false}
                        {...(Platform.OS === "web" ? ({ "data-errandscroll": "1" } as any) : {})}
                    >
                        <Text style={terms.sectionTitle}>1. Acceptance of Terms</Text>
                        <Text style={terms.bodyText}>
                            By using GoBuddy's services, you agree to be bound by these Terms and Conditions. If you do not agree to these terms, please do not use our services.
                        </Text>
                        
                        <Text style={terms.sectionTitle}>2. Service Description</Text>
                        <Text style={terms.bodyText}>
                            GoBuddy is a platform that connects users with service providers for various commission-based tasks. We facilitate the connection but are not responsible for the quality or completion of services provided by third parties.
                        </Text>
                        
                        <Text style={terms.sectionTitle}>3. User Responsibilities</Text>
                        <Text style={terms.bodyText}>
                            Users are responsible for:{'\n'}• Providing accurate and complete information{'\n'}• Communicating clearly with service providers{'\n'}• Paying for services as agreed{'\n'}• Following all applicable laws and regulations
                        </Text>
                        
                        <Text style={terms.sectionTitle}>4. Payment Terms</Text>
                        <Text style={terms.bodyText}>
                            All payments must be made through our secure payment system. GoBuddy reserves the right to hold funds until service completion. Refunds are subject to our refund policy.
                        </Text>
                        
                        <Text style={terms.sectionTitle}>5. Service Provider Responsibilities</Text>
                        <Text style={terms.bodyText}>
                            Service providers must:{'\n'}• Complete services as described{'\n'}• Maintain professional standards{'\n'}• Communicate promptly with clients{'\n'}• Comply with all applicable laws
                        </Text>
                        
                        <Text style={terms.sectionTitle}>6. Limitation of Liability</Text>
                        <Text style={terms.bodyText}>
                            GoBuddy shall not be liable for any indirect, incidental, special, or consequential damages arising from the use of our services. Our total liability shall not exceed the amount paid for the specific service.
                        </Text>
                        
                        <Text style={terms.sectionTitle}>7. Privacy Policy</Text>
                        <Text style={terms.bodyText}>
                            We collect and use your personal information in accordance with our Privacy Policy. By using our services, you consent to the collection and use of your information as described in our Privacy Policy.
                        </Text>
                        
                        <Text style={terms.sectionTitle}>8. Termination</Text>
                        <Text style={terms.bodyText}>
                            We may terminate or suspend your account at any time for violation of these terms. You may also terminate your account at any time by contacting our support team.
                        </Text>
                        
                        <Text style={terms.sectionTitle}>9. Changes to Terms</Text>
                        <Text style={terms.bodyText}>
                            We reserve the right to modify these terms at any time. Changes will be effective immediately upon posting. Continued use of our services constitutes acceptance of the modified terms.
                        </Text>
                        
                        <Text style={terms.sectionTitle}>10. Contact Information</Text>
                        <Text style={terms.bodyText}>
                            If you have any questions about these Terms and Conditions, please contact us at support@gobuddy.com or call us at (555) 123-4567.
                        </Text>
                        
                        <Text style={terms.lastUpdated}>Last updated: January 2025</Text>
                    </ScrollView>

                    <View style={s.actionsRow}>
                        <TouchableOpacity style={s.goBackButton} onPress={() => setShowTerms(false)}>
                            <Text style={s.goBackText}>Cancel</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={s.primaryBtn}
                            onPress={() => {
                                setAgree(true);
                                setShowTerms(false);
                            }}
                        >
                            <Text style={s.primaryBtnText}>Agree</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </View>
    );

    /* ---------------------------- SUMMARY ---------------------------- */
    if (step === "SUMMARY") {
        // Web-only summary view
        return (
            <View style={s.webOverlay}>
                <View style={s.webCard}>
                    <View style={s.cardBody}>
                        <View style={s.headerRow}>
                            <Text style={s.headerText}>Errand Request Summary</Text>
                            <TouchableOpacity onPress={() => router.back()} accessibilityRole="button">
                                <Text style={s.closeX}>X</Text>
                            </TouchableOpacity>
                        </View>

                        <ScrollView
                            style={{ flex: 1 }}
                            contentContainerStyle={{ padding: 12, paddingBottom: 16 }}
                            showsVerticalScrollIndicator={false}
                            {...({ "data-errandscroll": "1" } as any)}
                        >
                            <View style={s.summaryCard}>
                                <View style={s.summaryList}>
                                    <Text style={s.summaryLine}><Text style={s.summaryLabel}>Errand Title:</Text> {title || "—"}</Text>
                                    <Text style={s.summaryLine}><Text style={s.summaryLabel}>Errand Description:</Text> {desc || "—"}</Text>
                                    <Text style={s.summaryLine}>
                                        <Text style={s.summaryLabel}>Errand Type:</Text>{" "}
                                        {isPrintingCategory && printingSize
                                            ? `Printing-${printingSize}${printingColor ? `-${printingColor}` : ""}`
                                            : category || "—"}
                                    </Text>

                                    <Text style={[s.summaryLine, { marginBottom: 4 }]}><Text style={s.summaryLabel}>Items:</Text></Text>
                                    {items.map((it) => {
                                        const printingFilesForItem = printingFiles[it.id] || [];
                                        if (isPrintingCategory && printingFilesForItem.length > 0) {
                                            return printingFilesForItem.map((file, index) => {
                                                const anyFile: any = file;
                                                const isImage =
                                                    anyFile?.type === "image" ||
                                                    anyFile?.mimeType?.startsWith?.("image/");
                                                const fileName = isImage
                                                    ? anyFile?.fileName || anyFile?.name || `Image ${index + 1}`
                                                    : anyFile?.name || `File ${index + 1}`;
                                                return (
                                                    <Text
                                                        key={`${it.id}-${index}`}
                                                        style={[s.summaryBullet, { textDecorationLine: "underline" }]}
                                                        onPress={() => openFilePreview(file)}
                                                    >
                                                        • {fileName} {it.qty ? `(${it.qty})` : ""}
                                                    </Text>
                                                );
                                            });
                                        }
                                        return (
                                            <Text key={it.id} style={s.summaryBullet}>
                                                • {it.name || "—"} {it.qty ? `(${it.qty})` : ""}
                                            </Text>
                                        );
                                    })}

                                    {isScheduled && (
                                        <Text style={[s.summaryLine, { marginTop: 6 }]}>
                                            <Text style={s.summaryLabel}>Completion Time:</Text> {scheduledTime || "—"}
                                        </Text>
                                    )}

                                    <Text style={[s.summaryLine, { marginTop: 6, marginBottom: 4 }]}>
                                        <Text style={s.summaryLabel}>Price Breakdown:</Text>
                                    </Text>
                                    <View style={[s.priceBreakdownContainer, { marginTop: 4, marginBottom: 0 }]}>
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

                                        {/* Service Fee (incl. VAT) */}
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

                                <TouchableOpacity style={s.termsRow} onPress={() => {
                                        if (!agree) {
                                            setShowTerms(true);
                                        } else {
                                            setAgree(false);
                                        }
                                }}>
                                    <View style={[s.checkbox, agree && s.checkboxSelected]}>
                                        {agree && <Ionicons name="checkmark" size={12} color="white" />}
                                    </View>
                                    <Text style={s.termsText}>I agree to the Terms and Conditions</Text>
                                </TouchableOpacity>
                            </View>

                        <View style={s.actionsRow}>
                            <TouchableOpacity style={s.goBackButton} onPress={() => setStep("FORM")}>
                                <Text style={s.goBackText}>Go Back</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={s.primaryBtn}
                                onPress={openLocationConfirmModal}
                                activeOpacity={0.8}
                                disabled={posting || savingLocationAndPosting}
                            >
                                <Text style={s.primaryBtnText}>
                                    {posting || savingLocationAndPosting ? "Posting..." : "Confirm"}
                                </Text>
                            </TouchableOpacity>
                        </View>
                        </ScrollView>
                    </View>
                </View>

                {showTerms && <TermsModal />}

                {/* Caller Location Confirmation Modal (web summary) */}
                {showLocationConfirm && (
                    <View style={locationModal.overlay}>
                        <View style={locationModal.card}>
                            <Text style={locationModal.title}>Confirm Your Location</Text>
                            <Text style={locationModal.message}>
                                Your current location right now will be used as the delivery location for this errand.
                            </Text>
                            <Text style={[locationModal.message, { marginTop: 6 }]}>
                                If you move to another place after posting, the runner will still go to this location.
                            </Text>
                            <Text style={[locationModal.message, { marginTop: 6, fontWeight: "600" }]}>
                                Do you want to continue?
                            </Text>

                            <View style={locationModal.actions}>
                                <TouchableOpacity
                                    style={locationModal.cancelButton}
                                    onPress={handleCancelLocationConfirm}
                                    disabled={savingLocationAndPosting}
                                >
                                    <Text style={locationModal.cancelText}>Cancel</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={locationModal.confirmButton}
                                    onPress={handleConfirmLocationAndPost}
                                    disabled={savingLocationAndPosting}
                                >
                                    <Text style={locationModal.confirmText}>
                                        {savingLocationAndPosting ? "Posting..." : "Yes, Confirm"}
                                    </Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    </View>
                )}

                {/* Location permission required modal (web) */}
                {showLocationPermissionModal && (
                    <View style={locationModal.overlay}>
                        <View style={locationModal.card}>
                            <Text style={locationModal.title}>Location Required</Text>
                            <Text style={locationModal.message}>
                                We need your location to post this errand.
                            </Text>
                            <Text style={[locationModal.message, { marginTop: 6 }]}>
                                Please enable location services and try again.
                            </Text>

                            <View style={locationModal.actions}>
                                <TouchableOpacity
                                    style={locationModal.cancelButton}
                                    onPress={() => setShowLocationPermissionModal(false)}
                                >
                                    <Text style={locationModal.cancelText}>Cancel</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={locationModal.confirmButton}
                                    onPress={() => {
                                        setShowLocationPermissionModal(false);
                                        // Retry only reruns the location + post flow; user already confirmed once.
                                        handleConfirmLocationAndPost();
                                    }}
                                >
                                    <Text style={locationModal.confirmText}>Retry</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    </View>
                )}

                <PostSuccessModal
                    visible={successOpen}
                    onClose={() => {
                        setSuccessOpen(false);
                        router.replace("/buddycaller/home?refresh=1");
                    }}
                />

                {/* Fullscreen file preview for Printing items */}
                {previewFile && (
                    <Modal
                        visible={previewVisible}
                        transparent
                        animationType="fade"
                        onRequestClose={closeFilePreview}
                    >
                        <View style={s.previewOverlay}>
                            <View style={s.previewContent}>
                                <View style={s.previewHeader}>
                                    <Text style={s.previewTitle}>File Preview</Text>
                                    <TouchableOpacity onPress={closeFilePreview}>
                                        <Text style={s.previewCloseX}>X</Text>
                                    </TouchableOpacity>
                                </View>
                                <View style={s.previewBody}>
                                    {(() => {
                                        const anyFile: any = previewFile;
                                        const isImage =
                                            anyFile?.type === "image" ||
                                            anyFile?.mimeType?.startsWith?.("image/");
                                        if (isImage) {
                                            return (
                                                // For web, Image is rendered via react-native-web
                                                <View style={{ width: "100%", height: 420 }}>
                                                    {/* @ts-ignore: web image element */}
                                                    <img
                                                        src={anyFile.uri}
                                                        style={{ width: "100%", height: "100%", objectFit: "contain", borderRadius: 4 }}
                                                    />
                                                </View>
                                            );
                                        }
                                        // Documents – render in an iframe on web so user can read
                                        if (Platform.OS === "web" && anyFile?.uri) {
                                            return (
                                                <View style={{ width: "100%", height: 460 }}>
                                                    {/* @ts-ignore: iframe allowed on web */}
                                                    <iframe
                                                        src={anyFile.uri}
                                                        style={{ width: "100%", height: "100%", border: "none", borderRadius: 4 }}
                                                    />
                                                </View>
                                            );
                                        }
                                        return null;
                                    })()}
                                </View>
                            </View>
                        </View>
                    </Modal>
                )}
            </View>
        );
    }

    /* ----------------------------- FORM ----------------------------- */
    return (
        <Wrapper>
            <View style={s.cardBody}>
                <View style={s.headerRow}>
                    <Text style={s.headerText}>Post an Errand</Text>
                    <TouchableOpacity onPress={close} accessibilityRole="button">
                        <Text style={s.closeX}>X</Text>
                    </TouchableOpacity>
                </View>

                <ScrollView
                    style={{ flex: 1 }}
                    contentContainerStyle={s.formAreaWeb}
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                    {...({ "data-errandscroll": "1" } as any)}
                >
                    <View style={s.formGroup}>
                        <Text style={s.label}>Errand Title:</Text>
                        <TextInput
                            placeholder="Enter errand title"
                            value={title}
                            onChangeText={setTitle}
                            style={s.input}
                            placeholderTextColor="#B8860B"
                        />
                    </View>

                    <View style={s.formGroup}>
                        <Text style={s.label}>Errand Description:</Text>
                        <TextInput
                            placeholder="Enter errand description"
                            multiline
                            value={desc}
                            onChangeText={setDesc}
                            style={[s.input, s.textArea]}
                            placeholderTextColor="#B8860B"
                            numberOfLines={4}
                            textAlignVertical="top"
                        />
                    </View>

                    <View style={s.formGroup}>
                        <Text style={s.label}>Category:</Text>
                        <CategoryDropdown
                            value={category}
                            printingSize={printingSize}
                            printingColor={printingColor}
                            onSelect={setCategory}
                            onPrintingSizeSelect={setPrintingSize}
                            onPrintingColorSelect={setPrintingColor}
                            placeholder="Select Category"
                            categoryOptions={categoryOptions}
                        />
                    </View>

                    {/* 🚚 DELIVERY DESTINATION (Deliver Items only) */}
                    {category === "Deliver Items" && (
                        <View style={s.formGroup}>
                            <Text style={s.label}>Delivery Destination:</Text>
                            <Dropdown
                                value={deliveryLocationName}
                                placeholder="Select Delivery Location"
                                onSelect={setDeliveryLocationName}
                                options={campusLocations.map((loc) => loc.name)}
                            />
                        </View>
                    )}

                    <View style={s.formGroup}>
                        <Text style={s.label}>Items:</Text>
                        {items.map((it) => (
                            <View key={it.id} style={s.itemsRow}>
                                {/* Food dropdown for Food Delivery, School Materials dropdown for School Materials */}
                                {category === "Food Delivery" ? (
                                    <View style={{ flex: 1 }}>
                                        <FoodItemDropdown
                                            value={it.name}
                                            onSelect={(itemName) => updateItem(it.id, { name: itemName })}
                                            placeholder="Select food item"
                                        />
                                    </View>
                                ) : category === "School Materials" ? (
                                    <View style={{ flex: 1 }}>
                                        <SchoolMaterialDropdown
                                            value={it.name}
                                            onSelect={(itemName) => updateItem(it.id, { name: itemName })}
                                            placeholder="Select material"
                                        />
                                    </View>
                                ) : isPrintingCategory ? (
                                    <FileUpload
                                        files={printingFiles[it.id] || []}
                                        onFilesChange={(files) => setItemFiles(it.id, files)}
                                        onFilePicked={(name) => updateItem(it.id, { name })}
                                        onFilePress={(file) => openFilePreview(file)}
                                    />
                                ) : (
                                    <TextInput
                                        value={it.name}
                                        onChangeText={(t) => updateItem(it.id, { name: t })}
                                        placeholder="ex. Banana"
                                        placeholderTextColor="#999"
                                        style={[s.input, { flex: 1 }]}
                                    />
                                )}

                                <TextInput
                                    value={it.qty}
                                    onChangeText={(t) => updateItem(it.id, { qty: t })}
                                    placeholder="ex. 1 pack"
                                    placeholderTextColor="#999"
                                    style={[s.input, { width: Platform.OS === 'web' ? 120 : 120, marginLeft: 8 }]}
                                />

                                <TouchableOpacity style={s.removeItemBtn} onPress={() => removeItem(it.id)}>
                                    <Text style={s.removeItemX}>X</Text>
                                </TouchableOpacity>
                            </View>
                        ))}
                        <TouchableOpacity onPress={addItem}>
                            <Text style={s.addMore}>+ Add more items</Text>
                        </TouchableOpacity>
                    </View>

                    <View style={s.formGroup}>
                        <Text style={s.label}>Schedule Errand:</Text>
                        <View style={s.schedulingContainer}>
                            <TouchableOpacity
                                style={s.checkboxContainer}
                                onPress={() => setIsScheduled(!isScheduled)}
                            >
                                <View style={[s.checkbox, isScheduled && s.checkboxSelected]}>
                                    {isScheduled && <Ionicons name="checkmark" size={12} color="white" />}
                                </View>
                                <Text style={s.checkboxLabel}>Schedule for later</Text>
                            </TouchableOpacity>

                            {isScheduled && (
                                <View style={s.timeSelectionContainer}>
                                    <Text style={s.subLabel}>Preferred Time:</Text>
                                    <TouchableOpacity
                                        style={s.timeDisplay}
                                        onPress={() => {
                                            const willOpen = !showTimePicker;
                                            setShowTimePicker(willOpen);
                                            if (willOpen) normalizeSelectionToFuture();
                                        }}
                                    >
                                        <Text style={s.timeDisplayText}>{timePicked ? scheduledTime : "00:00"}</Text>
                                        <Ionicons
                                            name={showTimePicker ? "chevron-up" : "chevron-down"}
                                            size={16}
                                            color={colors.maroon}
                                        />
                                    </TouchableOpacity>

                                    {showTimePicker && (
                                        <View style={s.timePickerContainer}>
                                            <Text style={s.pickerTitle}>Select Time:</Text>

                                            <View style={s.timeHeadersContainer}>
                                                <Text style={s.timeHeader}>Hour</Text>
                                                <Text style={s.timeColon}>:</Text>
                                                <Text style={s.timeHeader}>Minute</Text>
                                                <Text style={s.timeHeader}>Period</Text>
                                            </View>

                                            <View style={s.timeWheelsContainer}>
                                                <View style={s.timeWheel}>
                                                    <View style={s.wheelContainer}>
                                                        <ScrollView style={s.wheelScrollView} showsVerticalScrollIndicator={false}>
                                                            {Array.from({ length: 12 }, (_, i) => i + 1).map((h) => (
                                                                <TouchableOpacity
                                                                    key={h}
                                                                    disabled={isHourDisabled(h, period)}
                                                                    style={[s.wheelOption, hour === h && s.selectedWheelOption, isHourDisabled(h, period) && s.wheelOptionDisabled]}
                                                                    onPress={() => selectHour(h)}
                                                                >
                                                                    <Text
                                                                        style={[s.wheelOptionText, hour === h && s.selectedWheelOptionText, isHourDisabled(h, period) && s.wheelOptionTextDisabled]}
                                                                    >
                                                                        {h}
                                                                    </Text>
                                                                </TouchableOpacity>
                                                            ))}
                                                        </ScrollView>
                                                    </View>
                                                </View>

                                                <View style={s.timeWheel}>
                                                    <View style={s.wheelContainer}>
                                                        <ScrollView style={s.wheelScrollView} showsVerticalScrollIndicator={false}>
                                                            {Array.from({ length: 60 }, (_, i) => i).map((m) => (
                                                                <TouchableOpacity
                                                                    key={m}
                                                                    disabled={isMinuteDisabled(hour, m, period)}
                                                                    style={[s.wheelOption, minute === m && s.selectedWheelOption, isMinuteDisabled(hour, m, period) && s.wheelOptionDisabled]}
                                                                    onPress={() => selectMinute(m)}
                                                                >
                                                                    <Text
                                                                        style={[s.wheelOptionText, minute === m && s.selectedWheelOptionText, isMinuteDisabled(hour, m, period) && s.wheelOptionTextDisabled]}
                                                                    >
                                                                        {String(m).padStart(2, "0")}
                                                                    </Text>
                                                                </TouchableOpacity>
                                                            ))}
                                                        </ScrollView>
                                                    </View>
                                                </View>

                                                <View style={s.timeWheel}>
                                                    <View style={s.wheelContainer}>
                                                        <ScrollView style={s.wheelScrollView} showsVerticalScrollIndicator={false}>
                                                            {(["AM", "PM"] as const).map((p) => (
                                                                <TouchableOpacity
                                                                    key={p}
                                                                    style={[s.wheelOption, period === p && s.selectedWheelOption]}
                                                                    onPress={() => selectPeriod(p)}
                                                                >
                                                                    <Text
                                                                        style={[s.wheelOptionText, period === p && s.selectedWheelOptionText]}
                                                                    >
                                                                        {p}
                                                                    </Text>
                                                                </TouchableOpacity>
                                                            ))}
                                                        </ScrollView>
                                                    </View>
                                                </View>
                                            </View>

                                            <TouchableOpacity style={s.timeSaveButton} onPress={() => { normalizeSelectionToFuture(); setShowTimePicker(false); }}>
                                                <Text style={s.timeSaveButtonText}>Done</Text>
                                            </TouchableOpacity>
                                        </View>
                                    )}
                                </View>
                            )}
                        </View>
                    </View>

                    {/* 💰 PRICE BREAKDOWN SECTION */}
                    <View style={s.formGroup}>
                        <Text style={s.label}>Price Breakdown</Text>
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

                            {/* Service Fee (incl. VAT) */}
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

                    <TouchableOpacity style={s.primaryBtn} onPress={handleSubmit}>
                        <Text style={s.primaryBtnText}>Post Errand</Text>
                    </TouchableOpacity>
                </ScrollView>
            </View>

            {/* Fullscreen file preview for Printing items (available on main form too) */}
            {previewFile && (
                <Modal
                    visible={previewVisible}
                    transparent
                    animationType="fade"
                    onRequestClose={closeFilePreview}
                >
                    <View style={s.previewOverlay}>
                        <View style={s.previewContent}>
                            <View style={s.previewHeader}>
                                <Text style={s.previewTitle}>File Preview</Text>
                                <TouchableOpacity onPress={closeFilePreview}>
                                    <Text style={s.previewCloseX}>X</Text>
                                </TouchableOpacity>
                            </View>
                            <View style={s.previewBody}>
                                {(() => {
                                    const anyFile: any = previewFile;
                                    const isImage =
                                        anyFile?.type === "image" ||
                                        anyFile?.mimeType?.startsWith?.("image/");
                                    if (isImage) {
                                        return (
                                            // For web, Image is rendered via react-native-web
                                            <View style={{ width: "100%", height: 420 }}>
                                                {/* @ts-ignore: web image element */}
                                                <img
                                                    src={anyFile.uri}
                                                    style={{ width: "100%", height: "100%", objectFit: "contain", borderRadius: 4 }}
                                                />
                                            </View>
                                        );
                                    }
                                    // Documents – render in an iframe on web so user can read
                                    if (Platform.OS === "web" && anyFile?.uri) {
                                        return (
                                            <View style={{ width: "100%", height: 460 }}>
                                                {/* @ts-ignore: iframe allowed on web */}
                                                <iframe
                                                    src={anyFile.uri}
                                                    style={{ width: "100%", height: "100%", border: "none", borderRadius: 4 }}
                                                />
                                            </View>
                                        );
                                    }
                                    return null;
                                })()}
                            </View>
                        </View>
                    </View>
                </Modal>
            )}
        </Wrapper>
    );
}

/* ========================= styles ========================= */
const s = StyleSheet.create({
    webOverlay: {
        position: "fixed" as any,
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
        backgroundColor: "rgba(0,0,0,0.40)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 12,
        zIndex: 99999,
        ...(Platform.OS === "web" ? { backdropFilter: "saturate(120%)" } : {}),
    },
    webCard: {
        width: 430,
        maxWidth: 430,
        maxHeight: "90vh" as any,
        display: "flex",
        backgroundColor: "white",
        borderRadius: 12,
        borderWidth: 1,
        borderColor: colors.border,
        overflow: "hidden",
        ...(Platform.OS === "web" ? { boxShadow: "0px 10px 28px rgba(0,0,0,0.12)" } : {}),
    },

    cardBody: { padding: 16, flex: 1 },
    mobileRoot: { flex: 1, backgroundColor: "white" },
    headerRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        marginTop: 2,
        marginBottom: 12,
        paddingHorizontal: 4,
    },
    headerText: { fontSize: 16, fontWeight: "600", color: "#333" },
    closeX: { fontSize: 18, color: "#8B2323", fontWeight: "600" },


    modalRoot: { position: "absolute", zIndex: 999999 },

    // Web: keep panel anchored to viewport while scrolling
    modalRootWeb: {
        position: "fixed" as any,
        zIndex: 999999,
    },

    // --- WEB terms row (new) ---
    webTcRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 2, marginTop: 6 },
    webCheckbox: {
        width: 22,
        height: 22,
        borderRadius: 6,
        borderWidth: 2,
        borderColor: colors.maroon,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#fff",
    },
    webCheckboxSelected: { backgroundColor: colors.maroon, borderColor: colors.maroon },
    webTcText: { color: colors.text, flex: 1, lineHeight: 20 },
    webTcLink: { color: colors.maroon, textDecorationLine: "underline", fontWeight: "700" },

    mobileHeader: {
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 16,
        paddingTop: 16,
        paddingBottom: 12,
        justifyContent: "space-between",
    },
    backBtn: {
        width: 34,
        height: 34,
        borderRadius: 8,
        alignItems: "center",
        justifyContent: "center",
        marginRight: 6,
    },
    mobileHeaderTitle: { color: "#333", fontSize: 16, fontWeight: "600" },
    mobileDivider: { height: 1, backgroundColor: "#e0e0e0", marginBottom: 8 },
    formAreaWeb: { paddingHorizontal: 4, paddingBottom: 16 },
    formAreaMobile: { paddingVertical: 8 },
    formGroup: { paddingHorizontal: 16, paddingVertical: 8, gap: 6 },
    label: { color: "#333", marginBottom: 4, fontWeight: "500", fontSize: 14 },
    input: {
        borderWidth: 1,
        borderColor: "#8B2323",
        backgroundColor: "white",
        borderRadius: 4,
        paddingHorizontal: 12,
        paddingVertical: 10,
        color: "#333",
        fontSize: 14,
        height: 44,
    },
    textArea: { minHeight: 80, height: 80, textAlignVertical: "top" },
    selectRow: { position: "relative", justifyContent: "center", marginBottom: 0, zIndex: 100 },
    selectInput: { paddingRight: 28, height: 44 },
    caretWrap: { position: "absolute", right: 10, top: 0, bottom: 0, justifyContent: "center", alignItems: "center" },
    itemsRow: { flexDirection: "row", alignItems: "center", marginBottom: 8, marginTop: 4, gap: 6 },
    removeItemBtn: {
        marginLeft: 8,
        width: 28,
        height: 28,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: "#8B0000",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 0,
    },
    removeItemX: { color: colors.maroon, fontWeight: "600" },
    addMore: { color: "#8B2323", marginTop: 8, marginBottom: 8, fontSize: 14 },
    schedulingContainer: {
        borderWidth: 1,
        borderColor: "#8B2323",
        borderRadius: 4,
        backgroundColor: "white",
        padding: 12,
        gap: 12,
    },

    checkboxContainer: { flexDirection: "row", alignItems: "center", gap: 8 },
    checkboxLabel: { fontSize: 13, color: "#333" },
    timeSelectionContainer: { marginTop: 8, gap: 8 },
    timeDisplay: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderWidth: 1,
        borderColor: "#8B2323",
        borderRadius: 4,
        backgroundColor: "white",
        height: 44,
    },
    timeDisplayText: { fontSize: 14, color: "#333", fontWeight: "500" },
    timePickerContainer: {
        backgroundColor: "white",
        borderRadius: 8,
        padding: 16,
        marginTop: 8,
        borderWidth: 2,
        borderColor: "#8B2323",
        boxShadow: "0px 4px 12px rgba(0,0,0,0.06)",
        elevation: 5,
    },
    pickerTitle: { fontSize: 14, color: "#8B2323", fontWeight: "600", marginBottom: 12, textAlign: "center" },
    timeHeadersContainer: { flexDirection: "row", justifyContent: "space-around", alignItems: "center", marginBottom: 12, paddingHorizontal: 20 },
    timeHeader: { fontSize: 14, color: "#8B2323", fontWeight: "600" },
    timeColon: { fontSize: 14, color: "#8B2323", fontWeight: "600" },
    timeWheelsContainer: { flexDirection: "row", justifyContent: "space-around", marginVertical: 8 },
    timeWheel: { flex: 1, alignItems: "center", marginHorizontal: 4 },
    wheelContainer: { height: 120, width: 70 },
    wheelScrollView: {
        height: 120,
        width: 70,
        borderWidth: 1,
        borderColor: "#8B2323",
        borderRadius: 8,
        backgroundColor: "#f9f9f9",
        boxShadow: "0px 4px 12px rgba(0,0,0,0.06)",
        elevation: 2,
    },
    wheelOption: { height: 35, justifyContent: "center", alignItems: "center", marginVertical: 2, borderRadius: 4, backgroundColor: "transparent" },
    selectedWheelOption: { backgroundColor: "#f0f0f0", borderWidth: 1, borderColor: "#8B2323" },
    wheelOptionText: { fontSize: 16, color: "#8B2323", fontWeight: "500" },
    selectedWheelOptionText: { color: "#8B2323", fontWeight: "600" },
    // disabled states for past times (web only visual)
    wheelOptionDisabled: { opacity: 0.4 },
    wheelOptionTextDisabled: { color: "#8B2323", opacity: 0.5 },
    timeSaveButton: { backgroundColor: "transparent", alignItems: "center", marginTop: 16, paddingVertical: 8 },
    timeSaveButtonText: { color: "#8B2323", fontSize: 16, fontWeight: "600" },
    dropdownPanelElevated: {
        backgroundColor: "white",
        borderWidth: 1,
        borderColor: "#8B2323",
        borderRadius: 4,
        overflow: "hidden",
        ...(Platform.OS === "web" ? { boxShadow: "0px 6px 18px rgba(0,0,0,0.12)" } : {}),
        elevation: 12,
    },
    modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "transparent" },
    dropdownItem: {
        paddingVertical: 10,
        paddingHorizontal: 12,
    },
    dropdownItemText: { color: "#333", fontSize: 14 },
    subLabel: { color: "#333", fontWeight: "600", fontSize: 14 },
    subNote: { color: "#333", opacity: 0.7, marginTop: 2, fontSize: 12 },
    // Price Breakdown styles
    priceBreakdownContainer: {
        borderWidth: 1,
        borderColor: "#E5C8C5",
        borderRadius: 8,
        backgroundColor: "#FAF6F5",
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
        color: "#333",
        fontWeight: "500",
    },
    priceBreakdownItemQty: {
        fontSize: 12,
        color: "#666",
    },
    priceBreakdownItemTotal: {
        fontSize: 13,
        color: "#333",
        fontWeight: "600",
    },
    priceBreakdownDivider: {
        height: 1,
        backgroundColor: "#E5C8C5",
        marginVertical: 8,
    },
    priceBreakdownLabel: {
        fontSize: 13,
        color: "#333",
        fontWeight: "500",
    },
    priceBreakdownValue: {
        fontSize: 13,
        color: "#333",
        fontWeight: "600",
    },
    priceBreakdownTotalRow: {
        marginTop: 4,
    },
    priceBreakdownTotalLabel: {
        fontSize: 15,
        color: "#8B2323",
        fontWeight: "700",
    },
    priceBreakdownTotalValue: {
        fontSize: 15,
        color: "#8B2323",
        fontWeight: "700",
    },
    priceBreakdownEmptyText: {
        fontSize: 12,
        color: "#999",
        fontStyle: "italic",
        textAlign: "center",
        width: "100%",
    },
    primaryBtn: {
        backgroundColor: "#8B2323",
        borderRadius: 6,
        paddingVertical: 12,
        alignItems: "center",
        paddingHorizontal: 18,
        height: 48,
        justifyContent: "center",
        flex: 1,
    },
    primaryBtnText: {
        color: "white",
        fontWeight: "600",
        fontSize: 15,
    },

    /* Printing file upload styles (non-visual change preservation) */
    fileUploadButton: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        borderWidth: 1,
        borderColor: "#8B2323",
        borderRadius: 4,
        paddingHorizontal: 12,
        paddingVertical: 10,
        backgroundColor: "white",
        height: 44,
    },
    fileUploadButtonDisabled: { opacity: 0.6 },
    fileUploadText: { color: "#333", fontSize: 14, flex: 1, marginHorizontal: 8 },
    fileUploadTextDisabled: { color: "#999" },
    fileList: { marginTop: 8, gap: 6 },
    fileItem: {
        flexDirection: "row",
        alignItems: "center",
        borderWidth: 1,
        borderColor: "#8B2323",
        borderRadius: 6,
        paddingHorizontal: 10,
        paddingVertical: 8,
        backgroundColor: "#fff",
        gap: 8,
    },
    fileName: { flex: 1, color: "#333", fontSize: 13 },
    removeFileBtn: {
        width: 26,
        height: 26,
        borderRadius: 13,
        borderWidth: 1,
        borderColor: "#8B2323",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#fff",
    },

    summaryCard: {
        backgroundColor: "white",
        borderRadius: 8,
        borderWidth: 1,
        borderColor: "#8B2323",
        padding: 16,
        ...(Platform.OS === "web" ? { boxShadow: "0px 4px 12px rgba(0,0,0,0.06)" } : {}),
    },
    summaryTitle: {
        fontSize: 18,
        fontWeight: "900",
        marginBottom: 12,
        color: "#8B2323",
    },
    summaryList: {
        gap: 4,
    },
    summaryLine: {
        color: "#333",
        fontSize: 14,
    },
    summaryLabel: {
        fontSize: 14,
        fontWeight: "700",
        color: "#8B2323",
    },
    summaryBullet: {
        color: "#666",
        fontSize: 14,
        lineHeight: 20,
    },

    termsRow: {
        flexDirection: "row",
        alignItems: "center",
        marginTop: 16,
    },
    checkbox: {
        width: 16,
        height: 16,
        borderRadius: 2,
        borderWidth: 1,
        borderColor: "#8B2323",
        backgroundColor: "white",
        alignItems: "center",
        justifyContent: "center",
        marginRight: 8,
    },
    checkboxSelected: {
        backgroundColor: "#8B2323",
    },
    categoryContainer: {
        borderWidth: 1,
        borderColor: "#8B2323",
        borderRadius: 4,
        backgroundColor: "white",
        padding: 12,
        marginTop: 8,
    },
    categorySection: {
        marginBottom: 12,
    },
    categoryHeader: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        paddingVertical: 4,
    },
    categoryTitle: {
        fontSize: 13,
        fontWeight: "600",
        color: "#333",
    },
    categoryContent: {
        marginLeft: 16,
        marginTop: 8,
        gap: 6,
    },
    termsText: {
        fontSize: 12,
        color: "#666",
        lineHeight: 16,
    },

    // File preview modal (web)
    previewOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: "rgba(0,0,0,0.65)",
        justifyContent: "center",
        alignItems: "center",
        padding: 16,
    },
    previewContent: {
        backgroundColor: "#fff",
        borderRadius: 8,
        width: "100%",
        maxWidth: 600,
        maxHeight: "90%",
        padding: 16,
    },
    previewHeader: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 8,
    },
    previewTitle: {
        fontSize: 16,
        fontWeight: "600",
        color: "#333",
    },
    previewCloseX: {
        fontSize: 18,
        fontWeight: "600",
        color: colors.maroon,
    },
    previewBody: {
        alignItems: "center",
        justifyContent: "center",
        marginTop: 4,
    },

    actionsRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        paddingTop: 8,
        gap: 10,
    },
    goBackButton: {
        backgroundColor: "white",
        paddingVertical: 12,
        borderRadius: 6,
        alignItems: "center",
        height: 48,
        justifyContent: "center",
        borderWidth: 1,
        borderColor: "#8B2323",
        flex: 1,
    },
    goBackText: {
        color: "#8B2323",
        fontSize: 15,
        fontWeight: "600",
    },

    /* Food dropdown styles */
    foodDropdownPanel: {
        backgroundColor: "white",
        borderWidth: 1,
        borderColor: "#8B2323",
        borderRadius: 4,
        overflow: "hidden",
        ...(Platform.OS === "web" ? { boxShadow: "0px 6px 18px rgba(0,0,0,0.12)", overflowY: "auto" as any } : {}),
        elevation: 8,
    },
    foodSection: { borderBottomWidth: 1, borderBottomColor: "#f0f0f0" },
    foodSectionHeader: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        paddingVertical: 10,
        paddingHorizontal: 12,
        backgroundColor: "#fafafa",
    },
    foodSectionText: { fontSize: 14, fontWeight: "700", color: "#333" },
    foodSectionContent: { paddingVertical: 6 },
    foodItemRow: { flexDirection: "row", alignItems: "center", paddingVertical: 8, paddingHorizontal: 12 },
    foodCheckbox: {
        width: 18,
        height: 18,
        borderRadius: 4,
        borderWidth: 2,
        borderColor: "#8B2323",
        alignItems: "center",
        justifyContent: "center",
        marginRight: 10,
        backgroundColor: "#fff",
    },
    foodItemInfo: { flex: 1 },
    foodItemName: { fontSize: 13, fontWeight: "500", color: "#333", marginBottom: 2 },
    foodItemPrice: { fontSize: 12, color: "#666" },
    schoolItemPrice: { fontSize: 12, color: "#666" },
    printingPrice: { fontSize: 12, color: "#666" },

    /* --- Mobile Summary Footer Buttons (match screenshot) --- */
    msFooter: {
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "#fff",
        paddingHorizontal: 16,
        paddingTop: 10,
        paddingBottom: 16,
        borderTopWidth: 1,
        borderTopColor: "#eee",
        gap: 12,
    },

    msPrimaryBtn: {
        backgroundColor: "#8B2323",
        borderRadius: 8,
        alignItems: "center",
        justifyContent: "center",
        paddingVertical: 14,
    },
    msPrimaryBtnDisabled: { opacity: 0.6 },
    msPrimaryText: { color: "#FFFFFF", fontWeight: "800" },
    msPrimaryTextDisabled: { color: "#FFFFFF", opacity: 0.8 },

    msSecondaryBtn: {
        backgroundColor: "#FFFFFF",
        borderWidth: 1,
        borderColor: "#8B2323",
        borderRadius: 8,
        alignItems: "center",
        justifyContent: "center",
        paddingVertical: 12,
    },
    msSecondaryText: { color: "#8B2323", fontWeight: "800" },

});

const locationModal = StyleSheet.create({
    overlay: {
        position: "fixed" as any,
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
        backgroundColor: "rgba(0,0,0,0.45)",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        zIndex: 9999999,
    },
    card: {
        width: 420,
        maxWidth: "100%",
        backgroundColor: "#FFFFFF",
        borderRadius: 10,
        padding: 18,
        borderWidth: 1,
        borderColor: colors.maroon,
    },
    title: {
        fontSize: 16,
        fontWeight: "700",
        color: colors.maroon,
        marginBottom: 8,
    },
    message: {
        fontSize: 13,
        color: "#333333",
        lineHeight: 18,
    },
    actions: {
        flexDirection: "row",
        justifyContent: "flex-end",
        marginTop: 16,
        columnGap: 10,
    },
    cancelButton: {
        paddingVertical: 10,
        paddingHorizontal: 14,
        borderRadius: 6,
        borderWidth: 1,
        borderColor: colors.maroon,
        backgroundColor: "#FFFFFF",
        minWidth: 100,
        alignItems: "center",
        justifyContent: "center",
    },
    cancelText: {
        color: colors.maroon,
        fontWeight: "600",
        fontSize: 14,
    },
    confirmButton: {
        paddingVertical: 10,
        paddingHorizontal: 16,
        borderRadius: 6,
        backgroundColor: colors.maroon,
        minWidth: 130,
        alignItems: "center",
        justifyContent: "center",
    },
    confirmText: {
        color: "#FFFFFF",
        fontWeight: "600",
        fontSize: 14,
    },
});

const terms = StyleSheet.create({
    overlay: {
        position: "fixed" as any,
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
        backgroundColor: "rgba(0,0,0,0.40)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 12,
        zIndex: 999999,
    },
    sectionTitle: { fontWeight: "800", color: "#8B2323", marginTop: 10, marginBottom: 6 },
    bodyText: { color: "#333", lineHeight: 18, marginBottom: 16 },
    lastUpdated: {
        fontSize: 12,
        fontStyle: "italic",
        color: "#666",
        textAlign: "center",
        marginTop: 16,
    },
});
