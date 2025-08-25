import dotenv from 'dotenv';
dotenv.config();
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import axios from 'axios';
import cookieParser from 'cookie-parser';
import session from 'express-session';
import Event from './model/Event.js';
import Status from './model/Status.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const BACKEND_PORT = process.env.BACKEND_PORT || 3000;
const BACKEND_IP = process.env.BACKEND_IP || 'localhost';
const FRONTEND_PORT = process.env.FRONTEND_PORT || 4200;
const FRONTEND_IP = process.env.FRONTEND_IP || 'localhost';

// Environment Variables
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI;
const ZOHO_ACCOUNTS_URL = process.env.ZOHO_ACCOUNTS_URL;
const ZOHO_API_URL = process.env.ZOHO_API_URL;
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : ['http://localhost:3000', 'http://localhost:4200'];
const MONGODB_URI = process.env.MONGODB_URI;

// Middleware configuration
const corsOptions = {
    origin: ALLOWED_ORIGINS,
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
    credentials: true
};
app.use(cors(corsOptions));
app.use(express.json());
app.use(cookieParser());
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
    cookie: { secure: process.env.NODE_ENV === 'production' }
}));


/*app.get('/', (req, res) => {
  res.send(`Server running on http://${BACKEND_IP}:${BACKEND_PORT}`);
});*/




// --- Helper Functions for Zoho ---

// Function to exchange Grant Token for Access and Refresh Tokens
const exchangeCodeForTokens = async (code) => {
    try {
        const response = await axios.post(`${ZOHO_ACCOUNTS_URL}/oauth/v2/token`, null, {
            params: {
                code: code,
                client_id: CLIENT_ID,
                client_secret: CLIENT_SECRET,
                redirect_uri: REDIRECT_URI,
                grant_type: 'authorization_code'
            }
        });
        return response.data; // Contains access_token, refresh_token, expires_in, api_domain
    } catch (error) {
        console.error('Error exchanging code for tokens:', error.response ? error.response.data : error.message);
        throw new Error('Failed to exchange code for tokens');
    }
};

// Function to refresh Access Token using Refresh Token
const refreshAccessToken = async (refreshToken) => {
    try {
        const response = await axios.post(`${ZOHO_ACCOUNTS_URL}/oauth/v2/token`, null, {
            params: {
                refresh_token: refreshToken,
                client_id: CLIENT_ID,
                client_secret: CLIENT_SECRET,
                grant_type: 'refresh_token'
            }
        });
        return response.data; // Contains new access_token, expires_in
    } catch (error) {
        console.error('Error refreshing access token:', error.response ? error.response.data : error.message);
        throw new Error('Failed to refresh access token');
    }
};

// Middleware to check if user is authenticated (has Zoho tokens)
const isAuthenticated = async (req, res, next) => {
    let zohoTokens = req.session.zohoTokens;

    if (!zohoTokens || !zohoTokens.access_token) {
        return res.status(401).json({ message: 'Not authenticated with Zoho.' });
    }

    // Check if access token is expired or close to expiring (e.g., within 5 minutes)
    // Note: expires_in is usually in seconds
    const expiresInMinutes = zohoTokens.expires_in / 60;
    const issuedAt = zohoTokens.issued_at || (Date.now() / 1000);

    if ((Date.now() / 1000) > (issuedAt + zohoTokens.expires_in - 300)) {
        console.log('Access token is expired or near expiration. Attempting to refresh...');
        if (zohoTokens.refresh_token) {
            try {
                const refreshedData = await refreshAccessToken(zohoTokens.refresh_token);
                // Update session with new access token and new expiry
                req.session.zohoTokens.access_token = refreshedData.access_token;
                req.session.zohoTokens.expires_in = refreshedData.expires_in;
                req.session.zohoTokens.issued_at = Date.now() / 1000; // Update issued time
                console.log('Access token refreshed successfully.');
            } catch (error) {
                console.error('Failed to refresh token, forcing re-authentication:', error.message);
                req.session.destroy(() => {
                    return res.status(401).json({ message: 'Session expired, please re-authenticate.' });
                });
                return; // Stop further execution
            }
        } else {
            console.error('No refresh token available, forcing re-authentication.');
            req.session.destroy(() => {
                return res.status(401).json({ message: 'Session expired, please re-authenticate.' });
            });
            return; // Stop further execution
        }
    }
    next();
};

// Common function to fetch Zoho Events
const fetchZohoEvents = async (accessToken, apiDomain, params = {}) => {
  var criteria = '';
  var eventApiUrl = `${apiDomain}/crm/v8/Deals`;
  if (params.id) {
    eventApiUrl = `${apiDomain}/crm/v8/Deals/${params.id}`;
  }
  if (params.start_date && params.end_date) {
    criteria = `(Fecha_Inicio_Evento:between:(${params.start_date}T00:00:00Z,${params.end_date}T23:59:59Z))`;
  }

  const response = await axios.get(eventApiUrl, {
    headers: {
      'Authorization': `Zoho-oauthtoken ${accessToken}`
    },
    params: {
      fields: 'Deal_Name,Fecha_Inicio_Evento,Fecha_Fin_Evento,Artista,Ciudad,Recinto,Cach,Account_Name,Stage',
      per_page: 200,
      criteria: criteria,
      // Add criteria for date range if fetching for a specific month
      // e.g., criteria: `(Event_Date:between:2025-07-01 00:00:00,2025-07-31 23:59:59)`
    }
  });

  const list = response.data.data || [];
  // fetch more info using list.account_name.id and add it to the response
  const unresolvedEvents = list.map(async item => {
    
    // API call to fetch Artist type from Artista module using item.Artista.id
    try {
      var artistType = 'Access Denied';
      const artistTypeResponse = await axios.get(`${apiDomain}/crm/v8/Artistas/${item.Artista.id}`, {
        headers: {
          'Authorization': `Zoho-oauthtoken ${accessToken}`
        },
        params: {
          fields: 'Tipo_de_Eventos'
        }
      });
      artistType = artistTypeResponse.data.data[0].Tipo_de_Eventos || 'Unknown';
    } catch (error) {
      console.error('Error fetching artist type:', error.response ? error.response.data : error.message);
    }

    // API call to fetch Promoter phone and email from Account_Name module using item.Account_Name.id
    var promoterPhone = 'Access Denied', promoterEmail = 'Access Denied';
    try {
      const promoterResponse = await axios.get(`${apiDomain}/crm/v8/Accounts/${item.Account_Name.id}`, {
        headers: {
          'Authorization': `Zoho-oauthtoken ${accessToken}`
        },
        params: {
          fields: 'Tel_fono_Contratacion,Correo_Contratacion'
        }
      });
      promoterPhone = promoterResponse.data.data[0].Tel_fono_Contratacion || 'Unknown';
      promoterEmail = promoterResponse.data.data[0].Correo_Contratacion || 'Unknown';
    } catch (error) {
      console.error('Error fetching promoter details:', error.response ? error.response.data : error.message); 
    }

    // Fetch statuses from Status model
    // check if item.Stage exists in Status collection
    // If yes, use the color & status from Status collection
    const status = await Status.findOne({ status: item.Stage });
    const statusObj = {};
    if (status) {
      statusObj.name = status.name;
      statusObj.color = status.color;
    } else {
      statusObj.name = item.Stage 
      statusObj.color = '';
    }

    // Return the formatted event object
    let processedEvent = {
      _id: item.id,
      start_date: item.Fecha_Inicio_Evento,
      start_time: item.Fecha_Inicio_Evento,
      end_date: item.Fecha_Fin_Evento,
      end_time: item.Fecha_Fin_Evento,
      event_name: item.Deal_Name,
      artist_name: item.Artista.name,
      artist_type: artistType,
      city: item.Ciudad,
      venue: item.Recinto.name,
      artist_amount: item.Cach || 0,
      promoter_name: item.Account_Name.name,
      promoter_phone: promoterPhone,
      promoter_email: promoterEmail,
      source: "zoho",
      status: statusObj
    };
    return processedEvent;
  });
  // Wait for all promises to resolve
  const events = await Promise.all(unresolvedEvents);
  return events;
};

// Function to fetch Zoho Artists
const fetchZohoArtists = async (accessToken, apiDomain) => {
  try {
    const response = await axios.get(`${apiDomain}/crm/v8/Artistas`, {
      headers: {
        'Authorization': `Zoho-oauthtoken ${accessToken}`
      },
      params: {
        fields: 'Name'
      }
    });
    const artists = response.data.data || [];
    return artists.map(artist => ({
      id: artist.id,
      name: artist.Name
    })); 
  } catch (error) {
    console.error('Error fetching Zoho artists:', error.response ? error.response.data : error.message);
    throw new Error('Failed to fetch Zoho artists');
  }
};

// Function to fetch Zoho Promoters
const fetchZohoPromoters = async (accessToken, apiDomain) => {
  try {
    const response = await axios.get(`${apiDomain}/crm/v8/Accounts`, {
      headers: {
        'Authorization': `Zoho-oauthtoken ${accessToken}`
      },
      params: {
        fields: 'Account_Name'
      }
    });
    const promoters = response.data.data || [];
    return promoters.map(promoter => ({
      id: promoter.id,
      name: promoter.Account_Name
    }));
  } catch (error) {
    console.error('Error fetching Zoho promoters:', error.response ? error.response.data : error.message);
    throw new Error('Failed to fetch Zoho promoters');
  }
};

// Function to fetch Zoho Venues
const fetchZohoVenues = async (accessToken, apiDomain) => {
  try {
    const response = await axios.get(`${apiDomain}/crm/v8/Recintos`, {
      headers: {
        'Authorization': `Zoho-oauthtoken ${accessToken}`
      },
      params: {
        fields: 'Name'
      }
    });
    const venues = response.data.data || [];
    return venues.map(venue => ({
      id: venue.id,
      name: venue.Name
    })); 
  } catch (error) {
    console.error('Error fetching Zoho venues:', error.response ? error.response.data : error.message);
    throw new Error('Failed to fetch Zoho venues');
  }
};

// Function to fetch Zoho Cities
const fetchZohoCities = async (accessToken, apiDomain) => {
  try {
    const response = await axios.get(`${apiDomain}/crm/v8/Recintos`, {
      headers: {
        'Authorization': `Zoho-oauthtoken ${accessToken}`
      },
      params: {
        fields: 'Localidad'
      }
    });
    const venues = response.data.data || [];
    return venues.map(venue => ({
      id: venue.id,
      name: venue.Localidad
    })); 
  } catch (error) {
    console.error('Error fetching Zoho venues:', error.response ? error.response.data : error.message);
    throw new Error('Failed to fetch Zoho venues');
  }
};

// Function to create a task in Zoho CRM with event details
const createZohoTask = async (accessToken, apiDomain, event, isNew) => {
  var taskData = {};
  if(isNew){
    taskData = {
      Subject: `Create New Event: ${event.event_name}`,
      Due_Date: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      Description: ': : : : Event details : : : : \n' +
        'Event Name: ' + event.event_name + '\n\n' +
        'Start Date: ' + event.start_date.toISOString().split('T')[0] + '\n' +
        'Start Time: ' + event.start_time.toISOString().split('T')[1].split('.')[0] + '\n\n' +
        'End Date: ' + event.end_date.toISOString().split('T')[0] + '\n' +
        'End Time: ' + event.end_time.toISOString().split('T')[1].split('.')[0] + '\n\n' +
        'Artist Name: ' + event.artist_name + '\n' +
        'Artist Type: ' + event.artist_type + '\n' +
        'Artist Amount: ' + event.artist_amount + '\n\n' +
        'Venue: ' + event.venue + '\n' +
        'City: ' + event.city + '\n\n' +
        'Promoter Name: ' + event.promoter_name + '\n' +
        'Promoter Phone: ' + event.promoter_phone + '\n' +
        'Promoter Email: ' + event.promoter_email,
      Priority: 'Alto',
      Status: 'No iniciado',
    }
  } else {
    taskData = {
      Subject: `Update Event: ${event.event_name}`,
      Due_Date: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      What_Id: {
        id: event._id,
        name: event.event_name
      },
      Description: ': : : : Event details : : : : \n' +
        'Event Name: ' + event.event_name + '\n\n' +
        'Start Date: ' + event.start_date + '\n' +
        'Start Time: ' + event.start_time + '\n\n' +
        'End Date: ' + event.end_date + '\n' +
        'End Time: ' + event.end_time + '\n\n' +
        'Artist Name: ' + event.artist_name + '\n' +
        'Artist Type: ' + event.artist_type + '\n' +
        'Artist Amount: ' + event.artist_amount + '\n\n' +
        'Venue: ' + event.venue + '\n' +
        'City: ' + event.city + '\n\n' +
        'Promoter Name: ' + event.promoter_name + '\n' +
        'Promoter Phone: ' + event.promoter_phone + '\n' +
        'Promoter Email: ' + event.promoter_email,
      Priority: 'Alto',
      Status: 'No iniciado',
      $se_module: 'Deals'
    }
  }
  try {
    const response = await axios.post(`${apiDomain}/crm/v8/Tasks`, {
      data: [taskData]
    }, {
      headers: {
        'Authorization': `Zoho-oauthtoken ${accessToken}`
      }
    });
    return response.data;
  } catch (error) {
    console.error('Error creating task in Zoho CRM:', error.response ? error.response.data : error.message);
    throw new Error('Failed to create task in Zoho CRM');
  }
};




// Zoho OAuth Login
app.get('/api/login', (req, res) => {
    const authUrl = `${ZOHO_ACCOUNTS_URL}/oauth/v2/auth?scope=ZohoCRM.modules.ALL&client_id=${CLIENT_ID}&response_type=code&access_type=offline&redirect_uri=${REDIRECT_URI}`;
    res.json({ zohoAuthUrl: authUrl });
    // In frontend, redirect the user to this `zohoAuthUrl`
});

// Zoho redirects here after successful login
app.get('/oauth-callback', async (req, res) => {
    console.log(req.query);
    const code = req.query.code; // The authorization code from Zoho
    const error = req.query.error; // Zoho might send an error param

    if (error) {
        console.error('Zoho OAuth Error:', error);
        return res.redirect('/?error=' + encodeURIComponent('Zoho authentication failed: ' + error));
    }

    if (!code) {
        return res.status(400).send('Authorization code not found.');
    }

    try {
        const tokens = await exchangeCodeForTokens(code);
        // Store tokens securely in session or database
        req.session.zohoTokens = {
            access_token: tokens.access_token,
            refresh_token: tokens.refresh_token,
            expires_in: tokens.expires_in,
            api_domain: tokens.api_domain,
            issued_at: Date.now() / 1000 // Store when this token was issued (Unix timestamp)
        };
        console.log('Zoho tokens obtained and stored in session.');

        // Redirect to your app's main calendar page or dashboard
        res.redirect(`http://${FRONTEND_IP}:${FRONTEND_PORT}/calendar`);
    } catch (err) {
        console.error('Error during OAuth callback:', err.message);
        res.status(500).send('Authentication failed.');
    }
});

// Logout endpoint to clear session and tokens
app.get('/api/logout', (req, res) => {
    // Zoho provides an endpoint for revocation: https://accounts.zoho.com/oauth/v2/token/revoke
    req.session.destroy((err) => {
        if (err) {
            console.error('Error destroying session:', err);
            return res.status(500).json({ message: 'Logout failed.' });
        }
        res.clearCookie('connect.sid'); // Clear session cookie
        res.status(200).json({ message: 'Logged out successfully.' });
    });
});



// Zoho Events API routes
app.get('/api/zoho/events', isAuthenticated, async (req, res) => {
  try {
    const zohoTokens = req.session.zohoTokens;
    const accessToken = zohoTokens.access_token;
    const apiDomain = zohoTokens.api_domain || ZOHO_API_URL;

    // Fetch events from Zoho CRM
    const events = await fetchZohoEvents(accessToken, apiDomain);
    
    console.log('Events fetched from Zoho CRM:', events);
    res.status(200).json({
        message: 'Events fetched successfully',
        data: events
    });
  } catch (error) {
    console.error('Error fetching events from Zoho CRM:', error.response ? error.response.data : error.message);
    if (error.response && error.response.status === 401) {
      return res.status(401).json({ message: 'Unauthorized. Please re-authenticate.', error: error.response.data });
    }
    res.status(500).json({ message: 'Failed to fetch events from Zoho CRM.', error: error.message });
  }
});

app.get('/api/zoho/event/:id', isAuthenticated, async (req, res) => {
  try {
    const event = await fetchZohoEvents(req.session.zohoTokens.access_token, req.session.zohoTokens.api_domain, { id: req.params.id });
    console.log('Event:', event);

    res.status(200).json({
        message: 'Events fetched successfully',
        data: event
    });
  } catch (error) {
    console.error('Error fetching events from Zoho CRM:', error.response ? error.response.data : error.message);
    // If 401 (Unauthorized), it likely means token issue or scopes are wrong
    if (error.response && error.response.status === 401) {
      // This case should ideally be handled by isAuthenticated, but good to check here too
      return res.status(401).json({ message: 'Unauthorized. Please re-authenticate.', error: error.response.data });
    }
    res.status(500).json({ message: 'Failed to fetch events from Zoho CRM.', error: error.message });
  }
});

app.get('/api/zoho/master', isAuthenticated, async (req, res) => {
  try {
    const zohoTokens = req.session.zohoTokens;
    const accessToken = zohoTokens.access_token;
    const apiDomain = zohoTokens.api_domain || ZOHO_API_URL;

    const master = {};
    master.artist = await fetchZohoArtists(accessToken, apiDomain);
    master.promoter = await fetchZohoPromoters(accessToken, apiDomain);
    master.venue = await fetchZohoVenues(accessToken, apiDomain);
    master.city = await fetchZohoCities(accessToken, apiDomain);
    
    console.log('Master fetched from Zoho CRM:', master);
    res.status(200).json({
        code: 200,
        message: 'Master Events fetched successfully',
        data: master
    });
  } catch (error) {
    console.error('Error fetching master events from Zoho CRM:', error.response ? error.response.data : error.message);
    if (error.response && error.response.status === 401) {
      return res.status(401).json({ message: 'Unauthorized. Please re-authenticate.', error: error.response.data });
    }
    res.status(500).json({ message: 'Failed to fetch master events from Zoho CRM.', error: error.message });
  }
});



// Local Event API routes - CRUD operations
app.post('/api/event', isAuthenticated, async (req, res) => {
  const newEvent = new Event(req.body);
  try {
    const savedEvent = await newEvent.save();
    const access_token = req.session.zohoTokens.access_token;
    const apiDomain = req.session.zohoTokens.api_domain || ZOHO_API_URL;
    if (access_token && apiDomain) { 
      const createTaskResponse = await createZohoTask(access_token, apiDomain, savedEvent, true);
      console.log('Task created in Zoho CRM:', createTaskResponse);
    }
    res.status(200).json({
      code: 200,
      message: 'Event created successfully',
      data: savedEvent
    });
  } catch (error) {
    res.status(500).json({
      code: 500,
      message: 'Error creating event',
      error: error.message
    });
  }
});

app.get('/api/events', isAuthenticated, async (req, res) => {
  try {
    const events = await Event.find().populate('status');
    console.log('Events:', events);
    res.status(200).json({
      code: 200,
      message: 'Events fetched successfully',
      data: events
    });
  } catch (error) {
    res.status(500).json({
      code: 500,
      message: 'Error fetching events',
      error: error.message
    });
  }
});

app.get('/api/event/:id', isAuthenticated, async (req, res) => {
  try {
    const event = await Event.findById(req.params.id).populate('status');
    if (!event) {
      return res.status(404).json({
        code: 404,
        message: 'Event not found'
      });
    }
    res.status(200).json({
      code: 200,
      message: 'Event fetched successfully',
      data: event
    });
  } catch (error) {
    res.status(500).json({
      code: 500,
      message: 'Error fetching event',
      error: error.message
    });
  }
});

app.patch('/api/event/:id', isAuthenticated, async (req, res) => {
  try {
    if (req.body.source === 'zoho') {
      const access_token = req.session.zohoTokens.access_token;
      const apiDomain = req.session.zohoTokens.api_domain || ZOHO_API_URL;
      if (access_token && apiDomain && req.body.source === 'zoho') {
        var createTaskResponse = await createZohoTask(access_token, apiDomain, req.body, false);
        console.log('Task created in Zoho CRM:', createTaskResponse);
      }
      if (createTaskResponse.data[0].code !== 'SUCCESS') {
        return res.status(404).json({
          code: 404,
          message: 'Task to update could not be created in Zoho CRM',
          error: createTaskResponse.data[0].message
        });
      }
      var msg = 'Task to update event created successfully in Zoho CRM';
    } else {
      var updatedEvent = await Event.findByIdAndUpdate(req.params.id, req.body, { new: true });
      if (!updatedEvent) {
        return res.status(404).json({
          code: 404,
          message: 'Event not found'
        });
      }
    }
    res.status(200).json({
      code: 200,
      message: msg || 'Event updated successfully',
      data: updatedEvent
    });
  } catch (error) {
    res.status(500).json({
      code: 500,
      message: 'Error updating event',
      error: error.message
    });
  }
});

app.delete('/api/event/:id', isAuthenticated, async (req, res) => {
  try {
    const deletedEvent = await Event.findByIdAndDelete(req.params.id);
    if (!deletedEvent) {
      return res.status(404).json({
        code: 404,
        message: 'Event not found'
      });
    }
    res.status(200).json({
      code: 200,
      message: 'Event deleted successfully',
      data: deletedEvent
    });
  } catch (error) {
    return res.status(500).json({
      code: 500,
      message: 'Error deleting event',
      error: error.message
    });
  }
});


// API to fetch all zoho + mongo events
app.get('/api/events/all', isAuthenticated, async (req, res) => {
  try {
    console.log('Fetching all events with params:', req.query);
    const zohoEvents = await fetchZohoEvents(req.session.zohoTokens.access_token, req.session.zohoTokens.api_domain, req.query);

    const localEvents = await Event.find().populate('status');

    // Combine both events
    const allEvents = [...zohoEvents, ...localEvents];
    console.log('Combined Events:', allEvents);  
    res.status(200).json({
      code: 200,
      message: 'All events fetched successfully',
      data: allEvents
    });
  } catch (error) {
    console.error('Error fetching all events:', error.message);
    res.status(500).json({
      code: 500,
      message: 'Error fetching all events',
      error: error.message
    });
  }
});



// Status API routes
app.post('/api/status', isAuthenticated, async (req, res) => {
  const newStatus = new Status(req.body);
  try {
    const savedStatus = await newStatus.save();
    res.status(200).json({
      code: 200,
      message: 'Status created successfully',
      data: savedStatus
    });
  } catch (error) {
    res.status(500).json({
      code: 500,
      message: 'Error creating status',
      error: error.message
    });
  }
});

app.get('/api/statuses', isAuthenticated, async (req, res) => {
  try {
    const statuses = await Status.find();
    res.status(200).json({
      code: 200,
      message: 'Statuses fetched successfully',
      data: statuses
    });
  } catch (error) {
    res.status(500).json({
      code: 500,
      message: 'Error fetching statuses',
      error: error.message
    });
  }
});

app.get('/api/status/:id', isAuthenticated, async (req, res) => {
  try {
    const status = await Status.findById(req.params.id);
    if (!status) {
      return res.status(404).json({
        code: 404,
        message: 'Status not found'
      });
    }
    res.status(200).json({
      code: 200,
      message: 'Status fetched successfully',
      data: status
    });
  } catch (error) {
    res.status(500).json({
      code: 500,
      message: 'Error fetching status',
      error: error.message
    });
  }
});

app.patch('/api/status/:id', isAuthenticated, async (req, res) => {
    try {
        const updatedStatus = await Status.findByIdAndUpdate(req.params.id, req.body, { new: true });
        if (!updatedStatus) {
        return res.status(404).json({
            code: 404,
            message: 'Status not found'
        });
        } else {
        res.status(200).json({
            code: 200,
            message: 'Status updated successfully',
            data: updatedStatus
        });
        }
    } catch (error) {
    res.status(500).json({
      code: 500,
      message: 'Error updating status',
      error: error.message
    });
    }
});

app.delete('/api/status/:id', isAuthenticated, async (req, res) => {
    try {
        const deletedStatus = await Status.findByIdAndDelete(req.params.id);
        if (!deletedStatus) {
            return res.status(404).json({
                code: 404,
                message: 'Status not found'
            });
        }
        res.status(200).json({
            code: 200,
            message: 'Status deleted successfully',
            data: deletedStatus
        });
    } catch (error) {
        return res.status(500).json({
            code: 500,
            message: 'Error deleting status',
            error: error.message
        });
    }
});




// Serve a basic frontend HTML (for demonstration)
app.use(express.static('public')); // Assuming your frontend HTML/JS/CSS is in a 'public' folder

app.get('/calendar', (req, res) => {
    res.sendFile(__dirname + '/public/calendar.html');
});

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/index.html');
});



// Start the server
mongoose.connect(MONGODB_URI).then(() => {
  console.log('Connected to MongoDB'); 
  app.listen(BACKEND_PORT, () => {
    console.log(`Server running on http://${BACKEND_IP}:${BACKEND_PORT}`);
  });
}).catch(err => {
  console.error('MongoDB connection error:', err);
});