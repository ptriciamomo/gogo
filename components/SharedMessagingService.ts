// Message interface
export interface SharedMessage {
  id: string;
  text: string;
  isFromUser: boolean;
  timestamp: Date;
  attachment?: {
    uri: string;
    type: 'image' | 'document';
    name: string;
    size?: number;
  };
  invoice?: {
    id: string;
    description: string;
    amount: number;
    currency: string;
    dueDate: string;
    status: 'pending' | 'accepted' | 'declined' | 'cancelled';
  };
}

// User type for identification
export type UserType = 'runner' | 'caller';

class SharedMessagingService {
  private messages: SharedMessage[] = [];
  private currentUser: UserType | null = null;
  private messageUpdateCallbacks: Function[] = [];

  constructor() {
    // Simple initialization
  }

  // Set the current user type
  setCurrentUser(userType: UserType) {
    this.currentUser = userType;
  }

  // Get current user type
  getCurrentUser(): UserType | null {
    return this.currentUser;
  }

  // Send a message
  sendMessage(message: Omit<SharedMessage, 'id' | 'timestamp'>) {
    const newMessage: SharedMessage = {
      ...message,
      id: Date.now().toString(),
      timestamp: new Date(),
    };

    console.log('SharedMessagingService: Sending message', newMessage);
    if (newMessage.invoice) {
      console.log('SharedMessagingService: Message contains invoice', newMessage.invoice);
    }

    this.messages.push(newMessage);

    // Notify all subscribers with a delay to ensure React state updates properly
    setTimeout(() => {
      console.log('SharedMessagingService: Notifying', this.messageUpdateCallbacks.length, 'callbacks');
      this.messageUpdateCallbacks.forEach(callback => {
        try {
          callback(newMessage, 'new');
        } catch (error) {
          console.warn('Error in message callback:', error);
        }
      });
    }, 10);
    
    return newMessage;
  }

  // Get all messages
  getMessages(): SharedMessage[] {
    return [...this.messages];
  }

  // Subscribe to new messages and updates
  onNewMessage(callback: (message: SharedMessage | null, type?: 'new' | 'update' | 'delete') => void) {
    this.messageUpdateCallbacks.push(callback);
  }

  // Unsubscribe from new messages
  offNewMessage(callback: (message: SharedMessage | null, type?: 'new' | 'update' | 'delete') => void) {
    this.messageUpdateCallbacks = this.messageUpdateCallbacks.filter(cb => cb !== callback);
  }

  // Clear all messages
  clearMessages() {
    this.messages = [];
    // Notify subscribers that messages were cleared
    this.messageUpdateCallbacks.forEach(callback => {
      try {
        callback(null); // null indicates messages were cleared
      } catch (error) {
        console.warn('Error in clear messages callback:', error);
      }
    });
  }

  // Get messages for a specific user (filter by isFromUser)
  getMessagesForUser(userType: UserType): SharedMessage[] {
    return this.messages.filter(message => {
      if (userType === 'runner') {
        return message.isFromUser; // Runner sees their own messages
      } else {
        return !message.isFromUser; // Caller sees messages from runner
      }
    });
  }

  // Update an existing invoice
  updateInvoice(messageId: string, updatedInvoice: SharedMessage['invoice']) {
    const messageIndex = this.messages.findIndex(msg => msg.id === messageId);
    if (messageIndex !== -1 && this.messages[messageIndex].invoice) {
      // Update the invoice in the message
      this.messages[messageIndex] = {
        ...this.messages[messageIndex],
        invoice: updatedInvoice
      };

      console.log('SharedMessagingService: Updated invoice', updatedInvoice);

      // Notify all subscribers about the update
      setTimeout(() => {
        console.log('SharedMessagingService: Notifying invoice update to', this.messageUpdateCallbacks.length, 'callbacks');
        this.messageUpdateCallbacks.forEach(callback => {
          try {
            callback(this.messages[messageIndex], 'update'); // Pass the updated message and type
          } catch (error) {
            console.warn('Error in invoice update callback:', error);
          }
        });
      }, 10);
    }
  }

  // Update invoice status and send acceptance/decline message
  updateInvoiceStatus(messageId: string, status: 'accepted' | 'declined' | 'rejected') {
    const messageIndex = this.messages.findIndex(msg => msg.id === messageId);
    if (messageIndex !== -1 && this.messages[messageIndex].invoice) {
      // Update the invoice status
      this.messages[messageIndex] = {
        ...this.messages[messageIndex],
        invoice: {
          ...this.messages[messageIndex].invoice!,
          // Normalize any 'rejected' to 'declined' for consistency
          status: status === 'accepted' ? 'accepted' : 'declined'
        }
      };

      // Send acceptance/decline message
      const statusMessage = status === 'accepted' 
        ? 'Invoice accepted by caller' 
        : 'Invoice declined by caller';
      
      const statusMessageObj: SharedMessage = {
        id: Date.now().toString(),
        text: statusMessage,
        isFromUser: false, // From caller's perspective
        timestamp: new Date(),
      };

      this.messages.push(statusMessageObj);

      console.log('SharedMessagingService: Updated invoice status to', status);
      console.log('SharedMessagingService: Sending status message:', statusMessage);

      // Notify all subscribers about both the invoice update and new message
      setTimeout(() => {
        console.log('SharedMessagingService: Notifying status update to', this.messageUpdateCallbacks.length, 'callbacks');
        this.messageUpdateCallbacks.forEach(callback => {
          try {
            // First notify about invoice update
            callback(this.messages[messageIndex], 'update');
            // Then notify about new status message
            callback(statusMessageObj, 'new');
          } catch (error) {
            console.warn('Error in status update callback:', error);
          }
        });
      }, 10);
    }
  }

  // Delete a message by ID
  deleteMessage(messageId: string) {
    const messageIndex = this.messages.findIndex(msg => msg.id === messageId);
    if (messageIndex !== -1) {
      const deletedMessage = this.messages[messageIndex];
      this.messages.splice(messageIndex, 1);

      console.log('SharedMessagingService: Deleted message', messageId);

      // Notify all subscribers about the deletion
      setTimeout(() => {
        console.log('SharedMessagingService: Notifying deletion to', this.messageUpdateCallbacks.length, 'callbacks');
        this.messageUpdateCallbacks.forEach(callback => {
          try {
            callback(deletedMessage, 'delete');
          } catch (error) {
            console.warn('Error in delete callback:', error);
          }
        });
      }, 10);

      return true;
    }
    return false;
  }
}

// Create singleton instance
const sharedMessagingService = new SharedMessagingService();

export default sharedMessagingService;
