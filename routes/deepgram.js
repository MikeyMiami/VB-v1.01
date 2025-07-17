const express = require('express');
const { createClient } = require('@deepgram/sdk');
const axios = require('axios');

const router = express.Router();
const deepgram = createClient(process.env.DEEPGRAM_API_KEY);

// POST /deepgram/transcribe - For testing single audio files (optional, but useful for debug)
router.post('/transcribe', async (req, res) => {
  const { audioUrl } = req.body;  // Expect a URL to an audio file for testing

  if (!audioUrl) {
    return res.status(400).json({ error: 'audioUrl is required' });
  }

  try {
    const { result, error } = await deepgram.listen.prerecorded.transcribeUrl(
      { url: audioUrl },
      { model: 'nova-2', smart_format: true, language: 'en' }
    );

    if (error) throw error;

    const transcript = result.results.channels[0].alternatives[0].transcript;
    console.log('📝 Transcript:', transcript);

    // Pipe to GPT/TTS (call your working endpoint internally) -
    const aiResponse = await processTranscript(transcript);

    res.status(200).json({ transcript, aiResponse });
  } catch (err) {
    console.error('❌ Deepgram transcription error:', err.message);
    res.status(500).json({ error: 'Failed to transcribe audio' });
  }
});

// Helper: Process transcript with GPT/TTS (reuses your fixed /voice-agent/stream)
async function processTranscript(transcript) {
  try {
    const response = await axios.post(`${process.env.PUBLIC_URL}/voice-agent/stream`, {
      message: transcript
    }, {
      headers: { 'Content-Type': 'application/json' }
    });

    return response.data;  // { audioChunks: [...] }
  } catch (err) {
    console.error('❌ Error processing transcript:', err.message);
    return { error: 'Failed to generate AI response' };
  }
}

module.exports = router;










