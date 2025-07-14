const express = require('express');
const app = express();
const dotenv = require('dotenv');
const http = require('http');
const WebSocket = require('ws');
const { Deepgram } = require('@deepgram/sdk');
const deepgram = new Deepgram(process.env.DEEPGRAM_API_KEY);

dotenv.config();
app.use(express.json());

app.get('/', (req, res) => {
  res.send('✅ Voicebot backend is live and running.');
});

// Routes
app.use('/test-ai', require('./routes/test-ai'));
app.use('/deepgram', require('./routes/deepgram'));
app.use('/elevenlabs', require('./routes/elevenlabs'));

const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: '/ws' });

wss.on('connection', async (ws) => {
  console.log('🟢 WebSocket connected');

  const deepgramLive = deepgram.transcription.live({
    punctuate: true,
    language: 'en',
    encoding: 'mulaw',
    sample_rate: 8000
  });

  deepgramLive.on('transcriptReceived', (data) => {
    const transcript = JSON.parse(data).channel?.alternatives[0]?.transcript;
    if (transcript && transcript.length > 0) {
      console.log('📝 Transcript:', transcript);
    }
  });

  deepgramLive.on('error', (err) => {
    console.error('Deepgram error:', err);
  });

  ws.on('message', (msg) => {
    if (deepgramLive) {
      deepgramLive.send(msg);
    }
  });

  ws.on('close', () => {
    console.log('🔴 WebSocket closed');
    if (deepgramLive) {
      deepgramLive.finish();
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server listening on port ${PORT}`);
});



