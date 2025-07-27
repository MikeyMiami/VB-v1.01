// utils/calendar.js
const { google } = require('googleapis');
const db = require('../db');

const createCalendarEvent = async (agentId, recipientEmail, startTime) => {
  if (!agentId) throw new Error('Missing agentId');

  // Step 1: Fetch agent + tokens from DB
  const result = await db.query(`SELECT * FROM Agents WHERE id = $1`, [agentId]);
  const agent = result.rows[0];

  if (!agent || !agent.calendar_token) throw new Error(`No calendar tokens found for agent ${agentId}`);

  let tokens;
  try {
    tokens = JSON.parse(agent.calendar_token);
  } catch (e) {
    throw new Error(`calendar_token is not valid JSON for agent ${agentId}`);
  }

  // Step 2: Set up OAuth2 client
  const oAuth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );

  oAuth2Client.setCredentials({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token
  });

  // Step 3: Attempt to refresh token if needed
  try {
    const newTokens = await oAuth2Client.getAccessToken();
    if (newTokens?.token && newTokens.token !== tokens.access_token) {
      console.log('🔁 Refreshed access token for agent:', agentId);

      tokens.access_token = newTokens.token;
      await db.query(`UPDATE Agents SET calendar_token = $1 WHERE id = $2`, [
        JSON.stringify(tokens),
        agentId
      ]);
    }
  } catch (err) {
    console.warn('⚠️ Could not refresh token:', err.message);
  }

  // Step 4: Build calendar event
  const calendar = google.calendar({ version: 'v3', auth: oAuth2Client });

  const start = new Date(startTime);
  const end = new Date(start.getTime() + (agent.meeting_duration_minutes || 30) * 60000);

  const event = {
    summary: agent.meeting_title_template || 'Appointment',
    start: { dateTime: start.toISOString(), timeZone: agent.timezone || 'America/New_York' },
    end: { dateTime: end.toISOString(), timeZone: agent.timezone || 'America/New_York' },
    attendees: [{ email: recipientEmail }],
  };

  // Step 5: Insert into calendar
  const resultInsert = await calendar.events.insert({
    calendarId: 'primary',
    resource: event
  });

  return resultInsert.data;
};

module.exports = { createCalendarEvent };


