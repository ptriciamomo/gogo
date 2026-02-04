// app/buddycaller/profile.web.tsx - Web version of buddycaller profile
import React, { useState, useEffect, useCallback } from 'react';
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
    useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { supabase } from '../../lib/supabase';
import * as ImagePicker from 'expo-image-picker';
import { uploadAndSaveProfilePicture, getProfilePictureUrl } from '../../utils/profilePictureHelpers';
import { getUserPosts, Post } from '../../utils/postHelpers';
import { responsive, rw, rh, rf, rp, rb, webResponsive } from '../../utils/responsive';
import SettingsModal from './settings_modal';
import ReviewsSection from '../../components/ReviewsSection.web';

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
    reviewerInitials: string;
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
        }[];
    };

// Helper function to check if middle name should be ignored
function shouldIgnoreMiddleName(middleName?: string | null): boolean {
    if (!middleName) return true;
    const normalized = middleName.toLowerCase().trim();
    const ignoredVariations = ["n/a", "na", "none"];
    return ignoredVariations.includes(normalized);
}

/* ================ HOOKS ================== */
function useAuthProfile() {
    const [loading, setLoading] = useState(true);
    const [firstName, setFirstName] = useState<string>('');
    const [lastName, setLastName] = useState<string>('');
    const [fullName, setFullName] = useState<string>('');
    const [roleLabel, setRoleLabel] = useState<string>('');
    const [course, setCourse] = useState<string>('');
    const [phoneNumber, setPhoneNumber] = useState<string>('');
    const [studentIdNumber, setStudentIdNumber] = useState<string>('');
    const [profilePictureUrl, setProfilePictureUrl] = useState<string>('');
    const [userId, setUserId] = useState<string>('');

    const fetchProfile = async () => {
        try {
            setLoading(true);
            console.log('Starting profile fetch...');
            
            // Add timeout for auth check
            const authPromise = supabase.auth.getUser();
            const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Auth timeout')), 10000)
            );
            
            const { data: { user }, error: authError } = await Promise.race([authPromise, timeoutPromise]) as any;
            
            if (authError) {
                console.error('Auth error:', authError);
                setLoading(false);
                return;
            }
            
            if (!user) {
                console.log('No user found - redirecting to login');
                setLoading(false);
                return;
            }

            // CRITICAL: Always use the authenticated user's ID - never use any other ID
            const authenticatedUserId = user.id;
            console.log('🔐 BuddyCaller useAuthProfile: Fetching profile for authenticated user:', authenticatedUserId);
            setUserId(authenticatedUserId);

            // Add timeout for profile fetch
            const profilePromise = supabase
                .from('users')
                .select('id, role, first_name, middle_name, last_name, email, student_id_number, course, phone, profile_picture_url')
                .eq('id', authenticatedUserId)
                .single();
            
            const profileTimeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Profile fetch timeout')), 15000)
            );

            const { data: profile, error } = await Promise.race([profilePromise, profileTimeoutPromise]) as any;

            if (error) {
                console.error('Error fetching profile:', error);
                setLoading(false);
                return;
            }

            // CRITICAL: Verify we got the authenticated user's profile
            if (profile && profile.id !== authenticatedUserId) {
                console.error('🚨 SECURITY ERROR: Profile ID mismatch! Expected:', authenticatedUserId, 'Got:', profile.id);
                setLoading(false);
                return;
            }

            if (profile) {
                console.log('Profile data loaded:', profile);
                setFirstName(profile.first_name || '');
                setLastName(profile.last_name || '');
                setFullName(`${profile.first_name || ''} ${profile.last_name || ''}`.trim());
                
                // CRITICAL: Explicitly determine role from authenticated user's profile ONLY
                // This MUST always use the authenticated user's role, NEVER the viewed profile's role
                const rawRole = profile.role?.toLowerCase()?.trim() || '';
                let determinedRoleLabel: string;
                
                if (rawRole === 'buddycaller') {
                    determinedRoleLabel = 'BuddyCaller';
                } else if (rawRole === 'buddyrunner') {
                    determinedRoleLabel = 'BuddyRunner';
                } else {
                    // Fallback if role is not set or invalid
                    console.warn('⚠️ Unknown role value:', profile.role, 'defaulting to BuddyRunner');
                    determinedRoleLabel = 'BuddyRunner';
                }
                
                console.log('🔍 BuddyCaller useAuthProfile: Setting roleLabel from AUTHENTICATED USER ONLY:', {
                    authenticatedUserId: user.id,
                    profileId: profile.id,
                    roleFromDB: profile.role,
                    rawRole: rawRole,
                    determinedRoleLabel: determinedRoleLabel
                });
                
                // Set the role label - this is the SINGLE SOURCE OF TRUTH for the sidebar
                setRoleLabel(determinedRoleLabel);
                
                setCourse(profile.course || '');
                setPhoneNumber(profile.phone || '');
                setStudentIdNumber(profile.student_id_number || '');
                
                // Get profile picture URL with timeout
                try {
                    const pictureUrl = await Promise.race([
                        getProfilePictureUrl(user.id),
                        new Promise((_, reject) => 
                            setTimeout(() => reject(new Error('Picture timeout')), 5000)
                        )
                    ]) as string;
                    setProfilePictureUrl(pictureUrl);
                } catch (picError) {
                    console.warn('Could not load profile picture:', picError);
                    setProfilePictureUrl('');
                }
            } else {
                console.log('No profile data found');
            }
        } catch (error) {
            console.error('Error in fetchProfile:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchProfile();
    }, []);

    // Refetch profile when component comes into focus to ensure we always have the latest authenticated user's data
    useFocusEffect(
        useCallback(() => {
            fetchProfile();
        }, [])
    );

    return {
        loading,
        firstName,
        lastName,
        fullName,
        roleLabel,
        course,
        phoneNumber,
        studentIdNumber,
        profilePictureUrl,
        userId,
        setProfilePictureUrl,
        refetch: fetchProfile
    };
}

/* ================ COMPONENTS ================== */
/* ======================= SIDEBAR (WEB) ======================= */
function Sidebar({
    open,
    isSmallScreen,
    onToggle,
    onLogout,
    userName,
    userRole,
    profilePictureUrl,
}: {
    open: boolean;
    isSmallScreen: boolean;
    onToggle: () => void;
    onLogout: () => void;
    userName: string;
    userRole: string;
    profilePictureUrl?: string | null;
}) {
    const router = useRouter();
    const sidebarStyle = isSmallScreen
        ? [
            s.sidebar,
            s.sidebarSmallScreen,
            { transform: [{ translateX: open ? 0 : -260 }], width: 260 },
        ]
        : [s.sidebar, { width: open ? 260 : 74 }];

    return (
        <View style={sidebarStyle}>
            <View style={{ paddingHorizontal: open ? 12 : 6, paddingVertical: 12 }}>
                <View
                    style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: open ? 10 : 0,
                        justifyContent: open ? "flex-start" : "center",
                    }}
                >
                    <TouchableOpacity onPress={onToggle} style={[s.sideMenuBtn, !open && { marginRight: 0 }]}>
                        <Ionicons name="menu-outline" size={20} color={colors.text} />
                    </TouchableOpacity>
                    {open && (
                        <>
                            <Image source={require("../../assets/images/logo.png")} style={{ width: 22, height: 22, resizeMode: "contain" }} />
                            <Text style={s.brand}>GoBuddy</Text>
                        </>
                    )}
                </View>
            </View>

            <View style={{ flex: 1, justifyContent: "space-between" }}>
                <View style={{ paddingTop: 8 }}>
                    <SideItem label="Home" icon="home-outline" open={open} onPress={() => router.push("/buddycaller/home")} />
                    <Separator />
                    <SideItem label="Messages" icon="chatbubbles-outline" open={open} onPress={() => router.push("/buddycaller/messages_hub")} />
                    <SideItem label="Profile" icon="person-outline" open={open} active onPress={() => {}} />
                </View>

                <View style={s.sidebarFooter}>
                    <View style={s.userCard}>
                        <View style={s.userAvatar}>
                            {profilePictureUrl ? (
                                <Image
                                    source={{ uri: profilePictureUrl }}
                                    style={{ width: 34, height: 34, borderRadius: 17, overflow: "hidden" }}
                                    resizeMode="cover"
                                />
                            ) : (
                                <Ionicons name="person" size={18} color={colors.maroon} />
                            )}
                        </View>
                        {open && (
                            <View style={{ flex: 1 }}>
                                <Text style={s.sidebarUserName}>{userName || "User"}</Text>
                                {!!userRole && <Text style={s.sidebarUserRole}>{userRole}</Text>}
                            </View>
                        )}
                    </View>

                    {open && (
                        <TouchableOpacity onPress={onLogout} activeOpacity={0.9} style={s.logoutBtn}>
                            <Ionicons name="log-out-outline" size={18} color={colors.maroon} />
                            <Text style={s.logoutText}>Logout</Text>
                        </TouchableOpacity>
                    )}
                </View>
            </View>
        </View>
    );
}

function Separator() { return <View style={{ height: 1, backgroundColor: colors.border }} />; }

function SideItem({
    label,
    icon,
    open,
    active,
    onPress,
}: {
    label: string;
    icon: any;
    open: boolean;
    active?: boolean;
    onPress?: () => void;
}) {
    return (
        <TouchableOpacity
            activeOpacity={0.9}
            onPress={onPress}
            style={[s.sideItem, active && { backgroundColor: colors.maroon }, !open && s.sideItemCollapsed]}
        >
            <Ionicons name={icon} size={18} color={active ? "#fff" : colors.text} />
            {open && <Text style={[s.sideItemText, active && { color: "#fff", fontWeight: "700" }]}>{label}</Text>}
        </TouchableOpacity>
    );
}

/* ================= CONFIRM MODALS FOR LOGOUT ================= */
function ConfirmModal({
    visible,
    title,
    message,
    onCancel,
    onConfirm,
}: {
    visible: boolean;
    title: string;
    message: string;
    onCancel: () => void;
    onConfirm: () => void;
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

function SuccessModal({
    visible,
    title = "Logged out",
    message = "You have logged out.",
    onClose,
}: {
    visible: boolean;
    title?: string;
    message?: string;
    onClose: () => void;
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

/* ================= MAIN COMPONENT ================= */
export default function BuddycallerProfileWeb() {
    const router = useRouter();
    const params = useLocalSearchParams();
    const targetUserId = params.userId as string;
    const isViewingOtherUser = params.isViewingOtherUser === 'true';
    const returnTo = params.returnTo as string;
    const conversationId = params.conversationId as string;
    
    // CRITICAL: Get authenticated user's profile - this MUST always reflect the logged-in user's role,
    // regardless of whether we're viewing another user's profile or our own profile.
    // The roleLabel here is the SINGLE SOURCE OF TRUTH for the sidebar and MUST NOT be overridden.
    const { loading, firstName, lastName, fullName, roleLabel, course, phoneNumber, studentIdNumber, profilePictureUrl, userId, setProfilePictureUrl } = useAuthProfile();
    
    // Debug: Log immediately after getting roleLabel to verify it's correct
    console.log('🎯 BuddyCaller Main component - roleLabel from useAuthProfile:', {
        roleLabel,
        userId,
        fullName,
        isViewingOtherUser,
        targetUserId
    });
    
    console.log('Profile params:', { targetUserId, isViewingOtherUser, returnTo, conversationId });
    console.log('isViewingOtherUser type:', typeof isViewingOtherUser, 'value:', isViewingOtherUser);
    console.log('Auth profile data:', { firstName, lastName, fullName, roleLabel, course, phoneNumber, studentIdNumber });
    
    // State for other user's profile data
    const [otherUserProfile, setOtherUserProfile] = useState<any>(null);
    
    console.log('otherUserProfile:', otherUserProfile);
    console.log('otherUserProfile role:', otherUserProfile?.role);
    console.log('isViewingOtherUser:', isViewingOtherUser);
    const [otherUserLoading, setOtherUserLoading] = useState(false);
    
    // State for settings modal
    const [settingsModalVisible, setSettingsModalVisible] = useState(false);
    
    // State for loading timeout
    const [loadingTimeout, setLoadingTimeout] = useState(false);
    
    // Reviews data
    const [reviews, setReviews] = useState<Review[]>([]);
    const [reviewsLoading, setReviewsLoading] = useState(true);

    // Responsive sidebar state
    const { width } = useWindowDimensions();
    const isSmallScreen = width < 1024;
    const [open, setOpen] = useState(!isSmallScreen);
    
    // Auto-collapse/expand sidebar based on screen size
    useEffect(() => {
        setOpen(!isSmallScreen);
    }, [isSmallScreen]);

    // Logout flow states
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [successOpen, setSuccessOpen] = useState(false);
    const [loggingOut, setLoggingOut] = useState(false);

    const requestLogout = () => setConfirmOpen(true);

    const performLogout = async () => {
        if (loggingOut) return;
        setLoggingOut(true);
        try {
            if (Platform.OS === 'web') {
                await supabase.auth.signOut({ scope: 'local' } as any);
            } else {
                await supabase.auth.signOut();
            }
        } catch (e) {
            console.warn("signOut error:", e);
        }
        setConfirmOpen(false);
        setSuccessOpen(false);
        router.replace('/login');
        setLoggingOut(false);
    };

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
                // Handle buddyrunner as array (from Supabase foreign key query) or single object
                const buddyrunner = Array.isArray(review.buddyrunner) ? review.buddyrunner[0] : review.buddyrunner;
                const reviewerName = `${buddyrunner?.first_name || ''} ${buddyrunner?.last_name || ''}`.trim() || 'Anonymous';
                const reviewerInitials = reviewerName.split(' ').map(n => n[0]).join('').toUpperCase();
                const date = new Date(review.created_at).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric'
                });

                return {
                    id: review.id.toString(),
                    reviewerName,
                    reviewerInitials,
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
    
    // Reports state
    const [reportModalVisible, setReportModalVisible] = useState(false);
    const [reportReason, setReportReason] = useState('');
    
    // Fetch other user's profile when targetUserId is provided
    useEffect(() => {
        if (targetUserId && isViewingOtherUser) {
            fetchOtherUserProfile();
        }
    }, [targetUserId, isViewingOtherUser]);

    // Debug: Log when auth profile data changes
    useEffect(() => {
        console.log('Auth profile data updated:', { firstName, lastName, fullName, loading });
    }, [firstName, lastName, fullName, loading]);

    // Debug: Check if user is authenticated
    useEffect(() => {
        const checkAuth = async () => {
            try {
                console.log('Checking authentication...');
                const { data: { user }, error } = await supabase.auth.getUser();
                console.log('Auth result:', { user, error });
                
                if (error) {
                    console.error('Auth error:', error);
                }
                
                if (!user) {
                    console.log('No user found - user needs to login');
                    // Try to redirect to login
                    router.push('/login' as any);
                } else {
                    console.log('User authenticated:', user.id);
                }
            } catch (err) {
                console.error('Auth check failed:', err);
            }
        };
        checkAuth();
    }, []);

    // Add loading timeout
    useEffect(() => {
        const timeout = setTimeout(() => {
            if (loading) {
                console.log('Loading timeout reached - stopping loading');
                setLoadingTimeout(true);
            }
        }, 30000); // 30 second timeout

        return () => clearTimeout(timeout);
    }, [loading]);

    // Fetch reviews for current user when not viewing other user
    useEffect(() => {
        if (!isViewingOtherUser && userId) {
            fetchReviews(userId);
        }
    }, [isViewingOtherUser, userId]);

    const fetchOtherUserProfile = async () => {
        try {
            setOtherUserLoading(true);
            const { data, error } = await supabase
                .from('users')
                .select('id, role, first_name, middle_name, last_name, email, student_id_number, course, phone, profile_picture_url')
                .eq('id', targetUserId)
                .single();

            if (error) {
                console.error('Error fetching other user profile:', error);
                return;
            }

            if (data) {
                const pictureUrl = await getProfilePictureUrl(targetUserId);
                setOtherUserProfile({
                    ...data,
                    profile_picture_url: pictureUrl
                });
                
                // Fetch reviews for this user
                await fetchReviews(targetUserId);
            }
        } catch (error) {
            console.error('Error in fetchOtherUserProfile:', error);
        } finally {
            setOtherUserLoading(false);
        }
    };




    // Use other user's data if viewing another user, otherwise use current user's data
    const displayProfile = isViewingOtherUser ? otherUserProfile : {
        first_name: firstName,
        last_name: lastName,
        course: course,
        phone: phoneNumber,
        student_id_number: studentIdNumber,
        profile_picture_url: profilePictureUrl,
        role: 'buddycaller'
    };

    console.log('Display profile:', displayProfile);
    console.log('Is viewing other user:', isViewingOtherUser);

    const displayLoading = isViewingOtherUser ? otherUserLoading : (loading && !loadingTimeout);

    const handleBack = () => {
        if (returnTo) {
            router.push(returnTo as any);
        } else if (conversationId) {
            router.push(`/buddycaller/messages/${conversationId}` as any);
        } else {
            router.push('/buddycaller/home' as any);
        }
    };

    const handleEditProfile = () => {
        router.push('/buddycaller/edit_profile' as any);
    };

    const handleSettings = () => {
        if (loading) {
            console.log('Profile still loading, cannot open settings');
            return;
        }
        console.log('Opening settings with data:', { fullName, roleLabel, studentIdNumber, course, phoneNumber });
        setSettingsModalVisible(true);
    };

    // Report functionality
    const handleReportUser = () => {
        setReportModalVisible(true);
    };

    const closeReportModal = () => {
        setReportModalVisible(false);
        setReportReason('');
    };

    // Profile picture upload handler
    const handleProfileImagePicker = async () => {
        if (Platform.OS === 'web') {
            // For web, directly open image library
            openImageLibrary();
        } else {
            // For mobile, show options (camera or library)
            Alert.alert(
                'Select Profile Picture',
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
        }
    };

    const openCamera = async () => {
        if (Platform.OS === 'web') {
            Alert.alert('Not Available', 'Camera is not available on web. Please use Photo Library instead.');
            return;
        }

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
                // Refresh profile data
                if (displayProfile) {
                    displayProfile.profile_picture_url = imageUrl;
                }
                Alert.alert('Success', 'Profile picture updated successfully!');
            } catch (error) {
                console.error('Error uploading profile picture:', error);
                Alert.alert('Error', 'Failed to upload profile picture. Please try again.');
            }
        }
    };

    const openImageLibrary = async () => {
        try {
            // Request permissions (only needed for mobile)
            if (Platform.OS !== 'web') {
                const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
                if (status !== 'granted') {
                    Alert.alert('Permission Required', 'Photo library permission is needed to select photos');
                    return;
                }
            }

            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.Images,
                allowsEditing: true,
                aspect: [1, 1],
                quality: 0.8,
            });

            if (!result.canceled && result.assets[0] && userId) {
                try {
                    Alert.alert('Uploading...', 'Please wait while we upload your profile picture.');
                    const imageUri = result.assets[0].uri;
                    const imageUrl = await uploadAndSaveProfilePicture(imageUri, userId);
                    setProfilePictureUrl(imageUrl);
                    // Refresh profile data
                    if (displayProfile) {
                        displayProfile.profile_picture_url = imageUrl;
                    }
                    Alert.alert('Success', 'Profile picture updated successfully!');
                } catch (error) {
                    console.error('Error uploading profile picture:', error);
                    Alert.alert('Error', 'Failed to upload profile picture. Please try again.');
                }
            }
        } catch (error) {
            console.error('Error picking image:', error);
            Alert.alert('Error', 'Failed to pick image. Please try again.');
        }
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


    if (displayLoading) {
        return (
            <SafeAreaView style={s.container}>
                <View style={{ flex: 1, flexDirection: "row", position: "relative" }}>
                    {isSmallScreen && open && (
                        <TouchableOpacity
                            style={s.sidebarOverlay}
                            activeOpacity={1}
                            onPress={() => setOpen(false)}
                        />
                    )}
                    <Sidebar
                        open={open}
                        isSmallScreen={isSmallScreen}
                        onToggle={() => setOpen((v) => !v)}
                        onLogout={requestLogout}
                        userName={fullName}
                        userRole={roleLabel}
                        profilePictureUrl={profilePictureUrl}
                    />
                    
                    <View style={s.mainArea}>
                        <View style={s.topBar}>
                            <View style={{ flexDirection: "row", alignItems: "center", gap: 12, flex: 1 }}>
                                {isSmallScreen && (
                                    <TouchableOpacity
                                        onPress={() => setOpen(true)}
                                        style={s.hamburgerBtn}
                                        activeOpacity={0.7}
                                    >
                                        <Ionicons name="menu-outline" size={24} color={colors.text} />
                                    </TouchableOpacity>
                                )}
                                <TouchableOpacity onPress={handleBack} style={s.backButton}>
                                    <Ionicons name="arrow-back" size={24} color={colors.white} />
                                </TouchableOpacity>
                                <Text style={s.headerTitle}>Profile</Text>
                            </View>
                            <TouchableOpacity onPress={handleSettings} style={s.settingsButton}>
                                <Ionicons name="settings-outline" size={24} color={colors.white} />
                            </TouchableOpacity>
                        </View>
                        <View style={s.loadingContainer}>
                            <Text style={s.loadingText}>Loading profile...</Text>
                            <Text style={s.loadingSubtext}>This may take a moment if you have a slow connection</Text>
                            <TouchableOpacity 
                                onPress={() => window.location.reload()} 
                                style={s.retryButton}
                            >
                                <Text style={s.retryButtonText}>Retry</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </SafeAreaView>
        );
    }

    // Show fallback if loading timed out
    if (loadingTimeout && !isViewingOtherUser) {
        return (
            <SafeAreaView style={s.container}>
                <View style={{ flex: 1, flexDirection: "row", position: "relative" }}>
                    {isSmallScreen && open && (
                        <TouchableOpacity
                            style={s.sidebarOverlay}
                            activeOpacity={1}
                            onPress={() => setOpen(false)}
                        />
                    )}
                    <Sidebar
                        open={open}
                        isSmallScreen={isSmallScreen}
                        onToggle={() => setOpen((v) => !v)}
                        onLogout={requestLogout}
                        userName={fullName}
                        userRole={roleLabel}
                        profilePictureUrl={profilePictureUrl}
                    />
                    
                    <View style={s.mainArea}>
                        <ScrollView style={s.scrollView} showsVerticalScrollIndicator={false}>
                    {/* Header */}
                    <View style={s.header}>
                        <View style={s.headerLeft}>
                            {isSmallScreen && (
                                <TouchableOpacity onPress={() => setOpen(true)} style={s.hamburgerBtn} activeOpacity={0.7}>
                                    <Ionicons name="menu-outline" size={24} color={colors.text} />
                                </TouchableOpacity>
                            )}
                            <TouchableOpacity onPress={handleBack} style={s.backButton}>
                                <Ionicons name="arrow-back" size={24} color={colors.white} />
                            </TouchableOpacity>
                        </View>
                        <Text style={s.headerTitle}>Profile</Text>
                        <View style={s.headerButtons}>
                            <TouchableOpacity onPress={handleSettings} style={s.settingsButton}>
                                <Ionicons name="settings-outline" size={24} color={colors.white} />
                            </TouchableOpacity>
                        </View>
                    </View>

                    {/* Profile Section */}
                    <View style={s.profileSection}>
                        <View style={s.profileImageContainer}>
                            <Image
                                source={require('../../assets/images/no_user.png')}
                                style={s.profileImage}
                            />
                        </View>
                        
                        <Text style={s.userName}>Unable to load profile</Text>
                        <Text style={s.userRole}>Please check your connection</Text>
                    </View>

                    {/* Error Message */}
                    <View style={s.reviewsSection}>
                        <Text style={s.sectionTitle}>Connection Error</Text>
                        <Text style={s.noReviewsText}>
                            Unable to load profile data. Please check your internet connection and try again.
                        </Text>
                        <TouchableOpacity 
                            onPress={() => window.location.reload()} 
                            style={s.editButton}
                        >
                            <Ionicons name="refresh" size={20} color={colors.white} />
                            <Text style={s.editButtonText}>Refresh Page</Text>
                        </TouchableOpacity>
                    </View>
                </ScrollView>
                    </View>
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={s.container}>
            {/* Logout Modals */}
            <ConfirmModal
                visible={confirmOpen}
                title="Log Out?"
                message="Are you sure you want to log out?"
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

            <View style={{ flex: 1, flexDirection: "row", position: "relative" }}>
                {isSmallScreen && open && (
                    <TouchableOpacity
                        style={s.sidebarOverlay}
                        activeOpacity={1}
                        onPress={() => setOpen(false)}
                    />
                )}
                <Sidebar
                    open={open}
                    isSmallScreen={isSmallScreen}
                    onToggle={() => setOpen((v) => !v)}
                    onLogout={requestLogout}
                    userName={fullName}
                    // CRITICAL: Always pass the authenticated user's roleLabel - this is the ONLY role that should be shown in the sidebar
                    // Do NOT use displayProfile.role or any other role - ONLY use roleLabel from useAuthProfile
                    userRole={roleLabel}
                    profilePictureUrl={profilePictureUrl}
                />
                
                <View style={s.mainArea}>
                    <ScrollView 
                        style={s.scrollView} 
                        contentContainerStyle={s.scrollViewContent}
                        showsVerticalScrollIndicator={false}
                    >
                        {/* Header */}
                        <View style={s.header}>
                            <View style={s.headerLeft}>
                                {isSmallScreen && (
                                    <TouchableOpacity onPress={() => setOpen(true)} style={s.hamburgerBtn} activeOpacity={0.7}>
                                        <Ionicons name="menu-outline" size={24} color={colors.text} />
                                    </TouchableOpacity>
                                )}
                                <TouchableOpacity onPress={handleBack} style={s.backButton}>
                                    <Ionicons name="arrow-back" size={24} color={colors.white} />
                                </TouchableOpacity>
                            </View>
                            <Text style={s.headerTitle}>Profile</Text>
                            <View style={s.headerButtons}>
                                {isViewingOtherUser && (
                                    <TouchableOpacity 
                                        onPress={handleReportUser} 
                                        style={s.reportButton}
                                    >
                                        <Ionicons name="flag-outline" size={24} color={colors.white} />
                                    </TouchableOpacity>
                                )}
                                
                                {!isViewingOtherUser && (
                                    <TouchableOpacity onPress={handleSettings} style={s.settingsButton}>
                                        <Ionicons name="settings-outline" size={24} color={colors.white} />
                                    </TouchableOpacity>
                                )}
                            </View>
                        </View>

                {/* Profile Section */}
                <View style={s.profileSection}>
                    <View style={s.profileImageContainer}>
                        <Image
                            source={
                                displayProfile?.profile_picture_url
                                    ? { uri: displayProfile.profile_picture_url }
                                    : require('../../assets/images/no_user.png')
                            }
                            style={s.profileImage}
                        />
                        {!isViewingOtherUser && (
                            <TouchableOpacity style={s.cameraButton} onPress={handleProfileImagePicker}>
                                <Ionicons name="camera" size={20} color={colors.maroon} />
                            </TouchableOpacity>
                        )}
                    </View>
                    
                    <Text style={s.userName}>
                        {(() => {
                            if (!displayProfile || !displayProfile.first_name || !displayProfile.last_name) {
                                return fullName || 'Loading...';
                            }
                            // Construct full name with middle name filtering
                            const f = displayProfile.first_name;
                            const m = displayProfile.middle_name;
                            const l = displayProfile.last_name;
                            const shouldIgnoreM = shouldIgnoreMiddleName(m);
                            const constructedName = [f, !shouldIgnoreM ? m : null, l].filter(Boolean).join(" ").trim();
                            return constructedName || fullName || 'Loading...';
                        })()}
                    </Text>
                    <Text style={s.userRole}>
                        {displayProfile?.role === 'buddycaller' ? 'BuddyCaller' : 'BuddyRunner'}
                    </Text>
                </View>


                {/* Reviews Section - Show when viewing any profile */}
                <ReviewsSection reviews={reviews} loading={reviewsLoading} />
            </ScrollView>

            {/* Settings Modal */}
            {!isViewingOtherUser && !loading && (
                <SettingsModal
                    visible={settingsModalVisible}
                    onClose={() => setSettingsModalVisible(false)}
                    userName={fullName || 'Not available'}
                    userRole={roleLabel || 'Not available'}
                    studentId={studentIdNumber || 'Not available'}
                    course={course || 'Not available'}
                    phone={phoneNumber || 'Not available'}
                />
            )}

            {/* Report Modal */}
            <Modal
                animationType="slide"
                transparent={true}
                visible={reportModalVisible}
                onRequestClose={closeReportModal}
            >
                <View style={s.modalOverlay}>
                    <View style={s.modalContent}>
                        <View style={s.modalHeader}>
                            <Text style={s.modalTitle}>Report User</Text>
                            <TouchableOpacity onPress={closeReportModal}>
                                <Ionicons name="close" size={24} color={colors.black} />
                            </TouchableOpacity>
                        </View>
                        
                        <Text style={s.modalSubtitle}>
                            Please provide a reason for reporting this user:
                        </Text>
                        
                        <View style={s.reportInputContainer}>
                            <TextInput
                                style={s.reportTextInput}
                                placeholder="Describe the issue..."
                                placeholderTextColor={colors.lightGray}
                                value={reportReason}
                                onChangeText={setReportReason}
                                multiline
                                numberOfLines={4}
                                textAlignVertical="top"
                            />
                        </View>
                        
                        <View style={s.modalButtons}>
                            <TouchableOpacity 
                                onPress={closeReportModal} 
                                style={s.modalCancelButton}
                            >
                                <Text style={s.modalCancelText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity 
                                onPress={submitReport} 
                                style={s.modalSubmitButton}
                            >
                                <Text style={s.modalSubmitText}>Submit Report</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
                </View>
            </View>
        </SafeAreaView>
    );
}

/* ================= COMPONENTS ================= */

/* ================= STYLES ================= */
const s = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.maroon,
    },
    sidebarSmallScreen: {
        position: "absolute",
        left: 0,
        top: 0,
        bottom: 0,
        zIndex: 1000,
        elevation: 1000,
        shadowColor: "#000",
        shadowOffset: { width: 2, height: 0 },
        shadowOpacity: 0.25,
        shadowRadius: 4,
    },
    sidebarOverlay: {
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0, 0, 0, 0.5)",
        zIndex: 999,
        elevation: 999,
    },
    hamburgerBtn: {
        padding: 8,
        borderRadius: 8,
        backgroundColor: colors.faint,
        marginRight: 8,
    },
    scrollView: {
        flex: 1,
        backgroundColor: colors.light,
    },
    scrollViewContent: {
        paddingBottom: 40,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    loadingText: {
        color: colors.white,
        fontSize: 18,
        marginBottom: 10,
    },
    loadingSubtext: {
        color: colors.white,
        fontSize: 14,
        opacity: 0.8,
        marginBottom: 20,
        textAlign: 'center',
    },
    retryButton: {
        backgroundColor: colors.white,
        paddingHorizontal: 20,
        paddingVertical: 10,
        borderRadius: 5,
    },
    retryButtonText: {
        color: colors.maroon,
        fontSize: 16,
        fontWeight: '600',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: rp(20),
        paddingVertical: rp(15),
        backgroundColor: colors.maroon,
    },
    topBar: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: rp(20),
        paddingVertical: rp(15),
        backgroundColor: colors.maroon,
    },
    headerLeft: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
    },
    backButton: {
        padding: rp(8),
    },
    headerTitle: {
        color: colors.white,
        fontSize: webResponsive.font(20),
        fontWeight: 'bold',
    },
    settingsButton: {
        padding: rp(8),
    },
    profileSection: {
        alignItems: 'center',
        paddingVertical: rp(12), // Reduced by ~30-40%
        paddingBottom: rp(20), // Extra bottom padding for curve effect
        backgroundColor: colors.maroon,
        borderBottomLeftRadius: 24,
        borderBottomRightRadius: 24,
        overflow: 'hidden',
    },
    profileImageContainer: {
        position: 'relative',
        marginBottom: rp(12),
    },
    profileImage: {
        width: 130,
        height: 130,
        borderRadius: 65,
        borderWidth: 3,
        borderColor: colors.white,
    },
    cameraButton: {
        position: 'absolute',
        bottom: 0,
        right: 0,
        backgroundColor: colors.white,
        borderRadius: 18,
        width: 36,
        height: 36,
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.15,
        shadowRadius: 4,
        elevation: 3,
    },
    userName: {
        color: colors.white,
        fontSize: 24,
        fontWeight: '900',
        marginBottom: rp(5),
    },
    userRole: {
        color: colors.white,
        fontSize: 12,
        opacity: 0.7,
        fontWeight: '400',
    },
    reviewsSection: {
        backgroundColor: colors.white,
        marginHorizontal: rp(15), // Less margin
        marginTop: rp(15), // Less margin
        borderRadius: webResponsive.borderRadius(12), // Smaller radius
        padding: rp(15), // Less padding
    },
    sectionTitle: {
        fontSize: 16, // Smaller font
        fontWeight: 'bold',
        color: colors.text,
        marginBottom: rp(12), // Less margin
    },
    reviewCard: {
        backgroundColor: colors.faint,
        borderRadius: webResponsive.borderRadius(8), // Smaller radius
        padding: rp(12), // Less padding
        marginBottom: rp(8), // Less margin
    },
    reviewHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: rp(8), // Less margin
    },
    reviewerInfo: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    reviewerInitials: {
        width: 32, // Smaller
        height: 32,
        borderRadius: 16,
        backgroundColor: colors.maroon,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: rp(8), // Less margin
    },
    reviewerInitialsText: {
        color: colors.white,
        fontWeight: 'bold',
        fontSize: 14, // Smaller font
    },
    reviewerProfileImage: {
        width: 32,
        height: 32,
        borderRadius: 16,
    },
    reviewerName: {
        fontSize: 14, // Smaller font
        fontWeight: '600',
        color: colors.text,
    },
    starsContainer: {
        flexDirection: 'row',
        marginTop: rp(2),
    },
    reviewDate: {
        fontSize: 11, // Smaller font
        color: colors.gray,
    },
    reviewComment: {
        fontSize: 13, // Smaller font
        color: colors.text,
        fontStyle: 'italic',
    },
    noReviewsText: {
        textAlign: 'center',
        color: colors.gray,
        fontSize: 14, // Smaller font
        fontStyle: 'italic',
    },
    actionButtons: {
        marginHorizontal: rp(15), // Less margin
        marginTop: rp(15), // Less margin
        marginBottom: rp(20), // Less margin
    },
    editButton: {
        backgroundColor: colors.maroon,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: rp(12), // Less padding
        borderRadius: webResponsive.borderRadius(8), // Smaller radius
    },
    editButtonText: {
        color: colors.white,
        fontSize: 14, // Smaller font
        fontWeight: '600',
        marginLeft: rp(6), // Less margin
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
    // Sidebar styles
    sidebar: { 
        borderRightColor: "#EDE9E8", 
        borderRightWidth: 1, 
        backgroundColor: "#fff" 
    },
    brand: { 
        color: colors.text, 
        fontWeight: "800", 
        fontSize: 16 
    },
    sideMenuBtn: {
        height: 30,
        width: 30,
        borderRadius: 8,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: colors.faint,
        marginRight: 8,
    },
    sideItem: { 
        flexDirection: "row", 
        alignItems: "center", 
        gap: 10, 
        paddingVertical: 14, 
        paddingHorizontal: 16 
    },
    sideItemCollapsed: { 
        justifyContent: "center", 
        paddingHorizontal: 0, 
        gap: 0, 
        height: 56 
    },
    sideItemText: { 
        color: colors.text, 
        fontSize: 14, 
        fontWeight: "600" 
    },
    sidebarFooter: { 
        padding: 12, 
        gap: 10 
    },
    userCard: {
        backgroundColor: colors.faint,
        borderRadius: 10,
        padding: 10,
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
    },
    userAvatar: {
        width: 34,
        height: 34,
        borderRadius: 999,
        backgroundColor: "#fff",
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 1,
        borderColor: colors.border,
    },
    sidebarUserName: { 
        color: colors.text, 
        fontSize: 12, 
        fontWeight: "800" 
    },
    sidebarUserRole: { 
        color: colors.text, 
        fontSize: 10, 
        opacity: 0.7 
    },
    logoutBtn: {
        borderWidth: 1,
        borderColor: colors.maroon,
        borderRadius: 12,
        paddingVertical: 12,
        paddingHorizontal: 16,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        backgroundColor: "#fff",
    },
    logoutText: { 
        color: colors.maroon, 
        fontWeight: "700" 
    },
    mainArea: {
        flex: 1,
        backgroundColor: colors.light,
    },
});

// Modal styles
const confirm = StyleSheet.create({
    backdrop: {
        flex: 1,
        backgroundColor: "rgba(0,0,0,0.38)",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
    },
    card: { width: 360, maxWidth: "100%", backgroundColor: "#fff", borderRadius: 14, padding: 18 },
    title: { color: colors.text, fontSize: 16, fontWeight: "900", marginBottom: 6 },
    msg: { color: colors.text, fontSize: 13, opacity: 0.9, marginBottom: 14 },
    actions: { flexDirection: "row", justifyContent: "flex-end", gap: 10 },
    btnGhost: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 10, backgroundColor: "#EEE" },
    btnGhostText: { color: colors.text, fontWeight: "700" },
    btnSolid: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 10, backgroundColor: colors.maroon },
    btnSolidText: { color: "#fff", fontWeight: "700" },
});

const success = StyleSheet.create({
    backdrop: {
        flex: 1,
        backgroundColor: "rgba(0,0,0,0.38)",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
    },
    card: { width: 400, maxWidth: "100%", backgroundColor: "#fff", borderRadius: 14, padding: 18, alignItems: "center" },
    iconWrap: {
        width: 64,
        height: 64,
        borderRadius: 999,
        backgroundColor: colors.faint,
        alignItems: "center",
        justifyContent: "center",
        marginBottom: 10,
    },
    title: { color: colors.text, fontSize: 16, fontWeight: "900", marginBottom: 4, textAlign: "center" },
    msg: { color: colors.text, fontSize: 13, opacity: 0.9, marginBottom: 14, textAlign: "center" },
    okBtn: { backgroundColor: colors.maroon, paddingVertical: 14, borderRadius: 12, width: "70%", alignItems: "center", justifyContent: "center" },
    okText: { color: "#fff", fontWeight: "700" },
});
