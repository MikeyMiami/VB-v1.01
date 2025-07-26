// VB-v1.01-main/routes/twilio-call.js
const express = require('express');
const router = express.Router();
const twilio = require('twilio');
const VoiceResponse = require('twilio').twiml.VoiceResponse;
const db = require('../db');
const { Queue } = require('bullmq');
const { createNoteForContact } = require('../utils/hubspot');

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
router.post('/voice', async (req, res) => {
  const twiml = new VoiceResponse();
  const botId = req.query.botId;

  try {
    const { rows } = await db.query(`SELECT * FROM Agents WHERE id = $1`, [botId]);
    const agent = rows[0];

    if (!agent) {
      twiml.say('Hello, this is the AI agent. Please speak your question.');
    } else {
      twiml.say(agent.prompt_script ? agent.prompt_script.substring(0, 100) : 'Hello, this is the AI agent. Please speak your question.');
    }

    const wsUrl = PUBLIC_URL.replace('https://', 'wss://') + `/ws?botId=${botId}`;
    twiml.connect().stream({
      url: wsUrl,
      statusCallback: `${PUBLIC_URL}/twilio-call/status`,
      statusCallbackMethod: 'POST'
    });

    twiml.pause({ length: 120 }); // 2 min session
    res.type('text/xml');
    res.send(twiml.toString());
  } catch (err) {
    console.error('❌ Error in /voice:', err.message);
    res.status(500).send('Error');
  }
});

// 📲 Call status update (used to trigger follow-up)
router.post('/status', async (req, res) => {
  console.log('Call status update:', JSON.stringify(req.body));

  const { CallStatus, botId, contactId, to } = req.body;

  try {
    const { rows } = await db.query(`SELECT * FROM Agents WHERE id = $1`, [botId]);
    const agent = rows[0];

    if (!agent) {
      console.warn(`⚠️ Agent not found for ID: ${botId}`);
      return res.sendStatus(200);
    }

    if (CallStatus === 'no-answer' && agent.double_dial_no_answer) {
      const callQueue = new Queue('calls', { connection: redisConnection });
      await callQueue.add('dial', { botId, phone: to, contactId });
    }

    // 🗒️ Add post-call note to HubSpot
    if (CallStatus === 'completed') {
      const timestamp = new Date().toLocaleString();
      const note = `📞 Call completed at ${timestamp}`;

      if (contactId && agent.integration_id) {
        try {
          await createNoteForContact(agent.integration_id, contactId, note);
          console.log(`✅ Note logged for contact ${contactId}`);
        } catch (err) {
          console.warn(`⚠️ Failed to log note for ${contactId}:`, err.message);
        }
      } else {
        console.warn('⚠️ Skipped note creation — missing contactId or integration_id.');
      }
    }

    await db.query(
      `INSERT INTO CallLogs (botId, call_date, call_duration, call_outcome, contact_phone)
       VALUES ($1, CURRENT_TIMESTAMP, $2, $3, $4)`,
      [botId, req.body.CallDuration || 0, CallStatus, to]
    );

    res.sendStatus(200);
  } catch (err) {
    console.error('❌ Error in /status handler:', err.message);
    res.sendStatus(500);
  }
});

module.exports = router;







