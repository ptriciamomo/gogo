import { Alert, Platform } from 'react-native';
import { supabase } from '../../lib/supabase';
import { ChatMessage } from './useChatMessagesRunner';

interface UseInvoiceActionsRunnerProps {
  messages: ChatMessage[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  conversationId: string | string[] | undefined;
  user: any;
  router: any;
  otherUserId: string | string[] | undefined;
  commissionId: string | string[] | undefined;
  resolvedCommissionId: string | null;
  invoiceData: {
    amount: string;
    currency: string;
    description: string;
  };
  setInvoiceData: React.Dispatch<React.SetStateAction<{
    amount: string;
    currency: string;
    description: string;
  }>>;
  editingInvoice: string | null;
  setEditingInvoice: React.Dispatch<React.SetStateAction<string | null>>;
  setShowInvoiceForm: React.Dispatch<React.SetStateAction<boolean>>;
  setInvoiceExists: React.Dispatch<React.SetStateAction<boolean>>;
  checkInvoiceExists: () => Promise<boolean>;
}

interface UseInvoiceActionsRunnerReturn {
  handleEditInvoice: (messageId: string) => void;
  handleDeleteInvoice: (messageId: string) => void;
  handleDeleteInvoiceImmediateWeb: (messageId: string) => Promise<void>;
  handleInvoiceUpdate: () => Promise<void>;
}

export const useInvoiceActionsRunner = ({
  messages,
  setMessages,
  conversationId,
  user,
  router,
  otherUserId,
  commissionId,
  resolvedCommissionId,
  invoiceData,
  setInvoiceData,
  editingInvoice,
  setEditingInvoice,
  setShowInvoiceForm,
  setInvoiceExists,
  checkInvoiceExists,
}: UseInvoiceActionsRunnerProps): UseInvoiceActionsRunnerReturn => {
  // Function to handle invoice edit
  const handleEditInvoice = (messageId: string) => {
    const message = messages.find(msg => msg.id === messageId);
    if (message && message.invoice) {
      // Extract subtotal from total amount
      // Total = Subtotal + (5 + 0.12 × Subtotal) = Subtotal × 1.12 + 5
      // Subtotal = (Total - 5) / 1.12
      const totalAmount = typeof message.invoice.amount === 'number' ? message.invoice.amount : parseFloat(message.invoice.amount || '0');
      const subtotal = totalAmount > 5 ? (totalAmount - 5) / 1.12 : 0; // Reverse calculate to get the base subtotal
      
      setInvoiceData({
        amount: subtotal.toFixed(2), // Store subtotal in the form field
        currency: message.invoice.currency,
        description: message.invoice.description,
      });
      setEditingInvoice(messageId);
      setShowInvoiceForm(true);
    }
  };

  // Function to handle invoice delete
  const handleDeleteInvoice = (messageId: string) => {
    Alert.alert(
      'Delete Invoice',
      'Are you sure you want to delete this invoice? You will be able to send a new invoice after deletion.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              // Delete the invoice first
              await supabase
                .from('invoices')
                .delete()
                .eq('message_id', messageId);

              // Clear the message_text and then delete the message
              await supabase
                .from('messages')
                .update({ message_text: '' })
                .eq('id', messageId);

              const { error } = await supabase
                .from('messages')
                .delete()
                .eq('id', messageId);
              if (error) throw error;
              setMessages(prev => prev.filter(m => m.id !== messageId));
              setInvoiceExists(false);
              
              // Show success message
              Alert.alert(
                'Invoice Deleted',
                'The invoice has been deleted. You can now send a new invoice for this commission.',
                [{ text: 'OK' }]
              );
            } catch (e) {
              console.warn('Failed to delete invoice:', e);
              Alert.alert('Error', 'Failed to delete invoice. Please try again.');
            }
          }
        }
      ]
    );
  };

  // Web-only: immediate delete handler (copy of mobile logic without Alert)
  const handleDeleteInvoiceImmediateWeb = async (messageId: string) => {
    try {
      await supabase.from('invoices').delete().eq('message_id', messageId);
      await supabase.from('messages').update({ message_text: '' }).eq('id', messageId);
      const { error } = await supabase.from('messages').delete().eq('id', messageId);
      if (error) throw error;
      // Optimistic UI remove locally
      setMessages(prev => prev.filter(m => m.id !== messageId));
      setInvoiceExists(false);
      
      // Show success message for web
      alert('Invoice deleted successfully. You can now send a new invoice for this commission.');
    } catch (e) {
      console.warn('Failed to delete invoice (web):', e);
      alert('Failed to delete invoice. Please try again.');
    }
  };

  // Function to handle invoice update
  const handleInvoiceUpdate = async () => {
    if (!invoiceData.amount || !invoiceData.description) {
      Alert.alert('Error', 'Please fill in all required fields.');
      return;
    }

    // SECURITY: Validate that runner is still assigned to this commission
    try {
      const finalCommissionId = resolvedCommissionId || commissionId;
      if (!finalCommissionId) {
        Alert.alert('Error', 'Commission not found.');
        return;
      }
      const { data: commission, error: commissionError } = await supabase
        .from('commission')
        .select('runner_id, status')
        .eq('id', parseInt(finalCommissionId as string))
        .single();

      if (commissionError || !commission) {
        Alert.alert('Error', 'Commission not found.');
        return;
      }

      if (commission.runner_id !== user?.id) {
        Alert.alert(
          'Access Denied', 
          'You are no longer assigned to this commission. You cannot send invoices.',
          [{ text: 'OK', onPress: () => router.replace('/buddyrunner/home') }]
        );
        return;
      }

      if (commission.status !== 'in_progress') {
        Alert.alert(
          'Commission Not Active', 
          'This commission is no longer active. You cannot send invoices.',
          [{ text: 'OK', onPress: () => router.replace('/buddyrunner/home') }]
        );
        return;
      }
    } catch (e) {
      console.warn('Failed to validate commission access:', e);
      Alert.alert('Error', 'Failed to validate commission access.');
      return;
    }

    // If creating a new invoice (not editing), check if one already exists
    if (!editingInvoice) {
      const exists = await checkInvoiceExists();
      if (exists) {
        Alert.alert(
          'Invoice Already Exists',
          'You have already sent an invoice for this commission. You can only send one invoice per commission.',
          [{ text: 'OK' }]
        );
        return;
      }
    }

    if (editingInvoice) {
      // Update existing invoice
      try {
        // CALCULATION FORMALA SA INVOICE FOR COMMISSIONS NI BAI
        const baseAmount = parseFloat(invoiceData.amount) || 0;
        let totalServiceFee = 0;
        if (baseAmount > 0) {
          const baseFee = 5;
          const vatAmount = baseAmount * 0.12;
          totalServiceFee = baseFee + vatAmount;
        }
        const totalAmount = baseAmount + totalServiceFee;

        const updatedInvoiceData = {
          amount: totalAmount, // Use total amount with VAT deduction and service fee
          currency: invoiceData.currency,
          description: invoiceData.description,
          updated_at: new Date().toISOString(),
        };

        // Update the invoice in the invoices table
        await supabase
          .from('invoices')
          .update(updatedInvoiceData)
          .eq('message_id', editingInvoice);

        // Immediately update the local message state to reflect the change
        setMessages(prev => prev.map(msg => {
          if (msg.id === editingInvoice && msg.invoice) {
            return {
              ...msg,
              invoice: {
                ...msg.invoice,
                amount: updatedInvoiceData.amount,
                currency: updatedInvoiceData.currency,
                description: updatedInvoiceData.description,
              }
            };
          }
          return msg;
        }));

        // Get the current invoice to update message_text
        const { data: currentInvoice } = await supabase
          .from('invoices')
          .select('*')
          .eq('message_id', editingInvoice)
          .single();

        if (currentInvoice) {
          const invoiceJson = {
            type: 'invoice',
            id: currentInvoice.id,
            amount: updatedInvoiceData.amount,
            currency: updatedInvoiceData.currency,
            description: updatedInvoiceData.description,
            dueDate: currentInvoice.due_date || '',
            status: currentInvoice.status,
          };

          // Update the message_text with the updated JSON
          await supabase
            .from('messages')
            .update({ message_text: JSON.stringify(invoiceJson) })
            .eq('id', editingInvoice);
        }
      } catch (e) {
        console.warn('Failed to update invoice:', e);
      }
      setEditingInvoice(null);
    } else {
      // Create new invoice
      try {
        // First create the message
        const { data: messageData, error: messageError } = await supabase
          .from('messages')
          .insert({
            conversation_id: (conversationId as string) || '',
            sender_id: user?.id,
            message_type: 'text',
            message_text: '', // Empty text since invoice is separate
          })
          .select()
          .single();

        if (messageError) {
          console.warn('Failed to create message:', messageError);
          return;
        }

        // Calculate total amount with new service fee formula
        const baseAmount = parseFloat(invoiceData.amount) || 0;
        let totalServiceFee = 0;
        if (baseAmount > 0) {
          const baseFee = 5;
          const vatAmount = baseAmount * 0.12;
          totalServiceFee = baseFee + vatAmount;
        }
        const totalAmount = baseAmount + totalServiceFee;

        // Create the invoice data for both table and message_text
        const finalCommissionId = resolvedCommissionId || commissionId;
        console.log('ChatScreenRunner: commissionId from params:', commissionId);
        console.log('ChatScreenRunner: resolvedCommissionId:', resolvedCommissionId);
        console.log('ChatScreenRunner: finalCommissionId:', finalCommissionId);
        console.log('ChatScreenRunner: commissionId type:', typeof finalCommissionId);
        console.log('ChatScreenRunner: parsed commissionId:', finalCommissionId ? parseInt(finalCommissionId as string) : null);
        
        const invoiceRecord = {
          message_id: messageData.id,
          conversation_id: (conversationId as string) || '',
          commission_id: finalCommissionId ? parseInt(finalCommissionId as string) : null,
          runner_id: user?.id,
          caller_id: otherUserId,
          amount: totalAmount, // Use total amount with VAT deduction and service fee
          currency: invoiceData.currency,
          description: invoiceData.description,
          status: 'pending',
        };

        const invoiceJson = {
          type: 'invoice',
          id: `INV-${Date.now()}`,
          amount: invoiceRecord.amount, // Total amount including service fee
          currency: invoiceRecord.currency,
          description: invoiceRecord.description,
          dueDate: '',
          status: invoiceRecord.status,
        };

        // Create the invoice in the invoices table
        const { data: invoiceResult, error: createError } = await supabase
          .from('invoices')
          .insert(invoiceRecord)
          .select()
          .single();
          
        if (createError) throw createError;
        console.log('ChatScreenRunner: Invoice created successfully:', invoiceResult);
        console.log('ChatScreenRunner: Invoice commission_id in database:', invoiceResult.commission_id);

        // Update the message with the JSON data for visibility
        await supabase
          .from('messages')
          .update({ message_text: JSON.stringify(invoiceJson) })
          .eq('id', messageData.id);

        // Update invoice existence state
        setInvoiceExists(true);
      } catch (e) {
        console.warn('Failed to send invoice:', e);
      }
    }

    setShowInvoiceForm(false);
    setInvoiceData({ amount: '', currency: 'PHP', description: '' });
  };

  return {
    handleEditInvoice,
    handleDeleteInvoice,
    handleDeleteInvoiceImmediateWeb,
    handleInvoiceUpdate,
  };
};


