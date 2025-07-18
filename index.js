// index.js (Updated based on Twilio example: Disabled VAD, immediate chunk sends to Deepgram, kept silence flushes)
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

// Function to generate silence buffer (0.5s of mulaw silence = 4000 bytes of 0xFF)
function generateSilenceBuffer(durationMs = 500) {
  const sampleRate = 8000;
  const size = (sampleRate * durationMs) / 1000;
  return Buffer.alloc(size, 0xFF); // mulaw silence is 0xFF
}

wss.on('connection', async (ws) => {
  console.log('🟢 WebSocket connected');
  let isTwilio = false;
  let streamSid = null;
  let dgConnection = null;
  let dgConfig = { model: 'nova-2', smart_format: true, language: 'en', interim_results: true, utterance_end_ms: 1000, endpointing: 10 };

  let twilioBuffer = Buffer.alloc(0); // Small buffer for concatenation if needed
  let lastSpeechTime = Date.now();

  const bufferInterval = setInterval(() => {
    const now = Date.now();
    if (now - lastSpeechTime > 1000 && twilioBuffer.length > 0 && dgConnection && dgConnection.getReadyState() === 1) {
      dgConnection.send(twilioBuffer);
      console.log(`Flushed buffer on silence to Deepgram: ${twilioBuffer.length} bytes`);
      // Send silence to force endpointing
      const silenceBuffer = generateSilenceBuffer();
      dgConnection.send(silenceBuffer);
      console.log('Sent 0.5s silence to trigger endpointing');
      twilioBuffer = Buffer.alloc(0);
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

        // Optional save for debugging
        const chunkFilename = `inbound_chunk_${Date.now()}.wav`;
        saveChunkAsWav(audioBuffer, chunkFilename);

        // Send immediately to Deepgram (no VAD, direct write like example)
        if (dgConnection && dgConnection.getReadyState() === 1) {
          dgConnection.send(audioBuffer);
          console.log('Sent chunk directly to Deepgram');
        } else {
          twilioBuffer = Buffer.concat([twilioBuffer, audioBuffer]); // Buffer if connection not ready
          console.log('Buffered chunk temporarily, size:', twilioBuffer.length);
        }
        lastSpeechTime = Date.now();
        return;
      } else if (data.event === 'stop') {
        console.log('Twilio stream stopped');
        ws.close();
        return;
      }
    } catch (e) {
      if (!isTwilio) {
        // Browser PCM handling (create dgConnection if not exists)
        if (!dgConnection) {
          dgConfig.encoding = 'linear16';
          dgConfig.sample_rate = 16000;
          dgConfig.channels = 1;
          dgConnection = deepgram.listen.live(dgConfig);
          // Add event listeners as above
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
              ws.send(JSON.stringify({ transcript }));
            } else {
              console.log('No transcript in data');
            }
          });
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
    if (twilioBuffer.length > 0 && dgConnection && dgConnection.getReadyState() === 1) {
      dgConnection.send(twilioBuffer);
      console.log(`Final flush on close to Deepgram: ${twilioBuffer.length} bytes`);
    }
    if (dgConnection) dgConnection.finish();
  });
});

async function streamAiResponse(transcript, ws, isTwilio, streamSid) {
  // (unchanged from your original)
}

function convertToMulaw(inputBuffer) {
  // (unchanged from your original)
}

// ✅ Server start
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server listening on port ${PORT}`);
});










