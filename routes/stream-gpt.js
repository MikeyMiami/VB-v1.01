const express = require('express');
const { OpenAI } = require('openai');

const router = express.Router();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Used by other routes like voice-agent.js
async function streamOpenAI({ prompt, onDelta, onComplete }) {
  try {
    const stream = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: prompt },
        { role: 'user', content: 'Continue this conversation based on prior transcript.' }
      ],
      stream: true,
    });

    for await (const chunk of stream) {
      const delta = chunk.choices?.[0]?.delta?.content;
      if (!delta) continue;

      await onDelta(delta);
    }

    if (onComplete) await onComplete();
  } catch (err) {
    console.error('❌ GPT Stream Error:', err.message);
  }
}

// Optional: Web browser test endpoint
router.get('/', async (req, res) => {
  const prompt = req.query.prompt || 'You are a helpful assistant.';

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  try {
    const stream = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: prompt },
        { role: 'user', content: 'Say hello and introduce yourself.' }
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

module.exports = {
  streamOpenAI,
  router
};


