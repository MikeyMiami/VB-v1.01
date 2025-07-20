const express = require('express');
const WebSocket = require('ws');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const stream = require('stream');
const fluentFfmpeg = require('fluent-ffmpeg');

router.ws('/stream-tts', (ws, req) => {
  ws.on('message', async (text) => {
    console.log('📩 Text chunk received for streaming TTS:', text);

    const voiceId = process.env.ELEVENLABS_VOICE_ID;
    const ttsSocket = new WebSocket(`wss://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream`, {
      headers: {
        'xi-api-key': process.env.ELEVENLABS_API_KEY,
        'Accept': 'audio/mpeg',
        'Content-Type': 'application/json'
      }
    });

    ttsSocket.on('open', () => {
      console.log('ElevenLabs streaming socket opened');
      ttsSocket.send(JSON.stringify({
        text,
        model_id: 'eleven_monolingual_v1',
        voice_settings: {
          stability: 0.4,
          similarity_boost: 0.75
        }
      }));
    });

    let buffers = [];
    ttsSocket.on('message', (audioChunk) => {
      buffers.push(audioChunk); // Collect for resampling
    });

    ttsSocket.on('close', () => {
      console.log('ElevenLabs streaming socket closed');
      // Resample collected MP3 to mu-law
      const mp3Buffer = Buffer.concat(buffers);
      const inputStream = new stream.PassThrough();
      inputStream.end(mp3Buffer);
      let mulawBuffers = [];
      fluentFfmpeg(inputStream)
        .inputFormat('mp3')
        .audioCodec('pcm_mulaw')
        .audioChannels(1)
        .audioFrequency(8000)
        .format('mulaw')
        .on('error', err => console.error('Resample error:', err.message))
        .on('end', () => {
          const mulawBuffer = Buffer.concat(mulawBuffers);
          console.log('Resampled ElevenLabs audio to mu-law, length:', mulawBuffer.length);
          ws.send(mulawBuffer);
          ws.close();
        })
        .pipe(new stream.PassThrough({ highWaterMark: 1 << 25 }))
        .on('data', chunk => mulawBuffers.push(chunk));
    });

    ttsSocket.on('error', (err) => {
      console.error('❌ TTS Streaming Error:', err.message);
      ws.send(JSON.stringify({ error: err.message }));
    });
  });
});

module.exports = router;

