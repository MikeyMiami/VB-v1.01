const express = require('express');
const { Deepgram } = require('@deepgram/sdk');
const router = express.Router();

const deepgram = new Deepgram(process.env.DEEPGRAM_API_KEY);

// POST /deepgram/transcribe
router.post('/transcribe', async (req, res) => {
  const { audioUrl } = req.body;

  if (!audioUrl) {
    return res.status(400).json({ error: 'Missing audio URL' });
  }

  try {
    const response = await deepgram.transcription.preRecorded(
      { url: audioUrl },
      {
        punctuate: true,
        language: 'en-US',
      }
    );

    const transcript = response.results.channels[0].alternatives[0].transcript;
    res.json({ transcript });
  } catch (error) {
    console.error('Deepgram error:', error.message);
    res.status(500).json({ error: 'Transcription failed' });
  }
});

module.exports = router;


