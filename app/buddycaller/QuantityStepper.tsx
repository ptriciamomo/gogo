import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View, ViewStyle } from "react-native";

type QuantityStepperProps = {
    value: string;
    onChange: (qty: string) => void;
    hasItem?: boolean;
    style?: ViewStyle;
    size?: "default" | "web";
};

export default function QuantityStepper({ value, onChange, hasItem = false, style, size = "default" }: QuantityStepperProps) {
    const displayQty = hasItem ? Math.max(1, parseInt(String(value), 10) || 1) : 0;
    const isMin = !hasItem || displayQty <= 1;
    const btnSize = size === "web" ? 32 : 28;
    const iconSize = size === "web" ? 18 : 16;

    const handleDecrement = () => {
        if (!hasItem || displayQty <= 1) return;
        onChange(String(displayQty - 1));
    };

    const handleIncrement = () => {
        if (!hasItem) return;
        onChange(String(displayQty + 1));
    };

    return (
        <View style={[styles.container, style]}>
            <TouchableOpacity
                style={[styles.button, { width: btnSize, height: btnSize, borderRadius: btnSize / 2 }]}
                onPress={handleDecrement}
                disabled={isMin}
                activeOpacity={0.7}
            >
                <Ionicons name="remove" size={iconSize} color={isMin ? "#ccc" : "#666"} />
            </TouchableOpacity>
            <Text style={[styles.qtyText, size === "web" && styles.qtyTextWeb]}>{displayQty}</Text>
            <TouchableOpacity
                style={[styles.button, { width: btnSize, height: btnSize, borderRadius: btnSize / 2 }]}
                onPress={handleIncrement}
                disabled={!hasItem}
                activeOpacity={0.7}
            >
                <Ionicons name="add" size={iconSize} color={!hasItem ? "#ccc" : "#333"} />
            </TouchableOpacity>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
    },
    button: {
        borderWidth: 1,
        borderColor: "#ccc",
        backgroundColor: "white",
        alignItems: "center",
        justifyContent: "center",
    },
    qtyText: {
        fontSize: 16,
        fontWeight: "700",
        color: "#333",
        minWidth: 24,
        textAlign: "center",
    },
    qtyTextWeb: {
        fontSize: 16,
    },
});
