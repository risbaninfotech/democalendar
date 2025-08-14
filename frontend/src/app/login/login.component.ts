import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from '../services/auth.service'; // Adjust the import path if needed

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.css']
})
export class LoginComponent {

  constructor(private authService: AuthService) {}

  /**
   * This method is triggered by the login button in the HTML.
   * It calls the service, which handles the redirection to Zoho.
   */
  login(): void {
    this.authService.initiateLogin();
  }
}