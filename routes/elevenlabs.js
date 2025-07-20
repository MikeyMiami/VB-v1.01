const express = require('express');
const axios = require('axios');
const router = express.Router();

// Pulling keys and voice ID from your .env -
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || 'uYXf8XasLslADfZ2MB4u'; // default fallback
const ELEVENLABS_MODEL_ID = process.env.ELEVENLABS_MODEL_ID || 'eleven_monolingual_v1'; // New: configurable model (e.g., for multilingual or turbo)

// POST endpoint to generate speech
router.post('/speak', async (req, res) => {
  const { text } = req.body;

  if (!text) {
    return res.status(400).json({ error: 'Text is required' });
  }

  try {
    console.log(`Generating ElevenLabs TTS for text: "${text}" with voice ID: ${ELEVENLABS_VOICE_ID}`);
    const response = await axios({
      method: 'post',
      url: `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}/stream`,
      headers: {
        'xi-api-key': ELEVENLABS_API_KEY,
        'Content-Type': 'application/json',
        'Accept': 'audio/mpeg'
      },
      data: {
        text: text,
        model_id: ELEVENLABS_MODEL_ID,
        voice_settings: {
          stability: 0.4,
          similarity_boost: 0.75
        }
      },
      responseType: 'arraybuffer'
    });

    console.log('ElevenLabs TTS generated successfully, audio length:', response.data.length);

    // Return audio as response
    res.setHeader('Content-Type', 'audio/mpeg');
    res.send(response.data);
  } catch (error) {
    // Decode ElevenLabs error if it's a buffer
    let errorMessage;
    try {
      errorMessage = Buffer.from(error.response.data).toString('utf-8');
    } catch (decodeError) {
      errorMessage = error.message;
    }

    console.error('ElevenLabs error:', errorMessage);
    res.status(500).json({ error: 'Failed to generate speech', details: errorMessage });
  }
});

module.exports = router;


