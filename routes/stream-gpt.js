const express = require('express');
const { OpenAI } = require('openai');

const router = express.Router();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

router.get('/stream-gpt', async (req, res) => {
  const userPrompt = req.query.message || "Hello, how can I help you?";

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  try {
    const stream = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: userPrompt }
      ],
      stream: true,
    });

    let buffer = '';

    for await (const chunk of stream) {
      const delta = chunk.choices?.[0]?.delta?.content;
      if (!delta) continue;

      buffer += delta;

      const shouldFlush = buffer.split(' ').length >= 3 || delta.includes('.');
      if (shouldFlush) {
        res.write(`data: ${buffer.trim()}\n\n`);
        buffer = '';
      }
    }

    if (buffer.trim()) {
      res.write(`data: ${buffer.trim()}\n\n`);
    }

    res.write('event: done\ndata: [DONE]\n\n');
    res.end();
  } catch (err) {
    console.error('❌ GPT Stream Error:', err.message);
    res.write(`event: error\ndata: ${JSON.stringify(err.message)}\n\n`);
    res.end();
  }
});

module.exports = router;

