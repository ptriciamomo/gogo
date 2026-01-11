// app/buddycaller/errand_form.tsx
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import TermsAndConditions from "../TermsAndConditions";
import { supabase } from "../../lib/supabase";
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as Location from 'expo-location';
import * as Sharing from 'expo-sharing';

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
    Alert,
    Modal,
    Platform,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    TouchableWithoutFeedback,
    View,
    Linking,
    Image,
} from "react-native";
import { responsive, rw, rh, rf, rp, rb } from "../../utils/responsive";

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

const SCHOOL_MATERIALS = [
    { name: "Yellowpad", price: "₱10" },
    { name: "Ballpen", price: "₱10" },
] as const;

type CampusLocation = {
    id: string;
    name: string;
    latitude: number;
    longitude: number;
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

/* ---------- Tiny dropdown: web inline; native anchored modal ---------- */
function Dropdown({
    value,
    placeholder,
    onSelect,
    options,
}: {
    value?: string;
    placeholder?: string;
    onSelect: (v: string) => void;
    options: readonly string[];
}) {
    const [open, setOpen] = useState(false);
    const isWeb = Platform.OS === "web";
    // anchor for native modal positioning
    const controlRef = useRef<View | null>(null);
    const [anchor, setAnchor] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

    const openDropdown = () => {
        if (isWeb) {
            setOpen((v) => !v);
            return;
        }
        controlRef.current?.measureInWindow((x, y, w, h) => {
            setAnchor({ x, y, w, h });
            setOpen(true);
        });
    };
    const closeDropdown = () => setOpen(false);

    return (
        <>
            <View ref={controlRef} style={s.selectRow}>
                <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={openDropdown}
                    accessibilityRole="button"
                    style={[s.input as any, s.selectInput as any]}
                >
                    <Text style={{ color: value ? colors.text : "#999" }}>
                        {value || placeholder || "Select…"}
                    </Text>
                </TouchableOpacity>

                {/* centered right-side caret */}
                <View pointerEvents="none" style={s.caretWrap}>
                    <Ionicons name={open ? "chevron-up" : "chevron-down"} size={18} color={colors.maroon} />
                </View>

                {/* WEB: inline panel */}
                {isWeb && open && (
                    <View style={s.dropdownPanel}>
                        <ScrollView style={{ maxHeight: 220, backgroundColor: "transparent" }}>
                            {options.map((opt, idx) => (
                                <TouchableOpacity
                                    key={opt}
                                    onPress={() => {
                                        onSelect(opt);
                                        closeDropdown();
                                    }}
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
                )}
            </View>

            {/* NATIVE: top-level Modal so options float above everything else */}
            {!isWeb && open && (
                <Modal transparent animationType="fade" onRequestClose={closeDropdown}>
                    {/* tap outside to close */}
                    <TouchableWithoutFeedback onPress={closeDropdown}>
                        <View style={s.modalBackdrop} />
                    </TouchableWithoutFeedback>

                    {/* dropdown panel anchored under the field */}
                    <View
                        pointerEvents="box-none"
                        style={[
                            s.modalRoot,
                            anchor ? { top: anchor.y + anchor.h, left: anchor.x, width: anchor.w } : { top: 0, left: 0, right: 0 },
                        ]}
                    >
                        <View style={s.dropdownPanelNative}>
                            <ScrollView style={{ maxHeight: 260 }}>
                                {options.map((opt, idx) => (
                                    <TouchableOpacity
                                        key={opt}
                                        onPress={() => {
                                            onSelect(opt);
                                            closeDropdown();
                                        }}
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

/* ---------- Category Dropdown with Printing submenu ---------- */
function CategoryDropdown({
    value,
    printingSize,
    printingColor,
    onSelect,
    onPrintingSizeSelect,
    onPrintingColorSelect,
    placeholder = "Select Category",
}: {
    value?: string;
    printingSize?: string;
    printingColor?: string;
    onSelect: (v: string) => void;
    onPrintingSizeSelect: (size: string) => void;
    onPrintingColorSelect: (color: string) => void;
    placeholder?: string;
}) {
    const [open, setOpen] = useState(false);
    const [printingExpanded, setPrintingExpanded] = useState(false);
    const isWeb = Platform.OS === "web";
    const controlRef = useRef<View | null>(null);
    const [anchor, setAnchor] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

    const openDropdown = () => {
        if (isWeb) {
            setOpen((v) => !v);
            return;
        }
        controlRef.current?.measureInWindow((x, y, w, h) => {
            setAnchor({ x, y, w, h });
            setOpen(true);
        });
    };
    const closeDropdown = () => {
        setOpen(false);
        setPrintingExpanded(false);
    };

    const handleCategorySelect = (cat: string) => {
        if (cat === "Printing") {
            setPrintingExpanded(true);
        } else {
            onSelect(cat);
            onPrintingSizeSelect(""); // Clear printing size when selecting other category
            onPrintingColorSelect(""); // Clear printing color when selecting other category
            closeDropdown();
        }
    };

    const handlePrintingSizeSelect = (size: string) => {
        onPrintingSizeSelect(size);
        onSelect("Printing");
        // Do not auto-close so user can still pick color
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
                    style={[s.input as any, s.selectInput as any]}
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
                        {CATEGORY_OPTIONS.map((opt) => (
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
                                            <View style={{ marginTop: rp(8) }}>
                                                <Text style={[s.checkboxLabel, { marginBottom: rp(4) }]}>
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
                                                    <Text style={s.checkboxLabel}>Colored</Text>
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
                                                    <Text style={s.checkboxLabel}>Not Colored</Text>
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

            {/* NATIVE: top-level Modal */}
            {!isWeb && open && (
                <Modal transparent animationType="fade" onRequestClose={closeDropdown}>
                    <TouchableWithoutFeedback onPress={closeDropdown}>
                        <View style={s.modalBackdrop} />
                    </TouchableWithoutFeedback>

                    <View
                        pointerEvents="box-none"
                        style={[
                            s.modalRoot,
                            anchor ? { top: anchor.y + anchor.h, left: anchor.x, width: anchor.w } : { top: 0, left: 0, right: 0 },
                        ]}
                    >
                        <View style={s.dropdownPanelNative}>
                            <ScrollView style={{ maxHeight: 260 }}>
                                <View style={s.categoryContainer}>
                                    {CATEGORY_OPTIONS.map((opt) => (
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
                                                        style={[s.checkboxContainer, { marginTop: rp(4) }]}
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
                                                        <View style={{ marginTop: rp(8) }}>
                                                            <Text style={[s.checkboxLabel, { marginBottom: rp(4) }]}>
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
                                                    <View style={{ flexDirection: "row", alignItems: "center", gap: rp(6) }}>
                                                        <Text style={s.checkboxLabel}>Colored</Text>
                                                        {printingSize === "A3" ? (
                                                            <Text style={s.printingPrice}>₱25</Text>
                                                        ) : printingSize === "A4" ? (
                                                            <Text style={s.printingPrice}>₱5</Text>
                                                        ) : null}
                                                    </View>
                                                </TouchableOpacity>
                                                <TouchableOpacity
                                                    style={[s.checkboxContainer, { marginTop: rp(4) }]}
                                                    onPress={() => handlePrintingColorSelect("Not Colored")}
                                                    activeOpacity={0.8}
                                                >
                                                    <View style={[s.checkbox, printingColor === "Not Colored" && s.checkboxSelected]}>
                                                        {printingColor === "Not Colored" && (
                                                            <Ionicons name="checkmark" size={12} color="white" />
                                                        )}
                                                    </View>
                                                    <View style={{ flexDirection: "row", alignItems: "center", gap: rp(6) }}>
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
                            </ScrollView>
                        </View>
                    </View>
                </Modal>
            )}
        </>
    );
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
    const [anchor, setAnchor] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

    const openDropdown = () => {
        if (isWeb) {
            setOpen((v) => !v);
            return;
        }
        controlRef.current?.measureInWindow((x, y, w, h) => {
            setAnchor({ x, y, w, h });
            setOpen(true);
        });
    };
    const closeDropdown = () => setOpen(false);

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
                    style={[s.input as any, s.selectInput as any]}
                >
                    <Text style={{ color: value ? colors.text : "#999" }}>
                        {value || placeholder}
                    </Text>
                </TouchableOpacity>

                <View pointerEvents="none" style={s.caretWrap}>
                    <Ionicons name={open ? "chevron-up" : "chevron-down"} size={18} color={colors.maroon} />
                </View>

                {/* WEB: inline panel */}
                {isWeb && open && (
                    <View style={s.dropdownPanel}>
                        <ScrollView style={{ maxHeight: 220, backgroundColor: "transparent" }}>
                            {SCHOOL_MATERIALS.map(renderOption)}
                        </ScrollView>
                    </View>
                )}
            </View>

            {/* NATIVE: top-level Modal */}
            {!isWeb && open && (
                <Modal transparent animationType="fade" onRequestClose={closeDropdown}>
                    <TouchableWithoutFeedback onPress={closeDropdown}>
                        <View style={s.modalBackdrop} />
                    </TouchableWithoutFeedback>

                    <View
                        pointerEvents="box-none"
                        style={[
                            s.modalRoot,
                            anchor ? { top: anchor.y + anchor.h, left: anchor.x, width: anchor.w } : { top: 0, left: 0, right: 0 },
                        ]}
                    >
                        <View style={s.dropdownPanelNative}>
                            <ScrollView style={{ maxHeight: 260 }}>
                                {SCHOOL_MATERIALS.map(renderOption)}
                            </ScrollView>
                        </View>
                    </View>
                </Modal>
            )}
        </>
    );
}

/* ---------- Food Item Dropdown for Food Delivery category ---------- */
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
        "Canteen": true,
        "Drinks": true
    });
    const isWeb = Platform.OS === "web";

    const controlRef = useRef<View | null>(null);
    const [anchor, setAnchor] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

    const openDropdown = () => {
        if (isWeb) {
            setOpen((v) => !v);
            return;
        }
        controlRef.current?.measureInWindow((x, y, w, h) => {
            setAnchor({ x, y, w, h });
        setOpen(true);
        });
    };
    const closeDropdown = () => setOpen(false);

    const toggleSection = (sectionName: string) => {
        setExpandedSections(prev => ({
            ...prev,
            [sectionName]: !prev[sectionName]
        }));
    };

    const toggleItem = (itemName: string) => {
        // For now, just select the item (you can modify this to handle multiple selections)
        onSelect(itemName);
        closeDropdown();
    };

    return (
        <>
            <View style={s.selectRow} ref={controlRef}>
                <TouchableOpacity
                    onPress={openDropdown}
                    style={[s.input, s.selectInput]}
                    activeOpacity={0.8}
                >
                    <Text style={{ color: value ? "#333" : "#999" }}>
                        {value || placeholder}
                    </Text>
                    <View style={s.caretWrap}>
                        <Ionicons name="chevron-down" size={16} color={colors.maroon} />
                    </View>
                </TouchableOpacity>
            </View>

            {open && (
                <>
                    {isWeb ? (
                        <View style={s.foodDropdownPanel}>
                            <ScrollView style={{ maxHeight: 220 }} showsVerticalScrollIndicator={false}>
                                {Object.entries(FOOD_ITEMS).map(([category, items]) => (
                                    <View key={category} style={s.foodSection}>
                                        <TouchableOpacity
                                            style={s.foodSectionHeader}
                                            onPress={() => toggleSection(category)}
                                        >
                                            <View style={s.foodSectionTitle}>
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
                                                    <TouchableOpacity
                                                        key={idx}
                                                        style={s.foodItemRow}
                                                        onPress={() => toggleItem(item.name)}
                                                    >
                                                        <View style={s.foodCheckbox}>
                                                            {value === item.name && (
                                                                <Ionicons name="checkmark" size={12} color="white" />
                                                            )}
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
                    ) : (
                        <Modal transparent visible animationType="fade" onRequestClose={closeDropdown}>
                            <TouchableOpacity style={s.modalBackdrop} onPress={closeDropdown} activeOpacity={1} />
                            <View style={[s.modalRoot, anchor && { left: anchor.x, top: anchor.y + anchor.h }]}>
                                <View style={[s.foodDropdownPanelNative, anchor && { width: anchor.w }]}>
                                    <ScrollView style={{ maxHeight: 220 }} showsVerticalScrollIndicator={false}>
                                {Object.entries(FOOD_ITEMS).map(([category, items]) => (
                                    <View key={category} style={s.foodSection}>
                                                <TouchableOpacity
                                                    style={s.foodSectionHeader}
                                                    onPress={() => toggleSection(category)}
                                                >
                                                    <View style={s.foodSectionTitle}>
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
                                                            <TouchableOpacity
                                                                key={idx}
                                                                style={s.foodItemRow}
                                                                onPress={() => toggleItem(item.name)}
                                                            >
                                                        <View style={s.foodCheckbox}>
                                                                    {value === item.name && (
                                                                        <Ionicons name="checkmark" size={12} color="white" />
                                                                    )}
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
            )}
        </>
    );
}

/* ---------- File Upload Component for Printing category ---------- */
function FileUpload({
    files,
    onFilesChange,
    onFilePress,
}: {
    files: (DocumentPicker.DocumentPickerAsset | ImagePicker.ImagePickerAsset)[];
    onFilesChange: (files: (DocumentPicker.DocumentPickerAsset | ImagePicker.ImagePickerAsset)[]) => void;
    onFilePress?: (file: DocumentPicker.DocumentPickerAsset | ImagePicker.ImagePickerAsset) => void;
}) {
    const pickDocument = async () => {
        try {
            const result = await DocumentPicker.getDocumentAsync({
                type: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
                multiple: false, // Only allow single file selection
                copyToCacheDirectory: true,
            });

            if (!result.canceled && result.assets && result.assets.length > 0) {
                // Replace the existing file with the new one
                onFilesChange([result.assets[0]]);
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
                // Replace the existing file with the new one
                onFilesChange([result.assets[0]]);
            }
        } catch (error) {
            console.error('Error picking images:', error);
            Alert.alert('Error', 'Failed to pick images');
        }
    };

    const showPickerOptions = () => {
        // If a file is already selected, don't show the popup
        if (files.length > 0) {
            return;
        }
        
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
        <View style={{ flex: 3, marginRight: 8 }}>
                <TouchableOpacity
                style={[s.fileUploadButton, files.length > 0 && s.fileUploadButtonDisabled]}
                    onPress={showPickerOptions}
                activeOpacity={files.length > 0 ? 1 : 0.8}
                disabled={files.length > 0}
            >
                <Ionicons name="cloud-upload-outline" size={20} color={files.length > 0 ? "#999" : colors.maroon} />
                <Text style={[s.fileUploadText, files.length > 0 && s.fileUploadTextDisabled]}>
                    {files.length > 0 ? "File selected" : "Select file to print"}
                </Text>
                <Ionicons name="chevron-down" size={16} color={files.length > 0 ? "#999" : colors.maroon} />
                </TouchableOpacity>

            {files.length > 0 && (
                <View style={s.fileList}>
                    {files.slice(0, 1).map((file, index) => {
                        const isImage = 'type' in file && file.type === 'image';
                        const isDocument = 'mimeType' in file;
                        const fileName = isImage ? (file as ImagePicker.ImagePickerAsset).fileName || `Image ${index + 1}` : (file as DocumentPicker.DocumentPickerAsset).name;

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

type ItemRow = { 
    id: string; 
    name: string; 
    qty: string;
    files?: (DocumentPicker.DocumentPickerAsset | ImagePicker.ImagePickerAsset)[];
};

interface ErrandFormProps {
    onClose?: () => void;
    disableModal?: boolean;
}

export default function ErrandForm({ onClose, disableModal = false }: ErrandFormProps = {}) {
    const router = useRouter();
    const isWeb = Platform.OS === "web";

    // steps
    const [step, setStep] = useState<"FORM" | "SUMMARY">("FORM");
    const [showTerms, setShowTerms] = useState(false);
    const [agree, setAgree] = useState(false);

    // form state
    const [title, setTitle] = useState("");
    const [desc, setDesc] = useState("");
    const [category, setCategory] = useState<string>("");
    const [printingSize, setPrintingSize] = useState<string>(""); // A3 or A4
    const [printingColor, setPrintingColor] = useState<string>(""); // Colored or Not Colored
    const [campusLocations, setCampusLocations] = useState<CampusLocation[]>([]);
    const [deliveryLocationName, setDeliveryLocationName] = useState<string>("");
    const [items, setItems] = useState<ItemRow[]>([{ id: String(Date.now() + Math.random()), name: "", qty: "", files: [] }]);
    const [estPrice, setEstPrice] = useState("");

    // scheduling state
    const [isScheduled, setIsScheduled] = useState(false);
    // printing file preview
    const [previewFile, setPreviewFile] = useState<DocumentPicker.DocumentPickerAsset | ImagePicker.ImagePickerAsset | null>(null);
    const [previewVisible, setPreviewVisible] = useState(false);

    const openFilePreview = (file: DocumentPicker.DocumentPickerAsset | ImagePicker.ImagePickerAsset) => {
        setPreviewFile(file);
        setPreviewVisible(true);
    };

    const closeFilePreview = () => {
        setPreviewVisible(false);
        setPreviewFile(null);
    };
    const [scheduledTime, setScheduledTime] = useState("00:00 PM");
    const [showTimePicker, setShowTimePicker] = useState(false);
    const [hour, setHour] = useState(0);
    const [minute, setMinute] = useState(0);
    const [period, setPeriod] = useState<'AM' | 'PM'>('PM');

    // location confirmation & posting state
    const [showLocationConfirm, setShowLocationConfirm] = useState(false);
    const [savingLocationAndPosting, setSavingLocationAndPosting] = useState(false);
    const [showLocationPermissionModal, setShowLocationPermissionModal] = useState(false);

    // success modal state
    const [showSuccessModal, setShowSuccessModal] = useState(false);

    // web: hide scrollbar
    useEffect(() => {
        if (Platform.OS !== "web") return;
        const id = "errand-scrollbar-style-hidden";
        if (document.getElementById(id)) return;
        const style = document.createElement("style");
        style.id = id;
        style.innerHTML =
            `[data-errandscroll="1"]{ scrollbar-width:none !important; -ms-overflow-style:none !important;}
       [data-errandscroll="1"]::-webkit-scrollbar{ width:0 !important; height:0 !important;}`;
        document.head.appendChild(style);
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

    // full-screen on native; centered popup on web (unless modal is disabled)
    const Wrapper: React.ComponentType<any> = useMemo(() => {
        if (isWeb && !disableModal) {
            const WebWrapper = ({ children }: any) => (
                <View style={s.webOverlay}>
                    <View style={s.webCard}>{children}</View>
                </View>
            );
            WebWrapper.displayName = 'WebWrapper';
            return WebWrapper;
        }
        const NativeWrapper = ({ children }: any) => <SafeAreaView style={{ flex: 1, backgroundColor: 'white' }}>{children}</SafeAreaView>;
        NativeWrapper.displayName = 'NativeWrapper';
        return NativeWrapper;
    }, [isWeb, disableModal]);

    const close = () => {
        if (onClose) {
            onClose();
        } else {
            router.back();
        }
    };
    //Diri Jade sa items murag mao ni connected sa database
    const addItem = () => setItems((p) => [...p, { id: String(Date.now() + Math.random()), name: "", qty: "", files: [] }]);
    const updateItem = (id: string, patch: Partial<ItemRow>) => setItems((p) => p.map((it) => (it.id === id ? { ...it, ...patch } : it)));
    const removeItem = (id: string) => setItems((p) => p.filter((it) => it.id !== id));

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

    // time validation function
    const isTimeInPast = (h: number, m: number, p: 'AM' | 'PM') => {
        const now = new Date();
        const currentHour = now.getHours();
        const currentMinute = now.getMinutes();
        
        // Convert 12-hour format to 24-hour format
        let hour24 = h;
        if (p === 'AM' && h === 12) {
            hour24 = 0;
        } else if (p === 'PM' && h !== 12) {
            hour24 = h + 12;
        }
        
        // Check if the selected time is in the past
        if (hour24 < currentHour) {
            return true;
        } else if (hour24 === currentHour && m <= currentMinute) {
            return true;
        }
        
        return false;
    };

    // time picker functions
    const applyTime = (h: number, m: number, p: 'AM' | 'PM') => {
        if (isTimeInPast(h, m, p)) {
            Alert.alert("Invalid Time", "Please select a time that hasn't passed yet.");
            return;
        }
        setScheduledTime(`${h}:${String(m).padStart(2,'0')} ${p}`);
    };
    
    const selectHour = (h: number) => { 
        if (isTimeInPast(h, minute, period)) {
            Alert.alert("Invalid Time", "Please select a time that hasn't passed yet.");
            return;
        }
        setHour(h); 
        applyTime(h, minute, period); 
    };
    
    const selectMinute = (m: number) => { 
        if (isTimeInPast(hour, m, period)) {
            Alert.alert("Invalid Time", "Please select a time that hasn't passed yet.");
            return;
        }
        setMinute(m); 
        applyTime(hour, m, period); 
    };
    
    const selectPeriod = (p: 'AM'|'PM') => { 
        if (isTimeInPast(hour, minute, p)) {
            Alert.alert("Invalid Time", "Please select a time that hasn't passed yet.");
            return;
        }
        setPeriod(p); 
        applyTime(hour, minute, p); 
    };

    // submit form → go to summary
    const handleSubmit = () => {
        if (!title.trim()) return Alert.alert("Error", "Please enter an errand title.");
        if (!desc.trim()) return Alert.alert("Error", "Please enter an errand description.");
        if (!category) return Alert.alert("Error", "Please select a category.");
        
        // Validate that all items have quantities
        const itemsWithoutQuantity = items.filter(item => !item.qty || item.qty.trim() === '');
        if (itemsWithoutQuantity.length > 0) {
            Alert.alert("Missing Information", "Please fill in the quantity for all items before proceeding.");
            return;
        }
        
        setStep("SUMMARY");
    };

    /**
     * Single-shot location capture for caller.
     * Uses Expo Location on native (this file is the native/mobile implementation).
     * Updates the caller's record in public.users (latitude, longitude, location_updated_at).
     */
    const captureAndSaveCallerLocation = async (): Promise<boolean> => {
        try {
            // Request foreground permissions only when needed (after user confirmation)
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') {
                // Show dedicated permission modal; do not proceed to posting
                setShowLocationPermissionModal(true);
                return false;
            }

            // Fetch GPS once (no subscription)
            const position = await Location.getCurrentPositionAsync({
                accuracy: Location.Accuracy.Balanced,
            });

            const { data: userData, error: getUserErr } = await supabase.auth.getUser();
            if (getUserErr) {
                console.error("Error getting user for location update:", getUserErr);
                Alert.alert("Error", "Unable to verify your account while saving location.");
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
                console.error("Error updating user location:", updateErr);
                Alert.alert("Error", "Failed to save your current location. Please try again.");
                return false;
            }

            return true;
        } catch (e: any) {
            console.error("captureAndSaveCallerLocation error:", e);
            Alert.alert("Error", "Unable to get your current location. Please try again.");
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
     * Wrapper when user taps "Yes, Confirm" in the location modal.
     * 1) Capture GPS once
     * 2) Update users table
     * 3) Post errand (reusing existing confirmErrand flow)
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

    /* -----------------------------------------------------------------
       NOTE: Async FUNCTION – confirmErrand
       Purpose: RLS-safe insert into "errand" table then show success modal
       Flow:
         1) require agree to T&C
         2) get current user
         3) build payload and insert
         4) open success modal
    ----------------------------------------------------------------- */
    const confirmErrand = async () => {
        try {
            if (!agree) {
                Alert.alert("Error", "Please agree to Terms and Conditions.");
                return;
            }

            // Validate required fields
            if (!title.trim()) {
                Alert.alert("Missing Information", "Please enter an errand title.");
                return;
            }

            if (!desc.trim()) {
                Alert.alert("Missing Information", "Please enter an errand description.");
                return;
            }

            if (!category) {
                Alert.alert("Missing Information", "Please select a category.");
                return;
            }

            // Validate that all items have quantities
            const itemsWithoutQuantity = items.filter(item => !item.qty || item.qty.trim() === '');
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
                    return;
                }
                selectedDeliveryLocation = campusLocations.find((loc) => loc.name === deliveryLocationName);
                if (!selectedDeliveryLocation) {
                    Alert.alert("Invalid Location", "The selected Delivery Destination is not available. Please choose again.");
                    return;
                }
            }

            // Prepare items data for database; if name is empty for Printing, use first file's name
            const itemsData = items.map(item => ({
                id: item.id,
                name: item.name || ((item.files && item.files[0]) ? (((item.files[0] as any).name) || ((item.files[0] as any).fileName) || "") : item.name),
                qty: item.qty,
            }));

            // Upload files to Supabase Storage and prepare files data
            const allFiles = [];
            const fileCounter: { [key: string]: number } = {}; // Track file counts to handle duplicates
            
            for (const item of items) {
                if (item.files && item.files.length > 0) {
                    for (const file of item.files) {
                        try {
                            // Use original filename
                            const originalFileName = 'type' in file ? 
                                (file as ImagePicker.ImagePickerAsset).fileName || `Image_${Date.now()}.jpg` : 
                                (file as DocumentPicker.DocumentPickerAsset).name || `Document_${Date.now()}`;
                            
                            // Handle duplicate filenames by adding a counter
                            let fileName: string;
                            let storageFileName: string;
                            
                            if (fileCounter[originalFileName]) {
                                fileCounter[originalFileName]++;
                                const fileExtension = originalFileName.split('.').pop();
                                const baseName = originalFileName.replace(`.${fileExtension}`, '');
                                fileName = `${baseName}_${fileCounter[originalFileName]}.${fileExtension}`;
                                storageFileName = fileName;
                            } else {
                                fileCounter[originalFileName] = 1;
                                // add timestamp to guarantee uniqueness on first occurrence too
                                const fileExtension = originalFileName.split('.').pop();
                                const baseName = originalFileName.replace(`.${fileExtension}`, '');
                                fileName = `${baseName}_${Date.now()}.${fileExtension}`;
                                storageFileName = fileName;
                            }
                            
                            // Normalize images: convert HEIC/HEIF to JPEG before upload
                            let uploadUri = file.uri;
                            let uploadMime: string | undefined = 'mimeType' in file ? file.mimeType : (file as ImagePicker.ImagePickerAsset).type;
                            const isImage = ('type' in file && ((file as ImagePicker.ImagePickerAsset).type?.startsWith('image/') || (uploadMime?.startsWith('image/'))));
                            const isHeic = (uploadMime === 'image/heic' || uploadMime === 'image/heif' || (uploadUri?.toLowerCase().endsWith('.heic')) || (uploadUri?.toLowerCase().endsWith('.heif')));

                            if (isImage && isHeic) {
                                const manipResult = await ImageManipulator.manipulateAsync(
                                    uploadUri,
                                    [],
                                    { compress: 0.9, format: ImageManipulator.SaveFormat.JPEG }
                                );
                                uploadUri = manipResult.uri;
                                uploadMime = 'image/jpeg';
                                // ensure filename extension is .jpg
                                const fileExtension = 'jpg';
                                const baseName = storageFileName.replace(/\.[^/.]+$/, '');
                                const newName = `${baseName}.jpg`;
                                storageFileName = newName;
                                fileName = newName;
                            }

                            // Read file content (React Native compatible)
                            const response = await fetch(uploadUri);
                            const arrayBuffer = await response.arrayBuffer();
                            
                            // Upload to Supabase Storage with original filename
                            const { data: uploadData, error: uploadError } = await supabase.storage
                                .from('errand-files')
                                .upload(`errands/${user.id}/${storageFileName}`, arrayBuffer, {
                                    contentType: uploadMime || 'application/octet-stream',
                                    upsert: true,
                                });
                            
                            if (uploadError) {
                                console.error('File upload error:', uploadError);
                                Alert.alert('Storage Error', `Failed to upload file: ${uploadError.message}. Please make sure the storage bucket exists.`);
                                return; // Stop the process if file upload fails
                            }
                            
                            // Get public URL
                            const { data: { publicUrl } } = supabase.storage
                                .from('errand-files')
                                .getPublicUrl(uploadData.path);
                            
                            console.log('File uploaded successfully:', {
                                fileName,
                                fileUri: publicUrl
                            });
                            
                            allFiles.push({
                                fileName: fileName,
                                fileUri: publicUrl // Complete Supabase Storage URL
                            });
                        } catch (error) {
                            console.error('Error uploading file:', error);
                            Alert.alert('Upload Error', `Failed to upload file: ${error instanceof Error ? error.message : 'Unknown error'}`);
                            return; // Stop the process if file upload fails
                        }
                    }
                } else {
                    // No files for this item, skip
                    console.log('No files to upload for item:', item.id);
                }
            }

            const payload: any = {
                buddycaller_id: user.id,
                title: title.trim(),
                description: desc.trim(),
                category,
                status: "pending", // set initial status
                items: itemsData,
                files: allFiles,
                is_scheduled: isScheduled,
                scheduled_time: isScheduled ? scheduledTime : null,
                scheduled_date: isScheduled ? new Date().toISOString().split('T')[0] : null,
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

            // IMPORTANT: no .select().single() to avoid extra read blocked by RLS
            const { error: insertError } = await supabase.from("errand").insert([payload]);
            if (insertError) throw insertError;

            // Show success modal instead of Alert
            setShowSuccessModal(true);
        } catch (e: any) {
            console.error("confirmErrand error:", e);
            Alert.alert("Error", `Failed to submit errand: ${e?.message || "Unknown error"}`);
        }
    };


    /* ---------- SUMMARY screen ---------- */
    if (step === "SUMMARY") {
        const summaryContent = (
            <>
                <View style={s.summaryCard}>
                    <Text style={s.summaryTitle}>Errand Summary</Text>

                    <View style={s.summaryList}>
                        <Text style={s.summaryLine}><Text style={s.summaryLabel}>Title:</Text> {title || ''}</Text>
                        <Text style={s.summaryLine}><Text style={s.summaryLabel}>Description:</Text> {desc || ''}</Text>
                        <Text style={s.summaryLine}>
                            <Text style={s.summaryLabel}>Errand Type:</Text>{" "}
                            {category === "Printing" && printingSize
                                ? `Printing-${printingSize}${printingColor ? `-${printingColor}` : ""}`
                                : category || ""}
                        </Text>
                    
                    {isScheduled && (
                            <Text style={s.summaryLine}><Text style={s.summaryLabel}>Completion:</Text> {scheduledTime}</Text>
                    )}
                    
                        <Text style={[s.summaryLine, { marginBottom: 4 }]}><Text style={s.summaryLabel}>Items:</Text></Text>
                        {items.map((it) => {
                            if (category === "Printing" && it.files && it.files.length > 0) {
                                return it.files.map((file, index) => {
                                    const isImage = 'type' in file && file.type === 'image';
                                    const docAsset = file as DocumentPicker.DocumentPickerAsset;
                                    const imgAsset = file as ImagePicker.ImagePickerAsset;
                                    const fileName = isImage
                                        ? imgAsset.fileName || `Image ${index + 1}`
                                        : docAsset.name;
                                    return (
                                        <Text
                                            key={`${it.id}-${index}`}
                                            style={[s.summaryBullet, { textDecorationLine: "underline" }]}
                                            onPress={() => openFilePreview(file)}
                                        >
                                            • {fileName} ({it.qty})
                        </Text>
                                    );
                                });
                            } else {
                                return (
                                    <Text key={it.id} style={s.summaryBullet}>• {it.name} ({it.qty})</Text>
                                );
                            }
                        })}

                        <Text style={[s.summaryLine, { marginTop: 6 }]}>
                            <Text style={s.summaryLabel}>Estimated Price:</Text> {estPrice || '—'}
                        </Text>
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
            </>
        );

        if (isWeb) {
            return (
                <View style={s.webOverlay}>
                    <View style={s.webCard}>
                        <View style={s.cardBody}>
                            <View style={s.headerRow}>
                                <Text style={s.headerText}>Errand Summary</Text>
                                <TouchableOpacity onPress={() => setStep("FORM")} accessibilityRole="button">
                                    <Text style={s.closeX}>X</Text>
                                </TouchableOpacity>
                            </View>

                            <ScrollView
                                style={{ flex: 1 }}
                                contentContainerStyle={{ padding: 12 }}
                                showsVerticalScrollIndicator={false}
                                {...(isWeb ? { dataSet: { errandscroll: "1" } as any } : {})}
                            >
                                {summaryContent}
                            </ScrollView>

                            <View style={s.actionsRow}>
                                <TouchableOpacity style={s.goBackButton} onPress={() => setStep("FORM")}>
                                    <Text style={s.goBackText}>Go Back</Text>
                                </TouchableOpacity>
                                <TouchableOpacity 
                                    style={[s.primaryBtn, !agree && s.primaryBtnDisabled]} 
                                    onPress={openLocationConfirmModal}
                                    disabled={!agree}
                                >
                                    <Text style={[s.primaryBtnText, !agree && s.primaryBtnTextDisabled]}>
                                        {savingLocationAndPosting ? "Posting..." : "Confirm"}
                                    </Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    </View>
                    {showTerms && (
                        <TermsAndConditions 
                            onAgree={() => { setAgree(true); setShowTerms(false); }} 
                            onClose={() => setShowTerms(false)} 
                        />
                    )}

                    {/* Caller Location Confirmation Modal (web summary overlay – native implementation) */}
                    <Modal
                        transparent
                        visible={showLocationConfirm}
                        animationType="fade"
                        onRequestClose={handleCancelLocationConfirm}
                    >
                        <TouchableWithoutFeedback onPress={handleCancelLocationConfirm}>
                            <View style={s.locationModalBackdrop} />
                        </TouchableWithoutFeedback>
                        <View style={s.locationModalContainer}>
                            <View style={s.locationModalCard}>
                                <Text style={s.locationModalTitle}>Confirm Your Location</Text>
                                <Text style={s.locationModalMessage}>
                                    Your current location right now will be used as the delivery location for this errand.
                                </Text>
                                <Text style={[s.locationModalMessage, { marginTop: rp(6) }]}>
                                    If you move to another place after posting, the runner will still go to this location.
                                </Text>
                                <Text style={[s.locationModalMessage, { marginTop: rp(6), fontWeight: "500" }]}>
                                    Do you want to continue?
                                </Text>

                                <View style={s.locationModalActions}>
                                    <TouchableOpacity
                                        style={s.locationCancelButton}
                                        onPress={handleCancelLocationConfirm}
                                        disabled={savingLocationAndPosting}
                                    >
                                        <Text style={s.locationCancelText}>Cancel</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={s.locationConfirmButton}
                                        onPress={handleConfirmLocationAndPost}
                                        disabled={savingLocationAndPosting}
                                    >
                                        <Text style={s.locationConfirmText}>
                                            {savingLocationAndPosting ? "Posting..." : "Yes, Confirm"}
                                        </Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        </View>
                    </Modal>
                </View>
            );
        }

        /* =================================================================
           📱 MOBILE SUMMARY VERSION
           ================================================================= */
        const mobileSummaryContent = (
            <>
                <View style={s.summaryCard}>
                    <View style={s.summaryItem}>
                        <Text style={s.summaryLabel}>Errand Title:</Text>
                        <Text style={s.summaryValue}>{title || ''}</Text>
                    </View>
                    <View style={s.summaryItem}>
                        <Text style={s.summaryLabel}>Errand Description:</Text>
                        <Text style={s.summaryDescription}>{desc || ''}</Text>
                    </View>
                    <View style={s.summaryItem}>
                        <Text style={s.summaryLabel}>Errand Type:</Text>
                        <Text style={s.summaryValue}>
                            {category === "Printing" && printingSize
                                ? `Printing-${printingSize}${printingColor ? `-${printingColor}` : ""}`
                                : category || ''}
                        </Text>
                    </View>
                    
                    <View style={s.summaryItem}>
                        <Text style={s.summaryLabel}>Items:</Text>
                        {items.map((it) => {
                            if (category === "Printing" && it.files && it.files.length > 0) {
                                return it.files.map((file, index) => {
                                    const isImage = 'type' in file && file.type === 'image';
                                    const fileName = isImage
                                        ? (file as ImagePicker.ImagePickerAsset).fileName || `Image ${index + 1}`
                                        : (file as DocumentPicker.DocumentPickerAsset).name;
                                    return (
                                        <Text
                                            key={`${it.id}-${index}`}
                                            style={[s.summaryBullet, { textDecorationLine: "underline" }]}
                                            onPress={() => openFilePreview(file)}
                                        >
                                            • {fileName} ({it.qty})
                                        </Text>
                                    );
                                });
                            } else {
                                return (
                                    <Text key={it.id} style={s.summaryBullet}>
                                        • {it.name} ({it.qty})
                                    </Text>
                                );
                            }
                        })}
                    </View>
                    
                    {isScheduled && (
                        <View style={s.summaryItem}>
                            <Text style={s.summaryLabel}>Completion Time:</Text>
                            <Text style={s.summaryValue}>{scheduledTime}</Text>
                        </View>
                    )}

                    <View style={s.summaryItem}>
                        <Text style={s.summaryLabel}>Price Breakdown:</Text>
                        <View style={[s.priceBreakdownContainer, { marginTop: 8, marginBottom: 0 }]}>
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
                </View>

                <View style={s.termsContainer}>
                    <TouchableOpacity
                        style={s.checkboxContainer}
                        onPress={() => {
                            if (!agree) {
                                setShowTerms(true);
                            } else {
                                setAgree(false);
                            }
                        }}
                    >
                        <View style={[s.checkbox, agree && s.checkboxSelected]}>
                            {agree && <Ionicons name="checkmark" size={12} color="white" />}
                        </View>
                        <View style={s.termsTextContainer}>
                            <Text style={s.termsText}>I acknowledge that I have read and agree to GoBuddy's </Text>
                            <TouchableOpacity onPress={() => setShowTerms(true)}>
                                <Text style={s.termsLink}>Terms and Conditions</Text>
                            </TouchableOpacity>
                        </View>
                    </TouchableOpacity>
                </View>
            </>
        );

        return (
            <SafeAreaView style={s.container}>
                <View style={s.header}>
                    <View style={s.headerContent}>
                        <Ionicons name="person" size={20} color="#8B2323" />
                        <Text style={s.headerTitle}>Errand Request Summary</Text>
                </View>
                    <View style={s.divider} />
                    </View>

                <ScrollView style={s.scrollView} showsVerticalScrollIndicator={false}>
                    {mobileSummaryContent}
                </ScrollView>

                <View style={s.actionButtonsContainer}>
                    <TouchableOpacity
                        style={[s.confirmRequestButton, !agree && s.confirmRequestButtonDisabled]} 
                        onPress={openLocationConfirmModal}
                        disabled={!agree}
                    >
                        <Text style={[s.confirmRequestText, !agree && s.confirmRequestTextDisabled]}>Confirm Request</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={s.goBackButton} onPress={() => setStep("FORM")}>
                        <Text style={s.goBackText}>Go back and edit</Text>
                    </TouchableOpacity>
                </View>

                {showTerms && (
                    <TermsAndConditions
                        onAgree={() => { setAgree(true); setShowTerms(false); }} 
                        onClose={() => setShowTerms(false)}
                    />
                )}

                {/* Caller Location Confirmation Modal (mobile summary screen) */}
                <Modal
                    transparent
                    visible={showLocationConfirm}
                    animationType="fade"
                    onRequestClose={handleCancelLocationConfirm}
                >
                    <TouchableWithoutFeedback onPress={handleCancelLocationConfirm}>
                        <View style={s.locationModalBackdrop} />
                    </TouchableWithoutFeedback>
                    <View style={s.locationModalContainer}>
                        <View style={s.locationModalCard}>
                            <Text style={s.locationModalTitle}>Confirm Your Location</Text>
                            <Text style={s.locationModalMessage}>
                                Your current location right now will be used as the delivery location for this errand.
                            </Text>
                            <Text style={[s.locationModalMessage, { marginTop: rp(6) }]}>
                                If you move to another place after posting, the runner will still go to this location.
                            </Text>
                            <Text style={[s.locationModalMessage, { marginTop: rp(6), fontWeight: "500" }]}>
                                Do you want to continue?
                            </Text>

                            <View style={s.locationModalActions}>
                                <TouchableOpacity
                                    style={s.locationCancelButton}
                                    onPress={handleCancelLocationConfirm}
                                    disabled={savingLocationAndPosting}
                                >
                                    <Text style={s.locationCancelText}>Cancel</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={s.locationConfirmButton}
                                    onPress={handleConfirmLocationAndPost}
                                    disabled={savingLocationAndPosting}
                                >
                                    <Text style={s.locationConfirmText}>
                                        {savingLocationAndPosting ? "Posting..." : "Yes, Confirm"}
                                    </Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    </View>
                </Modal>

                {/* Location permission required modal (mobile + native) */}
                <Modal
                    transparent
                    visible={showLocationPermissionModal}
                    animationType="fade"
                    onRequestClose={() => setShowLocationPermissionModal(false)}
                >
                    <TouchableWithoutFeedback onPress={() => setShowLocationPermissionModal(false)}>
                        <View style={s.locationModalBackdrop} />
                    </TouchableWithoutFeedback>
                    <View style={s.locationModalContainer}>
                        <View style={s.locationModalCard}>
                            <Text style={s.locationModalTitle}>Location Required</Text>
                            <Text style={s.locationModalMessage}>
                                We need your location to post this errand.
                            </Text>
                            <Text style={[s.locationModalMessage, { marginTop: rp(6) }]}>
                                Please enable location services and try again.
                            </Text>

                            <View style={s.locationModalActions}>
                                <TouchableOpacity
                                    style={s.locationCancelButton}
                                    onPress={() => setShowLocationPermissionModal(false)}
                                >
                                    <Text style={s.locationCancelText}>Cancel</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={s.locationConfirmButton}
                                    onPress={async () => {
                                        setShowLocationPermissionModal(false);
                                        try {
                                            if (Linking.openSettings) {
                                                await Linking.openSettings();
                                            }
                                        } catch (err) {
                                            console.error("Error opening settings:", err);
                                        }
                                    }}
                                >
                                    <Text style={s.locationConfirmText}>Open Settings</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    </View>
                </Modal>

                {/* Fullscreen file preview for Printing items (summary step) */}
                {previewFile && (
                    <Modal
                        visible={previewVisible}
                        transparent
                        animationType="fade"
                        onRequestClose={closeFilePreview}
                    >
                        <TouchableWithoutFeedback onPress={closeFilePreview}>
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
                                                    <Image
                                                        source={{ uri: anyFile.uri }}
                                                        style={s.previewImage}
                                                        resizeMode="contain"
                                                    />
                                                );
                                            }
                                            return (
                                                <View style={s.previewDocContainer}>
                                                    <Text style={s.previewDocText}>
                                                        This file will open in your device's viewer.
                                                    </Text>
                                                    <TouchableOpacity
                                                        style={s.previewOpenBtn}
                                                        onPress={async () => {
                                                            const uri: string | undefined = anyFile?.uri;
                                                            if (!uri) {
                                                                Alert.alert("Unable to open file", "No file URI is available.");
                                                                return;
                                                            }

                                                            try {
                                                                if (uri.startsWith("http://") || uri.startsWith("https://")) {
                                                                    await Linking.openURL(uri);
                                                                    return;
                                                                }

                                                                const isSharingAvailable = await Sharing.isAvailableAsync();
                                                                if (isSharingAvailable) {
                                                                    await Sharing.shareAsync(uri);
                                                                    return;
                                                                }

                                                                await Linking.openURL(uri);
                                                            } catch (err) {
                                                                console.error("Error opening document:", err);
                                                                Alert.alert(
                                                                    "Unable to open file",
                                                                    "An error occurred while opening the document on your device."
                                                                );
                                                            }
                                                        }}
                                                    >
                                                        <Text style={s.previewOpenBtnText}>Open document</Text>
                                                    </TouchableOpacity>
                                                </View>
                                            );
                                        })()}
                                    </View>
                                </View>
                            </View>
                        </TouchableWithoutFeedback>
                    </Modal>
                )}

                {/* Custom Success Modal - matches commission design */}
                {showSuccessModal && (
                    <View style={s.successModalOverlay}>
                        <View style={s.successModalContainer}>
                            <View style={s.successModalContent}>
                                <View style={s.successIconContainer}>
                                    <Ionicons name="checkmark-circle" size={56} color="#10B981" />
                                </View>
                                <Text style={s.successModalTitle}>Success</Text>
                                <Text style={s.successModalMessage}>Your errand has been posted.</Text>
                                <TouchableOpacity
                                    style={s.successModalButton}
                                    onPress={() => {
                                        setShowSuccessModal(false);
                                        router.back();
                                    }}
                                    activeOpacity={0.9}
                                >
                                    <Text style={s.successModalButtonText}>OK</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    </View>
                )}
            </SafeAreaView>
        );
    }

    /* ---------- ORIGINAL FORM ---------- */
    return (
        <Wrapper>
            {/* make sure mobile root fills height so footer can pin to screen bottom */}
            <View style={isWeb ? s.cardBody : s.mobileRoot}>
                {/* Header - matches Post Commission format */}
                {isWeb ? (
                    <View style={s.headerRow}>
                        <Text style={s.headerText}>Post an Errand</Text>
                        <TouchableOpacity onPress={close} accessibilityRole="button">
                            <Text style={s.closeX}>X</Text>
                        </TouchableOpacity>
                    </View>
                ) : (
                    <>
                        <View style={s.mobileHeader}>
                            <TouchableOpacity onPress={close} style={s.backBtn} accessibilityRole="button">
                                <Ionicons name="chevron-back" size={20} color="#333" />
                            </TouchableOpacity>
                            <Text style={s.mobileHeaderTitle}>Post an Errand</Text>
                        </View>
                        <View style={s.mobileDivider} />
                    </>
                )}

                {isWeb ? (
                    /* =================================================================
                       🌐 WEB VERSION - TWO COLUMN LAYOUT
                       ================================================================= */
                    <View style={s.webFormContainer}>
                        {/* ==================== LEFT COLUMN ==================== */}
                        <View style={s.leftColumn}>
                            
                            {/* 📝 TITLE SECTION */}
                            <View style={s.webFormGroup}>
                                <Text style={s.webLabel}>Errand Title:</Text>
                                <TextInput
                                    placeholder="Enter errand title"
                                    value={title}
                                    onChangeText={setTitle}
                                    style={s.webInput}
                                    placeholderTextColor="#999"
                                />
                            </View>

                            
                            {/* 📄 DESCRIPTION SECTION */}
                            <View style={s.webFormGroup}>
                                <Text style={s.webLabel}>Errand Description:</Text>
                                <TextInput
                                    placeholder="Enter errand description"
                                    multiline
                                    value={desc}
                                    onChangeText={setDesc}
                                    style={[s.webInput, s.webTextArea]}
                                    placeholderTextColor="#999"
                                />
                            </View>

                            
                            {/* 🏷️ CATEGORY SECTION */}
                            <View style={s.webCategoryFormGroup}>
                                <Text style={s.webLabel}>Category:</Text>
                                <CategoryDropdown 
                                    value={category} 
                                    printingSize={printingSize}
                                    printingColor={printingColor}
                                    onSelect={setCategory} 
                                    onPrintingSizeSelect={setPrintingSize}
                                    onPrintingColorSelect={setPrintingColor}
                                    placeholder="Select Category" 
                                />
                            </View>

                            
                            {/* 💰 SUBTOTAL SECTION */}
                            <View style={s.webFormGroup}>
                                <Text style={s.webSubLabel}>Subtotal</Text>
                                <Text style={s.webSubNote}>Service fee</Text>
                            </View>
                        </View>

                        {/* ==================== RIGHT COLUMN ==================== */}
                        <View style={s.rightColumn}>
                            {/* 📦 ITEMS SECTION */}
                            <View style={s.webFormGroup}>
                                <Text style={s.webLabel}>Item to Deliver:</Text>
                                {items.map((it) => (
                                    <View key={it.id} style={s.webItemsRow}>
                                        <TextInput
                                            value={it.name}
                                            onChangeText={(t) => updateItem(it.id, { name: t })}
                                            placeholder="ex. Parcel"
                                            placeholderTextColor="#999"
                                            style={s.webItemInput}
                                        />
                                        <TextInput
                                            value={it.qty}
                                            onChangeText={(t) => updateItem(it.id, { qty: t })}
                                            placeholder="ex. 1 copy"
                                            placeholderTextColor="#999"
                                            style={s.webItemInput}
                                            keyboardType="numeric"
                                        />
                                        <TouchableOpacity style={s.webRemoveItemBtn} onPress={() => removeItem(it.id)}>
                                            <Text style={s.webRemoveItemX}>X</Text>
                                        </TouchableOpacity>
                                    </View>
                                ))}
                                <TouchableOpacity onPress={addItem}>
                                    <Text style={s.webAddMore}>+ Add more items</Text>
                                </TouchableOpacity>
                            </View>

                            
                            {/* ⏰ SCHEDULING SECTION */}
                            <View style={s.webFormGroup}>
                                <Text style={s.webLabel}>Schedule Errand:</Text>
                                <View style={s.webScheduleContainer}>
                                    <TouchableOpacity
                                        style={s.webCheckboxContainer}
                                        onPress={() => setIsScheduled(!isScheduled)}
                                    >
                                        <View style={[s.webCheckbox, isScheduled && s.webCheckboxChecked]}>
                                            {isScheduled && <Ionicons name="checkmark" size={16} color="white" />}
                                        </View>
                                        <Text style={s.webCheckboxLabel}>Schedule for later</Text>
                                    </TouchableOpacity>
                                    
                                    {isScheduled && (
                                        <View style={s.webTimeSelectionContainer}>
                                            <Text style={s.webSubLabel}>Preferred Time:</Text>
                                            <View style={s.webTimeInputsContainer}>
                                                <View style={s.webTimeInputWrapper}>
                                                    <Text style={s.webTimeInputLabel}>Hour</Text>
                                                    <TextInput
                                                        style={s.webTimeInput}
                                                        value={hour === 0 ? "" : hour.toString()}
                                                        onChangeText={(text) => {
                                                            if (text === "") {
                                                                setHour(0);
                                                                applyTime(0, minute, period);
                                                            } else {
                                                                const num = parseInt(text);
                                                                if (!isNaN(num) && num >= 1 && num <= 12) {
                                                                    if (isTimeInPast(num, minute, period)) {
                                                                        Alert.alert("Invalid Time", "Please select a time that hasn't passed yet.");
                                                                        return;
                                                                    }
                                                                    setHour(num);
                                                                    applyTime(num, minute, period);
                                                                }
                                                            }
                                                        }}
                                                        keyboardType="numeric"
                                                        maxLength={2}
                                                        placeholder="00"
                                                    />
                                                </View>
                                                <Text style={s.webTimeColon}>:</Text>
                                                <View style={s.webTimeInputWrapper}>
                                                    <Text style={s.webTimeInputLabel}>Minute</Text>
                                                    <TextInput
                                                        style={s.webTimeInput}
                                                        value={minute === 0 ? "" : minute.toString().padStart(2, '0')}
                                                        onChangeText={(text) => {
                                                            if (text === "") {
                                                                setMinute(0);
                                                                applyTime(hour, 0, period);
                                                            } else {
                                                                const num = parseInt(text);
                                                                if (!isNaN(num) && num >= 0 && num <= 59) {
                                                                    if (isTimeInPast(hour, num, period)) {
                                                                        Alert.alert("Invalid Time", "Please select a time that hasn't passed yet.");
                                                                        return;
                                                                    }
                                                                    setMinute(num);
                                                                    applyTime(hour, num, period);
                                                                }
                                                            }
                                                        }}
                                                        keyboardType="numeric"
                                                        maxLength={2}
                                                        placeholder="00"
                                                    />
                                                </View>
                                                <View style={s.webTimeInputWrapper}>
                                                    <Text style={s.webTimeInputLabel}>Period</Text>
                                                    <Dropdown 
                                                        value={period} 
                                                        onSelect={(p) => {
                                                            if (isTimeInPast(hour, minute, p as 'AM' | 'PM')) {
                                                                Alert.alert("Invalid Time", "Please select a time that hasn't passed yet.");
                                                                return;
                                                            }
                                                            selectPeriod(p as 'AM' | 'PM');
                                                        }} 
                                                        options={['AM', 'PM'] as const} 
                                                        placeholder="AM" 
                                                    />
                                                </View>
                                            </View>
                                        </View>
                                    )}
                                </View>
                            </View>

                            
                            {/* 💰 ESTIMATED PRICE SECTION */}
                            <View style={s.webFormGroup}>
                                <Text style={s.webLabel}>Estimated Price:</Text>
                                <TextInput
                                    value={estPrice}
                                    onChangeText={setEstPrice}
                                    placeholder="Price of Purchase Items"
                                    placeholderTextColor="#999"
                                    keyboardType="numeric"
                                    style={s.webInput}
                                />
                            </View>
                        </View>
                    </View>
                ) : (
                    /* =================================================================
                       📱 MOBILE VERSION - SCROLLABLE LAYOUT
                       ================================================================= */
                <ScrollView
                        style={{ flex: 1 }}
                        contentContainerStyle={[s.formAreaMobile, { paddingBottom: rh(20) }]}
                    keyboardShouldPersistTaps="handled"
                    scrollEnabled
                    showsVerticalScrollIndicator={false}
                >
                    {/* ==================== MOBILE FORM SECTIONS ==================== */}
                    
                    {/* 📝 TITLE SECTION */}
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

                    
                    {/* 📄 DESCRIPTION SECTION */}
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

                    {/*Diri Jade sa category*/}
                    {/* 🏷️ CATEGORY SECTION */}
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

                    {/*Diri Jade sa items*/}
                    {/* 📦 ITEMS SECTION */}
                    <View style={s.formGroup}>
                        <Text style={s.label}>Items:</Text>
                        {items.map((it) => (
                            <View key={it.id} style={s.itemsRow}>
                                {/* Conditionally show dropdown for Food Delivery, School Materials, file upload for Printing, or text input for other categories */}
                                {category === "Food Delivery" ? (
                                    <View style={{ flex: 3, marginRight: 8 }}>
                                        <FoodItemDropdown
                                            value={it.name}
                                            onSelect={(itemName) => updateItem(it.id, { name: itemName })}
                                            placeholder="Select food item"
                                        />
                                    </View>
                                ) : category === "School Materials" ? (
                                    <View style={{ flex: 3, marginRight: 8 }}>
                                        <SchoolMaterialDropdown
                                            value={it.name}
                                            onSelect={(itemName) => updateItem(it.id, { name: itemName })}
                                            placeholder="Select material"
                                        />
                                    </View>
                                ) : category === "Printing" ? (
                                    <FileUpload
                                        files={it.files || []}
                                        onFilesChange={(newFiles) =>
                                            updateItem(it.id, {
                                                files: newFiles,
                                                name:
                                                    (newFiles?.[0] as any)?.name ||
                                                    (newFiles?.[0] as any)?.fileName ||
                                                    it.name,
                                            })
                                        }
                                        onFilePress={(file) => openFilePreview(file)}
                                    />
                                ) : (
                                    <TextInput
                                        value={it.name}
                                        onChangeText={(t) => updateItem(it.id, { name: t })}
                                        placeholder="ex. Banana"
                                        placeholderTextColor="#999"
                                        style={[s.itemInput, { flex: 3, marginRight: 8 }]}
                                    />
                                )}
                                <TextInput
                                    value={it.qty}
                                    onChangeText={(t) => updateItem(it.id, { qty: t })}
                                    placeholder="ex. 1 pack"
                                    placeholderTextColor="#999"
                                    style={[s.itemInput, { flex: 1 }]}
                                    keyboardType="numeric"
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

                    
                    {/* ⏰ SCHEDULING SECTION */}
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
                                <Text style={s.checkboxLabel}>
                                    {isScheduled ? "Schedule for later" : "Schedule for later"}
                                </Text>
                            </TouchableOpacity>

                            {isScheduled && (
                                <View style={s.timeSelectionContainer}>
                                    <Text style={s.subLabel}>Preferred Time:</Text>
                                    <TouchableOpacity
                                        style={s.timeDisplay}
                                        onPress={() => setShowTimePicker(!showTimePicker)}
                                    >
                                        <Text style={s.timeDisplayText}>{scheduledTime}</Text>
                                        <Ionicons name={showTimePicker ? "chevron-up" : "chevron-down"} size={16} color={colors.maroon} />
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
                                                            {Array.from({ length: 12 }, (_, i) => i + 1).map(h => (
                                                                <TouchableOpacity key={h} style={[s.wheelOption, hour === h && s.selectedWheelOption]} onPress={() => selectHour(h)}>
                                                                    <Text style={[s.wheelOptionText, hour === h && s.selectedWheelOptionText]}>{h}</Text>
                                                                </TouchableOpacity>
                                                            ))}
                                                        </ScrollView>
                                                    </View>
                                                </View>
                                                <View style={s.timeWheel}>
                                                    <View style={s.wheelContainer}>
                                                        <ScrollView style={s.wheelScrollView} showsVerticalScrollIndicator={false}>
                                                            {Array.from({ length: 60 }, (_, i) => i).map(m => (
                                                                <TouchableOpacity key={m} style={[s.wheelOption, minute === m && s.selectedWheelOption]} onPress={() => selectMinute(m)}>
                                                                    <Text style={[s.wheelOptionText, minute === m && s.selectedWheelOptionText]}>{String(m).padStart(2,'0')}</Text>
                                                                </TouchableOpacity>
                                                            ))}
                                                        </ScrollView>
                                                    </View>
                                                </View>
                                                <View style={s.timeWheel}>
                                                    <View style={s.wheelContainer}>
                                                        <ScrollView style={s.wheelScrollView} showsVerticalScrollIndicator={false}>
                                                            {(['AM','PM'] as const).map(p => (
                                                                <TouchableOpacity key={p} style={[s.wheelOption, period === p && s.selectedWheelOption]} onPress={() => selectPeriod(p)}>
                                                                    <Text style={[s.wheelOptionText, period === p && s.selectedWheelOptionText]}>{p}</Text>
                                                                </TouchableOpacity>
                                                            ))}
                                                        </ScrollView>
                                                    </View>
                                                </View>
                                            </View>
                                            <TouchableOpacity
                                                style={s.timeSaveButton}
                                                onPress={() => setShowTimePicker(false)}
                                            >
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
                    </ScrollView>
                )}

                {/* ==================== WEB BUTTON SECTION ==================== */}
                    {isWeb && (
                    <View style={s.webButtonContainer}>
                        <TouchableOpacity style={s.webPrimaryBtn} onPress={handleSubmit}>
                            <Text style={s.webPrimaryBtnText}>Confirm Request</Text>
                        </TouchableOpacity>
                    </View>
                    )}

                {/* ==================== MOBILE BUTTON SECTION ==================== */}
                {!isWeb && (
                    <View style={s.buttonSection}>
                        <TouchableOpacity style={s.confirmButton} onPress={handleSubmit}>
                            <Text style={s.confirmButtonText}>Confirm Errand</Text>
                        </TouchableOpacity>
                    </View>
                )}
            </View>

            {/* Fullscreen file preview for Printing items (shared for form + summary) */}
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
                                            <Image
                                                source={{ uri: anyFile.uri }}
                                                style={s.previewImage}
                                                resizeMode="contain"
                                            />
                                        );
                                    }
                                    return (
                                        <View style={s.previewDocContainer}>
                                            <Text style={s.previewDocText}>
                                                This file will open in your device's viewer.
                                            </Text>
                                            <TouchableOpacity
                                                style={s.previewOpenBtn}
                                                onPress={async () => {
                                                    const uri: string | undefined = anyFile?.uri;
                                                    if (!uri) {
                                                        Alert.alert("Unable to open file", "No file URI is available.");
                                                        return;
                                                    }

                                                    try {
                                                        // Remote URL (http/https) → open directly in browser / in-app viewer
                                                        if (uri.startsWith("http://") || uri.startsWith("https://")) {
                                                            await Linking.openURL(uri);
                                                            return;
                                                        }

                                                        // Local file URI → prefer system share sheet / Open In…
                                                        const isSharingAvailable = await Sharing.isAvailableAsync();
                                                        if (isSharingAvailable) {
                                                            await Sharing.shareAsync(uri);
                                                            return;
                                                        }

                                                        // Fallback: try opening the file URI directly
                                                        await Linking.openURL(uri);
                                                    } catch (err) {
                                                        console.error("Error opening document:", err);
                                                        Alert.alert(
                                                            "Unable to open file",
                                                            "An error occurred while opening the document on your device."
                                                        );
                                                    }
                                                }}
                                            >
                                                <Text style={s.previewOpenBtnText}>Open document</Text>
                                            </TouchableOpacity>
                                        </View>
                                    );
                                })()}
                            </View>
                        </View>
                    </View>
                </Modal>
            )}

            {/* Custom Success Modal - matches commission design */}
            {showSuccessModal && (
                <View style={s.successModalOverlay}>
                    <View style={s.successModalContainer}>
                        <View style={s.successModalContent}>
                            <View style={s.successIconContainer}>
                                <Ionicons name="checkmark-circle" size={56} color="#10B981" />
                            </View>
                            <Text style={s.successModalTitle}>Success</Text>
                            <Text style={s.successModalMessage}>Your errand has been posted.</Text>
                            <TouchableOpacity
                                style={s.successModalButton}
                                onPress={() => {
                                    setShowSuccessModal(false);
                                    router.back();
                                }}
                                activeOpacity={0.9}
                            >
                                <Text style={s.successModalButtonText}>OK</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            )}
        </Wrapper>
    );
}

/* ========================= Styles (original + new) ========================= */
const s = StyleSheet.create({
    webOverlay: {
        position: "fixed" as any,
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
        backgroundColor: "rgba(0,0,0,0.40)", // grayish transparent
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
        height: "90vh" as any,
        display: "flex",
        backgroundColor: 'white',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#8B2323',
        overflow: "hidden",
        ...(Platform.OS === "web" ? { boxShadow: "0px 10px 28px rgba(0,0,0,0.12)" } : {}),
    },
    cardBody: {
        padding: 16,
        flex: 1,
    },
    // must fill screen on mobile so absolute footer pins to true bottom
    mobileRoot: {
        flex: 1,
        backgroundColor: 'white',
    },

    headerRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        marginTop: 2,
        marginBottom: 12,
        paddingHorizontal: 4,
    },
    headerLeft: {
        flexDirection: "row",
        alignItems: "center",
    },
    headerIcon: {
        marginRight: 8,
    },
    headerText: {
        fontSize: 16,
        fontWeight: "600",
        color: "#333",
    },
    closeX: {
        fontSize: 18,
        color: "#8B2323",
        fontWeight: "600",
    },

    mobileHeader: {
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: rp(16),
        paddingTop: rp(16),
        paddingBottom: rp(12),
    },
    mobileHeaderCenter: {
        flex: 1,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
    },
    mobileHeaderText: {
        fontSize: rf(16),
        fontWeight: "600",
        color: colors.maroon,
    },
    headerSpacer: {
        width: rw(10), // Same width as back button to center the title
    },
    backBtn: {
        width: rw(8.5),
        height: rw(8.5),
        borderRadius: rb(8),
        alignItems: "center",
        justifyContent: "center",
        marginRight: rp(6),
    },
    mobileHeaderTitle: {
        color: "#333",
        fontSize: rf(16),
        fontWeight: "600",
    },
    mobileDivider: {
        height: 1,
        backgroundColor: "#e0e0e0",
        marginBottom: 8,
    },

    formAreaWeb: {
        paddingHorizontal: rp(4),
        paddingBottom: rp(16),
    },
    formAreaMobile: {
        paddingVertical: rp(8),
    },

    formGroup: { paddingHorizontal: rp(16), paddingVertical: rp(8), gap: rp(6) },

    label: {
        color: "#333",
        marginBottom: rp(4),
        fontWeight: "500",
        fontSize: rf(14),
    },
    labelFirst: {
        marginTop: 8,
    },
    input: {
        borderWidth: 1,
        borderColor: "#8B2323",
        backgroundColor: "white",
        borderRadius: rb(4),
        paddingHorizontal: rp(12),
        paddingVertical: rp(10),
        color: "#333",
        fontSize: rf(14),
        height: rh(5.5),
    },
    textArea: {
        minHeight: rh(8),
        height: rh(8),
        textAlignVertical: "top",
    },

    selectRow: {
        position: "relative",
        justifyContent: "center",
        marginBottom: 0,
        zIndex: 100,
        ...(Platform.OS === "web" ? { zIndex: 1000 } : {}),
    },
    selectInput: {
        paddingRight: rp(28),
        height: rh(5.5),
        ...(Platform.OS === "web" ? {
            paddingHorizontal: 6,
            paddingVertical: 6,
            height: 32,
            fontSize: 12,
        } : {}),
    },
    caretWrap: {
        position: "absolute",
        right: rp(10),
        top: 0,
        bottom: 0,
        justifyContent: "center",
        alignItems: "center",
    },

    sectionTitle: {
        color: "#333",
        marginTop: rp(8),
        marginBottom: rp(4),
        fontWeight: "500",
        fontSize: rf(14),
    },
    itemsRow: {
        flexDirection: "row",
        alignItems: "center",
        marginBottom: rp(8),
        marginTop: rp(4),
        gap: rp(6),
    },
    removeItemBtn: {
        marginLeft: rp(8),
        width: rw(7),
        height: rw(7),
        borderRadius: rb(14),
        borderWidth: 1,
        borderColor: "#8B0000",
        alignItems: "center",
        justifyContent: "center",
    },
    removeItemX: {
        color: colors.maroon,
        fontWeight: "600",
    },
    addMore: {
        color: "#8B2323",
        marginTop: rp(8),
        marginBottom: rp(8),
        fontSize: rf(14),
    },

    // Web two-column layout
    webFormContainer: {
        flex: 1,
        flexDirection: "row",
        padding: 20,
        gap: 30,
    },
    leftColumn: {
        flex: 1,
        paddingRight: 15,
    },
    rightColumn: {
        flex: 1,
        paddingLeft: 15,
    },

    // Web-specific form styles (matching the image)
    webFormGroup: {
        marginBottom: 20,
    },
    webCategoryFormGroup: {
        marginBottom: 20,
        position: "relative",
        zIndex: 1000,
    },
    webLabel: {
        color: "#8B2323",
        marginBottom: 8,
        fontWeight: "600",
        fontSize: 16,
    },
    webInput: {
        borderWidth: 1,
        borderColor: "#8B2323",
        backgroundColor: "white",
        borderRadius: 4,
        paddingHorizontal: 12,
        paddingVertical: 10,
        color: "#333",
        fontSize: 14,
        height: 44,
        width: "100%",
    },
    webTextArea: {
        minHeight: 80,
        height: 80,
        textAlignVertical: "top",
    },
    webSubLabel: {
        color: "#8B2323",
        fontWeight: "600",
        fontSize: 14,
        marginBottom: 4,
    },
    webSubNote: {
        color: "#8B2323",
        fontSize: 14,
        opacity: 0.8,
    },
    webItemsRow: {
        flexDirection: "row",
        alignItems: "center",
        marginBottom: 8,
        gap: 8,
    },
    webItemInput: {
        borderWidth: 1,
        borderColor: "#8B2323",
        backgroundColor: "white",
        borderRadius: 4,
        paddingHorizontal: 12,
        paddingVertical: 10,
        color: "#333",
        fontSize: 14,
        height: 44,
        flex: 1,
    },
    webRemoveItemBtn: {
        marginLeft: 8,
        width: 32,
        height: 32,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: "#8B0000",
        alignItems: "center",
        justifyContent: "center",
    },
    webRemoveItemX: {
        color: "#8B2323",
        fontWeight: "600",
        fontSize: 16,
    },
    webAddMore: {
        color: "#8B2323",
        marginTop: 8,
        fontSize: 14,
        fontWeight: "500",
    },
    webCheckboxContainer: {
        flexDirection: "row",
        alignItems: "center",
        marginTop: 8,
    },
    webCheckbox: {
        width: 20,
        height: 20,
        borderWidth: 1,
        borderColor: "#8B2323",
        borderRadius: 4,
        marginRight: 8,
        alignItems: "center",
        justifyContent: "center",
    },
    webCheckboxChecked: {
        backgroundColor: "#8B2323",
    },
    webCheckboxLabel: {
        fontSize: 14,
        color: "#8B2323",
        fontWeight: "500",
    },
    webScheduleContainer: {
        borderWidth: 1,
        borderColor: "#8B2323",
        borderRadius: 4,
        backgroundColor: "white",
        padding: 12,
        gap: 12,
    },
    webTimeSelectionContainer: {
        marginTop: 8,
        gap: 8,
    },
    webTimeInputsContainer: {
        flexDirection: "row",
        alignItems: "flex-end",
        gap: 8,
    },
    webTimeInputWrapper: {
        flex: 1,
        alignItems: "center",
    },
    webTimeInputLabel: {
        fontSize: 10,
        color: "#8B2323",
        fontWeight: "600",
        marginBottom: 2,
    },
    webTimeInput: {
        borderWidth: 1,
        borderColor: "#8B2323",
        backgroundColor: "white",
        borderRadius: 4,
        paddingHorizontal: 6,
        paddingVertical: 6,
        color: "#333",
        fontSize: 12,
        height: 32,
        width: "100%",
        textAlign: "center",
    },
    webTimeColon: {
        fontSize: 14,
        color: "#8B2323",
        fontWeight: "600",
        marginBottom: 16,
    },
    webButtonContainer: {
        padding: 20,
        alignItems: "center",
    },
    webPrimaryBtn: {
        backgroundColor: "#8B2323",
        borderRadius: 6,
        paddingVertical: 12,
        paddingHorizontal: 24,
        alignItems: "center",
        height: 48,
        justifyContent: "center",
        minWidth: 200,
    },
    webPrimaryBtnText: {
        color: "white",
        fontWeight: "600",
        fontSize: 16,
    },

    // Item input styles (less stretched)
    itemInput: {
        borderWidth: 1,
        borderColor: "#8B2323",
        backgroundColor: "white",
        borderRadius: rb(4),
        paddingHorizontal: rp(10),
        paddingVertical: rp(8),
        color: "#333",
        fontSize: rf(13),
        height: rh(5.5),
        flex: 1,
    },

    // Scheduling styles
    schedulingContainer: {
        borderWidth: 1,
        borderColor: "#8B2323",
        borderRadius: rb(4),
        backgroundColor: "white",
        padding: rp(12),
        gap: rp(12),
    },
    checkboxLabel: {
        fontSize: rf(13),
        color: "#333",
    },
    timeSelectionContainer: {
        marginTop: rp(8),
        gap: rp(8),
    },
    timeDisplay: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: rp(12),
        paddingVertical: rp(10),
        borderWidth: 1,
        borderColor: "#8B2323",
        borderRadius: rb(4),
        backgroundColor: "white",
        height: rh(5.5),
    },
    timeDisplayText: {
        fontSize: rf(14),
        color: "#333",
        fontWeight: "500",
    },
    timePickerContainer: {
        backgroundColor: "white",
        borderRadius: rb(8),
        padding: rp(16),
        marginTop: rp(8),
        borderWidth: 2,
        borderColor: "#8B2323",
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 4,
        elevation: 5,
    },
    pickerTitle: {
        fontSize: rf(14),
        color: "#8B2323",
        fontWeight: "600",
        marginBottom: rp(12),
        textAlign: "center",
    },
    timeHeadersContainer: {
        flexDirection: "row",
        justifyContent: "space-around",
        alignItems: "center",
        marginBottom: rp(12),
        paddingHorizontal: rp(20),
    },
    timeHeader: {
        fontSize: rf(14),
        color: "#8B2323",
        fontWeight: "600",
    },
    timeColon: {
        fontSize: rf(14),
        color: "#8B2323",
        fontWeight: "600",
    },
    timeWheelsContainer: {
        flexDirection: "row",
        justifyContent: "space-around",
        marginVertical: rp(8),
    },
    timeWheel: {
        flex: 1,
        alignItems: "center",
        marginHorizontal: rp(4),
    },
    wheelContainer: {
        height: rh(15),
        width: rw(17.5),
    },
    wheelScrollView: {
        height: rh(15),
        width: rw(17.5),
        borderWidth: 1,
        borderColor: "#8B2323",
        borderRadius: rb(8),
        backgroundColor: "#f9f9f9",
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 2,
    },
    wheelOption: {
        height: rh(4.5),
        justifyContent: "center",
        alignItems: "center",
        marginVertical: rp(2),
        borderRadius: rb(4),
        backgroundColor: "transparent",
    },
    selectedWheelOption: {
        backgroundColor: "#f0f0f0",
        borderWidth: 1,
        borderColor: "#8B2323",
    },
    wheelOptionText: {
        fontSize: rf(16),
        color: "#8B2323",
        fontWeight: "500",
    },
    selectedWheelOptionText: {
        color: "#8B2323",
        fontWeight: "600",
    },
    timeSaveButton: {
        backgroundColor: "transparent",
        alignItems: "center",
        marginTop: rp(16),
        paddingVertical: rp(8),
    },
    timeSaveButtonText: {
        color: "#8B2323",
        fontSize: rf(16),
        fontWeight: "600",
    },

    // WEB inline dropdown
    dropdownPanel: {
        position: "absolute",
        left: 0,
        right: 0,
        top: "100%",
        marginTop: rp(6),
        backgroundColor: "white",
        borderWidth: 1,
        borderColor: "#8B2323",
        borderRadius: rb(4),
        maxHeight: rh(27.5),
        overflow: "hidden",
        zIndex: 99999,
        ...(Platform.OS === "web" ? { 
            boxShadow: "0px 2px 6px rgba(0,0,0,0.06)",
            zIndex: 999999,
            maxHeight: 80,
        } : {}),
        elevation: 6,
    },
    // NATIVE modal dropdown panel container
    modalBackdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: "transparent",
    },
    modalRoot: {
        position: "absolute",
    },
    dropdownPanelNative: {
        backgroundColor: "white",
        borderWidth: 1,
        borderColor: "#8B2323",
        borderRadius: 4,
        overflow: "hidden",
        elevation: 8,
    },
    dropdownItem: {
        paddingVertical: rp(10),
        paddingHorizontal: rp(12),
        ...(Platform.OS === "web" ? {
            paddingVertical: 6,
            paddingHorizontal: 8,
        } : {}),
    },
    dropdownItemText: {
        color: "#333",
        fontSize: rf(14),
        ...(Platform.OS === "web" ? { fontSize: 12 } : {}),
    },

    // Food dropdown specific styles
    foodDropdownPanel: {
        position: "absolute",
        left: 0,
        right: 0,
        top: "100%",
        marginTop: 6,
        backgroundColor: "white",
        borderWidth: 1,
        borderColor: "#8B2323",
        borderRadius: 4,
        maxHeight: 220,
        overflow: "hidden",
        zIndex: 99999,
        ...(Platform.OS === "web" ? { 
            boxShadow: "0px 6px 18px rgba(0,0,0,0.12)",
            zIndex: 999999,
        } : {}),
        elevation: 12,
    },
    foodDropdownPanelNative: {
        backgroundColor: "white",
        borderWidth: 1,
        borderColor: "#8B2323",
        borderRadius: 4,
        overflow: "hidden",
        elevation: 8,
    },
    foodSection: {
        borderBottomWidth: 1,
        borderBottomColor: "#f0f0f0",
    },
    foodSectionHeader: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        paddingVertical: 12,
        paddingHorizontal: 16,
        backgroundColor: "#f9f9f9",
    },
    foodSectionTitle: {
        flexDirection: "row",
        alignItems: "center",
    },
    foodSectionText: {
        fontSize: 16,
        fontWeight: "700",
        color: "#333",
    },
    foodSectionContent: {
        paddingVertical: 8,
    },
    foodItemRow: {
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 10,
        paddingHorizontal: 16,
    },
    foodCheckbox: {
        width: 20,
        height: 20,
        borderRadius: 4,
        borderWidth: 2,
        borderColor: "#8B2323",
        backgroundColor: "white",
        alignItems: "center",
        justifyContent: "center",
        marginRight: 12,
    },
    foodItemInfo: {
        flex: 1,
    },
    foodItemName: {
        fontSize: 14,
        fontWeight: "500",
        color: "#333",
        marginBottom: 2,
    },
    foodItemPrice: {
        fontSize: 12,
        color: "#666",
    },
    printingPrice: {
        fontSize: 12,
        color: "#666",
    },

    // File upload styles
    fileUploadButton: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        borderWidth: 1,
        borderColor: "#8B2323",
        backgroundColor: "white",
        borderRadius: 4,
        paddingHorizontal: 12,
        paddingVertical: 10,
        height: 44,
    },
    fileUploadText: {
        flex: 1,
        marginHorizontal: 8,
        fontSize: 14,
        color: "#333",
    },
    fileUploadButtonDisabled: {
        backgroundColor: "#f5f5f5",
        borderColor: "#ccc",
    },
    fileUploadTextDisabled: {
        color: "#999",
    },
    fileList: {
        marginTop: 8,
        maxHeight: 120,
    },
    fileItem: {
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 6,
        paddingHorizontal: 8,
        backgroundColor: "#f9f9f9",
        borderRadius: 4,
        marginBottom: 4,
        borderWidth: 1,
        borderColor: "#e0e0e0",
    },
    fileName: {
        flex: 1,
        marginLeft: 8,
        fontSize: 12,
        color: "#333",
    },
    removeFileBtn: {
        width: 20,
        height: 20,
        borderRadius: 10,
        backgroundColor: "#f0f0f0",
        alignItems: "center",
        justifyContent: "center",
        marginLeft: 8,
    },

    subLabel: {
        color: "#333",
        fontWeight: "600",
        fontSize: rf(14),
    },
    subNote: {
        color: "#333",
        opacity: 0.7,
        marginTop: rp(2),
        fontSize: rf(12),
    },
    // Price Breakdown styles
    priceBreakdownContainer: {
        borderWidth: 1,
        borderColor: "#E5C8C5",
        borderRadius: rb(8),
        backgroundColor: "#FAF6F5",
        padding: rp(12),
        marginTop: rp(8),
    },
    priceBreakdownRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        paddingVertical: rp(6),
    },
    priceBreakdownItemInfo: {
        flex: 1,
        flexDirection: "row",
        alignItems: "center",
        gap: rp(8),
    },
    priceBreakdownItemName: {
        fontSize: rf(13),
        color: "#333",
        fontWeight: "500",
    },
    priceBreakdownItemQty: {
        fontSize: rf(12),
        color: "#666",
    },
    priceBreakdownItemTotal: {
        fontSize: rf(13),
        color: "#333",
        fontWeight: "600",
    },
    schoolItemPrice: {
        fontSize: 12,
        color: "#666",
    },
    priceBreakdownDivider: {
        height: 1,
        backgroundColor: "#E5C8C5",
        marginVertical: rp(8),
    },
    priceBreakdownLabel: {
        fontSize: rf(13),
        color: "#333",
        fontWeight: "500",
    },
    priceBreakdownValue: {
        fontSize: rf(13),
        color: "#333",
        fontWeight: "600",
    },
    priceBreakdownTotalRow: {
        marginTop: rp(4),
    },
    priceBreakdownTotalLabel: {
        fontSize: rf(15),
        color: "#8B2323",
        fontWeight: "700",
    },
    priceBreakdownTotalValue: {
        fontSize: rf(15),
        color: "#8B2323",
        fontWeight: "700",
    },
    priceBreakdownEmptyText: {
        fontSize: rf(12),
        color: "#999",
        fontStyle: "italic",
        textAlign: "center",
        width: "100%",
    },

    // Buttons
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
    primaryBtnDisabled: {
        backgroundColor: "#ccc",
    },
    primaryBtnTextDisabled: {
        color: "#999",
    },

    // Summary visuals - matching CommissionSummary
    container: { 
        flex: 1, 
        backgroundColor: '#f0f0f0', 
        width: '100%', 
        height: '100%' 
    },
    header: { 
        backgroundColor: 'white', 
        paddingHorizontal: rp(16), 
        paddingTop: rp(16), 
        paddingBottom: rp(12) 
    },
    headerContent: { 
        flexDirection: 'row', 
        alignItems: 'center', 
        gap: rp(12) 
    },
    headerTitle: { 
        fontSize: rf(16), 
        fontWeight: '600', 
        color: '#8B2323' 
    },
    divider: { 
        height: 1, 
        backgroundColor: '#e0e0e0', 
        marginTop: rp(12) 
    },
    scrollView: { 
        flex: 1, 
        backgroundColor: '#f0f0f0' 
    },
    summaryCard: { 
        backgroundColor: 'white', 
        margin: rp(16), 
        borderRadius: rb(8),
        borderWidth: 1, 
        borderColor: '#8B2323', 
        padding: rp(16), 
        shadowColor: '#000', 
        shadowOffset: { width: 0, height: 2 }, 
        shadowOpacity: 0.1, 
        shadowRadius: 4, 
        elevation: 3,
        ...(Platform.OS === "web" ? { boxShadow: "0px 4px 12px rgba(0,0,0,0.06)" } : {}),
    },
    summaryTitle: {
        fontSize: 18,
        fontWeight: '900',
        marginBottom: 12,
        color: '#8B2323',
    },
    summaryList: {
        gap: 4,
    },
    summaryItem: { 
        marginBottom: rp(12) 
    },
    summaryLine: {
        color: '#333',
        fontSize: 14,
    },
    summaryLabel: { 
        fontSize: rf(14), 
        fontWeight: '600', 
        color: '#8B2323', 
        marginBottom: rp(4) 
    },
    summaryValue: { 
        fontSize: rf(14), 
        color: '#8B2323', 
        lineHeight: rf(20) 
    },
    summaryDescription: { 
        fontSize: rf(14), 
        color: '#666', 
        lineHeight: rf(20) 
    },
    summaryBullet: {
        color: '#666',
        fontSize: rf(14),
        lineHeight: rf(20),
    },

    termsContainer: { 
        margin: rp(16), 
        marginTop: rp(8) 
    },
    termsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 16,
    },
    checkboxContainer: { 
        flexDirection: 'row', 
        alignItems: 'center', 
        gap: rp(8) 
    },
    checkbox: { 
        width: rw(4), 
        height: rw(4), 
        borderWidth: 1, 
        borderColor: '#8B2323', 
        borderRadius: rb(2), 
        backgroundColor: 'white', 
        justifyContent: 'center', 
        alignItems: 'center', 
    },
    checkboxSelected: { 
        backgroundColor: '#8B2323' 
    },
    categoryContainer: {
        borderWidth: 1,
        borderColor: '#8B2323',
        borderRadius: rb(4),
        backgroundColor: 'white',
        padding: rp(12),
        marginTop: rp(8),
    },
    categorySection: { 
        marginBottom: rp(12) 
    },
    categoryHeader: { 
        flexDirection: 'row', 
        alignItems: 'center', 
        gap: rp(6), 
        paddingVertical: rp(4) 
    },
    categoryTitle: { 
        fontSize: rf(13), 
        fontWeight: '600', 
        color: '#333' 
    },
    categoryContent: { 
        marginLeft: rp(16), 
        marginTop: rp(8), 
        gap: rp(6) 
    },
    termsTextContainer: { 
        flexDirection: 'row', 
        flexWrap: 'wrap', 
        flex: 1 
    },
    termsText: { 
        fontSize: rf(12), 
        color: '#666', 
        lineHeight: rf(16) 
    },
    termsLink: { 
        fontSize: rf(12), 
        color: '#8B2323', 
        textDecorationLine: 'underline', 
        lineHeight: rf(16) 
    },

    // File preview modal
    previewOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: "rgba(0,0,0,0.65)",
        justifyContent: "center",
        alignItems: "center",
        padding: rp(16),
    },
    previewContent: {
        backgroundColor: "#fff",
        borderRadius: rb(8),
        width: "100%",
        maxWidth: 420,
        maxHeight: "85%",
        padding: rp(16),
    },
    previewHeader: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: rp(8),
    },
    previewTitle: {
        fontSize: rf(16),
        fontWeight: "600",
        color: "#333",
    },
    previewCloseX: {
        fontSize: rf(18),
        fontWeight: "600",
        color: colors.maroon,
    },
    previewBody: {
        alignItems: "center",
        justifyContent: "center",
        marginTop: rp(4),
    },
    previewImage: {
        width: "100%",
        height: rh(40),
        borderRadius: rb(4),
        backgroundColor: "#000",
    },
    previewDocContainer: {
        alignItems: "center",
        justifyContent: "center",
        paddingVertical: rp(16),
    },
    previewDocText: {
        fontSize: rf(13),
        color: "#333",
        textAlign: "center",
        marginBottom: rp(12),
    },
    previewOpenBtn: {
        backgroundColor: colors.maroon,
        borderRadius: rb(4),
        paddingHorizontal: rp(16),
        paddingVertical: rp(8),
    },
    previewOpenBtnText: {
        color: "#fff",
        fontWeight: "600",
        fontSize: rf(13),
    },

    // Action rows (web)
    actionsRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        paddingTop: 8,
        gap: 10,
    },

    // Button section - matching CommissionSummary
    actionButtonsContainer: { 
        backgroundColor: 'white', 
        padding: rp(16), 
        gap: rp(12) 
    },
    confirmRequestButton: { 
        backgroundColor: '#8B2323', 
        paddingVertical: rp(12), 
        borderRadius: rb(6), 
        alignItems: 'center', 
        height: rh(6), 
        justifyContent: 'center' 
    },
    confirmRequestText: { 
        color: 'white', 
        fontSize: rf(15), 
        fontWeight: '600' 
    },
    confirmRequestButtonDisabled: { 
        backgroundColor: '#ccc' 
    },
    confirmRequestTextDisabled: { 
        color: '#999' 
    },
    goBackButton: { 
        backgroundColor: 'white', 
        paddingVertical: rp(12), 
        borderRadius: rb(6), 
        alignItems: 'center', 
        height: rh(6), 
        justifyContent: 'center', 
        borderWidth: 1, 
        borderColor: '#8B2323' 
    },
    goBackText: { 
        color: '#8B2323', 
        fontSize: rf(15), 
        fontWeight: '600' 
    },
    
    // Legacy styles for form section
    buttonSection: {
        backgroundColor: "#8B2323",
        padding: 16,
    },
    confirmButton: {
        backgroundColor: "#fff",
        paddingVertical: 12,
        borderRadius: 6,
        alignItems: "center",
        height: 48,
        justifyContent: "center",
    },
    confirmButtonText: {
        color: "#8B2323",
        fontSize: rf(15),
        fontWeight: "600",
    },
    // Location confirmation modal
    locationModalBackdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: "rgba(0,0,0,0.45)",
    },
    locationModalContainer: {
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        padding: rp(24),
    },
    locationModalCard: {
        width: "100%",
        maxWidth: 420,
        backgroundColor: "#FFFFFF",
        borderRadius: rb(10),
        padding: rp(18),
        borderWidth: 1,
        borderColor: colors.maroon,
    },
    locationModalTitle: {
        fontSize: rf(16),
        fontWeight: "700",
        color: colors.maroon,
        marginBottom: rp(8),
        textAlign: "left",
    },
    locationModalMessage: {
        fontSize: rf(13),
        color: "#333",
        lineHeight: rf(18),
    },
    locationModalActions: {
        flexDirection: "row",
        justifyContent: "flex-end",
        marginTop: rp(16),
        gap: rp(10),
    },
    locationCancelButton: {
        paddingVertical: rp(10),
        paddingHorizontal: rp(14),
        borderRadius: rb(6),
        borderWidth: 1,
        borderColor: colors.maroon,
        backgroundColor: "#FFFFFF",
        minWidth: rw(20),
        alignItems: "center",
        justifyContent: "center",
    },
    locationCancelText: {
        color: colors.maroon,
        fontWeight: "600",
        fontSize: rf(14),
    },
    locationConfirmButton: {
        paddingVertical: rp(10),
        paddingHorizontal: rp(16),
        borderRadius: rb(6),
        backgroundColor: colors.maroon,
        minWidth: rw(28),
        alignItems: "center",
        justifyContent: "center",
    },
    locationConfirmText: {
        color: "#FFFFFF",
        fontWeight: "600",
        fontSize: rf(14),
    },
    
    // Success Modal Styles (matching commission design)
    successModalOverlay: {
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0, 0, 0, 0.5)",
        justifyContent: "center",
        alignItems: "center",
        zIndex: 1000,
    },
    successModalContainer: {
        backgroundColor: "white",
        borderRadius: rb(12),
        padding: rp(24),
        minWidth: rw(80),
        maxWidth: rw(90),
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
        marginBottom: rp(16),
    },
    successModalTitle: {
        fontSize: rf(24),
        fontWeight: "700",
        color: "#10B981",
        marginBottom: rp(8),
    },
    successModalMessage: {
        fontSize: rf(16),
        color: "#374151",
        textAlign: "center",
        marginBottom: rp(24),
        lineHeight: rf(22),
    },
    successModalButton: {
        backgroundColor: "#8B2323",
        borderRadius: rb(8),
        paddingVertical: rp(12),
        paddingHorizontal: rp(24),
        minWidth: rw(25),
    },
    successModalButtonText: {
        color: "white",
        fontSize: rf(16),
        fontWeight: "600",
        textAlign: "center",
    },
});


