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

module.exports = router;
