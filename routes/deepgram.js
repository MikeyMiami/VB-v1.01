const express = require('express');
const router = express.Router();

let deepgram;

// Dynamically import the ESM Deepgram SDK inside CommonJS
(async () => {
  const { Deepgram } = await import('@deepgram/sdk');
  deepgram = new Deepgram(process.env.DEEPGRAM_API_KEY);
})();

router.post('/transcribe', async (req, res) => {
  const { audioUrl } = req.body;

  if (!audioUrl) {
    return res.status(400).json({ error: 'Audio URL is required' });
  }

  try {
    const response = await deepgram.transcription.preRecorded(
      { url: audioUrl },
      {
        punctuate: true,
        model: 'general',
        language: 'en-US',
      }
    );

    const transcript = response.results.channels[0].alternatives[0].transcript;
    res.json({ transcript });
  } catch (error) {
    console.error('Deepgram error:', error);
    res.status(500).json({ error: 'Failed to transcribe audio' });
  }
});

module.exports = router;





