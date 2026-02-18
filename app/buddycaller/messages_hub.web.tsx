import React, { useState, useEffect } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import MessagesList from './messages_list.web';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore explicit extension import to reuse existing chat screen
import ChatScreenCaller from './ChatScreenCaller.web.tsx';
import { supabase } from '../../lib/supabase';
import { Ionicons } from '@expo/vector-icons';

export default function BuddyCallerMessagesHubWeb() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const [windowWidth, setWindowWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1200);

  // Track window dimensions for responsive behavior
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleResize = () => {
      setWindowWidth(window.innerWidth);
    };

    window.addEventListener('resize', handleResize);
    handleResize(); // Initial call

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  // Determine if we're in mobile view (screen width < 768px)
  const isMobile = windowWidth < 768;
  const hasConversation = !!params?.conversationId;

  // Handler to go back to messages list on mobile
  const handleBackToList = () => {
    router.replace({
      pathname: '/buddycaller/messages_hub',
      params: {},
    });
  };

  React.useEffect(() => {
    // If no conversation selected, auto-open the most recent one
    const ensureConversation = async () => {
      // On mobile, don't auto-select conversation - let user choose from list
      if (isMobile && !params?.conversationId) {
        console.log('MessagesHub: Mobile view - showing list, not auto-selecting conversation');
        return;
      }

      if (params?.conversationId) return;
      const { data: userRes } = await supabase.auth.getUser();
      const me = userRes?.user;
      if (!me) return;
      const { data: convs } = await supabase
        .from('conversations')
        .select(`
          id,
          user1_id,
          user2_id,
          last_message_at,
          user1:users!conversations_user1_id_fkey(id, first_name, last_name, profile_picture_url),
          user2:users!conversations_user2_id_fkey(id, first_name, last_name, profile_picture_url)
        `)
        .or(`user1_id.eq.${me.id},user2_id.eq.${me.id}`)
        .order('last_message_at', { ascending: false })
        .limit(50);
      const first = convs?.[0];
      if (!first) return;
      // Try to find the most recent conversation based on latest message timestamp
      const convIds = (convs || []).map((c: any) => c.id);
      let latestConv = first;
      if (convIds.length > 0) {
        const { data: latestMsgs } = await supabase
          .from('messages')
          .select('conversation_id, created_at')
          .in('conversation_id', convIds)
          .order('created_at', { ascending: false })
          .limit(1);
        const top = latestMsgs?.[0];
        if (top) {
          const match = (convs || []).find((c: any) => c.id === top.conversation_id);
          if (match) latestConv = match;
        }
      }
      const isUser1 = latestConv.user1_id === me.id;
      const other: any = isUser1 ? (Array.isArray(latestConv.user2) ? null : latestConv.user2) : (Array.isArray(latestConv.user1) ? null : latestConv.user1);
      const otherName = other ? `${(other.first_name || '')} ${(other.last_name || '')}`.trim() : 'Contact';
      const initials = `${(other?.first_name?.[0] || 'U')}${(other?.last_name?.[0] || '')}`;
      router.replace({
        pathname: '/buddycaller/messages_hub',
        params: {
          conversationId: latestConv.id,
          otherUserId: other?.id || '',
          contactName: otherName,
          contactInitials: initials,
          isOnline: 'false',
        },
      });
    };
    ensureConversation();
  }, [isMobile, params?.conversationId]); // Include isMobile and conversationId to handle responsive behavior

  // Mobile view: Show only list or only chat
  if (isMobile) {
    if (hasConversation) {
      // Show only chat, no top mobile header
      return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100%', boxSizing: 'border-box' }}>
          {/* Chat view (no top header) */}
          <div style={{ 
            display: 'flex', 
            flex: 1, 
            minHeight: 0, 
            minWidth: 0, 
            background: '#fff', 
            boxSizing: 'border-box', 
            overflow: 'hidden' 
          }}>
            <div style={{ flex: 1, height: '100%', overflowY: 'auto', scrollbarGutter: 'stable both-edges' as any }}>
              <ChatScreenCaller />
            </div>
          </div>
        </div>
      );
    } else {
      // Show only messages list
      return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100%', boxSizing: 'border-box' }}>
          <div style={{ 
            flex: 1,
            overflowY: 'auto', 
            overflowX: 'hidden',
            boxSizing: 'border-box',
            backgroundColor: '#f0f0f0',
            width: '100%'
          }}>
            <MessagesList />
          </div>
        </div>
      );
    }
  }

  // Desktop view: Show both side by side
  return (
    <div style={{ display: 'flex', height: '100vh', maxWidth: 1200, margin: '0 auto', width: '100%', gap: 8, padding: 8, boxSizing: 'border-box' }}>
      <div style={{ 
        width: 'clamp(280px, 30vw, 420px)', 
        minWidth: 280,
        maxWidth: 420,
        borderRight: '1px solid #E5E5E5', 
        overflowY: 'auto', 
        overflowX: 'hidden',
        paddingRight: 4, 
        boxSizing: 'border-box',
        backgroundColor: '#f0f0f0',
        flexShrink: 0
      }}>
        <MessagesList />
      </div>
      <div style={{ display: 'flex', flex: 1, minHeight: 0, minWidth: 0, background: '#fff', paddingLeft: 0, boxSizing: 'border-box', height: '100vh', overflow: 'hidden' }}>
        <div style={{ flex: 1, height: '100%', overflowY: 'auto', scrollbarGutter: 'stable both-edges' as any }}>
          <ChatScreenCaller />
        </div>
      </div>
    </div>
  );
}


