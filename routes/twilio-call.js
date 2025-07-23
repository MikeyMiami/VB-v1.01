// VB-v1.01-main/routes/twilio-call.js
// twilio-call.js (Updated: Added statusCallback for dynamic handling)
const express = require('express');
const router = express.Router();
const twilio = require('twilio');
const VoiceResponse = require('twilio').twiml.VoiceResponse;
const db = require('../db');
const { Queue } = require('bullmq');

const redisConnection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD
};

const {
  TWILIO_SID,
  TWILIO_AUTH,
  TWILIO_NUMBER,
  PUBLIC_URL,
  DEEPGRAM_SOCKET_URL,
} = process.env;

const client = twilio(TWILIO_SID, TWILIO_AUTH);

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
  const twiml = new VoiceResponse();
  const botId = req.query.botId;
  db.get(`SELECT * FROM Agents WHERE id = ?`, [botId], (err, agent) => {
    if (err || !agent) {
      twiml.say('Hello, this is the AI agent. Please speak your question.');
    } else {
      twiml.say(agent.prompt_script ? agent.prompt_script.substring(0, 100) : 'Hello, this is the AI agent. Please speak your question.');
    }
    const wsUrl = PUBLIC_URL.replace('https://', 'wss://') + `/ws?botId=${botId}`; // Use wss for WebSocket
    twiml.connect().stream({ url: wsUrl, statusCallback: `${PUBLIC_URL}/twilio-call/status`, statusCallbackMethod: 'POST' });
    twiml.pause({ length: 120 }); // Keeps call open for 120 seconds; increased for longer responses
    res.type('text/xml');
    res.send(twiml.toString());
  });
});

// Status callback route to handle events
router.post('/status', (req, res) => {
  console.log('Call status update:', JSON.stringify(req.body)); // Log full body for debug
  const { CallStatus, botId, contactId, to } = req.body;

  db.get(`SELECT * FROM Agents WHERE id = ?`, [botId], async (err, agent) => {
    if (err || !agent) return res.sendStatus(200);

    if (CallStatus === 'no-answer' && agent.double_dial_no_answer) {
      // Re-queue
      const callQueue = new Queue('calls', { connection: redisConnection });
      await callQueue.add('dial', { botId, phone: to, contactId });
    }

    // Log call
    db.run(`INSERT INTO CallLogs (botId, call_date, call_duration, call_outcome, contact_phone) VALUES (?, CURRENT_TIMESTAMP, ?, ?, ?)`,
      [botId, req.body.CallDuration || 0, CallStatus, to],
      (err) => {
        if (err) console.error('Log error:', err);
      }
    );

    // Optional: Sync to Bubble via axios.post to Bubble Data API

    res.sendStatus(200); // Acknowledge
  });
});

module.exports = router;






