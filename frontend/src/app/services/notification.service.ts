import { Injectable, } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

export interface Notification {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message?: string;
  duration?: number;
  showClose?: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class NotificationService {
  private notifications$ = new BehaviorSubject<Notification[]>([]);
  private nextId = 1;

  constructor() {}

  getNotifications(): Observable<Notification[]> {
    return this.notifications$.asObservable();
  }

  private addNotification(notification: Omit<Notification, 'id'>): void {
    const newNotification: Notification = {
      id: `notification-${this.nextId++}`,
      duration: 5000, // Default 5 seconds
      showClose: true,
      ...notification
    };

    const currentNotifications = this.notifications$.value;
    this.notifications$.next([...currentNotifications, newNotification]);

    // Auto-remove notification after duration
    if (newNotification.duration && newNotification.duration > 0) {
      setTimeout(() => {
        this.removeNotification(newNotification.id);
      }, newNotification.duration);
    }
  }

  success(title: string, message?: string, duration?: number): void {
    this.addNotification({
      type: 'success',
      title,
      message,
      duration: duration || 5000
    });
  }

  error(title: string, message?: string, duration?: number): void {
    this.addNotification({
      type: 'error',
      title,
      message,
      duration: duration || 7000 // Error notifications stay longer
    });
  }

  warning(title: string, message?: string, duration?: number): void {
    this.addNotification({
      type: 'warning',
      title,
      message,
      duration: duration || 5000
    });
  }

  info(title: string, message?: string, duration?: number): void {
    this.addNotification({
      type: 'info',
      title,
      message,
      duration: duration || 5000
    });
  }

  removeNotification(id: string): void {
    const currentNotifications = this.notifications$.value;
    const filteredNotifications = currentNotifications.filter(n => n.id !== id);
    this.notifications$.next(filteredNotifications);
  }

  clearAll(): void {
    this.notifications$.next([]);
  }
}