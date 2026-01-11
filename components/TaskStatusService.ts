// Task Status Service for managing task status across components

class TaskStatusService {
  private static instance: TaskStatusService;
  private currentStatus: 'requested' | 'accepted' | 'in_progress' | 'revision' | 'completed' = 'requested';
  private listeners: Array<(status: 'requested' | 'accepted' | 'in_progress' | 'revision' | 'completed') => void> = [];

  private constructor() {}

  public static getInstance(): TaskStatusService {
    if (!TaskStatusService.instance) {
      TaskStatusService.instance = new TaskStatusService();
    }
    return TaskStatusService.instance;
  }

  // Get current task status
  public getStatus(): 'requested' | 'accepted' | 'in_progress' | 'revision' | 'completed' {
    return this.currentStatus;
  }

  // Set task status and notify listeners
  public async setStatus(status: 'requested' | 'accepted' | 'in_progress' | 'revision' | 'completed'): Promise<void> {
    this.currentStatus = status;
    this.notifyListeners();
  }

  // Subscribe to status changes
  public onStatusChange(callback: (status: 'requested' | 'accepted' | 'in_progress' | 'revision' | 'completed') => void): void {
    this.listeners.push(callback);
  }

  // Unsubscribe from status changes
  public offStatusChange(callback: (status: 'requested' | 'accepted' | 'in_progress' | 'revision' | 'completed') => void): void {
    this.listeners = this.listeners.filter(listener => listener !== callback);
  }

  // Notify all listeners of status change
  private notifyListeners(): void {
    this.listeners.forEach(listener => listener(this.currentStatus));
  }

  // Method to handle invoice acceptance
  public async acceptInvoice(): Promise<void> {
    await this.setStatus('in_progress');
  }

  // Method to handle file submission (move to revision)
  public async submitFile(): Promise<void> {
    await this.setStatus('revision');
  }

  // Method to complete task
  public async completeTask(): Promise<void> {
    await this.setStatus('completed');
  }

  // Rule-based status validation
  public canTransitionTo(newStatus: 'requested' | 'accepted' | 'in_progress' | 'revision' | 'completed'): boolean {
    const validTransitions: Record<string, string[]> = {
      'requested': ['accepted', 'cancelled'],
      'accepted': ['in_progress', 'cancelled'],
      'in_progress': ['revision', 'completed', 'cancelled'],
      'revision': ['in_progress', 'completed', 'cancelled'],
      'completed': [] // Terminal state
    };

    const allowedTransitions = validTransitions[this.currentStatus] || [];
    return allowedTransitions.includes(newStatus);
  }
}

export default TaskStatusService.getInstance();