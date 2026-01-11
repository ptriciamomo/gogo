// app/buddycaller/settings_modal.tsx - Fallback for mobile
import React from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    Modal,
    ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { rp, webResponsive } from '../../utils/responsive';

/* ================= COLORS ================= */
const colors = {
    maroon: "#8B0000",
    light: "#FAF6F5",
    border: "#E5C8C5",
    text: "#531010",
    pillText: "#FFFFFF",
    pillTextActive: "#1e293b",
    faint: "#F7F1F0",
    white: "#FFFFFF",
    black: "#000000",
    gray: "#666666",
    lightGray: "#CCCCCC",
    yellow: "#FFD700",
};

/* ================= TYPES ================== */
interface SettingsModalProps {
    visible: boolean;
    onClose: () => void;
    userName: string;
    userRole: string;
    studentId: string;
    course: string;
    phone: string;
}

/* ================= MAIN COMPONENT ================= */
export default function SettingsModal({
    visible,
    onClose,
    userName,
    userRole,
    studentId,
    course,
    phone
}: SettingsModalProps) {
    const router = useRouter();

    // Debug: Log the received props
    console.log('SettingsModal received props:', { userName, userRole, studentId, course, phone });

    const handleEditProfile = () => {
        onClose();
        router.push('/buddycaller/edit_profile' as any);
    };

    const handleChangePassword = () => {
        onClose();
        router.push('/buddycaller/change_password' as any);
    };

    const handleLogout = async () => {
        try {
            await supabase.auth.signOut();
            router.push('/login' as any);
        } catch (error) {
            console.error('Error signing out:', error);
        }
    };

    return (
        <Modal
            visible={visible}
            transparent={true}
            animationType="fade"
            onRequestClose={onClose}
        >
            <View style={styles.modalOverlay}>
                <View style={styles.modalContainer}>
                    <View style={styles.modalContent}>
                        {/* Header */}
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>Profile Settings</Text>
                            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                                <Ionicons name="close" size={24} color={colors.text} />
                            </TouchableOpacity>
                        </View>

                        {/* User Information */}
                        <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
                            <View style={styles.userInfoSection}>
                                <Text style={styles.sectionTitle}>User Information</Text>
                                
                                <View style={styles.infoRow}>
                                    <Text style={styles.infoLabel}>Name:</Text>
                                    <Text style={styles.infoValue}>{userName}</Text>
                                </View>
                                
                                <View style={styles.infoRow}>
                                    <Text style={styles.infoLabel}>Role:</Text>
                                    <Text style={styles.infoValue}>{userRole}</Text>
                                </View>
                                
                                <View style={styles.infoRow}>
                                    <Text style={styles.infoLabel}>Student ID:</Text>
                                    <Text style={styles.infoValue}>{studentId}</Text>
                                </View>
                                
                                <View style={styles.infoRow}>
                                    <Text style={styles.infoLabel}>Course:</Text>
                                    <Text style={styles.infoValue}>{course}</Text>
                                </View>
                                
                                <View style={styles.infoRow}>
                                    <Text style={styles.infoLabel}>Phone:</Text>
                                    <Text style={styles.infoValue}>{phone}</Text>
                                </View>
                            </View>

                            {/* Action Buttons */}
                            <View style={styles.actionsSection}>
                                <TouchableOpacity
                                    onPress={handleEditProfile}
                                    style={styles.actionButton}
                                >
                                    <Ionicons name="create-outline" size={20} color={colors.text} />
                                    <Text style={styles.actionButtonText}>Edit Profile</Text>
                                </TouchableOpacity>

                                <TouchableOpacity
                                    onPress={handleChangePassword}
                                    style={styles.actionButton}
                                >
                                    <Ionicons name="key-outline" size={20} color={colors.text} />
                                    <Text style={styles.actionButtonText}>Change Password</Text>
                                </TouchableOpacity>

                                <TouchableOpacity
                                    onPress={handleLogout}
                                    style={styles.logoutButton}
                                >
                                    <Ionicons name="log-out-outline" size={20} color={colors.white} />
                                    <Text style={styles.logoutButtonText}>Log Out</Text>
                                </TouchableOpacity>
                            </View>
                        </ScrollView>
                    </View>
                </View>
            </View>
        </Modal>
    );
}

/* ================= STYLES ================= */
const styles = StyleSheet.create({
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    modalContainer: {
        width: '90%',
        maxWidth: 500,
        maxHeight: '80%',
    },
    modalContent: {
        backgroundColor: colors.white,
        borderRadius: webResponsive.borderRadius(15),
        overflow: 'hidden',
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: rp(20),
        paddingVertical: rp(15),
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
    },
    modalTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        color: colors.text,
    },
    closeButton: {
        padding: rp(5),
    },
    modalBody: {
        maxHeight: 400,
    },
    userInfoSection: {
        padding: rp(20),
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: colors.text,
        marginBottom: rp(15),
    },
    infoRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: rp(12),
        borderBottomWidth: 1,
        borderBottomColor: colors.lightGray,
    },
    infoLabel: {
        fontSize: 16,
        fontWeight: '600',
        color: colors.text,
        flex: 1,
    },
    infoValue: {
        fontSize: 16,
        color: colors.text,
        flex: 2,
        textAlign: 'right',
    },
    actionsSection: {
        padding: rp(20),
        paddingTop: 0,
    },
    actionButton: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.faint,
        paddingVertical: rp(15),
        paddingHorizontal: rp(20),
        borderRadius: webResponsive.borderRadius(10),
        marginBottom: rp(10),
    },
    actionButtonText: {
        fontSize: 16,
        fontWeight: '600',
        color: colors.text,
        marginLeft: rp(10),
    },
    logoutButton: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.maroon,
        paddingVertical: rp(15),
        paddingHorizontal: rp(20),
        borderRadius: webResponsive.borderRadius(10),
        marginTop: rp(10),
    },
    logoutButtonText: {
        fontSize: 16,
        fontWeight: '600',
        color: colors.white,
        marginLeft: rp(10),
    },
});
