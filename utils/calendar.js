// utils/calendar.js
const { google } = require('googleapis');
const db = require('../db');

async function createCalendarEvent(agentId, recipientEmail, startTime) {
  // 1. Fetch agent token from DB
  const result = await db.query(`SELECT calendar_token, meeting_title_template, meeting_duration_minutes, timezone FROM Agents WHERE id = $1`, [agentId]);
  const agent = result.rows[0];

  if (!agent || !agent.calendar_token) throw new Error('Agent credentials missing');

  const tokens = typeof agent.calendar_token === 'string'
    ? JSON.parse(agent.calendar_token)
    : agent.calendar_token;

  const oAuth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );

  oAuth2Client.setCredentials(tokens);

  // 2. Refresh access token if needed
  try {
    const refreshed = await oAuth2Client.getAccessToken(); // Refresh if expired
    tokens.access_token = refreshed.token;

    // Optional: save refreshed token back to DB
    await db.query(`UPDATE Agents SET calendar_token = $1 WHERE id = $2`, [JSON.stringify(tokens), agentId]);
  } catch (refreshErr) {
    console.error('❌ Failed to refresh access token:', refreshErr);
    throw new Error('Failed to refresh access token');
  }

  // 3. Create event
  const calendar = google.calendar({ version: 'v3', auth: oAuth2Client });

  const duration = agent.meeting_duration_minutes || 30;
  const title = agent.meeting_title_template || 'Appointment';

  const start = new Date(startTime);
  const end = new Date(start.getTime() + duration * 60000);

  const event = {
    summary: title,
    start: { dateTime: start.toISOString(), timeZone: agent.timezone || 'America/New_York' },
    end: { dateTime: end.toISOString(), timeZone: agent.timezone || 'America/New_York' },
    attendees: [{ email: recipientEmail }],
  };

  const resultEvent = await calendar.events.insert({
    calendarId: 'primary',
    resource: event,
  });

  return resultEvent.data;
}

module.exports = { createCalendarEvent };

