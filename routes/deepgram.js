const express = require('express');
const router = express.Router();
const { createClient } = require('@deepgram/sdk');

const deepgram = createClient(process.env.DEEPGRAM_API_KEY);

router.post('/', async (req, res) => {
  try {
    const audioUrl = req.body.audio_url;
    if (!audioUrl) {
      return res.status(400).json({ error: 'audio_url is required' });
    }

    const { result, error } = await deepgram.listen.prerecorded.transcribeUrl(
      {
        url: audioUrl,
      },
      {
        model: 'nova',
        smart_format: true,
      }
    );

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    res.json(result);
  } catch (err) {
    console.error('❌ Deepgram error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;

