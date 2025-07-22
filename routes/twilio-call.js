// twilio-call.js (Updated: Added statusCallback for dynamic handling)
const express = require('express');
const router = express.Router();
const twilio = require('twilio');
const VoiceResponse = require('twilio').twiml.VoiceResponse;
const Agent = require('../models/Agent');
const CallLog = require('../models/CallLog');
const { Queue } = require('bullmq');

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
router.post('/voice', async (req, res) => {
  const twiml = new VoiceResponse();
  const botId = req.query.botId;
  const agent = await Agent.findById(botId);
  twiml.say(agent.prompt_script ? agent.prompt_script.substring(0, 100) : 'Hello, this is the AI agent. Please speak your question.'); // Use initial prompt snippet
  twiml.connect().stream({ url: DEEPGRAM_SOCKET_URL, statusCallback: `${PUBLIC_URL}/twilio-call/status`, statusCallbackMethod: 'POST' });
  twiml.pause({ length: 120 }); // Keeps call open for 120 seconds; increased for longer responses
  res.type('text/xml');
  res.send(twiml.toString());
});

// Status callback route to handle events
router.post('/status', async (req, res) => {
  const { CallStatus, botId, contactId, to } = req.body;
  console.log('Call status update:', req.body);

  const agent = await Agent.findById(botId);

  if (CallStatus === 'no-answer' && agent.double_dial_no_answer) {
    // Re-queue
    const callQueue = new Queue('calls', { connection: { host: process.env.REDIS_HOST || 'localhost', port: process.env.REDIS_PORT || 6379, password: process.env.REDIS_PASSWORD } });
    await callQueue.add('dial', { botId, to, contactId });
  }

  // Log call
  const log = new CallLog({
    botId,
    call_date: new Date(),
    call_duration: req.body.CallDuration,
    call_outcome: CallStatus,
    contact_phone: to,
    // Add other fields as needed, e.g., recording URL from Twilio if enabled
  });
  await log.save();

  // Optional: Sync to Bubble via axios.post to Bubble Data API

  res.sendStatus(200); // Acknowledge
});

module.exports = router;






