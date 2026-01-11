import { Platform, Alert } from 'react-native';
import { supabase } from '../../lib/supabase';
import { isValidUuid } from './useChatMessages';
import taskStatusService from '../../components/TaskStatusService';
import { ChatMessage } from './useChatMessages';

interface UseInvoiceActionsProps {
  messages: ChatMessage[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  conversationId: string | string[] | undefined;
  user: any;
  router: any;
  setShowLoadingModal: React.Dispatch<React.SetStateAction<boolean>>;
  setDeclineMessageId: React.Dispatch<React.SetStateAction<string | null>>;
  setShowDeclineConfirmModal: React.Dispatch<React.SetStateAction<boolean>>;
}

interface UseInvoiceActionsReturn {
  handleInvoiceAction: (messageId: string, action: 'accept' | 'decline') => Promise<void>;
  handleInvoiceActionImmediateWeb: (messageId: string, action: 'accept' | 'decline') => Promise<void>;
  processInvoiceActionWeb: (messageId: string, action: 'accept' | 'decline') => Promise<void>;
}

export const useInvoiceActions = ({
  messages,
  setMessages,
  conversationId,
  user,
  router,
  setShowLoadingModal,
  setDeclineMessageId,
  setShowDeclineConfirmModal,
}: UseInvoiceActionsProps): UseInvoiceActionsReturn => {
  // Function to handle invoice actions (Accept/Decline) - Mobile version
  const handleInvoiceAction = async (messageId: string, action: 'accept' | 'decline') => {
    console.log('ChatScreenCaller: ===== MOBILE INVOICE ACTION =====');
    console.log('ChatScreenCaller: Action:', action);
    console.log('ChatScreenCaller: Message ID:', messageId);
    // Validate user role before processing invoice action
    try {
      const { data: userRes } = await supabase.auth.getUser();
      const user = userRes?.user;
      if (!user) {
        console.error('No authenticated user found');
        return;
      }

      const { data: profile } = await supabase
        .from("users")
        .select("role")
        .eq("id", user.id)
        .single();

      const userRole = profile?.role?.toLowerCase();
      if (userRole !== 'buddycaller') {
        console.error('Invalid role for invoice action:', userRole);
        // Redirect to correct home page based on role
        if (userRole === 'buddyrunner') {
          router.replace('/buddyrunner/home');
        } else {
          router.replace('/buddycaller/home');
        }
        return;
      }

      console.log('Role validation passed for invoice action:', userRole);
    } catch (error) {
      console.error('Error validating user role:', error);
      return;
    }

    let invoiceForCallback: any = null; // Declare outside to use in Alert callback

    Alert.alert(
      action === 'accept' ? 'Accept Invoice' : 'Find Another Runner?',
      action === 'accept'
        ? 'Are you sure you want to accept this invoice?'
        : 'Are you sure you want to find another runner? This will release the current runner and make the commission available to other runners.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: action === 'accept' ? 'Accept' : 'Yes, Find Another Runner',
          style: action === 'accept' ? 'default' : 'destructive',
          onPress: async () => {
            try {
              const newStatus = action === 'accept' ? 'accepted' : 'declined';

              // Resolve invoice id for this message (newer rows will have it)
              const targetMessage = messages.find(m => m.id === messageId);
              const invoiceId = targetMessage?.invoice?.id;
              const useIdKey = isValidUuid(invoiceId);

              // Optimistic UI update so the buttons swap immediately
              setMessages(prev => prev.map(msg => {
                if (msg.id === messageId && msg.invoice) {
                  return { ...msg, invoice: { ...msg.invoice, status: newStatus as any } };
                }
                return msg;
              }));

              // Update the invoice status in the invoices table
              const { error: updateError } = await supabase
                .from('invoices')
                .update({
                  status: newStatus,
                  updated_at: new Date().toISOString()
                })
                .eq(useIdKey ? 'id' : 'message_id', (useIdKey ? (invoiceId as string) : messageId) as any);

              if (updateError) {
                console.warn('Failed to update invoice status:', updateError);
                return;
              }

              console.log('ChatScreenCaller: Updated invoice status to:', newStatus);

              // Get the updated invoice to verify commission_id
              const { data: updatedInvoiceCheck } = await supabase
                .from('invoices')
                .select('*')
                .eq('message_id', messageId)
                .single();
              
              console.log('ChatScreenCaller: Updated invoice details:', updatedInvoiceCheck);

              // Immediately update the local message state to reflect the change
              setMessages(prev => prev.map(msg => {
                if (msg.id === messageId && msg.invoice) {
                  return {
                    ...msg,
                    invoice: {
                      ...msg.invoice,
                      status: newStatus as any
                    }
                  };
                }
                return msg;
              }));

              // Get the updated invoice to update message_text
              const { data: updatedInvoice, error: fetchError } = await supabase
                .from('invoices')
                .select('*')
                .eq(useIdKey ? 'id' : 'message_id', (useIdKey ? (invoiceId as string) : messageId) as any)
                .single();

              if (fetchError) {
                console.warn('Failed to fetch updated invoice:', fetchError);
                return;
              }

              console.log('Fetched updated invoice:', updatedInvoice);

              if (updatedInvoice) {
                // Store in outer scope for use in Alert callback
                invoiceForCallback = updatedInvoice;
                const invoiceJson = {
                  type: 'invoice',
                  id: updatedInvoice.id,
                  amount: updatedInvoice.amount,
                  currency: updatedInvoice.currency,
                  description: updatedInvoice.description,
                  dueDate: updatedInvoice.due_date || '',
                  status: updatedInvoice.status,
                };

                // Update the message_text with the updated JSON
                await supabase
                  .from('messages')
                  .update({ message_text: JSON.stringify(invoiceJson) })
                  .eq('id', messageId);

        // Also update task_progress invoice_status for this commission
        if (updatedInvoice.commission_id) {
          try {
            console.log('Updating task_progress status to:', updatedInvoice.status, 'for commission_id:', updatedInvoice.commission_id);
            const { error: taskProgressError } = await supabase
              .from('task_progress')
              .update({ 
                status: updatedInvoice.status,
                updated_at: new Date().toISOString()
              })
              .eq('commission_id', updatedInvoice.commission_id);
            
            if (taskProgressError) {
              console.error('Failed to update task_progress invoice_status:', taskProgressError);
            } else {
              console.log('Successfully updated task_progress invoice_status');
            }
          } catch (e) {
            console.warn('Failed to update task_progress invoice_status:', e);
          }
        }

        // COMMISSION-SPECIFIC: Update commission status based on invoice action
        // NAA DIRI NA PART ANG SOLUTION SA COMMISSION KATONG WHAT IF MAG FIND LAIN ANG CALLER
        if (updatedInvoice.commission_id) {
          try {
            if (action === 'accept') {
              // When caller accepts invoice, change commission status to "accepted"
              await supabase
                .from('commission')
                .update({ 
                  status: 'accepted',
                  updated_at: new Date().toISOString()
                })
                .eq('id', updatedInvoice.commission_id);
              
              console.log('Commission status changed to accepted after invoice acceptance');
            } else if (action === 'decline') {
              // First, get the current runner_id before updating
              const { data: currentCommission, error: fetchCommissionError } = await supabase
                .from('commission')
                .select('runner_id')
                .eq('id', updatedInvoice.commission_id)
                .single();

              if (fetchCommissionError) {
                console.warn('Failed to fetch current commission:', fetchCommissionError);
              }

              // When caller declines invoice, reset commission to pending and track declined runner
              // BUT ONLY if the commission is in a resettable status (not completed, cancelled, or delivered)
              await supabase
                .from('commission')
                .update({ 
                  status: 'pending',
                  runner_id: null,
                  declined_runner_id: currentCommission?.runner_id || null, // Track the declined runner
                  updated_at: new Date().toISOString()
                })
                .eq('id', updatedInvoice.commission_id)
                .in('status', ['pending', 'accepted', 'in_progress']);
              
              // Update rejected_at timestamp in invoices table for this commission
              if (currentCommission?.runner_id) {
                try {
                  await supabase
                    .from('invoices')
                    .update({ 
                      rejected_at: new Date().toISOString()
                    })
                    .eq('commission_id', updatedInvoice.commission_id);
                  console.log('Updated rejected_at timestamp for commission:', updatedInvoice.commission_id);
                } catch (invoiceError) {
                  console.warn('Failed to update rejected_at timestamp:', invoiceError);
                  // Don't fail the entire operation if invoice update fails
                }
              }
              
              console.log('Commission reset to pending after invoice decline (only if resettable status)');
            }
          } catch (e) {
            console.warn('Failed to update commission status:', e);
          }
        }

                // Optimistic UI update on web (reflect immediately)
                if (Platform.OS === 'web') {
                  setMessages(prev => prev.map(m => {
                    if (m.id !== messageId) return m;
                    const updated = { ...m } as any;
                    updated.invoice = {
                      ...(m.invoice || {}),
                      id: updatedInvoice.id,
                      amount: updatedInvoice.amount,
                      currency: updatedInvoice.currency,
                      description: updatedInvoice.description,
                      dueDate: updatedInvoice.due_date || '',
                      status: updatedInvoice.status,
                    };
                    return updated;
                  }));
                }

                // Send a system message about the action
                const systemMessage = action === 'accept' 
                  ? 'Invoice accepted by caller'
                  : 'The caller has decided to find another runner. This commission has been released.';

                await supabase
                  .from('messages')
                  .insert({
                    conversation_id: (conversationId as string) || '',
                    sender_id: user?.id,
                    message_type: 'text',
                    message_text: systemMessage,
                  });
              }

              console.log(`Caller ${action}ed invoice:`, messageId);
              
              // If accepting invoice, update task status to 'in_progress'
              if (action === 'accept') {
                taskStatusService.acceptInvoice();
              }

              Alert.alert(
                'Success',
                `Invoice ${action}ed successfully!`,
                [
                  {
                    text: 'OK',
                    onPress: () => {
                      // Show loading modal and navigate to Task Progress page after user clicks OK
                      if (action === 'accept' && invoiceForCallback?.commission_id) {
                        console.log('Navigating to Task Progress page for commission:', invoiceForCallback.commission_id);
                        setShowLoadingModal(true);
                        
                        // Auto-dismiss loading modal and navigate after 2 seconds
                        setTimeout(() => {
                          setShowLoadingModal(false);
                          router.replace(`/buddycaller/task_progress?id=${invoiceForCallback.commission_id}`);
                        }, 2000);
                      }
                    }
                  }
                ]
              );
            } catch (e) {
              console.warn(`Failed to ${action} invoice:`, e);
            }
          }
        }
      ]
    );
  };

  // Function to handle invoice actions (Accept/Decline) IMMEDIATELY on web (copy of mobile logic without Alert)
  const handleInvoiceActionImmediateWeb = async (messageId: string, action: 'accept' | 'decline') => {
    console.log('ChatScreenCaller: ===== HANDLING INVOICE ACTION =====');
    console.log('ChatScreenCaller: Message ID:', messageId);
    console.log('ChatScreenCaller: Action:', action);
    
    // Validate user role before processing invoice action
    try {
      const { data: userRes } = await supabase.auth.getUser();
      const currentUser = userRes?.user;
      if (!currentUser) {
        console.error('No authenticated user found');
        return;
      }

      const { data: profile } = await supabase
        .from("users")
        .select("role")
        .eq("id", currentUser.id)
        .single();

      const userRole = profile?.role?.toLowerCase();
      if (userRole !== 'buddycaller') {
        console.error('Invalid role for invoice action:', userRole);
        // Redirect to correct home page based on role
        if (userRole === 'buddyrunner') {
          router.replace('/buddyrunner/home');
        } else {
          router.replace('/buddycaller/home');
        }
        return;
      }

      console.log('Role validation passed for invoice action:', userRole);
    } catch (error) {
      console.error('Error validating user role:', error);
      return;
    }

    // For web, use custom confirmation modal instead of native confirm
    if (action === 'decline') {
      if (Platform.OS === 'web') {
        setDeclineMessageId(messageId);
        setShowDeclineConfirmModal(true);
        return;
      } else {
        Alert.alert(
          'Find Another Runner?',
          'Are you sure you want to find another runner? This will release the current runner and make the commission available to other runners.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Yes, Find Another Runner', style: 'destructive', onPress: () => processInvoiceActionWeb(messageId, action) }
          ]
        );
        return;
      }
    }
    // Process accept action directly
    processInvoiceActionWeb(messageId, action);
  };

  // Process the actual invoice action for web
  const processInvoiceActionWeb = async (messageId: string, action: 'accept' | 'decline') => {
    console.log('ChatScreenCaller: ===== PROCESSING INVOICE ACTION =====');
    console.log('ChatScreenCaller: Action:', action);
    console.log('ChatScreenCaller: Message ID:', messageId);
    try {
      const newStatus = action === 'accept' ? 'accepted' : 'declined';

      // Resolve invoice id tied to this message if present
      const targetMessage = messages.find(m => m.id === messageId);
      const invoiceId = targetMessage?.invoice?.id;
      const useIdKey = isValidUuid(invoiceId);

      // Optimistic UI update so the buttons swap immediately on web
      setMessages(prev => prev.map(msg => {
        if (msg.id === messageId && msg.invoice) {
          return { ...msg, invoice: { ...msg.invoice, status: newStatus as any } };
        }
        return msg;
      }));

      // Update the invoice status in the invoices table
      console.log('Updating invoice with:', {
        newStatus,
        useIdKey,
        invoiceId,
        messageId,
        updateKey: useIdKey ? 'id' : 'message_id',
        updateValue: useIdKey ? (invoiceId as string) : messageId
      });
      
      const { error: updateError } = await supabase
        .from('invoices')
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq(useIdKey ? 'id' : 'message_id', (useIdKey ? (invoiceId as string) : messageId) as any);
      
      console.log('Update result:', { updateError, success: !updateError });
      
      if (updateError) {
        console.warn('Failed to update invoice status (web):', updateError);
        return;
      }

      // Get the updated invoice to update message_text
      const { data: updatedInvoice, error: fetchError } = await supabase
        .from('invoices')
        .select('*')
        .eq(useIdKey ? 'id' : 'message_id', (useIdKey ? (invoiceId as string) : messageId) as any)
        .single();
      if (fetchError) {
        console.warn('Failed to fetch updated invoice (web):', fetchError);
        return;
      }

      if (updatedInvoice) {
        const invoiceJson = {
          type: 'invoice',
          id: updatedInvoice.id,
          amount: updatedInvoice.amount,
          currency: updatedInvoice.currency,
          description: updatedInvoice.description,
          dueDate: updatedInvoice.due_date || '',
          status: updatedInvoice.status,
        };

        // Update the message_text with the updated JSON
        await supabase
          .from('messages')
          .update({ message_text: JSON.stringify(invoiceJson) })
          .eq('id', messageId);

        // Optimistic UI update on web
        setMessages(prev => prev.map(m => {
          if (m.id !== messageId) return m;
          const updated = { ...m } as any;
          updated.invoice = {
            ...(m.invoice || {}),
            id: updatedInvoice.id,
            amount: updatedInvoice.amount,
            currency: updatedInvoice.currency,
            description: updatedInvoice.description,
            dueDate: updatedInvoice.due_date || '',
            status: updatedInvoice.status,
          };
          return updated;
        }));

        // Also update task_progress invoice_status for this commission
        if (updatedInvoice.commission_id) {
          try {
            console.log('Updating task_progress status (web) to:', updatedInvoice.status, 'for commission_id:', updatedInvoice.commission_id);
            const { error: taskProgressError } = await supabase
              .from('task_progress')
              .update({ 
                status: updatedInvoice.status,
                updated_at: new Date().toISOString()
              })
              .eq('commission_id', updatedInvoice.commission_id);
            
            if (taskProgressError) {
              console.error('Failed to update task_progress invoice_status (web):', taskProgressError);
            } else {
              console.log('Successfully updated task_progress invoice_status (web)');
            }
          } catch (e) {
            console.warn('Failed to update task_progress invoice_status (web):', e);
          }
        }

        // COMMISSION-SPECIFIC: Update commission status based on invoice action
        // NAA DIRI NA PART ANG SOLUTION SA COMMISSION KATONG WHAT IF MAG FIND LAIN ANG CALLER
        if (updatedInvoice.commission_id) {
          try {
            if (action === 'accept') {
              // When caller accepts invoice, change commission status to "accepted"
              await supabase
                .from('commission')
                .update({ 
                  status: 'accepted',
                  updated_at: new Date().toISOString()
                })
                .eq('id', updatedInvoice.commission_id);
              
              console.log('Commission status changed to accepted after invoice acceptance');
            } else if (action === 'decline') {
              // First, get the current runner_id before updating
              const { data: currentCommission, error: fetchCommissionError } = await supabase
                .from('commission')
                .select('runner_id')
                .eq('id', updatedInvoice.commission_id)
                .single();

              if (fetchCommissionError) {
                console.warn('Failed to fetch current commission:', fetchCommissionError);
              }

              // When caller declines invoice, reset commission to pending and track declined runner
              // BUT ONLY if the commission is in a resettable status (not completed, cancelled, or delivered)
              await supabase
                .from('commission')
                .update({ 
                  status: 'pending',
                  runner_id: null,
                  declined_runner_id: currentCommission?.runner_id || null, // Track the declined runner
                  updated_at: new Date().toISOString()
                })
                .eq('id', updatedInvoice.commission_id)
                .in('status', ['pending', 'accepted', 'in_progress']);
              
              // Update rejected_at timestamp in invoices table for this commission
              if (currentCommission?.runner_id) {
                try {
                  await supabase
                    .from('invoices')
                    .update({ 
                      rejected_at: new Date().toISOString()
                    })
                    .eq('commission_id', updatedInvoice.commission_id);
                  console.log('Updated rejected_at timestamp for commission:', updatedInvoice.commission_id);
                } catch (invoiceError) {
                  console.warn('Failed to update rejected_at timestamp:', invoiceError);
                  // Don't fail the entire operation if invoice update fails
                }
              }
              
              console.log('Commission reset to pending after invoice decline (only if resettable status)');
            }
          } catch (e) {
            console.warn('Failed to update commission status:', e);
          }
        }

        // Send a system message about the action
        const systemMessage = action === 'accept' ? 'Invoice accepted by caller' : 'The caller has decided to find another runner. This commission has been released.';
        console.log('ChatScreenCaller: ===== SENDING SYSTEM MESSAGE =====');
        console.log('ChatScreenCaller: Action:', action);
        console.log('ChatScreenCaller: System message:', systemMessage);
        console.log('ChatScreenCaller: Conversation ID:', conversationId);
        console.log('ChatScreenCaller: Sender ID:', user?.id);
        console.log('ChatScreenCaller: Message type: text');
        
        const { error: messageError } = await supabase
          .from('messages')
          .insert({
            conversation_id: (conversationId as string) || '',
            sender_id: user?.id,
            message_type: 'text',
            message_text: systemMessage,
          });
          
        if (messageError) {
          console.error('ChatScreenCaller: ❌ FAILED to send system message:', messageError);
          console.error('ChatScreenCaller: Error details:', {
            code: messageError.code,
            message: messageError.message,
            details: messageError.details,
            hint: messageError.hint
          });
        } else {
          console.log('ChatScreenCaller: ✅ System message sent successfully');
          console.log('ChatScreenCaller: Message should trigger modal in BuddyRunner');
          console.log('ChatScreenCaller: ===== MESSAGE SENT =====');
          
          // Verify the message was actually inserted
          setTimeout(async () => {
            try {
              const { data: verifyMessage, error: verifyError } = await supabase
                .from('messages')
                .select('*')
                .eq('conversation_id', conversationId)
                .eq('message_text', systemMessage)
                .order('created_at', { ascending: false })
                .limit(1)
                .single();
                
              if (verifyError) {
                console.error('ChatScreenCaller: ❌ Failed to verify message:', verifyError);
              } else {
                console.log('ChatScreenCaller: ✅ Message verification successful:', verifyMessage);
              }
            } catch (e) {
              console.error('ChatScreenCaller: ❌ Error during message verification:', e);
            }
          }, 1000);
        }

        // If accepting invoice, update task status to 'in_progress' and navigate
        if (action === 'accept') {
          taskStatusService.acceptInvoice();
          
          // Show loading modal and navigate to Task Progress page after successful acceptance
          if (updatedInvoice?.commission_id) {
            console.log('WEB VERSION: Navigating to Task Progress page for commission:', updatedInvoice.commission_id);
            console.log('WEB VERSION: Setting loading modal to true');
            setShowLoadingModal(true);
            
            // Auto-dismiss loading modal and navigate after 2 seconds
            setTimeout(() => {
              console.log('WEB VERSION: Auto-dismissing loading modal and navigating');
              setShowLoadingModal(false);
              router.replace(`/buddycaller/task_progress_web?id=${updatedInvoice.commission_id}`);
            }, 2000);
          } else {
            console.log('WEB VERSION: No commission_id found in updatedInvoice:', updatedInvoice);
          }
        }
      }
    } catch (e) {
      console.warn('Web immediate invoice action failed:', e);
    }
  };

  return {
    handleInvoiceAction,
    handleInvoiceActionImmediateWeb,
    processInvoiceActionWeb,
  };
};

