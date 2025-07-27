// routes/calendar.js
const express = require('express');
const router = express.Router();
const { google } = require('googleapis');
const { createCalendarEvent } = require('../utils/calendar');

// POST /calendar/create (live agent-based logic)
router.post('/create', async (req, res) => {
  const { agentId, recipientEmail, startTime } = req.body;
  console.log('💡 Request headers:', req.headers);
  console.log('💡 Request body:', req.body);

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

// 🔧 TEMP MANUAL TEST: POST /calendar/test-create
router.post('/test-create', async (req, res) => {
  const { recipientEmail, startTime, title } = req.body;

  if (!recipientEmail || !startTime) {
    return res.status(400).json({ error: 'Missing recipientEmail or startTime' });
  }

  const oAuth2Client = new google.auth.OAuth2(
    '', // Client ID not needed for manual test
    '', // Client Secret not needed for manual test
    ''  // Redirect URI not needed for manual test
  );

  oAuth2Client.setCredentials({
    access_token: 'ya29.a0AS3H6NyWKsSD5mHEEYRuoxyAm4tYlBuntfMJgx850jVpf4rwncP6oBw-Usd4sMQt9-pT1MW5fTg260jq3QYsYYrqGlcEtMXXuGvI8k5KGFwGPVuBToEPWxt9KGSoBWJPfbolxzhpD9nMS1-PFp3y3rotMPO23m_JDDIY_nndaCgYKAbcSARMSFQHGX2MiAXaDGm3Lqq1LZGnfNhTjAg0175',
    refresh_token: '1//04DVVft3AuRzTCgYIARAAGAQSNwF-L9Ir9SmsESRCunRfBlsv9qI_z3wsrdlx2tFds8jGE3Ra-y29-gB7fGVy_sEOneIJnH_jYPk'
  });

  const calendar = google.calendar({ version: 'v3', auth: oAuth2Client });

  const start = new Date(startTime);
  const end = new Date(start.getTime() + 30 * 60000); // default 30 min

  const event = {
    summary: title || 'Test Appointment with Mikey',
    start: { dateTime: start.toISOString() },
    end: { dateTime: end.toISOString() },
    attendees: [{ email: recipientEmail }],
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

router.use((req, res, next) => {
  console.log('⚠️ Unmatched route hit:', req.method, req.originalUrl);
  next();
});


module.exports = router;

