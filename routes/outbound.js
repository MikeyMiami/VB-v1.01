const express = require('express');
const router = express.Router();
const VoiceResponse = require('twilio').twiml.VoiceResponse;

// When Twilio makes a call, it requests this TwiML from us
router.post('/twiml', (req, res) => {
  const twiml = new VoiceResponse();

  // This tells Twilio to stream the audio to your Deepgram WebSocket endpoint
  twiml.connect().stream({
    url: process.env.DEEPGRAM_SOCKET_URL, // e.g. wss://yourdomain/ws
    track: 'both_tracks',
    statusCallback: 'https://yourdomain.com/deepgram/status',
    statusCallbackMethod: 'POST',
  });

  res.type('text/xml');
  res.send(twiml.toString());
});

// Call this endpoint to initiate a real outbound call
router.post('/call', async (req, res) => {
  const client = require('twilio')(process.env.TWILIO_SID, process.env.TWILIO_AUTH);

  const { to } = req.body;

  try {
    const call = await client.calls.create({
      twiml: `<Response><Redirect method="POST">https://yourdomain.com/outbound/twiml</Redirect></Response>`,
      to: to,
      from: process.env.TWILIO_NUMBER,
    });

    res.json({ success: true, sid: call.sid });
  } catch (err) {
    console.error('Call failed', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
