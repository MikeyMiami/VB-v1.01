// utils/calendar.js
const { google } = require('googleapis');
const db = require('./db');

async function createCalendarEvent({
  agentId,
  recipientEmail,
  startTime,
  durationMinutes = 15,
  location = 'Phone Call',
  title = 'Appointment with Mikey',
  description = ''
}) {
  if (!agentId || !startTime) {
    throw new Error('Missing required parameters: agentId or startTime');
  }

  // 🔐 Get OAuth credentials from DB
  const integration = await new Promise((resolve, reject) => {
    db.get(
      `SELECT * FROM Integrations WHERE agent_id = ? AND integration_type = 'google_calendar'`,
      [agentId],
      (err, row) => {
        if (err) return reject(err);
        resolve(row);
      }
    );
  });

  if (!integration || !integration.creds) {
    throw new Error('Missing or invalid integration credentials for this agent.');
  }

  let creds;
  try {
    creds = JSON.parse(integration.creds);
  } catch (e) {
    throw new Error('Failed to parse stored credentials.');
  }

  const oAuth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );

  oAuth2Client.setCredentials({
    access_token: creds.access_token,
    refresh_token: creds.refresh_token,
  });

  const calendar = google.calendar({ version: 'v3', auth: oAuth2Client });

  const start = new Date(startTime);
  const end = new Date(start.getTime() + durationMinutes * 60000);

  const event = {
    summary: title,
    description,
    location,
    start: { dateTime: start.toISOString() },
    end: { dateTime: end.toISOString() },
    attendees: recipientEmail ? [{ email: recipientEmail }] : [],
  };

  try {
    const res = await calendar.events.insert({
      calendarId: 'primary',
      resource: event,
    });

    console.log('✅ Calendar event created successfully:', res.data.htmlLink);
    return res.data;
  } catch (err) {
    console.error('❌ Failed to create calendar event:', err.response?.data || err.message);
    throw new Error('Google Calendar API error');
  }
}

module.exports = { createCalendarEvent };



