const express = require('express');
const router = express.Router();
const db = require('../db');
const { streamOpenAI } = require('./stream-gpt');
const { createCalendarEvent } = require('../utils/calendar');
const { v4: uuidv4 } = require('uuid');

router.post('/voice-agent/stream', async (req, res) => {
  const { agentId, transcript } = req.body;

  if (!agentId || !transcript) {
    return res.status(400).json({ error: 'Missing agentId or transcript' });
  }

  // Fetch agent data
  const agent = await db.oneOrNone('SELECT * FROM Agents WHERE id = $1', [agentId]);
  if (!agent) {
    return res.status(404).json({ error: 'Agent not found' });
  }

  // Use agent prompt to guide the AI
  const userPrompt = agent.prompt_script || 'You are a helpful assistant.';

  // Stream GPT response
  let fullReply = '';
  const streamId = uuidv4();

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  await streamOpenAI({
    prompt: `${userPrompt}\n\nTranscript so far:\n${transcript}`,
    onDelta: async (token) => {
      fullReply += token;
      res.write(`data: ${token}\n\n`);
    },
    onComplete: async () => {
      res.write(`data: [DONE]\n\n`);
      res.end();

      // Mid-stream JSON command check
      try {
        const match = fullReply.match(/\{.*?"action":"book_calendar".*?\}/s);
        if (match) {
          const command = JSON.parse(match[0]);

          const {
            title = 'Call with Agent',
            description = 'Auto-booked via AI',
            duration = 15,
            location = 'Phone Call',
            email,
            time
          } = command;

          if (email && time) {
            await createCalendarEvent({
              agentId,
              recipientEmail: email,
              startTime: time,
              durationMinutes: duration,
              location,
              title,
              description
            });

            console.log(`📅 Calendar event booked for agent ${agentId}`);
          }
        }
      } catch (err) {
        console.error('❌ Failed to parse JSON booking block:', err);
      }
    }
  });
});

module.exports = router;



