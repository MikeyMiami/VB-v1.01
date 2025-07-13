
const express = require('express');
const router = express.Router();
const axios = require('axios');

router.post('/test-ai', async (req, res) => {
  try {
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
    const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID;

    const userMessage = "What's up?";

    // 1. Send to OpenAI
    const gptResponse = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: "gpt-4",
        messages: [{ role: "user", content: userMessage }],
        temperature: 0.7
      },
      {
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const replyText = gptResponse.data.choices[0].message.content;

    // 2. Send to ElevenLabs
    const audioResponse = await axios.post(
      `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`,
      { text: replyText, model_id: "eleven_monolingual_v1", voice_settings: { stability: 0.5, similarity_boost: 0.5 } },
      {
        headers: {
          "xi-api-key": ELEVENLABS_API_KEY,
          "Content-Type": "application/json"
        },
        responseType: "arraybuffer"
      }
    );

    // 3. Return base64 audio for simplicity
    const base64Audio = Buffer.from(audioResponse.data, 'binary').toString('base64');
    res.json({ replyText, audioBase64: base64Audio });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong" });
  }
});

module.exports = router;
