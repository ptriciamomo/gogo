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
  ActivityIndicator,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';

interface User {
  id: string;
  first_name: string;
  last_name: string;
  role: string;
  profile_picture_url?: string;
}

export default function StartConversationScreen() {
  const router = useRouter();
  const [users, setUsers] = useState<User[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [creatingConversation, setCreatingConversation] = useState<string | null>(null);

  // Get current user
  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setCurrentUser(user);
    };
    getUser();
  }, []);

  // Load users from database
  useEffect(() => {
    if (!currentUser) return;

    const loadUsers = async () => {
      setLoading(true);
      try {
        console.log('Loading users for current user:', currentUser.id);
        
        // Get all users except the current user
        const { data, error } = await supabase
          .from('users')
          .select('id, first_name, last_name, role, profile_picture_url')
          .neq('id', currentUser.id)
          .order('first_name', { ascending: true });

        if (error) {
          console.error('Database error:', error);
          throw error;
        }

        console.log('Loaded users:', data);
        setUsers(data || []);
        setFilteredUsers(data || []);
      } catch (error) {
        console.error('Error loading users:', error);
        Alert.alert('Error', `Failed to load users: ${error instanceof Error ? error.message : 'Unknown error'}`);
      } finally {
        setLoading(false);
      }
    };

    loadUsers();
  }, [currentUser]);

  // Filter users based on search query
  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredUsers(users);
      return;
    }

    const filtered = users.filter(user => {
      const fullName = `${user.first_name} ${user.last_name}`.toLowerCase();
      const query = searchQuery.toLowerCase();
      return fullName.includes(query) || user.role.toLowerCase().includes(query);
    });

    setFilteredUsers(filtered);
  }, [searchQuery, users]);

  const createTestUser = async () => {
    try {
      const { data, error } = await supabase
        .from('users')
        .insert({
          first_name: 'Test',
          last_name: 'User',
          role: 'buddycaller'
        })
        .select()
        .single();

      if (error) throw error;

      Alert.alert('Success', 'Test user created! Refresh to see them.');
      // Reload users
      const { data: allUsers, error: loadError } = await supabase
        .from('users')
        .select('id, first_name, last_name, role')
        .neq('id', currentUser.id)
        .order('first_name', { ascending: true });

      if (!loadError) {
        setUsers(allUsers || []);
        setFilteredUsers(allUsers || []);
      }
    } catch (error) {
      console.error('Error creating test user:', error);
      Alert.alert('Error', 'Failed to create test user');
    }
  };

  const startConversation = async (otherUserId: string) => {
    if (!currentUser) return;

    setCreatingConversation(otherUserId);
    try {
      // Use the RPC function to get or create conversation
      const { data, error } = await supabase
        .rpc('get_or_create_conversation', {
          p_user1_id: currentUser.id,
          p_user2_id: otherUserId
        });

      if (error) throw error;

      // Navigate to ChatScreenRunner with proper params
      const selected = users.find(u => u.id === otherUserId);
      const contactName = `${selected?.first_name || ''} ${selected?.last_name || ''}`.trim();
      const contactInitials = `${selected?.first_name?.[0] || ''}${selected?.last_name?.[0] || ''}`.toUpperCase();

      router.push({
        pathname: '/buddyrunner/ChatScreenRunner',
        params: {
          conversationId: data,
          otherUserId,
          contactName,
          contactInitials,
        }
      });
    } catch (error) {
      console.error('Error starting conversation:', error);
      Alert.alert('Error', 'Failed to start conversation');
    } finally {
      setCreatingConversation(null);
    }
  };

  // Helper function to get user initials
  const getUserInitials = (user: User) => {
    const firstName = user.first_name || '';
    const lastName = user.last_name || '';
    if (firstName && lastName) {
      return (firstName[0] + lastName[0]).toUpperCase();
    } else if (firstName) {
      return firstName[0].toUpperCase();
    }
    return 'U';
  };

  const renderUser = (user: User) => (
    <TouchableOpacity
      key={user.id}
      style={styles.userItem}
      onPress={() => startConversation(user.id)}
      disabled={creatingConversation === user.id}
    >
      <View style={styles.avatarContainer}>
        <View style={styles.avatar}>
          {user.profile_picture_url ? (
            <Image 
              source={{ uri: user.profile_picture_url }} 
              style={styles.profileImage}
              resizeMode="cover"
            />
          ) : (
            <Text style={styles.avatarText}>
              {getUserInitials(user)}
            </Text>
          )}
        </View>
      </View>
      
      <View style={styles.userInfo}>
        <Text style={styles.userName}>
          {user.first_name} {user.last_name}
        </Text>
        <Text style={styles.userRole}>
          {user.role === 'buddyrunner' ? 'BuddyRunner' : 
           user.role === 'buddycaller' ? 'BuddyCaller' : user.role}
        </Text>
      </View>
      
      <View style={styles.actionContainer}>
        {creatingConversation === user.id ? (
          <ActivityIndicator size="small" color="#8B0000" />
        ) : (
          <Ionicons name="chatbubble-outline" size={24} color="#8B0000" />
        )}
      </View>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color="#333" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Start Conversation</Text>
          <View style={styles.placeholder} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#8B0000" />
          <Text style={styles.loadingText}>Loading users...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Start Conversation</Text>
        <View style={styles.placeholder} />
      </View>

      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color="#666" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search users..."
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholderTextColor="#999"
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Ionicons name="close-circle" size={20} color="#666" />
          </TouchableOpacity>
        )}
      </View>

      <ScrollView style={styles.usersList}>
        {filteredUsers.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="people-outline" size={64} color="#ccc" />
            <Text style={styles.emptyText}>
              {searchQuery ? 'No users found' : 'No users available'}
            </Text>
            <Text style={styles.emptySubtext}>
              {searchQuery ? 'Try a different search term' : 'No other users have registered yet'}
            </Text>
            {!searchQuery && (
              <TouchableOpacity 
                style={styles.testButton}
                onPress={createTestUser}
              >
                <Text style={styles.testButtonText}>Create Test User</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          filteredUsers.map(renderUser)
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5E5',
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    textAlign: 'center',
  },
  placeholder: {
    width: 24,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginVertical: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E5E5E5',
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#333',
  },
  usersList: {
    flex: 1,
  },
  userItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  avatarContainer: {
    marginRight: 12,
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#8B0000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  profileImage: {
    width: '100%',
    height: '100%',
    borderRadius: 25,
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 2,
  },
  userRole: {
    fontSize: 14,
    color: '#666',
  },
  actionContainer: {
    padding: 8,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#666',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: 32,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#666',
    marginTop: 16,
    textAlign: 'center',
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999',
    marginTop: 8,
    textAlign: 'center',
  },
  testButton: {
    backgroundColor: '#8B0000',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    marginTop: 20,
  },
  testButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
});
