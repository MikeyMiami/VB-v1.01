// routes/voice-agent-stream.js
const express = require('express');
const router = express.Router();
const { OpenAI } = require('openai');

require('dotenv').config();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

router.post('/', async (req, res) => {
  console.log('📥 POST to /voice-agent/stream');
  console.log('📦 Full request body:', req.body);

  const { messages } = req.body;
  console.log('🛠️ Extracted messages:', messages);

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    console.log('❌ Invalid or missing messages array.');
    return res.status(400).json({
      error: 'Message is required and must be a non-empty array.',
      received: req.body
    });
  }

  // Set up Server-Sent Events headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages,
      stream: true,
    });

    for await (const chunk of completion) {
      const content = chunk.choices?.[0]?.delta?.content;
      if (content) {
        res.write(`data: ${content}\n\n`);
      }
    }

    res.write('data: [DONE]\n\n');
    res.end();
  } catch (err) {
    console.error('🔥 SSE stream error:', err);
    res.write(`data: [ERROR] ${err.message}\n\n`);
    res.end();
  }
});

module.exports = router;


