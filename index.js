// index.js (Updated: Added normalizeMulaw for amplitude boosting, applied in 'media' event)
const express = require('express');
const app = express();
const dotenv = require('dotenv');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const cors = require('cors');
const { createClient } = require('@deepgram/sdk');
const expressWs = require('express-ws')(app);
const axios = require('axios');
const fluentFfmpeg = require('fluent-ffmpeg');
const { OpenAI } = require('openai');
const stream = require('stream');
const fs = require('fs');

fluentFfmpeg.setFfmpegPath(require('ffmpeg-static'));

dotenv.config();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Ensure audio directory exists
const audioDir = path.join(__dirname, 'public', 'audio');
if (!fs.existsSync(audioDir)) {
  fs.mkdirSync(audioDir, { recursive: true });
}

// ✅ Middleware
app.use(express.json());
app.use(cors());
app.options('*', cors());

// ✅ Static audio files
app.use('/audio', express.static(path.join(__dirname, 'public/audio')));

// ✅ Deepgram setup
const deepgram = createClient(process.env.DEEPGRAM_API_KEY);

// ✅ Health check
app.get('/', (req, res) => {
  res.send('✅ Voicebot backend is live and running.');
});

// ✅ Routes (load AI routes first)
app.use('/voice-agent/stream', require('./routes/voice-agent-stream'));
app.use('/voice-agent', require('./routes/voice-agent'));
app.use('/stream-tts', require('./routes/stream-tts'));
app.use('/gpt', require('./routes/gpt'));
app.use('/stream-gpt', require('./routes/stream-gpt'));
app.use('/stream-playback', require('./routes/stream-playback'));
app.use('/test-ai', require('./routes/test-ai'));
app.use('/deepgram', require('./routes/deepgram'));
app.use('/elevenlabs', require('./routes/elevenlabs'));
app.use('/outbound', require('./routes/outbound'));
app.use('/twilio-call', require('./routes/twilio-call'));
app.use('/playback', require('./routes/playback'));
app.use('/realtime', require('./routes/realtime'));

// ✅ Debug route
app.get('/debug-route', (req, res) => {
  console.log('✅ Debug route was hit');
  res.status(200).send('OK - Debug route is alive');
});

// ✅ Unknown POST catcher
app.post('*', (req, res) => {
  console.warn('⚠️ Unknown POST path hit:', req.path);
  res.status(404).send('Not found');
});

// ✅ WebSocket server
const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: '/ws' });

// μ-law to PCM conversion function (pure JS)
function ulawToPcm(ulawBuffer) {
  const pcm = new Int16Array(ulawBuffer.length);
  for (let i = 0; i < ulawBuffer.length; i++) {
    let sample = ~(ulawBuffer[i] & 0xFF);
    const sign = (sample & 0x80) ? -1 : 1;
    sample &= 0x7F;
    const exponent = (sample >> 4) & 0x07;
    const mantissa = sample & 0x0F;
    let value = (mantissa << (exponent + 3)) + (0x21 << exponent) - 0x21;
    pcm[i] = sign * value * 4; // Scale to approximate 16-bit range
  }
  return pcm;
}

// Function to save audio chunk as WAV for debugging
function saveChunkAsWav(mulawBuffer, filename) {
  const pcm = ulawToPcm(mulawBuffer);
  const wavBuffer = Buffer.alloc(44 + pcm.length * 2);
  wavBuffer.write('RIFF', 0, 4);
  wavBuffer.writeUInt32LE(36 + pcm.length * 2, 4);
  wavBuffer.write('WAVE', 8, 4);
  wavBuffer.write('fmt ', 12, 4);
  wavBuffer.writeUInt32LE(16, 16);
  wavBuffer.writeUInt16LE(1, 20); // PCM format
  wavBuffer.writeUInt16LE(1, 22); // Mono
  wavBuffer.writeUInt32LE(8000, 24); // Sample rate
  wavBuffer.writeUInt32LE(16000, 28); // Byte rate
  wavBuffer.writeUInt16LE(2, 32); // Block align
  wavBuffer.writeUInt16LE(16, 34); // Bits per sample
  wavBuffer.write('data', 36, 4);
  wavBuffer.writeUInt32LE(pcm.length * 2, 40);
  for (let i = 0; i < pcm.length; i++) {
    wavBuffer.writeInt16LE(pcm[i], 44 + i * 2);
  }
  const fullPath = path.join(audioDir, filename);
  fs.writeFileSync(fullPath, wavBuffer);
  console.log(`Saved audio chunk for debugging: ${fullPath}`);
}

// Function to generate silence buffer (0.5s of mulaw silence = 4000 bytes of 0xFF)
function generateSilenceBuffer(durationMs = 500) {
  const sampleRate = 8000;
  const size = (sampleRate * durationMs) / 1000;
  return Buffer.alloc(size, 0xFF); // mulaw silence is 0xFF
}

// Function to normalize mulaw amplitude (boost volume)
function normalizeMulaw(mulawBuffer) {
  let maxAmp = 0;
  for (let i = 0; i < mulawBuffer.length; i++) {
    let amp = mulawBuffer[i] - 127; // mulaw centered at 127 for silence
    maxAmp = Math.max(maxAmp, Math.abs(amp));
  }
  if (maxAmp > 0) {
    const scale = 127 / maxAmp;
    for (let i = 0; i < mulawBuffer.length; i++) {
      let amp = mulawBuffer[i] - 127;
      amp = Math.round(amp * scale);
      mulawBuffer[i] = (amp + 127) & 0xFF; // Clamp to 0-255
    }
  }
  return mulawBuffer;
}

// Function to save the full buffered audio as WAV before flushing
function saveBufferedAudioAsWav(bufferedMulaw, filename) {
  const pcm = ulawToPcm(bufferedMulaw);
  const wavBuffer = Buffer.alloc(44 + pcm.length * 2);
  wavBuffer.write('RIFF', 0, 4);
  wavBuffer.writeUInt32LE(36 + pcm.length * 2, 4);
  wavBuffer.write('WAVE', 8, 4);
  wavBuffer.write('fmt ', 12, 4);
  wavBuffer.writeUInt32LE(16, 16);
  wavBuffer.writeUInt16LE(1, 20); // PCM format
  wavBuffer.writeUInt16LE(1, 22); // Mono
  wavBuffer.writeUInt32LE(8000, 24); // Sample rate
  wavBuffer.writeUInt32LE(16000, 28); // Byte rate
  wavBuffer.writeUInt16LE(2, 32); // Block align
  wavBuffer.writeUInt16LE(16, 34); // Bits per sample
  wavBuffer.write('data', 36, 4);
  wavBuffer.writeUInt32LE(pcm.length * 2, 40);
  for (let i = 0; i < pcm.length; i++) {
    wavBuffer.writeInt16LE(pcm[i], 44 + i * 2);
  }
  const fullPath = path.join(audioDir, filename);
  fs.writeFileSync(fullPath, wavBuffer);
  console.log(`Saved buffered audio (longer segment) for debugging: ${fullPath}`);
}

wss.on('connection', async (ws) => {
  console.log('🟢 WebSocket connected');
  let isTwilio = false;
  let streamSid = null;
  let dgConnection = null;
  let dgConfig = { model: 'nova-2', smart_format: true, language: 'en', interim_results: true, utterance_end_ms: 1000, endpointing: 10 };

  let lastChunkTime = Date.now();

  const bufferInterval = setInterval(() => {
    const now = Date.now();
    if (now - lastChunkTime > 1000 && dgConnection && dgConnection.getReadyState() === 1) {
      const silenceBuffer = generateSilenceBuffer();
      dgConnection.send(silenceBuffer);
      console.log('Sent 0.5s silence to trigger endpointing on pause');
    }
  }, 250);

  const keepAliveInterval = setInterval(() => {
    if (dgConnection && dgConnection.getReadyState() === 1) {
      dgConnection.keepAlive();
      console.log('Sent KeepAlive');
    }
  }, 5000);

  ws.on('message', (msg) => {
    try {
      const data = JSON.parse(msg.toString());
      if (data.event === 'connected') {
        isTwilio = true;
        console.log('Twilio connected');
        return;
      } else if (data.event === 'start') {
        streamSid = data.streamSid;
        console.log('Twilio stream started, SID:', streamSid);
        dgConfig.encoding = 'mulaw';
        dgConfig.sample_rate = 8000;
        dgConfig.channels = 1;
        dgConnection = deepgram.listen.live(dgConfig);
        dgConnection.on('open', () => console.log('Deepgram connection open'));
        dgConnection.on('close', () => console.log('Deepgram connection closed'));
        dgConnection.on('error', (err) => console.error('Deepgram error:', err));
        dgConnection.on('utteranceEnd', (data) => console.log('UtteranceEnd received: ', JSON.stringify(data)));
        dgConnection.on('metadata', (data) => console.log('Metadata received: ', JSON.stringify(data)));
        dgConnection.on('transcriptReceived', async (data) => {
          console.log('Transcript data received: ', JSON.stringify(data));
          const transcript = data.channel?.alternatives[0]?.transcript;
          if (transcript?.length > 0) {
            console.log('📝 Transcript:', transcript);
            if (!isTwilio) {
              ws.send(JSON.stringify({ transcript }));
            }
            await streamAiResponse(transcript, ws, isTwilio, streamSid);
          } else {
            console.log('No transcript in data');
          }
        });
        return;
      } else if (data.event === 'media') {
        if (data.media.track !== 'inbound') {
          console.log('Skipping non-inbound audio chunk (likely agent output)');
          return;
        }
        const audioBase64 = data.media.payload;
        const audioBuffer = Buffer.from(audioBase64, 'base64');
        console.log('Received Twilio inbound audio chunk:', audioBuffer.length);

        // Save for debugging
        const chunkFilename = `inbound_chunk_${Date.now()}.wav`;
        saveChunkAsWav(audioBuffer, chunkFilename);

        // Normalize and send immediately to Deepgram
        const normalizedBuffer = normalizeMulaw(audioBuffer);
        if (dgConnection && dgConnection.getReadyState() === 1) {
          dgConnection.send(normalizedBuffer);
          console.log('Sent normalized chunk to Deepgram, length:', normalizedBuffer.length);
          // Append silence
          const silenceBuffer = generateSilenceBuffer();
          dgConnection.send(silenceBuffer);
          console.log('Appended 0.5s silence after normalized chunk');
        }
        lastChunkTime = Date.now();
        return;
      } else if (data.event === 'stop') {
        console.log('Twilio stream stopped');
        ws.close();
        return;
      }
    } catch (e) {
      // Browser handling (unchanged)
      if (!isTwilio) {
        if (!dgConnection) {
          dgConfig.encoding = 'linear16';
          dgConfig.sample_rate = 16000;
          dgConfig.channels = 1;
          dgConnection = deepgram.listen.live(dgConfig);
          // Add event listeners (omitted for brevity, same as above)
        }
        const pcmBuffer = Buffer.from(msg);
        console.log('Received browser PCM audio chunk:', pcmBuffer.length);
        if (dgConnection.getReadyState() === 1) {
          dgConnection.send(pcmBuffer);
        }
      }
    }
  });

  ws.on('close', () => {
    console.log('🔴 WebSocket closed');
    clearInterval(keepAliveInterval);
    clearInterval(bufferInterval);
    if (dgConnection && dgConnection.getReadyState() === 1) {
      const silenceBuffer = generateSilenceBuffer(1000); // 1s final silence
      dgConnection.send(silenceBuffer);
      console.log('Sent final 1s silence on close');
    }
    if (dgConnection) dgConnection.finish();
  });
});

async function streamAiResponse(transcript, ws, isTwilio, streamSid) {
  // (unchanged)
}

function convertToMulaw(inputBuffer) {
  // (unchanged)
}

// ✅ Server start
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server listening on port ${PORT}`);
});










