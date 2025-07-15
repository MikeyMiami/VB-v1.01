const express = require('express');
const { createClient } = require('@deepgram/sdk');
const axios = require('axios');

const router = express.Router();
const deepgram = createClient(process.env.DEEPGRAM_API_KEY);

// POST /deepgram/live
router.post('/live', async (req, res) => {
  const { transcript } = req.body;

  try {
    // 1. Send to GPT
    const gptResponse = await axios.post('https://api.openai.com/v1/chat/completions', {
      model: 'gpt-4o',
      messages: [{ role: 'user', content: transcript }],
      temperature: 0.7
    }, {
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
      }
    });

    const reply = gptResponse.data.choices[0].message.content;
    console.log('🤖 GPT Reply:', reply);

    // 2. Send to ElevenLabs
    const audioResponse = await axios({
      method: 'POST',
      url: `https://api.elevenlabs.io/v1/text-to-speech/${process.env.ELEVENLABS_VOICE_ID}`,
      headers: {
        'xi-api-key': process.env.ELEVENLABS_API_KEY,
        'Content-Type': 'application/json'
      },
      responseType: 'arraybuffer',
      data: {
        text: reply,
        model_id: 'eleven_monolingual_v1',
        voice_settings: { stability: 0.7, similarity_boost: 0.7 }
      }
    });

    // Send back audio buffer (or save, or stream to Twilio depending on architecture)
    res.set('Content-Type', 'audio/mpeg');
    res.send(audioResponse.data);

  } catch (err) {
    console.error('❌ Error in AI pipeline:', err.message);
    res.status(500).json({ error: 'Failed to process AI response' });
  }
});

module.exports = router;










