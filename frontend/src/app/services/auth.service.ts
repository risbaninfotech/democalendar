import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  // This URL should point to your backend's login endpoint
  private loginUrl = 'http://localhost:3000/api/login'; 

  constructor(private http: HttpClient) {}

  /**
   * Kicks off the login process by fetching the Zoho URL from the server.
   */
  initiateLogin(): void {
    this.http.get<{ zohoAuthUrl: string }>(this.loginUrl)
      .subscribe({
        next: (response) => {
          if (response.zohoAuthUrl) {
            // Redirect the browser to the Zoho login page.
            // The server will handle the rest of the flow.
            window.location.href = response.zohoAuthUrl;
          } else {
            console.error('Could not get the Zoho login URL from the server.');
          }
        },
        error: (err) => {
          console.error('Error initiating login:', err);
          // You could show an error message to the user here.
        }
      });
  }
}