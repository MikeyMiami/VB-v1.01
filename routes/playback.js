const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const router = express.Router();

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const AUDIO_FOLDER = path.join(__dirname, '..', 'public', 'audio');

// Ensure audio folder exists
if (!fs.existsSync(AUDIO_FOLDER)) {
  fs.mkdirSync(AUDIO_FOLDER, { recursive: true });
}

// POST /playback/generate
router.post('/generate', async (req, res) => {
  const { message } = req.body;

  if (!message) {
    return res.status(400).json({ error: 'Message is required' });
  }

  try {
    // 🔹 1. Get GPT reply
    const gptRes = await axios({
      method: 'post',
      url: 'https://api.openai.com/v1/chat/completions',
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      data: {
        model: 'gpt-4',
        messages: [
          { role: 'system', content: 'You are a helpful AI voice assistant.' },
          { role: 'user', content: message }
        ]
      }
    });

    const gptReply = gptRes.data.choices[0].message.content;
    console.log('🤖 GPT Response:', gptReply);

    // 🔹 2. Send GPT reply to ElevenLabs for TTS
    const elevenRes = await axios({
      method: 'post',
      url: `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`,
      headers: {
        'xi-api-key': ELEVENLABS_API_KEY,
        'Content-Type': 'application/json',
        'Accept': 'audio/mpeg'
      },
      data: {
        text: gptReply,
        model_id: 'eleven_monolingual_v1',
        voice_settings: {
          stability: 0.4,
          similarity_boost: 0.75
        }
      },
      responseType: 'arraybuffer'
    });

    // 🔹 3. Save MP3 and return link
    const filename = `${uuidv4()}.mp3`;
    const filepath = path.join(AUDIO_FOLDER, filename);

    fs.writeFileSync(filepath, elevenRes.data);

    const fileUrl = `${process.env.PUBLIC_URL}/audio/${filename}`;
    console.log('✅ Audio ready at:', fileUrl);

    res.status(200).json({ url: fileUrl, text: gptReply });
  } catch (err) {
    console.error('❌ Error:', err.message);
    res.status(500).json({ error: 'Failed to generate GPT or audio reply' });
  }
});

module.exports = router;

