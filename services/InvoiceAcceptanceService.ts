import { supabase } from '../lib/supabase';

interface InvoiceAcceptanceNotification {
  conversationId: string;
  callerName: string;
  commissionId?: string;
}

type InvoiceAcceptanceCallback = (notification: InvoiceAcceptanceNotification) => void;

class InvoiceAcceptanceService {
  private subscribers: InvoiceAcceptanceCallback[] = [];
  private isSubscribed = false;
  private currentUserId: string | null = null;
  private currentChannel: any = null;
  private setupPromise: Promise<void> | null = null;

  subscribe(callback: InvoiceAcceptanceCallback) {
    console.log('InvoiceAcceptanceService: Adding subscriber, total subscribers:', this.subscribers.length + 1);
    this.subscribers.push(callback);
    
    if (!this.isSubscribed && !this.setupPromise) {
      console.log('InvoiceAcceptanceService: Setting up subscription');
      this.setupPromise = this.setupSubscription();
    } else if (this.setupPromise) {
      console.log('InvoiceAcceptanceService: Setup already in progress');
    } else {
      console.log('InvoiceAcceptanceService: Already subscribed, skipping setup');
    }
    
    return () => {
      console.log('InvoiceAcceptanceService: Removing subscriber');
      this.subscribers = this.subscribers.filter(cb => cb !== callback);
      if (this.subscribers.length === 0) {
        console.log('InvoiceAcceptanceService: No more subscribers, cleaning up');
        this.cleanup();
      }
    };
  }

  private async setupSubscription() {
    try {
      console.log('InvoiceAcceptanceService: Starting setupSubscription');
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.log('InvoiceAcceptanceService: No user found, skipping subscription');
        return;
      }
      
      this.currentUserId = user.id;
      console.log('InvoiceAcceptanceService: Setting up subscription for user:', user.id);
      
      // Subscribe to all messages where the current user is the runner
      const channel = supabase
        .channel('invoice_acceptance_global')
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'messages'
        }, async (payload) => {
          console.log('InvoiceAcceptanceService: New message detected:', payload);
          
          const message = payload.new as any;
          console.log('InvoiceAcceptanceService: Message details:', {
            id: message.id,
            message_text: message.message_text,
            conversation_id: message.conversation_id,
            sender_id: message.sender_id
          });
          
          // Check if this is an invoice acceptance message
          const isInvoiceAccepted = message.message_text === 'Invoice accepted by caller';
          
          if (!isInvoiceAccepted) {
            console.log('InvoiceAcceptanceService: Not an invoice acceptance message, skipping');
            console.log('InvoiceAcceptanceService: Message text was:', message.message_text);
            return;
          }
          
          console.log('InvoiceAcceptanceService: Invoice acceptance message found!');
          
          // Get conversation details to find the runner
          console.log('InvoiceAcceptanceService: Fetching conversation details for message:', message.id);
          console.log('InvoiceAcceptanceService: Conversation ID:', message.conversation_id);
          
          const { data: conversation, error: conversationError } = await supabase
            .from('conversations')
            .select('user1_id, user2_id')
            .eq('id', message.conversation_id)
            .single();
            
          if (conversationError) {
            console.error('InvoiceAcceptanceService: ❌ Error fetching conversation:', conversationError);
            console.error('InvoiceAcceptanceService: Error details:', {
              code: conversationError.code,
              message: conversationError.message,
              details: conversationError.details,
              hint: conversationError.hint
            });
            return;
          }
          
          if (!conversation) {
            console.log('InvoiceAcceptanceService: ❌ No conversation found for message:', message.id);
            console.log('InvoiceAcceptanceService: Conversation ID was:', message.conversation_id);
            return;
          }
          
          console.log('InvoiceAcceptanceService: ✅ Conversation details:', conversation);
          
          // Find the active commission between these two users
          let commissionId: string | null = null;
          try {
            const { data: activeCommission } = await supabase
              .from('commission')
              .select('id, status, runner_id, buddycaller_id')
              .or(`and(buddycaller_id.eq.${conversation.user1_id},runner_id.eq.${conversation.user2_id}),and(buddycaller_id.eq.${conversation.user2_id},runner_id.eq.${conversation.user1_id})`)
              .in('status', ['accepted', 'in_progress', 'invoice_accepted'])
              .order('created_at', { ascending: false })
              .limit(1);
            
            if (activeCommission && activeCommission.length > 0) {
              commissionId = activeCommission[0].id.toString();
              console.log('InvoiceAcceptanceService: ✅ Found active commission:', commissionId);
            } else {
              console.log('InvoiceAcceptanceService: No active commission found for this conversation');
            }
          } catch (commissionError) {
            console.warn('InvoiceAcceptanceService: Failed to find active commission:', commissionError);
          }
          
          // Check if current user is either user1 or user2 in this conversation
          const isUser1 = conversation.user1_id === this.currentUserId;
          const isUser2 = conversation.user2_id === this.currentUserId;
          
          if (!isUser1 && !isUser2) {
            console.log('InvoiceAcceptanceService: Current user is not a participant in this conversation');
            console.log('InvoiceAcceptanceService: User1:', conversation.user1_id, 'User2:', conversation.user2_id, 'Current user:', this.currentUserId);
            return;
          }
          
          // Determine which user is the caller and which is the runner
          // We need to check the user roles to determine who is the caller
          const { data: user1Data } = await supabase
            .from('users')
            .select('role')
            .eq('id', conversation.user1_id)
            .single();
            
          const { data: user2Data } = await supabase
            .from('users')
            .select('role')
            .eq('id', conversation.user2_id)
            .single();
          
          let callerId: string;
          let runnerId: string;
          
          if (user1Data?.role === 'BuddyCaller' && user2Data?.role === 'BuddyRunner') {
            callerId = conversation.user1_id;
            runnerId = conversation.user2_id;
          } else if (user1Data?.role === 'BuddyRunner' && user2Data?.role === 'BuddyCaller') {
            callerId = conversation.user2_id;
            runnerId = conversation.user1_id;
          } else {
            console.log('InvoiceAcceptanceService: Could not determine caller/runner roles');
            console.log('InvoiceAcceptanceService: User1 role:', user1Data?.role, 'User2 role:', user2Data?.role);
            return;
          }
          
          // Only show modal if current user is the runner
          if (this.currentUserId !== runnerId) {
            console.log('InvoiceAcceptanceService: Current user is not the runner for this conversation');
            console.log('InvoiceAcceptanceService: Expected runner:', runnerId, 'Current user:', this.currentUserId);
            return;
          }
          
          console.log('InvoiceAcceptanceService: ✅ Current user is the runner, proceeding with notification');
          
          // Get caller name for the modal
          const { data: callerData } = await supabase
            .from('users')
            .select('first_name, last_name')
            .eq('id', callerId)
            .single();
            
          const callerName = callerData ? 
            `${callerData.first_name || ''} ${callerData.last_name || ''}`.trim() || 'The caller' : 
            'The caller';
            
          console.log('InvoiceAcceptanceService: Caller name:', callerName);
          
          // Notify all subscribers
          const notification: InvoiceAcceptanceNotification = {
            conversationId: message.conversation_id,
            callerName,
            commissionId: commissionId || undefined
          };
          
          console.log('InvoiceAcceptanceService: 🎯 Notifying subscribers:', notification);
          this.subscribers.forEach(callback => {
            try {
              callback(notification);
            } catch (error) {
              console.error('InvoiceAcceptanceService: Error in subscriber callback:', error);
            }
          });
          
          console.log('InvoiceAcceptanceService: ✅ Notification sent to', this.subscribers.length, 'subscribers');
        })
        .subscribe((status) => {
          console.log('InvoiceAcceptanceService: Subscription status:', status);
          this.isSubscribed = status === 'SUBSCRIBED';
        });
      
      this.currentChannel = channel;
    } catch (error) {
      console.error('InvoiceAcceptanceService: Failed to setup subscription:', error);
    }
  }

  private cleanup() {
    if (this.currentChannel) {
      console.log('InvoiceAcceptanceService: Cleaning up subscription');
      supabase.removeChannel(this.currentChannel);
      this.currentChannel = null;
      this.isSubscribed = false;
      this.setupPromise = null;
    }
  }

  // Test method to manually trigger notifications
  testNotification(notification: InvoiceAcceptanceNotification) {
    console.log('InvoiceAcceptanceService: Manual test notification triggered:', notification);
    console.log('InvoiceAcceptanceService: Number of subscribers:', this.subscribers.length);
    this.subscribers.forEach(callback => callback(notification));
  }
}

export const invoiceAcceptanceService = new InvoiceAcceptanceService();