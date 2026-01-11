import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

/* ================= COLORS ================= */
const colors = {
    maroon: "#8B0000",
    light: "#FAF6F5",
    border: "#E5C8C5",
    text: "#531010",
    pillText: "#FFFFFF",
    pillTextActive: "#1e293b",
    faint: "#F7F1F0",
};

interface LocationPromptModalWebProps {
    visible: boolean;
    onEnableLocation: () => void;
    onCancel: () => void;
    isLoading?: boolean;
}

export default function LocationPromptModalWeb({ 
    visible, 
    onEnableLocation,
    onCancel,
    isLoading = false
}: LocationPromptModalWebProps) {
    if (!visible) return null;

    return (
        <View style={styles.backdrop}>
            <View style={styles.card}>
                <View style={styles.iconWrap}>
                    <Ionicons name="location-outline" size={44} color={colors.maroon} />
                </View>
                <Text style={styles.title}>Enable Location</Text>
                <Text style={styles.msg}>
                    Your status is ON, but your GPS or location is not enabled. 
                    Please enable your location to receive nearby errands and commissions.
                </Text>
                {isLoading ? (
                    <ActivityIndicator size="large" color={colors.maroon} style={{ marginTop: 10 }} />
                ) : (
                    <View style={styles.buttonContainer}>
                        <TouchableOpacity
                            onPress={onEnableLocation}
                            style={styles.enableBtn}
                            activeOpacity={0.9}
                        >
                            <Text style={styles.enableText}>Enable Location</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            onPress={onCancel}
                            style={styles.cancelBtn}
                            activeOpacity={0.9}
                        >
                            <Text style={styles.cancelText}>Cancel</Text>
                        </TouchableOpacity>
                    </View>
                )}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    backdrop: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0,0,0,0.38)",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        zIndex: 99999,
    },
    card: { 
        width: 400, 
        maxWidth: "100%", 
        backgroundColor: "#fff", 
        borderRadius: 14, 
        padding: 24, 
        alignItems: "center" 
    },
    iconWrap: {
        width: 64,
        height: 64,
        borderRadius: 999,
        backgroundColor: colors.faint,
        alignItems: "center",
        justifyContent: "center",
        marginBottom: 12,
    },
    title: { 
        color: colors.text, 
        fontSize: 18, 
        fontWeight: "900", 
        marginBottom: 8, 
        textAlign: "center" 
    },
    msg: { 
        color: colors.text, 
        fontSize: 13, 
        opacity: 0.9, 
        marginBottom: 20, 
        textAlign: "center",
        lineHeight: 20,
    },
    buttonContainer: {
        width: "100%",
        gap: 10,
    },
    enableBtn: { 
        backgroundColor: colors.maroon, 
        paddingVertical: 14, 
        borderRadius: 12, 
        width: "100%", 
        alignItems: "center", 
        justifyContent: "center" 
    },
    enableText: { 
        color: "#fff", 
        fontWeight: "700",
        fontSize: 14,
    },
    cancelBtn: { 
        backgroundColor: "#fff", 
        paddingVertical: 14, 
        borderRadius: 12, 
        width: "100%", 
        alignItems: "center", 
        justifyContent: "center",
        borderWidth: 1,
        borderColor: colors.border,
    },
    cancelText: { 
        color: colors.text, 
        fontWeight: "700",
        fontSize: 14,
    },
});

