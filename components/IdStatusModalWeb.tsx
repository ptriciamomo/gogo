import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';

interface IdStatusModalProps {
    visible: boolean;
    title: string;
    message: string;
    onPress: () => void;
}

/**
 * Simple alert-style modal for ID status (Pending/Disapproved)
 * Works on both web and mobile - matches native Alert.alert() UI
 * No icons, simple centered design
 */
export default function IdStatusModal({ visible, title, message, onPress }: IdStatusModalProps) {
    if (!visible) return null;

    return (
        <View style={styles.backdrop}>
            <View style={styles.card}>
                <Text style={styles.title}>{title}</Text>
                <Text style={styles.message}>{message}</Text>
                <TouchableOpacity
                    onPress={onPress}
                    style={styles.okButton}
                    activeOpacity={0.9}
                >
                    <Text style={styles.okButtonText}>OK</Text>
                </TouchableOpacity>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    backdrop: {
        ...(Platform.OS === 'web' ? {
            position: 'fixed' as any,
        } : {
            position: 'absolute',
        }),
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        zIndex: 99999,
    },
    card: {
        backgroundColor: '#fff',
        borderRadius: 14,
        padding: 20,
        width: '100%',
        maxWidth: Platform.OS === 'web' ? 280 : 300,
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: {
            width: 0,
            height: 2,
        },
        shadowOpacity: 0.25,
        shadowRadius: 3.84,
        elevation: 5,
    },
    title: {
        fontSize: 17,
        fontWeight: '600',
        color: '#000',
        marginBottom: 12,
        textAlign: 'center',
    },
    message: {
        fontSize: 13,
        color: '#000',
        marginBottom: 20,
        textAlign: 'center',
        lineHeight: 18,
        paddingHorizontal: 4,
    },
    okButton: {
        backgroundColor: '#DC2626',
        borderRadius: 10,
        paddingVertical: 10,
        paddingHorizontal: 20,
        width: '100%',
        alignItems: 'center',
        justifyContent: 'center',
    },
    okButtonText: {
        color: '#fff',
        fontSize: 17,
        fontWeight: '600',
    },
});
