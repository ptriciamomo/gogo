export interface ErrandCompletionNotification {
  errandId: number;
  runnerName?: string;
}

class ErrandCompletionService {
  private static instance: ErrandCompletionService;
  private listeners: Array<(notification: ErrandCompletionNotification | null) => void> = [];
  private currentNotification: ErrandCompletionNotification | null = null;

  private constructor() {}

  static getInstance(): ErrandCompletionService {
    if (!ErrandCompletionService.instance) {
      ErrandCompletionService.instance = new ErrandCompletionService();
    }
    return ErrandCompletionService.instance;
  }

  // Subscribe to errand completion notifications
  subscribe(listener: (notification: ErrandCompletionNotification | null) => void) {
    console.log('ErrandCompletionService: Adding listener, total listeners:', this.listeners.length + 1);
    this.listeners.push(listener);
    
    // If there's already a notification, send it immediately
    if (this.currentNotification) {
      console.log('ErrandCompletionService: Sending existing notification to new listener:', this.currentNotification);
      listener(this.currentNotification);
    }
    
    return () => {
      console.log('ErrandCompletionService: Removing listener');
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  // Send errand completion notification
  notifyCompletion(notification: ErrandCompletionNotification) {
    console.log('ErrandCompletionService: notifyCompletion called with:', notification);
    console.log('ErrandCompletionService: Number of listeners:', this.listeners.length);
    
    this.currentNotification = notification;
    
    if (this.listeners.length === 0) {
      console.warn('ErrandCompletionService: No listeners registered! Modal will not appear.');
    }
    
    this.listeners.forEach((listener, index) => {
      console.log(`ErrandCompletionService: Notifying listener ${index + 1} of ${this.listeners.length}`);
      try {
        listener(notification);
        console.log(`ErrandCompletionService: Listener ${index + 1} notified successfully`);
      } catch (error) {
        console.error(`ErrandCompletionService: Error notifying listener ${index + 1}:`, error);
      }
    });
    console.log('ErrandCompletionService: All listeners notified');
  }

  // Clear current notification
  clearNotification() {
    console.log('ErrandCompletionService: Clearing notification');
    this.currentNotification = null;
    this.listeners.forEach(listener => {
      try {
        listener(null);
      } catch (error) {
        console.error('ErrandCompletionService: Error clearing notification:', error);
      }
    });
  }

  // Get current notification
  getCurrentNotification(): ErrandCompletionNotification | null {
    return this.currentNotification;
  }

  // Get listener count
  getListenerCount(): number {
    return this.listeners.length;
  }
}

// Export singleton instance
export const errandCompletionService = ErrandCompletionService.getInstance();
export default errandCompletionService;

