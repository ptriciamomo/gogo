import { useState, useEffect } from 'react';
import { Platform } from 'react-native';
import { supabase } from '../../lib/supabase';
import { SharedMessage } from '../../components/SharedMessagingService';

export interface ChatMessage extends SharedMessage {
  isTyping?: boolean;
}

interface UseChatMessagesProps {
  conversationId: string | string[] | undefined;
  user: any;
  otherUserId: string | string[] | undefined;
  scrollToBottom: () => void;
  router: any; // For navigation after conversation deletion
}

interface UseChatMessagesReturn {
  messages: ChatMessage[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  commissionId: string | null;
  setCommissionId: React.Dispatch<React.SetStateAction<string | null>>;
}

// Helper: guard against non-UUID invoice ids stored in message JSON (e.g. "INV-123")
export const isValidUuid = (value?: string) => {
  if (!value) return false;
  return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(value);
};

export const useChatMessages = ({
  conversationId,
  user,
  otherUserId,
  scrollToBottom,
  router,
}: UseChatMessagesProps): UseChatMessagesReturn => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [commissionId, setCommissionId] = useState<string | null>(null);

  const mapDbToChat = (m: any, invoice?: any): ChatMessage => {
    const isImage = m.message_type === 'image';
    const isFile = m.message_type === 'file';
    const isSystem = m.message_type === 'system';
    let invoiceData: ChatMessage['invoice'] | undefined;
    let text = m.message_text || '';

    // If invoice data is provided, use it
    if (invoice) {
      const normalizedStatus = invoice.status === 'rejected' ? 'declined' : (invoice.status || 'pending');
      invoiceData = {
        id: invoice.id,
        amount: parseFloat(invoice.amount),
        currency: invoice.currency || 'PHP',
        description: invoice.description || '',
        dueDate: invoice.due_date || '',
        status: normalizedStatus,
      };
      text = ''; // Clear text when invoice is present
    }

    return {
      id: m.id,
      text,
      isFromUser: isSystem ? false : m.sender_id === user?.id,
      attachment: (isImage || isFile) && m.file_url ? {
        type: isImage ? 'image' : 'document',
        uri: m.file_url,
        name: m.file_name || 'file',
        size: m.file_size || 0,
      } : undefined,
      invoice: invoiceData,
      timestamp: m.created_at ? new Date(m.created_at) : new Date(),
    };
  };

  // Load + realtime subscription to messages (only after user is known)
  useEffect(() => {
    const cid = (conversationId as string) || '';
    if (!cid || !user?.id) return;
    // initial load so messages persist after refresh
    (async () => {
      try {
        // Load messages
        const { data: messagesData, error: messagesError } = await supabase
          .from('messages')
          .select('*')
          .eq('conversation_id', cid)
          .order('created_at', { ascending: true });

        if (messagesError) {
          console.warn('Failed to load messages:', messagesError);
          return;
        }

        // Load invoices for this conversation
        const { data: invoicesData, error: invoicesError } = await supabase
          .from('invoices')
          .select('*')
          .eq('conversation_id', cid);

        if (invoicesError) {
          console.warn('Failed to load invoices:', invoicesError);
          return;
        }

        // Create a map of message_id to invoice
        const invoiceMap = new Map();
        invoicesData?.forEach(invoice => {
          if (invoice.message_id) {
            invoiceMap.set(invoice.message_id, invoice);
          }
        });

        // Map messages with their corresponding invoices
        const messagesWithInvoices = messagesData?.map(message => {
          const invoice = invoiceMap.get(message.id);
          return mapDbToChat(message, invoice);
        }) || [];

        setMessages(messagesWithInvoices);

        // Auto-scroll to bottom after messages are loaded (mobile only - web uses FlatList initialScrollIndex)
        if (Platform.OS !== 'web') {
          setTimeout(() => scrollToBottom(), 100);
        }

        // Check if there's an ACTIVE commission for this conversation
        // Find the active commission between the current user and the other user
        try {
          const { data: { user: currentUser } } = await supabase.auth.getUser();
          if (currentUser && otherUserId) {
            // Find active commission between these two users
            const { data: activeCommission } = await supabase
              .from('commission')
              .select('id, status, runner_id, buddycaller_id')
              .or(`and(buddycaller_id.eq.${currentUser.id},runner_id.eq.${otherUserId}),and(buddycaller_id.eq.${otherUserId},runner_id.eq.${currentUser.id})`)
              .in('status', ['accepted', 'in_progress'])
              .order('created_at', { ascending: false })
              .limit(1);
            
            if (activeCommission && activeCommission.length > 0) {
              setCommissionId(activeCommission[0].id.toString());
              console.log('Found active commission for conversation:', activeCommission[0].id);
            } else {
              console.log('No active commission found for this conversation');
              setCommissionId(null);
            }
          }
        } catch (commissionError) {
          console.warn('Failed to find active commission:', commissionError);
          setCommissionId(null);
        }
      } catch (e) {
        console.warn('Failed to load messages:', e);
      }
    })();
    const channel = supabase
      .channel('caller_messages')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${cid}` }, async (payload) => {
        const m: any = payload.new;
        // Check if this message has an invoice
        const { data: invoice } = await supabase
          .from('invoices')
          .select('*')
          .eq('message_id', m.id)
          .single();
        const mapped = mapDbToChat(m, invoice);
        const hasContent = !!(mapped.text || mapped.attachment || mapped.invoice);
        setMessages(prev => hasContent
          ? prev.map(x => x.id === m.id ? mapped : x)
          : prev.filter(x => x.id !== m.id)
        );
        
        // Note: Removed auto-scroll on message INSERT to allow free scrolling
        // Auto-scroll only happens on initial load and when user sends message
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages', filter: `conversation_id=eq.${cid}` }, async (payload) => {
        const m: any = payload.new;
        // Check if this message has an invoice
        const { data: invoice } = await supabase
          .from('invoices')
          .select('*')
          .eq('message_id', m.id)
          .single();
        const mapped = mapDbToChat(m, invoice);
        const hasContent = !!(mapped.text || mapped.attachment || mapped.invoice);
        setMessages(prev => hasContent
          ? prev.map(x => x.id === m.id ? mapped : x)
          : prev.filter(x => x.id !== m.id)
        );
        
        // Note: Removed auto-scroll on message UPDATE to allow free scrolling
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'invoices', filter: `conversation_id=eq.${cid}` }, async (payload) => {
        const invoice: any = payload.new;
        // Find the corresponding message and update it
        setMessages(prev => prev.map(msg => {
          if (msg.id === invoice.message_id) {
            return mapDbToChat({ ...msg, id: msg.id }, invoice);
          }
          return msg;
        }));
        
        // Note: Removed auto-scroll on invoice INSERT to allow free scrolling
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'invoices', filter: `conversation_id=eq.${cid}` }, async (payload) => {
        console.log('Received invoice UPDATE event:', payload);
        const invoice: any = payload.new;
        // Find the corresponding message and update it
        setMessages(prev => prev.map(msg => {
          if (msg.id === invoice.message_id) {
            console.log('Updating message with new invoice data:', invoice);
            return mapDbToChat({ ...msg, id: msg.id }, invoice);
          }
          return msg;
        }));
        
        // Note: Removed auto-scroll on invoice UPDATE to allow free scrolling
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'invoices', filter: `conversation_id=eq.${cid}` }, async (payload) => {
        const invoice: any = payload.old;
        // Find the corresponding message and remove invoice
        setMessages(prev => prev.map(msg => {
          if (msg.id === invoice.message_id) {
            return mapDbToChat({ ...msg, id: msg.id }, null);
          }
          return msg;
        }));
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages', filter: `conversation_id=eq.${cid}` }, (payload) => {
        const oldRow: any = payload.old;
        setMessages(prev => prev.filter(m => m.id !== oldRow.id));
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'conversations', filter: `id=eq.${cid}` }, () => {
        // Validate role before navigating after conversation deletion
        supabase.auth.getUser().then(({ data: userRes }) => {
          if (userRes?.user) {
            supabase.from("users").select("role").eq("id", userRes.user.id).single().then(({ data: profile }) => {
              const userRole = profile?.role?.toLowerCase();
              if (userRole === 'buddycaller') {
                router.replace('/buddycaller/messages_list');
              } else if (userRole === 'buddyrunner') {
                router.replace('/buddyrunner/home');
              } else {
                router.replace('/buddycaller/messages_list');
              }
            });
          } else {
            router.replace('/buddycaller/messages_list');
          }
        });
      })
      .subscribe();
    return () => { channel.unsubscribe(); };
  }, [conversationId, user?.id, otherUserId, scrollToBottom, router]);

  return {
    messages,
    setMessages,
    commissionId,
    setCommissionId,
  };
};

