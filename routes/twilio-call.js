// twilio-call.js (Updated: Increased <Pause> to 120s for longer call duration)
const express = require('express');
const router = express.Router();
const twilio = require('twilio');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { OpenAI } = require('openai');

const {
  TWILIO_SID,
  TWILIO_AUTH,
  TWILIO_NUMBER,
  PUBLIC_URL,
  DEEPGRAM_SOCKET_URL,
  OPENAI_API_KEY,
  ELEVENLABS_API_KEY,
  ELEVENLABS_VOICE_ID,
} = process.env;

const client = twilio(TWILIO_SID, TWILIO_AUTH);
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

// Store generated audio files here
const audioDir = path.join(__dirname, '..', 'public', 'audio');
if (!fs.existsSync(audioDir)) fs.mkdirSync(audioDir, { recursive: true });

// 🔁 Start outbound call
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

// 📞 Initial call response (greeting + stream + pause)
router.post('/voice', (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();
  twiml.say('Hello, this is the AI agent. Please speak your question.');
  twiml.connect().stream({ url: DEEPGRAM_SOCKET_URL });
  twiml.pause({ length: 120 }); // Keeps call open for 120 seconds; increased for longer responses
  res.type('text/xml');
  res.send(twiml.toString());
});

module.exports = router;






