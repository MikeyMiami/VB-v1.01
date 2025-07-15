const express = require('express');
const router = express.Router();
const { OpenAI } = require('openai');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

router.post('/stream', async (req, res) => {
  const { message } = req.body;

  if (!message) {
    return res.status(400).json({ error: 'Message is required' });
  }

  try {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [{ role: "user", content: message }],
      temperature: 0.7,
      stream: true,
    });

    let fullReply = '';

    for await (const chunk of completion) {
      const content = chunk.choices[0]?.delta?.content || '';
      fullReply += content;

      // Send each word/phrase to client as it's ready
      res.write(`data: ${content}\n\n`);
    }

    res.write(`\n\n`);
    res.end();

    console.log("✅ Full response:", fullReply);
  } catch (err) {
    console.error("❌ Error in streaming GPT:", err.message);
    res.status(500).json({ error: 'Failed to stream GPT reply' });
  }
});

module.exports = router;
