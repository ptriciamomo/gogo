// app/buddyrunner/edit_profile.web.tsx - Web version of edit profile
import React, { useState, useEffect } from 'react';
import {
    SafeAreaView,
    ScrollView,
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    TextInput,
    Alert,
    Modal,
    TouchableWithoutFeedback,
    Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import * as ImagePicker from 'expo-image-picker';
import { uploadAndSaveProfilePicture } from '../../utils/profilePictureHelpers';
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

/* ================ TYPES ================== */
type ProfileRow = {
    id: string;
    role: "buddyrunner" | "buddycaller" | string | null;
    first_name: string | null;
    last_name: string | null;
    course?: string | null;
    phone?: string | null;
    profile_picture_url?: string | null;
};

/* ===================== AUTH PROFILE HOOK ===================== */
function titleCase(s?: string | null) {
    if (!s) return "";
    return s
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean)
        .map((w) => (w[0] ? w[0].toUpperCase() + w.slice(1) : w))
        .join(" ");
}

function useAuthProfile() {
    const [loading, setLoading] = useState(true);
    const [firstName, setFirstName] = useState<string>("");
    const [fullName, setFullName] = useState<string>("");
    const [roleLabel, setRoleLabel] = useState<string>("");
    const [course, setCourse] = useState<string>("");
    const [phoneNumber, setPhoneNumber] = useState<string>("");
    const [profilePictureUrl, setProfilePictureUrl] = useState<string>("");
    const [userId, setUserId] = useState<string>("");

    async function fetchProfile() {
        try {
            const { data: userRes } = await supabase.auth.getUser();
            const user = userRes?.user;
            if (!user) { setLoading(false); return; }

            const { data: row, error } = await supabase
                .from("users")
                .select("id, role, first_name, last_name, course, phone, profile_picture_url")
                .eq("id", user.id)
                .single<ProfileRow>();
            if (error) throw error;

            const f = titleCase(row?.first_name || "");
            const l = titleCase(row?.last_name || "");
            const finalFull =
                (f && l ? `${f} ${l}` : "").trim() ||
                titleCase(
                    (user.user_metadata?.full_name as string) ||
                    (user.user_metadata?.name as string) ||
                    ""
                ) ||
                titleCase((user.email?.split("@")[0] || "").replace(/[._-]+/g, " ")) ||
                "User";

            setFirstName(f || finalFull.split(" ")[0] || "User");
            setFullName(finalFull);
            setCourse(row?.course || "");
            setPhoneNumber(row?.phone || "");
            setProfilePictureUrl(row?.profile_picture_url || "");
            setUserId(user.id);

            const roleRaw = (row?.role || "").toString().toLowerCase();
            setRoleLabel(
                roleRaw === "buddyrunner"
                    ? "BuddyRunner"
                    : roleRaw === "buddycaller"
                        ? "BuddyCaller"
                        : ""
            );
        } catch {
            setFirstName("User");
            setFullName("User");
            setRoleLabel("");
            setCourse("");
            setPhoneNumber("");
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        fetchProfile();
        const { data: sub } = supabase.auth.onAuthStateChange(() => fetchProfile());
        return () => sub?.subscription?.unsubscribe?.();
    }, []);

    return { loading, firstName, fullName, roleLabel, course, phoneNumber, profilePictureUrl, userId, setCourse, setPhoneNumber, setProfilePictureUrl };
}

/* ================= MAIN COMPONENT ================= */
export default function EditProfileWeb() {
    const router = useRouter();
    const { loading, firstName, fullName, roleLabel, course, phoneNumber, profilePictureUrl, userId, setCourse, setPhoneNumber, setProfilePictureUrl } = useAuthProfile();
    
    const [isSaving, setIsSaving] = useState(false);
    const [showCourseDropdown, setShowCourseDropdown] = useState(false);
    const [profileImage, setProfileImage] = useState<string | null>(null);
    const [successOpen, setSuccessOpen] = useState(false);

    // Sample course options
    const courseOptions = [
        "College of Accounting Education",
        "College of Architecture and Fine Art Education",
        "College of Arts and Science Education",
        "College of Business Administration Education",
        "College of Computing Education",
        "College of Criminal Justice Education",
        "College of Hospitality Education",
        "PCollege of Health Science Education",
        "College of Teacher Education",
        "College of Legal Education",
        "Professional Schools",
        "Basic Education"
    ];

    
    const handleSave = async () => {
        if (isSaving) return;
        
        setIsSaving(true);
        try {
            const { data: userRes } = await supabase.auth.getUser();
            const user = userRes?.user;
            if (!user) throw new Error("No user found");

            const { error } = await supabase
                .from("users")
                .update({
                    course: course || null,
                    phone: phoneNumber || null,
                })
                .eq("id", user.id);

            if (error) throw error;

            // Show confirmation and then proceed to profile
            setSuccessOpen(true);
        } catch (error) {
            console.error("Error updating profile:", error);
            Alert.alert("Error", "Failed to update profile. Please try again.");
        } finally {
            setIsSaving(false);
        }
    };

    const handleCourseSelect = (selectedCourse: string) => {
        setCourse(selectedCourse);
        setShowCourseDropdown(false);
    };

    const handleImagePicker = async () => {
        // For web, we'll use a simple file input approach
        Alert.alert(
            'Select Image',
            'Choose how you want to add a profile picture',
            [
                {
                    text: 'Photo Library',
                    onPress: () => openImageLibrary(),
                },
                {
                    text: 'Cancel',
                    style: 'cancel',
                },
            ]
        );
    };

    const openImageLibrary = async () => {
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.8,
        });

        if (!result.canceled && result.assets[0]) {
            const imageUri = result.assets[0].uri;
            setProfileImage(imageUri);
            
            // Upload to Supabase
            if (userId) {
                try {
                    const imageUrl = await uploadAndSaveProfilePicture(imageUri, userId);
                    setProfilePictureUrl(imageUrl);
                    Alert.alert('Success', 'Profile picture updated successfully!');
                } catch (error) {
                    console.error('Error uploading profile picture:', error);
                    Alert.alert('Error', 'Failed to upload profile picture. Please try again.');
                }
            }
        }
    };

    return (
        <SafeAreaView style={styles.container}>
            {/* Success Modal */}
            <Modal transparent visible={successOpen} animationType="fade" onRequestClose={() => {
                setSuccessOpen(false);
                router.replace('/buddyrunner/profile' as any);
            }}>
                <View style={styles.successBackdrop}>
                    <View style={styles.successCard}>
                        <View style={styles.successIconWrap}>
                            <Ionicons name="checkmark-circle" size={32} color={colors.maroon} />
                        </View>
                        <Text style={styles.successTitle}>Profile updated</Text>
                        <Text style={styles.successMsg}>Your changes have been saved.</Text>
                        <TouchableOpacity
                            onPress={() => {
                                setSuccessOpen(false);
                                router.replace('/buddyrunner/profile' as any);
                            }}
                            style={styles.successOkBtn}
                            activeOpacity={0.9}
                        >
                            <Text style={styles.successOkText}>Go to profile</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity 
                    onPress={() => router.back()} 
                    style={styles.backButton}
                >
                    <Ionicons name="arrow-back" size={20} color={colors.maroon} />
                </TouchableOpacity>
                
                <Text style={styles.headerTitle}>Edit Profile</Text>
                <View style={styles.headerSpacer} />
            </View>

            {/* Header Separator */}
            <View style={styles.headerSeparator} />

            <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
                {/* Profile Picture Section */}
                <View style={styles.profilePictureSection}>
                    <View style={styles.profilePictureContainer}>
                        <View style={styles.profilePicture}>
                            {(profileImage || profilePictureUrl) ? (
                                <Image source={{ uri: profileImage || profilePictureUrl }} style={styles.profileImage} />
                            ) : (
                                <Ionicons name="person" size={40} color={colors.lightGray} />
                            )}
                        </View>
                        <TouchableOpacity style={styles.cameraButton} onPress={handleImagePicker}>
                            <Ionicons name="camera" size={16} color={colors.white} />
                        </TouchableOpacity>
                    </View>
                </View>

                {/* Form Fields */}
                <View style={styles.formSection}>
                    {/* Course Field */}
                    <View style={styles.inputGroup}>
                        <Text style={styles.label}>Course:</Text>
                        <TouchableOpacity 
                            style={styles.inputContainer}
                            onPress={() => setShowCourseDropdown(true)}
                        >
                            <TextInput
                                style={styles.input}
                                value={course}
                                placeholder="UM Course"
                                placeholderTextColor={colors.lightGray}
                                editable={false}
                            />
                            <Ionicons 
                                name="chevron-down" 
                                size={16} 
                                color={colors.maroon} 
                            />
                        </TouchableOpacity>
                    </View>

                    {/* Phone Number Field */}
                    <View style={styles.inputGroup}>
                        <Text style={styles.label}>Phone number:</Text>
                        <View style={[
                            styles.inputContainer,
                            phoneNumber.length > 0 && phoneNumber.length !== 11 && styles.inputError
                        ]}>
                            <TextInput
                                style={styles.input}
                                value={phoneNumber}
                                onChangeText={(text) => {
                                    // Limit to 11 digits only
                                    const numericText = text.replace(/[^0-9]/g, '');
                                    if (numericText.length <= 11) {
                                        setPhoneNumber(numericText);
                                    }
                                }}
                                placeholder="Enter your phone number"
                                placeholderTextColor={colors.lightGray}
                                keyboardType="phone-pad"
                                autoCapitalize="none"
                                maxLength={11}
                            />
                        </View>
                        {phoneNumber.length > 0 && phoneNumber.length !== 11 && (
                            <Text style={styles.errorText}>Phone number must be exactly 11 digits</Text>
                        )}
                    </View>
                </View>
            </ScrollView>

            {/* Save Button */}
            <View style={styles.saveSection}>
                <TouchableOpacity 
                    onPress={handleSave} 
                    style={[styles.saveButton, isSaving && styles.saveButtonDisabled]}
                    activeOpacity={0.9}
                    disabled={isSaving}
                >
                    <Text style={styles.saveButtonText}>
                        {isSaving ? "Saving..." : "Save"}
                    </Text>
                </TouchableOpacity>
            </View>

            {/* Course Selection Modal */}
            <Modal
                visible={showCourseDropdown}
                transparent={true}
                animationType="fade"
                onRequestClose={() => setShowCourseDropdown(false)}
            >
                <TouchableWithoutFeedback onPress={() => setShowCourseDropdown(false)}>
                    <View style={styles.modalOverlay}>
                        <TouchableWithoutFeedback>
                            <View style={styles.modalContent}>
                                <View style={styles.modalHeader}>
                                    <Text style={styles.modalTitle}>Select Course</Text>
                                    <TouchableOpacity 
                                        onPress={() => setShowCourseDropdown(false)}
                                        style={styles.closeButton}
                                    >
                                        <Ionicons name="close" size={20} color={colors.maroon} />
                                    </TouchableOpacity>
                                </View>
                                
                                <ScrollView style={styles.modalScrollView} showsVerticalScrollIndicator={false}>
                                    {courseOptions.map((option, index) => (
                                        <TouchableOpacity
                                            key={index}
                                            style={[
                                                styles.modalOption,
                                                course === option && styles.modalSelectedOption
                                            ]}
                                            onPress={() => handleCourseSelect(option)}
                                        >
                                            <Text style={[
                                                styles.modalOptionText,
                                                course === option && styles.modalSelectedOptionText
                                            ]}>
                                                {option}
                                            </Text>
                                            {course === option && (
                                                <Ionicons name="checkmark" size={16} color={colors.maroon} />
                                            )}
                                        </TouchableOpacity>
                                    ))}
                                </ScrollView>
                            </View>
                        </TouchableWithoutFeedback>
                    </View>
                </TouchableWithoutFeedback>
            </Modal>
        </SafeAreaView>
    );
}

/* ================= STYLES ================= */
const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.white,
        maxWidth: 600, // Limit maximum width on web
        alignSelf: 'center', // Center the content
        width: '100%', // Full width up to maxWidth
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: rp(16),
        paddingTop: rp(10),
        paddingBottom: rp(12),
        backgroundColor: colors.white,
    },
    backButton: {
        padding: rp(6),
    },
    headerTitle: {
        fontSize: webResponsive.font(18),
        fontWeight: '700',
        color: colors.maroon,
    },
    headerSpacer: {
        width: 32, // Smaller width for web
    },
    headerSeparator: {
        height: 1,
        backgroundColor: colors.maroon,
        marginHorizontal: rp(16),
    },
    content: {
        flex: 1,
    },
    contentContainer: {
        padding: rp(20),
        paddingBottom: rp(40), // Extra bottom padding for web
    },
    profilePictureSection: {
        alignItems: 'center',
        marginBottom: rp(24),
    },
    profilePictureContainer: {
        position: 'relative',
    },
    profilePicture: {
        width: 100, // Slightly larger for web
        height: 100,
        borderRadius: 50,
        backgroundColor: colors.white,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 2,
        borderColor: colors.border,
        overflow: 'hidden',
    },
    profileImage: {
        width: '100%',
        height: '100%',
        borderRadius: 50,
    },
    cameraButton: {
        position: 'absolute',
        bottom: 4,
        right: 4,
        width: 26,
        height: 26,
        borderRadius: 13,
        backgroundColor: colors.maroon,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 2,
        borderColor: colors.white,
    },
    formSection: {
        gap: rp(20),
        maxWidth: 400, // Limit form width
        alignSelf: 'center', // Center the form
        width: '100%',
    },
    inputGroup: {
        gap: rp(6),
    },
    label: {
        fontSize: webResponsive.font(14),
        fontWeight: '600',
        color: colors.maroon,
    },
    inputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: colors.maroon,
        borderRadius: webResponsive.borderRadius(6),
        paddingHorizontal: rp(12),
        paddingVertical: rp(10),
        backgroundColor: colors.white,
        minHeight: 44, // Standard web input height
    },
    input: {
        flex: 1,
        fontSize: webResponsive.font(14),
        color: colors.black,
        padding: 0,
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: rp(20),
    },
    modalContent: {
        backgroundColor: colors.white,
        borderRadius: webResponsive.borderRadius(10),
        width: '100%',
        maxWidth: 400,
        maxHeight: '70%',
        shadowColor: colors.black,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.25,
        shadowRadius: 8,
        elevation: 8,
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: rp(16),
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
    },
    modalTitle: {
        fontSize: webResponsive.font(16),
        fontWeight: '700',
        color: colors.maroon,
    },
    closeButton: {
        padding: rp(4),
    },
    modalScrollView: {
        maxHeight: 250,
    },
    modalOption: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: rp(16),
        paddingVertical: rp(10),
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
    },
    modalSelectedOption: {
        backgroundColor: colors.faint,
    },
    modalOptionText: {
        fontSize: webResponsive.font(14),
        color: colors.black,
        flex: 1,
    },
    modalSelectedOptionText: {
        color: colors.maroon,
        fontWeight: '600',
    },
    saveSection: {
        padding: rp(20),
        backgroundColor: colors.white,
        borderTopWidth: 1,
        borderTopColor: colors.border,
        maxWidth: 400, // Match form width
        alignSelf: 'center',
        width: '100%',
    },
    saveButton: {
        backgroundColor: colors.maroon,
        paddingVertical: rp(12),
        borderRadius: webResponsive.borderRadius(8),
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 44, // Standard web button height
    },
    saveButtonDisabled: {
        backgroundColor: colors.lightGray,
    },
    saveButtonText: {
        color: colors.white,
        fontSize: webResponsive.font(14),
        fontWeight: '600',
    },
    // Success modal styles
    successBackdrop: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.38)',
        alignItems: 'center',
        justifyContent: 'center',
        padding: rp(16),
    },
    successCard: {
        width: '100%',
        maxWidth: 360,
        backgroundColor: colors.white,
        borderRadius: webResponsive.borderRadius(12),
        padding: rp(18),
        alignItems: 'center',
    },
    successIconWrap: {
        width: 56,
        height: 56,
        borderRadius: 28,
        backgroundColor: colors.faint,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: rp(10),
    },
    successTitle: {
        color: colors.text,
        fontSize: webResponsive.font(16),
        fontWeight: '900',
        marginBottom: rp(4),
        textAlign: 'center',
    },
    successMsg: {
        color: colors.text,
        fontSize: webResponsive.font(13),
        opacity: 0.9,
        marginBottom: rp(14),
        textAlign: 'center',
    },
    successOkBtn: {
        backgroundColor: colors.maroon,
        paddingVertical: rp(12),
        borderRadius: webResponsive.borderRadius(10),
        width: '70%',
        alignItems: 'center',
        justifyContent: 'center',
    },
    successOkText: { color: colors.white, fontWeight: '700' },
    inputError: {
        borderColor: '#ff4444',
        borderWidth: 2,
    },
    errorText: {
        color: '#ff4444',
        fontSize: webResponsive.font(12),
        marginTop: rp(4),
        marginLeft: rp(4),
    },
});
