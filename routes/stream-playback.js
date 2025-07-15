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

if (!fs.existsSync(AUDIO_FOLDER)) {
  fs.mkdirSync(AUDIO_FOLDER, { recursive: true });
}

router.post('/generate-streamed-audio', async (req, res) => {
  const userPrompt = req.body.message || 'Hello, how can I help you?';
  const baseUrl = process.env.PUBLIC_URL;

  const urls = [];
  let buffer = '';

  try {
    const stream = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: 'You are a helpful voice assistant.' },
        { role: 'user', content: userPrompt }
      ],
      stream: true,
    });

    for await (const chunk of stream) {
      const content = chunk.choices?.[0]?.delta?.content || '';
      if (!content) continue;

      buffer += content;

      // Send to ElevenLabs every ~4 words or at sentence end
      const shouldSend = buffer.split(' ').length >= 4 || buffer.includes('.');

      if (shouldSend) {
        const filename = `${uuidv4()}.mp3`;
        const filepath = path.join(AUDIO_FOLDER, filename);

        const ttsResponse = await axios({
          method: 'post',
          url: `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`,
          headers: {
            'xi-api-key': ELEVENLABS_API_KEY,
            'Content-Type': 'application/json',
            'Accept': 'audio/mpeg'
          },
          data: {
            text: buffer.trim(),
            model_id: 'eleven_monolingual_v1',
            voice_settings: {
              stability: 0.4,
              similarity_boost: 0.75
            }
          },
          responseType: 'arraybuffer'
        });

        fs.writeFileSync(filepath, ttsResponse.data);
        urls.push(`${baseUrl}/audio/${filename}`);
        buffer = '';
      }
    }

    // Final flush
    if (buffer.trim() !== '') {
      const filename = `${uuidv4()}.mp3`;
      const filepath = path.join(AUDIO_FOLDER, filename);

      const ttsResponse = await axios({
        method: 'post',
        url: `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`,
        headers: {
          'xi-api-key': ELEVENLABS_API_KEY,
          'Content-Type': 'application/json',
          'Accept': 'audio/mpeg'
        },
        data: {
          text: buffer.trim(),
          model_id: 'eleven_monolingual_v1',
          voice_settings: {
            stability: 0.4,
            similarity_boost: 0.75
          }
        },
        responseType: 'arraybuffer'
      });

      fs.writeFileSync(filepath, ttsResponse.data);
      urls.push(`${baseUrl}/audio/${filename}`);
    }

    console.log('✅ Streamed audio chunks:', urls);
    res.status(200).json({ audioChunks: urls });
  } catch (err) {
    console.error('❌ Error:', err.message);
    res.status(500).json({ error: 'Failed to generate audio chunks' });
  }
});

module.exports = router;
