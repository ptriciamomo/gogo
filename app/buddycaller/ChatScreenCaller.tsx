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
  type ViewStyle,
  type TextStyle,
  type ImageStyle,
} from 'react-native';
// Import AsyncStorage for persistent storage
import AsyncStorage from '@react-native-async-storage/async-storage';
// Import icons from Expo vector icons library
import { Ionicons } from '@expo/vector-icons';
// Import Expo document picker for file selection
import * as DocumentPicker from 'expo-document-picker';
// Import Expo image picker for photo selection
import * as ImagePicker from 'expo-image-picker';
// Import SharedMessage type
import { SharedMessage } from '../../components/SharedMessagingService';
// Import task status service
import taskStatusService from '../../components/TaskStatusService';
// Import responsive utilities
import { responsive, rw, rh, rf, rp, rb } from '../../utils/responsive';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as MediaLibrary from 'expo-media-library';
// Import commission settings modal
import CommissionSettingsModal from '../../components/CommissionSettingsModal';
import CommissionSettingsModalWeb from '../../components/CommissionSettingsModal.web';
// Import chat components
import ChatEmptyState from '../../components/chat/ChatEmptyState';
import ChatImageViewerModal from '../../components/chat/ChatImageViewerModal';
import ChatLoadingModal from '../../components/chat/ChatLoadingModal';
import ChatDeclineConfirmModal from '../../components/chat/ChatDeclineConfirmModal';
import { CallerInvoiceDetailsModal } from '../../components/chat/caller/CallerInvoiceDetailsModal';
import ChatHeader from '../../components/chat/ChatHeader';
import ChatInputBar from '../../components/chat/ChatInputBar';
import ChatMessageBubble from '../../components/chat/ChatMessageBubble';
import { useChatMessages } from '../../hooks/chat/useChatMessages';
import { useInvoiceActions } from '../../hooks/chat/useInvoiceActions';
import { useFileUpload } from '../../hooks/chat/useFileUpload';
import { useConversationManagement } from '../../hooks/chat/useConversationManagement';


// TypeScript interface defining the structure of a chat message
interface ChatMessage extends SharedMessage {
  isTyping?: boolean;   // Whether this is a typing indicator
}

// TypeScript interface defining the structure of a user
interface User {
  id: string;
  name: string;
  profilePicture: string;
  isOnline: boolean;
  role: 'runner' | 'caller';
}

// Main ChatScreen component for Callers
type ChatScreenCallerProps = {
  onBack?: () => void;
  onNavigateToRunnerProfile?: () => void;
};

const ChatScreenCaller: React.FC<ChatScreenCallerProps> = ({ onBack, onNavigateToRunnerProfile }) => {
  const router = useRouter();
  // Read params
  const { conversationId, contactName: contactNameParam, otherUserId } = useLocalSearchParams();


  // Mock user data - in real app, this would come from authentication
  const currentUser: User = {
    id: 'caller-1',
    name: 'John Caller',
    profilePicture: 'https://via.placeholder.com/40x40/8B2323/FFFFFF?text=JC',
    isOnline: true,
    role: 'caller',
  };

  // Mock contact data - in real app, this would be the assigned runner
  const contact: User = {
    id: 'runner-1',
    name: (contactNameParam as string) || 'Contact',
    profilePicture: 'https://via.placeholder.com/40x40/8B2323/FFFFFF?text=YJ',
    isOnline: true,
    role: 'runner',
  };

  const [user, setUser] = useState<any>(null);
  const [currentUserProfile, setCurrentUserProfile] = useState<any>(null);
  const [contactProfile, setContactProfile] = useState<any>(null);

  // State hook to manage the current message input
  const [currentMessage, setCurrentMessage] = useState('');

  // State hook to manage image viewer
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  // State hook to store commission data for invoice modal
  const [commissionData, setCommissionData] = useState<{ id: string | number | null; title: string | null }>({
    id: null,
    title: null,
  });

  // State hook to manage invoice details modal
  const [showInvoiceDetailsModal, setShowInvoiceDetailsModal] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<{ amount: number; description: string; status: string; messageId?: string } | null>(null);

  // Ref for scrolling to bottom when new messages arrive and auto-scrolling to filtered messages
  const scrollViewRef = useRef<ScrollView>(null);
  
  // Web-specific ref for direct DOM access
  const webScrollRef = useRef<HTMLDivElement | null>(null);

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

  // Loading modal state for navigation
  const [showLoadingModal, setShowLoadingModal] = useState(false);

  // Custom confirmation modal state for web decline action
  const [showDeclineConfirmModal, setShowDeclineConfirmModal] = useState(false);
  const [declineMessageId, setDeclineMessageId] = useState<string | null>(null);

  // Date filtering state
  const [filteredMessages, setFilteredMessages] = useState<any[]>([]);
  const [isDateFiltered, setIsDateFiltered] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  // Helper function to format date for display
  const formatDateForDisplay = (dateString: string | null) => {
    if (!dateString) return '';
    
    try {
      const date = new Date(dateString);
      const options: Intl.DateTimeFormatOptions = {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      };
      return date.toLocaleDateString('en-US', options);
    } catch (error) {
      if (__DEV__) console.error('Error formatting date:', error);
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
    console.log('=== DATE FILTERED CALLBACK START ===');
    console.log('Date filtered data received:', filteredData);
    console.log('Previous filter state - isDateFiltered:', isDateFiltered);
    console.log('Previous messages count:', messages.length);
    console.log('Previous filtered messages count:', filteredMessages.length);
    
    // Reset any previous filter state
    setIsDateFiltered(false);
    
    // Set new filtered messages and selected date
    setFilteredMessages(filteredData.messages || []);
    setSelectedDate(filteredData.selectedDate || null);
    setIsDateFiltered(true);
    
    console.log('New filter state - isDateFiltered:', true);
    console.log('New filtered messages count:', filteredData.messages?.length || 0);
    console.log('New filtered messages:', filteredData.messages);
    console.log('Selected date:', filteredData.selectedDate);
    console.log('Oldest invoice message ID:', filteredData.oldestInvoiceMessageId);
    
    // Auto-scroll to the oldest invoice message
    if (filteredData.oldestInvoiceMessageId) {
      console.log('Attempting to scroll to oldest invoice message:', filteredData.oldestInvoiceMessageId);
      
      // Make scroll function globally available for web
      if (Platform.OS === 'web') {
        (window as any).scrollToOldestInvoice = () => {
          console.log('Global scroll function called for oldest invoice:', filteredData.oldestInvoiceMessageId);
          scrollToMessage(filteredData.oldestInvoiceMessageId);
        };
        
        // IMMEDIATELY force scroll to top for web
        console.log('IMMEDIATE FORCE SCROLL TO TOP FOR WEB');
        if ((window as any).forceScrollToTop) {
          (window as any).forceScrollToTop();
        }
      }
      
      // Use multiple attempts with increasing delays to ensure messages are rendered
      setTimeout(() => {
        console.log('Scroll attempt 1 (300ms)');
        scrollToMessage(filteredData.oldestInvoiceMessageId);
      }, 300);
      
      setTimeout(() => {
        console.log('Scroll attempt 2 (800ms)');
        scrollToMessage(filteredData.oldestInvoiceMessageId);
      }, 800);
      
      setTimeout(() => {
        console.log('Scroll attempt 3 (1500ms)');
        scrollToMessage(filteredData.oldestInvoiceMessageId);
      }, 1500);
      
      setTimeout(() => {
        console.log('Scroll attempt 4 (2500ms)');
        scrollToMessage(filteredData.oldestInvoiceMessageId);
      }, 2500);
      
      setTimeout(() => {
        console.log('Scroll attempt 5 (4000ms)');
        scrollToMessage(filteredData.oldestInvoiceMessageId);
      }, 4000);
      
    } else {
      console.log('No oldest invoice message ID found');
      if (filteredData.messages && filteredData.messages.length > 0) {
        console.log('Scrolling to top to show filtered results');
        // If we have filtered messages but no specific oldest message, scroll to top
        if (Platform.OS === 'web') {
          // IMMEDIATELY force scroll to top for web
          console.log('IMMEDIATE FORCE SCROLL TO TOP FOR FILTERED RESULTS');
          if ((window as any).forceScrollToTop) {
            (window as any).forceScrollToTop();
          }
          
          // Web-specific scroll to top
          const scrollToTopWeb = () => {
            console.log('Web scroll to top for filtered results...');
            
            // Method 1: Try to find the ScrollView by nativeID
            const scrollViewById = document.getElementById('messages-scroll-view');
            if (scrollViewById) {
              console.log('Found ScrollView by ID, scrolling to top...');
              scrollViewById.scrollTop = 0;
              return true;
            }

            // Method 2: Find by React Native Web ScrollView class
            const scrollViewByClass = document.querySelector('[class*="ScrollView"], [class*="scroll-view"]');
            if (scrollViewByClass) {
              console.log('Found ScrollView by class, scrolling to top...');
              scrollViewByClass.scrollTop = 0;
              return true;
            }

            // Method 3: Find any element with overflow and scrollable content
            const allDivs = Array.from(document.querySelectorAll('div'));
            for (const div of allDivs) {
              const style = window.getComputedStyle(div);
              if (style.overflowY === 'scroll' || style.overflowY === 'auto' ||
                  style.overflow === 'scroll' || style.overflow === 'auto') {
                if (div.scrollHeight > div.clientHeight) {
                  console.log('Found scrollable div, scrolling to top...');
                  div.scrollTop = 0;
                  return true;
                }
              }
            }

            console.log('No scrollable container found for scrolling to top');
            return false;
          };
          
          setTimeout(() => scrollToTopWeb(), 300);
          setTimeout(() => scrollToTopWeb(), 600);
          setTimeout(() => scrollToTopWeb(), 1000);
          setTimeout(() => scrollToTopWeb(), 2000);
        } else {
          // Native mobile scrolling
          setTimeout(() => {
            if (scrollViewRef.current) {
              scrollViewRef.current.scrollTo({
                y: 0,
                animated: true
              });
            }
          }, 300);
          
          setTimeout(() => {
            if (scrollViewRef.current) {
              scrollViewRef.current.scrollTo({
                y: 0,
                animated: true
              });
            }
          }, 1000);
        }
      } else {
        console.log('No messages found for this date');
        // If no messages found, still scroll to top
        if (Platform.OS === 'web') {
          // IMMEDIATELY force scroll to top for web
          console.log('IMMEDIATE FORCE SCROLL TO TOP FOR NO MESSAGES');
          if ((window as any).forceScrollToTop) {
            (window as any).forceScrollToTop();
          }
          
          // Web-specific scroll to top
          const scrollToTopWeb = () => {
            console.log('Web scroll to top for no messages...');
            
            const scrollViewById = document.getElementById('messages-scroll-view');
            if (scrollViewById) {
              scrollViewById.scrollTop = 0;
              return true;
            }
            const scrollViewByClass = document.querySelector('[class*="ScrollView"], [class*="scroll-view"]');
            if (scrollViewByClass) {
              scrollViewByClass.scrollTop = 0;
              return true;
            }
            return false;
          };
          
          setTimeout(() => scrollToTopWeb(), 300);
          setTimeout(() => scrollToTopWeb(), 1000);
        } else {
          // Native mobile scrolling
          setTimeout(() => {
            if (scrollViewRef.current) {
              scrollViewRef.current.scrollTo({
                y: 0,
                animated: true
              });
            }
          }, 300);
        }
      }
    }
    console.log('=== DATE FILTERED CALLBACK END ===');
  };

  // Debug function to log ScrollView state
  const debugScrollViewState = () => {
    if (scrollViewRef.current) {
      console.log('ScrollView Debug Info:');
      console.log('- isDateFiltered:', isDateFiltered);
      console.log('- messages.length:', messages.length);
      console.log('- filteredMessages.length:', filteredMessages.length);
      console.log('- ScrollView ref exists:', !!scrollViewRef.current);
    }
  };

  // Function to scroll to a specific message
  const scrollToMessage = (messageId: string) => {
    debugScrollViewState(); // Debug current state
    
    if (scrollViewRef.current) {
      // Use filteredMessages if date filtering is active, otherwise use messages
      const messagesToSearch = isDateFiltered ? filteredMessages : messages;
      const messageIndex = messagesToSearch.findIndex(msg => msg.id === messageId);
      console.log(`=== SCROLL TO MESSAGE DEBUG ===`);
      console.log(`Looking for message ${messageId} in ${isDateFiltered ? 'filtered' : 'all'} messages, found at index: ${messageIndex}`);
      console.log(`Total messages to search: ${messagesToSearch.length}`);
      console.log(`Message IDs in array:`, messagesToSearch.map(msg => msg.id));
      console.log(`Target message timestamp:`, messagesToSearch[messageIndex]?.timestamp);
      console.log(`=== END SCROLL DEBUG ===`);
      
      if (messageIndex !== -1) {
        // Calculate scroll position based on message index
        // Each message typically takes up around 100-150px including margins
        const baseHeight = 130; // Base height per message
        const scrollPosition = messageIndex * baseHeight;
        
        console.log(`Scrolling to message ${messageId} at position ${scrollPosition}`);
        
        if (Platform.OS === 'web') {
          // Web-specific scrolling implementation
          const scrollToMessageWeb = () => {
            console.log('Web scroll attempt for message:', messageId);
            
            // Method 1: Try to find the actual message element by data attributes or content
            const messageElement = document.querySelector(`[data-message-id="${messageId}"]`) ||
                                 document.querySelector(`[data-testid*="${messageId}"]`) ||
                                 Array.from(document.querySelectorAll('div')).find(div => 
                                   div.textContent && div.textContent.includes(messageId)
                                 );
            
            if (messageElement) {
              console.log('Found message element, scrolling to it...');
              messageElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
              return true;
            }

            // Method 2: Try to find the ScrollView by nativeID
            const scrollViewById = document.getElementById('messages-scroll-view') as HTMLElement | null;
            if (scrollViewById) {
              console.log('Found ScrollView by ID, scrolling to calculated position...');
              scrollViewById.scrollTop = scrollPosition;
              return true;
            }

            // Method 3: Find by React Native Web ScrollView class
            const scrollViewByClass = document.querySelector('[class*="ScrollView"], [class*="scroll-view"]') as HTMLElement | null;
            if (scrollViewByClass) {
              console.log('Found ScrollView by class, scrolling to calculated position...');
              scrollViewByClass.scrollTop = scrollPosition;
              return true;
            }

            // Method 4: Find any element with overflow and scrollable content
            const allDivs = Array.from(document.querySelectorAll('div'));
            for (const div of allDivs) {
              const style = window.getComputedStyle(div);
              if (style.overflowY === 'scroll' || style.overflowY === 'auto' ||
                  style.overflow === 'scroll' || style.overflow === 'auto') {
                if (div.scrollHeight > div.clientHeight) {
                  console.log('Found scrollable div, scrolling to calculated position...');
                  div.scrollTop = scrollPosition;
                  return true;
                }
              }
            }

            // Method 5: Find the largest scrollable container
            let maxScrollHeight = 0;
            let targetElement: HTMLElement | null = null;

            for (const div of allDivs) {
              if (div.scrollHeight > div.clientHeight && div.scrollHeight > maxScrollHeight) {
                maxScrollHeight = div.scrollHeight;
                targetElement = div;
              }
            }

            if (targetElement) {
              console.log('Found largest scrollable container, scrolling to calculated position...');
              targetElement.scrollTop = scrollPosition;
              return true;
            }

            // Method 6: Try to scroll to top as fallback
            console.log('No specific element found, scrolling to top...');
            const scrollContainer = (scrollViewById || scrollViewByClass || targetElement) as HTMLElement | null;
            if (scrollContainer) {
              scrollContainer.scrollTop = 0;
              return true;
            }

            console.log('No scrollable container found for web scrolling');
            return false;
          };

          // Multiple attempts for web scrolling with increasing delays
          setTimeout(() => scrollToMessageWeb(), 100);
          setTimeout(() => scrollToMessageWeb(), 300);
          setTimeout(() => scrollToMessageWeb(), 600);
          setTimeout(() => scrollToMessageWeb(), 1000);
          setTimeout(() => scrollToMessageWeb(), 2000);
          
        } else {
          // Native mobile scrolling
          // Primary scroll attempt
          scrollViewRef.current.scrollTo({
            y: scrollPosition,
            animated: true
          });
          
          // Secondary attempt with slight adjustment to ensure visibility
          setTimeout(() => {
            if (scrollViewRef.current) {
              scrollViewRef.current.scrollTo({
                y: Math.max(0, scrollPosition - 30), // Scroll slightly up to ensure message is visible
                animated: true
              });
            }
          }, 200);
          
          // Third attempt with different position
          setTimeout(() => {
            if (scrollViewRef.current) {
              scrollViewRef.current.scrollTo({
                y: scrollPosition + 20, // Scroll slightly down
                animated: true
              });
            }
          }, 400);
          
          // Final attempt - scroll to top then to message for better accuracy
          setTimeout(() => {
            if (scrollViewRef.current) {
              console.log('Final attempt: scroll to top then to message');
              scrollViewRef.current.scrollTo({ y: 0, animated: false });
              setTimeout(() => {
                if (scrollViewRef.current) {
                  scrollViewRef.current.scrollTo({ y: scrollPosition, animated: true });
                }
              }, 50);
            }
          }, 800);
        }
        
      } else {
        console.log(`Message ${messageId} not found in ${isDateFiltered ? 'filtered' : 'all'} messages array`);
        console.log('Available message IDs:', messagesToSearch.map(msg => msg.id));
        
        // If message not found, try scrolling to show filtered results
        if (isDateFiltered && filteredMessages.length > 0) {
          console.log('Scrolling to show filtered results');
          if (Platform.OS === 'web') {
            // Web-specific scroll to top with multiple methods
            const scrollToTopWeb = () => {
              console.log('Attempting to scroll to top for filtered results...');
              
              // Method 1: Try to find the ScrollView by nativeID
              const scrollViewById = document.getElementById('messages-scroll-view');
              if (scrollViewById) {
                console.log('Found ScrollView by ID, scrolling to top...');
                scrollViewById.scrollTop = 0;
                return true;
              }

              // Method 2: Find by React Native Web ScrollView class
              const scrollViewByClass = document.querySelector('[class*="ScrollView"], [class*="scroll-view"]');
              if (scrollViewByClass) {
                console.log('Found ScrollView by class, scrolling to top...');
                scrollViewByClass.scrollTop = 0;
                return true;
              }

              // Method 3: Find any element with overflow and scrollable content
              const allDivs = Array.from(document.querySelectorAll('div'));
              for (const div of allDivs) {
                const style = window.getComputedStyle(div);
                if (style.overflowY === 'scroll' || style.overflowY === 'auto' ||
                    style.overflow === 'scroll' || style.overflow === 'auto') {
                  if (div.scrollHeight > div.clientHeight) {
                    console.log('Found scrollable div, scrolling to top...');
                    div.scrollTop = 0;
                    return true;
                  }
                }
              }

              // Method 4: Find the largest scrollable container
              let maxScrollHeight = 0;
              let targetElement = null;

              for (const div of allDivs) {
                if (div.scrollHeight > div.clientHeight && div.scrollHeight > maxScrollHeight) {
                  maxScrollHeight = div.scrollHeight;
                  targetElement = div;
                }
              }

              if (targetElement) {
                console.log('Found largest scrollable container, scrolling to top...');
                targetElement.scrollTop = 0;
                return true;
              }

              console.log('No scrollable container found for scrolling to top');
              return false;
            };
            
            setTimeout(() => scrollToTopWeb(), 100);
            setTimeout(() => scrollToTopWeb(), 300);
            setTimeout(() => scrollToTopWeb(), 600);
            setTimeout(() => scrollToTopWeb(), 1000);
          } else {
            scrollViewRef.current.scrollTo({
              y: 0,
              animated: true
            });
          }
        } else {
          // Fallback: scroll to top
          if (Platform.OS === 'web') {
            const scrollToTopWeb = () => {
              const scrollViewById = document.getElementById('messages-scroll-view');
              if (scrollViewById) {
                scrollViewById.scrollTop = 0;
                return true;
              }
              const scrollViewByClass = document.querySelector('[class*="ScrollView"], [class*="scroll-view"]');
              if (scrollViewByClass) {
                scrollViewByClass.scrollTop = 0;
                return true;
              }
              return false;
            };
            setTimeout(() => scrollToTopWeb(), 100);
          } else {
            scrollViewRef.current.scrollTo({
              y: 0,
              animated: true
            });
          }
        }
      }
    } else {
      console.log('ScrollView ref is null');
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

  // Web-compatible scroll to bottom function
  const scrollToBottom = () => {
    if (Platform.OS === 'web') {
      // Try global scroll function first (from web wrapper)
      if ((window as any).scrollChatToBottom) {
        try {
          (window as any).scrollChatToBottom();
          return;
        } catch (error) {
          console.warn('Global scroll function failed:', error);
        }
      }
      
      // Try web-specific DOM scrolling
      if (webScrollRef.current) {
        try {
          webScrollRef.current.scrollTop = webScrollRef.current.scrollHeight;
          return;
        } catch (error) {
          console.warn('Web scroll ref failed:', error);
        }
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
            // Last resort: try to find the actual DOM element and scroll it
            try {
              const scrollElement = scrollViewRef.current as any;
              if (scrollElement && scrollElement._nativeTag) {
                const domElement = document.getElementById(scrollElement._nativeTag);
                if (domElement) {
                  domElement.scrollTop = domElement.scrollHeight;
                }
              }
            } catch (domError) {
              console.warn('DOM scroll fallback failed:', domError);
            }
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

  // Use chat messages hook for loading messages and real-time subscriptions
  const { messages, setMessages, commissionId, setCommissionId } = useChatMessages({
    conversationId,
    user,
    otherUserId,
    scrollToBottom,
    router,
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
      // This is the container from messages_hub.web.tsx that wraps ChatScreenCaller
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

  // Use invoice actions hook
  const { handleInvoiceAction, handleInvoiceActionImmediateWeb, processInvoiceActionWeb } = useInvoiceActions({
    messages,
    setMessages,
    conversationId,
    user,
    router,
    setShowLoadingModal,
    setDeclineMessageId,
    setShowDeclineConfirmModal,
  });

  // Use file upload hook
  const { handleSendMessage, handlePickImage, handlePickDocument, handleAttachment, handleCamera } = useFileUpload({
    conversationId,
    user,
    currentMessage,
    setCurrentMessage,
    scrollToBottom,
  });

  // Use conversation management hook
  const { handleDeleteConversation, handleNavigateToProfile } = useConversationManagement({
    conversationId,
    otherUserId,
    contactProfile,
    contact,
    router,
  });

  // Load auth user and profile data
  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);

      if (user) {
        // Fetch current user's profile data
        const { data: userProfile, error: userError } = await supabase
          .from('users')
          .select('*')
          .eq('id', user.id)
          .single();

        if (!userError && userProfile) {
          console.log('Current user profile fetched:', userProfile);
          setCurrentUserProfile(userProfile);
        } else {
          console.log('Error fetching current user profile:', userError);
        }

        // Fetch contact's profile data from conversation
        if (otherUserId) {
          console.log('ChatScreenCaller: Fetching contact profile for user ID:', otherUserId);
          const { data: contactData, error: contactError } = await supabase
            .from('users')
            .select('*')
            .eq('id', otherUserId)
            .single();

          if (!contactError && contactData) {
            console.log('ChatScreenCaller: Contact profile fetched:', contactData);
            setContactProfile(contactData);
          } else {
            console.log('ChatScreenCaller: Error fetching contact profile:', contactError);
          }
        } else {
          console.log('ChatScreenCaller: No otherUserId provided');
        }
      }
    };
    getUser();
  }, [otherUserId]);

  // Fetch commission data for invoice modal
  useEffect(() => {
    const fetchCommissionData = async () => {
      if (!commissionId) {
        setCommissionData({ id: null, title: null });
        return;
      }

      try {
        const { data: commission, error } = await supabase
          .from('commission')
          .select('id, title')
          .eq('id', parseInt(commissionId as string))
          .single();

        if (error || !commission) {
          setCommissionData({ id: null, title: null });
          return;
        }

        setCommissionData({
          id: commission.id,
          title: commission.title,
        });
      } catch (e) {
        console.warn('Failed to fetch commission data:', e);
        setCommissionData({ id: null, title: null });
      }
    };

    fetchCommissionData();
  }, [commissionId]);

  // File upload functions are now handled by useFileUpload hook

  // Invoice actions are now handled by useInvoiceActions hook
  // Camera function is now handled by useFileUpload hook

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

  // Navigation function is now handled by useConversationManagement hook

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

  // Function to download and save files
  const handleDownloadFile = async (fileUrl: string, fileName: string) => {
    try {
      // Web: Directly trigger browser download
      if (Platform.OS === 'web') {
        const response = await fetch(fileUrl);
        if (!response.ok) {
          throw new Error(`Download failed: ${response.status}`);
        }
        const blob = await response.blob();
        const objectUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = objectUrl;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(objectUrl);
        return;
      }

      // Native mobile: Show options dialog
      Alert.alert('Download', 'Choose how to save the file:', [
        {
          text: 'Save to Gallery (Images only)',
          onPress: () => downloadToGallery(fileUrl, fileName),
        },
        {
          text: 'Share File',
          onPress: () => shareFile(fileUrl, fileName),
        },
        {
          text: 'Cancel',
          style: 'cancel',
        },
      ]);
    } catch (error) {
      console.error('Download error:', error);
      Alert.alert('Error', 'Failed to download file. Please try again.');
    }
  };

  // Function to download image to gallery
  const downloadToGallery = async (fileUrl: string, fileName: string) => {
    try {
      // Web: Use browser download
      if (Platform.OS === 'web') {
        const response = await fetch(fileUrl);
        if (!response.ok) {
          throw new Error(`Download failed: ${response.status}`);
        }
        const blob = await response.blob();
        const objectUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = objectUrl;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(objectUrl);
        return;
      }

      // Native mobile: Check if it's an image
      const isImage = /\.(jpg|jpeg|png|gif|bmp)$/i.test(fileName);
      if (!isImage) {
        Alert.alert('Error', 'Only images can be saved to gallery.');
        return;
      }

      // Request media library permissions
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission denied', 'Media library permission is required to save images.');
        return;
      }

      // Download the file using fetch and new FileSystem API
      const response = await fetch(fileUrl);
      if (!response.ok) {
        throw new Error(`Download failed: ${response.status}`);
      }

      // Get the file as arrayBuffer and convert to base64 (React Native compatible)
      const arrayBuffer = await response.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      let binary = '';
      const chunkSize = 8192; // Process in chunks to avoid stack overflow
      for (let i = 0; i < bytes.length; i += chunkSize) {
        const chunk = bytes.subarray(i, i + chunkSize);
        binary += String.fromCharCode(...chunk);
      }
      const base64Data = btoa(binary);

      // Write file using new FileSystem API
      const fileUri = `${FileSystem.cacheDirectory}${fileName}`;
      await FileSystem.writeAsStringAsync(fileUri, base64Data, {
        encoding: FileSystem.EncodingType.Base64,
      });

        // Save to gallery
      await MediaLibrary.saveToLibraryAsync(fileUri);
        Alert.alert('Success', 'Image saved to gallery successfully!');
    } catch (error) {
      console.error('Gallery save error:', error);
      Alert.alert('Error', 'Failed to save image to gallery. Please try again.');
    }
  };

  // Function to share file
  const shareFile = async (fileUrl: string, fileName: string) => {
    try {
      // Web: Use browser download (Web Share API requires HTTPS and user gesture)
      if (Platform.OS === 'web') {
        const response = await fetch(fileUrl);
        if (!response.ok) {
          throw new Error(`Download failed: ${response.status}`);
        }
        const blob = await response.blob();
        const objectUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = objectUrl;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(objectUrl);
        return;
      }

      // Native mobile: Check if sharing is available
      const isAvailable = await Sharing.isAvailableAsync();
      if (!isAvailable) {
        Alert.alert('Error', 'Sharing is not available on this device.');
        return;
      }

      // Download the file using fetch and new FileSystem API
      const response = await fetch(fileUrl);
      if (!response.ok) {
        throw new Error(`Download failed: ${response.status}`);
      }

      // Get the file as arrayBuffer and convert to base64 (React Native compatible)
      const arrayBuffer = await response.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      let binary = '';
      const chunkSize = 8192; // Process in chunks to avoid stack overflow
      for (let i = 0; i < bytes.length; i += chunkSize) {
        const chunk = bytes.subarray(i, i + chunkSize);
        binary += String.fromCharCode(...chunk);
      }
      const base64Data = btoa(binary);

      // Write file using new FileSystem API
      const fileUri = `${FileSystem.cacheDirectory}${fileName}`;
      await FileSystem.writeAsStringAsync(fileUri, base64Data, {
        encoding: FileSystem.EncodingType.Base64,
      });

        // Share the file
      await Sharing.shareAsync(fileUri, {
          mimeType: getMimeType(fileName),
          dialogTitle: `Share ${fileName}`,
        });
    } catch (error) {
      console.error('Share error:', error);
      Alert.alert('Error', 'Failed to share file. Please try again.');
    }
  };

  // Helper function to get MIME type from file extension
  const getMimeType = (fileName: string) => {
    const extension = fileName.split('.').pop()?.toLowerCase();
    switch (extension) {
      case 'pdf':
        return 'application/pdf';
      case 'doc':
        return 'application/msword';
      case 'docx':
        return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      case 'xls':
        return 'application/vnd.ms-excel';
      case 'xlsx':
        return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      case 'txt':
        return 'text/plain';
      case 'jpg':
      case 'jpeg':
        return 'image/jpeg';
      case 'png':
        return 'image/png';
      case 'gif':
        return 'image/gif';
      default:
        return 'application/octet-stream';
    }
  };


  // Invoice actions are now handled by useInvoiceActions hook
  // Delete conversation function is now handled by useConversationManagement hook


  return (
    <SafeAreaView style={styles.container as ViewStyle}>
      {/* Header Section */}
      <ChatHeader
        contactProfile={contactProfile}
        contact={contact}
        isDateFiltered={isDateFiltered}
        onNavigateToProfile={handleNavigateToProfile}
        onClearFilter={clearDateFilter}
        onOpenSettings={() => setShowSettingsModal(true)}
        getUserInitialsFromProfile={getUserInitialsFromProfile}
        onBack={onBack}
      />

      {/* Messages Area */}
      <View style={styles.messagesContainer as ViewStyle}>
        {/* Date Filter Indicator */}
        {isDateFiltered && (
          <View style={styles.dateFilterIndicator as ViewStyle}>
            <Ionicons name="calendar" size={16} color="#8B2323" />
            <Text style={styles.dateFilterText as TextStyle}>
              Showing invoices for {formatDateForDisplay(selectedDate)}
            </Text>
            <TouchableOpacity 
              onPress={clearDateFilter}
              style={styles.dateFilterClearButton as ViewStyle}
            >
              <Ionicons name="close" size={16} color="#8B2323" />
            </TouchableOpacity>
          </View>
        )}
        
        {Platform.OS === 'web' ? (
          <FlatList
            ref={scrollViewRef as any}
            data={isDateFiltered ? filteredMessages : messages}
            renderItem={({ item: message }) => (
              <ChatMessageBubble
                key={message.id}
                message={message}
                contactProfile={contactProfile}
                getUserInitialsFromProfile={getUserInitialsFromProfile}
                getFileTypeLabel={getFileTypeLabel}
                getFileSize={getFileSize}
                onImagePress={setSelectedImage}
                onFileDownload={handleDownloadFile}
                onInvoiceAccept={(messageId) => {
                  handleInvoiceActionImmediateWeb(messageId, 'accept');
                }}
                onInvoiceDecline={(messageId) => {
                  handleInvoiceActionImmediateWeb(messageId, 'decline');
                }}
                onInvoiceViewDetails={async (invoice) => {
                  setSelectedInvoice(invoice);
                  // Fetch commission data from invoice record
                  if (invoice.messageId) {
                    try {
                      const { data: invoiceRecord, error } = await supabase
                        .from('invoices')
                        .select('commission_id')
                        .eq('message_id', invoice.messageId)
                        .single();

                      if (!error && invoiceRecord?.commission_id) {
                        const { data: commission, error: commissionError } = await supabase
                          .from('commission')
                          .select('id, title')
                          .eq('id', invoiceRecord.commission_id)
                          .single();

                        if (!commissionError && commission) {
                          setCommissionData({
                            id: commission.id,
                            title: commission.title,
                          });
                        }
                      }
                    } catch (e) {
                      console.warn('Failed to fetch commission data for invoice:', e);
                    }
                  }
                  setShowInvoiceDetailsModal(true);
                }}
              />
            )}
            keyExtractor={(item) => item.id}
            ListEmptyComponent={
              <ChatEmptyState
                isDateFiltered={isDateFiltered}
                selectedDate={selectedDate}
                formatDateForDisplay={formatDateForDisplay}
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
            style={styles.messagesScrollView as ViewStyle}
            contentContainerStyle={[
              styles.messagesContent as ViewStyle,
              (isDateFiltered ? filteredMessages : messages).length === 0 && { flexGrow: 1 }
            ]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          />
        ) : (
        <ScrollView
          ref={scrollViewRef}
          style={styles.messagesScrollView as ViewStyle}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.messagesContent as ViewStyle}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => {
            // Ensure content is properly measured before scrolling
            console.log('ScrollView content size changed');
          }}
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
                <ChatEmptyState
                  isDateFiltered={isDateFiltered}
                  selectedDate={selectedDate}
                  formatDateForDisplay={formatDateForDisplay}
                  onClearFilter={clearDateFilter}
                />
              );
            }
            
            return messagesToShow.map((message) => (
              <ChatMessageBubble
                key={message.id}
                message={message}
                contactProfile={contactProfile}
                getUserInitialsFromProfile={getUserInitialsFromProfile}
                getFileTypeLabel={getFileTypeLabel}
                getFileSize={getFileSize}
                onImagePress={setSelectedImage}
                onFileDownload={handleDownloadFile}
                onInvoiceAccept={(messageId) => {
                    handleInvoiceAction(messageId, 'accept');
                }}
                onInvoiceDecline={(messageId) => {
                    handleInvoiceAction(messageId, 'decline');
                }}
                onInvoiceViewDetails={async (invoice) => {
                  setSelectedInvoice(invoice);
                  // Fetch commission data from invoice record
                  if (invoice.messageId) {
                    try {
                      const { data: invoiceRecord, error } = await supabase
                        .from('invoices')
                        .select('commission_id')
                        .eq('message_id', invoice.messageId)
                        .single();

                      if (!error && invoiceRecord?.commission_id) {
                        const { data: commission, error: commissionError } = await supabase
                          .from('commission')
                          .select('id, title')
                          .eq('id', invoiceRecord.commission_id)
                          .single();

                        if (!commissionError && commission) {
                          setCommissionData({
                            id: commission.id,
                            title: commission.title,
                          });
                        }
                      }
                    } catch (e) {
                      console.warn('Failed to fetch commission data for invoice:', e);
                    }
                  }
                  setShowInvoiceDetailsModal(true);
                }}
              />
            ));
          })()}
        </ScrollView>
        )}
      </View>


      {/* Input Bar - Always visible at bottom */}
      <ChatInputBar
        currentMessage={currentMessage}
        onChangeText={setCurrentMessage}
        onSend={handleSendMessage}
        onAttachment={() => (Platform.OS === 'web' ? handlePickDocument() : handleAttachment())}
        onCamera={Platform.OS !== 'web' ? handleCamera : undefined}
      />

      {/* Image Viewer Modal */}
      <ChatImageViewerModal
        imageUri={selectedImage}
        onClose={() => setSelectedImage(null)}
        onDownload={handleDownloadFile}
      />

      {/* Invoice Details Modal */}
      <CallerInvoiceDetailsModal
        styles={styles}
        visible={showInvoiceDetailsModal}
        invoice={selectedInvoice}
        commissionId={commissionData.id}
        commissionTitle={commissionData.title}
        onClose={() => {
          setShowInvoiceDetailsModal(false);
          setSelectedInvoice(null);
        }}
      />

      {/* Options menu removed per request */}
      {false && moreOpen && (
        <View style={styles.moreMenuBackdrop as ViewStyle}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setMoreOpen(false)} />
          <View style={[styles.moreMenu as ViewStyle, { position: 'absolute', top: menuPos.y, left: menuPos.x }]}>
            <TouchableOpacity style={styles.moreMenuItem as ViewStyle} onPress={() => { setMoreOpen(false); handleDeleteConversation(); }} {...(Platform.OS === 'web' ? { onClick: () => { setMoreOpen(false); handleDeleteConversation(); } } as any : {})}>
              <Ionicons name="trash" size={18} color="#8B2323" />
              <Text style={styles.moreMenuText as TextStyle}>Delete Conversation</Text>
            </TouchableOpacity>
            <View style={styles.moreMenuDivider as ViewStyle} />
            <TouchableOpacity style={styles.moreMenuItem as ViewStyle} onPress={() => setMoreOpen(false)} {...(Platform.OS === 'web' ? { onClick: () => setMoreOpen(false) } as any : {})}>
              <Ionicons name="close" size={18} color="#8B2323" />
              <Text style={styles.moreMenuText as TextStyle}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Commission Settings Modal */}
      {Platform.OS === 'web' ? (
        <CommissionSettingsModalWeb
          visible={showSettingsModal}
          onClose={() => setShowSettingsModal(false)}
          conversationId={conversationId as string}
          commissionId={commissionId || undefined}
          onCommissionReleased={() => {
            // Navigate back to home screen to find a new runner
            console.log('Commission released, navigating to home screen...');
            router.replace('/buddycaller/home');
          }}
          onDateFiltered={handleDateFiltered}
        />
      ) : (
        <CommissionSettingsModal
          visible={showSettingsModal}
          onClose={() => setShowSettingsModal(false)}
          conversationId={conversationId as string}
          commissionId={commissionId || undefined}
          onCommissionReleased={() => {
            // Refresh messages or handle commission release
            console.log('Commission released, refreshing...');
          }}
          onDateFiltered={handleDateFiltered}
        />
      )}

      {/* Custom Decline Confirmation Modal for Web */}
      {Platform.OS === 'web' && (
        <ChatDeclineConfirmModal
          visible={showDeclineConfirmModal}
          onCancel={() => {
            setShowDeclineConfirmModal(false);
            setDeclineMessageId(null);
          }}
          onConfirm={async () => {
            try {
              if (declineMessageId) {
                await processInvoiceActionWeb(declineMessageId, 'decline');
              }
            } catch (error) {
              console.error('Error processing decline action:', error);
            } finally {
              // Always close the modal regardless of success or failure
              setShowDeclineConfirmModal(false);
              setDeclineMessageId(null);
            }
          }}
        />
      )}

      {/* Loading Modal for Navigation */}
      <ChatLoadingModal visible={showLoadingModal} />
    </SafeAreaView>
  );
};

// Styles for the ChatScreen component
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'white',
    width: '100%',
    ...(Platform.OS === 'web' && {
      display: 'flex' as any,
      flexDirection: 'column' as any,
      height: '100%' as any,
    }),
  },

  // Header section styling
  header: {
    backgroundColor: 'white',
    paddingTop: rp(4),
    paddingBottom: rp(8),
    paddingHorizontal: rp(16),
    ...(Platform.OS === 'web' && {
      position: 'sticky' as any,
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

  // Contact name
  contactName: {
    fontSize: Platform.OS === 'web' ? 16 : rf(18),
    fontWeight: '600',
    color: '#8B2323',
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

  // Call button
  callButton: {
    padding: rp(8),
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
    ...(Platform.OS === 'web' && {
      // Ensure messages don't overlap with sticky header
      marginTop: 0,
    }),
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

  messagesScrollView: {
    flex: 1,
  },

  messagesContent: {
    padding: rp(16),
    paddingBottom: rp(20),
  },
  // System message (centered, outside bubbles)
  systemMessageContainer: {
    width: '100%',
    alignItems: 'center',
    marginVertical: rp(8),
  },
  systemMessageText: {
    color: '#666',
    fontSize: Platform.OS === 'web' ? 13 : rf(12),
  },

  // Empty state
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: rh(60),
  },

  emptyStateText: {
    fontSize: rf(18),
    fontWeight: '600',
    color: '#666',
    marginBottom: rp(8),
  },

  emptyStateSubtext: {
    fontSize: rf(14),
    color: '#999',
    textAlign: 'center',
    marginBottom: 20,
  },

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
    marginBottom: rp(12),
    alignItems: 'flex-end',
  },

  // Message container for invoice messages
  messageContainerInvoice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },

  // Contact profile container for incoming messages
  contactProfileContainer: {
    marginRight: 8,
    marginBottom: 2,
  },

  // Message bubble base styling
  messageBubble: {
    maxWidth: '80%',
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

  // Outgoing message bubble (from user)
  outgoingMessage: {
    backgroundColor: '#8B2323', // Red background
    borderBottomRightRadius: 4, // Less rounded on bottom right
    marginLeft: 'auto', // Push to right side
  },

  // Message text styling
  messageText: {
    fontSize: Platform.OS === 'web' ? 13 : rf(14),
    lineHeight: Platform.OS === 'web' ? 17 : rf(18),
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
    width: rw(6),
    height: rw(6),
    borderRadius: rb(3),
    backgroundColor: '#999',
    marginHorizontal: rp(2),
  },

  messageTimestamp: {
    fontSize: rf(12),
    marginTop: rp(4),
    marginHorizontal: rp(12),
  },

  outgoingTimestamp: {
    textAlign: 'right',
    color: '#666',
  },

  incomingTimestamp: {
    textAlign: 'left',
    color: '#666',
  },

  // Attachment styles
  attachmentContainer: {
    marginBottom: 12,
  },

  attachmentImage: {
    width: 200,
    height: 150,
    borderRadius: 8,
    marginBottom: 4,
    maxWidth: '100%',
    alignSelf: 'center',
  },

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

  fileName: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 4,
    flex: 1,
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



  // Input bar styles
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

  sendButton: {
    padding: Platform.OS === 'web' ? 6 : rp(8),
    marginLeft: Platform.OS === 'web' ? 2 : rp(4),
  },

  // Invoice container
  invoiceContainer: {
    backgroundColor: 'white',
    borderRadius: Platform.OS === 'web' ? 10 : 12,
    padding: Platform.OS === 'web' ? 8 : 8,
    marginBottom: 8,
    maxWidth: Platform.OS === 'web' ? 220 : 200,
    borderWidth: 2,
    borderColor: '#8B2323',
    alignSelf: 'flex-start',
  },

  // Invoice header
  invoiceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Platform.OS === 'web' ? 5 : 8,
  },

  // Invoice title
  invoiceTitle: {
    fontSize: Platform.OS === 'web' ? 13 : rf(14),
    fontWeight: '600',
    marginLeft: rp(6),
    color: '#8B2323',
  },

  // Invoice content
  invoiceContent: {
    gap: Platform.OS === 'web' ? 4 : 6,
  },

  // Invoice description
  invoiceDescription: {
    fontSize: Platform.OS === 'web' ? 12 : rf(12),
    marginBottom: rp(4),
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
    fontSize: Platform.OS === 'web' ? 13 : rf(14),
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
    fontSize: Platform.OS === 'web' ? 10 : rf(11),
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
    fontSize: Platform.OS === 'web' ? 12 : rf(12),
    fontWeight: '600',
  },



  // Invoice action buttons container
  invoiceActionButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: Platform.OS === 'web' ? 10 : 8,
    paddingTop: Platform.OS === 'web' ? 10 : 8,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    gap: 8,
    width: '100%',
    ...(Platform.OS === 'web' ? { pointerEvents: 'auto' } : {}),
  },

  // Accept button
  acceptButton: {
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

  // Accept button text
  acceptButtonText: {
    color: '#8B2323',
    fontSize: Platform.OS === 'web' ? 12 : rf(12),
    fontWeight: '600',
    textAlign: 'center',
  },

  // Decline button
  declineButton: {
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

  // Decline button text
  declineButtonText: {
    color: 'white',
    fontSize: Platform.OS === 'web' ? 12 : rf(12),
    fontWeight: '600',
    textAlign: 'center',
  },

  // Disabled button styles
  disabledButton: {
    backgroundColor: '#f5f5f5',
    borderColor: '#d0d0d0',
  },

  disabledButtonText: {
    color: '#999',
  },

  disabledDeclineButton: {
    backgroundColor: '#d0d0d0',
  },

  disabledDeclineButtonText: {
    color: '#666',
  },

  // View Details button (for accepted invoices)
  viewDetailsButton: {
    width: '100%',
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#8B2323',
    borderRadius: 6,
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
    justifyContent: 'flex-start',
    alignItems: 'flex-end',
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
  settingsButton: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: '#FFF5F5',
    marginLeft: 8,
  },

  clearFilterButton: {
    padding: 6,
    borderRadius: 16,
    backgroundColor: '#FFF5F5',
    marginLeft: 8,
    marginRight: 4,
  },

  // Loading modal styles
  loadingModal: {
    position: Platform.OS === 'web' ? 'fixed' as any : 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 3000,
  },

  loadingModalBackground: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  loadingModalContainer: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    minWidth: 280,
    maxWidth: 320,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },

  loadingSpinner: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#FFF5F5',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },

  loadingModalTitle: {
    fontSize: Platform.OS === 'web' ? 18 : rf(18),
    fontWeight: '700',
    color: '#8B2323',
    marginBottom: 8,
    textAlign: 'center',
  },

  loadingModalMessage: {
    fontSize: Platform.OS === 'web' ? 14 : rf(14),
    color: '#666',
    textAlign: 'center',
    lineHeight: Platform.OS === 'web' ? 20 : rf(20),
  },

  // Custom Decline Confirmation Modal Styles
  confirmModalOverlay: {
    position: 'fixed' as any,
    top: 0,
    left: 0,
    width: '100vw' as any,
    height: '100vh' as any,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    zIndex: 1000,
    display: 'flex' as any,
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    // Ensure it stays within viewport bounds
    maxWidth: '100vw' as any,
    maxHeight: '100vh' as any,
    overflow: 'hidden',
  } as ViewStyle,

  confirmModalContainer: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 24,
    minWidth: 320,
    maxWidth: 400,
    maxHeight: '80vh' as any,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
    // Ensure modal doesn't exceed viewport
    overflow: 'hidden',
  } as ViewStyle,

  confirmModalContent: {
    alignItems: 'center',
  },

  confirmModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    marginBottom: 12,
  },

  confirmModalTitle: {
    fontSize: Platform.OS === 'web' ? 18 : rf(18),
    fontWeight: '700',
    color: '#8B2323',
    textAlign: 'center',
    flex: 1,
  },

  confirmModalCloseButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 12,
  },

  confirmModalCloseButtonText: {
    fontSize: Platform.OS === 'web' ? 16 : rf(16),
    fontWeight: '600',
    color: '#666',
    lineHeight: Platform.OS === 'web' ? 16 : rf(16),
  },

  confirmModalMessage: {
    fontSize: Platform.OS === 'web' ? 14 : rf(14),
    color: '#666',
    textAlign: 'center',
    lineHeight: Platform.OS === 'web' ? 20 : rf(20),
    marginBottom: 24,
  },

  confirmModalButtons: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
    justifyContent: 'space-between',
  },

  confirmModalCancelButton: {
    flex: 0.8,
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingVertical: Platform.OS === 'web' ? 12 : 12,
    paddingHorizontal: Platform.OS === 'web' ? 16 : 20,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: Platform.OS === 'web' ? 44 : 44,
  },

  confirmModalCancelButtonText: {
    fontSize: Platform.OS === 'web' ? 14 : rf(14),
    fontWeight: '600',
    color: '#666',
    textAlign: 'center',
  },

  confirmModalConfirmButton: {
    flex: 1.2,
    backgroundColor: '#8B2323',
    borderRadius: 8,
    paddingVertical: Platform.OS === 'web' ? 12 : 12,
    paddingHorizontal: Platform.OS === 'web' ? 16 : 20,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: Platform.OS === 'web' ? 44 : 44,
  },

  confirmModalConfirmButtonText: {
    fontSize: Platform.OS === 'web' ? 14 : rf(14),
    fontWeight: '600',
    color: 'white',
    textAlign: 'center',
    lineHeight: Platform.OS === 'web' ? 18 : rf(18),
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
    zIndex: Platform.OS === 'web' ? 1000 : undefined,
  },

  // Invoice Details Modal
  invoiceDetailsModal: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 20,
    width: '90%',
    maxWidth: 400,
    zIndex: Platform.OS === 'web' ? 1001 : undefined,
    ...(Platform.OS === 'web' ? { boxShadow: '0px 4px 12px rgba(0,0,0,0.3)' } : {}),
  },
  invoiceDetailsHeader: {
    marginBottom: 20,
  },
  invoiceDetailsTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#8B2323',
    textAlign: 'center',
  },
  invoiceDetailsContent: {
    marginBottom: 20,
  },
  invoiceDetailsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    paddingVertical: 4,
  },
  invoiceDetailsLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6C757D',
    flex: 1,
  },
  invoiceDetailsValue: {
    fontSize: 14,
    fontWeight: '400',
    color: '#495057',
    flex: 1,
    textAlign: 'right',
  },
  invoiceDetailsOkButton: {
    backgroundColor: '#8B2323',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  invoiceDetailsOkText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default ChatScreenCaller;
