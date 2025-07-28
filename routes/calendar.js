// routes/calendar.js
const express = require('express');
const router = express.Router();
const { google } = require('googleapis');
const { createCalendarEvent } = require('../utils/calendar');

// POST /calendar/create (Production Logic)
router.post('/create', async (req, res) => {
  const body = req.body || {};
  const { agentId, recipientEmail, startTime, title, description, locationType } = body;

  console.log('💡 Incoming request to /calendar/create');
  console.log('📦 Headers:', req.headers);
  console.log('📦 Body:', body);

  if (!agentId || !startTime) {
    console.warn('⚠️ Missing agentId or startTime in body:', body);
    return res.status(400).json({ error: 'Missing required fields: agentId or startTime' });
  }

  try {
    const event = await createCalendarEvent({
      agentId,
      recipientEmail,
      startTime,
      durationMinutes: 15, // Hardcoded
      location: locationType === 'zoom' ? 'Zoom' : 'Phone Call',
      title,
      description
    });
    res.status(200).json({ message: 'Event created', event });
  } catch (err) {
    console.error('❌ Error creating calendar event:', err.message);
    res.status(500).json({ error: 'Failed to create calendar event' });
  }
});

// 🔧 TEMP: Manual Test Without Database or Agent Lookup
router.post('/test-create', async (req, res) => {
  const body = req.body || {};
  const { recipientEmail, startTime, title, description, locationType } = body;

  if (!recipientEmail || !startTime) {
    return res.status(400).json({ error: 'Missing recipientEmail or startTime' });
  }

  const oAuth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID || '',
    process.env.GOOGLE_CLIENT_SECRET || '',
    process.env.GOOGLE_REDIRECT_URI || ''
  );

  oAuth2Client.setCredentials({
    access_token: process.env.TEST_GOOGLE_ACCESS_TOKEN || '',
    refresh_token: process.env.TEST_GOOGLE_REFRESH_TOKEN || ''
  });

  const calendar = google.calendar({ version: 'v3', auth: oAuth2Client });

  const start = new Date(startTime);
  const end = new Date(start.getTime() + 15 * 60000); // 15 minutes

  const event = {
    summary: title || 'Test Appointment with Mikey',
    description: description || '',
    location: locationType === 'zoom' ? 'Zoom' : 'Phone Call',
    start: { dateTime: start.toISOString() },
    end: { dateTime: end.toISOString() },
    attendees: recipientEmail ? [{ email: recipientEmail }] : [],
  };

  try {
    const result = await calendar.events.insert({
      calendarId: 'primary',
      resource: event,
    });

    console.log('✅ Test event created:', result.data.id);
    res.status(200).json({ message: 'Test event created', event: result.data });
  } catch (err) {
    console.error('❌ Google Calendar API error:', err.message);
    res.status(500).json({ error: 'Google Calendar API failed' });
  }
});

// Catch-all for unmatched routes (for debugging)
router.use((req, res, next) => {
  console.log('⚠️ Unmatched calendar route hit:', req.method, req.originalUrl);
  next();
});

module.exports = router;

