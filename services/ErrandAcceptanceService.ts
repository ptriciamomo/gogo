export interface ErrandAcceptanceNotification {
  runnerName: string;
  errandId: number;
}

class ErrandAcceptanceService {
  private static instance: ErrandAcceptanceService;
  private listeners: Array<(notification: ErrandAcceptanceNotification | null) => void> = [];
  private currentNotification: ErrandAcceptanceNotification | null = null;

  private constructor() {}

  static getInstance(): ErrandAcceptanceService {
    if (!ErrandAcceptanceService.instance) {
      ErrandAcceptanceService.instance = new ErrandAcceptanceService();
    }
    return ErrandAcceptanceService.instance;
  }

  // Subscribe to errand acceptance notifications
  subscribe(listener: (notification: ErrandAcceptanceNotification | null) => void) {
    console.log('ErrandAcceptanceService: Adding listener, total listeners:', this.listeners.length + 1);
    this.listeners.push(listener);
    
    // If there's already a notification, send it immediately
    if (this.currentNotification) {
      console.log('ErrandAcceptanceService: Sending existing notification to new listener:', this.currentNotification);
      listener(this.currentNotification);
    }
    
    return () => {
      console.log('ErrandAcceptanceService: Removing listener');
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  // Send errand acceptance notification
  notifyAcceptance(notification: ErrandAcceptanceNotification) {
    console.log('ErrandAcceptanceService: notifyAcceptance called with:', notification);
    console.log('ErrandAcceptanceService: Number of listeners:', this.listeners.length);
    
    this.currentNotification = notification;
    
    if (this.listeners.length === 0) {
      console.warn('ErrandAcceptanceService: No listeners registered! Modal will not appear.');
    }
    
    this.listeners.forEach((listener, index) => {
      console.log(`ErrandAcceptanceService: Notifying listener ${index + 1} of ${this.listeners.length}`);
      try {
        listener(notification);
        console.log(`ErrandAcceptanceService: Listener ${index + 1} notified successfully`);
      } catch (error) {
        console.error(`ErrandAcceptanceService: Error notifying listener ${index + 1}:`, error);
      }
    });
    console.log('ErrandAcceptanceService: All listeners notified');
  }

  // Clear current notification
  clearNotification() {
    console.log('ErrandAcceptanceService: Clearing notification');
    this.currentNotification = null;
    this.listeners.forEach(listener => {
      try {
        listener(null);
      } catch (error) {
        console.error('ErrandAcceptanceService: Error clearing notification:', error);
      }
    });
  }

  // Get current notification
  getCurrentNotification(): ErrandAcceptanceNotification | null {
    return this.currentNotification;
  }

  // Get listener count
  getListenerCount(): number {
    return this.listeners.length;
  }
}

// Export singleton instance
export const errandAcceptanceService = ErrandAcceptanceService.getInstance();
export default errandAcceptanceService;

