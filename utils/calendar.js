const { google } = require('googleapis');
const db = require('../db');

async function createCalendarEvent({
  agentId,
  recipientEmail,
  startTime,
  durationMinutes = 15,
  location = 'Phone Call',
  title = 'Meeting',
  description = '',
}) {
  const client = await db.connect();

  try {
    // ✅ Fixed: Pass agentId directly, not full body
    const integrationQuery = await client.query(
      'SELECT * FROM Integrations WHERE agent_id = $1 AND integration_type = $2',
      [agentId, 'google_calendar']
    );

    const integration = integrationQuery.rows[0];

    if (!integration) {
      throw new Error('No Google Calendar integration found for this agent.');
    }

    const creds = JSON.parse(integration.calendar_token || '{}');

    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({
      access_token: creds.access_token,
      refresh_token: creds.refresh_token,
      scope: creds.scope,
      token_type: creds.token_type,
      expiry_date: creds.expiry_date,
    });

    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    const endTime = new Date(new Date(startTime).getTime() + durationMinutes * 60000).toISOString();

    const event = {
      summary: title,
      description,
      start: {
        dateTime: startTime,
        timeZone: 'America/New_York',
      },
      end: {
        dateTime: endTime,
        timeZone: 'America/New_York',
      },
      location,
      attendees: recipientEmail ? [{ email: recipientEmail }] : [],
    };

    const response = await calendar.events.insert({
      calendarId: 'primary',
      resource: event,
    });

    return response.data;
  } catch (err) {
    console.error('❌ Error creating calendar event:', err.message);
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { createCalendarEvent };

