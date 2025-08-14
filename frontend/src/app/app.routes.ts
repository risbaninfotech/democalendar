// app.routes.ts

import { Routes } from '@angular/router';
import { LoginComponent } from './login/login.component';
import { CalendarComponent } from './calendar/calendar.component';
import { StatusManagementComponent } from './status-management/status-management.component';

export const routes: Routes = [
  // 1. Define all your specific application routes first.
  { path: 'login', component: LoginComponent },
  { path: 'calendar', component: CalendarComponent },
  { path: 'manage-statuses', component: StatusManagementComponent }, // <-- MOVED UP

  // 2. Define default and catch-all routes at the end.
  { path: '', redirectTo: '/login', pathMatch: 'full' },         // Default route
  { path: '**', redirectTo: '/login' }                           // Wildcard route should be last
];