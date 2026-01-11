import { TaskApprovalNotification } from './GlobalNotificationService';

export { TaskApprovalNotification };

class ApprovalModalService {
  private static instance: ApprovalModalService;
  private listeners: Array<(notification: TaskApprovalNotification | null) => void> = [];
  private currentNotification: TaskApprovalNotification | null = null;

  private constructor() {}

  static getInstance(): ApprovalModalService {
    if (!ApprovalModalService.instance) {
      ApprovalModalService.instance = new ApprovalModalService();
    }
    return ApprovalModalService.instance;
  }

  // Subscribe to approval notifications
  subscribe(listener: (notification: TaskApprovalNotification | null) => void) {
    console.log('ApprovalModalService: Adding listener, total listeners:', this.listeners.length + 1);
    this.listeners.push(listener);
    
    // If there's already a notification, send it immediately
    if (this.currentNotification) {
      console.log('ApprovalModalService: Sending existing notification to new listener:', this.currentNotification);
      listener(this.currentNotification);
    }
    
    return () => {
      console.log('ApprovalModalService: Removing listener');
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  // Send approval notification
  notifyApproval(notification: TaskApprovalNotification) {
    console.log('ApprovalModalService: notifyApproval called with:', notification);
    console.log('ApprovalModalService: Number of listeners:', this.listeners.length);
    console.log('ApprovalModalService: Current approval notification before update:', this.currentNotification);
    
    this.currentNotification = notification;
    
    if (this.listeners.length === 0) {
      console.warn('ApprovalModalService: No listeners registered! Modal will not appear.');
    }
    
    this.listeners.forEach((listener, index) => {
      console.log(`ApprovalModalService: Notifying listener ${index + 1} of ${this.listeners.length}`);
      try {
        listener(notification);
        console.log(`ApprovalModalService: Listener ${index + 1} notified successfully`);
      } catch (error) {
        console.error(`ApprovalModalService: Error notifying listener ${index + 1}:`, error);
      }
    });
    console.log('ApprovalModalService: All listeners notified');
  }

  // Clear current notification
  clearNotification() {
    console.log('ApprovalModalService: Clearing notification');
    this.currentNotification = null;
    this.listeners.forEach(listener => {
      try {
        listener(null);
      } catch (error) {
        console.error('ApprovalModalService: Error clearing notification:', error);
      }
    });
  }

  // Get current notification
  getCurrentNotification(): TaskApprovalNotification | null {
    return this.currentNotification;
  }

  // Get listener count
  getListenerCount(): number {
    return this.listeners.length;
  }

  // Test function
  testNotification() {
    const testNotification: TaskApprovalNotification = {
      id: `test_${Date.now()}`,
      commissionId: 999,
      commissionTitle: 'Test Commission',
      callerName: 'Test Caller',
      callerId: 'test-caller-id',
      runnerId: 'test-runner-id',
      timestamp: new Date().toISOString()
    };
    
    console.log('ApprovalModalService: Sending test notification:', testNotification);
    this.notifyApproval(testNotification);
  }
}

// Export singleton instance
export const approvalModalService = ApprovalModalService.getInstance();
export default approvalModalService;
