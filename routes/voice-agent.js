const express = require('express');
const { OpenAI } = require('openai');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const router = express.Router();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const AUDIO_FOLDER = path.join(__dirname, '..', 'public', 'audio');
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID;
const PUBLIC_URL = process.env.PUBLIC_URL;

// Ensure audio folder exists
if (!fs.existsSync(AUDIO_FOLDER)) {
  fs.mkdirSync(AUDIO_FOLDER, { recursive: true });
}

// POST /voice-agent/stream
router.post('/stream', async (req, res) => {
  const userMessage = req.body.message;

  if (!userMessage) {
    return res.status(400).json({ error: 'Missing message from user' });
  }

  const stream = await openai.chat.completions.create({
    model: 'gpt-3.5-turbo',
    messages: [
      { role: 'system', content: 'You are a helpful, concise assistant.' },
      { role: 'user', content: userMessage }
    ],
    stream: true
  });

  const audioUrls = [];
  let chunkBuffer = '';

  for await (const chunk of stream) {
    const delta = chunk.choices?.[0]?.delta?.content;
    if (!delta) continue;

    chunkBuffer += delta;

    const shouldFlush = chunkBuffer.endsWith('.') || chunkBuffer.split(' ').length >= 6;

    if (shouldFlush) {
      try {
        const ttsResponse = await axios({
          method: 'post',
          url: `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`,
          headers: {
            'xi-api-key': ELEVENLABS_API_KEY,
            'Content-Type': 'application/json',
            'Accept': 'audio/mpeg'
          },
          data: {
            text: chunkBuffer,
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
        fs.writeFileSync(filepath, ttsResponse.data);

        const audioUrl = `${PUBLIC_URL}/audio/${filename}`;
        audioUrls.push(audioUrl);
      } catch (err) {
        console.error('❌ TTS Chunk Error:', err.message);
      }

      chunkBuffer = '';
    }
  }

  // Final leftover buffer
  if (chunkBuffer.trim()) {
    try {
      const ttsResponse = await axios({
        method: 'post',
        url: `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`,
        headers: {
          'xi-api-key': ELEVENLABS_API_KEY,
          'Content-Type': 'application/json',
          'Accept': 'audio/mpeg'
        },
        data: {
          text: chunkBuffer.trim(),
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
      fs.writeFileSync(filepath, ttsResponse.data);

      const audioUrl = `${PUBLIC_URL}/audio/${filename}`;
      audioUrls.push(audioUrl);
    } catch (err) {
      console.error('❌ Final TTS Error:', err.message);
    }
  }

  return res.status(200).json({ audioChunks: audioUrls });
});

module.exports = router;
