const express = require('express');
const app = express();
const dotenv = require('dotenv');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const cors = require('cors');
const { createClient } = require('@deepgram/sdk');
const expressWs = require('express-ws')(app);

dotenv.config();
app.use(express.json());
app.use(cors());
// ✅ Handle CORS preflight for all routes
app.options('*', cors());

const deepgram = createClient(process.env.DEEPGRAM_API_KEY);

// ✅ Health Check
app.get('/', (req, res) => {
  res.send('✅ Voicebot backend is live and running.');
});

// ✅ Static Audio Files
app.use('/audio', express.static(path.join(__dirname, 'public/audio')));

// ✅ Debug route
app.get('/debug-route', (req, res) => {
  console.log('✅ Debug route was hit');
  res.status(200).send('OK - Debug route is alive');
});

// ✅ Routes
app.use('/test-ai', require('./routes/test-ai'));
app.use('/deepgram', require('./routes/deepgram'));
app.use('/elevenlabs', require('./routes/elevenlabs'));
app.use('/outbound', require('./routes/outbound'));
app.use('/twilio-call', require('./routes/twilio-call'));
app.use('/playback', require('./routes/playback'));
app.use('/gpt', require('./routes/gpt'));
app.use('/stream-gpt', require('./routes/stream-gpt'));
app.use('/stream-playback', require('./routes/stream-playback'));
app.use('/realtime', require('./routes/realtime'));
app.use('/stream-tts', require('./routes/stream-tts'));
app.use('/voice-agent', require('./routes/voice-agent'));
app.use('/voice-agent/stream', require('./routes/voice-agent-stream'));

// ✅ Catch all POST fallback (for debugging unknown routes)
app.post('*', (req, res) => {
  console.log('⚠️ Unknown POST path hit:', req.path);
  res.status(404).send('Not found');
});

// ✅ WebSocket Server
const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: '/ws' });

wss.on('connection', async (ws) => {
  console.log('🟢 WebSocket connected');

  const dgConnection = deepgram.listen.live({
    model: 'nova',
    smart_format: true,
    language: 'en',
    encoding: 'mulaw',
    sample_rate: 8000,
  });

  dgConnection.on('transcriptReceived', (data) => {
    const transcript = data.channel?.alternatives[0]?.transcript;
    if (transcript && transcript.length > 0) {
      console.log('📝 Transcript:', transcript);
    }
  });

  dgConnection.on('error', (err) => {
    console.error('Deepgram error:', err);
  });

  ws.on('message', (msg) => {
    if (dgConnection) {
      dgConnection.send(msg);
    }
  });

  ws.on('close', () => {
    console.log('🔴 WebSocket closed');
    if (dgConnection) {
      dgConnection.finish();
    }
  });
});

// ✅ Start Server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server listening on port ${PORT}`);
});









