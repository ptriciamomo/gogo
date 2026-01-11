import { Alert } from 'react-native';
import { supabase } from '../../lib/supabase';

interface UseConversationManagementProps {
  conversationId: string | string[] | undefined;
  otherUserId: string | string[] | undefined;
  contactProfile: any;
  contact: { name: string };
  router: any;
}

interface UseConversationManagementReturn {
  handleDeleteConversation: () => void;
  handleNavigateToProfile: () => void;
}

export const useConversationManagement = ({
  conversationId,
  otherUserId,
  contactProfile,
  contact,
  router,
}: UseConversationManagementProps): UseConversationManagementReturn => {
  // Function to navigate to contact's profile
  const handleNavigateToProfile = () => {
    console.log('=== NAVIGATION DEBUG ===');
    console.log('Navigating to profile with params:', {
      userId: otherUserId,
      userName: contactProfile ? `${contactProfile.first_name} ${contactProfile.last_name}` : contact.name,
      isViewingOtherUser: 'true',
      returnTo: 'ChatScreenCaller',
      conversationId: conversationId,
    });
    console.log('otherUserId:', otherUserId);
    console.log('contactProfile:', contactProfile);
    console.log('conversationId:', conversationId);

    // Navigate to the contact's profile screen (runner's profile when caller is viewing)
    try {
      // Navigate to BuddyRunner's profile since we're viewing a BuddyRunner
      router.replace({
        pathname: '/buddyrunner/profile',
        params: {
          userId: otherUserId, // The other user's ID (runner)
          userName: contactProfile ? `${contactProfile.first_name} ${contactProfile.last_name}` : contact.name,
          isViewingOtherUser: 'true', // Flag to indicate we're viewing someone else's profile
          returnTo: 'ChatScreenCaller', // Flag to indicate where to return
          conversationId: conversationId,
        }
      });
      console.log('Navigation to BuddyRunner profile successful');
    } catch (error) {
      console.error('Navigation error:', error);
      // Fallback to push if replace fails
      try {
        router.push({
          pathname: '/buddyrunner/profile',
          params: {
            userId: otherUserId,
            userName: contactProfile ? `${contactProfile.first_name} ${contactProfile.last_name}` : contact.name,
            isViewingOtherUser: 'true',
            returnTo: 'ChatScreenCaller',
            conversationId: conversationId,
          }
        });
        console.log('Fallback navigation to BuddyRunner profile successful');
      } catch (fallbackError) {
        console.error('Fallback navigation error:', fallbackError);
      }
    }
    console.log('Navigation command sent');
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
              await supabase.from('invoices').delete().eq('conversation_id', cid);
              await supabase.from('messages').delete().eq('conversation_id', cid);
              await supabase.from('conversations').delete().eq('id', cid);
              router.replace('/buddycaller/messages_list');
            } catch (e) {
              console.warn('Failed to delete conversation:', e);
            }
          }
        }
      ]
    );
  };

  return {
    handleDeleteConversation,
    handleNavigateToProfile,
  };
};

