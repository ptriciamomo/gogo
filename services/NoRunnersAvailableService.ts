export interface NoRunnersAvailableNotification {
  type: 'commission' | 'errand';
  commissionId?: number;
  errandId?: number;
  commissionTitle?: string;
  errandTitle?: string;
}

class NoRunnersAvailableService {
  private listeners: Array<(notification: NoRunnersAvailableNotification | null) => void> = [];
  private currentNotification: NoRunnersAvailableNotification | null = null;

  // Subscribe to notifications
  subscribe(listener: (notification: NoRunnersAvailableNotification | null) => void) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  // Notify all listeners about a new notification
  notify(notification: NoRunnersAvailableNotification) {
    console.log('NoRunnersAvailableService: Notifying listeners:', notification);
    this.currentNotification = notification;
    this.listeners.forEach(listener => {
      try {
        listener(notification);
      } catch (error) {
        console.error('NoRunnersAvailableService: Error notifying listener:', error);
      }
    });
  }

  // Clear current notification
  clearNotification() {
    this.currentNotification = null;
    this.listeners.forEach(listener => listener(null));
  }

  // Get current notification
  getCurrentNotification(): NoRunnersAvailableNotification | null {
    return this.currentNotification;
  }
}

// Export singleton instance
export const noRunnersAvailableService = new NoRunnersAvailableService();
