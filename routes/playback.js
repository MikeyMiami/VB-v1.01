const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const router = express.Router();

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID;

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
    const response = await axios({
      method: 'post',
      url: `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`,
      headers: {
        'xi-api-key': ELEVENLABS_API_KEY,
        'Content-Type': 'application/json',
        'Accept': 'audio/mpeg'
      },
      data: {
        text: message,
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

    const fileUrl = `${process.env.PUBLIC_URL}/audio/${filename}`;
    console.log('✅ Audio ready at:', fileUrl);

    res.status(200).json({ url: fileUrl });
  } catch (err) {
    console.error('❌ Error generating audio:', err.message);
    res.status(500).json({ error: 'Failed to generate audio' });
  }
});

module.exports = router;
