import { useState, useEffect } from 'react';
import { Platform } from 'react-native';
import { supabase } from '../../lib/supabase';
import { SharedMessage } from '../../components/SharedMessagingService';

export interface ChatMessage extends SharedMessage {
  isTyping?: boolean;
}

interface UseChatMessagesRunnerProps {
  conversationId: string | string[] | undefined;
  user: any;
  otherUserId: string | string[] | undefined;
  commissionId: string | string[] | undefined;
  scrollToBottom: () => void;
  router: any;
  contactProfile: any;
  setInvoiceExists: (exists: boolean) => void;
  checkInvoiceExists: () => Promise<boolean>;
  showInvoiceAcceptedModal: (callerName: string, onOk: () => void) => void;
  setInvoiceAcceptedOpen: (open: boolean) => void;
}

interface UseChatMessagesRunnerReturn {
  messages: ChatMessage[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  currentUserProfile: any;
  setCurrentUserProfile: React.Dispatch<React.SetStateAction<any>>;
  contactProfile: any;
  setContactProfile: React.Dispatch<React.SetStateAction<any>>;
  mapDbToChat: (m: any, invoice?: any) => ChatMessage;
}

export const useChatMessagesRunner = ({
  conversationId,
  user,
  otherUserId,
  commissionId,
  scrollToBottom,
  router,
  contactProfile: initialContactProfile,
  setInvoiceExists,
  checkInvoiceExists,
  showInvoiceAcceptedModal,
  setInvoiceAcceptedOpen,
}: UseChatMessagesRunnerProps): UseChatMessagesRunnerReturn => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [currentUserProfile, setCurrentUserProfile] = useState<any>(null);
  const [contactProfile, setContactProfile] = useState<any>(initialContactProfile);

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

  // Load current auth user and profile data
  useEffect(() => {
    const getUser = async () => {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) return;

      // Fetch current user's profile data
      const { data: userProfile, error: userError } = await supabase
        .from('users')
        .select('*')
        .eq('id', authUser.id)
        .single();

      if (!userError && userProfile) {
        setCurrentUserProfile(userProfile);
      }

      // Fetch contact's profile data from conversation
      if (otherUserId) {
        const { data: contactData, error: contactError } = await supabase
          .from('users')
          .select('*')
          .eq('id', otherUserId)
          .single();

        if (!contactError && contactData) {
          setContactProfile(contactData);
        }
      }
    };
    getUser();
  }, [otherUserId]);

  // Load + subscribe to messages for this conversation (only after user is known)
  useEffect(() => {
    const cid = (conversationId as string) || '';
    
    if (!cid || !user?.id) {
      return;
    }
    // initial load from DB so messages persist after refresh
    (async () => {
      try {
        // Load messages
        const { data: messagesData, error: messagesError } = await supabase
          .from('messages')
          .select('*')
          .eq('conversation_id', cid)
          .order('created_at', { ascending: true });

        if (messagesError) {
          if (__DEV__) console.warn('Failed to load messages:', messagesError);
          return;
        }

        // Load invoices for this conversation
        const { data: invoicesData, error: invoicesError } = await supabase
          .from('invoices')
          .select('*')
          .eq('conversation_id', cid);

        if (invoicesError) {
          if (__DEV__) console.warn('Failed to load invoices:', invoicesError);
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

        // Check if invoice already exists for this commission
        const hasInvoice = await checkInvoiceExists();
        setInvoiceExists(hasInvoice);
      } catch (e) {
        if (__DEV__) console.warn('Failed to load messages:', e);
      }
    })();

    const channel = supabase
      .channel('runner_messages')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${cid}` }, async (payload) => {
        const m: any = payload.new;
        
        // Check if this message has an invoice
        const { data: invoice } = await supabase
          .from('invoices')
          .select('*')
          .eq('message_id', m.id)
          .single();
        
        const newMessage = mapDbToChat(m, invoice);
        setMessages(prev => [...prev, newMessage]);
        
        // Check if this is an invoice acceptance message
        const isInvoiceAccepted = m.message_text === 'Invoice accepted by caller';
        
        if (isInvoiceAccepted) {
          // Get caller name for the modal
          let callerDisplayName = 'The caller';
          const profileToUse = contactProfile || initialContactProfile;
          if (profileToUse) {
            callerDisplayName = `${profileToUse.first_name || ''} ${profileToUse.last_name || ''}`.trim() || 'The caller';
          }
          
          // Show modal using the same pattern as Accepted Successfully modal
          const handleModalOk = () => {
            setInvoiceAcceptedOpen(false);
            
            // Navigate to Task Progress page (platform-specific)
            if (commissionId) {
              const taskProgressPath = Platform.OS === 'web' 
                ? '/buddyrunner/task_progress_web' 
                : '/buddyrunner/task_progress';
              
              router.push({
                pathname: taskProgressPath,
                params: {
                  id: commissionId
                }
              });
            }
          };
          
          showInvoiceAcceptedModal(callerDisplayName, handleModalOk);
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages', filter: `conversation_id=eq.${cid}` }, async (payload) => {
        const m: any = payload.new;
        // Check if this message has an invoice
        const { data: invoice } = await supabase
          .from('invoices')
          .select('*')
          .eq('message_id', m.id)
          .single();
        setMessages(prev => prev.map(x => x.id === m.id ? mapDbToChat(m, invoice) : x));
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
        // Update invoice existence state
        setInvoiceExists(true);
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'invoices', filter: `conversation_id=eq.${cid}` }, async (payload) => {
        const invoice: any = payload.new;
        // Find the corresponding message and update it
        setMessages(prev => prev.map(msg => {
          if (msg.id === invoice.message_id) {
            return mapDbToChat({ ...msg, id: msg.id }, invoice);
          }
          return msg;
        }));
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
        // Update invoice existence state
        setInvoiceExists(false);
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'conversations', filter: `id=eq.${cid}` }, () => {
        // Conversation deleted by the other user or self – navigate back
        router.replace('/buddyrunner/messages_list');
      })
      .subscribe((status) => {
        console.log('ChatScreenRunner: 📡 SUBSCRIPTION STATUS UPDATE:', status);
        if (status === 'SUBSCRIBED') {
          console.log('ChatScreenRunner: ✅ Successfully subscribed to messages');
          console.log('ChatScreenRunner: Subscription details:', {
            channel: 'runner_messages',
            conversationId: cid,
            userId: user?.id,
            filter: `conversation_id=eq.${cid}`
          });
        } else if (status === 'CHANNEL_ERROR') {
          console.log('ChatScreenRunner: ❌ Channel error occurred');
        } else if (status === 'TIMED_OUT') {
          console.log('ChatScreenRunner: ⏰ Subscription timed out');
        } else if (status === 'CLOSED') {
          console.log('ChatScreenRunner: 🔒 Subscription closed');
        } else {
          console.log('ChatScreenRunner: ❌ Subscription failed:', status);
        }
      });
    return () => { 
      console.log('ChatScreenRunner: Cleaning up subscription');
      channel.unsubscribe(); 
    };
  }, [conversationId, user?.id, commissionId, contactProfile, initialContactProfile, router, showInvoiceAcceptedModal, setInvoiceAcceptedOpen, checkInvoiceExists, setInvoiceExists]);

  return {
    messages,
    setMessages,
    currentUserProfile,
    setCurrentUserProfile,
    contactProfile: contactProfile || initialContactProfile,
    setContactProfile,
    mapDbToChat,
  };
};

