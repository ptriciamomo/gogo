import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const colors = {
    maroon: "#8B0000",
    text: "#531010",
    border: "#E5C8C5",
    faint: "#F7F1F0",
};

const NoRunnersAvailableCard: React.FC = () => {
    return (
        <View style={styles.card}>
            <View style={styles.iconContainer}>
                <Ionicons name="footsteps-outline" size={48} color={colors.maroon} />
            </View>
            <Text style={styles.title}>No runners available right now</Text>
            <Text style={styles.description}>
                Check back in a few minutes or post an errand to notify runners.
            </Text>
        </View>
    );
};

const styles = StyleSheet.create({
    card: {
        backgroundColor: '#fff',
        borderRadius: 12,
        padding: 32,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: colors.border,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.1,
        shadowRadius: 10,
        elevation: 3,
        marginBottom: 36,
    },
    iconContainer: {
        marginBottom: 16,
    },
    title: {
        fontSize: 18,
        fontWeight: '700',
        color: colors.text,
        textAlign: 'center',
        marginBottom: 8,
    },
    description: {
        fontSize: 14,
        color: colors.text,
        opacity: 0.7,
        textAlign: 'center',
        lineHeight: 20,
    },
});

export default NoRunnersAvailableCard;
