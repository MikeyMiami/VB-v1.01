const express = require('express');
const app = express();
const dotenv = require('dotenv');
const http = require('http');
const WebSocket = require('ws');
const { createClient } = require('@deepgram/sdk');

dotenv.config();
app.use(express.json());

const deepgram = createClient(process.env.DEEPGRAM_API_KEY);

app.get('/', (req, res) => {
  res.send('✅ Voicebot backend is live and running.');
});

// Routes
app.use('/test-ai', require('./routes/test-ai'));
app.use('/deepgram', require('./routes/deepgram'));
app.use('/elevenlabs', require('./routes/elevenlabs'));
app.use('/outbound', require('./routes/outbound'));
app.use('/twilio-call', require('./routes/twilio-call'));



const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: '/ws' });

wss.on('connection', async (ws) => {
  console.log('🟢 WebSocket connected');

  const dgConnection = deepgram.listen.live({
    model: 'nova',
    smart_format: true,
    language: 'en',
    encoding: 'mulaw',
    sample_rate: 8000
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

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server listening on port ${PORT}`);
});




