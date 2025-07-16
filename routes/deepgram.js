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

    // Pipe to GPT/TTS (call your working endpoint internally)
    const aiResponse = await processTranscript(transcript);

    res.status(200).json({ transcript, aiResponse });
  } catch (err) {
    console.error('❌ Deepgram transcription error:', err.message);
    res.status(500).json({ error: 'Failed to transcribe audio' });
  }
});

// WebSocket for live streaming (mount as app.ws('/deepgram/live') in index.js if needed)
router.ws('/live', (ws) => {
  console.log('🟢 Deepgram WebSocket connected for live transcription');

  const liveTranscription = deepgram.listen.live({
    model: 'nova-2',
    smart_format: true,
    language: 'en',
    interim_results: true,
    utterance_end_ms: 1000,  // Detect end of speech
  });

  liveTranscription.on('open', () => console.log('Deepgram live ready'));
  liveTranscription.on('error', (err) => console.error('Deepgram live error:', err));

  liveTranscription.on('transcriptReceived', async (data) => {
    const transcript = data.channel?.alternatives[0]?.transcript;
    if (transcript && transcript.length > 0) {
      console.log('📝 Live Transcript:', transcript);
      ws.send(JSON.stringify({ transcript }));

      // Pipe to GPT/TTS in real-time
      const aiResponse = await processTranscript(transcript);
      ws.send(JSON.stringify({ aiResponse }));
    }
  });

  ws.on('message', (audioChunk) => {
    // AudioChunk should be binary audio data (e.g., from client mic)
    liveTranscription.send(audioChunk);
  });

  ws.on('close', () => {
    console.log('🔴 Deepgram WebSocket closed');
    liveTranscription.finish();
  });
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










