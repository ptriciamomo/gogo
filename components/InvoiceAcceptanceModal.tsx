import React from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
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

interface InvoiceAcceptanceModalProps {
    visible: boolean;
    onClose: () => void;
    callerName?: string;
}

export default function InvoiceAcceptanceModal({ 
    visible, 
    onClose, 
    callerName = "The caller" 
}: InvoiceAcceptanceModalProps) {
    return (
        <Modal 
            transparent 
            animationType="fade" 
            visible={visible} 
            onRequestClose={onClose}
        >
            <View style={styles.backdrop}>
                <View style={styles.card}>
                    <View style={styles.iconWrap}>
                        <Ionicons name="checkmark-circle" size={44} color={colors.maroon} />
                    </View>
                    <Text style={styles.title}>Invoice Accepted</Text>
                    <Text style={styles.msg}>{callerName} has accepted your invoice. Redirecting...</Text>
                    <TouchableOpacity
                        onPress={onClose}
                        style={styles.okBtn}
                        activeOpacity={0.9}
                    >
                        <Text style={styles.okText}>OK</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
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
        alignItems: "center" 
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
        textAlign: "center" 
    },
    msg: { 
        color: colors.text, 
        fontSize: 13, 
        opacity: 0.9, 
        marginBottom: 14, 
        textAlign: "center" 
    },
    okBtn: { 
        backgroundColor: colors.maroon, 
        paddingVertical: 14, 
        borderRadius: 12, 
        width: "70%", 
        alignItems: "center", 
        justifyContent: "center" 
    },
    okText: { 
        color: "#fff", 
        fontWeight: "700" 
    },
});
