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
  Keyboard,
  ActionSheetIOS,
  Platform,
  useWindowDimensions,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { responsive, rw, rh, rf, rp, rb, webResponsive } from '../../utils/responsive';
import { uploadAndSaveProfilePicture, getProfilePictureUrl } from '../../utils/profilePictureHelpers';
import { uploadPostImage, createPost, getUserPosts, deletePost, updatePost, Post } from '../../utils/postHelpers';
import SettingsModal from './settings_modal.web';

// Colors
const colors = {
  maroon: '#8B0000',
  white: '#FFFFFF',
  lightGray: '#E0E0E0',
  darkGray: '#666666',
  text: '#531010',
  gray: '#666666',
  light: '#FAF6F5',
  border: '#E5C8C5',
  black: '#000000',
  faint: '#F7F1F0',
};

// Types
interface Review {
  id: string;
  reviewerName: string;
  reviewerInitials: string;
  reviewerProfilePictureUrl: string | null;
  rating: number;
  comment: string;
  date: string;
}

type DatabaseReview = {
  id: number;
  commission_id: number;
  buddycaller_id: string;
  buddyrunner_id: string;
  rater_id: string;
  rating: number;
  feedback: string | null;
  created_at: string;
  buddycaller: {
    first_name: string | null;
    last_name: string | null;
    profile_picture_url: string | null;
  };
};

interface Work {
  id: string;
  title: string;
  image: string;
  text?: string;
  images?: string[]; // Store all images for this post
  created_at?: string; // Upload date
}

// Helper function to check if middle name should be ignored
function shouldIgnoreMiddleName(middleName?: string | null): boolean {
  if (!middleName) return true;
  const normalized = middleName.toLowerCase().trim();
  const ignoredVariations = ["n/a", "na", "none"];
  return ignoredVariations.includes(normalized);
}

// Hook for authentication profile
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
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        console.log('No user found');
        setLoading(false);
        return;
      }

      // CRITICAL: Always use the authenticated user's ID - never use any other ID
      const authenticatedUserId = user.id;
      setUserId(authenticatedUserId);

      console.log('🔐 useAuthProfile: Fetching profile for authenticated user:', authenticatedUserId);

      const { data: profile, error } = await supabase
        .from('users')
        .select('id, role, first_name, middle_name, last_name, email, student_id_number, course, phone, profile_picture_url, is_blocked, is_settlement_blocked')
        .eq('id', authenticatedUserId)
        .single();

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

      // Check if user is blocked (disciplinary or settlement-based)
      if (profile?.is_blocked || profile?.is_settlement_blocked) {
        console.log('🚨 BLOCKED USER DETECTED:', {
          userId: user.id,
          isBlocked: profile.is_blocked,
          userName: `${profile.first_name} ${profile.last_name}`,
          timestamp: new Date().toISOString()
        });
        
        // Force logout and redirect
        await supabase.auth.signOut();
        
        // Clear any cached data
        if (typeof window !== 'undefined') {
          localStorage.clear();
          sessionStorage.clear();
        }
        
        // Force redirect to login
        window.location.href = '/login';
        return;
      }

      if (profile) {
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
        
        console.log('🔍 useAuthProfile: Setting roleLabel from AUTHENTICATED USER ONLY:', {
          authenticatedUserId: authenticatedUserId,
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
        
        // Get profile picture URL
        const pictureUrl = await getProfilePictureUrl(authenticatedUserId);
        setProfilePictureUrl(pictureUrl || '');
      } else {
        console.error('⚠️ useAuthProfile: No profile data returned');
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

// Review Card Component
function ReviewCard({ review }: { review: Review }) {
  const renderStars = (rating: number) => {
    return Array.from({ length: 5 }, (_, index) => (
      <Ionicons
        key={index}
        name={index < rating ? "star" : "star-outline"}
        size={16}
        color="#FFD700"
      />
    ));
  };

  const hasComment = review.comment && review.comment.trim().length > 0;

  return (
    <View style={styles.reviewCard}>
      <View style={styles.reviewHeader}>
        <View style={styles.reviewerInfo}>
          <View style={styles.reviewerInitials}>
            {review.reviewerProfilePictureUrl ? (
              <Image 
                source={{ uri: review.reviewerProfilePictureUrl }} 
                style={styles.reviewerProfileImage}
              />
            ) : (
              <Text style={styles.reviewerInitialsText}>{review.reviewerInitials}</Text>
            )}
          </View>
          <View style={styles.reviewerDetails}>
            <View style={styles.nameAndStarsRow}>
              <Text style={styles.reviewerName}>{review.reviewerName}</Text>
              <View style={styles.starsContainer}>
                {renderStars(review.rating)}
              </View>
            </View>
          </View>
        </View>
        <Text style={styles.reviewDate}>{review.date}</Text>
      </View>
      {hasComment ? (
        <Text style={styles.reviewComment}>"{review.comment}"</Text>
      ) : (
        <Text style={styles.emptyComment}>No written feedback provided</Text>
      )}
    </View>
  );
}

// Work Card Component
function WorkCard({ work, isViewingOtherUser, handleOpenPostOptions, postOptionsModalVisible, selectedPostForOptions, handleEditPost, handleDeletePostFromOptions, handleClosePostOptions, onPress }: { 
  work: Work; 
  isViewingOtherUser: boolean; 
  handleOpenPostOptions: (work: Work) => void;
  postOptionsModalVisible: boolean;
  selectedPostForOptions: Work | null;
  handleEditPost: () => void;
  handleDeletePostFromOptions: () => void;
  handleClosePostOptions: () => void;
  onPress: () => void;
}) {
  return (
    <View style={styles.workCard}>
      <TouchableOpacity style={styles.workCardContent} onPress={onPress} activeOpacity={0.7}>
        <Image source={{ uri: work.image }} style={styles.workImage} />
        <View style={styles.workContent}>
          <Text style={styles.workTitleNotBold}>{work.title}</Text>
          {work.created_at && (
            <Text style={styles.workText}>
              {new Date(work.created_at).toLocaleDateString('en-US', { 
                month: 'short', 
                day: 'numeric',
                year: 'numeric'
              })}
            </Text>
          )}
        </View>
      </TouchableOpacity>
      
      {/* Options button - only show for own posts when not viewing other user */}
      {!isViewingOtherUser && (
        <TouchableOpacity 
          style={styles.postOptionsButton}
          onPress={() => handleOpenPostOptions(work)}
        >
          <Ionicons name="ellipsis-vertical" size={18} color={colors.darkGray} />
        </TouchableOpacity>
      )}
      
      {/* Post options menu - show only for this specific post */}
      {postOptionsModalVisible && selectedPostForOptions?.id === work.id && (
        <View style={styles.postOptionsMenu}>
          <TouchableOpacity style={styles.postOptionButton} onPress={handleEditPost}>
            <Ionicons name="create-outline" size={20} color={colors.black} />
            <Text style={styles.postOptionButtonText}>Edit</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.postOptionButton} onPress={handleDeletePostFromOptions}>
            <Ionicons name="trash-outline" size={20} color={colors.maroon} />
            <Text style={styles.postOptionButtonText}>Delete</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

// Mock data for web version
const initialWorks: Work[] = [
  {
    id: '1',
    title: 'Grocery Shopping',
    image: 'https://via.placeholder.com/150',
    text: 'Completed grocery shopping for elderly neighbor'
  },
  {
    id: '2',
    title: 'Package Delivery',
    image: 'https://via.placeholder.com/150',
    text: 'Delivered package to campus dormitory'
  }
];

const mockReviews: Review[] = [
  {
    id: '1',
    reviewerName: 'Sarah Johnson',
    reviewerInitials: 'SJ',
    reviewerProfilePictureUrl: null,
    rating: 5,
    comment: 'Excellent service! Very reliable and friendly.',
    date: '2024-01-15'
  },
  {
    id: '2',
    reviewerName: 'Mike Chen',
    reviewerInitials: 'MC',
    reviewerProfilePictureUrl: null,
    rating: 4,
    comment: 'Great communication and quick delivery.',
    date: '2024-01-10'
  }
];

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

  // On small screens, sidebar should be hidden (off-screen) when closed, visible when open
  // On larger screens, sidebar should be visible (collapsed or expanded)
  const sidebarStyle = isSmallScreen
    ? [
        styles.sidebar,
        styles.sidebarSmallScreen,
        {
          transform: [{ translateX: open ? 0 : -260 }],
          width: 260,
        },
      ]
    : [styles.sidebar, { width: open ? 260 : 74 }];

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
          <TouchableOpacity onPress={onToggle} style={styles.sideMenuBtn}>
            <Ionicons name="menu-outline" size={20} color={colors.text} />
          </TouchableOpacity>
          {open && (
            <>
              <Image source={require("../../assets/images/logo.png")} style={{ width: 22, height: 22, resizeMode: "contain" }} />
              <Text style={styles.brand}>GoBuddy</Text>
            </>
          )}
        </View>
      </View>

      <View style={{ flex: 1, justifyContent: "space-between" }}>
        <View style={{ paddingTop: 8 }}>
          <SideItem
            label="Home"
            icon="home-outline"
            open={open}
            onPress={() => {
              // Navigate to the appropriate home page based on the authenticated user's role
              if (userRole === 'BuddyCaller') {
                router.push("/buddycaller/home");
              } else {
                router.push("/buddyrunner/home");
              }
            }}
          />
          <Separator />
          <SideItem
            label="Messages"
            icon="chatbubbles-outline"
            open={open}
            onPress={() => {
              // Navigate to the appropriate messages page based on the authenticated user's role
              if (userRole === 'BuddyCaller') {
                router.push("/buddycaller/messages_hub");
              } else {
                router.push("/buddyrunner/messages_hub");
              }
            }}
          />
          <Separator />
          <SideItem
            label="Profile"
            icon="person-outline"
            open={open}
            active
            onPress={() => {
              // Navigate to the appropriate profile page based on the authenticated user's role
              if (userRole === 'BuddyCaller') {
                router.push("/buddycaller/profile");
              } else {
                router.push("/buddyrunner/profile");
              }
            }}
          />
          <Separator />
        </View>

        <View style={styles.sidebarFooter}>
          <View style={styles.userCard}>
            <View style={styles.userAvatar}>
              {profilePictureUrl ? (
                <Image 
                  source={{ uri: profilePictureUrl }} 
                  style={{ width: 34, height: 34, borderRadius: 17, overflow: "hidden" }}
                  resizeMode="cover"
                />
              ) : (
                <Ionicons name="person" size={18} color={colors.text} />
              )}
            </View>
          {open && (
            <View style={{ flex: 1 }}>
              <Text style={styles.sidebarUserName}>{userName || "User"}</Text>
              {!!userRole && <Text style={styles.sidebarUserRole}>{userRole}</Text>}
            </View>
          )}
          </View>

          {open && (
            <TouchableOpacity onPress={onLogout} activeOpacity={0.9} style={styles.logoutBtn}>
              <Ionicons name="log-out-outline" size={18} color={colors.maroon} />
              <Text style={styles.logoutText}>Logout</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
}

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
      style={[styles.sideItem, active && { backgroundColor: colors.maroon }, !open && styles.sideItemCollapsed]}
    >
      <Ionicons name={icon} size={18} color={active ? "#fff" : colors.text} />
      {open && (
        <Text style={[styles.sideItemText, active && { color: "#fff", fontWeight: "700" }]}>{label}</Text>
      )}
    </TouchableOpacity>
  );
}

function Separator() { return <View style={{ height: 1, backgroundColor: colors.border }} />; }

/* ======================= CONFIRM MODALS FOR LOGOUT ======================= */
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
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.38)", alignItems: "center", justifyContent: "center", padding: 16 }}>
        <View style={{ width: 360, maxWidth: "100%", backgroundColor: "#fff", borderRadius: 14, padding: 18 }}>
          <Text style={{ color: colors.text, fontSize: 16, fontWeight: "900", marginBottom: 6 }}>{title}</Text>
          <Text style={{ color: colors.text, fontSize: 13, opacity: 0.9, marginBottom: 14 }}>{message}</Text>
          <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 10 }}>
            <TouchableOpacity onPress={onCancel} style={{ paddingVertical: 10, paddingHorizontal: 16, borderRadius: 10, backgroundColor: "#EEE" }} activeOpacity={0.9}>
              <Text style={{ color: colors.text, fontWeight: "700" }}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onConfirm} style={{ paddingVertical: 10, paddingHorizontal: 16, borderRadius: 10, backgroundColor: colors.maroon }} activeOpacity={0.9}>
              <Text style={{ color: "#fff", fontWeight: "700" }}>Log out</Text>
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
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.38)", alignItems: "center", justifyContent: "center", padding: 16 }}>
        <View style={{ width: 360, maxWidth: "100%", backgroundColor: "#fff", borderRadius: 14, padding: 18 }}>
          <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: "#F4E6E6", alignItems: "center", justifyContent: "center", alignSelf: "center", marginBottom: 16 }}>
            <Ionicons name="checkmark-circle" size={44} color={colors.maroon} />
          </View>
          <Text style={{ color: colors.text, fontSize: 18, fontWeight: "900", textAlign: "center", marginBottom: 8 }}>{title}</Text>
          <Text style={{ color: colors.text, fontSize: 14, opacity: 0.9, textAlign: "center", marginBottom: 24 }}>{message}</Text>
          <TouchableOpacity onPress={onClose} style={{ paddingVertical: 10, paddingHorizontal: 16, borderRadius: 10, backgroundColor: colors.maroon, alignSelf: "center" }} activeOpacity={0.9}>
            <Text style={{ color: "#fff", fontWeight: "700" }}>OK</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

export default function BuddyrunnerProfileWeb() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const targetUserId = params.userId as string;
  const isViewingOtherUser = params.isViewingOtherUser === 'true';
  const returnTo = params.returnTo as string;
  const conversationId = params.conversationId as string;
  
  console.log('=== BUDDYRUNNER PROFILE WEB DEBUG ===');
  console.log('Profile params:', { targetUserId, isViewingOtherUser, returnTo, conversationId });
  console.log('isViewingOtherUser type:', typeof isViewingOtherUser, 'value:', isViewingOtherUser);
  console.log('All params received:', params);

  // CRITICAL: Get authenticated user's profile - this MUST always reflect the logged-in user's role,
  // regardless of whether we're viewing another user's profile or our own profile.
  // The roleLabel here is the SINGLE SOURCE OF TRUTH for the sidebar and MUST NOT be overridden.
  const { loading, firstName, lastName, fullName, roleLabel, course, phoneNumber, studentIdNumber, profilePictureUrl, userId, setProfilePictureUrl, refetch: refetchAuthProfile } = useAuthProfile();
  
  // Debug: Log immediately after getting roleLabel to verify it's correct
  console.log('🎯 Main component - roleLabel from useAuthProfile:', {
    roleLabel,
    userId,
    fullName,
    isViewingOtherUser,
    targetUserId
  });
  
  // Responsive sidebar state
  const { width } = useWindowDimensions();
  const isSmallScreen = width < 1024;
  const [open, setOpen] = useState(!isSmallScreen);
  
  // On small screens, start with sidebar closed (hidden)
  // On larger screens, start with sidebar open
  useEffect(() => {
    if (isSmallScreen) {
      setOpen(false);
    } else {
      setOpen(true);
    }
  }, [isSmallScreen]);
  
  // State for other user's profile data
  const [otherUserProfile, setOtherUserProfile] = useState<any>(null);
  const [otherUserLoading, setOtherUserLoading] = useState(false);
  
  // State for settings modal
  const [settingsModalVisible, setSettingsModalVisible] = useState(false);
  
  // State for report modal (when viewing other user's profile)
  const [reportModalVisible, setReportModalVisible] = useState(false);
  const [reportReason, setReportReason] = useState('');
  
  // State for post options modal (Edit/Delete)
  const [postOptionsModalVisible, setPostOptionsModalVisible] = useState(false);
  const [selectedPostForOptions, setSelectedPostForOptions] = useState<Work | null>(null);
  
  // State for edit post modal
  const [editPostModalVisible, setEditPostModalVisible] = useState(false);
  const [editingPost, setEditingPost] = useState<Work | null>(null);
  const [editPostTitle, setEditPostTitle] = useState('');
  const [editPostContent, setEditPostContent] = useState('');
  const [editPostImages, setEditPostImages] = useState<string[]>([]);
  const [editPostNewImages, setEditPostNewImages] = useState<string[]>([]);
  
  // State for works and reviews
  const [works, setWorks] = useState<Work[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(true);
  const [postsLoading, setPostsLoading] = useState(false);
  
  // State for review visibility toggle (UI-only)
  const [showAllReviews, setShowAllReviews] = useState(false);
  
  // State for posting
  const [postText, setPostText] = useState('');
  const [modalVisible, setModalVisible] = useState(false);
  const [modalPostText, setModalPostText] = useState('');
  const [selectedImages, setSelectedImages] = useState<string[]>([]);
  
  // State for post detail modal
  const [selectedPost, setSelectedPost] = useState<Work | null>(null);
  const [postDetailModalVisible, setPostDetailModalVisible] = useState(false);
  
  // State for delete confirmation modal
  const [deleteConfirmModalVisible, setDeleteConfirmModalVisible] = useState(false);
  const [postToDelete, setPostToDelete] = useState<Work | null>(null);
  
  // Load posts from database
  const loadPosts = async (userIdToLoad: string) => {
    try {
      setPostsLoading(true);
      const posts = await getUserPosts(userIdToLoad);
      
      // Convert posts to works format
      const worksData: Work[] = posts.map(post => ({
        id: post.id,
        title: post.content || '',
        image: post.image_urls[0] || '',
        text: post.content || '',
        images: post.image_urls,
        created_at: post.created_at
      }));
      
      setWorks(worksData);
    } catch (error) {
      console.error('Error loading posts:', error);
    } finally {
      setPostsLoading(false);
    }
  };

  // Function to fetch reviews from database
  const fetchReviews = async (userId: string) => {
    try {
      setReviewsLoading(true);
      console.log('Fetching reviews for user ID:', userId);
      
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
          buddycaller:buddycaller_id (
            first_name,
            last_name,
            profile_picture_url
          ),
          buddyrunner:buddyrunner_id (
            first_name,
            last_name,
            profile_picture_url
          )
        `)
        .or(`buddycaller_id.eq.${userId},buddyrunner_id.eq.${userId}`)
        .neq('rater_id', userId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching reviews:', error);
        return;
      }

      console.log('Raw reviews data:', reviewsData);

      // Filter to ensure we only show reviews where this user was rated by someone else
      const validReviews = reviewsData.filter((review: any) => {
        // Show reviews where this user was rated (either as caller or runner) by a different person
        const wasRated = (review.buddycaller_id === userId || review.buddyrunner_id === userId);
        const notSelfRated = review.rater_id !== userId;
        return wasRated && notSelfRated;
      });

      console.log('Valid reviews after filtering:', validReviews);

      // Transform database reviews to UI format
      const transformedReviews: Review[] = validReviews.map((review: any) => {
        // Determine who the reviewer is (the rater)
        let reviewerInfo;
        if (review.rater_id === review.buddycaller_id) {
          // Caller rated runner
          reviewerInfo = review.buddycaller;
        } else if (review.rater_id === review.buddyrunner_id) {
          // Runner rated caller
          reviewerInfo = review.buddyrunner;
        } else {
          // Fallback - get reviewer info from rater_id
          reviewerInfo = review.buddycaller_id === userId ? review.buddyrunner : review.buddycaller;
        }

        const reviewerName = `${reviewerInfo?.first_name || ''} ${reviewerInfo?.last_name || ''}`.trim() || 'Anonymous';
        const date = new Date(review.created_at).toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric'
        });

        return {
          id: review.id.toString(),
          reviewerName,
          reviewerInitials: reviewerName.split(' ').map(n => n[0]).join('').toUpperCase(),
          reviewerProfilePictureUrl: reviewerInfo?.profile_picture_url,
          rating: review.rating,
          comment: review.feedback || '',
          date
        };
      });

      console.log('Transformed reviews:', transformedReviews);
      setReviews(transformedReviews);
    } catch (error) {
      console.error('Error fetching reviews:', error);
    } finally {
      setReviewsLoading(false);
    }
  };

  // Load posts when component mounts or when viewing another user
  useEffect(() => {
    if (userId && !isViewingOtherUser) {
      // Load current user's posts
      loadPosts(userId);
    } else if (targetUserId && isViewingOtherUser) {
      // Load other user's posts
      loadPosts(targetUserId);
    }
  }, [userId, targetUserId, isViewingOtherUser]);

  // Fetch reviews when viewing another user's profile
  useEffect(() => {
    if (isViewingOtherUser && targetUserId) {
      fetchReviews(targetUserId);
    }
  }, [isViewingOtherUser, targetUserId]);

  // Fetch reviews for current user's profile
  useEffect(() => {
    if (!isViewingOtherUser && userId) {
      fetchReviews(userId);
    }
  }, [isViewingOtherUser, userId]);

  // Fetch other user's profile when targetUserId is provided
  useEffect(() => {
    if (targetUserId && isViewingOtherUser) {
      fetchOtherUserProfile();
    }
  }, [targetUserId, isViewingOtherUser]);

  // Debug: Log when auth profile data changes (including roleLabel)
  useEffect(() => {
    console.log('Auth profile data updated:', { firstName, lastName, fullName, roleLabel, loading, userId });
  }, [firstName, lastName, fullName, roleLabel, loading, userId]);

  // Debug: Log the role being passed to Sidebar - this should ALWAYS be the authenticated user's role
  useEffect(() => {
    console.log('🔍 Sidebar roleLabel (main component):', { 
      roleLabel, 
      userId, 
      fullName, 
      isViewingOtherUser,
      targetUserId,
      note: 'roleLabel MUST be authenticated user role, NOT targetUserId role'
    });
    
    // Verify that roleLabel is not empty when we have userId (should have loaded)
    if (userId && !roleLabel && !loading && refetchAuthProfile) {
      console.error('🚨 WARNING: roleLabel is empty but userId exists! Forcing refetch...');
      // Force a refetch if roleLabel is somehow empty
      refetchAuthProfile();
    }
  }, [roleLabel, userId, fullName, isViewingOtherUser, targetUserId, loading, refetchAuthProfile]);

  // Debug: Check if user is authenticated
  useEffect(() => {
    const checkAuth = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      console.log('Current user:', user);
    };
    checkAuth();
  }, []);

  const fetchOtherUserProfile = async () => {
    try {
      setOtherUserLoading(true);
      console.log('Fetching other user profile for ID:', targetUserId);
      
      const { data, error } = await supabase
        .from('users')
        .select('id, first_name, middle_name, last_name, role, profile_picture_url, course, phone, student_id_number')
        .eq('id', targetUserId)
        .single();

      if (error) {
        console.error('Error fetching other user profile:', error);
        return;
      }

      console.log('Fetched other user profile:', data);

      if (data) {
        const pictureUrl = await getProfilePictureUrl(targetUserId);
        setOtherUserProfile({
          ...data,
          profile_picture_url: pictureUrl
        });
        console.log('Set otherUserProfile to:', { ...data, profile_picture_url: pictureUrl });
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
    role: 'buddyrunner'
  };

  const displayLoading = isViewingOtherUser ? otherUserLoading : loading;
  
  // Debug logging
  console.log('=== DISPLAY PROFILE DEBUG ===');
  console.log('isViewingOtherUser:', isViewingOtherUser);
  console.log('targetUserId:', targetUserId);
  console.log('otherUserProfile:', otherUserProfile);
  console.log('displayProfile:', displayProfile);

  const handleBack = () => {
    // Ensure correct return target when navigated from ChatScreenCaller (web)
    if (returnTo === 'ChatScreenCaller') {
      router.push('/buddycaller/messages_hub' as any);
      return;
    }
    // Ensure correct return target when navigated from ChatScreenRunner (web)
    if (returnTo === 'ChatScreenRunner') {
      router.push('/buddyrunner/messages_hub' as any);
      return;
    }
    // Navigate back to Task Progress page when coming from there
    if (returnTo === 'BuddyRunnerTaskProgress') {
      router.back();
      return;
    }
    // Navigate back to Caller Task Progress page when coming from there
    if (returnTo === 'BuddyCallerTaskProgress') {
      router.back();
      return;
    }
    if (returnTo) {
      router.push(returnTo as any);
      return;
    }
    if (conversationId) {
      router.push(`/buddyrunner/messages/${conversationId}` as any);
      return;
    }
    router.push('/buddyrunner/home' as any);
  };

  const handleEditProfile = () => {
    router.push('/buddyrunner/edit_profile' as any);
  };

  // Posting functions
  const handleModalPostWork = async () => {
    if (!modalPostText.trim() && selectedImages.length === 0) {
      Alert.alert('Error', 'Please enter some text or add an image to your post.');
      return;
    }
    
    try {
      // Upload images to storage
      const imageUrls: string[] = [];
      for (const imageUri of selectedImages) {
        const uploadedUrl = await uploadPostImage(imageUri, userId);
        imageUrls.push(uploadedUrl);
      }
      
      // Save post to database
      const newPost = await createPost(
        userId,
        modalPostText.trim(),
        imageUrls
      );
      
      // Add to local works array for immediate UI update
      const newWork: Work = {
        id: newPost.id,
        title: newPost.content || '',
        image: imageUrls[0] || '',
        text: newPost.content || '',
        images: imageUrls
      };
      
      setWorks(prevWorks => [newWork, ...prevWorks]);
      
      Alert.alert('Success', 'Work posted successfully!');
      setModalPostText('');
      setSelectedImages([]);
      setModalVisible(false);
    } catch (error) {
      console.error('Error posting work:', error);
      Alert.alert('Error', 'Failed to post work. Please try again.');
    }
  };

  const openModal = () => {
    setModalPostText(postText); // Copy current text to modal
    setSelectedImages([]); // Clear any previous images
    setModalVisible(true);
  };

  const closeModal = () => {
    setModalVisible(false);
    setModalPostText('');
    setSelectedImages([]);
    Keyboard.dismiss(); // Dismiss keyboard when closing modal
  };

  const pickImage = async () => {
    try {
      // Request media library permissions
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Photo library permission is needed to select photos');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        setSelectedImages(prev => [...prev, result.assets[0].uri]);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to pick image');
    }
  };

  const removeImage = (index: number) => {
    setSelectedImages(prev => prev.filter((_, i) => i !== index));
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

  // Post options functions (Edit/Delete)
  const handleOpenPostOptions = (work: Work) => {
    setSelectedPostForOptions(work);
    setPostOptionsModalVisible(true);
  };

  const handleClosePostOptions = () => {
    setPostOptionsModalVisible(false);
    setSelectedPostForOptions(null);
  };
  
  // Post detail modal functions
  const handlePostPress = (work: Work) => {
    setSelectedPost(work);
    setPostDetailModalVisible(true);
  };
  
  const handleClosePostDetailModal = () => {
    setPostDetailModalVisible(false);
    setSelectedPost(null);
  };

  const handleEditPost = () => {
    if (!selectedPostForOptions) return;
    
    // Set up the edit modal with current post data
    setEditingPost(selectedPostForOptions);
    setEditPostTitle(selectedPostForOptions.text || '');
    setEditPostContent(selectedPostForOptions.text || '');
    setEditPostImages(selectedPostForOptions.images || []);
    setEditPostNewImages([]);
    setEditPostModalVisible(true);
    handleClosePostOptions();
  };

  const handleDeletePostFromOptions = () => {
    if (!selectedPostForOptions) return;
    setPostToDelete(selectedPostForOptions);
    handleClosePostOptions();
    setDeleteConfirmModalVisible(true);
  };
  
  const handleConfirmDeletePost = async () => {
    if (!postToDelete) return;
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        Alert.alert('Error', 'You must be logged in to delete a post.');
        return;
      }

      await deletePost(postToDelete.id, user.id);
      setWorks(prevWorks => prevWorks.filter(work => work.id !== postToDelete.id));
      setDeleteConfirmModalVisible(false);
      setPostToDelete(null);
      Alert.alert('Success', 'Post deleted successfully!');
    } catch (error) {
      console.error('Error deleting post:', error);
      Alert.alert('Error', 'Failed to delete post. Please try again.');
    }
  };

  // Edit post functions
  const handleCloseEditPost = () => {
    setEditPostModalVisible(false);
    setEditingPost(null);
    setEditPostTitle('');
    setEditPostContent('');
    setEditPostImages([]);
    setEditPostNewImages([]);
  };

  const handleEditPostImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: true,
        quality: 0.8,
      });

      if (!result.canceled && result.assets) {
        const newImageUris = result.assets.map(asset => asset.uri);
        setEditPostNewImages(prev => [...prev, ...newImageUris]);
      }
    } catch (error) {
      console.error('Error picking images:', error);
      Alert.alert('Error', 'Failed to pick images. Please try again.');
    }
  };

  const handleRemoveEditImage = (index: number, isNewImage: boolean) => {
    if (isNewImage) {
      setEditPostNewImages(prev => prev.filter((_, i) => i !== index));
    } else {
      setEditPostImages(prev => prev.filter((_, i) => i !== index));
    }
  };

  const handleSaveEditPost = async () => {
    if (!editingPost || !editPostTitle.trim()) {
      Alert.alert('Error', 'Please enter a title for your post.');
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        Alert.alert('Error', 'User not authenticated.');
        return;
      }

      // Upload new images
      const uploadedImageUrls: string[] = [];
      for (const imageUri of editPostNewImages) {
        try {
          const imageUrl = await uploadPostImage(imageUri, user.id);
          uploadedImageUrls.push(imageUrl);
        } catch (error) {
          console.error('Error uploading image:', error);
          Alert.alert('Error', 'Failed to upload some images. Please try again.');
          return;
        }
      }

      // Combine existing images with new ones
      const allImageUrls = [...editPostImages, ...uploadedImageUrls];

      // Update the post in the database
      await updatePost(
        editingPost.id,
        user.id,
        editPostContent.trim(),
        allImageUrls
      );

      // Update the local state
      setWorks(prevWorks => 
        prevWorks.map(work => 
          work.id === editingPost.id 
            ? {
                ...work,
                title: editPostContent.trim(),
                text: editPostContent.trim(),
                image: allImageUrls[0] || work.image,
                images: allImageUrls,
              }
            : work
        )
      );

      Alert.alert('Success', 'Post updated successfully!');
      handleCloseEditPost();
      
      // Reload works from database to ensure UI is synced
      if (isViewingOtherUser && targetUserId) {
        loadPosts(targetUserId);
      } else if (userId) {
        loadPosts(userId);
      }
    } catch (error) {
      console.error('Error updating post:', error);
      Alert.alert('Error', 'Failed to update post. Please try again.');
    }
  };

  // Logout flow: confirm -> sign out -> success -> /login
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [successOpen, setSuccessOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

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
      // optional: console.warn
    } finally {
      setLoggingOut(false);
    }
  };

  const handleSettings = () => {
    if (loading) {
      console.log('Profile still loading, cannot open settings');
      return;
    }
    console.log('Opening settings with data:', { fullName, roleLabel, studentIdNumber, course, phoneNumber });
    setSettingsModalVisible(true);
  };

  // Report functionality (when viewing other user's profile)
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

      // Call the database function to handle the report
      const { data, error } = await supabase.rpc('handle_user_report', {
        p_reporter_id: user.id,
        p_reported_user_id: targetUserId,
        p_reason: reportReason.trim()
      });

      console.log('Report submission result:', { data, error });

      if (error) {
        console.error('Error submitting report:', error);
        Alert.alert('Error', 'Failed to submit report. Please try again.');
        return;
      }

      if (data && data.success) {
        console.log('Report submitted successfully:', data);
        if (data.is_blocked) {
          Alert.alert(
            'Report Submitted', 
            'The user has been automatically blocked due to receiving 3 warnings.'
          );
        } else {
          Alert.alert(
            'Report Submitted', 
            `Report submitted successfully. The user now has ${data.warning_count} warning(s).`
          );
        }
        closeReportModal();
      } else {
        Alert.alert('Error', 'Failed to submit report. Please try again.');
      }
    } catch (error) {
      console.error('Error submitting report:', error);
      Alert.alert('Error', 'Failed to submit report. Please try again.');
    }
  };

  // Handler for clicking the message icon in post details modal
  const handleMessageIconClick = async () => {
    // Only allow messaging when viewing another user's profile
    if (!isViewingOtherUser || !targetUserId) {
      console.log('Cannot message: not viewing another user or targetUserId is missing');
      return;
    }

    try {
      // Get current authenticated user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        Alert.alert('Error', 'You must be logged in to send a message.');
        return;
      }

      console.log('Creating/getting conversation between:', user.id, 'and', targetUserId);

      // Get or create conversation between current user and the runner
      let conversationId: string | null = null;

      // Look for existing conversation between these users
      const { data: existing } = await supabase
        .from("conversations")
        .select("id")
        .or(`and(user1_id.eq.${user.id},user2_id.eq.${targetUserId}),and(user1_id.eq.${targetUserId},user2_id.eq.${user.id})`)
        .limit(1);

      if (existing && existing.length) {
        conversationId = String(existing[0].id);
        console.log('Found existing conversation:', conversationId);
      } else {
        // Create new conversation
        const { data: created, error: convErr } = await supabase
          .from("conversations")
          .insert({
            user1_id: user.id,
            user2_id: targetUserId,
            created_at: new Date().toISOString(),
            last_message_at: new Date().toISOString(),
          })
          .select("id")
          .single();
        
        if (convErr) {
          console.error('Error creating conversation:', convErr);
          throw convErr;
        }
        conversationId = String(created.id);
        console.log('Created new conversation:', conversationId);
      }

      // Get runner's name and details for navigation
      const runnerFirstName = otherUserProfile?.first_name || '';
      const runnerLastName = otherUserProfile?.last_name || '';
      const runnerName = `${runnerFirstName} ${runnerLastName}`.trim() || 'Runner';
      const runnerInitials = `${runnerFirstName[0] || ''}${runnerLastName[0] || ''}`.toUpperCase() || 'R';

      console.log('Navigating to messages hub with:', {
        conversationId,
        otherUserId: targetUserId,
        contactName: runnerName,
        contactInitials: runnerInitials,
      });

      // Close the post detail modal before navigating
      handleClosePostDetailModal();

      // Navigate to messages hub based on the authenticated user's role
      const messagesPath = roleLabel === 'BuddyCaller' 
        ? '/buddycaller/messages_hub' 
        : '/buddyrunner/messages_hub';

      router.push({
        pathname: messagesPath,
        params: {
          conversationId,
          otherUserId: targetUserId,
          contactName: runnerName,
          contactInitials: runnerInitials,
          isOnline: 'false',
        },
      } as any);

    } catch (error) {
      console.error('Error in handleMessageIconClick:', error);
      Alert.alert('Error', 'Failed to open chat. Please try again.');
    }
  };

  // Debug function to test SQL function directly
  const testReportFunction = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      console.log('🧪 Testing handle_user_report function directly...');
      
      // Test with a dummy user ID (replace with actual user ID for testing)
      const testUserId = targetUserId || user.id;
      
      const { data, error } = await supabase.rpc('handle_user_report', {
        p_reporter_id: user.id,
        p_reported_user_id: testUserId,
        p_reason: 'Test report for debugging'
      });

      console.log('🧪 Direct function test result:', { data, error });
      
      if (data) {
        console.log('🧪 Function returned:', {
          success: data.success,
          warningCount: data.warning_count,
          isBlocked: data.is_blocked,
          message: data.message
        });
      }
    } catch (error) {
      console.error('🧪 Error testing function:', error);
    }
  };

  // Add test functions to window for debugging
  if (typeof window !== 'undefined') {
    (window as any).testReportFunction = testReportFunction;
    (window as any).checkUserStatus = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      
      const { data: userData } = await supabase
        .from('users')
        .select('id, first_name, last_name, is_blocked, warning_count, blocked_at')
        .eq('id', user.id)
        .single();
      
      console.log('👤 Current user status:', userData);
      return userData;
    };
    (window as any).checkTargetUserStatus = async () => {
      if (!targetUserId) {
        console.log('❌ No target user ID available. Make sure you are viewing another user\'s profile.');
        return;
      }
      
      const { data: userData } = await supabase
        .from('users')
        .select('id, first_name, last_name, is_blocked, warning_count, blocked_at')
        .eq('id', targetUserId)
        .single();
      
      console.log('👤 TARGET USER status:', userData);
      return userData;
    };
    (window as any).testBlockUser = async () => {
      try {
        if (!targetUserId) {
          console.log('❌ No target user ID available. Make sure you are viewing another user\'s profile.');
          return;
        }

        console.log('🧪 Testing user blocking for TARGET USER:', targetUserId);
        
        // Manually set the TARGET USER as blocked for testing
        const { error } = await supabase
          .from('users')
          .update({ 
            is_blocked: true, 
            warning_count: 3,
            blocked_at: new Date().toISOString()
          })
          .eq('id', targetUserId);

        if (error) {
          console.error('Error blocking target user:', error);
        } else {
          console.log('✅ TARGET USER blocked for testing. The reported user should be logged out when they try to access the app.');
        }
      } catch (error) {
        console.error('Error in testBlockUser:', error);
      }
    };
    (window as any).testBlockCurrentUser = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        console.log('🧪 Testing user blocking for CURRENT USER:', user.id);
        
        // Manually set CURRENT USER as blocked for testing
        const { error } = await supabase
          .from('users')
          .update({ 
            is_blocked: true, 
            warning_count: 3,
            blocked_at: new Date().toISOString()
          })
          .eq('id', user.id);

        if (error) {
          console.error('Error blocking current user:', error);
        } else {
          console.log('✅ CURRENT USER blocked for testing. Refresh page to see logout.');
        }
      } catch (error) {
        console.error('Error in testBlockCurrentUser:', error);
      }
    };
    (window as any).forceLogout = async () => {
      console.log('🚨 FORCING LOGOUT...');
      try {
        // Clear any cached user data
        await supabase.auth.signOut();
        
        // Force clear any local storage
        if (typeof window !== 'undefined') {
          localStorage.clear();
          sessionStorage.clear();
        }
        
        // Force redirect to login
        window.location.href = '/login';
        
        console.log('✅ LOGOUT COMPLETED - REDIRECTING TO LOGIN');
      } catch (error) {
        console.error('❌ LOGOUT ERROR:', error);
        // Force redirect even if there's an error
        window.location.href = '/login';
      }
    };
  }

  if (displayLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading profile...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      
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
        {/* Overlay backdrop for small screens when sidebar is open */}
        {isSmallScreen && open && (
          <TouchableOpacity
            style={styles.sidebarOverlay}
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
        
        <View style={styles.mainArea}>
          <View style={styles.headerBackground}>
            <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
              {/* Header */}
              <View style={styles.header}>
              <View style={styles.headerLeft}>
                {isSmallScreen && (
                  <>
                    <TouchableOpacity
                      onPress={() => setOpen(true)}
                      style={styles.hamburgerBtn}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="menu-outline" size={24} color={colors.white} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={handleBack} style={styles.backButtonIcon} activeOpacity={0.8}>
                      <Ionicons name="arrow-back" size={22} color={colors.white} />
                    </TouchableOpacity>
                  </>
                )}
                {!isSmallScreen && (
                  <TouchableOpacity onPress={handleBack} style={styles.backButton}>
                    <Ionicons name="arrow-back" size={24} color={colors.white} />
                  </TouchableOpacity>
                )}
              </View>

              <View style={[styles.headerTitleWrap, isSmallScreen && { alignItems: "center" }]}>
                <Text style={[styles.headerTitle, isSmallScreen && { textAlign: "center" }]}>Profile</Text>
              </View>

              <View style={styles.headerButtons}>
                {isViewingOtherUser ? (
                  <TouchableOpacity onPress={handleReportUser} style={styles.reportButton}>
                    <Ionicons name="flag-outline" size={24} color={colors.white} />
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity onPress={handleSettings} style={styles.settingsButton}>
                    <Ionicons name="settings-outline" size={24} color={colors.white} />
                  </TouchableOpacity>
                )}
              </View>
            </View>

        {/* Profile Section */}
        <View style={styles.profileSection}>
          <View style={styles.profileImageContainer}>
            <Image
              source={
                displayProfile?.profile_picture_url
                  ? { uri: displayProfile.profile_picture_url }
                  : require('../../assets/images/no_user.png')
              }
              style={styles.profileImage}
            />
            {!isViewingOtherUser && (
              <TouchableOpacity style={styles.cameraButton} onPress={handleProfileImagePicker}>
                <Ionicons name="camera" size={20} color={colors.maroon} />
              </TouchableOpacity>
            )}
          </View>
          
          <Text style={styles.userName}>
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
          <Text style={styles.userRole}>
            {displayProfile?.role === 'buddycaller' ? 'BuddyCaller' : 'BuddyRunner'}
          </Text>
        </View>

        {/* Post Section - Only show for own profile */}
        {!isViewingOtherUser && (
          <View style={styles.postSection}>
            <Text style={styles.sectionTitle}>Post</Text>
            <TouchableOpacity style={styles.postContainer} onPress={openModal}>
              <TextInput
                style={styles.postInput}
                placeholder="Post your works"
                placeholderTextColor={colors.darkGray}
                value={postText}
                onChangeText={setPostText}
                multiline
                numberOfLines={2}
                editable={false}
                pointerEvents="none"
              />
            </TouchableOpacity>
          </View>
        )}

        {/* Portfolio Section - Only show when viewing a BuddyRunner or own profile */}
        {(!isViewingOtherUser || (isViewingOtherUser && otherUserProfile?.role === 'BuddyRunner')) && (
          <View style={styles.portfolioSection}>
            <Text style={styles.sectionTitle}>Works</Text>
            {works.length > 0 ? (
              works.map((work) => (
                <WorkCard 
                  key={work.id} 
                  work={work} 
                  isViewingOtherUser={isViewingOtherUser}
                  handleOpenPostOptions={handleOpenPostOptions}
                  postOptionsModalVisible={postOptionsModalVisible}
                  selectedPostForOptions={selectedPostForOptions}
                  handleEditPost={handleEditPost}
                  handleDeletePostFromOptions={handleDeletePostFromOptions}
                  handleClosePostOptions={handleClosePostOptions}
                  onPress={() => handlePostPress(work)}
                />
              ))
            ) : (
              <Text style={styles.noContentText}>No works yet</Text>
            )}
          </View>
        )}

        {/* Reviews Section */}
        <View style={styles.reviewsSection}>
          <Text style={styles.sectionTitle}>Reviews</Text>
          {reviewsLoading ? (
            <Text style={styles.loadingText}>Loading reviews...</Text>
          ) : reviews.length > 0 ? (
            <>
              {(showAllReviews ? reviews : reviews.slice(0, 5)).map((review) => (
                <ReviewCard key={review.id} review={review} />
              ))}
              {reviews.length > 5 && (
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
            <Text style={styles.noContentText}>No reviews yet</Text>
          )}
        </View>
          </ScrollView>
        </View>
      </View>

      {/* Modal for Post Input */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={closeModal}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Create Post</Text>
              <TouchableOpacity onPress={closeModal}>
                <Ionicons name="close" size={24} color={colors.darkGray} />
              </TouchableOpacity>
            </View>
            
            <View style={styles.modalTextInputContainer}>
              <TextInput
                style={styles.modalTextInput}
                placeholder="Post your works"
                placeholderTextColor={colors.darkGray}
                value={modalPostText}
                onChangeText={setModalPostText}
                multiline
                numberOfLines={8}
                autoFocus={true}
                onSubmitEditing={() => Keyboard.dismiss()}
              />
              <View style={styles.imageControlsContainer}>
                {selectedImages.length > 0 && (
                  <View style={styles.imagesPreviewContainer}>
                    {selectedImages.map((image, index) => (
                      <View key={index} style={styles.selectedImageInTextbox}>
                        <Image source={{ uri: image }} style={styles.textboxImagePreview} />
                        <TouchableOpacity 
                          style={styles.removeImageButton}
                          onPress={() => removeImage(index)}
                        >
                          <Ionicons name="close-circle" size={16} color={colors.maroon} />
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                )}
                <TouchableOpacity style={styles.modalImageIconButton} onPress={pickImage}>
                  <Ionicons name="add" size={24} color={colors.maroon} />
                </TouchableOpacity>
              </View>
            </View>
            
            <View style={styles.modalButtons}>
              <TouchableOpacity onPress={closeModal} style={styles.modalCancelButton}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                onPress={handleModalPostWork} 
                style={styles.modalPostButton}
              >
                <Text style={styles.modalPostText}>
                  Post
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>


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
                style={styles.modalPostButton}
              >
                <Text style={styles.modalPostText}>Submit Report</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Edit Post Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={editPostModalVisible}
        onRequestClose={handleCloseEditPost}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Edit Post</Text>
              <TouchableOpacity onPress={handleCloseEditPost} style={styles.closeButton}>
                <Ionicons name="close" size={24} color={colors.darkGray} />
              </TouchableOpacity>
            </View>

            <View style={styles.modalTextInputContainer}>
              <TextInput
                style={styles.modalTextInput}
                placeholder="Describe your work..."
                placeholderTextColor={colors.darkGray}
                value={editPostContent}
                onChangeText={setEditPostContent}
                multiline
                numberOfLines={8}
                autoFocus={true}
                onSubmitEditing={() => Keyboard.dismiss()}
              />
              <View style={styles.imageControlsContainer}>
                {/* Display existing images */}
                {editPostImages.length > 0 && (
                  <View style={styles.imagesPreviewContainer}>
                    {editPostImages.map((image, index) => (
                      <View key={`existing-${index}`} style={styles.selectedImageInTextbox}>
                        <Image source={{ uri: image }} style={styles.textboxImagePreview} />
                        <TouchableOpacity
                          style={styles.removeImageButton}
                          onPress={() => handleRemoveEditImage(index, false)}
                        >
                          <Ionicons name="close-circle" size={16} color={colors.maroon} />
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                )}
                {/* Display new images */}
                {editPostNewImages.length > 0 && (
                  <View style={styles.imagesPreviewContainer}>
                    {editPostNewImages.map((image, index) => (
                      <View key={`new-${index}`} style={styles.selectedImageInTextbox}>
                        <Image source={{ uri: image }} style={styles.textboxImagePreview} />
                        <TouchableOpacity
                          style={styles.removeImageButton}
                          onPress={() => handleRemoveEditImage(index, true)}
                        >
                          <Ionicons name="close-circle" size={16} color={colors.maroon} />
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                )}
                <TouchableOpacity style={styles.modalImageIconButton} onPress={handleEditPostImage}>
                  <Ionicons name="add" size={24} color={colors.maroon} />
                </TouchableOpacity>
              </View>
            </View>
            
            <View style={styles.modalButtons}>
              <TouchableOpacity onPress={handleCloseEditPost} style={styles.modalCancelButton}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                onPress={handleSaveEditPost} 
                style={styles.modalPostButton}
              >
                <Text style={styles.modalPostText}>
                  Post
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Post Detail Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={postDetailModalVisible}
        onRequestClose={handleClosePostDetailModal}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Post Details</Text>
              <TouchableOpacity onPress={handleClosePostDetailModal} style={styles.closeButton}>
                <Ionicons name="close" size={24} color={colors.darkGray} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
              {selectedPost && (
                <>
                  {/* Text at the top - NOT bold */}
                  {selectedPost.text && (
                    <Text style={{ fontSize: 18, color: colors.text, lineHeight: 24, marginBottom: 16 }}>
                      {selectedPost.text}
                    </Text>
                  )}
                  
                  {/* Image */}
                  {selectedPost.image && (
                    <Image source={{ uri: selectedPost.image }} style={{ width: '100%', height: 300, borderRadius: 12, marginBottom: 12 }} resizeMode="cover" />
                  )}
                </>
              )}
            </ScrollView>

            {/* Message icon and Date - Always visible at bottom */}
            {selectedPost && (
              <>
                <View style={{ flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', paddingTop: 16, borderTopWidth: 1, borderTopColor: colors.lightGray }}>
                  <TouchableOpacity 
                    style={{ padding: 8 }} 
                    onPress={handleMessageIconClick}
                    disabled={!isViewingOtherUser}
                  >
                    <Ionicons name="chatbubble-outline" size={24} color={colors.maroon} />
                  </TouchableOpacity>
                </View>
                
                {/* Date below the line */}
                {selectedPost.created_at && (
                  <Text style={{ fontSize: 12, color: colors.gray, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 }}>
                    {new Date(selectedPost.created_at).toLocaleDateString('en-US', { 
                      weekday: 'long',
                      month: 'short', 
                      day: 'numeric',
                      year: 'numeric'
                    })}
                  </Text>
                )}
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        transparent
        visible={deleteConfirmModalVisible}
        animationType="fade"
        onRequestClose={() => { setDeleteConfirmModalVisible(false); setPostToDelete(null); }}
      >
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.38)", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <View style={{ width: 360, maxWidth: "100%", backgroundColor: "#fff", borderRadius: 14, padding: 18 }}>
            <Text style={{ color: colors.text, fontSize: 16, fontWeight: "900", marginBottom: 6 }}>Delete Post</Text>
            <Text style={{ color: colors.text, fontSize: 13, opacity: 0.9, marginBottom: 14 }}>Are you sure you want to delete this post? This action cannot be undone.</Text>
            <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 10 }}>
              <TouchableOpacity onPress={() => { setDeleteConfirmModalVisible(false); setPostToDelete(null); }} style={{ paddingVertical: 10, paddingHorizontal: 16, borderRadius: 10, backgroundColor: "#EEE" }} activeOpacity={0.9}>
                <Text style={{ color: colors.text, fontWeight: "700" }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleConfirmDeletePost} style={{ paddingVertical: 10, paddingHorizontal: 16, borderRadius: 10, backgroundColor: colors.maroon }} activeOpacity={0.9}>
                <Text style={{ color: "#fff", fontWeight: "700" }}>Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.light,
  },
  scrollView: {
    flex: 1,
    backgroundColor: colors.light,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: colors.white,
    fontSize: 18,
  },
  headerBackground: {
    backgroundColor: colors.maroon,
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: rp(20),
    paddingVertical: rp(9),
    backgroundColor: colors.maroon,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minWidth: 120,
  },
  headerTitleWrap: {
    flex: 1,
    alignItems: "flex-start",
    justifyContent: "center",
  },
  headerButtons: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    minWidth: 80,
    gap: 8,
  },
  backButton: {
    padding: rp(8),
  },
  backButtonIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 255, 255, 0.15)",
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
    paddingVertical: rp(12), // Reduced by ~40%
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
  portfolioSection: {
    backgroundColor: colors.white,
    marginHorizontal: rp(15),
    marginTop: rp(20),
    marginBottom: rp(8),
    borderRadius: webResponsive.borderRadius(12),
    padding: rp(20),
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    marginBottom: rp(16),
  },
  workCard: {
    flexDirection: 'row',
    backgroundColor: colors.light,
    borderRadius: webResponsive.borderRadius(8),
    padding: rp(12),
    marginBottom: rp(12),
    position: 'relative',
  },
  workCardContent: {
    flexDirection: 'row',
    flex: 1,
  },
  workImage: {
    width: 50, // Smaller
    height: 50,
    borderRadius: 6, // Smaller radius
    marginRight: rp(12), // Less margin
  },
  workContent: {
    flex: 1,
  },
  workTitle: {
    fontSize: 14, // Smaller font
    fontWeight: '600',
    color: colors.text,
    marginBottom: rp(4), // Less margin
  },
  workTitleNotBold: {
    fontSize: 14, // Smaller font
    color: colors.text,
    marginBottom: rp(4), // Less margin
  },
  workText: {
    fontSize: 12, // Smaller font
    color: colors.gray,
  },
  reviewsSection: {
    backgroundColor: colors.white,
    marginHorizontal: rp(15),
    marginTop: rp(20),
    marginBottom: rp(8),
    borderRadius: webResponsive.borderRadius(12),
    padding: rp(20),
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  reviewCard: {
    backgroundColor: colors.faint,
    borderRadius: webResponsive.borderRadius(8),
    padding: rp(10),
    marginBottom: rp(10),
  },
  reviewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: rp(6),
  },
  reviewerInfo: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    flex: 1,
  },
  reviewerDetails: {
    flex: 1,
    marginLeft: rp(8),
  },
  nameAndStarsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rp(8),
    flexWrap: 'wrap',
  },
  reviewerInitials: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.maroon,
    justifyContent: 'center',
    alignItems: 'center',
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
    gap: 2,
  },
  reviewDate: {
    fontSize: 11,
    color: colors.gray,
    opacity: 0.7,
    marginLeft: rp(8),
  },
  reviewComment: {
    fontSize: 13,
    color: colors.text,
    lineHeight: 18,
  },
  emptyComment: {
    fontSize: 13,
    color: colors.gray,
    fontStyle: 'italic',
    opacity: 0.6,
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
  noContentText: {
    textAlign: 'center',
    color: colors.gray,
    fontSize: 14,
    fontStyle: 'italic',
    paddingVertical: rp(20),
    opacity: 0.7,
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
  
  // Post section styles
  postSection: {
    backgroundColor: colors.white,
    marginHorizontal: rp(15),
    marginTop: rp(20),
    marginBottom: rp(8),
    borderRadius: webResponsive.borderRadius(12),
    padding: rp(20),
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  
  postContainer: {
    backgroundColor: colors.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.lightGray,
    padding: 16,
  },
  
  postInput: {
    fontSize: 16,
    color: colors.text,
    minHeight: 50,
    textAlignVertical: 'top',
  },
  
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  
  modalContent: {
    backgroundColor: colors.white,
    borderRadius: 20,
    padding: 20,
    width: '90%',
    maxWidth: 600,
    maxHeight: '70%',
    display: 'flex',
    flexDirection: 'column',
  },
  
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text,
  },
  
  modalTextInputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    borderWidth: 1,
    borderColor: colors.lightGray,
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    backgroundColor: colors.white,
  },
  
  modalTextInput: {
    fontSize: 16,
    color: colors.text,
    minHeight: 150,
    textAlignVertical: 'top',
    flex: 1,
  },
  
  modalImageIconButton: {
    padding: 8,
    marginLeft: 8,
  },
  
  imageControlsContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    flexWrap: 'wrap',
    marginLeft: 8,
  },
  
  imagesPreviewContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginRight: 8,
  },
  
  selectedImageInTextbox: {
    position: 'relative',
    marginRight: 8,
    marginBottom: 4,
  },
  
  textboxImagePreview: {
    width: 50,
    height: 50,
    borderRadius: 8,
    resizeMode: 'cover',
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
    color: colors.darkGray,
    fontSize: 16,
    fontWeight: '500',
  },
  
  modalPostButton: {
    backgroundColor: colors.maroon,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  
  modalPostText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '600',
  },
  
  modalPostButtonDisabled: {
    backgroundColor: colors.lightGray,
  },
  
  modalPostTextDisabled: {
    color: colors.darkGray,
  },
  
  removeImageButton: {
    position: 'absolute',
    top: -6,
    right: -6,
    backgroundColor: colors.white,
    borderRadius: 12,
  },

  // Post options button styles
  postOptionsButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: colors.white,
    borderRadius: 20,
    padding: 6,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },

  // Full-screen backdrop for post options menu
  fullScreenBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1000,
    backgroundColor: 'transparent',
  },
  postOptionsMenu: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: colors.white,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 0,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
    minWidth: 120,
    zIndex: 1001,
  },
  postOptionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 12,
  },
  postOptionButtonText: {
    fontSize: 14,
    color: colors.black,
    fontWeight: '500',
  },

  // Edit Post Modal styles
  imagesPreviewTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 8,
  },
  imagesPreview: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },

  // Missing modal styles for edit post
  closeButton: {
    padding: 8,
  },
  modalButtonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  modalCancelButtonText: {
    color: colors.darkGray,
    fontSize: 16,
    fontWeight: '600',
  },
  modalPostButtonText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '600',
  },
  
  // Report modal styles
  reportButton: {
    padding: 8,
  },
  
  // Reuse shared modalOverlay/modalContent/modalHeader/modalTitle/modalButtons
  // Only add the report-specific fields below
  modalSubtitle: {
    fontSize: 14,
    color: colors.darkGray,
    marginBottom: 16,
  },
  
  reportInputContainer: {
    marginBottom: 20,
  },
  
  reportTextInput: {
    borderWidth: 1,
    borderColor: colors.lightGray,
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: colors.black,
    minHeight: 100,
  },

  // Sidebar styles
  sidebar: { 
    borderRightColor: "#EDE9E8", 
    borderRightWidth: 1, 
    backgroundColor: "#fff" 
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
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    marginRight: 12,
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
    paddingHorizontal: 16,
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

  // Main area styles
  mainArea: {
    flex: 1,
    backgroundColor: colors.light,
  },
});

