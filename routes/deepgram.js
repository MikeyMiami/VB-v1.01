const express = require('express');
const { createClient } = require('@deepgram/sdk');
const router = express.Router();

// ✅ Create the Deepgram client using the new v4+ method
const deepgram = createClient(process.env.DEEPGRAM_API_KEY);

router.post('/transcribe', async (req, res) => {
  try {
    const { audioUrl } = req.body;

    if (!audioUrl) {
      return res.status(400).json({ error: 'Missing audioUrl in request body.' });
    }

    // ✅ New format for transcription
    const { result, error } = await deepgram.listen.prerecorded.transcribeUrl(audioUrl, {
      model: 'nova',
      smart_format: true,
    });

    if (error) {
      console.error('Transcription error:', error);
      return res.status(500).json({ error: 'Failed to transcribe audio.' });
    }

    res.json({ transcript: result.results.channels[0].alternatives[0].transcript });
  } catch (error) {
    console.error('Deepgram error:', error);
    res.status(500).json({ error: 'Failed to transcribe audio' });
  }
});

module.exports = router;








