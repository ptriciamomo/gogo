import React, { useState, useEffect } from 'react';
import {
  SafeAreaView,
  ScrollView,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Image,
  Alert,
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

export default function MessagesListScreen() {
  const router = useRouter();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [readConversations, setReadConversations] = useState<Map<string, string>>(new Map());
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [allowReadMarking, setAllowReadMarking] = useState(false);
  const [timeoutId, setTimeoutId] = useState<number | null>(null);

  // Load read conversations from AsyncStorage
  const loadReadConversations = async () => {
    try {
      const stored = await AsyncStorage.getItem('readConversations');
      if (stored) {
        const parsed = JSON.parse(stored);
        const readMap = new Map(Object.entries(parsed)) as Map<string, string>;
        setReadConversations(readMap);
      } else {
        // If no stored data, start with empty map
        setReadConversations(new Map());
      }
    } catch (error) {
      console.error('Error loading read conversations:', error);
      setReadConversations(new Map());
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

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [timeoutId]);


  // Get current user
  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
      // Load role
      if (user?.id) {
        const { data: profile } = await supabase
          .from('users')
          .select('role')
          .eq('id', user.id)
          .single();
        setUserRole(profile?.role || null);
      }
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
        setIsInitialLoad(false);
        // Allow read marking after initial load is complete and user has had time to see the screen
        const id = setTimeout(() => {
          setAllowReadMarking(true);
        }, 1000); // Wait 1 second after loading completes
        setTimeoutId(id);
      }
    };

    loadConversations();
  }, [user, readConversations]);

  const handleConversationPress = async (conversation: Conversation) => {
    // Only mark as read if we're not in initial load AND read marking is allowed
    if (!isInitialLoad && allowReadMarking) {
      // Mark conversation as read when opened
      const newReadMap = new Map(readConversations);
      newReadMap.set(conversation.id, new Date().toISOString());
      setReadConversations(newReadMap);
      await saveReadConversations(newReadMap);
    }

    // Ensure we know the current user's role BEFORE navigating
    let role = userRole;
    if (!role && user?.id) {
      const { data: profile } = await supabase
        .from('users')
        .select('role')
        .eq('id', user.id)
        .single();
      role = profile?.role || null;
      setUserRole(role);
    }

    const isRunner = role === 'buddyrunner';
    const pathname = isRunner ? '/buddyrunner/ChatScreenRunner' : '/buddycaller/ChatScreenCaller';
    router.push({
      pathname,
      params: {
        conversationId: conversation.id,
        otherUserId: conversation.otherUserId,
        contactName: conversation.name,
        contactInitials: conversation.initials,
        isOnline: conversation.isOnline.toString(),
      }
    });
  };

  const handleStartNewConversation = () => {
    // Navigate to start conversation screen
    router.push('/buddycaller/start_conversation');
  };

  const renderConversationItem = (conversation: Conversation) => {
    // Create style array for conversation name
    const nameStyle = [
      styles.conversationName,
      conversation.hasUnread && styles.unreadName
    ];
    
    return (
      <TouchableOpacity
        key={conversation.id}
        style={styles.conversationItem}
        onPress={() => handleConversationPress(conversation)}
        activeOpacity={0.7}
      >
      <View style={styles.avatarContainer}>
        <View style={[
          styles.avatar,
          conversation.isOnline && styles.avatarOnline
        ]}>
          {conversation.avatar ? (
            <Image 
              source={{ uri: conversation.avatar }} 
              style={styles.profileImage}
              resizeMode="cover"
            />
          ) : (
            <Text style={styles.avatarText}>{conversation.initials}</Text>
          )}
        </View>
        {conversation.isOnline && <View style={styles.onlineIndicator} />}
      </View>
      
      <View style={styles.conversationContent}>
        <View style={styles.conversationHeader}>
          <Text style={nameStyle}>
            {conversation.name}
          </Text>
          <View style={styles.timestampContainer}>
            <Text style={styles.timestamp}>{conversation.timestamp}</Text>
            {conversation.hasUnread && <View style={styles.unreadDot} />}
          </View>
        </View>
        
        <View style={styles.conversationFooter}>
          <Text 
            style={[
              styles.lastMessage,
              conversation.unreadCount > 0 && styles.unreadMessage
            ]}
            numberOfLines={1}
          >
            {conversation.lastMessage}
          </Text>
          {conversation.unreadCount > 0 && (
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadText}>
                {conversation.unreadCount > 99 ? '99+' : conversation.unreadCount}
              </Text>
            </View>
          )}
        </View>
      </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <TouchableOpacity 
            onPress={() => router.replace('/buddycaller/home')} 
            style={styles.backButton}
          >
            <Ionicons name="arrow-back" size={24} color="#333" />
          </TouchableOpacity>
          
          <Text style={styles.headerTitle}>Messages</Text>
          
          <View style={styles.headerActions}>
            <TouchableOpacity style={styles.searchButton}>
              <Ionicons name="search" size={24} color="#333" />
            </TouchableOpacity>
            <TouchableOpacity 
              style={styles.newChatButton}
              onPress={handleStartNewConversation}
            >
              <Ionicons name="add" size={24} color="#333" />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Messages List */}
      <ScrollView style={styles.messagesList} showsVerticalScrollIndicator={false}>
        {loading ? (
          <View style={styles.loadingState}>
            <Text style={styles.loadingText}>Loading conversations...</Text>
          </View>
        ) : conversations.length === 0 ? (
          <View style={styles.emptyState}>
            <View style={styles.emptyStateIcon}>
              <Ionicons name="chatbubbles-outline" size={64} color="#ccc" />
            </View>
            <Text style={styles.emptyStateText}>No conversations yet</Text>
            <Text style={styles.emptyStateSubtext}>Start chatting with your runners</Text>
            <TouchableOpacity 
              style={styles.testButton}
              onPress={handleStartNewConversation}
            >
              <Text style={styles.testButtonText}>Start New Conversation</Text>
            </TouchableOpacity>
          </View>
        ) : (
          conversations.map(renderConversationItem)
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  
  // Header styles
  header: {
    backgroundColor: '#FFFFFF',
    paddingTop: rp(8),
    paddingBottom: rp(8),
    paddingHorizontal: rp(12),
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5E5',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
    alignSelf: 'center',
    width: '100%',
    maxWidth: 960,
  },
  
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  
  backButton: {
    padding: rp(8),
    marginRight: rp(8),
  },
  
  headerTitle: {
    fontSize: rf(16),
    fontWeight: '600',
    color: '#333',
    flex: 1,
    textAlign: 'center',
  },
  
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  
  searchButton: {
    padding: rp(8),
    marginRight: rp(4),
  },
  
  newChatButton: {
    padding: rp(8),
    marginLeft: rp(4),
  },
  
  // Messages list styles
  messagesList: {
    flex: 1,
    alignSelf: 'center',
    width: '100%',
    maxWidth: 960,
  },
  
  // Conversation item styles
  conversationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: rp(12),
    paddingVertical: rp(10),
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  
  avatarContainer: {
    position: 'relative',
    marginRight: rp(12),
  },
  
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#8B2323',
    justifyContent: 'center',
    alignItems: 'center',
  },
  
  avatarOnline: {
    borderWidth: 2,
    borderColor: '#4CAF50',
  },
  
  avatarText: {
    color: 'white',
    fontSize: rf(16),
    fontWeight: '600',
  },
  
  profileImage: {
    width: '100%',
    height: '100%',
    borderRadius: 28,
  },
  
  onlineIndicator: {
    position: 'absolute',
    bottom: rp(2),
    right: rp(2),
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#4CAF50',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  
  conversationContent: {
    flex: 1,
  },
  
  conversationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: rp(4),
  },
  
  conversationName: {
    fontSize: rf(15),
    fontWeight: '600',
    color: '#333',
    flex: 1,
  },
  
  timestamp: {
    fontSize: rf(11),
    color: '#999',
  },
  
  timestampContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: rp(8),
  },
  
  unreadName: {
    fontWeight: '900',
    color: '#000',
    fontSize: rf(16),
  },
  
  unreadDot: {
    width: rw(2),
    height: rw(2),
    borderRadius: rb(4),
    backgroundColor: '#007AFF',
    marginLeft: rp(6),
  },
  
  conversationFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  
  lastMessage: {
    fontSize: rf(13),
    color: '#666',
    flex: 1,
    marginRight: rp(8),
  },
  
  unreadMessage: {
    fontWeight: '600',
    color: '#333',
  },
  
  unreadBadge: {
    backgroundColor: '#8B2323',
    borderRadius: rb(10),
    minWidth: rw(5),
    height: rh(2.5),
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: rp(6),
  },
  
  unreadText: {
    color: 'white',
    fontSize: rf(12),
    fontWeight: '600',
  },
  
  // Loading state styles
  loadingState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: rh(7.5),
  },
  
  loadingText: {
    fontSize: rf(16),
    color: '#666',
    textAlign: 'center',
  },
  
  // Empty state styles
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: rh(7.5),
    paddingHorizontal: rp(32),
  },
  
  emptyStateIcon: {
    marginBottom: rp(16),
  },
  
  emptyStateText: {
    fontSize: rf(18),
    fontWeight: '600',
    color: '#666',
    marginBottom: rp(8),
    textAlign: 'center',
  },
  
  emptyStateSubtext: {
    fontSize: rf(14),
    color: '#999',
    textAlign: 'center',
  },

  testButton: {
    backgroundColor: '#8B2323',
    paddingHorizontal: rp(20),
    paddingVertical: rp(12),
    borderRadius: rb(8),
    marginTop: rp(20),
  },

  testButtonText: {
    color: 'white',
    fontSize: rf(16),
    fontWeight: '600',
  },
});
