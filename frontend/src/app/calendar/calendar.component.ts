import {
  Component,
  ViewChild,
  AfterViewInit,
  ChangeDetectorRef,
  Inject,
  PLATFORM_ID,
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import {
  FullCalendarModule,
  FullCalendarComponent,
} from '@fullcalendar/angular';
import { CalendarOptions, CalendarApi, EventInput } from '@fullcalendar/core';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import multiMonthPlugin from '@fullcalendar/multimonth';
import {
  EventService,
  EventData,
  Status,
  ZohoMasterDataItem,
} from '../services/event.service';
import { NotificationService } from '../services/notification.service';
import listPlugin from '@fullcalendar/list';
import { NotificationComponent } from '../notification/notification.component';
import { RouterLink, Router } from '@angular/router';
import { AuthService } from '../services/auth.service'; // Import AuthService

// Define different calendar view types as constants
enum CalendarView {
  MONTH = 'dayGridMonth',
  WEEK = 'timeGridWeek',
  DAY = 'timeGridDay',
  QUARTER = 'quarterView',
  YEAR = 'yearView',
  NINE_MONTHS_LIST = 'nineMonthsListView',
}

interface ViewDisplayNames {
  [key: string]: string;
}

@Component({
  selector: 'app-calendar',
  standalone: true,
  imports: [
    CommonModule,
    FullCalendarModule,
    FormsModule,
    NotificationComponent,
    RouterLink,
  ],
  templateUrl: './calendar.component.html',
  styleUrls: ['./calendar.component.css'],
})
export class CalendarComponent implements AfterViewInit {
  @ViewChild('calendarRef') calendarComponent!: FullCalendarComponent;

  isSettingsOpen = false;

  currentMonthTitle: string = '';
  currentViewName: string = 'Month';
  isBrowser: boolean;
  isCalendarLoading: boolean = true;
  currentViewValue: string = CalendarView.MONTH;

  // --- State for Filters ---
  allEvents: EventInput[] = [];

  // --- Master Data from Zoho for Form Dropdowns ---
  allArtists: ZohoMasterDataItem[] = [];
  allPromoters: ZohoMasterDataItem[] = [];
  allVenues: ZohoMasterDataItem[] = [];
  allCities: ZohoMasterDataItem[] = [];

  // --- Data for Toolbar Filters ---
  selectedArtist: string = '';
  allEventTitles: string[] = [];

  selectedVenue: string = '';
  allVenuesFilter: string[] = [];

  selectedPromoter: string = '';
  allPromoterNames: string[] = [];

  selectedCity: string = '';
  allCityFilter: string[] = [];

  availableStatuses: Status[] = [];

  clearFilters(): void {
    this.selectedArtist = '';
    this.selectedVenue = '';
    this.selectedPromoter = '';
    this.selectedCity = '';
    this.applyFilters();
  }

  // --- State for Popups ---
  isFormPopupVisible = false;
  isEditMode = false;
  selectedEvent: any = null;
  currentEditingEventId: string | null = null;

  // --- Model for the "Add/Edit Event" Form, aligned with EventData interface ---
  newEvent: EventData = {
    eventName: '',
    artistName: '',
    artistType: '',
    status: '',
    city: '',
    venue: '',
    artistFee: 0,
    startDate: '',
    startTime: '',
    endDate: '',
    endTime: '',
    promoterName: '',
    promoterPhone: '',
    promoterEmail: '',
  };

  private readonly VIEW_DISPLAY_NAMES: ViewDisplayNames = {
    [CalendarView.MONTH]: 'Month',
    [CalendarView.WEEK]: 'Week',
    [CalendarView.DAY]: 'Day',
    [CalendarView.QUARTER]: 'Quarter',
    [CalendarView.YEAR]: 'Year',
    [CalendarView.NINE_MONTHS_LIST]: '9 Months List',
  };

  private readonly QUARTER_CONFIG = {
    MONTHS_IN_QUARTER: 9,
    QUARTER_DURATION: { months: 9 },
    MAX_COLUMNS: 9,
    multiMonthMinWidth: 300,
    fixedWeekCount: false,
    showNonCurrentDates: true,
    dayMaxEvents: 4,
    moreLinkClick: 'popover',
  };

  private readonly YEAR_CONFIG = {
    MONTHS_IN_YEAR: 12,
    YEAR_DURATION: { months: 12 },
    MAX_COLUMNS: 3,
    multiMonthMinWidth: 350,
    dayMaxEvents: 2,
    moreLinkClick: 'popover',
  };

  private readonly NINE_MONTHS_LIST_CONFIG = {
    DURATION: { months: 9 },
    listDayFormat: {
      weekday: 'long' as const,
      month: 'short' as const,
      day: 'numeric' as const,
    },
    noEventsText: 'No events scheduled for this period',
  };

  // Main calendar configuration object
  calendarOptions: CalendarOptions = {
    initialView: CalendarView.MONTH,
    plugins: [
      dayGridPlugin,
      timeGridPlugin,
      interactionPlugin,
      multiMonthPlugin,
      listPlugin,
    ],
    editable: false,
    selectable: true,
    headerToolbar: false,
    datesSet: this.handleDatesChange.bind(this),
    views: {
      [CalendarView.QUARTER]: {
        type: 'multiMonth',
        duration: this.QUARTER_CONFIG.QUARTER_DURATION,
        multiMonthMaxColumns: this.QUARTER_CONFIG.MAX_COLUMNS,
        multiMonthMinWidth: this.QUARTER_CONFIG.multiMonthMinWidth,
        fixedWeekCount: this.QUARTER_CONFIG.fixedWeekCount,
        showNonCurrentDates: this.QUARTER_CONFIG.showNonCurrentDates,
        dayMaxEvents: this.QUARTER_CONFIG.dayMaxEvents,
      },
      [CalendarView.YEAR]: {
        type: 'multiMonth',
        duration: this.YEAR_CONFIG.YEAR_DURATION,
        multiMonthMaxColumns: this.YEAR_CONFIG.MAX_COLUMNS,
        multiMonthMinWidth: this.YEAR_CONFIG.multiMonthMinWidth,
        dayMaxEvents: this.YEAR_CONFIG.dayMaxEvents,
        moreLinkClick: this.YEAR_CONFIG.moreLinkClick,
      },
      [CalendarView.NINE_MONTHS_LIST]: {
        type: 'list',
        duration: { months: 1 },
        listDayFormat: {
          weekday: 'long',
          month: 'short',
          day: 'numeric',
        },
        noEventsText: 'No events scheduled for this period',
      },
    },
    dayCellClassNames: this.getDayCellClassNames.bind(this),
    events: [], // Events will be loaded dynamically

    // Hook to customize the inner content of the event (dot + text)
    eventContent: (arg) => {
      const statusColor = arg.event.backgroundColor || '#908081';
      const statusDotHtml = `<span class="fc-event-dot" style="background-color: ${statusColor};"></span>`;
      const title = arg.event.title;
      const city = arg.event.extendedProps['city'];
      const venue = arg.event.extendedProps['venue'];
      let textHtml = `<b>${title} </b>`;
      const locationParts = [];
      if (city) locationParts.push(city);
      if (venue) locationParts.push(venue);
      const locationString = locationParts.join(', ');
      if (locationString) {
        textHtml += `<i>${locationString}</i>`;
      }
      const finalHtml = `
        <div style="display: flex; align-items: flex-start; overflow: hidden;">
          ${statusDotHtml}
          <div class="fc-event-title" style="white-space: normal; margin-left: 6px;">
            ${textHtml}
          </div>
        </div>
      `;
      return { html: finalHtml };
    },

    // Hook to style the main container of the event (background color)
    eventDidMount: this.handleEventDidMount.bind(this),

    eventClick: this.handleEventClick.bind(this),
  };

  constructor(
    private cdr: ChangeDetectorRef,
    private http: HttpClient,
    private eventService: EventService,
    private notificationService: NotificationService,
    private router: Router,
    private authService: AuthService,
    @Inject(PLATFORM_ID) private platformId: Object
  ) {
    this.isBrowser = isPlatformBrowser(this.platformId);
    this.fetchStatuses();
    this.fetchZohoMasterData();
  }

  /**
   * Fetches master data from the Zoho API and populates the component's state.
   */
  private fetchZohoMasterData(): void {
    if (!this.isBrowser) return;

    this.eventService.getZohoMasterData().subscribe({
      next: (response) => {
        if (response.code === 200 && response.data) {
          this.allArtists = response.data.artist || [];
          this.allPromoters = response.data.promoter || [];
          this.allVenues = response.data.venue || [];
          this.allCities = response.data.city.filter((c) => c.name) || [];
          this.cdr.detectChanges();
        }
      },
      error: (err: HttpErrorResponse) => {
        if (err.status === 401) {
          this.router.navigate(['/login']);
        }
        console.error('Failed to load Zoho master data:', err);
        this.notificationService.error(
          'Master Data Error',
          'Could not load data for form dropdowns.'
        );
      },
    });
  }

  toggleSettings(): void {
    this.isSettingsOpen = !this.isSettingsOpen;
  }

  closeSettings(): void {
    this.isSettingsOpen = false;
  }

  logout(): void {
    this.closeSettings();
    this.authService.logout().subscribe({
      next: () => {
        this.notificationService.success(
          'Logged Out',
          'You have been successfully logged out.'
        );
        this.router.navigate(['/login']);
      },
      error: (err) => {
        console.error('Logout failed:', err);
        this.notificationService.error(
          'Logout Failed',
          'Could not log out properly, but redirecting.'
        );
        this.router.navigate(['/login']);
      },
    });
  }

  private fetchStatuses(): void {
    if (!this.isBrowser) return;

    this.eventService.getStatuses().subscribe({
      next: (statuses) => {
        this.availableStatuses = statuses;
      },
      error: (err: HttpErrorResponse) => {
        console.error('Failed to load statuses:', err);
        if (err.status === 401) {
          this.router.navigate(['/login']);
        }
      },
    });
  }
  get selectedStatusColor(): string {
    if (!this.newEvent.status || !this.availableStatuses.length) {
      return '#E5E7EB';
    }
    const selectedStatus = this.availableStatuses.find(
      (s) => s._id === this.newEvent.status
    );
    return selectedStatus?.color || '#E5E7EB';
  }

  getTextColorForBg(hexColor: string): string {
    if (!hexColor) return '#000000';
    const r = parseInt(hexColor.slice(1, 3), 16);
    const g = parseInt(hexColor.slice(3, 5), 16);
    const b = parseInt(hexColor.slice(5, 7), 16);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.5 ? '#000000' : '#FFFFFF';
  }

  // --- Popup and Form Methods ---

  openAddEventForm(): void {
    this.isEditMode = false;
    this.currentEditingEventId = null;
    this.resetForm();
    this.isFormPopupVisible = true;
  }

  onVenueChange(): void {
    const selectedVenueName = this.newEvent.venue;
    if (!selectedVenueName) {
      return;
    }
    const selectedVenueObject = this.allVenues.find(
      (v) => v.name === selectedVenueName
    );
    if (!selectedVenueObject) {
      return;
    }
    const correspondingCity = this.allCities.find(
      (c) => c.id === selectedVenueObject.id
    );
    if (correspondingCity) {
      this.newEvent.city = correspondingCity.name;
    }
  }

  openEditEventForm(event: any): void {
    const sourceType = event?.extendedProps?.source;
    if (sourceType && sourceType !== 'mongo') {
      this.notificationService.info(
        'Read-only Event',
        'This event is from an external source and cannot be edited.'
      );
      return;
    }

    this.isEditMode = true;
    this.currentEditingEventId = this.selectedEvent?.id || event.id;

    const matchedStatus = this.availableStatuses.find(
      (s) =>
        s._id === event.extendedProps.statusId ||
        s.name === event.extendedProps.status
    );

    this.newEvent = {
      eventName: event.extendedProps.eventName || '',
      artistName: event.title,
      artistType: event.extendedProps.artistType || '',
      city: event.extendedProps.city || '',
      status: matchedStatus ? matchedStatus._id : '',
      venue: event.extendedProps.venue || '',
      artistFee: event.extendedProps.artistFee || 0,
      startDate: event.extendedProps.startDate || '',
      startTime: event.extendedProps.startTime || '',
      endDate: event.extendedProps.endDate || '',
      endTime: event.extendedProps.endTime || '',
      promoterName: event.extendedProps.promoterName || '',
      promoterPhone: event.extendedProps.promoterPhone || '',
      promoterEmail: event.extendedProps.promoterEmail || '',
    };

    this.isFormPopupVisible = true;
    this.selectedEvent = null;
  }

  closeAddEventForm(): void {
    this.isFormPopupVisible = false;
    this.isEditMode = false;
    this.currentEditingEventId = null;
    this.resetForm();
  }

  handleEventClick(arg: any): void {
    this.selectedEvent = {
      id: arg.event.id,
      title: arg.event.title,
      start: arg.event.start,
      end: arg.event.end,
      backgroundColor: arg.event.backgroundColor,
      color: arg.event.backgroundColor || arg.event.extendedProps?.color,
      extendedProps: arg.event.extendedProps,
    };
  }

  // Styles each event's container after it renders
  handleEventDidMount(arg: any): void {
    const bgColor = arg.event.backgroundColor;
    if (bgColor) {
      arg.el.style.backgroundColor = bgColor;
      arg.el.style.borderColor = bgColor;
      arg.el.style.color = this.getTextColorForBg(bgColor);
    }
  }

  closeEventPopup(): void {
    this.selectedEvent = null;
  }

  onFormSubmit(): void {
    if (
      !this.isBrowser ||
      !this.newEvent.eventName ||
      !this.newEvent.artistName ||
      !this.newEvent.startDate ||
      !this.newEvent.startTime ||
      !this.newEvent.endDate ||
      !this.newEvent.endTime
    ) {
      this.notificationService.warning(
        'Missing Required Fields',
        'Please fill in all required fields to continue.'
      );
      return;
    }

    const startDateTime = new Date(
      `${this.newEvent.startDate}T${this.newEvent.startTime}`
    );
    const endDateTime = new Date(
      `${this.newEvent.endDate}T${this.newEvent.endTime}`
    );

    if (endDateTime <= startDateTime) {
      this.notificationService.error(
        'Invalid Date Range',
        'End date and time must be after the start date and time.'
      );
      return;
    }

    if (this.isEditMode && this.currentEditingEventId) {
      this.updateEvent();
    } else {
      this.createEvent();
    }
  }

  private createEvent(): void {
    this.eventService.createEvent(this.newEvent).subscribe({
      next: (response) => {
        if (response.code === 200) {
          this.notificationService.success(
            'Event Created Successfully!',
            `${this.newEvent.artistName}'s event has been added to your calendar.`
          );
          this.clearFilters();
          this.loadEvents();
          this.closeAddEventForm();
        } else {
          this.notificationService.error(
            'Failed to Create Event',
            response.message || 'An unexpected error occurred.'
          );
        }
      },
      error: (error) => {
        console.error('Error creating event:', error);
        this.notificationService.error(
          'Creation Failed',
          'Unable to create the event. Please check your connection and try again.'
        );
      },
    });
  }

  private updateEvent(): void {
    if (!this.currentEditingEventId) return;

    this.eventService
      .updateEvent(this.currentEditingEventId, this.newEvent)
      .subscribe({
        next: (response) => {
          if (response.code === 200) {
            this.notificationService.success(
              'Event Updated Successfully!',
              `${this.newEvent.artistName}'s event has been updated.`
            );
            this.clearFilters();
            this.loadEvents();
            this.closeAddEventForm();
          } else {
            this.notificationService.error(
              'Failed to Update Event',
              response.message || 'An unexpected error occurred.'
            );
          }
        },
        error: (error) => {
          console.error('Error updating event:', error);
          this.notificationService.error(
            'Update Failed',
            'Unable to update the event. Please check your connection and try again.'
          );
        },
      });
  }

  deleteEvent(eventId: string): void {
    const event = this.calendarApi?.getEventById(eventId);
    const sourceType = (event as any)?.extendedProps?.source;
    if (sourceType && sourceType !== 'mongo') {
      this.notificationService.info(
        'Read-only',
        'Cannot delete external events.'
      );
      return;
    }

    this.eventService.deleteEvent(eventId).subscribe({
      next: (response) => {
        if (response.code === 200) {
          this.notificationService.success(
            'Event Deleted',
            'The event has been removed from your calendar.'
          );
          this.loadEvents();
          this.closeEventPopup();
        } else {
          this.notificationService.error(
            'Failed to Delete Event',
            response.message || 'An unexpected error occurred.'
          );
        }
      },
      error: (error) => {
        console.error('Error deleting event:', error);
        this.notificationService.error(
          'Deletion Failed',
          'Unable to delete the event. Please check your connection and try again.'
        );
      },
    });
  }

  private loadEvents(): void {
    if (!this.isBrowser) return;
    this.isCalendarLoading = true;
    this.eventService.getCalendarEvents().subscribe({
      next: (events) => {
        this.processAndRenderEvents(events);
        this.scheduleUpdate(() => {
          this.updateCurrentMonthTitle();
        });
        this.isCalendarLoading = false;
      },
      error: (error) => {
        if (error.status === 401) {
          this.router.navigate(['/login']);
        }
        console.error('Error loading events:', error);
        this.notificationService.error(
          'Failed to Load Events',
          'Unable to load calendar events. Please refresh the page and try again.'
        );
        this.isCalendarLoading = false;
      },
    });
  }

  private resetForm(): void {
    this.newEvent = {
      eventName: '',
      artistName: '',
      artistType: '',
      status: '',
      city: '',
      venue: '',
      artistFee: 0,
      startDate: '',
      startTime: '',
      endDate: '',
      endTime: '',
      promoterName: '',
      promoterPhone: '',
      promoterEmail: '',
    };
  }

  // --- Calendar Initialization and Control ---

  ngAfterViewInit(): void {
    if (!this.isBrowser) {
      return;
    }
    this.loadEvents();
  }

  private processAndRenderEvents(events: EventInput[]): void {
    this.allEvents = events;

    const titles = new Set<string>();
    const venues = new Set<string>();
    const promoterNames = new Set<string>();
    const cities = new Set<string>();

    events.forEach((event) => {
      if (event.title) titles.add(event.title);
      if (event.extendedProps?.['venue'])
        venues.add(event.extendedProps['venue']);
      if (event.extendedProps?.['promoterName'])
        promoterNames.add(event.extendedProps['promoterName']);
      if (event.extendedProps?.['city'])
        cities.add(event.extendedProps['city']);
    });

    this.allEventTitles = [...titles].sort();
    this.allVenuesFilter = [...venues].sort();
    this.allPromoterNames = [...promoterNames].sort();
    this.allCityFilter = [...cities].sort();

    this.applyFilters();
  }

  onFilterChange(): void {
    if (!this.isBrowser) return;
    this.applyFilters();
  }

  private applyFilters(): void {
    let filteredEvents = this.allEvents;

    if (this.selectedArtist) {
      filteredEvents = filteredEvents.filter(
        (event) => event.title === this.selectedArtist
      );
    }
    if (this.selectedVenue) {
      filteredEvents = filteredEvents.filter(
        (event) => event.extendedProps?.['venue'] === this.selectedVenue
      );
    }
    if (this.selectedPromoter) {
      filteredEvents = filteredEvents.filter(
        (event) =>
          event.extendedProps?.['promoterName'] === this.selectedPromoter
      );
    }
    if (this.selectedCity) {
      filteredEvents = filteredEvents.filter(
        (event) => event.extendedProps?.['city'] === this.selectedCity
      );
    }
    const calendarApi = this.calendarApi;

    if (calendarApi) {
      calendarApi.removeAllEvents();
      calendarApi.addEventSource(filteredEvents);
    }
  }

  private get calendarApi(): CalendarApi | null {
    if (!this.isBrowser) {
      return null;
    }
    return this.calendarComponent?.getApi?.() ?? null;
  }

  changeView(view: string): void {
    if (!this.isBrowser) return;
    const api = this.calendarApi;
    if (!api) return;
    api.changeView(view);
    this.updateCurrentViewName(view);
    this.scheduleUpdate(() => this.updateCurrentMonthTitle());
  }

  goToNineMonthsList(): void {
    if (!this.isBrowser) return;
    const api = this.calendarApi;
    if (api) {
      api.changeView(CalendarView.NINE_MONTHS_LIST);
      this.updateCurrentViewName(CalendarView.NINE_MONTHS_LIST);
    }
  }

  goToQuarter() {
    if (!this.isBrowser) return;
    const api = this.calendarApi;
    if (api) {
      const currentDate = api.getDate();
      const startMonth = currentDate.getMonth();
      const start = new Date(currentDate.getFullYear(), startMonth, 1);
      api.changeView('quarterView', start);
      this.updateCurrentViewName('quarterView');
      this.updateCurrentMonthTitle();
    }
  }

  goToYear() {
    if (!this.isBrowser) return;
    const api = this.calendarApi;
    if (api) {
      const currentDate = api.getDate();
      const start = new Date(currentDate.getFullYear(), 0, 1);
      api.changeView('yearView', start);
      this.updateCurrentViewName('yearView');
      this.updateCurrentMonthTitle();
    }
  }

  goToPrev() {
    if (!this.isBrowser) return;
    const api = this.calendarApi;
    if (!api) return;
    const currentViewType = api.view.type;
    const currentDate = api.getDate();

    if (currentViewType === CalendarView.QUARTER) {
      const prevDate = new Date(
        currentDate.getFullYear(),
        currentDate.getMonth() - this.QUARTER_CONFIG.MONTHS_IN_QUARTER,
        1
      );
      api.gotoDate(prevDate);
    } else if (currentViewType === CalendarView.YEAR) {
      const prevYear = new Date(currentDate.getFullYear() - 1, 0, 1);
      api.gotoDate(prevYear);
    } else {
      api.prev();
    }
    this.updateCurrentMonthTitle();
  }

  goToNext() {
    if (!this.isBrowser) return;
    const api = this.calendarApi;
    if (!api) return;
    const currentViewType = api.view.type;
    const currentDate = api.getDate();

    if (currentViewType === CalendarView.QUARTER) {
      const nextDate = new Date(
        currentDate.getFullYear(),
        currentDate.getMonth() + this.QUARTER_CONFIG.MONTHS_IN_QUARTER
      );
      api.gotoDate(nextDate);
    } else if (currentViewType === CalendarView.YEAR) {
      const nextYear = new Date(currentDate.getFullYear() + 1, 0, 1);
      api.gotoDate(nextYear);
    } else {
      api.next();
    }
    this.updateCurrentMonthTitle();
  }

  goToToday() {
    if (!this.isBrowser) return;
    const api = this.calendarApi;
    if (!api) return;
    const currentView = api.view;
    if (currentView.type === CalendarView.YEAR) {
      const today = new Date();
      const yearStart = new Date(today.getFullYear(), 0, 1);
      api.gotoDate(yearStart);
    } else {
      api.today();
    }
    this.updateCurrentMonthTitle();
  }

  onDatesSet(): void {
    if (!this.isBrowser) return;
    this.updateCurrentMonthTitle();
  }

  private handleDatesChange(arg: any): void {
    if (!this.isBrowser) return;
    this.currentViewValue = arg.view.type;
    this.scheduleUpdate(() => this.updateCurrentMonthTitle());
  }

  onViewChange(event: Event): void {
    const selectElement = event.target as HTMLSelectElement;
    const viewName = selectElement.value;

    switch (viewName) {
      case CalendarView.QUARTER:
        this.goToQuarter();
        break;
      case CalendarView.YEAR:
        this.goToYear();
        break;
      case CalendarView.NINE_MONTHS_LIST:
        this.goToNineMonthsList();
        break;
      default:
        this.changeView(viewName);
        break;
    }
  }

  private getDayCellClassNames(arg: any): string[] {
    const month = arg.date.getMonth();
    const isQuarterEnd =
      (month + 1) % this.QUARTER_CONFIG.MONTHS_IN_QUARTER === 0;
    return isQuarterEnd ? ['end-of-quarter'] : [];
  }

  private updateCurrentMonthTitle(): void {
    if (!this.isBrowser) return;
    const api = this.calendarApi;
    if (!api) return;
    const currentView = api.view;
    const currentDate = api.getDate();
    switch (currentView.type) {
      case CalendarView.QUARTER:
        this.currentMonthTitle = this.getQuarterTitle(currentDate);
        break;
      case CalendarView.WEEK:
        this.currentMonthTitle = this.getWeekTitle(currentView);
        break;
      case CalendarView.DAY:
        this.currentMonthTitle = this.getDayTitle(currentDate);
        break;
      case CalendarView.YEAR:
        this.currentMonthTitle = this.getYearTitle(currentDate);
        break;
      case CalendarView.MONTH:
      default:
        this.currentMonthTitle = this.getMonthTitle(currentDate);
        break;
    }
  }

  // --- Title Formatting Methods ---

  private getQuarterTitle(date: Date): string {
    const year = date.getFullYear();
    const quarterStartMonth = Math.floor(date.getMonth());
    const quarterEndMonth =
      quarterStartMonth + this.QUARTER_CONFIG.MONTHS_IN_QUARTER;
    const startDate = new Date(year, quarterStartMonth, 1);
    const endDate = new Date(year, quarterEndMonth - 1, 1);
    const shortFormatter = new Intl.DateTimeFormat('en-US', { month: 'short' });
    const startMonth = shortFormatter.format(startDate);
    const endMonth = shortFormatter.format(endDate);

    if (startDate.getFullYear() !== endDate.getFullYear()) {
      return `${startMonth} ${startDate.getFullYear()} - ${endMonth} ${endDate.getFullYear()}`;
    }
    return `${startMonth} - ${endMonth} ${year}`;
  }

  private getYearTitle(date: Date): string {
    return date.getFullYear().toString();
  }

  private getWeekTitle(view: any): string {
    const start = view.activeStart;
    const end = new Date(view.activeEnd);
    end.setDate(end.getDate() - 1);
    const year = start.getFullYear();
    const isSameMonth = start.getMonth() === end.getMonth();
    const isSameYear = start.getFullYear() === end.getFullYear();
    if (isSameMonth) {
      const monthFormatter = new Intl.DateTimeFormat('en-US', {
        month: 'short',
      });
      const month = monthFormatter.format(start);
      return `${month} ${start.getDate()} - ${end.getDate()}, ${year}`;
    } else {
      const formatter = new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        year: isSameYear ? undefined : 'numeric',
      });
      const startStr = formatter.format(start);
      const endStr = formatter.format(end);
      return isSameYear
        ? `${startStr} - ${endStr}, ${year}`
        : `${startStr} - ${endStr}`;
    }
  }

  private getDayTitle(date: Date): string {
    const formatter = new Intl.DateTimeFormat('en-US', {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
    return formatter.format(date);
  }

  private getMonthTitle(date: Date): string {
    const formatter = new Intl.DateTimeFormat('en-US', {
      month: 'long',
      year: 'numeric',
    });
    return formatter.format(date);
  }

  private updateCurrentViewName(view: string): void {
    this.currentViewName = this.VIEW_DISPLAY_NAMES[view] ?? view;
  }

  private scheduleUpdate(updateFn: () => void): void {
    if (!this.isBrowser) return;
    setTimeout(() => {
      updateFn();
      this.cdr.detectChanges();
    }, 0);
  }
}
