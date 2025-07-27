// routes/calendar.js
const express = require('express');
const router = express.Router();
const { createCalendarEvent } = require('../utils/calendar');

// POST /calendar/create
router.post('/create', async (req, res) => {
  const { agentId, recipientEmail, startTime } = req.body;

  if (!agentId || !startTime) {
    return res.status(400).json({ error: 'Missing required fields: agentId or startTime' });
  }

  try {
    const event = await createCalendarEvent(agentId, recipientEmail, startTime);
    res.status(200).json({ message: 'Event created', event });
  } catch (err) {
    console.error('❌ Error creating calendar event:', err.message);
    res.status(500).json({ error: 'Failed to create calendar event' });
  }
});

// ✅ TEMPORARY TEST ROUTE — REMOVE IN PRODUCTION
router.post('/test-create', async (req, res) => {
  try {
    const { google } = require('googleapis');

    const oAuth2Client = new google.auth.OAuth2();
    oAuth2Client.setCredentials({
      access_token: 'PASTE_YOUR_TEMP_TOKEN_HERE'
    });

    const calendar = google.calendar({ version: 'v3', auth: oAuth2Client });

    const now = new Date();
    const end = new Date(now.getTime() + 30 * 60000);

    const event = {
      summary: '🧪 Test AI Calendar Event',
      start: { dateTime: now.toISOString() },
      end: { dateTime: end.toISOString() },
      attendees: [{ email: 'test@gmail.com' }]
    };

    const result = await calendar.events.insert({
      calendarId: 'primary',
      resource: event
    });

    console.log('✅ Test event created:', result.data.id);
    res.status(200).json({ success: true, eventId: result.data.id });
  } catch (err) {
    console.error('❌ Error in test-create:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
