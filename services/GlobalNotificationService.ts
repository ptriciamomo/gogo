import { supabase } from '../lib/supabase';

export interface TaskCompletionNotification {
  id: string;
  commissionId: number;
  commissionTitle: string;
  callerName: string;
  callerId: string;
  runnerId: string;
  timestamp: string;
}

export interface TaskApprovalNotification {
  id: string;
  commissionId: number;
  commissionTitle: string;
  callerName: string;
  callerId: string;
  runnerId: string;
  timestamp: string;
}

class GlobalNotificationService {
  private listeners: Array<(notification: TaskCompletionNotification | null) => void> = [];
  private approvalListeners: Array<(notification: TaskApprovalNotification | null) => void> = [];
  private currentNotification: TaskCompletionNotification | null = null;
  private currentApprovalNotification: TaskApprovalNotification | null = null;

  // Subscribe to task completion notifications
  subscribe(listener: (notification: TaskCompletionNotification | null) => void) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  // Notify all listeners about a new task completion
  notifyTaskCompletion(notification: TaskCompletionNotification) {
    this.currentNotification = notification;
    this.listeners.forEach(listener => listener(notification));
  }

  // Clear current notification
  clearNotification() {
    this.currentNotification = null;
    this.listeners.forEach(listener => listener(null));
  }

  // Get current notification
  getCurrentNotification(): TaskCompletionNotification | null {
    return this.currentNotification;
  }

  // Subscribe to task approval notifications
  subscribeApproval(listener: (notification: TaskApprovalNotification | null) => void) {
    this.approvalListeners.push(listener);
    return () => {
      this.approvalListeners = this.approvalListeners.filter(l => l !== listener);
    };
  }

  // Notify all listeners about a new task approval
  notifyTaskApproval(notification: TaskApprovalNotification) {
    if (__DEV__) {
    console.log('GlobalNotificationService: notifyTaskApproval called with:', notification);
    console.log('GlobalNotificationService: Number of approval listeners:', this.approvalListeners.length);
    console.log('GlobalNotificationService: Current approval notification before update:', this.currentApprovalNotification);
    }
    
    this.currentApprovalNotification = notification;
    
    if (this.approvalListeners.length === 0) {
      if (__DEV__) console.warn('GlobalNotificationService: No approval listeners registered! Modal may not appear.');
    }
    
    this.approvalListeners.forEach((listener, index) => {
      if (__DEV__) console.log(`GlobalNotificationService: Notifying listener ${index + 1} of ${this.approvalListeners.length}`);
      try {
        listener(notification);
        if (__DEV__) console.log(`GlobalNotificationService: Listener ${index + 1} notified successfully`);
      } catch (error) {
        console.error(`GlobalNotificationService: Error notifying listener ${index + 1}:`, error);
      }
    });
    if (__DEV__) console.log('GlobalNotificationService: All listeners notified');
  }

  // Clear current approval notification
  clearApprovalNotification() {
    this.currentApprovalNotification = null;
    this.approvalListeners.forEach(listener => listener(null));
  }

  // Get current approval notification
  getCurrentApprovalNotification(): TaskApprovalNotification | null {
    return this.currentApprovalNotification;
  }

  // Get approval listeners count
  getApprovalListenersCount(): number {
    return this.approvalListeners.length;
  }

  // Test function to manually trigger a notification (for debugging)
  testNotification() {
    const testNotification: TaskCompletionNotification = {
      id: `test_${Date.now()}`,
      commissionId: 999,
      commissionTitle: 'Test Commission',
      callerName: 'Test Caller',
      callerId: 'test-caller-id',
      runnerId: 'test-runner-id',
      timestamp: new Date().toISOString()
    };
    
    if (__DEV__) console.log('GlobalNotificationService: Sending test notification:', testNotification);
    this.notifyTaskCompletion(testNotification);
  }

  // Test function to manually trigger an approval notification (for debugging)
  testApprovalNotification() {
    const testNotification: TaskApprovalNotification = {
      id: `test_approval_${Date.now()}`,
      commissionId: 999,
      commissionTitle: 'Test Commission',
      callerName: 'Test Caller',
      callerId: 'test-caller-id',
      runnerId: 'test-runner-id',
      timestamp: new Date().toISOString()
    };
    
    if (__DEV__) console.log('GlobalNotificationService: Sending test approval notification:', testNotification);
    this.notifyTaskApproval(testNotification);
  }



  // Set up real-time subscription for task completion and task approval notifications
  setupRealtimeSubscription() {
    if (__DEV__) console.log('GlobalNotificationService: Setting up real-time subscription');
    
    try {
      // Get current user once to avoid repeated auth calls
      let currentUserId: string | null = null;
      supabase.auth.getUser().then(({ data: { user } }) => {
        currentUserId = user?.id || null;
        if (__DEV__) console.log('GlobalNotificationService: Current user ID cached:', currentUserId);
      }).catch((error) => {
        if (__DEV__) console.warn('GlobalNotificationService: Failed to get user, real-time subscription may not work:', error);
      });
      
      // Listen for notifications table inserts (task completion only)
      const channel = supabase
        .channel('task_completion_notifications')
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'notifications',
            filter: 'type=eq.task_completion'
          },
          (payload) => {
            if (__DEV__) console.log('Task completion notification received:', payload);
            
            try {
              const notificationData = payload.new as any;
              
              // Use cached user ID for faster processing
              if (!currentUserId || notificationData.user_id !== currentUserId) {
                if (__DEV__) console.log('Task completion notification not for current user, skipping');
                return;
              }

              // Extract the notification data
              const notification: TaskCompletionNotification = notificationData.data;

              if (__DEV__) console.log('Sending task completion notification to modal:', notification);
              // Notify all listeners immediately
              this.notifyTaskCompletion(notification);
            } catch (error) {
              console.error('Error processing task completion notification:', error);
            }
          }
        )
        .subscribe((status) => {
          if (__DEV__) {
          console.log('GlobalNotificationService: Subscription status:', status);
          if (status === 'SUBSCRIBED') {
            console.log('GlobalNotificationService: Real-time subscription is active');
          } else if (status === 'CHANNEL_ERROR') {
            console.warn('GlobalNotificationService: Real-time subscription failed - this is not critical for task approvals');
          } else if (status === 'TIMED_OUT') {
            console.warn('GlobalNotificationService: Real-time subscription timed out - this is not critical for task approvals');
          } else if (status === 'CLOSED') {
            console.warn('GlobalNotificationService: Real-time subscription closed - this is not critical for task approvals');
            }
          }
        });

      // Listen for notifications table inserts (task approval)
      const approvalChannel = supabase
        .channel('task_approval_notifications')
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'notifications',
            filter: 'type=eq.task_approval'
          },
          (payload) => {
            if (__DEV__) console.log('Task approval notification received:', payload);
            try {
              const notificationData = payload.new as any;
              if (!currentUserId || notificationData.user_id !== currentUserId) {
                if (__DEV__) console.log('Task approval notification not for current user, skipping');
                return;
              }
              const notification: TaskApprovalNotification = notificationData.data;
              if (__DEV__) console.log('Sending task approval notification to modal:', notification);
              this.notifyTaskApproval(notification);
            } catch (error) {
              console.error('Error processing task approval notification:', error);
            }
          }
        )
        .subscribe((status) => {
          if (__DEV__) console.log('GlobalNotificationService (approval): Subscription status:', status);
        });

      return () => {
        if (__DEV__) console.log('GlobalNotificationService: Cleaning up subscription');
        try {
          supabase.removeChannel(channel);
        } catch (error) {
          if (__DEV__) console.warn('GlobalNotificationService: Error cleaning up task completion subscription:', error);
        }
        try {
          supabase.removeChannel(approvalChannel);
        } catch (error) {
          if (__DEV__) console.warn('GlobalNotificationService: Error cleaning up task approval subscription:', error);
        }
      };
    } catch (error) {
      if (__DEV__) console.warn('GlobalNotificationService: Failed to setup real-time subscription - this is not critical for task approvals:', error);
      // Return a no-op cleanup function
      return () => {
        if (__DEV__) console.log('GlobalNotificationService: No subscription to clean up');
      };
    }
  }
}

// Export singleton instance
export const globalNotificationService = new GlobalNotificationService();
