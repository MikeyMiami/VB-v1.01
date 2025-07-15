const express = require('express');
const router = express.Router();
const VoiceResponse = require('twilio').twiml.VoiceResponse;
const client = require('twilio')(process.env.TWILIO_SID, process.env.TWILIO_AUTH);

// Route for when the call connects — sends streaming instructions to Twilio
router.post('/voice', (req, res) => {
  const twiml = new VoiceResponse();

  // Stream the call audio to your Deepgram WebSocket
  twiml.connect().stream({
    url: process.env.DEEPGRAM_SOCKET_URL,
    track: 'inbound_track'
  });

  res.type('text/xml');
  res.send(twiml.toString());
});

// Route to start an outbound call to a number
router.post('/start', async (req, res) => {
  const { to } = req.body;

  if (!to) return res.status(400).json({ error: 'Missing phone number' });

  try {
    const call = await client.calls.create({
      to,
      from: process.env.TWILIO_NUMBER,
      url: `${process.env.PUBLIC_URL}/twilio-call/voice`, // When call connects, this runs
      method: 'POST'
    });

    res.json({ success: true, sid: call.sid });
  } catch (err) {
    console.error('❌ Twilio call error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

