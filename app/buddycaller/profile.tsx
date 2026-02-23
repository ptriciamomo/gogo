// app/buddycaller/profile.tsx
import React, { useState, useEffect } from 'react';
import {
    SafeAreaView,
    ScrollView,
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    TextInput,
    Image,
    Alert,
    Modal,
    Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { supabase } from '../../lib/supabase';
import * as ImagePicker from 'expo-image-picker';
import { uploadAndSaveProfilePicture, getProfilePictureUrl } from '../../utils/profilePictureHelpers';
import { getUserPosts, Post } from '../../utils/postHelpers';
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
    role: string | null;
    first_name: string | null;
    middle_name?: string | null;
    last_name: string | null;
    email?: string | null;
    student_id_number?: string | null;
    course?: string | null;
    phone?: string | null;
    profile_picture_url?: string | null;
};

type Review = {
    id: string;
    reviewerName: string;
    reviewerAvatar: string;
    reviewerProfilePictureUrl: string | null;
    rating: number;
    comment: string;
    date: string;
};

    type DatabaseReview = {
        id: number;
        commission_id: number;
        buddycaller_id: string;
        buddyrunner_id: string;
        rater_id: string;
        rating: number;
        feedback: string | null;
        created_at: string;
        buddyrunner: {
            first_name: string | null;
            last_name: string | null;
            profile_picture_url: string | null;
        } | {
            first_name: string | null;
            last_name: string | null;
            profile_picture_url: string | null;
        }[] | null;
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

// Helper function to check if middle name should be ignored
function shouldIgnoreMiddleName(middleName?: string | null): boolean {
    if (!middleName) return true;
    const normalized = middleName.toLowerCase().trim();
    const ignoredVariations = ["n/a", "na", "none"];
    return ignoredVariations.includes(normalized);
}

function useAuthProfile() {
    const [loading, setLoading] = useState(true);
    const [firstName, setFirstName] = useState<string>("");
    const [lastName, setLastName] = useState<string>("");
    const [fullName, setFullName] = useState<string>("");
    const [roleLabel, setRoleLabel] = useState<string>("");
    const [course, setCourse] = useState<string>("");
    const [phoneNumber, setPhoneNumber] = useState<string>("");
    const [studentIdNumber, setStudentIdNumber] = useState<string>("");
    const [profilePictureUrl, setProfilePictureUrl] = useState<string>("");
    const [userId, setUserId] = useState<string>("");

    async function fetchProfile() {
        try {
            const { data: userRes } = await supabase.auth.getUser();
            const user = userRes?.user;
            if (!user) { 
                setLoading(false); 
                return; 
            }

            const { data: row, error } = await supabase
                .from("users")
                .select("id, role, first_name, middle_name, last_name, email, student_id_number, course, phone, profile_picture_url")
                .eq("id", user.id)
                .single<ProfileRow>();
            
            if (error) throw error;

            const f = titleCase(row?.first_name || "");
            const m = titleCase(row?.middle_name || "");
            const l = titleCase(row?.last_name || "");
            
            // Filter out ignored middle names
            const shouldIgnoreM = shouldIgnoreMiddleName(row?.middle_name);
            
            // Construct full name with middle name if available and not ignored
            const fullName = [f, !shouldIgnoreM ? m : null, l].filter(Boolean).join(" ").trim() || 
                titleCase(
                    (user.user_metadata?.full_name as string) ||
                    (user.user_metadata?.name as string) ||
                    ""
                ) ||
                titleCase((user.email?.split("@")[0] || "").replace(/[._-]+/g, " ")) ||
                "User";

            const firstName = f || fullName.split(" ")[0] || "User";
            const lastName = l || fullName.split(" ").slice(-1)[0] || "";
            
            setFirstName(firstName);
            setLastName(lastName);
            setFullName(fullName);
            setCourse(row?.course || "");
            setPhoneNumber(row?.phone || "");
            setStudentIdNumber(row?.student_id_number || "");
            setProfilePictureUrl(row?.profile_picture_url || "");
            setUserId(user.id);

            // Use the role directly from database since it's already properly formatted
            const roleLabel = row?.role || "";
            
            setRoleLabel(roleLabel);
        } catch (error) {
            setFirstName("User");
            setLastName("");
            setFullName("User");
            setRoleLabel("");
            setCourse("");
            setPhoneNumber("");
            setStudentIdNumber("");
            setProfilePictureUrl("");
            setUserId("");
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        fetchProfile();
        const { data: sub } = supabase.auth.onAuthStateChange(() => fetchProfile());
        return () => sub?.subscription?.unsubscribe?.();
    }, []);

    // Refresh profile data when screen comes into focus
    useFocusEffect(
        React.useCallback(() => {
            fetchProfile();
        }, [])
    );

    return { loading, firstName, lastName, fullName, roleLabel, course, phoneNumber, studentIdNumber, profilePictureUrl, userId, setCourse, setPhoneNumber, setProfilePictureUrl };
}

/* ================= CONFIRM MODAL ================= */
function ConfirmModal({
    visible, title, message, onCancel, onConfirm,
}: {
    visible: boolean; title: string; message: string;
    onCancel: () => void; onConfirm: () => void;
}) {
    return (
        <Modal transparent visible={visible} animationType="fade" onRequestClose={onCancel}>
            <View style={confirm.backdrop}>
                <View style={confirm.card}>
                    <Text style={confirm.title}>{title}</Text>
                    <Text style={confirm.msg}>{message}</Text>
                    <View style={confirm.actions}>
                        <TouchableOpacity onPress={onCancel} style={confirm.btnGhost} activeOpacity={0.9}>
                            <Text style={confirm.btnGhostText}>Cancel</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={onConfirm} style={confirm.btnSolid} activeOpacity={0.9}>
                            <Text style={confirm.btnSolidText}>Log out</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </Modal>
    );
}

const confirm = StyleSheet.create({
    backdrop: {
        flex: 1,
        backgroundColor: "rgba(0,0,0,0.38)",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
    },
    card: {
        width: "90%", maxWidth: "100%", backgroundColor: "#fff", borderRadius: 14, padding: 18,
    },
    title: { color: colors.text, fontSize: 16, fontWeight: "900", marginBottom: 6 },
    msg: { color: colors.text, fontSize: 13, opacity: 0.9, marginBottom: 14 },
    actions: { flexDirection: "row", justifyContent: "flex-end", gap: 10 },
    btnGhost: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 10, backgroundColor: "#EEE" },
    btnGhostText: { color: colors.text, fontWeight: "700" },
    btnSolid: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 10, backgroundColor: colors.maroon },
    btnSolidText: { color: "#fff", fontWeight: "700" },
});

/* ================= SUCCESS MODAL ================= */
function SuccessModal({
    visible, title = "Logged out", message = "You have logged out.", onClose,
}: {
    visible: boolean; title?: string; message?: string; onClose: () => void;
}) {
    return (
        <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
            <View style={success.backdrop}>
                <View style={success.card}>
                    <View style={success.iconWrap}>
                        <Ionicons name="checkmark-circle" size={44} color={colors.maroon} />
                    </View>
                    <Text style={success.title}>{title}</Text>
                    <Text style={success.msg}>{message}</Text>
                    <TouchableOpacity onPress={onClose} style={success.okBtn} activeOpacity={0.9}>
                        <Text style={success.okText}>OK</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </Modal>
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
        width: "100%",
        maxWidth: "100%",
        backgroundColor: "#fff",
        borderRadius: 14,
        padding: 18,
        alignItems: "center",
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
        textAlign: "center",
    },
    msg: {
        color: colors.text,
        fontSize: 13,
        opacity: 0.9,
        marginBottom: 14,
        textAlign: "center",
    },
    okBtn: {
        backgroundColor: colors.maroon,
        paddingVertical: 14,
        borderRadius: 12,
        width: "70%",
        alignItems: "center",
        justifyContent: "center",
    },
    okText: { color: "#fff", fontWeight: "700" },
});

/* ================= REVIEW COMPONENT ================= */
function ReviewCard({ review }: { review: Review }) {
    const renderStars = (rating: number) => {
        return Array.from({ length: 5 }, (_, index) => (
            <Ionicons
                key={index}
                name="star"
                size={16}
                color={index < rating ? colors.yellow : colors.lightGray}
            />
        ));
    };

    return (
        <View style={styles.reviewCard}>
            <View style={styles.reviewHeader}>
                <View style={styles.reviewerInfo}>
                    <View style={styles.reviewerAvatar}>
                        {review.reviewerProfilePictureUrl ? (
                            <Image 
                                source={{ uri: review.reviewerProfilePictureUrl }} 
                                style={styles.reviewerProfileImage}
                            />
                        ) : (
                            <Text style={styles.reviewerInitials}>
                                {review.reviewerName.split(' ').map(n => n[0]).join('')}
                            </Text>
                        )}
                    </View>
                    <Text style={styles.reviewerName}>{review.reviewerName}</Text>
                </View>
                <Text style={styles.reviewDate}>{review.date}</Text>
            </View>
            
            <View style={styles.starsContainer}>
                {renderStars(review.rating)}
            </View>
            
            <Text style={styles.reviewComment}>"{review.comment}"</Text>
        </View>
    );
}

/* ================= MAIN COMPONENT ================= */
export default function BuddycallerProfile() {
    const router = useRouter();
    const params = useLocalSearchParams();
    const targetUserId = params.userId as string;
    const isViewingOtherUser = params.isViewingOtherUser === 'true';
    const returnTo = params.returnTo as string;
    const conversationId = params.conversationId as string;
    
    console.log('Profile params:', { targetUserId, isViewingOtherUser, returnTo, conversationId });
    console.log('isViewingOtherUser type:', typeof isViewingOtherUser, 'value:', isViewingOtherUser);
    const { loading, firstName, lastName, fullName, roleLabel, course, phoneNumber, studentIdNumber, profilePictureUrl, userId, setProfilePictureUrl } = useAuthProfile();
    
    // State for other user's profile data
    const [otherUserProfile, setOtherUserProfile] = useState<any>(null);
    
    console.log('otherUserProfile:', otherUserProfile);
    console.log('otherUserProfile role:', otherUserProfile?.role);
    console.log('isViewingOtherUser:', isViewingOtherUser);
    const [otherUserLoading, setOtherUserLoading] = useState(false);
    
    // Fetch other user's profile when targetUserId is provided
    useEffect(() => {
        const fetchOtherUserProfile = async () => {
            console.log('fetchOtherUserProfile called with:', { targetUserId, isViewingOtherUser });
            if (targetUserId && isViewingOtherUser) {
                console.log('Fetching other user profile for ID:', targetUserId);
                setOtherUserLoading(true);
                try {
                    const { data, error } = await supabase
                        .from('users')
                        .select('id, first_name, middle_name, last_name, role, profile_picture_url, course, phone, student_id_number')
                        .eq('id', targetUserId)
                        .single();
                    
                    if (error) {
                        console.error('Error fetching other user profile:', error);
                        Alert.alert('Error', 'Failed to load user profile');
                        router.back();
                    } else {
                        console.log('Fetched other user profile:', data);
                        setOtherUserProfile(data);
                        console.log('Set otherUserProfile to:', data);
                        
                        // Fetch reviews for this user
                        await fetchReviews(targetUserId);
                    }
                } catch (error) {
                    console.error('Error fetching other user profile:', error);
                    Alert.alert('Error', 'Failed to load user profile');
                    router.back();
                } finally {
                    setOtherUserLoading(false);
                }
            }
        };
        
        fetchOtherUserProfile();
    }, [targetUserId, isViewingOtherUser]);
    
    // Determine which profile data to display
    const displayProfile = isViewingOtherUser ? otherUserProfile : null;
    const displayLoading = isViewingOtherUser ? otherUserLoading : loading;
    const displayFirstName = isViewingOtherUser ? (displayProfile?.first_name || '') : firstName;
    const displayLastName = isViewingOtherUser ? (displayProfile?.last_name || '') : lastName;
    
    // Helper to construct full name without middle name (mobile only)
    const getDisplayFullName = () => {
        if (!isViewingOtherUser) {
            // For current user, use first name and last name only
            const f = titleCase(firstName || '');
            const l = titleCase(lastName || '');
            return [f, l].filter(Boolean).join(" ").trim() || 'User';
        }
        if (!displayProfile) {
            return 'User';
        }
        // For other user, use first name and last name only (no middle name)
        const f = titleCase(displayProfile.first_name || '');
        const l = titleCase(displayProfile.last_name || '');
        return [f, l].filter(Boolean).join(" ").trim() || 'User';
    };
    
    const displayFullName = getDisplayFullName();
    const displayRoleLabel = isViewingOtherUser ? (displayProfile?.role || 'User') : roleLabel;
    const displayProfilePictureUrl = isViewingOtherUser ? (displayProfile?.profile_picture_url || '') : profilePictureUrl;
    const displayCourse = isViewingOtherUser ? (displayProfile?.course || '') : course;
    const displayPhoneNumber = isViewingOtherUser ? (displayProfile?.phone || '') : phoneNumber;
    const displayStudentIdNumber = isViewingOtherUser ? (displayProfile?.student_id_number || '') : studentIdNumber;
    
    console.log('Display variables:', {
        isViewingOtherUser,
        otherUserProfile,
        displayProfile,
        displayFirstName,
        displayLastName,
        displayFullName,
        displayRoleLabel,
        displayProfilePictureUrl,
        'original firstName': firstName,
        'original lastName': lastName,
        'original fullName': fullName
    });
    
    // Log when otherUserProfile changes
    useEffect(() => {
        console.log('otherUserProfile changed:', otherUserProfile);
    }, [otherUserProfile]);
    
    // Fetch reviews for current user when not viewing other user
    useEffect(() => {
        if (!isViewingOtherUser && userId) {
            fetchReviews(userId);
        }
    }, [isViewingOtherUser, userId]);
    
    // Logout flow states
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [successOpen, setSuccessOpen] = useState(false);
    const [loggingOut, setLoggingOut] = useState(false);
    
    // Profile picture state
    
    // Settings modal state
    const [settingsModalVisible, setSettingsModalVisible] = useState(false);

    // Reports state
    const [reportModalVisible, setReportModalVisible] = useState(false);
    const [reportReason, setReportReason] = useState('');

    // Reviews data
    const [reviews, setReviews] = useState<Review[]>([]);
    const [reviewsLoading, setReviewsLoading] = useState(true);
    const [showAllReviews, setShowAllReviews] = useState(false);
    const REVIEW_LIMIT = 3;

    // Function to fetch reviews from database
    const fetchReviews = async (userId: string) => {
        try {
            setReviewsLoading(true);
      const { data: reviewsData, error } = await supabase
        .from('rate_and_feedback')
        .select(`
          id,
          commission_id,
          buddycaller_id,
          buddyrunner_id,
          rater_id,
          rating,
          feedback,
          created_at,
          buddyrunner:buddyrunner_id (
            first_name,
            last_name,
            profile_picture_url
          )
        `)
        .eq('buddycaller_id', userId)
        .neq('rater_id', userId)
        .order('created_at', { ascending: false });

            if (error) {
                console.error('Error fetching reviews:', error);
                return;
            }

            // Additional filter to ensure we only show reviews where this caller was rated by someone else
            // This handles edge cases where the same user might appear in both fields
            const validReviews = reviewsData.filter((review: DatabaseReview) => {
                // Only show reviews where this caller was rated by a different person
                return review.buddycaller_id === userId && review.rater_id !== userId;
            });

            // Transform database reviews to UI format
            const transformedReviews: Review[] = validReviews.map((review: DatabaseReview) => {
                // Handle buddyrunner as object, array, or null
                const buddyrunner = Array.isArray(review.buddyrunner) 
                    ? review.buddyrunner[0] 
                    : review.buddyrunner;
                const reviewerName = buddyrunner 
                    ? `${buddyrunner.first_name || ''} ${buddyrunner.last_name || ''}`.trim() || 'Anonymous'
                    : 'Anonymous';
                const date = new Date(review.created_at).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric'
                });

                return {
                    id: review.id.toString(),
                    reviewerName,
                    reviewerAvatar: '',
                    reviewerProfilePictureUrl: buddyrunner?.profile_picture_url || null,
                    rating: review.rating,
                    comment: review.feedback || '',
                    date
                };
            });

            setReviews(transformedReviews);
        } catch (error) {
            console.error('Error fetching reviews:', error);
        } finally {
            setReviewsLoading(false);
        }
    };




    useEffect(() => {
        const { data: sub } = supabase.auth.onAuthStateChange((event) => {
            if (event === "SIGNED_OUT") setSuccessOpen(true);
        });
        return () => sub?.subscription?.unsubscribe?.();
    }, []);

    const requestLogout = () => setConfirmOpen(true);

    const performLogout = async () => {
        if (loggingOut) return;
        setLoggingOut(true);
        setConfirmOpen(false);
        setSuccessOpen(true);
        try {
            const { error } = await supabase.auth.signOut();
            if (error) throw error;
        } catch (e) {
            console.warn("signOut error:", e);
        } finally {
            setLoggingOut(false);
        }
    };

    const handleEditProfile = () => {
        router.push('/buddycaller/edit_profile');
    };

    const openSettingsModal = () => {
        setSettingsModalVisible(true);
    };

    const closeSettingsModal = () => {
        setSettingsModalVisible(false);
    };

    const handleSettingsEditProfile = () => {
        closeSettingsModal();
        router.push('/buddycaller/edit_profile');
    };

    const handleChangePassword = () => {
        closeSettingsModal();
        router.push('/buddycaller/change_password');
    };

    // Report functionality
    const handleReportUser = () => {
        setReportModalVisible(true);
    };

    const closeReportModal = () => {
        setReportModalVisible(false);
        setReportReason('');
    };

    const submitReport = async () => {
        if (!reportReason.trim()) {
            Alert.alert('Error', 'Please provide a reason for the report.');
            return;
        }

        try {
            // Get current user ID
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                Alert.alert('Error', 'You must be logged in to submit a report.');
                return;
            }

            // Submit report to database (you might want to create a reports table)
            const { error } = await supabase
                .from('reports')
                .insert({
                    reporter_id: user.id,
                    reported_user_id: targetUserId,
                    reason: reportReason.trim(),
                    created_at: new Date().toISOString()
                });

            if (error) {
                console.error('Error submitting report:', error);
                Alert.alert('Error', 'Failed to submit report. Please try again.');
                return;
            }

            Alert.alert('Success', 'Report submitted successfully. Thank you for helping keep our community safe.');
            closeReportModal();
        } catch (error) {
            console.error('Error submitting report:', error);
            Alert.alert('Error', 'Failed to submit report. Please try again.');
        }
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

        if (!result.canceled && result.assets[0] && userId) {
            try {
                Alert.alert('Uploading...', 'Please wait while we upload your profile picture.');
                const imageUrl = await uploadAndSaveProfilePicture(result.assets[0].uri, userId);
                setProfilePictureUrl(imageUrl);
                Alert.alert('Success', 'Profile picture updated successfully!');
            } catch (error) {
                console.error('Error uploading profile picture:', error);
                Alert.alert('Error', 'Failed to upload profile picture. Please try again.');
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

        if (!result.canceled && result.assets[0] && userId) {
            try {
                Alert.alert('Uploading...', 'Please wait while we upload your profile picture.');
                const imageUrl = await uploadAndSaveProfilePicture(result.assets[0].uri, userId);
                setProfilePictureUrl(imageUrl);
                Alert.alert('Success', 'Profile picture updated successfully!');
            } catch (error) {
                console.error('Error uploading profile picture:', error);
                Alert.alert('Error', 'Failed to upload profile picture. Please try again.');
            }
        }
    };

    return (
        <SafeAreaView style={styles.container}>
            {/* Modals */}
            <ConfirmModal
                visible={confirmOpen}
                title="Log Out?"
                message="Are you sure want to log out?"
                onCancel={() => setConfirmOpen(false)}
                onConfirm={performLogout}
            />
            <SuccessModal
                visible={successOpen}
                title="Logged out"
                message="You have logged out."
                onClose={() => {
                    setSuccessOpen(false);
                    router.replace("/login");
                }}
            />

            {/* Settings Modal */}
            <Modal
                visible={settingsModalVisible}
                transparent={true}
                animationType="slide"
                onRequestClose={closeSettingsModal}
            >
                <TouchableOpacity 
                    style={styles.settingsModalOverlay}
                    activeOpacity={1}
                    onPress={closeSettingsModal}
                >
                    <TouchableOpacity activeOpacity={1} style={styles.settingsModalContent}>
                        <View style={styles.settingsModalHeader}>
                            <Text style={styles.settingsModalTitle}>Profile Settings</Text>
                            <TouchableOpacity onPress={closeSettingsModal} style={styles.closeButton}>
                                <Ionicons name="close" size={24} color={colors.text} />
                            </TouchableOpacity>
                        </View>
                        
                        <ScrollView style={styles.settingsModalBody} showsVerticalScrollIndicator={false}>
                            {/* User Information Section */}
                            <View style={styles.userInfoSection}>
                                <Text style={styles.sectionTitle}>User Information</Text>
                                
                                <View style={styles.infoRow}>
                                    <Text style={styles.infoLabel}>Name:</Text>
                                    <Text style={styles.infoValue}>{displayLoading ? "Loading..." : displayFullName || "Not specified"}</Text>
                                </View>
                                
                                <View style={styles.infoRow}>
                                    <Text style={styles.infoLabel}>Role:</Text>
                                    <Text style={styles.infoValue}>{displayLoading ? "Loading..." : (displayRoleLabel || "Not specified")}</Text>
                                </View>
                                
                                <View style={styles.infoRow}>
                                    <Text style={styles.infoLabel}>Student ID:</Text>
                                    <Text style={styles.infoValue}>{displayLoading ? "Loading..." : (displayStudentIdNumber || "Not specified")}</Text>
                                </View>
                                
                                <View style={styles.infoRow}>
                                    <Text style={styles.infoLabel}>Department:</Text>
                                    <Text style={styles.infoValue}>{displayLoading ? "Loading..." : (displayCourse || "Not specified")}</Text>
                                </View>
                                
                                <View style={styles.infoRow}>
                                    <Text style={styles.infoLabel}>Phone:</Text>
                                    <Text style={styles.infoValue}>{displayLoading ? "Loading..." : (displayPhoneNumber || "Not specified")}</Text>
                                </View>
                            </View>
                            
                            {/* Action Buttons - Only show for own profile */}
                            {!isViewingOtherUser && (
                                <View style={styles.settingsActions}>
                                    <TouchableOpacity 
                                        style={styles.editProfileButton}
                                        onPress={handleSettingsEditProfile}
                                    >
                                        <Ionicons name="create-outline" size={20} color={colors.maroon} />
                                        <Text style={styles.editProfileButtonText}>Edit Profile</Text>
                                    </TouchableOpacity>
                                    
                                    <TouchableOpacity 
                                        style={styles.changePasswordButton}
                                        onPress={handleChangePassword}
                                    >
                                        <Ionicons name="key-outline" size={20} color={colors.maroon} />
                                        <Text style={styles.changePasswordButtonText}>Change Password</Text>
                                    </TouchableOpacity>
                                    
                                    <TouchableOpacity 
                                        style={styles.settingsLogoutButton}
                                        onPress={() => {
                                            closeSettingsModal();
                                            requestLogout();
                                        }}
                                    >
                                        <Ionicons name="log-out-outline" size={20} color={colors.white} />
                                        <Text style={styles.settingsLogoutButtonText}>Log Out</Text>
                                    </TouchableOpacity>
                                </View>
                            )}
                        </ScrollView>
                    </TouchableOpacity>
                </TouchableOpacity>
            </Modal>

            {/* Main Scrollable Content */}
            <ScrollView style={styles.mainScrollView} contentContainerStyle={styles.scrollContent}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity 
                    onPress={() => {
                        if (returnTo === 'ChatScreenCaller' && conversationId) {
                            router.push({
                                pathname: '/buddycaller/ChatScreenCaller',
                                params: {
                                    conversationId: conversationId,
                                    otherUserId: targetUserId,
                                    contactName: otherUserProfile ? `${otherUserProfile.first_name} ${otherUserProfile.last_name}` : 'Contact',
                                }
                            });
                        } else if (returnTo === 'ChatScreenRunner' && conversationId) {
                            router.push({
                                pathname: '/buddyrunner/ChatScreenRunner',
                                params: {
                                    conversationId: conversationId,
                                    otherUserId: targetUserId,
                                    contactName: otherUserProfile ? `${otherUserProfile.first_name} ${otherUserProfile.last_name}` : 'Contact',
                                }
                            });
                        } else {
                            router.push('/buddycaller/home');
                        }
                    }} 
                    style={styles.backButton}
                >
                    <Ionicons name="arrow-back" size={24} color={colors.white} />
                </TouchableOpacity>
                
                <View style={styles.headerButtons}>
                    {isViewingOtherUser && (
                        <TouchableOpacity 
                            onPress={handleReportUser} 
                            style={styles.reportButton}
                        >
                            <Ionicons name="flag-outline" size={24} color={colors.white} />
                        </TouchableOpacity>
                    )}
                    
                    {!isViewingOtherUser && (
                        <TouchableOpacity 
                            onPress={openSettingsModal} 
                            style={styles.editButton}
                        >
                            <Ionicons name="settings-outline" size={24} color={colors.white} />
                        </TouchableOpacity>
                    )}
                </View>
            </View>

            {/* Profile Section */}
            <View style={styles.profileSection}>
                <View style={styles.profilePictureContainer}>
                    <View style={styles.profilePicture}>
                            {displayProfilePictureUrl ? (
                                <Image source={{ uri: displayProfilePictureUrl }} style={styles.profileImage} />
                        ) : (
                            <Ionicons name="person" size={60} color={colors.lightGray} />
                        )}
                    </View>
                    {!isViewingOtherUser && (
                        <TouchableOpacity style={styles.cameraButton} onPress={handleImagePicker}>
                            <Ionicons name="camera" size={16} color={colors.white} />
                        </TouchableOpacity>
                    )}
                </View>
                
                <Text style={styles.userName}>
                    {displayLoading ? "Loading..." : displayFullName}
                </Text>
                <Text style={styles.userRole}>
                    {displayLoading ? "" : displayRoleLabel || "BuddyCaller"}
                </Text>
            </View>


            {/* Reviews Section - Show when viewing any profile */}
            <View style={styles.reviewsSection}>
                <View style={styles.reviewsHeader}>
                    <Ionicons name="document-text-outline" size={20} color={colors.black} />
                    <Text style={styles.reviewsTitle}>Reviews</Text>
                </View>
                
                <View style={styles.reviewsList}>
                    {reviewsLoading ? (
                        <Text style={styles.loadingText}>Loading reviews...</Text>
                    ) : reviews.length > 0 ? (
                        <>
                            {(showAllReviews ? reviews : reviews.slice(0, REVIEW_LIMIT)).map((review) => (
                            <ReviewCard key={review.id} review={review} />
                            ))}
                            {reviews.length > REVIEW_LIMIT && (
                                <TouchableOpacity 
                                    style={styles.seeMoreButton} 
                                    onPress={() => setShowAllReviews(!showAllReviews)}
                                    activeOpacity={0.7}
                                >
                                    <Text style={styles.seeMoreText}>
                                        {showAllReviews ? 'Show fewer reviews' : 'See more reviews'}
                                    </Text>
                                    <Ionicons 
                                        name={showAllReviews ? "chevron-up" : "chevron-down"} 
                                        size={16} 
                                        color={colors.text} 
                                        style={{ opacity: 0.6 }} 
                                    />
                                </TouchableOpacity>
                            )}
                        </>
                    ) : (
                        <Text style={styles.noReviewsText}>No reviews yet</Text>
                    )}
                </View>
            </View>

            {/* Logout Button - Only show for own profile */}
            {!isViewingOtherUser && (
                <View style={styles.logoutSection}>
                    <TouchableOpacity 
                        onPress={requestLogout} 
                        style={styles.logoutButton}
                        activeOpacity={0.9}
                    >
                        <Ionicons name="log-out-outline" size={20} color={colors.white} />
                        <Text style={styles.logoutButtonText}>Log Out</Text>
                    </TouchableOpacity>
                </View>
            )}
            </ScrollView>

            {/* Report Modal */}
            <Modal
                animationType="slide"
                transparent={true}
                visible={reportModalVisible}
                onRequestClose={closeReportModal}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>Report User</Text>
                            <TouchableOpacity onPress={closeReportModal}>
                                <Ionicons name="close" size={24} color={colors.black} />
                            </TouchableOpacity>
                        </View>
                        
                        <Text style={styles.modalSubtitle}>
                            Please provide a reason for reporting this user:
                        </Text>
                        
                        <View style={styles.reportInputContainer}>
                            <TextInput
                                style={styles.reportTextInput}
                                placeholder="Describe the issue..."
                                placeholderTextColor={colors.lightGray}
                                value={reportReason}
                                onChangeText={setReportReason}
                                multiline
                                numberOfLines={4}
                                textAlignVertical="top"
                            />
                        </View>
                        
                        <View style={styles.modalButtons}>
                            <TouchableOpacity 
                                onPress={closeReportModal} 
                                style={styles.modalCancelButton}
                            >
                                <Text style={styles.modalCancelText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity 
                                onPress={submitReport} 
                                style={styles.modalSubmitButton}
                            >
                                <Text style={styles.modalSubmitText}>Submit Report</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
}

/* ================= COMPONENTS ================= */

/* ================= STYLES ================= */
const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.white,
    },
    mainScrollView: {
        flex: 1,
    },
    scrollContent: {
        flexGrow: 1,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: rp(16),
        paddingTop: Platform.OS === 'ios' ? rh(6.25) : rh(3.75),
        paddingBottom: rp(20),
        backgroundColor: colors.maroon,
    },
    backButton: {
        padding: rp(8),
    },
    editButton: {
        padding: rp(8),
    },
    profileSection: {
        backgroundColor: colors.maroon,
        alignItems: 'center',
        paddingBottom: rp(30),
    },
    profilePictureContainer: {
        position: 'relative',
        marginBottom: rp(16),
    },
    profilePicture: {
        width: rw(30),
        height: rw(30),
        borderRadius: rb(60),
        backgroundColor: colors.white,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 4,
        borderColor: colors.white,
        overflow: 'hidden',
    },
    profileImage: {
        width: '100%',
        height: '100%',
        borderRadius: rb(60),
    },
    cameraButton: {
        position: 'absolute',
        bottom: rp(5),
        right: rp(5),
        width: rw(8),
        height: rw(8),
        borderRadius: rb(16),
        backgroundColor: colors.gray,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 2,
        borderColor: colors.white,
    },
    userName: {
        color: colors.white,
        fontSize: rf(24),
        fontWeight: '700',
        marginBottom: rp(4),
    },
    userRole: {
        color: colors.white,
        fontSize: rf(16),
        fontWeight: '500',
    },
    reviewsSection: {
        backgroundColor: colors.white,
        padding: rp(16),
    },
    reviewsHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: rp(16),
        gap: rp(8),
    },
    reviewsTitle: {
        fontSize: rf(18),
        fontWeight: '700',
        color: colors.black,
    },
    reviewsList: {
        gap: rp(16),
    },
    reviewCard: {
        backgroundColor: colors.white,
        borderRadius: rb(12),
        padding: rp(16),
        borderWidth: 1,
        borderColor: colors.border,
        shadowColor: colors.black,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
    },
    reviewHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
    },
    reviewerInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    reviewerAvatar: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: colors.maroon,
        alignItems: 'center',
        justifyContent: 'center',
    },
    reviewerInitials: {
        color: colors.white,
        fontSize: 14,
        fontWeight: '600',
    },
    reviewerProfileImage: {
        width: 40,
        height: 40,
        borderRadius: 20,
    },
    reviewerName: {
        fontSize: 16,
        fontWeight: '600',
        color: colors.black,
    },
    reviewDate: {
        fontSize: 12,
        color: colors.gray,
    },
    starsContainer: {
        flexDirection: 'row',
        gap: 2,
        marginBottom: 8,
    },
    reviewComment: {
        fontSize: 14,
        color: colors.black,
        lineHeight: 20,
    },
    logoutSection: {
        padding: 16,
        backgroundColor: colors.white,
        borderTopWidth: 1,
        borderTopColor: colors.border,
    },
    logoutButton: {
        backgroundColor: colors.maroon,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 16,
        borderRadius: 12,
        gap: 8,
    },
    logoutButtonText: {
        color: colors.white,
        fontSize: 16,
        fontWeight: '600',
    },
    // Settings Modal Styles
    settingsModalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    settingsModalContent: {
        backgroundColor: colors.white,
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        width: '100%',
        maxHeight: '80%',
        marginTop: 'auto',
        shadowColor: colors.black,
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.25,
        shadowRadius: 8,
        elevation: 8,
    },
    settingsModalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 20,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
    },
    settingsModalTitle: {
        fontSize: 20,
        fontWeight: '700',
        color: colors.maroon,
    },
    closeButton: {
        padding: 4,
    },
    settingsModalBody: {
        padding: 20,
    },
    userInfoSection: {
        marginBottom: 30,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: colors.text,
        marginBottom: 16,
    },
    infoRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 12,
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
        color: colors.gray,
        flex: 2,
        textAlign: 'right',
    },
    settingsActions: {
        gap: 16,
    },
    editProfileButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.light,
        paddingVertical: 16,
        paddingHorizontal: 20,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: colors.maroon,
        gap: 8,
    },
    editProfileButtonText: {
        color: colors.maroon,
        fontSize: 16,
        fontWeight: '600',
    },
    changePasswordButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.light,
        paddingVertical: 16,
        paddingHorizontal: 20,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: colors.maroon,
        gap: 8,
        marginTop: 12,
    },
    changePasswordButtonText: {
        color: colors.maroon,
        fontSize: 16,
        fontWeight: '600',
    },
    settingsLogoutButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.maroon,
        paddingVertical: 16,
        paddingHorizontal: 20,
        borderRadius: 12,
        gap: 8,
    },
    settingsLogoutButtonText: {
        color: colors.white,
        fontSize: 16,
        fontWeight: '600',
    },
    
    // Header button styles
    headerButtons: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    reportButton: {
        padding: rp(8),
    },
    
    // Report modal styles
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    modalContent: {
        backgroundColor: colors.white,
        borderRadius: 16,
        padding: 20,
        width: '100%',
        maxWidth: 400,
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    modalTitle: {
        fontSize: 20,
        fontWeight: '600',
        color: colors.black,
    },
    modalSubtitle: {
        fontSize: 14,
        color: colors.gray,
        marginBottom: 16,
        lineHeight: 20,
    },
    reportInputContainer: {
        borderWidth: 1,
        borderColor: colors.lightGray,
        borderRadius: 8,
        marginBottom: 20,
    },
    reportTextInput: {
        fontSize: 16,
        color: colors.black,
        padding: 12,
        minHeight: 100,
        textAlignVertical: 'top',
    },
    modalButtons: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        gap: 12,
    },
    modalCancelButton: {
        paddingVertical: 12,
        paddingHorizontal: 20,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: colors.lightGray,
    },
    modalCancelText: {
        color: colors.gray,
        fontSize: 16,
        fontWeight: '500',
    },
    modalSubmitButton: {
        backgroundColor: colors.maroon,
        paddingVertical: 12,
        paddingHorizontal: 20,
        borderRadius: 8,
    },
    modalSubmitText: {
        color: colors.white,
        fontSize: 16,
        fontWeight: '600',
    },
    loadingText: {
        fontSize: 14,
        color: colors.gray,
        textAlign: 'center',
        paddingVertical: 20,
    },
    noReviewsText: {
        fontSize: 14,
        color: colors.gray,
        textAlign: 'center',
        paddingVertical: 20,
        fontStyle: 'italic',
    },
    seeMoreButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: rp(8),
        paddingVertical: rp(12),
        gap: 6,
    },
    seeMoreText: {
        color: colors.text,
        fontSize: 14,
        fontWeight: '500',
        opacity: 0.7,
    },
});
