const express = require('express');
const router = express.Router();
const VoiceResponse = require('twilio').twiml.VoiceResponse;

// Route that Twilio will request when a call is answered
router.post('/voice', (req, res) => {
  const twiml = new VoiceResponse();

  // Connect Twilio's audio stream to your WebSocket server
  twiml.connect().stream({
    url: process.env.DEEPGRAM_SOCKET_URL,
    track: 'inbound_track'
  });

  res.type('text/xml');
  res.send(twiml.toString());
});

module.exports = router;
