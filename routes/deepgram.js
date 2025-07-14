const express = require('express');
const { Deepgram } = require('@deepgram/sdk');
const router = express.Router();

const deepgramApiKey = process.env.DEEPGRAM_API_KEY;
const deepgram = new Deepgram(deepgramApiKey);

// POST /deepgram-transcribe
router.post('/deepgram-transcribe', async (req, res) => {
  try {
    const audioUrl = req.body.url;

    if (!audioUrl) {
      return res.status(400).json({ error: 'Audio URL is required' });
    }

    const response = await deepgram.transcription.preRecorded(
      { url: audioUrl },
      { punctuate: true, language: 'en' }
    );

    res.json({ transcript: response.results.channels[0].alternatives[0].transcript });
  } catch (err) {
    console.error('Deepgram Error:', err.message);
    res.status(500).json({ error: 'Failed to transcribe audio' });
  }
});

module.exports = router;
