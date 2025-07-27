// utils/calendar.js
const { google } = require('googleapis');
const db = require('../db');

async function createCalendarEvent(agentId, recipientEmail, time, title, durationMinutes = 30) {
  const { rows } = await db.query(`SELECT tokens FROM Agents WHERE id = $1`, [agentId]);
  if (!rows.length) throw new Error('Agent not found');

  const tokens = rows[0].tokens;
  if (!tokens || !tokens.access_token) throw new Error('Missing Google access token');

  const oAuth2Client = new google.auth.OAuth2();
  oAuth2Client.setCredentials({ access_token: tokens.access_token });

  const calendar = google.calendar({ version: 'v3', auth: oAuth2Client });

  const startTime = new Date(time);
  const endTime = new Date(startTime.getTime() + durationMinutes * 60000);

  const event = {
    summary: title || 'Appointment with AI Agent',
    start: { dateTime: startTime.toISOString() },
    end: { dateTime: endTime.toISOString() },
    attendees: [{ email: recipientEmail }],
  };

  try {
    const result = await calendar.events.insert({
      calendarId: 'primary',
      resource: event,
    });

    console.log('📆 Event created:', result.data.id);
    return result.data;
  } catch (err) {
    console.error('❌ Google Calendar error:', err.message);
    throw err;
  }
}

module.exports = { createCalendarEvent };
