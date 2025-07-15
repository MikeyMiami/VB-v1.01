const express = require('express');
const WebSocket = require('ws');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');

router.ws('/stream-tts', (ws, req) => {
  ws.on('message', async (text) => {
    console.log('📩 Text chunk received:', text);

    // Connect to ElevenLabs streaming endpoint
    const ttsSocket = new WebSocket(`wss://api.elevenlabs.io/v1/text-to-speech/YOUR_VOICE_ID/stream`, {
      headers: {
        'xi-api-key': process.env.ELEVENLABS_API_KEY,
        'Accept': 'audio/mpeg',
        'Content-Type': 'application/json'
      }
    });

    ttsSocket.on('open', () => {
      ttsSocket.send(JSON.stringify({
        text,
        model_id: 'eleven_monolingual_v1',
        voice_settings: {
          stability: 0.4,
          similarity_boost: 0.75
        }
      }));
    });

    ttsSocket.on('message', (audioChunk) => {
      // Send audio chunk to frontend
      ws.send(audioChunk);
    });

    ttsSocket.on('close', () => ws.close());
    ttsSocket.on('error', (err) => {
      console.error('❌ TTS Streaming Error:', err.message);
      ws.send(JSON.stringify({ error: err.message }));
    });
  });
});

module.exports = router;
