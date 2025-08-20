import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map, tap  } from 'rxjs';
import { format, parseISO } from 'date-fns';

/**
 * @interface EventData
 * @description Defines the shape of event data used within the application's forms and components.
 * This interface is mapped to the backend API schema via the `mapToApi` method.
 */
export interface EventData {
  id?: string;
  eventName: string; // Maps to event_name
  artistName: string; // Maps to artist_name
  artistType: string; // Maps to artist_type
  city: string;
  status: string; // The ID of the status document
  venue: string;
  artistFee: number; // Maps to artist_amount
  startDate: string; // e.g., "2025-12-25" -> Maps to start_date
  startTime: string; // e.g., "20:00:00" -> Used to build start_time
  endDate: string; // e.g., "2025-12-25" -> Maps to end_date
  endTime: string; // e.g., "22:00:00" -> Used to build end_time
  promoterName: string;
  promoterPhone: string;
  promoterEmail: string;
  source: string;
}



/**
 * @interface Status
 * @description Represents the structure of a status object.
 */
export interface Status {
  _id: string;
  name: string;
  color: string;
}

export interface ZohoMasterDataItem {
  id: string;
  name: string;
}

/**
 * @interface ZohoMasterData
 * @description Represents the structure of the master data response from the Zoho API.
 */
export interface ZohoMasterData {
  artist: ZohoMasterDataItem[];
  promoter: ZohoMasterDataItem[];
  venue: ZohoMasterDataItem[];
  city: ZohoMasterDataItem[];
}


/**
 * @interface ApiResponse
 * @description Defines the standard API response structure from the backend.
 */
export interface ApiResponse<T> {
  code: number;
  message: string;
  data: T;
}

@Injectable({
  providedIn: 'root',
})
export class EventService {
  private apiUrl = 'http://localhost:3000/api';

  constructor(private http: HttpClient) {}

  /**
   * Fetches all events and maps them to the format required by FullCalendar.
   * @returns An Observable array of FullCalendar compatible event objects.
   */

  getZohoMasterData(): Observable<ApiResponse<ZohoMasterData>> {
  return this.http.get<ApiResponse<ZohoMasterData>>(`${this.apiUrl}/zoho/master`, {
    withCredentials: true,
  }).pipe(
    tap(response => {
      console.log('Zoho Master Data Response:', response);
    })
  );
}
  
  getCalendarEvents(): Observable<any[]> {
    return this.http
      .get<ApiResponse<any[]>>(`${this.apiUrl}/events/all`, {
        withCredentials: true,
      })
      .pipe(
        map((response) => {
          if (response.code === 200 && Array.isArray(response.data)) {
            return response.data.map((event: any) => {
              const eventColor = event?.status?.color || '#3788d8';
              return {
                id: event._id,
                title: event.artist_name, // FullCalendar uses 'title'
                start: event.start_time, // FullCalendar uses 'start'
                end: event.end_time, // FullCalendar uses 'end'
                backgroundColor: eventColor,
                borderColor: eventColor,
                extendedProps: {
                  // Store all other application-specific data here
                  eventName: event.event_name,
                  artistName: event.artist_name,
                  artistType: event.artist_type,
                  city: event.city,
                  venue: event.venue,
                  artistFee: parseFloat(event.artist_amount || '0'),
                  promoterName: event.promoter_name,
                  promoterPhone: event.promoter_phone,
                  promoterEmail: event.promoter_email,
                  status: event?.status?.name || 'Unknown',
                  statusId: event?.status?._id,
                  source: event?.source,
                  // Extract date/time parts for form population
                  startDate: this.extractLocalDate(event.start_time),
                  startTime: this.extractLocalTime(event.start_time),
                  endDate: this.extractLocalDate(event.end_time),
                  endTime: this.extractLocalTime(event.end_time),
                },
              };
            });
          } else {
            console.error('Failed to fetch calendar events:', response.message);
            return [];
          }
        })
      );
  }

  /**
   * Creates a new event.
   * @param eventData - The event data from the form.
   * @returns An Observable with the API response.
   */
  createEvent(eventData: EventData): Observable<any> {
    const payload = this.mapToApi(eventData);
    return this.http.post<ApiResponse<any>>(`${this.apiUrl}/event`, payload, {
      withCredentials: true,
    });
  }

  /**
   * Updates an existing event.
   * @param id - The ID of the event to update.
   * @param eventData - The partial event data to update.
   * @returns An Observable with the API response.
   */
  updateEvent(id: string, eventData: Partial<EventData>): Observable<any> {
    const payload = this.mapToApi(eventData);
    return this.http.patch<ApiResponse<any>>(
      `${this.apiUrl}/event/${id}`,
      payload,
      { withCredentials: true }
    );
  }

  /**
   * Deletes an event.
   * @param id - The ID of the event to delete.
   * @returns An Observable with the API response.
   */
  deleteEvent(id: string): Observable<any> {
    return this.http.delete<ApiResponse<any>>(`${this.apiUrl}/event/${id}`, {
      withCredentials: true,
    });
  }

  /**
   * Fetches a single event by its ID.
   * @param id - The ID of the event to fetch.
   * @returns An Observable with the API response.
   */
  getEvent(id: string): Observable<any> {
    return this.http.get<ApiResponse<any>>(`${this.apiUrl}/event/${id}`, {
      withCredentials: true,
    });
  }

  // --- STATUS MANAGEMENT METHODS ---

  /**
   * Fetches all statuses.
   * @returns An Observable array of Status objects.
   */
  getStatuses(): Observable<Status[]> {
    return this.http
      .get<ApiResponse<any[]>>(`${this.apiUrl}/statuses`, {
        withCredentials: true,
      })
      .pipe(
        map((res) => {
          if (res.code === 200 && Array.isArray(res.data)) {
            return res.data.map((rawStatus: any) => ({
              _id: rawStatus._id,
              name: rawStatus.name || 'Unnamed Status',
              color: rawStatus.color || '#808080', // Default to grey
            }));
          } else {
            console.error('Failed to fetch statuses:', res.message);
            return [];
          }
        })
      );
  }

  /**
   * Creates a new status.
   * @param statusData - The name and color for the new status.
   * @returns An Observable with the API response.
   */
  createStatus(statusData: { name: string; color: string }): Observable<any> {
    const payload = this.mapStatusToApi(statusData);
    return this.http.post<ApiResponse<any>>(`${this.apiUrl}/status`, payload, {
      withCredentials: true,
    });
  }


  /**
   * Updates an existing status.
   * @param id - The ID of the status to update.
   * @param statusData - The new name and color for the status.
   * @returns An Observable with the API response.
   */
  updateStatus(
    id: string,
    statusData: { name: string; color: string }
  ): Observable<any> {
    const payload = this.mapStatusToApi(statusData);
    return this.http.patch<ApiResponse<any>>(
      `${this.apiUrl}/status/${id}`,
      payload,
      { withCredentials: true }
    );
  }

  /**
   * Deletes a status.
   * @param id - The ID of the status to delete.
   * @returns An Observable with the API response.
   */
  deleteStatus(id: string): Observable<any> {
    return this.http.delete<ApiResponse<any>>(`${this.apiUrl}/status/${id}`, {
      withCredentials: true,
    });
  }

  private mapStatusToApi(statusData: Partial<Status>): {
    name?: string;
    color?: string;
  } {
    const payload: { name?: string; color?: string } = {};
    if (statusData.name !== undefined) {
      payload.name = statusData.name;
    }
    if (statusData.color !== undefined) {
      payload.color = statusData.color;
    }
    return payload;
  }

  // --- HELPER METHODS ---

  /**
   * Extracts local date in YYYY-MM-DD format from an ISO string or Date object.
   * @param isoString - The date string or object from the backend.
   * @returns A formatted date string.
   */
  private extractLocalDate(isoString: string | Date): string {
    if (!isoString) return '';
    const date =
      typeof isoString === 'string' ? parseISO(isoString) : isoString;
    return format(date, 'yyyy-MM-dd');
  }

  /**
   * Extracts local time in HH:mm:ss format from an ISO string or Date object.
   * @param isoString - The date string or object from the backend.
   * @returns A formatted time string.
   */
  private extractLocalTime(isoString: string | Date): string {
    if (!isoString) return '';
    const date =
      typeof isoString === 'string' ? parseISO(isoString) : isoString;
    return format(date, 'HH:mm:ss');
  }

  /**
   * Combines local date and time strings into a full ISO 8601 string.
   * @param dateStr - The date part (e.g., "2025-12-25").
   * @param timeStr - The time part (e.g., "20:00:00").
   * @returns A full ISO date string.
   */
  // private combineToISOString(dateStr: string, timeStr: string): string {
  //   if (!dateStr || !timeStr) return '';
  //   return new Date(`${dateStr}T${timeStr}`).toISOString();
  // }

private combineToISOString(dateStr: string, timeStr: string): string {
    if (!dateStr || !timeStr) return '';
    // Append 'Z' to the combined string to specify the time is in UTC.
    // This prevents the browser's local timezone from being applied.
    const timeWithSeconds = timeStr.length === 5 ? `${timeStr}:00` : timeStr;
    return new Date(`${dateStr}T${timeWithSeconds}Z`).toISOString();
  }

  /**
   * Maps the frontend EventData object to the backend API payload format.
   * @param eventData - The event data from the application.
   * @returns A payload object matching the new backend schema.
   */
  private mapToApi(eventData: Partial<EventData>): any {
    const payload: any = {};

    // Map properties from frontend name to backend name
    if(eventData.id !==undefined)
      payload._id = eventData.id
    if (eventData.eventName !== undefined)
      payload.event_name = eventData.eventName;
    if (eventData.artistName !== undefined)
      payload.artist_name = eventData.artistName;
    if (eventData.artistType !== undefined)
      payload.artist_type = eventData.artistType;
    if (eventData.status !== undefined) payload.status = eventData.status;
    if (eventData.city !== undefined) payload.city = eventData.city;
    if (eventData.venue !== undefined) payload.venue = eventData.venue;
    if (eventData.artistFee !== undefined)
      payload.artist_amount = eventData.artistFee;
    if (eventData.promoterName !== undefined)
      payload.promoter_name = eventData.promoterName;
    if (eventData.promoterPhone !== undefined)
      payload.promoter_phone = eventData.promoterPhone;
    if (eventData.promoterEmail !== undefined)
      payload.promoter_email = eventData.promoterEmail;
    if(eventData.source !==undefined)
      payload.source = eventData.source || 'mongo';
    // if(eventData.backgroundColor !==undefined)
    //   payload.color = eventData.backgroundColor;
    // Handle the new date/time schema
    if (eventData.startDate) {
      payload.start_date = eventData.startDate;
      if (eventData.startTime) {
        payload.start_time = this.combineToISOString(
          eventData.startDate,
          eventData.startTime
        );
      }
    }
    
    const effectiveEndDate = eventData.endDate || eventData.startDate;

    if (effectiveEndDate) {
      payload.end_date = effectiveEndDate;
      if (eventData.endTime) {
        payload.end_time = this.combineToISOString(
          effectiveEndDate,
          eventData.endTime
        );
      }
    }

    return payload;
  }
}
