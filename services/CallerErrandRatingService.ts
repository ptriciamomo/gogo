export interface CallerErrandRatingNotification {
  errandId: number;
  runnerName: string;
  runnerId: string;
  errandTitle: string;
}

class CallerErrandRatingService {
  private static instance: CallerErrandRatingService;
  private listeners: Array<(notification: CallerErrandRatingNotification | null) => void> = [];
  private currentNotification: CallerErrandRatingNotification | null = null;

  private constructor() {}

  static getInstance(): CallerErrandRatingService {
    if (!CallerErrandRatingService.instance) {
      CallerErrandRatingService.instance = new CallerErrandRatingService();
    }
    return CallerErrandRatingService.instance;
  }

  // Subscribe to caller errand rating notifications
  subscribe(listener: (notification: CallerErrandRatingNotification | null) => void) {
    console.log('CallerErrandRatingService: Adding listener, total listeners:', this.listeners.length + 1);
    this.listeners.push(listener);
    
    // If there's already a notification, send it immediately
    if (this.currentNotification) {
      console.log('CallerErrandRatingService: Sending existing notification to new listener:', this.currentNotification);
      listener(this.currentNotification);
    }
    
    return () => {
      console.log('CallerErrandRatingService: Removing listener');
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  // Send caller errand rating notification
  notifyRating(notification: CallerErrandRatingNotification) {
    console.log('CallerErrandRatingService: notifyRating called with:', notification);
    console.log('CallerErrandRatingService: Number of listeners:', this.listeners.length);
    
    this.currentNotification = notification;
    
    if (this.listeners.length === 0) {
      console.warn('CallerErrandRatingService: No listeners registered! Modal will not appear.');
    }
    
    this.listeners.forEach((listener, index) => {
      console.log(`CallerErrandRatingService: Notifying listener ${index + 1} of ${this.listeners.length}`);
      try {
        listener(notification);
        console.log(`CallerErrandRatingService: Listener ${index + 1} notified successfully`);
      } catch (error) {
        console.error(`CallerErrandRatingService: Error notifying listener ${index + 1}:`, error);
      }
    });
    console.log('CallerErrandRatingService: All listeners notified');
  }

  // Clear current notification
  clearNotification() {
    console.log('CallerErrandRatingService: Clearing notification');
    this.currentNotification = null;
    this.listeners.forEach(listener => {
      try {
        listener(null);
      } catch (error) {
        console.error('CallerErrandRatingService: Error clearing notification:', error);
      }
    });
  }

  // Get current notification
  getCurrentNotification(): CallerErrandRatingNotification | null {
    return this.currentNotification;
  }

  // Get listener count
  getListenerCount(): number {
    return this.listeners.length;
  }
}

// Export singleton instance
export const callerErrandRatingService = CallerErrandRatingService.getInstance();
export default callerErrandRatingService;

