// utils/calendar.js
const { google } = require('googleapis');
const db = require('../db');

// Get Google Calendar client using stored token
async function getGoogleCalendarClient(agentId) {
  const { rows } = await db.query(`SELECT calendar_token FROM Agents WHERE id = $1`, [agentId]);
  if (!rows.length || !rows[0].calendar_token) throw new Error('No calendar token found');

  let tokens;
  try {
    tokens = JSON.parse(rows[0].calendar_token);
  } catch (e) {
    throw new Error('Invalid token format in database');
  }

  const oAuth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );

  oAuth2Client.setCredentials(tokens);

  // Automatically refresh token if needed
  oAuth2Client.on('tokens', async (newTokens) => {
    if (newTokens.refresh_token || newTokens.access_token) {
      const updated = { ...tokens, ...newTokens };
      await db.query(
        `UPDATE Agents SET calendar_token = $1 WHERE id = $2`,
        [JSON.stringify(updated), agentId]
      );
      console.log(`🔁 Refreshed and updated calendar token for agent ${agentId}`);
    }
  });

  return google.calendar({ version: 'v3', auth: oAuth2Client });
}

// Create event using agent’s custom settings
async function createCalendarEvent(agentId, recipientEmail, startTimeISO) {
  const { rows } = await db.query(
    `SELECT meeting_title_template, meeting_duration_minutes, timezone, calendar_token FROM Agents WHERE id = $1`,
    [agentId]
  );

  if (!rows.length) throw new Error('Agent not found');
  const agent = rows[0];

  const calendar = await getGoogleCalendarClient(agentId);

  const startTime = new Date(startTimeISO);
  const endTime = new Date(startTime.getTime() + (agent.meeting_duration_minutes || 30) * 60000);

  const summary = agent.meeting_title_template || 'Appointment with AI Agent';

  const event = {
    summary,
    start: { dateTime: startTime.toISOString(), timeZone: agent.timezone || 'America/New_York' },
    end: { dateTime: endTime.toISOString(), timeZone: agent.timezone || 'America/New_York' },
    attendees: recipientEmail ? [{ email: recipientEmail }] : [],
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

// Optional debug tool: log calendar token
async function debugAgentCalendarTokens(agentId) {
  const { rows } = await db.query(`SELECT calendar_token FROM Agents WHERE id = $1`, [agentId]);
  if (!rows.length) {
    console.warn(`⚠️ No agent found with ID ${agentId}`);
    return;
  }

  try {
    const token = JSON.parse(rows[0].calendar_token);
    console.log(`🛠️ Calendar token for agent ${agentId}:`, token);
  } catch (e) {
    console.error(`❌ Failed to parse token for agent ${agentId}:`, e.message);
  }
}

module.exports = {
  getGoogleCalendarClient,
  createCalendarEvent,
  debugAgentCalendarTokens, // exported for optional use
};
