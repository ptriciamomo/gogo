import React, { useState, useEffect, useMemo } from 'react';
import {
  SafeAreaView,
  ScrollView,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Image,
  Alert,
  Platform,
  Dimensions,
  type ViewStyle,
  type TextStyle,
  type ImageStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { responsive, rw, rh, rf, rp, rb } from '../../utils/responsive';
import { supabase } from '../../lib/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Interface for conversation data
interface Conversation {
  id: string;
  otherUserId: string;
  name: string;
  initials: string;
  lastMessage: string;
  timestamp: string;
  unreadCount: number;
  isOnline: boolean;
  avatar?: string;
  hasUnread?: boolean;
}

// Helper function to format timestamp
const formatTimestamp = (timestamp: string) => {
  const date = new Date(timestamp);
  const now = new Date();
  const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);
  
  if (diffInHours < 1) {
    const diffInMinutes = Math.floor(diffInHours * 60);
    return `${diffInMinutes} min ago`;
  } else if (diffInHours < 24) {
    return `${Math.floor(diffInHours)} hour${Math.floor(diffInHours) > 1 ? 's' : ''} ago`;
  } else if (diffInHours < 48) {
    return 'Yesterday';
  } else {
    return date.toLocaleDateString();
  }
};

// Hook to track window dimensions for responsive design
const useWindowDimensions = () => {
  const [dimensions, setDimensions] = useState(Dimensions.get('window'));

  useEffect(() => {
    const subscription = Dimensions.addEventListener('change', ({ window }) => {
      setDimensions(window);
    });

    return () => subscription?.remove();
  }, []);

  return dimensions;
};

// Helper to get responsive breakpoint
const getBreakpoint = (width: number) => {
  if (width < 480) return 'mobile';
  if (width < 768) return 'tablet';
  if (width < 1024) return 'desktop';
  return 'large';
};

export default function MessagesListScreen() {
  const router = useRouter();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [readConversations, setReadConversations] = useState<Map<string, string>>(new Map());
  const windowDimensions = useWindowDimensions();
  const breakpoint = getBreakpoint(windowDimensions.width);
  
  // Memoize responsive styles to avoid recalculating on every render
  const responsiveStyles = useMemo(() => getResponsiveStyles(breakpoint), [breakpoint]);

  // Load read conversations from AsyncStorage
  const loadReadConversations = async () => {
    try {
      const stored = await AsyncStorage.getItem('readConversations');
      if (stored) {
        const parsed = JSON.parse(stored);
        setReadConversations(new Map(Object.entries(parsed)));
      }
    } catch (error) {
      console.error('Error loading read conversations:', error);
    }
  };

  // Save read conversations to AsyncStorage
  const saveReadConversations = async (readMap: Map<string, string>) => {
    try {
      const obj = Object.fromEntries(readMap);
      await AsyncStorage.setItem('readConversations', JSON.stringify(obj));
    } catch (error) {
      console.error('Error saving read conversations:', error);
    }
  };

  // Mark conversation as read when user sends a reply
  const markConversationAsRead = async (conversationId: string) => {
    const newReadMap = new Map(readConversations);
    newReadMap.set(conversationId, new Date().toISOString());
    setReadConversations(newReadMap);
    await saveReadConversations(newReadMap);
  };


  // Load read conversations on mount
  useEffect(() => {
    loadReadConversations();
  }, []);


  // Get current user
  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
    };
    getUser();
  }, []);

  // Load conversations from database
  useEffect(() => {
    if (!user) return;

    const loadConversations = async () => {
      setLoading(true);
      try {
        // Get conversations where user is either user1 or user2
        const { data: conversationsData, error } = await supabase
          .from('conversations')
          .select(`
            id,
            user1_id,
            user2_id,
            last_message_at,
            user1:users!conversations_user1_id_fkey(
              id,
              first_name,
              last_name,
              profile_picture_url
            ),
            user2:users!conversations_user2_id_fkey(
              id,
              first_name,
              last_name,
              profile_picture_url
            )
          `)
          .or(`user1_id.eq.${user.id},user2_id.eq.${user.id}`)
          .order('last_message_at', { ascending: false });

        if (error) throw error;

        // Get the last message for each conversation
        const conversationIds = conversationsData?.map(conv => conv.id) || [];
        
        const { data: messagesData, error: messagesError } = await supabase
          .from('messages')
          .select(`
            id,
            conversation_id,
            sender_id,
            message_text,
            message_type,
            created_at
          `)
          .in('conversation_id', conversationIds)
          .order('created_at', { ascending: false });

        if (messagesError) throw messagesError;

        // Group messages by conversation_id and get the latest one for each
        const latestMessages = messagesData?.reduce((acc: any, message: any) => {
          if (!acc[message.conversation_id] || new Date(message.created_at) > new Date(acc[message.conversation_id].created_at)) {
            acc[message.conversation_id] = message;
          }
          return acc;
        }, {}) || {};

        // Process the data to get the correct other user
        const processedConversations = conversationsData?.map(conv => {
          const isUser1 = conv.user1_id === user.id;
          let otherUser: { id: string; first_name: string; last_name: string; profile_picture_url?: string };
          
          if (isUser1) {
            // If current user is user1, other user is user2
            otherUser = conv.user2 && !Array.isArray(conv.user2) ? conv.user2 : { id: 'unknown', first_name: 'Unknown', last_name: 'User', profile_picture_url: undefined };
          } else {
            // If current user is user2, other user is user1
            otherUser = conv.user1 && !Array.isArray(conv.user1) ? conv.user1 : { id: 'unknown', first_name: 'Unknown', last_name: 'User', profile_picture_url: undefined };
          }

          // Get the latest message for this conversation
          const latestMessage = latestMessages[conv.id];
          const hasNewMessage = latestMessage && latestMessage.sender_id !== user.id;
          
          // Check if this message is newer than the last read timestamp
          let isUnread = false;
          if (hasNewMessage) {
            const lastReadTimestamp = readConversations.get(conv.id);
            if (!lastReadTimestamp) {
              // No read timestamp means conversation has never been opened
              isUnread = true;
            } else {
              // Compare timestamps - if latest message is newer than last read, it's unread
              const latestMessageTime = new Date(latestMessage.created_at).getTime();
              const lastReadTime = new Date(lastReadTimestamp).getTime();
              isUnread = latestMessageTime > lastReadTime;
            }
          }
          
          // Format the last message preview
          let messagePreview = 'No messages yet';
          let timestamp = 'No messages';
          
          if (latestMessage) {
            const messageTime = new Date(latestMessage.created_at);
            timestamp = messageTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            
            // Create message preview based on message type
            if (latestMessage.message_type === 'image') {
              messagePreview = '📷 Image';
            } else if (latestMessage.message_type === 'file') {
              messagePreview = '📄 File';
            } else if (latestMessage.message_type === 'text') {
              // Check if it's an invoice
              try {
                const parsedMessage = JSON.parse(latestMessage.message_text);
                if (parsedMessage && typeof parsedMessage === 'object' && parsedMessage.amount !== undefined) {
                  messagePreview = '💰 Invoice';
                } else {
                  messagePreview = latestMessage.message_text || 'Message';
                }
              } catch {
                // Not JSON, treat as regular text
                messagePreview = latestMessage.message_text || 'Message';
              }
            } else {
              messagePreview = 'Message';
            }
          }
          
          return {
            id: conv.id, // This is now a real UUID from the database
            otherUserId: otherUser.id, // Add the other user's ID
            name: `${otherUser.first_name} ${otherUser.last_name}`,
            initials: `${otherUser.first_name?.[0] || 'U'}${otherUser.last_name?.[0] || ''}`,
            lastMessage: messagePreview,
            timestamp: timestamp,
            unreadCount: isUnread ? 1 : 0,
            isOnline: false,
            avatar: otherUser.profile_picture_url,
            hasUnread: isUnread,
          };
        }) || [];

        // Sort conversations by the actual latest message timestamp (most recent first)
        const sortedConversations = processedConversations.sort((a, b) => {
          // Get the latest message for each conversation
          const latestMessageA = latestMessages[a.id];
          const latestMessageB = latestMessages[b.id];
          
          // If one has a message and the other doesn't, prioritize the one with a message
          if (latestMessageA && !latestMessageB) return -1;
          if (!latestMessageA && latestMessageB) return 1;
          if (!latestMessageA && !latestMessageB) return 0;
          
          // Sort by message timestamp (most recent first)
          const timeA = new Date(latestMessageA.created_at).getTime();
          const timeB = new Date(latestMessageB.created_at).getTime();
          return timeB - timeA;
        });

        setConversations(sortedConversations);
      } catch (error) {
        console.error('Error loading conversations:', error);
        Alert.alert('Error', 'Failed to load conversations');
        // Fallback to empty array
        setConversations([]);
      } finally {
        setLoading(false);
      }
    };

    loadConversations();
  }, [user, readConversations]);

  const handleConversationPress = async (conversation: Conversation) => {
    // Mark conversation as read when opened
    const newReadMap = new Map(readConversations);
    newReadMap.set(conversation.id, new Date().toISOString());
    setReadConversations(newReadMap);
    await saveReadConversations(newReadMap);

    // Navigate to split-view hub on web
    router.push({
      pathname: '/buddyrunner/messages_hub',
      params: {
        conversationId: conversation.id,
        otherUserId: conversation.otherUserId,
        contactName: conversation.name,
        contactInitials: conversation.initials,
        isOnline: conversation.isOnline.toString()
      }
    });
  };

  const handleStartNewConversation = () => {
    // Navigate to start conversation screen
    router.push('/buddyrunner/start_conversation');
  };

  const renderConversationItem = (conversation: Conversation) => {
    // Create style array for conversation name
    const nameStyle = [
      responsiveStyles.conversationName as TextStyle,
      conversation.hasUnread && (responsiveStyles.unreadName as TextStyle)
    ];
    
    return (
      <TouchableOpacity
        key={conversation.id}
        style={responsiveStyles.conversationItem as ViewStyle}
        onPress={() => handleConversationPress(conversation)}
        activeOpacity={0.7}
      >
      <View style={responsiveStyles.avatarContainer as ViewStyle}>
        <View style={[
          responsiveStyles.avatar as ViewStyle,
          conversation.isOnline && (responsiveStyles.avatarOnline as ViewStyle)
        ]}>
          {conversation.avatar ? (
            <Image 
              source={{ uri: conversation.avatar }} 
              style={responsiveStyles.profileImage as ImageStyle}
              resizeMode="cover"
            />
          ) : (
            <Text style={responsiveStyles.avatarText as TextStyle}>{conversation.initials}</Text>
          )}
        </View>
        {conversation.isOnline && <View style={responsiveStyles.onlineIndicator as ViewStyle} />}
      </View>
      
      <View style={responsiveStyles.conversationContent as ViewStyle}>
        <View style={responsiveStyles.conversationHeader as ViewStyle}>
          <Text style={nameStyle} numberOfLines={1}>
            {conversation.name}
          </Text>
          <View style={responsiveStyles.timestampContainer as ViewStyle}>
            <Text style={responsiveStyles.timestamp as TextStyle}>{conversation.timestamp}</Text>
            {conversation.hasUnread && <View style={responsiveStyles.unreadDot as ViewStyle} />}
          </View>
        </View>
        
        <View style={responsiveStyles.conversationFooter as ViewStyle}>
          <Text 
            style={[
              responsiveStyles.lastMessage as TextStyle,
              conversation.unreadCount > 0 && (responsiveStyles.unreadMessage as TextStyle)
            ]}
            numberOfLines={1}
          >
            {conversation.lastMessage}
          </Text>
          {conversation.unreadCount > 0 && (
            <View style={responsiveStyles.unreadBadge as ViewStyle}>
              <Text style={responsiveStyles.unreadText as TextStyle}>
                {conversation.unreadCount > 99 ? '99+' : conversation.unreadCount}
              </Text>
            </View>
          )}
        </View>
      </View>
      </TouchableOpacity>
    );
  };

  console.log('MessagesList: Rendering with conversations:', conversations.length);
  console.log('MessagesList: Loading state:', loading);

  return (
    <SafeAreaView style={responsiveStyles.container as ViewStyle}>
      {/* Header */}
      <View style={responsiveStyles.header as ViewStyle}>
        <View style={responsiveStyles.headerContent as ViewStyle}>
          <TouchableOpacity 
            onPress={() => router.replace('/buddyrunner/home')} 
            style={responsiveStyles.backButton as ViewStyle}
          >
            <Ionicons name="arrow-back" size={breakpoint === 'mobile' ? 20 : 24} color="#333" />
          </TouchableOpacity>
          
          <Text style={responsiveStyles.headerTitle as TextStyle}>Messages</Text>
          
          <View style={responsiveStyles.headerActions as ViewStyle}>
            <TouchableOpacity style={responsiveStyles.searchButton as ViewStyle}>
              <Ionicons name="search" size={breakpoint === 'mobile' ? 20 : 24} color="#333" />
            </TouchableOpacity>
            <TouchableOpacity 
              style={responsiveStyles.newChatButton as ViewStyle}
              onPress={handleStartNewConversation}
            >
              <Ionicons name="add" size={breakpoint === 'mobile' ? 20 : 24} color="#333" />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Messages List */}
      <ScrollView 
        style={responsiveStyles.messagesList as ViewStyle} 
        contentContainerStyle={{ paddingBottom: breakpoint === 'mobile' ? 12 : rp(16) }} 
        showsVerticalScrollIndicator={true}
      >
        {loading ? (
          <View style={responsiveStyles.loadingState as ViewStyle}>
            <Text style={responsiveStyles.loadingText as TextStyle}>Loading conversations...</Text>
          </View>
        ) : conversations.length === 0 ? (
          <View style={responsiveStyles.emptyState as ViewStyle}>
            <View style={responsiveStyles.emptyStateIcon as ViewStyle}>
              <Ionicons name="chatbubbles-outline" size={breakpoint === 'mobile' ? 48 : 64} color="#ccc" />
            </View>
            <Text style={responsiveStyles.emptyStateText as TextStyle}>No conversations yet</Text>
            <Text style={responsiveStyles.emptyStateSubtext as TextStyle}>Start chatting with your callers</Text>
            <TouchableOpacity 
              style={responsiveStyles.testButton as ViewStyle}
              onPress={handleStartNewConversation}
            >
              <Text style={responsiveStyles.testButtonText as TextStyle}>Start New Conversation</Text>
            </TouchableOpacity>
          </View>
        ) : (
          conversations.map(renderConversationItem)
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// Function to get responsive styles based on breakpoint
const getResponsiveStyles = (breakpoint: string) => {
  const isMobile = breakpoint === 'mobile';
  const isTablet = breakpoint === 'tablet';
  const isDesktop = breakpoint === 'desktop' || breakpoint === 'large';

  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: '#F8F9FA',
      width: '100%',
      maxWidth: isDesktop ? '100%' : '100%',
    } as ViewStyle,
    
    // Header styles
    header: {
      backgroundColor: '#FFFFFF',
      paddingTop: isMobile ? 8 : rp(8),
      paddingBottom: isMobile ? 8 : rp(8),
      paddingHorizontal: isMobile ? 12 : isTablet ? 16 : rp(12),
      borderBottomWidth: 1,
      borderBottomColor: '#E5E5E5',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.1,
      shadowRadius: 2,
      elevation: 2,
      width: '100%',
    } as ViewStyle,
    
    headerContent: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    } as ViewStyle,
    
    backButton: {
      padding: isMobile ? 6 : rp(8),
      marginRight: isMobile ? 4 : rp(8),
    } as ViewStyle,
    
    headerTitle: {
      fontSize: Platform.OS === 'web' 
        ? (isMobile ? 16 : isTablet ? 17 : 18)
        : rf(16),
      fontWeight: '600',
      color: '#333',
      flex: 1,
      textAlign: 'center',
    } as TextStyle,
    
    headerActions: {
      flexDirection: 'row',
      alignItems: 'center',
    } as ViewStyle,
    
    searchButton: {
      padding: isMobile ? 6 : rp(8),
      marginRight: isMobile ? 2 : rp(4),
    } as ViewStyle,
    
    newChatButton: {
      padding: isMobile ? 6 : rp(8),
      marginLeft: isMobile ? 2 : rp(4),
    } as ViewStyle,
    
    // Messages list styles
    messagesList: {
      flex: 1,
      width: '100%',
    } as ViewStyle,
    
    // Conversation item styles
    conversationItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: isMobile ? 12 : isTablet ? 14 : rp(12),
      paddingVertical: isMobile ? 12 : isTablet ? 14 : rp(10),
      backgroundColor: '#FFFFFF',
      borderBottomWidth: 1,
      borderBottomColor: '#F0F0F0',
    } as ViewStyle,
    
    avatarContainer: {
      position: 'relative',
      marginRight: isMobile ? 10 : isTablet ? 12 : rp(12),
    } as ViewStyle,
    
    avatar: {
      width: isMobile ? 48 : isTablet ? 52 : 56,
      height: isMobile ? 48 : isTablet ? 52 : 56,
      borderRadius: isMobile ? 24 : isTablet ? 26 : 28,
      backgroundColor: '#8B2323',
      justifyContent: 'center',
      alignItems: 'center',
    } as ViewStyle,
    
    avatarOnline: {
      borderWidth: 2,
      borderColor: '#4CAF50',
    } as ViewStyle,
    
    avatarText: {
      color: 'white',
      fontSize: isMobile ? rf(14) : rf(16),
      fontWeight: '600',
    } as TextStyle,
    
    profileImage: {
      width: '100%',
      height: '100%',
      borderRadius: isMobile ? 24 : isTablet ? 26 : 28,
    } as ImageStyle,
    
    onlineIndicator: {
      position: 'absolute',
      bottom: isMobile ? 2 : rp(2),
      right: isMobile ? 2 : rp(2),
      width: isMobile ? 10 : 12,
      height: isMobile ? 10 : 12,
      borderRadius: isMobile ? 5 : 6,
      backgroundColor: '#4CAF50',
      borderWidth: 2,
      borderColor: '#FFFFFF',
    } as ViewStyle,
    
    conversationContent: {
      flex: 1,
      minWidth: 0, // Allow flex shrinking
    } as ViewStyle,
    
    conversationHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: isMobile ? 4 : rp(4),
    } as ViewStyle,
    
    conversationName: {
      fontSize: Platform.OS === 'web' 
        ? (isMobile ? 13 : isTablet ? 14 : 15)
        : rf(15),
      fontWeight: '600',
      color: '#333',
      flex: 1,
      minWidth: 0,
      marginRight: isMobile ? 4 : rp(8),
    } as TextStyle,  
    
    timestamp: {
      fontSize: Platform.OS === 'web' 
        ? (isMobile ? 10 : 11)
        : rf(11),
      color: '#999',
      flexShrink: 0,
    } as TextStyle,
    
    timestampContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      marginLeft: isMobile ? 4 : rp(8),
      flexShrink: 0,
    } as ViewStyle,
    
    unreadName: {
      fontWeight: '900',
      color: '#000',
      fontSize: Platform.OS === 'web' 
        ? (isMobile ? 13 : isTablet ? 14 : 16)
        : rf(16),
    } as TextStyle,
    
    unreadDot: {
      width: isMobile ? 6 : rw(2),
      height: isMobile ? 6 : rw(2),
      borderRadius: isMobile ? 3 : rb(4),
      backgroundColor: '#007AFF',
      marginLeft: isMobile ? 4 : rp(6),
    } as ViewStyle,
    
    conversationFooter: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    } as ViewStyle,
    
    lastMessage: {
      fontSize: Platform.OS === 'web' 
        ? (isMobile ? 12 : 13)
        : rf(13),
      color: '#666',
      flex: 1,
      marginRight: isMobile ? 6 : rp(8),
      minWidth: 0,
    } as TextStyle,
    
    unreadMessage: {
      fontWeight: '600',
      color: '#333',
    } as TextStyle,
    
    unreadBadge: {
      backgroundColor: '#8B2323',
      borderRadius: isMobile ? 8 : rb(10),
      minWidth: isMobile ? rw(4) : rw(5),
      height: isMobile ? rh(2) : rh(2.5),
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: isMobile ? 4 : rp(6),
      flexShrink: 0,
    } as ViewStyle,
    
    unreadText: {
      color: 'white',
      fontSize: Platform.OS === 'web' 
        ? (isMobile ? 10 : 12)
        : rf(12),
      fontWeight: '600',
    } as TextStyle,
    
    // Loading state styles
    loadingState: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingVertical: isMobile ? rh(5) : rh(7.5),
    } as ViewStyle,
    
    loadingText: {
      fontSize: Platform.OS === 'web' 
        ? (isMobile ? 14 : 16)
        : rf(16),
      color: '#666',
      textAlign: 'center',
    } as TextStyle,
    
    // Empty state styles
    emptyState: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingVertical: isMobile ? rh(5) : rh(7.5),
      paddingHorizontal: isMobile ? rp(16) : isTablet ? rp(24) : rp(32),
    } as ViewStyle,
    
    emptyStateIcon: {
      marginBottom: isMobile ? rp(12) : rp(16),
    } as ViewStyle,
    
    emptyStateText: {
      fontSize: Platform.OS === 'web' 
        ? (isMobile ? 16 : isTablet ? 17 : 18)
        : rf(18),
      fontWeight: '600',
      color: '#666',
      marginBottom: isMobile ? rp(6) : rp(8),
      textAlign: 'center',
    } as TextStyle,
    
    emptyStateSubtext: {
      fontSize: Platform.OS === 'web' 
        ? (isMobile ? 12 : 14)
        : rf(14),
      color: '#999',
      textAlign: 'center',
    } as TextStyle,

    testButton: {
      backgroundColor: '#8B2323',
      paddingHorizontal: isMobile ? rp(16) : rp(20),
      paddingVertical: isMobile ? rp(10) : rp(12),
      borderRadius: isMobile ? rb(6) : rb(8),
      marginTop: isMobile ? rp(16) : rp(20),
    } as ViewStyle,

    testButtonText: {
      color: 'white',
      fontSize: Platform.OS === 'web' 
        ? (isMobile ? 14 : 16)
        : rf(16),
      fontWeight: '600',
    } as TextStyle,
  });
};
