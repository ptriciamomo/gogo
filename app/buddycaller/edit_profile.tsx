// app/buddycaller/edit_profile.tsx
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
    Platform,
    Modal,
    TouchableWithoutFeedback,
    Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import * as ImagePicker from 'expo-image-picker';
import { uploadAndSaveProfilePicture } from '../../utils/profilePictureHelpers';
import { responsive, rw, rh, rf, rp, rb } from '../../utils/responsive';

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
export default function EditProfile() {
    const router = useRouter();
    const { loading, firstName, fullName, roleLabel, course, phoneNumber, profilePictureUrl, userId, setCourse, setPhoneNumber, setProfilePictureUrl } = useAuthProfile();
    
    const [isSaving, setIsSaving] = useState(false);
    const [showCourseDropdown, setShowCourseDropdown] = useState(false);
    const [profileImage, setProfileImage] = useState<string | null>(null);

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

            Alert.alert("Success", "Profile updated successfully!", [
                { text: "OK", onPress: () => router.back() }
            ]);
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
        // Request permissions
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
            Alert.alert('Permission Required', 'Please grant camera roll permissions to select an image.');
            return;
        }

        Alert.alert(
            'Select Image',
            'Choose how you want to add a profile picture',
            [
                {
                    text: 'Camera',
                    onPress: () => openCamera(),
                },
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

    const openCamera = async () => {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') {
            Alert.alert('Permission Required', 'Please grant camera permissions to take a photo.');
            return;
        }

        const result = await ImagePicker.launchCameraAsync({
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
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity 
                    onPress={() => router.back()} 
                    style={styles.backButton}
                >
                    <Ionicons name="arrow-back" size={24} color={colors.maroon} />
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
                                <Ionicons name="person" size={60} color={colors.lightGray} />
                            )}
                        </View>
                        <TouchableOpacity style={styles.cameraButton} onPress={handleImagePicker}>
                            <Ionicons name="camera" size={20} color={colors.white} />
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
                                size={20} 
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
                                        <Ionicons name="close" size={24} color={colors.maroon} />
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
                                                <Ionicons name="checkmark" size={20} color={colors.maroon} />
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
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingTop: 10,
        paddingBottom: 16,
        backgroundColor: colors.white,
    },
    backButton: {
        padding: 8,
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: colors.maroon,
    },
    headerSpacer: {
        width: 40, // Same width as back button to center the title
    },
    headerSeparator: {
        height: 1,
        backgroundColor: colors.maroon,
        marginHorizontal: 16,
    },
    content: {
        flex: 1,
    },
    contentContainer: {
        padding: 16,
    },
    profilePictureSection: {
        alignItems: 'center',
        marginBottom: 32,
    },
    profilePictureContainer: {
        position: 'relative',
    },
    profilePicture: {
        width: 120,
        height: 120,
        borderRadius: 60,
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
        borderRadius: 60,
    },
    cameraButton: {
        position: 'absolute',
        bottom: 5,
        right: 5,
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: colors.maroon,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 2,
        borderColor: colors.white,
    },
    formSection: {
        gap: 24,
    },
    inputGroup: {
        gap: 8,
    },
    label: {
        fontSize: 16,
        fontWeight: '600',
        color: colors.maroon,
    },
    inputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: colors.maroon,
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 12,
        backgroundColor: colors.white,
    },
    input: {
        flex: 1,
        fontSize: 16,
        color: colors.black,
        padding: 0,
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    modalContent: {
        backgroundColor: colors.white,
        borderRadius: 12,
        width: '100%',
        maxWidth: 400,
        maxHeight: '80%',
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
        padding: 16,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
    },
    modalTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: colors.maroon,
    },
    closeButton: {
        padding: 4,
    },
    modalScrollView: {
        maxHeight: 300,
    },
    modalOption: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
    },
    modalSelectedOption: {
        backgroundColor: colors.faint,
    },
    modalOptionText: {
        fontSize: 16,
        color: colors.black,
        flex: 1,
    },
    modalSelectedOptionText: {
        color: colors.maroon,
        fontWeight: '600',
    },
    saveSection: {
        padding: 16,
        backgroundColor: colors.white,
        borderTopWidth: 1,
        borderTopColor: colors.border,
    },
    saveButton: {
        backgroundColor: colors.maroon,
        paddingVertical: 16,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    saveButtonDisabled: {
        backgroundColor: colors.lightGray,
    },
    saveButtonText: {
        color: colors.white,
        fontSize: 16,
        fontWeight: '600',
    },
    inputError: {
        borderColor: '#ff4444',
        borderWidth: 2,
    },
    errorText: {
        color: '#ff4444',
        fontSize: 12,
        marginTop: 4,
        marginLeft: 4,
    },
});
