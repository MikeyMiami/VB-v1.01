const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { OpenAI } = require('openai');

const router = express.Router();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID;
const AUDIO_FOLDER = path.join(__dirname, '..', 'public', 'audio');

if (!fs.existsSync(AUDIO_FOLDER)) {
  fs.mkdirSync(AUDIO_FOLDER, { recursive: true });
}

// POST /realtime/stream
router.post('/stream', async (req, res) => {
  const { message } = req.body;

  if (!message) {
    return res.status(400).json({ error: 'Message is required' });
  }

  try {
    const audioChunks = [];
    let buffer = '';
    let lastFlushTime = Date.now();

    const stream = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: message }],
      stream: true
    });

    for await (const chunk of stream) {
      const content = chunk.choices?.[0]?.delta?.content;
      if (!content) continue;

      buffer += content;

      const now = Date.now();
      if (buffer.length > 20 || now - lastFlushTime > 1000 || content.endsWith(/[.!?]/)) {
        const mp3Url = await synthesizeAudio(buffer);
        if (mp3Url) audioChunks.push(mp3Url);
        buffer = '';
        lastFlushTime = now;
      }
    }

    if (buffer.trim().length > 0) {
      const mp3Url = await synthesizeAudio(buffer);
      if (mp3Url) audioChunks.push(mp3Url);
    }

    res.json({ audioChunks });
  } catch (err) {
    console.error('❌ Error:', err.message);
    res.status(500).json({ error: 'Failed to stream response' });
  }
});

// 🧠 Helper: Send buffer to ElevenLabs and return public mp3 URL
async function synthesizeAudio(text) {
  try {
    const response = await axios({
      method: 'post',
      url: `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`,
      headers: {
        'xi-api-key': ELEVENLABS_API_KEY,
        'Content-Type': 'application/json',
        'Accept': 'audio/mpeg'
      },
      data: {
        text,
        model_id: 'eleven_monolingual_v1',
        voice_settings: {
          stability: 0.4,
          similarity_boost: 0.75
        }
      },
      responseType: 'arraybuffer'
    });

    const filename = `${uuidv4()}.mp3`;
    const filepath = path.join(AUDIO_FOLDER, filename);
    fs.writeFileSync(filepath, response.data);
    return `${process.env.PUBLIC_URL}/audio/${filename}`;
  } catch (err) {
    console.error('🎤 ElevenLabs TTS error:', err.message);
    return null;
  }
}

module.exports = router;
