const express = require('express');
const { Deepgram } = require('@deepgram/sdk');
const router = express.Router();

const deepgram = new Deepgram(process.env.DEEPGRAM_API_KEY);

router.post('/transcribe', async (req, res) => {
  try {
    const { audioUrl } = req.body;

    if (!audioUrl) {
      return res.status(400).json({ error: 'Missing audioUrl in request body.' });
    }

    const response = await deepgram.transcription.preRecorded(
      { url: audioUrl },
      {
        punctuate: true,
        model: 'nova',
      }
    );

    res.json({ transcript: response.results.channels[0].alternatives[0].transcript });
  } catch (error) {
    console.error('Deepgram error:', error);
    res.status(500).json({ error: 'Failed to transcribe audio' });
  }
});

module.exports = router;






