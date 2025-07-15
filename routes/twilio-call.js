const express = require('express');
const router = express.Router();
const twilio = require('twilio');

const {
  TWILIO_SID,
  TWILIO_AUTH,
  TWILIO_NUMBER,
  PUBLIC_URL,
  DEEPGRAM_SOCKET_URL
} = process.env;

const client = twilio(TWILIO_SID, TWILIO_AUTH);

// POST /twilio-call/start
router.post('/start', async (req, res) => {
  const { to } = req.body;

  if (!to) return res.status(400).json({ error: 'Missing "to" phone number' });

  try {
    const call = await client.calls.create({
      to,
      from: TWILIO_NUMBER,
      url: `${PUBLIC_URL}/twilio-call/voice`
    });

    console.log(`📞 Outbound call started: ${call.sid}`);
    res.status(200).json({ message: 'Call started', sid: call.sid });
  } catch (err) {
    console.error('❌ Twilio error:', err.message);
    res.status(500).json({ error: 'Failed to start call' });
  }
});

// POST /twilio-call/voice (Twilio webhook for call media)
router.post('/voice', (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();

  twiml.say('Connecting you to the AI agent now.');
  twiml.start().stream({
    url: DEEPGRAM_SOCKET_URL
  });

  res.type('text/xml');
  res.send(twiml.toString());
});

module.exports = router;



