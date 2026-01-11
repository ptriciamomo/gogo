// app/buddycaller/conversations.tsx
import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    FlatList,
    TouchableOpacity,
    StyleSheet,
    SafeAreaView,
    Alert,
    RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';

const MAROON = '#8B0000';

interface Conversation {
    id: string;
    user1_id: string;
    user2_id: string;
    last_message_at: string;
    other_user: {
        id: string;
        first_name: string;
        last_name: string;
        profile_picture_url?: string;
    };
    last_message?: {
        message_text: string;
        sender_id: string;
        created_at: string;
    };
}

export default function ConversationsScreen() {
    const router = useRouter();
    const [user, setUser] = useState<any>(null);
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    // Get current user
    useEffect(() => {
        const getUser = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            setUser(user);
        };
        getUser();
    }, []);

    useEffect(() => {
        if (user) {
            loadConversations();
        }
    }, [user]);

    // Set up real-time subscription for conversation updates
    useEffect(() => {
        if (!user) return;

        const subscription = supabase
            .channel('conversations')
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'conversations',
                    filter: `user1_id=eq.${user.id}`,
                },
                () => {
                    loadConversations();
                }
            )
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'conversations',
                    filter: `user2_id=eq.${user.id}`,
                },
                () => {
                    loadConversations();
                }
            )
            .subscribe();

        return () => {
            subscription.unsubscribe();
        };
    }, [user]);

    const loadConversations = async () => {
        if (!user) return;

        try {
            const { data, error } = await supabase
                .from('conversations')
                .select(`
                    id,
                    user1_id,
                    user2_id,
                    last_message_at,
                    other_user:users!conversations_user2_id_fkey(
                        id,
                        first_name,
                        last_name,
                        profile_picture_url
                    ),
                    last_message:messages(
                        message_text,
                        sender_id,
                        created_at
                    )
                `)
                .or(`user1_id.eq.${user.id},user2_id.eq.${user.id}`)
                .order('last_message_at', { ascending: false });

            if (error) throw error;

            // Process the data to get the correct other user
            const processedConversations = data?.map(conv => {
                const isUser1 = conv.user1_id === user.id;
                return {
                    ...conv,
                    other_user: isUser1 ? conv.other_user : conv.user1_id,
                    last_message: conv.last_message?.[0] // Get the first (most recent) message
                };
            }) || [];

            setConversations(processedConversations);
        } catch (error) {
            console.error('Error loading conversations:', error);
            Alert.alert('Error', 'Failed to load conversations');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    const onRefresh = () => {
        setRefreshing(true);
        loadConversations();
    };

    const startConversation = async (otherUserId: string) => {
        if (!user) return;

        try {
            const { data, error } = await supabase
                .rpc('get_or_create_conversation', {
                    p_user1_id: user.id,
                    p_user2_id: otherUserId
                });

            if (error) throw error;

            // Navigate to messages screen
            router.push({
                pathname: '/buddycaller/messages',
                params: {
                    conversationId: data,
                    otherUserId: otherUserId,
                    otherUserName: 'User' // You might want to fetch the actual name
                }
            });
        } catch (error) {
            console.error('Error starting conversation:', error);
            Alert.alert('Error', 'Failed to start conversation');
        }
    };

    const renderConversation = ({ item }: { item: Conversation }) => {
        const lastMessage = item.last_message;
        const isMyMessage = lastMessage?.sender_id === user?.id;
        
        return (
            <TouchableOpacity
                style={styles.conversationItem}
                onPress={() => startConversation(item.other_user.id)}
            >
                <View style={styles.avatarContainer}>
                    <View style={styles.avatar}>
                        <Text style={styles.avatarText}>
                            {item.other_user.first_name?.[0] || 'U'}
                        </Text>
                    </View>
                </View>
                
                <View style={styles.conversationContent}>
                    <View style={styles.conversationHeader}>
                        <Text style={styles.userName}>
                            {item.other_user.first_name} {item.other_user.last_name}
                        </Text>
                        <Text style={styles.messageTime}>
                            {lastMessage ? new Date(lastMessage.created_at).toLocaleDateString() : ''}
                        </Text>
                    </View>
                    
                    <Text style={styles.lastMessage} numberOfLines={1}>
                        {lastMessage ? (
                            isMyMessage ? `You: ${lastMessage.message_text}` : lastMessage.message_text
                        ) : 'No messages yet'}
                    </Text>
                </View>
                
                <Ionicons name="chevron-forward" size={20} color="#ccc" />
            </TouchableOpacity>
        );
    };

    if (loading) {
        return (
            <SafeAreaView style={styles.container}>
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => router.back()}>
                        <Ionicons name="arrow-back" size={24} color={MAROON} />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>Messages</Text>
                </View>
                <View style={styles.loadingContainer}>
                    <Text>Loading conversations...</Text>
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()}>
                    <Ionicons name="arrow-back" size={24} color={MAROON} />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Messages</Text>
                <TouchableOpacity>
                    <Ionicons name="add" size={24} color={MAROON} />
                </TouchableOpacity>
            </View>

            <FlatList
                data={conversations}
                renderItem={renderConversation}
                keyExtractor={(item) => item.id}
                style={styles.conversationsList}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={onRefresh}
                        colors={[MAROON]}
                    />
                }
                ListEmptyComponent={
                    <View style={styles.emptyContainer}>
                        <Ionicons name="chatbubbles-outline" size={64} color="#ccc" />
                        <Text style={styles.emptyText}>No conversations yet</Text>
                        <Text style={styles.emptySubtext}>Start a conversation with someone!</Text>
                    </View>
                }
            />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#fff',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#e0e0e0',
    },
    headerTitle: {
        flex: 1,
        fontSize: 18,
        fontWeight: '600',
        color: MAROON,
        textAlign: 'center',
    },
    loadingContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    conversationsList: {
        flex: 1,
    },
    conversationItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#f0f0f0',
    },
    avatarContainer: {
        marginRight: 12,
    },
    avatar: {
        width: 50,
        height: 50,
        borderRadius: 25,
        backgroundColor: MAROON,
        alignItems: 'center',
        justifyContent: 'center',
    },
    avatarText: {
        color: '#fff',
        fontSize: 18,
        fontWeight: '600',
    },
    conversationContent: {
        flex: 1,
    },
    conversationHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 4,
    },
    userName: {
        fontSize: 16,
        fontWeight: '600',
        color: '#000',
    },
    messageTime: {
        fontSize: 12,
        color: '#666',
    },
    lastMessage: {
        fontSize: 14,
        color: '#666',
    },
    emptyContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 64,
    },
    emptyText: {
        fontSize: 18,
        fontWeight: '600',
        color: '#666',
        marginTop: 16,
    },
    emptySubtext: {
        fontSize: 14,
        color: '#999',
        marginTop: 8,
    },
});
