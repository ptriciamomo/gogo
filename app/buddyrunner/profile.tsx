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
  Keyboard,
  ActionSheetIOS,
  Platform,
  TouchableWithoutFeedback,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { responsive, rw, rh, rf, rp, rb } from '../../utils/responsive';
import { uploadAndSaveProfilePicture, getProfilePictureUrl } from '../../utils/profilePictureHelpers';
import { uploadPostImage, createPost, getUserPosts, deletePost, updatePost, Post } from '../../utils/postHelpers';

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
  is_blocked?: boolean | null;
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
        .select("id, role, first_name, middle_name, last_name, email, student_id_number, course, phone, profile_picture_url, is_blocked")
        .eq("id", user.id)
        .single<ProfileRow>();
      
      if (error) throw error;

      // Check if user is blocked
      if (row?.is_blocked) {
        console.log('🚨 BLOCKED USER DETECTED:', {
          userId: user.id,
          isBlocked: row.is_blocked,
          userName: `${row.first_name} ${row.last_name}`,
          timestamp: new Date().toISOString()
        });
        
        // Force logout
        await supabase.auth.signOut();
        
        // Note: Navigation will be handled by auth state change listener
        return;
      }

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

// Mock data
const mockReviews: Review[] = [
  {
    id: '1',
    reviewerName: 'Aeri Uchinaga',
    reviewerInitials: 'AU',
    reviewerProfilePictureUrl: null,
    rating: 5,
    comment: "She's so kind and great BuddyCaller.",
    date: 'Aug 2, 2025',
  },
  {
    id: '2',
    reviewerName: 'Ning Yizhuo',
    reviewerInitials: 'NY',
    reviewerProfilePictureUrl: null,
    rating: 5,
    comment: "I have a great experience doing errands for her.",
    date: 'Aug 2, 2025',
  },
  {
    id: '3',
    reviewerName: 'Emily Rodriguez',
    reviewerInitials: 'ER',
    reviewerProfilePictureUrl: null,
    rating: 4,
    comment: "Very reliable and punctual. Great communication throughout the task.",
    date: 'Aug 1, 2025',
  },
  {
    id: '4',
    reviewerName: 'David Kim',
    reviewerInitials: 'DK',
    reviewerProfilePictureUrl: null,
    rating: 5,
    comment: "Excellent service! Went above and beyond expectations.",
    date: 'Jul 30, 2025',
  },
  {
    id: '5',
    reviewerName: 'Lisa Thompson',
    reviewerInitials: 'LT',
    reviewerProfilePictureUrl: null,
    rating: 4,
    comment: "Professional and efficient. Highly recommended for any errands.",
    date: 'Jul 28, 2025',
  },
];

const initialWorks: Work[] = [
  // Start with empty works array - only show user's actual posts
];

export default function BuddyrunnerProfile() {
  // Check if we're on web platform
  if (Platform.OS === 'web') {
    // Import and render the web-specific component
    const BuddyrunnerProfileWeb = require('./profile.web').default;
    return <BuddyrunnerProfileWeb />;
  }

  const router = useRouter();
  const params = useLocalSearchParams();
  const targetUserId = params.userId as string;
  const isViewingOtherUser = params.isViewingOtherUser === 'true';
  const returnTo = params.returnTo as string;
  const conversationId = params.conversationId as string;
  
    console.log('=== BUDDYRUNNER PROFILE DEBUG ===');
    console.log('Profile params:', { targetUserId, isViewingOtherUser, returnTo, conversationId });
    console.log('isViewingOtherUser type:', typeof isViewingOtherUser, 'value:', isViewingOtherUser);
    console.log('All params received:', params);
  
  const { loading, firstName, lastName, fullName, roleLabel, course, phoneNumber, studentIdNumber, profilePictureUrl, userId, setProfilePictureUrl } = useAuthProfile();
  
  // State for other user's profile data
  const [otherUserProfile, setOtherUserProfile] = useState<any>(null);
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
  
  // Helper to construct full name with middle name filtering
  const getDisplayFullName = () => {
    if (!isViewingOtherUser) {
      return fullName || 'User';
    }
    if (!displayProfile) {
      return 'User';
    }
    const f = titleCase(displayProfile.first_name || '');
    const m = titleCase(displayProfile.middle_name || '');
    const l = titleCase(displayProfile.last_name || '');
    const shouldIgnoreM = shouldIgnoreMiddleName(displayProfile.middle_name);
    return [f, !shouldIgnoreM ? m : null, l].filter(Boolean).join(" ").trim() || 'User';
  };
  
  const displayFullName = getDisplayFullName();
  const displayRoleLabel = isViewingOtherUser ? (displayProfile?.role || 'User') : roleLabel;
  const displayProfilePictureUrl = isViewingOtherUser ? (displayProfile?.profile_picture_url || '') : profilePictureUrl;
  const displayCourse = isViewingOtherUser ? (displayProfile?.course || '') : course;
  const displayPhoneNumber = isViewingOtherUser ? (displayProfile?.phone || '') : phoneNumber;
  const displayStudentIdNumber = isViewingOtherUser ? (displayProfile?.student_id_number || '') : studentIdNumber;
  
  // Debug block removed
  
  // Log when otherUserProfile changes (debug removed)
  useEffect(() => {
  }, [otherUserProfile]);
  const [postText, setPostText] = useState('');
  
  const [modalVisible, setModalVisible] = useState(false);
  const [modalPostText, setModalPostText] = useState('');
  const [selectedImages, setSelectedImages] = useState<string[]>([]);
  const [works, setWorks] = useState<Work[]>([]);
  const [postsLoading, setPostsLoading] = useState(false);
  const [showAllWorks, setShowAllWorks] = useState(false);
  const [showAllReviews, setShowAllReviews] = useState(false);
  const [allWorksModalVisible, setAllWorksModalVisible] = useState(false);
  const [allReviewsModalVisible, setAllReviewsModalVisible] = useState(false);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(true);
  const [selectedPostModalVisible, setSelectedPostModalVisible] = useState(false);
  const [selectedPost, setSelectedPost] = useState<Work | null>(null);
  const [likedPosts, setLikedPosts] = useState<Set<string>>(new Set());
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

  const handlePostWork = () => {
    if (!postText.trim()) {
      Alert.alert('Error', 'Please enter some content for your post.');
      return;
    }
    
    Alert.alert('Success', 'Work posted successfully!');
    setPostText('');
  };

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

  const pickImage = () => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ['Cancel', 'Take Photo', 'Choose from Library'],
          cancelButtonIndex: 0,
        },
        (buttonIndex) => {
          if (buttonIndex === 1) {
            takePhoto();
          } else if (buttonIndex === 2) {
            chooseFromLibrary();
          }
        }
      );
    } else {
      Alert.alert(
        'Select Image',
        'Choose an option',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Take Photo', onPress: takePhoto },
          { text: 'Choose from Library', onPress: chooseFromLibrary },
        ]
      );
    }
  };

  const takePhoto = async () => {
    try {
      // Request camera permissions
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Camera permission is needed to take photos');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        setSelectedImages(prev => [...prev, result.assets[0].uri]);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to take photo');
    }
  };

  const chooseFromLibrary = async () => {
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

  const handleShowAllWorks = () => {
    setAllWorksModalVisible(true);
  };

  const handleShowAllReviews = () => {
    setAllReviewsModalVisible(true);
  };

  const closeAllWorksModal = () => {
    setAllWorksModalVisible(false);
  };

  const closeAllReviewsModal = () => {
    setAllReviewsModalVisible(false);
  };

  const handlePostPress = (work: Work) => {
    // Close the All Works modal first
    setAllWorksModalVisible(false);
    // Then open the post detail modal
    setSelectedPost(work);
    setSelectedPostModalVisible(true);
  };

  const closeSelectedPostModal = () => {
    setSelectedPostModalVisible(false);
    setSelectedPost(null);
  };

  // Handler for clicking the message icon in post details modal (mobile)
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

      console.log('Navigating to ChatScreen with:', {
        conversationId,
        otherUserId: targetUserId,
        contactName: runnerName,
        contactInitials: runnerInitials,
      });

      // Close the post detail modal before navigating
      closeSelectedPostModal();

      // Navigate to appropriate ChatScreen based on the authenticated user's role
      const chatScreenPath = roleLabel === 'BuddyCaller' 
        ? '/buddycaller/ChatScreenCaller' 
        : '/buddyrunner/ChatScreenRunner';

      router.push({
        pathname: chatScreenPath,
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

  const handleLikePost = (postId: string) => {
    setLikedPosts(prev => {
      const newSet = new Set(prev);
      if (newSet.has(postId)) {
        newSet.delete(postId);
      } else {
        newSet.add(postId);
      }
      return newSet;
    });
  };

  const handleSharePost = (post: Work) => {
    const shareContent = {
      title: 'Check out this post!',
      message: `${post.text}\n\nShared from GoBuddy`,
      url: '', // You can add a URL if you have one
    };
    
    Alert.alert(
      'Share Post',
      'Post shared successfully!',
      [{ text: 'OK' }]
    );
  };

  const handleLogout = () => {
    Alert.alert(
      'Log Out',
      'Are you sure you want to log out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Log Out',
          style: 'destructive',
          onPress: () => {
            // Handle logout logic here
            router.replace('/login');
          },
        },
      ]
    );
  };

  const handleEditProfile = () => {
    router.push('/buddyrunner/edit_profile');
  };

  const openSettingsModal = () => {
    setSettingsModalVisible(true);
  };

  const closeSettingsModal = () => {
    setSettingsModalVisible(false);
  };

  // Report functionality (when viewing other user's profile)
  const handleReportUser = () => {
    setReportModalVisible(true);
  };

  const closeReportModal = () => {
    setReportModalVisible(false);
    setReportReason('');
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

  // Add test function to window for debugging
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
        
        // Force redirect to login
        router.replace('/login');
        
        console.log('✅ LOGOUT COMPLETED - REDIRECTING TO LOGIN');
      } catch (error) {
        console.error('❌ LOGOUT ERROR:', error);
        // Force redirect even if there's an error
        router.replace('/login');
      }
    };
  }

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
        
        // Additional debugging for blocking
        if (data.is_blocked) {
          console.log('🚨 USER BLOCKED:', {
            reportedUserId: targetUserId,
            warningCount: data.warning_count,
            isBlocked: data.is_blocked,
            message: data.message,
            timestamp: new Date().toISOString()
          });
          
          Alert.alert(
            'Report Submitted', 
            'The user has been automatically blocked due to receiving 3 warnings.'
          );
        } else {
          console.log('⚠️ Warning issued:', {
            reportedUserId: targetUserId,
            warningCount: data.warning_count,
            isBlocked: data.is_blocked,
            message: data.message,
            timestamp: new Date().toISOString()
          });
          
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

  // Post options functionality
  const handleOpenPostOptions = (work: Work) => {
    // console.log('handleOpenPostOptions called with work:', work);
    setSelectedPostForOptions(work);
    setPostOptionsModalVisible(true);
    // console.log('Post options modal should be visible now');
  };

  const handleClosePostOptions = () => {
    setPostOptionsModalVisible(false);
    setSelectedPostForOptions(null);
  };

  const handleEditPost = () => {
    // console.log('=== EDIT BUTTON CLICKED ===');
    // console.log('selectedPostForOptions:', selectedPostForOptions);
    
    if (!selectedPostForOptions) {
      // console.log('No post selected!');
      return;
    }
    
    // console.log('Setting up edit modal...');
    // Set up the edit modal with current post data
    setEditingPost(selectedPostForOptions);
    setEditPostTitle(selectedPostForOptions.text || '');
    setEditPostContent(selectedPostForOptions.text || '');
    setEditPostImages(selectedPostForOptions.images || []);
    setEditPostNewImages([]);
    
    // console.log('Setting editPostModalVisible to true...');
    setEditPostModalVisible(true);
    
    // console.log('Closing post options...');
    handleClosePostOptions();
    
    // console.log('Edit button click completed');
  };

  const handleDeletePostFromOptions = async () => {
    if (!selectedPostForOptions) return;

    Alert.alert(
      'Delete Post',
      'Are you sure you want to delete this post? This action cannot be undone.',
      [
        {
          text: 'Cancel',
          style: 'cancel',
          onPress: handleClosePostOptions,
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const { data: { user } } = await supabase.auth.getUser();
              if (!user) {
                Alert.alert('Error', 'You must be logged in to delete a post.');
                return;
              }

              await deletePost(selectedPostForOptions.id, user.id);
              setWorks(prevWorks => prevWorks.filter(work => work.id !== selectedPostForOptions.id));
              Alert.alert('Success', 'Post deleted successfully!');
              handleClosePostOptions();
            } catch (error) {
              console.error('Error deleting post:', error);
              Alert.alert('Error', 'Failed to delete post. Please try again.');
            }
          },
        },
      ],
      { cancelable: true }
    );
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
    if (!editingPost || (!editPostContent.trim() && editPostImages.length === 0 && editPostNewImages.length === 0)) {
      Alert.alert('Error', 'Please enter some content or add an image to your post.');
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        Alert.alert('Error', 'You must be logged in to edit a post.');
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

  const handleSettingsEditProfile = () => {
    setSettingsModalVisible(false);
    router.push('/buddyrunner/edit_profile');
  };

  const handleChangePassword = () => {
    setSettingsModalVisible(false);
    router.push('/buddyrunner/change_password');
  };

  const handleProfileImagePicker = async () => {
    // Request permissions
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Please grant camera roll permissions to select an image.');
      return;
    }

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

  const renderStars = (rating: number) => {
    return Array.from({ length: 5 }, (_, index) => (
      <Ionicons
        key={index}
        name="star"
        size={16}
        color={index < rating ? '#FFD700' : '#E0E0E0'}
      />
    ));
  };

  const renderReview = (review: Review) => (
    <View key={review.id} style={styles.reviewCard}>
      <View style={styles.reviewHeader}>
        <View style={styles.reviewerInfo}>
          <View style={styles.reviewerAvatar}>
            {review.reviewerProfilePictureUrl ? (
              <Image 
                source={{ uri: review.reviewerProfilePictureUrl }} 
                style={styles.reviewerProfileImage}
              />
            ) : (
              <Text style={styles.reviewerInitials}>{review.reviewerInitials}</Text>
            )}
          </View>
          <Text style={styles.reviewerName}>{review.reviewerName}</Text>
        </View>
        <Text style={styles.reviewDate}>{review.date}</Text>
      </View>
      
      <View style={styles.ratingContainer}>
        {renderStars(review.rating)}
      </View>
      
      <Text style={styles.reviewComment}>"{review.comment}"</Text>
        </View>
    );

  const renderWork = (work: Work) => (
    <View key={work.id} style={styles.workCard}>
      <TouchableOpacity style={styles.workCardContent} onPress={() => handlePostPress(work)}>
        {work.image && (
          <Image source={{ uri: work.image }} style={styles.workCardImage} />
        )}
        {work.text && (
          <View style={styles.workCardTextContainer}>
            <Text style={styles.workCardText} numberOfLines={3}>
              {work.text}
            </Text>
          </View>
        )}
        <View style={styles.workCardFooter}>
          <Text style={styles.workCardDate}>
            {new Date().toLocaleDateString('en-US', { 
              month: 'short', 
              day: 'numeric',
              year: 'numeric'
            })}
          </Text>
          <View style={styles.workCardActions}>
            {work.images && work.images.length > 1 && (
              <View style={styles.multipleImagesIndicator}>
                <Ionicons name="images" size={14} color={colors.maroon} />
                <Text style={styles.multipleImagesText}>{work.images.length}</Text>
              </View>
            )}
            <TouchableOpacity style={styles.workCardLike}>
              <Ionicons name="heart-outline" size={16} color={colors.darkGray} />
            </TouchableOpacity>
          </View>
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
          <TouchableOpacity 
            style={styles.postOptionButton} 
            onPress={handleEditPost}
          >
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

    return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>

        {/* Header with smaller dark red background */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => {
            if (returnTo === 'ChatScreenRunner' && conversationId) {
              router.push({
                pathname: '/buddyrunner/ChatScreenRunner',
                params: {
                  conversationId: conversationId,
                  otherUserId: targetUserId,
                  contactName: otherUserProfile ? `${otherUserProfile.first_name} ${otherUserProfile.last_name}` : 'Contact',
                }
              });
            } else if (returnTo === 'ChatScreenCaller' && conversationId) {
              router.push({
                pathname: '/buddycaller/ChatScreenCaller',
                params: {
                  conversationId: conversationId,
                  otherUserId: targetUserId,
                  contactName: otherUserProfile ? `${otherUserProfile.first_name} ${otherUserProfile.last_name}` : 'Contact',
                }
              });
            } else if (returnTo === 'BuddyRunnerTaskProgress') {
              router.back();
            } else if (returnTo === 'BuddyCallerTaskProgress') {
              router.back();
            } else if (returnTo === 'BuddyCallerHome') {
              router.push('/buddycaller/home');
            } else {
              router.push('/buddyrunner/home');
            }
          }} style={styles.backButton}>
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
              <TouchableOpacity style={styles.settingsButton} onPress={openSettingsModal}>
                <Ionicons name="settings-outline" size={24} color={colors.white} />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Profile Picture and Info - keeping same size */}
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
              <TouchableOpacity style={styles.cameraButton} onPress={handleProfileImagePicker}>
                <Ionicons name="camera" size={16} color={colors.white} />
              </TouchableOpacity>
            )}
          </View>
          
          <Text style={styles.userName}>
            {displayLoading ? "Loading..." : (displayFullName && displayFullName.trim() ? displayFullName : "User")}
          </Text>
          <Text style={styles.userRole}>
            {displayLoading ? "Loading..." : (displayRoleLabel && displayRoleLabel.trim() ? displayRoleLabel : "BuddyRunner")}
          </Text>
        </View>

        {/* Main Content */}
        <View style={styles.content}>
          {/* Post Section - Only show for own profile */}
          {!isViewingOtherUser && (
            <View style={styles.section}>
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

          {/* Works Section - Only show when viewing a BuddyRunner or own profile */}
          {(!isViewingOtherUser || (isViewingOtherUser && otherUserProfile?.role === 'BuddyRunner')) && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Works</Text>
                {works.length >= 3 && (
                  <TouchableOpacity onPress={handleShowAllWorks}>
                    <Text style={styles.allLink}>All</Text>
                  </TouchableOpacity>
                )}
              </View>
              
              {works.length > 0 ? (
                <View style={styles.worksContainer}>
                  {works.slice(0, 2).map(renderWork)}
                </View>
              ) : (
                <View style={styles.emptyWorksContainer}>
                  <Ionicons name="images-outline" size={48} color={colors.lightGray} />
                  <Text style={styles.emptyWorksText}>No works yet</Text>
                  <Text style={styles.emptyWorksSubtext}>Create your first post to see it here</Text>
                </View>
              )}
            </View>
          )}

          {/* Reviews Section */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Reviews</Text>
              {reviews.length >= 3 && (
                <TouchableOpacity onPress={handleShowAllReviews}>
                  <Text style={styles.allLink}>All</Text>
                </TouchableOpacity>
              )}
            </View>
            
            {reviewsLoading ? (
              <Text style={styles.loadingText}>Loading reviews...</Text>
            ) : reviews.length > 0 ? (
              <View style={styles.reviewsContainer}>
                {reviews.slice(0, 2).map(renderReview)}
              </View>
            ) : (
              <Text style={styles.noReviewsText}>No reviews yet</Text>
            )}
          </View>

          {/* Bottom Logout Button - Only show for own profile */}
          {!isViewingOtherUser && (
            <View style={styles.bottomSection}>
              <TouchableOpacity onPress={handleLogout} style={styles.logoutButton}>
                <Ionicons name="log-out-outline" size={20} color={colors.white} />
                <Text style={styles.logoutButtonText}>Log Out</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Modal for Post Input */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={closeModal}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity 
            style={styles.modalContent}
            activeOpacity={1}
            onPress={Keyboard.dismiss}
          >
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
          </TouchableOpacity>
        </View>
      </Modal>

      {/* All Works Modal */}
      <Modal
        animationType="slide"
        transparent={false}
        visible={allWorksModalVisible}
        onRequestClose={closeAllWorksModal}
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.allModalHeader}>
            <TouchableOpacity onPress={closeAllWorksModal} style={styles.backButton}>
              <Ionicons name="arrow-back" size={24} color={colors.text} />
            </TouchableOpacity>
            <Text style={styles.allModalTitle}>All Works</Text>
            <View style={styles.placeholder} />
          </View>
          
          <ScrollView style={styles.allModalContent} showsVerticalScrollIndicator={false}>
            {works.length > 0 ? (
              <View style={styles.allWorksContainer}>
                {works.map(renderWork)}
              </View>
            ) : (
              <View style={styles.emptyAllWorksContainer}>
                <Ionicons name="images-outline" size={64} color={colors.lightGray} />
                <Text style={styles.emptyAllWorksText}>No works yet</Text>
                <Text style={styles.emptyAllWorksSubtext}>Create your first post to see it here</Text>
              </View>
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* All Reviews Modal */}
      <Modal
        animationType="slide"
        transparent={false}
        visible={allReviewsModalVisible}
        onRequestClose={closeAllReviewsModal}
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.allModalHeader}>
            <TouchableOpacity onPress={closeAllReviewsModal} style={styles.backButton}>
              <Ionicons name="arrow-back" size={24} color={colors.text} />
            </TouchableOpacity>
            <Text style={styles.allModalTitle}>All Reviews</Text>
            <View style={styles.placeholder} />
          </View>
          
          <ScrollView style={styles.allModalContent} showsVerticalScrollIndicator={false}>
            {reviewsLoading ? (
              <Text style={styles.loadingText}>Loading reviews...</Text>
            ) : reviews.length > 0 ? (
              <View style={styles.allReviewsContainer}>
                {reviews.map(renderReview)}
              </View>
            ) : (
              <Text style={styles.noReviewsText}>No reviews yet</Text>
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* Selected Post Detail Modal */}
      <Modal
        animationType="slide"
        transparent={false}
        visible={selectedPostModalVisible}
        onRequestClose={closeSelectedPostModal}
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.allModalHeader}>
            <TouchableOpacity onPress={closeSelectedPostModal} style={styles.backButton}>
              <Ionicons name="arrow-back" size={24} color={colors.text} />
            </TouchableOpacity>
            <Text style={styles.allModalTitle}>Post</Text>
            <View style={{ width: 24 }} />
          </View>
          
          <ScrollView style={styles.selectedPostContent} showsVerticalScrollIndicator={false}>
            {selectedPost && (
              <>
                {/* Post Text */}
                {selectedPost.text && (
                  <View style={styles.selectedPostTextContainer}>
                    <Text style={styles.selectedPostText}>{selectedPost.text}</Text>
                  </View>
                )}
                
                {/* Post Images */}
                {selectedPost.images && selectedPost.images.length > 0 && (
                  <View style={styles.selectedPostImagesContainer}>
                    {selectedPost.images.map((imageUri, index) => (
                      <View key={index} style={styles.selectedPostImageWrapper}>
                        <Image source={{ uri: imageUri }} style={styles.selectedPostImage} />
                      </View>
                    ))}
                  </View>
                )}
                
              </>
            )}
          </ScrollView>

          {/* Message icon and Date - Always visible at bottom */}
          {selectedPost && (
            <>
              <View style={{ flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', paddingTop: 16, paddingHorizontal: 16, borderTopWidth: 1, borderTopColor: colors.lightGray }}>
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
                <Text style={{ fontSize: 14, color: colors.darkGray, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 }}>
                  {new Date(selectedPost.created_at).toLocaleDateString('en-US', { 
                    weekday: 'long',
                    month: 'long', 
                    day: 'numeric',
                    year: 'numeric'
                  })}
                </Text>
              )}
            </>
          )}
        </SafeAreaView>
      </Modal>

      {/* Settings Modal */}
      <Modal
        visible={settingsModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={closeSettingsModal}
      >
        <TouchableOpacity 
          style={styles.modalOverlay}
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
              
              {/* Action Buttons */}
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
                    handleLogout();
                  }}
                >
                  <Ionicons name="log-out-outline" size={20} color={colors.white} />
                  <Text style={styles.settingsLogoutButtonText}>Log Out</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Report Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={reportModalVisible}
        onRequestClose={closeReportModal}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={styles.reportModalOverlay}>
            <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
              <View style={styles.reportModalContent}>
                <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
                  <View style={styles.reportModalHeader}>
                    <Text style={styles.reportModalTitle}>Report User</Text>
                    <TouchableOpacity onPress={closeReportModal}>
                      <Ionicons name="close" size={24} color={colors.black} />
                    </TouchableOpacity>
                  </View>
                </TouchableWithoutFeedback>
                
                <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
                  <Text style={styles.reportModalSubtitle}>
                    Please provide a reason for reporting this user:
                  </Text>
                </TouchableWithoutFeedback>
                
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
                
                <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
                  <View style={styles.reportModalButtons}>
                    <TouchableOpacity 
                      onPress={closeReportModal} 
                      style={styles.reportModalCancelButton}
                    >
                      <Text style={styles.reportModalCancelText}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity 
                      onPress={submitReport} 
                      style={styles.reportModalSubmitButton}
                    >
                      <Text style={styles.reportModalSubmitText}>Submit Report</Text>
                    </TouchableOpacity>
                  </View>
                </TouchableWithoutFeedback>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Edit Post Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={editPostModalVisible}
        onRequestClose={handleCloseEditPost}
      >
        <View style={styles.modalOverlay}>
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
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
                  placeholder="Post your works"
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
                  <Text style={styles.modalPostText}>Post</Text>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.white,
  },
  
  scrollView: {
    flex: 1,
  },
  
  // Header styles - smaller height
  header: {
    backgroundColor: colors.maroon,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: rp(16),
    paddingVertical: rp(12),
  },
  
  backButton: {
    padding: rp(8),
  },
  
  settingsButton: {
    padding: rp(8),
  },
  
  // Profile section styles - smaller padding
  profileSection: {
    backgroundColor: colors.maroon,
    alignItems: 'center',
    paddingVertical: rp(20),
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
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 4,
    borderColor: colors.white,
  },
  
  profileImage: {
    width: '100%',
    height: '100%',
    borderRadius: rb(60),
  },
  
  cameraButton: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: rw(8),
    height: rw(8),
    borderRadius: rb(16),
    backgroundColor: '#666666',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.white,
  },
  
  userName: {
    fontSize: rf(24),
    fontWeight: 'bold',
    color: colors.white,
    marginBottom: rp(4),
  },
  
  userRole: {
    fontSize: rf(16),
    color: colors.white,
    opacity: 0.9,
  },
  
  // Content styles
  content: {
    paddingHorizontal: 16,
  },
  
  section: {
    marginVertical: 20,
  },
  
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 12,
  },
  
  allLink: {
    fontSize: 14,
    color: colors.maroon,
  },
  
  // Post section styles
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
  
  // Works section styles
  worksContainer: {
    gap: 16,
  },
  
  workCard: {
    backgroundColor: colors.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.lightGray,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    position: 'relative',
  },
  
  workCardImage: {
    width: '100%',
    height: 200,
    resizeMode: 'cover',
  },
  
  workCardContent: {
    flex: 1,
  },
  
  workCardTextContainer: {
    padding: 16,
  },
  
  workCardText: {
    fontSize: 16,
    color: colors.text,
    lineHeight: 22,
  },
  
  workCardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 16,
    paddingTop: 8,
  },
  
  workCardDate: {
    fontSize: 12,
    color: colors.darkGray,
  },
  
  workCardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  
  multipleImagesIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.lightGray,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    gap: 2,
  },
  
  multipleImagesText: {
    fontSize: 10,
    color: colors.maroon,
    fontWeight: '600',
  },
  
  workCardLike: {
    padding: 4,
  },
  
  emptyWorksContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  
  emptyWorksText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.darkGray,
    marginTop: 12,
  },
  
  emptyWorksSubtext: {
    fontSize: 14,
    color: colors.lightGray,
    marginTop: 4,
    textAlign: 'center',
  },
  
  // Reviews section styles
  reviewsContainer: {
    gap: 16,
  },
  
  reviewCard: {
    backgroundColor: colors.white,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.lightGray,
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
  },
  
  reviewerAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.maroon,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  
  reviewerInitials: {
    color: colors.white,
    fontSize: 12,
    fontWeight: 'bold',
  },
  reviewerProfileImage: {
    width: 32,
    height: 32,
    borderRadius: 16,
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
  },
  
  reviewerName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  
  reviewDate: {
    fontSize: 12,
    color: colors.darkGray,
  },
  
  ratingContainer: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  
  reviewComment: {
    fontSize: 14,
    color: colors.text,
    fontStyle: 'italic',
    lineHeight: 20,
  },
  
  // Bottom section styles
  bottomSection: {
    paddingHorizontal: 16,
    paddingVertical: 20,
    paddingBottom: 30,
  },
  
  logoutButton: {
    backgroundColor: colors.maroon,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 16,
    borderRadius: 12,
    gap: 8,
  },
  
  logoutButtonText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '600',
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
    maxHeight: '70%',
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
  
  // Image picker styles
  imagePickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.lightGray,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.lightGray,
    borderStyle: 'dashed',
  },
  
  imagePickerText: {
    marginLeft: 8,
    fontSize: 16,
    color: colors.maroon,
    fontWeight: '500',
  },
  
  imagePreviewContainer: {
    position: 'relative',
    marginBottom: 16,
  },
  
  selectedImagePreview: {
    width: '100%',
    height: 200,
    borderRadius: 12,
    resizeMode: 'cover',
  },
  
  removeImageButton: {
    position: 'absolute',
    top: -6,
    right: -6,
    backgroundColor: colors.white,
    borderRadius: 12,
  },
  
  // All modals styles
  modalContainer: {
    flex: 1,
    backgroundColor: colors.white,
  },
  
  allModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.lightGray,
  },
  
  allModalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text,
  },
  
  placeholder: {
    width: 24,
  },
  
  allModalContent: {
    flex: 1,
    paddingHorizontal: 16,
  },
  
  allWorksContainer: {
    paddingVertical: 16,
    gap: 16,
  },
  
  allReviewsContainer: {
    paddingVertical: 16,
    gap: 16,
  },
  
  emptyAllWorksContainer: {
    alignItems: 'center',
    paddingVertical: 80,
  },
  
  emptyAllWorksText: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.darkGray,
    marginTop: 16,
  },
  
  emptyAllWorksSubtext: {
    fontSize: 16,
    color: colors.lightGray,
    marginTop: 8,
    textAlign: 'center',
  },
  
  // Selected post modal styles
  shareButton: {
    width: 24,
    alignItems: 'center',
  },
  
  selectedPostContent: {
    flex: 1,
  },
  
  selectedPostTextContainer: {
    padding: 16,
  },
  
  selectedPostText: {
    fontSize: 18,
    color: colors.text,
    lineHeight: 26,
  },
  
  selectedPostImagesContainer: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  
  selectedPostImageWrapper: {
    marginBottom: 12,
    borderRadius: 12,
    overflow: 'hidden',
  },
  
  selectedPostImage: {
    width: '100%',
    height: 300,
    resizeMode: 'cover',
  },
  
  selectedPostFooter: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: colors.lightGray,
  },
  
  selectedPostStats: {
    marginBottom: 16,
  },
  
  selectedPostDate: {
    fontSize: 14,
    color: colors.darkGray,
    fontWeight: '500',
  },
  
  selectedPostActions: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    alignItems: 'center',
  },
  
  selectedPostAction: {
    padding: 12,
  },

  // Settings Modal Styles
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
    padding: 8,
  },

  // Report modal styles
  reportModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  reportModalContent: {
    backgroundColor: colors.white,
    borderRadius: 16,
    padding: 20,
    width: '100%',
    maxWidth: 400,
  },
  reportModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  reportModalTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.black,
  },
  reportModalSubtitle: {
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
  reportModalButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  reportModalCancelButton: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.lightGray,
  },
  reportModalCancelText: {
    color: colors.gray,
    fontSize: 16,
    fontWeight: '500',
  },
  reportModalSubmitButton: {
    backgroundColor: colors.maroon,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  reportModalSubmitText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '600',
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
  modalButtonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 20,
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
});



