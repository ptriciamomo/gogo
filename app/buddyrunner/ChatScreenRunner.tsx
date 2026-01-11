// Import React and necessary hooks for state management
import React, { useState, useRef, useEffect } from 'react';
// Import React Native components for building the UI
import {
  SafeAreaView,    // Provides safe area for notched devices
  ScrollView,      // Scrollable container for messages
  FlatList,        // FlatList for web inverted chat
  View,            // Basic container component
  Text,            // Text display component
  TextInput,       // Input field component
  TouchableOpacity, // Touchable button component
  StyleSheet,      // For styling components
  Image,           // For profile pictures
  KeyboardAvoidingView, // For keyboard handling
  Platform,        // For platform-specific behavior
  Alert,           // For showing alerts
  Keyboard,        // For keyboard control
  Modal,           // For modal dialogs
} from 'react-native';
// Import AsyncStorage for persistent storage
import AsyncStorage from '@react-native-async-storage/async-storage';
// Import icons from Expo vector icons library
import { Ionicons } from '@expo/vector-icons';
// Import Expo document picker for file selection
import * as DocumentPicker from 'expo-document-picker';
// Import Expo image picker for photo selection
import * as ImagePicker from 'expo-image-picker';
// Import shared messaging service
import sharedMessagingService, { SharedMessage } from '../../components/SharedMessagingService';
// Import commission settings modal
import CommissionSettingsModal from '../../components/CommissionSettingsModal';
import CommissionSettingsModalWeb from '../../components/CommissionSettingsModal.web';
// Runner chat UI components
import { RunnerChatHeader } from '../../components/chat/runner/RunnerChatHeader';
import { RunnerChatInputBar } from '../../components/chat/runner/RunnerChatInputBar';
import { RunnerEmptyState } from '../../components/chat/runner/RunnerEmptyState';
import { RunnerDateFilterIndicator } from '../../components/chat/runner/RunnerDateFilterIndicator';
import { RunnerImageViewerModal } from '../../components/chat/runner/RunnerImageViewerModal';
import { RunnerInvoiceAcceptedModal } from '../../components/chat/runner/RunnerInvoiceAcceptedModal';
import { RunnerDatePickerModal } from '../../components/chat/runner/RunnerDatePickerModal';
import { RunnerInvoiceFormModal } from '../../components/chat/runner/RunnerInvoiceFormModal';
import { RunnerMessageBubble } from '../../components/chat/runner/RunnerMessageBubble';
// Import hooks
import { useChatMessagesRunner } from '../../hooks/chat/useChatMessagesRunner';
import { useInvoiceActionsRunner } from '../../hooks/chat/useInvoiceActionsRunner';
import { useFileUploadRunner } from '../../hooks/chat/useFileUploadRunner';
import { useFileDownloadRunner } from '../../hooks/chat/useFileDownloadRunner';
// Import responsive utilities
import { responsive, rw, rh, rf, rp, rb } from '../../utils/responsive';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../../lib/supabase';

// TypeScript interface defining the structure of an invoice
interface Invoice {
  id: string;           // Unique identifier for the invoice
  amount: number;       // Invoice amount
  currency: string;     // Currency code (e.g., 'USD', 'EUR')
  description: string;  // Invoice description
  dueDate: string;      // Due date in YYYY-MM-DD format
  status: 'pending' | 'accepted' | 'declined' | 'overdue'; // Invoice status
  items?: {             // Optional line items
    description: string;
    quantity: number;
    price: number;
  }[];
}

// TypeScript interface defining the structure of a chat message
interface ChatMessage extends SharedMessage {
  isTyping?: boolean;   // Whether this is a typing indicator
}

// TypeScript interface defining the structure of a contact
interface Contact {
  id: string;           // Unique identifier for the contact
  name: string;         // Contact's display name
  profilePicture: string; // URL or path to profile picture
  isOnline: boolean;    // Whether contact is currently online
}

// Main React component for the Chat Screen
type ChatScreenRunnerProps = {
  onBack?: () => void;
  onNavigateToTaskReview?: () => void;
};

const ChatScreen: React.FC<ChatScreenRunnerProps> = ({ onBack, onNavigateToTaskReview }) => {
  const router = useRouter();
  // Read params
  const { conversationId, contactName: contactNameParam, otherUserId, commissionId } = useLocalSearchParams();
  
  // If commissionId is not provided, try to find it from the conversation context
  const [resolvedCommissionId, setResolvedCommissionId] = useState<string | null>(null);
  
  // Function to find commission_id from conversation context
  const findCommissionIdFromConversation = async () => {
    if (commissionId) {
      setResolvedCommissionId(commissionId as string);
      return;
    }
    
    if (!otherUserId || !user?.id) return;
    
    try {
      // Find the commission where the current user (runner) is assigned and the other user is the caller
      const { data: commissionData, error } = await supabase
        .from('commission')
        .select('id')
        .eq('runner_id', user.id)
        .eq('buddycaller_id', otherUserId as string)
        .eq('status', 'in_progress')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
        
      if (error && error.code !== 'PGRST116') {
        if (__DEV__) console.warn('Error finding commission for conversation:', error);
        return;
      }
      
      if (commissionData) {
        if (__DEV__) console.log('ChatScreenRunner: Found commission_id from conversation:', commissionData.id);
        setResolvedCommissionId(commissionData.id.toString());
      }
    } catch (e) {
      if (__DEV__) console.warn('Failed to find commission for conversation:', e);
    }
  };
  // Contact
  const contact: Contact = {
    id: '1',
    name: (contactNameParam as string) || 'Contact',
    profilePicture: 'https://via.placeholder.com/40x40/8B2323/FFFFFF?text=YJ',
    isOnline: true,
  };

  // State hook to manage auth user
  const [user, setUser] = useState<any>(null);

  // State hook to manage the current message input
  const [currentMessage, setCurrentMessage] = useState('');

  // State hook to manage image viewer
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  // State hook to manage invoice form visibility
  const [showInvoiceForm, setShowInvoiceForm] = useState(false);


  // State hook to manage invoice form data
  const [invoiceData, setInvoiceData] = useState({
    amount: '',
    currency: 'PHP',
    description: '',
  });

  // State hook to manage date picker visibility
  const [showDatePicker, setShowDatePicker] = useState(false);

  // State hook to manage invoice editing
  const [editingInvoice, setEditingInvoice] = useState<string | null>(null);

  // State hook to track if invoice already exists for this commission
  const [invoiceExists, setInvoiceExists] = useState(false);

  // State hook to manage invoice acceptance modal (copied from Accepted Successfully modal)
  const [invoiceAcceptedOpen, setInvoiceAcceptedOpen] = useState(false);
  const [acceptedCallerName, setAcceptedCallerName] = useState<string>('The caller');
  const [acceptedOnOk, setAcceptedOnOk] = useState<() => void>(() => () => {});

  // Function to show invoice accepted modal (copied from Accepted Successfully modal)
  const showInvoiceAcceptedModal = (callerName: string, onOk: () => void) => {
    setAcceptedCallerName(callerName || 'The caller');
    setAcceptedOnOk(() => onOk);
    setInvoiceAcceptedOpen(true);
  };

  // Ref for scrolling to bottom when new messages arrive
  const scrollViewRef = useRef<ScrollView>(null);

  // Ref to track if initial web scroll has been performed (one-time per conversation)
  const hasInitialWebScrollRef = useRef(false);

  // Ref to track if initial mobile scroll has been performed (one-time per conversation)
  const hasInitialMobileScrollRef = useRef(false);

  // Options menu visibility (3-dots)
  const [moreOpen, setMoreOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const dotsRef = useRef<View>(null);

  // Commission settings modal state
  const [showSettingsModal, setShowSettingsModal] = useState(false);

  // Date filtering state
  const [filteredMessages, setFilteredMessages] = useState<any[]>([]);
  const [isDateFiltered, setIsDateFiltered] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  // Helper function to format date for display
  const formatDateForDisplay = (dateString: string | null) => {
    if (!dateString) return '';
    
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) {
        return dateString; // Fallback to original string
      }
      
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    } catch (error) {
      return dateString; // Fallback to original string
    }
  };

  // Function to clear date filter
  const clearDateFilter = () => {
    setIsDateFiltered(false);
    setFilteredMessages([]);
    setSelectedDate(null);
    
    // Scroll to bottom to show latest messages
    setTimeout(() => {
      if (scrollViewRef.current) {
        scrollViewRef.current.scrollToEnd({ animated: true });
      }
    }, 100);
  };

  // Handle date filtering callback
  const handleDateFiltered = (filteredData: any) => {
    // Reset any previous filter state
    setIsDateFiltered(false);
    
    // Set new filtered messages and selected date
    setFilteredMessages(filteredData.messages || []);
    setSelectedDate(filteredData.selectedDate || null);
    setIsDateFiltered(true);
    
    // Auto-scroll to the oldest invoice message
    if (filteredData.oldestInvoiceMessageId) {
      setTimeout(() => {
        scrollToMessage(filteredData.oldestInvoiceMessageId);
      }, 200);
    }
  };

  // Function to scroll to a specific message
  const scrollToMessage = (messageId: string) => {
    if (scrollViewRef.current) {
      // Use filteredMessages if date filtering is active, otherwise use messages
      const messagesToSearch = isDateFiltered ? filteredMessages : messages;
      const messageIndex = messagesToSearch.findIndex(msg => msg.id === messageId);
      
      if (messageIndex !== -1) {
        // Calculate scroll position based on message index
        const messageHeight = 60; // Approximate height per message
        const scrollPosition = messageIndex * messageHeight;
        
        scrollViewRef.current.scrollTo({
          y: scrollPosition,
          animated: true
        });
      }
    }
  };

  // Web-compatible scroll to bottom function
  const scrollToBottom = () => {
    if (Platform.OS === 'web') {
      // Try global scroll function first (from web wrapper)
      if ((window as any).scrollChatToBottom) {
        try {
          (window as any).scrollChatToBottom();
          return;
        } catch (error) {
          if (__DEV__) console.warn('Global scroll function failed:', error);
        }
      } else {
        // Retry after a short delay if global function isn't available
        setTimeout(() => {
          if ((window as any).scrollChatToBottom) {
            (window as any).scrollChatToBottom();
          } else {
            // Fallback to React Native ScrollView methods
            if (scrollViewRef.current) {
              try {
                scrollViewRef.current.scrollTo({
                  y: 999999, // Large number to ensure we scroll to the bottom
                  animated: true
                });
              } catch (error) {
                // Fallback: try scrollToEnd
                try {
                  scrollViewRef.current.scrollToEnd({ animated: true });
                } catch (fallbackError) {
                  if (__DEV__) console.warn('Scroll to bottom failed:', fallbackError);
                }
              }
            }
          }
        }, 100);
        return;
      }
      
      // Fallback to React Native ScrollView methods
      if (scrollViewRef.current) {
          try {
          scrollViewRef.current.scrollTo({
            y: 999999, // Large number to ensure we scroll to the bottom
            animated: true
          });
        } catch (error) {
          // Fallback: try scrollToEnd
          try {
            scrollViewRef.current.scrollToEnd({ animated: true });
          } catch (fallbackError) {
            console.warn('Scroll to bottom failed:', fallbackError);
          }
        }
      }
    } else {
      // Native mobile scrolling
      if (scrollViewRef.current) {
        scrollViewRef.current.scrollToEnd({ animated: true });
      }
    }
  };

  const openMoreMenu = () => {
    try {
      (dotsRef.current as any)?.measureInWindow?.((x: number, y: number, w: number, h: number) => {
        const offset = 8;
        const menuWidth = 210;
        setMenuPos({ x: Math.max(8, x + w - menuWidth), y: y + h + offset });
        setMoreOpen(true);
      });
    } catch {
      setMenuPos({ x: 12, y: 56 });
      setMoreOpen(true);
    }
  };

  // Disable local mock messaging service; rely on Supabase load + realtime only

  // Load current auth user (profile loading is handled by useChatMessagesRunner hook)
  useEffect(() => {
    const getUser = async () => {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      setUser(authUser);
    };
    getUser();
  }, []);

  // Message sending function is now handled by useFileUploadRunner hook

  // Function to handle back navigation
  const handleGoBack = () => {
    if (onBack) return onBack();
    router.push('/buddyrunner/messages_list');
  };

  // Function to handle phone call
  const handleCall = () => {
    // This would typically initiate a phone call
  };

  // Delete whole conversation (messages, invoices, then conversation row)
  const handleDeleteConversation = () => {
    const cid = (conversationId as string) || '';
    if (!cid) return;
    Alert.alert(
      'Delete Conversation',
      'This will permanently delete all messages and invoices for this conversation. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              // Delete invoices tied to this conversation
              await supabase.from('invoices').delete().eq('conversation_id', cid);
              // Delete messages
              await supabase.from('messages').delete().eq('conversation_id', cid);
              // Optionally delete the conversation row itself
              await supabase.from('conversations').delete().eq('id', cid);
              // Navigate back to list
              router.replace('/buddyrunner/messages_list');
            } catch (e) {
              console.warn('Failed to delete conversation:', e);
            }
          }
        }
      ]
    );
  };

  // Camera function is now handled by useFileUploadRunner hook

  // Function to handle invoice creation
  const handleCreateInvoice = async () => {
    // SECURITY: Validate that runner is still assigned to this commission
    try {
      const finalCommissionId = resolvedCommissionId || commissionId;
      if (!finalCommissionId) {
        Alert.alert('Error', 'Commission not found.');
        return;
      }
      const { data: commission, error: commissionError } = await supabase
        .from('commission')
        .select('runner_id, status')
        .eq('id', parseInt(finalCommissionId as string))
        .single();

      if (commissionError || !commission) {
        Alert.alert('Error', 'Commission not found.');
        return;
      }

      if (commission.runner_id !== user?.id) {
        Alert.alert(
          'Access Denied', 
          'You are no longer assigned to this commission. You cannot send invoices.',
          [{ text: 'OK', onPress: () => router.replace('/buddyrunner/home') }]
        );
        return;
      }

      if (commission.status !== 'in_progress') {
        Alert.alert(
          'Commission Not Active', 
          'This commission is no longer active. You cannot send invoices.',
          [{ text: 'OK', onPress: () => router.replace('/buddyrunner/home') }]
        );
        return;
      }
    } catch (e) {
      console.warn('Failed to validate commission access:', e);
      Alert.alert('Error', 'Failed to validate commission access.');
      return;
    }

    if (invoiceExists) {
      Alert.alert(
        'Invoice Already Sent',
        'You have already sent an invoice for this commission. You can edit or delete the existing invoice, but cannot send a new one.',
        [{ text: 'OK' }]
      );
      return;
    }
    setShowInvoiceForm(true);
  };

  // Function to handle invoice form submission
  const handleInvoiceSubmit = () => {
    handleInvoiceUpdate();
  };

  // Function to handle invoice form cancellation
  const handleInvoiceCancel = () => {
    setShowInvoiceForm(false);
    setEditingInvoice(null);
    setInvoiceData({ amount: '', currency: 'PHP', description: '' });
  };

  // Function to handle date picker
  const handleDatePicker = () => {
    setShowDatePicker(true);
  };

  // Function to select date
  const selectDate = (year: number, month: number, day: number) => {
    const selectedDate = new Date(year, month - 1, day);
    const formattedDate = selectedDate.toISOString().split('T')[0]; // YYYY-MM-DD format
    setInvoiceData(prev => ({ ...prev, dueDate: formattedDate }));
    setShowDatePicker(false);
  };

  // Function to generate date options
  const generateDateOptions = () => {
    const today = new Date();
    const options = [];

    // Generate dates for the next 90 days
    for (let i = 0; i < 90; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() + i);

      const year = date.getFullYear();
      const month = date.getMonth() + 1;
      const day = date.getDate();

      options.push({
        year,
        month,
        day,
        formatted: `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`,
        display: date.toLocaleDateString('en-US', {
          weekday: 'short',
          year: 'numeric',
          month: 'short',
          day: 'numeric'
        })
      });
    }

    return options;
  };

  // Function to check if invoice already exists for this commission
  const checkInvoiceExists = async () => {
    const finalCommissionId = resolvedCommissionId || commissionId;
    if (!finalCommissionId) return false;
    
    try {
      const { data, error } = await supabase
        .from('invoices')
        .select('id')
        .eq('commission_id', parseInt(finalCommissionId as string))
        .single();
      
      if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
        console.warn('Error checking invoice existence:', error);
        return false;
      }
      
      return !!data;
    } catch (e) {
      console.warn('Failed to check invoice existence:', e);
      return false;
    }
  };

  // Use chat messages hook for runner (must be after all dependencies are declared)
  const {
    messages,
    setMessages,
    currentUserProfile,
    setCurrentUserProfile,
    contactProfile,
    setContactProfile,
    mapDbToChat,
  } = useChatMessagesRunner({
    conversationId,
    user,
    otherUserId,
    commissionId,
    scrollToBottom,
    router,
    contactProfile: null, // Will be set by hook
    setInvoiceExists,
    checkInvoiceExists,
    showInvoiceAcceptedModal,
    setInvoiceAcceptedOpen,
  });

  // Reset initial scroll flags when conversation changes
  useEffect(() => {
    hasInitialWebScrollRef.current = false;
    hasInitialMobileScrollRef.current = false;
  }, [conversationId]);

  // One-time scroll to bottom on mobile when messages first load (0 → >0 transition)
  useEffect(() => {
    if (
      Platform.OS !== 'web' &&
      messages.length > 0 &&
      !hasInitialMobileScrollRef.current
    ) {
    requestAnimationFrame(() => {
        scrollViewRef.current?.scrollToEnd({ animated: false });
        hasInitialMobileScrollRef.current = true;
      });
    }
  }, [messages.length]);

  // One-time scroll to bottom on web when messages first load (0 → >0 transition)
  // Scrolls the actual DOM scroll container (parent div with overflowY: auto)
  useEffect(() => {
    if (
      Platform.OS === 'web' &&
      messages.length > 0 &&
      !hasInitialWebScrollRef.current
    ) {
      // Find the actual scroll container (parent div with overflowY: auto)
      // This is the container from messages_hub.web.tsx that wraps ChatScreenRunner
      const findScrollContainer = (): HTMLElement | null => {
        // Find the largest scrollable container - this is likely the chat container
        // The chat container from messages_hub.web.tsx has overflowY: auto and is the main scroll area
        const allDivs = Array.from(document.querySelectorAll('div'));
        let largestScrollable: HTMLElement | null = null;
        let maxScrollHeight = 0;

        for (const div of allDivs) {
          const style = window.getComputedStyle(div);
          if (
            (style.overflowY === 'auto' || style.overflowY === 'scroll') &&
            div.scrollHeight > div.clientHeight &&
            div.scrollHeight > maxScrollHeight
          ) {
            // Prefer containers that are likely the chat area (have substantial scrollable content)
            if (div.scrollHeight > 500) {
              maxScrollHeight = div.scrollHeight;
              largestScrollable = div;
            }
          }
        }

        return largestScrollable;
      };

      // Use requestAnimationFrame to ensure DOM is ready and messages are rendered
      requestAnimationFrame(() => {
        const scrollContainer = findScrollContainer();
        if (scrollContainer) {
          scrollContainer.scrollTop = scrollContainer.scrollHeight;
          hasInitialWebScrollRef.current = true;
        }
      });
    }
  }, [messages.length]);

  // Use invoice actions hook for runner
  const {
    handleEditInvoice,
    handleDeleteInvoice,
    handleDeleteInvoiceImmediateWeb,
    handleInvoiceUpdate,
  } = useInvoiceActionsRunner({
    messages,
    setMessages,
    conversationId,
    user,
    router,
    otherUserId,
    commissionId,
    resolvedCommissionId,
    invoiceData,
    setInvoiceData,
    editingInvoice,
    setEditingInvoice,
    setShowInvoiceForm,
    setInvoiceExists,
    checkInvoiceExists,
  });

  // Invoice actions are now handled by useInvoiceActionsRunner hook

  // Use file upload hook for runner
  const {
    handleSendMessage,
    handlePickImage,
    handlePickDocument,
    handleAttachment,
    handleCamera,
  } = useFileUploadRunner({
    conversationId,
    user,
    currentMessage,
    setCurrentMessage,
    otherUserId,
    setMessages,
    scrollToBottom,
  });

  // File upload functions are now handled by useFileUploadRunner hook

  // Use file download hook for runner
  const {
    handleDownloadFile,
    downloadToGallery,
    shareFile,
  } = useFileDownloadRunner();

  // File download functions are now handled by useFileDownloadRunner hook

  // Note: Removed auto-scroll on messages change and focus to allow free scrolling
  // Auto-scroll now only happens on initial load (in useChatMessagesRunner hook)
  // and when user sends a message (in useFileUploadRunner hook)

  // Helper function to get user initials from name
  const getUserInitials = (name: string) => {
    if (!name) return 'U';
    const words = name.trim().split(' ');
    if (words.length >= 2) {
      return (words[0][0] + words[words.length - 1][0]).toUpperCase();
    }
    return name[0].toUpperCase();
  };

  // Helper function to get user initials from profile data
  const getUserInitialsFromProfile = (profile: any) => {
    if (!profile) return 'U';
    const firstName = profile.first_name || '';
    const lastName = profile.last_name || '';
    const fullName = `${firstName} ${lastName}`.trim();
    return getUserInitials(fullName || profile.email || 'User');
  };

  // Function to navigate to contact's profile
  const handleNavigateToProfile = () => {
    console.log('=== CHATSCREENRUNNER NAVIGATION DEBUG ===');
    console.log('otherUserId:', otherUserId);
    console.log('contactProfile:', contactProfile);
    console.log('contact.name:', contact.name);
    console.log('conversationId:', conversationId);
    console.log('Navigating to profile with params:', {
      userId: otherUserId,
      userName: contactProfile ? `${contactProfile.first_name} ${contactProfile.last_name}` : contact.name,
      isViewingOtherUser: 'true',
      returnTo: 'ChatScreenRunner',
      conversationId: conversationId,
    });

    // Navigate to the contact's profile screen (caller's profile when runner is viewing)
    router.push({
      pathname: '/buddyrunner/profile',
      params: {
        userId: otherUserId, // The other user's ID (caller)
        userName: contactProfile ? `${contactProfile.first_name} ${contactProfile.last_name}` : contact.name,
        isViewingOtherUser: 'true', // Flag to indicate we're viewing someone else's profile
        returnTo: 'ChatScreenRunner', // Flag to indicate where to return
        conversationId: conversationId,
      }
    });
  };

  // Helper function to get file type label
  const getFileTypeLabel = (fileName: string) => {
    const extension = fileName.split('.').pop()?.toLowerCase();
    switch (extension) {
      case 'pdf':
        return 'PDF DOCUMENT';
      case 'doc':
      case 'docx':
        return 'WORD DOCUMENT';
      case 'xls':
      case 'xlsx':
        return 'EXCEL DOCUMENT';
      case 'txt':
        return 'TEXT DOCUMENT';
      case 'jpg':
      case 'jpeg':
      case 'png':
      case 'gif':
        return 'IMAGE FILE';
      default:
        return 'DOCUMENT';
    }
  };

  // Helper function to format file size in KB
  const getFileSize = (fileSizeBytes: number) => {
    // Check for invalid values: null, undefined, NaN, or 0
    if (!fileSizeBytes || fileSizeBytes === 0 || isNaN(fileSizeBytes) || !isFinite(fileSizeBytes)) {
      return 'Unknown Size';
    }

    // Convert bytes to KB
    const sizeInKB = fileSizeBytes / 1024;

    // Format to 1 decimal place
    return `${sizeInKB.toFixed(1)} KB`;
  };

  // File download functions are now handled by useFileDownloadRunner hook


  // Find commission_id from conversation context
  useEffect(() => {
    if (user && otherUserId) {
      findCommissionIdFromConversation();
    }
  }, [user, otherUserId]);

  // Re-validate and refresh invoice existence on screen focus (when navigating away and back)
  useFocusEffect(
    React.useCallback(() => {
      (async () => {
        try {
          if (!resolvedCommissionId && user && otherUserId) {
            await findCommissionIdFromConversation();
          }
          const exists = await checkInvoiceExists();
          setInvoiceExists(exists);
        } catch (e) {
          // no-op
        }
      })();
      return () => {};
    }, [conversationId, resolvedCommissionId, user?.id, otherUserId])
  );

  // SECURITY: Monitor commission access in real-time
  useEffect(() => {
    const resolvedId = resolvedCommissionId || commissionId;
    if (!resolvedId || !user?.id) return;

    const channel = supabase
      .channel(`commission_access_${resolvedId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'commission',
        filter: `id=eq.${resolvedId}`
      }, (payload) => {
        const commission = payload.new;
        if (commission.runner_id !== user.id) {
          // Runner no longer has access
          Alert.alert(
            'Commission Released', 
            'You are no longer assigned to this commission. Returning to home.',
            [{ text: 'OK', onPress: () => router.replace('/buddyrunner/home') }]
          );
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [resolvedCommissionId, commissionId, user?.id, router]);

  // Main component render - returns the complete UI
  return (
    <SafeAreaView style={styles.container}>
      {/* Header Section */}
      <RunnerChatHeader
        styles={styles}
        contactProfile={contactProfile}
        contact={contact}
        onBack={handleGoBack}
        onNavigateToProfile={handleNavigateToProfile}
        onOpenSettings={() => setShowSettingsModal(true)}
        getUserInitialsFromProfile={getUserInitialsFromProfile}
      />

      {/* Messages Area */}
      <View style={styles.messagesContainer}>
        {/* Date Filter Indicator */}
        <RunnerDateFilterIndicator
          styles={styles}
          isDateFiltered={isDateFiltered}
          selectedDate={selectedDate}
          formatDateForDisplay={formatDateForDisplay}
          onClearFilter={clearDateFilter}
        />

        {Platform.OS === 'web' ? (
        <FlatList
            ref={scrollViewRef as any}
          data={isDateFiltered ? filteredMessages : messages}
            renderItem={({ item: message }) => (
            <RunnerMessageBubble
                key={message.id}
              styles={styles}
                message={message}
              contactProfile={contactProfile}
              getUserInitialsFromProfile={getUserInitialsFromProfile}
              getFileTypeLabel={getFileTypeLabel}
              getFileSize={getFileSize}
              onImagePress={setSelectedImage}
              onFileDownload={handleDownloadFile}
              onInvoiceEdit={handleEditInvoice}
              onInvoiceDelete={(messageId) => {
                  handleDeleteInvoiceImmediateWeb(messageId);
              }}
            />
          )}
            keyExtractor={(item) => item.id}
          ListEmptyComponent={
            <RunnerEmptyState
              styles={styles}
              isDateFiltered={isDateFiltered}
              onClearFilter={clearDateFilter}
            />
          }
            initialScrollIndex={
              (() => {
                const data = isDateFiltered ? filteredMessages : messages;
                return data.length > 0 ? data.length - 1 : 0;
              })()
            }
            getItemLayout={(_, index) => ({
              length: 80, // Estimated height per message including margins
              offset: 80 * index,
              index,
            })}
          style={styles.messagesScrollView}
          contentContainerStyle={styles.messagesContent}
            keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          />
        ) : (
          <ScrollView
            ref={scrollViewRef}
            style={styles.messagesScrollView}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.messagesContent}
          keyboardShouldPersistTaps="handled"
          >
            {(() => {
              const messagesToShow = isDateFiltered ? filteredMessages : messages;
              const hasMessages = messagesToShow.length > 0;
              
              console.log('Rendering messages:', {
                isDateFiltered,
                messagesLength: messages.length,
                filteredMessagesLength: filteredMessages.length,
                messagesToShowLength: messagesToShow.length,
                hasMessages
              });

              if (!hasMessages) {
                return (
                  <RunnerEmptyState
                    styles={styles}
                    isDateFiltered={isDateFiltered}
                    onClearFilter={clearDateFilter}
                  />
                );
              }

              return messagesToShow.map((message) => (
                <RunnerMessageBubble
                  key={message.id}
                  styles={styles}
                  message={message}
                  contactProfile={contactProfile}
                  getUserInitialsFromProfile={getUserInitialsFromProfile}
                  getFileTypeLabel={getFileTypeLabel}
                  getFileSize={getFileSize}
                  onImagePress={setSelectedImage}
                  onFileDownload={handleDownloadFile}
                  onInvoiceEdit={handleEditInvoice}
                  onInvoiceDelete={(messageId) => {
                    handleDeleteInvoice(messageId);
                  }}
                />
              ));
            })()}
          </ScrollView>
        )}
      </View>

      {/* Invoice Form Modal */}
      <RunnerInvoiceFormModal
        styles={styles}
        visible={showInvoiceForm}
        editingInvoice={editingInvoice}
        invoiceData={invoiceData}
        onAmountChange={(text) => {
                        if (Platform.OS === 'web') {
                          // allow digits and one decimal point
                          let cleaned = text.replace(/[^0-9.]/g, '');
                          const firstDot = cleaned.indexOf('.');
                          if (firstDot !== -1) {
                            cleaned = cleaned.substring(0, firstDot + 1) + cleaned.substring(firstDot + 1).replace(/\./g, '');
                          }
                          setInvoiceData(prev => ({ ...prev, amount: cleaned }));
                        } else {
                          setInvoiceData(prev => ({ ...prev, amount: text }));
                        }
                      }}
        onDescriptionChange={(text) => setInvoiceData(prev => ({ ...prev, description: text }))}
        onCancel={handleInvoiceCancel}
        onSubmit={handleInvoiceSubmit}
      />

      {/* Date Picker Modal */}
      <RunnerDatePickerModal
        styles={styles}
        visible={showDatePicker}
        dateOptions={generateDateOptions()}
        onClose={() => setShowDatePicker(false)}
        onSelectDate={selectDate}
      />

      {/* Input Bar - Always visible at bottom */}
      <RunnerChatInputBar
        styles={styles}
        currentMessage={currentMessage}
        invoiceExists={invoiceExists}
            onChangeText={setCurrentMessage}
        onSend={handleSendMessage}
        onAttachment={handleAttachment}
        onAttachmentWeb={handlePickDocument}
        onCamera={Platform.OS !== 'web' ? handleCamera : undefined}
        onCreateInvoice={handleCreateInvoice}
      />

      {/* Image Viewer Modal */}
      <RunnerImageViewerModal
        styles={styles}
        imageUri={selectedImage}
        onClose={() => setSelectedImage(null)}
        onDownload={handleDownloadFile}
      />

      {/* Options menu removed per request */}
      {false && moreOpen && (
        <View style={styles.moreMenuBackdrop}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setMoreOpen(false)} />
          <View style={[styles.moreMenu, { position: 'absolute', top: menuPos.y, left: menuPos.x }]}>
            <TouchableOpacity style={styles.moreMenuItem} onPress={() => { setMoreOpen(false); handleDeleteConversation(); }} {...(Platform.OS === 'web' ? { onClick: () => { setMoreOpen(false); handleDeleteConversation(); } } as any : {})}>
              <Ionicons name="trash" size={18} color="#8B2323" />
              <Text style={styles.moreMenuText}>Delete Conversation</Text>
            </TouchableOpacity>
            <View style={styles.moreMenuDivider} />
            <TouchableOpacity style={styles.moreMenuItem} onPress={() => setMoreOpen(false)} {...(Platform.OS === 'web' ? { onClick: () => setMoreOpen(false) } as any : {})}>
              <Ionicons name="close" size={18} color="#8B2323" />
              <Text style={styles.moreMenuText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Invoice Accepted Modal */}
      <RunnerInvoiceAcceptedModal
        visible={invoiceAcceptedOpen}
        callerName={acceptedCallerName}
        onOk={() => { setInvoiceAcceptedOpen(false); acceptedOnOk(); }}
      />

      {/* Commission Settings Modal */}
      {Platform.OS === 'web' ? (
        <CommissionSettingsModalWeb
          visible={showSettingsModal}
          onClose={() => setShowSettingsModal(false)}
          conversationId={String(conversationId || '')}
          commissionId={Array.isArray(commissionId) ? commissionId[0] : commissionId}
          userRole="BuddyRunner"
          onCommissionReleased={() => {
            setShowSettingsModal(false);
            // Navigate back to home or messages list
            router.push('/buddyrunner/home');
          }}
          onDateFiltered={handleDateFiltered}
        />
      ) : (
        <CommissionSettingsModal
          visible={showSettingsModal}
          onClose={() => setShowSettingsModal(false)}
          conversationId={String(conversationId || '')}
          commissionId={Array.isArray(commissionId) ? commissionId[0] : commissionId}
          userRole="BuddyRunner"
          onCommissionReleased={() => {
            setShowSettingsModal(false);
            // Navigate back to home or messages list
            router.push('/buddyrunner/home');
          }}
          onDateFiltered={handleDateFiltered}
        />
      )}
    </SafeAreaView>
  );
};

// Styles for Invoice Accepted Modal (copied from Accepted Successfully modal)
const invoiceAcceptedStyles = StyleSheet.create({
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
    backgroundColor: "#f5f5f5",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  title: { 
    color: "#333", 
    fontSize: 16, 
    fontWeight: "900", 
    marginBottom: 4, 
    textAlign: "center" 
  },
  msg: { 
    color: "#333", 
    fontSize: 13, 
    opacity: 0.9, 
    marginBottom: 14, 
    textAlign: "center" 
  },
  okBtn: { 
    backgroundColor: "#8B2323", 
    paddingVertical: 14, 
    borderRadius: 12, 
    width: "70%", 
    alignItems: "center", 
    justifyContent: "center" 
  },
  okText: { 
    color: "#fff", 
    fontSize: 14, 
    fontWeight: "600" 
  },
});

// StyleSheet object containing all component styles
const styles = StyleSheet.create({
  // Main app container
  container: {
    flex: 1,
    backgroundColor: 'white',
    width: '100%',
  },

  // Header section styling
  header: {
    backgroundColor: 'white',
    paddingTop: rp(4),
    paddingBottom: rp(8),
    paddingHorizontal: rp(16),
    ...(Platform.OS === 'web' && {
      position: 'sticky',
      top: 0,
      zIndex: 1000,
      borderBottomWidth: 1,
      borderBottomColor: '#EEEEEE',
    }),
  },

  // Header content container
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  // Back button styling
  backButton: {
    padding: rp(4),
  },

  // Settings button styling
  settingsButton: {
    padding: rp(4),
  },

  // Contact info container
  contactInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginLeft: rp(12),
  },

  // Contact profile picture
  contactProfilePicture: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#C8C8C8',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: rp(8),
  },

  // Profile initials text
  profileInitials: {
    color: 'white',
    fontSize: rf(11),
    fontWeight: '600',
  },

  // Profile image
  profileImage: {
    width: '100%',
    height: '100%',
    borderRadius: 20,
  },

  // Contact name container
  contactNameContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: rp(6),
  },

  // Contact name text
  contactName: {
    color: '#8B2323',
    fontSize: Platform.OS === 'web' ? 16 : rf(18),
    fontWeight: '600',
    marginRight: rp(8),
    flexShrink: 1,
  },

  // Role tag
  roleTag: {
    backgroundColor: '#8B2323',
    paddingHorizontal: rp(8),
    paddingVertical: rp(2),
    borderRadius: rp(12),
  },

  // Role tag text
  roleTagText: {
    color: '#fff',
    fontSize: Platform.OS === 'web' ? 10 : rf(10),
    fontWeight: '600',
  },

  // Call button styling
  callButton: {
    padding: rp(4),
  },

  // Header divider line
  headerDivider: {
    height: 1,
    backgroundColor: '#EEEEEE',
    marginTop: rp(8),
    ...(Platform.OS === 'web' && {
      // Hide divider on web since sticky header has border
      height: 0,
      marginTop: 0,
    }),
  },

  // Messages container
  messagesContainer: {
    flex: 1,
    backgroundColor: 'white',
  },

  // Date filter indicator
  dateFilterIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF5F5',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#EDE9E8',
  },

  dateFilterText: {
    flex: 1,
    fontSize: Platform.OS === 'web' ? 13 : rf(12),
    color: '#8B2323',
    marginLeft: 8,
    fontWeight: '500',
  },

  dateFilterClearButton: {
    padding: 4,
    borderRadius: 12,
    backgroundColor: 'rgba(139, 35, 35, 0.1)',
  },

  // Messages scroll view
  messagesScrollView: {
    flex: 1,
  },

  // Messages content container
  messagesContent: {
    paddingVertical: 16,
    paddingHorizontal: 16,
    flexGrow: 1,
  },
  // System message (centered, outside bubbles)
  systemMessageContainer: {
    width: '100%',
    alignItems: 'center',
    marginVertical: 8,
  },
  systemMessageText: {
    color: '#666',
    fontSize: Platform.OS === 'web' ? 13 : 12,
  },

  // Empty state container
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },

  // Empty state text
  emptyStateText: {
    fontSize: 18,
    color: '#666',
    fontWeight: '500',
    marginBottom: 8,
  },

  // Empty state subtext
  emptyStateSubtext: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
  },

  // Clear filter action button
  clearFilterActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#8B2323',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    marginTop: 8,
  },

  clearFilterActionButtonText: {
    color: 'white',
    fontSize: rf(14),
    fontWeight: '600',
    marginLeft: 8,
  },

  // Individual message container
  messageContainer: {
    flexDirection: 'row',
    marginBottom: 12,
    alignItems: 'flex-end',
  },

  // Message container for invoice messages
  messageContainerInvoice: {
    flexDirection: 'column',
    alignItems: 'stretch',
  },

  // Contact profile container for incoming messages
  contactProfileContainer: {
    marginRight: 8,
    marginBottom: 2,
  },

  // Message bubble base styling
  messageBubble: {
    maxWidth: '75%',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 18,
    marginBottom: 2,
  },

  // Incoming message bubble (from contact)
  incomingMessage: {
    backgroundColor: '#F0F0F0', // Light gray background
    borderBottomLeftRadius: 4, // Less rounded on bottom left
  },

  // Outgoing message bubble (from user) maapil diay ang bubble
  outgoingMessage: {
    backgroundColor: '#8B2323', // Red background
    borderBottomRightRadius: 4, // Less rounded on bottom right
    marginLeft: 'auto', // Push to right side
  },

  // Message text styling
  messageText: {
    fontSize: Platform.OS === 'web' ? 13 : 14,
    lineHeight: Platform.OS === 'web' ? 17 : 18,
  },

  // Incoming message text
  incomingMessageText: {
    color: '#333',
  },

  // Outgoing message text
  outgoingMessageText: {
    color: 'white',
  },

  // Typing indicator container
  typingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
  },

  // Typing indicator dots
  typingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#999',
    marginHorizontal: 2,
  },

  // Input bar container
  inputBar: {
    backgroundColor: '#8B2323', // Dark red background
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: Platform.OS === 'web' ? 24 : rp(12),
    paddingVertical: Platform.OS === 'web' ? 10 : rp(8),
    paddingBottom: Platform.OS === 'web' ? 10 : rp(16),
    minHeight: Platform.OS === 'web' ? 42 : 56, // Slightly higher fixed height
    marginBottom: Platform.OS === 'web' ? 12 : 0, // Add space below the red container
  },

  // Input icon buttons
  inputIcon: {
    padding: Platform.OS === 'web' ? 6 : rp(8),
    marginRight: Platform.OS === 'web' ? 2 : rp(4),
  },

  // Disabled input icon styles
  inputIconDisabled: {
    backgroundColor: '#E0E0E0',
    opacity: 0.6,
  },

  // Message input field
  messageInput: {
    flex: 1,
    backgroundColor: 'white',
    borderRadius: Platform.OS === 'web' ? 16 : rb(20),
    paddingHorizontal: Platform.OS === 'web' ? 12 : rp(16),
    paddingVertical: Platform.OS === 'web' ? 4 : rp(10),
    marginHorizontal: Platform.OS === 'web' ? 16 : rp(8),
    maxHeight: Platform.OS === 'web' ? 80 : 100,
    fontSize: Platform.OS === 'web' ? 12 : rf(14),
    color: '#333',
  },

  // Send button
  sendButton: {
    padding: Platform.OS === 'web' ? 6 : rp(8),
    marginLeft: Platform.OS === 'web' ? 2 : rp(4),
  },

  // Attachment container
  attachmentContainer: {
    marginBottom: 8,
  },

  // Image attachment styling
  attachmentImage: {
    width: 200,
    height: 150,
    borderRadius: 8,
    marginBottom: 4,
  },

  // File attachment styling
  fileAttachment: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    maxWidth: 180,
    minWidth: 160,
  },

  fileIconContainer: {
    width: 45,
    height: 45,
    borderRadius: 22.5,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },

  fileInfo: {
    flex: 1,
    justifyContent: 'center',
  },

  fileTypeContainer: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    marginTop: 4,
  },

  // File name text
  fileName: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 4,
    flex: 1,
    flexWrap: 'wrap',
  },

  fileType: {
    fontSize: 10,
    fontWeight: '600',
    marginBottom: 3,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    opacity: 0.8,
  },

  fileSize: {
    fontSize: 10,
    opacity: 0.7,
  },

  // Timestamp styles
  timestampInsideContainer: {
    alignSelf: 'flex-end',
    marginTop: 4,
  },

  timestampText: {
    fontSize: Platform.OS === 'web' ? 9 : 10,
    opacity: 0.7,
  },

  // Invoice wrapper for alignment
  invoiceWrapper: {
    marginBottom: 8,
  },

  // Invoice wrapper for outgoing messages (right side)
  invoiceWrapperOutgoing: {
    alignSelf: 'flex-end',
  },

  // Invoice wrapper for incoming messages (left side)
  invoiceWrapperIncoming: {
    alignSelf: 'flex-start',
  },

  // Invoice container katong puti lang na container
  invoiceContainer: {
    backgroundColor: 'white',
    borderRadius: Platform.OS === 'web' ? 10 : 12,
    padding: Platform.OS === 'web' ? 8 : 8,
    maxWidth: Platform.OS === 'web' ? 220 : 200,
    borderWidth: 2,
    borderColor: '#8B2323',
  },

  // Invoice header
  invoiceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Platform.OS === 'web' ? 5 : 6,
  },

  // Invoice title
  invoiceTitle: {
    fontSize: Platform.OS === 'web' ? 13 : 14,
    fontWeight: '600',
    marginLeft: 6,
    color: '#8B2323',
  },

  // Invoice content
  invoiceContent: {
    gap: Platform.OS === 'web' ? 4 : 4,
  },

  // Invoice description
  invoiceDescription: {
    fontSize: Platform.OS === 'web' ? 12 : 12,
    marginBottom: 4,
    color: '#333',
  },

  // Invoice amount row
  invoiceAmountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },

  // Invoice amount
  invoiceAmount: {
    fontSize: Platform.OS === 'web' ? 13 : 14,
    fontWeight: '700',
    color: '#8B2323',
  },

  // Invoice date row
  invoiceDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
    marginTop: 2,
  },

  // Invoice date text
  invoiceDateText: {
    fontSize: Platform.OS === 'web' ? 10 : 11,
    color: '#666',
    marginLeft: 4,
    fontStyle: 'italic',
  },

  // Invoice status row
  invoiceStatusRow: {
    marginTop: 4,
    alignItems: 'center',
  },

  // Invoice status text
  invoiceStatusText: {
    fontSize: Platform.OS === 'web' ? 12 : 12,
    fontWeight: '600',
  },

  // Invoice due date
  invoiceDueDate: {
    fontSize: Platform.OS === 'web' ? 12 : 12,
    opacity: 0.8,
    color: '#666',
  },

  // Invoice actions
  invoiceActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: Platform.OS === 'web' ? 10 : 12,
    paddingTop: Platform.OS === 'web' ? 10 : 12,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    gap: 8,
    width: '100%',
  },

  // Edit button
  invoiceActionButton: {
    flex: 1,
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#8B2323',
    borderRadius: 6,
    paddingVertical: Platform.OS === 'web' ? 7 : 8,
    paddingHorizontal: Platform.OS === 'web' ? 10 : 6,
    alignItems: 'center',
    minHeight: Platform.OS === 'web' ? 30 : 36,
    justifyContent: 'center',
    marginRight: 4,
  },

  // Delete button
  invoiceDeleteButton: {
    flex: 1,
    backgroundColor: '#8B2323',
    borderRadius: 6,
    paddingVertical: Platform.OS === 'web' ? 7 : 8,
    paddingHorizontal: Platform.OS === 'web' ? 10 : 6,
    alignItems: 'center',
    minHeight: Platform.OS === 'web' ? 30 : 36,
    justifyContent: 'center',
    marginLeft: 4,
  },

  // Edit button text
  invoiceActionText: {
    color: '#8B2323',
    fontSize: Platform.OS === 'web' ? 12 : 12,
    fontWeight: '600',
    textAlign: 'center',
  },

  // Delete button text
  invoiceDeleteText: {
    color: 'white',
    fontSize: Platform.OS === 'web' ? 12 : 12,
    fontWeight: '600',
    textAlign: 'center',
  },

  // View Details button (for accepted invoices)
  viewDetailsButton: {
    width: '100%',
    backgroundColor: '#E0E0E0',
    borderRadius: 8,
    paddingVertical: Platform.OS === 'web' ? 7 : 8,
    paddingHorizontal: Platform.OS === 'web' ? 14 : 12,
    minHeight: Platform.OS === 'web' ? 30 : 36,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',

  },

  // View Details button text
  viewDetailsButtonText: {
    color: '#8B2323',
    fontSize: Platform.OS === 'web' ? 12 : 12,
    fontWeight: '600',
    textAlign: 'center',
    marginLeft: 6,
  },

  // Invoice modal
  invoiceModal: {
    position: Platform.OS === 'web' ? 'fixed' as any : 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },

  // Invoice modal background
  invoiceModalBackground: {
    position: Platform.OS === 'web' ? 'fixed' as any : 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Invoice form
  invoiceForm: {
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 20,
    width: '90%',
    maxWidth: 400,
  },

  // Invoice form header
  invoiceFormHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },

  // Invoice form title
  invoiceFormTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#8B2323',
  },

  // Invoice form content
  invoiceFormContent: {
    marginBottom: 20,
  },

  // Invoice form field
  invoiceFormField: {
    marginBottom: 16,
  },

  // Invoice form label
  invoiceFormLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
    marginBottom: 8,
  },

  // Invoice form input
  invoiceFormInput: {
    borderWidth: 1,
    borderColor: '#8B2323',
    borderRadius: 4,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },

  // Amount input container
  amountInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#8B2323',
    borderRadius: 4,
    backgroundColor: 'white',
  },

  // Currency symbol
  currencySymbol: {
    fontSize: 16,
    fontWeight: '600',
    color: '#8B2323',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRightWidth: 1,
    borderRightColor: '#8B2323',
  },

  // Amount input
  amountInput: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: '#333',
  },

  // Invoice form text area
  invoiceFormTextArea: {
    height: 80,
    textAlignVertical: 'top',
  },

  // Invoice breakdown container
  invoiceBreakdownContainer: {
    backgroundColor: '#F8F9FA',
    borderRadius: 8,
    padding: Platform.OS === 'web' ? 12 : 10,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#E9ECEF',
  },

  // Invoice breakdown row
  invoiceBreakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Platform.OS === 'web' ? 6 : 4,
  },

  // Invoice breakdown label
  invoiceBreakdownLabel: {
    fontSize: Platform.OS === 'web' ? 13 : 12,
    color: '#6C757D',
    fontWeight: '500',
  },

  // Invoice breakdown value
  invoiceBreakdownValue: {
    fontSize: Platform.OS === 'web' ? 13 : 12,
    color: '#495057',
    fontWeight: '600',
  },

  // Invoice total row
  invoiceTotalRow: {
    borderTopWidth: 1,
    borderTopColor: '#DEE2E6',
    paddingTop: Platform.OS === 'web' ? 8 : 6,
    marginTop: Platform.OS === 'web' ? 4 : 2,
    marginBottom: 0,
  },

  // Invoice total label
  invoiceTotalLabel: {
    fontSize: Platform.OS === 'web' ? 14 : 13,
    color: '#212529',
    fontWeight: '700',
  },

  // Invoice total value
  invoiceTotalValue: {
    fontSize: Platform.OS === 'web' ? 14 : 13,
    color: '#8B2323',
    fontWeight: '700',
  },

  // Invoice form buttons
  invoiceFormButtons: {
    flexDirection: 'row',
    gap: 12,
  },

  // Invoice form cancel button
  invoiceFormCancelButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#8B2323',
    alignItems: 'center',
  },

  // Invoice form cancel text
  invoiceFormCancelText: {
    color: '#8B2323',
    fontSize: 16,
    fontWeight: '600',
  },

  // Invoice form submit button
  invoiceFormSubmitButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 4,
    backgroundColor: '#8B2323',
    alignItems: 'center',
  },

  // Invoice form submit text
  invoiceFormSubmitText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },

  // Date picker button
  datePickerButton: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#8B2323',
    borderRadius: 4,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: 'white',
  },

  // Date picker text
  datePickerText: {
    fontSize: 16,
    color: '#333',
  },

  // Date picker text selected
  datePickerTextSelected: {
    color: '#333',
  },

  // Date picker text placeholder
  datePickerTextPlaceholder: {
    color: '#999',
  },

  // Date picker modal
  datePickerModal: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1001,
  },

  // Date picker container
  datePickerContainer: {
    backgroundColor: 'white',
    borderRadius: 12,
    width: '90%',
    maxHeight: '70%',
    padding: 20,
  },

  // Date picker header
  datePickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },

  // Date picker title
  datePickerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#8B2323',
  },

  // Date picker list
  datePickerList: {
    maxHeight: 300,
  },

  // Date option
  dateOption: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },

  // Date option text
  dateOptionText: {
    fontSize: 14,
    color: '#333',
  },

  // Image viewer modal styles
  imageViewerModal: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 2000,
  },

  imageViewerBackground: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  imageViewerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
    padding: 20,
  },

  imageViewerCloseButton: {
    position: 'absolute',
    top: 50,
    right: 20,
    zIndex: 2001,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderRadius: 20,
    padding: 10,
  },

  fullSizeImage: {
    width: '100%',
    height: '100%',
    maxWidth: '100%',
    maxHeight: '100%',
  },

  // Download button styles
  downloadButton: {
    backgroundColor: '#8B2323',
    borderRadius: 16,
    padding: 8,
    marginLeft: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },

  imageViewerDownloadButton: {
    position: 'absolute',
    top: 50,
    left: 20,
    zIndex: 2001,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderRadius: 20,
    padding: 10,
  },

  moreMenuBackdrop: {
    position: Platform.OS === 'web' ? 'fixed' as any : 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.15)',
    zIndex: 3000,
  },
  moreMenu: {
    backgroundColor: 'white',
    borderRadius: 8,
    paddingVertical: 6,
    width: 210,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  moreMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  moreMenuText: {
    color: '#8B2323',
    fontWeight: '600',
  },
  moreMenuDivider: {
    height: 1,
    backgroundColor: '#EDEDED',
    marginVertical: 4,
  },
});

export default ChatScreen;
