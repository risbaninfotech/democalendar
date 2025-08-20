import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router'; // For the "Back to Calendar" button
import { EventService, Status } from '../services/event.service';
import { NotificationService } from '../services/notification.service';
import { NotificationComponent } from '../notification/notification.component';

@Component({
  selector: 'app-status-management',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, NotificationComponent],
  templateUrl: './status-management.component.html',
  styleUrls: ['./status-management.component.css'],
})
export class StatusManagementComponent implements OnInit {
  statuses: Status[] = [];
  isEditMode = false;
  currentStatus: Status = { _id: '', name: '', color: '#000000' };

  constructor(
    private eventService: EventService,
    private notificationService: NotificationService
  ) {}

  ngOnInit(): void {
    this.loadStatuses();
  }

  loadStatuses(): void {
    this.eventService.getStatuses().subscribe({
      next: (data) => {
        this.statuses = data;
      },
      error: () => {
        this.notificationService.error('Failed to load statuses', 'Please try again later.');
      },
    });
  }

  onFormSubmit(): void {
    if (!this.currentStatus.name || !this.currentStatus.color) {
      this.notificationService.warning('Missing Fields', 'Please provide both a name and a color.');
      return;
    }

    const operation = this.isEditMode
      ? this.eventService.updateStatus(this.currentStatus._id, this.currentStatus)
      : this.eventService.createStatus(this.currentStatus);

    operation.subscribe({
      next: (response) => {
        if (response.code === 200 || response.code === 201) {
          this.notificationService.success(`Status ${this.isEditMode ? 'Updated' : 'Created'}!`, response.message);
          this.loadStatuses();
          this.resetForm();
        } else {
           this.notificationService.error('Operation Failed', response.message);
        }
      },
      error: (err) => {
        const errorMsg = err.error?.message || `Failed to ${this.isEditMode ? 'update' : 'create'} status.`;
        this.notificationService.error('Error', errorMsg);
      },
    });
  }

  editStatus(status: Status): void {
    this.isEditMode = true;
    // Create a copy to avoid mutating the list directly
    this.currentStatus = { ...status };
  }

  deleteStatus(id: string): void {
    if (confirm('Are you sure you want to delete this status? This action cannot be undone.')) {
      this.eventService.deleteStatus(id).subscribe({
        next: (response) => {
           if (response.code === 200) {
            this.notificationService.success('Status Deleted', response.message);
            this.loadStatuses();
           } else {
             this.notificationService.error('Deletion Failed', response.message);
           }
        },
        error: (err) => {
           this.notificationService.error('Error', err.error?.message || 'Failed to delete status.');
        },
      });
    }
  }

  resetForm(): void {
    this.isEditMode = false;
    this.currentStatus = { _id: '', name: '', color: '#000000' };
  }
}