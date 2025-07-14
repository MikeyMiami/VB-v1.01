const express = require('express');
const router = express.Router();

let deepgram;

// Load Deepgram SDK dynamically using import (required for v3+ in CommonJS)
(async () => {
  const sdk = await import('@deepgram/sdk');
  const Deepgram = sdk.Deepgram;
  deepgram = new Deepgram(process.env.DEEPGRAM_API_KEY);
})();

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




