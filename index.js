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

dotenv.config();

// ✅ Middleware
app.use(express.json()); // required to parse JSON body
app.use(cors());
app.options('*', cors()); // preflight

// ✅ Static audio files
app.use('/audio', express.static(path.join(__dirname, 'public/audio')));

// ✅ Deepgram setup
const deepgram = createClient(process.env.DEEPGRAM_API_KEY);

// ✅ Health check
app.get('/', (req, res) => {
  res.send('✅ Voicebot backend is live and running.');
});

// ✅ Routes (load AI routes first)
app.use('/voice-agent/stream', require('./routes/voice-agent-stream')); // ← GPT SSE route
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

// Helper: Process transcript with GPT/TTS
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

// ✅ WebSocket server (updated for full live flow)
const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: '/ws' });

wss.on('connection', async (ws) => {
  console.log('🟢 WebSocket connected');

  const dgConnection = deepgram.listen.live({
    model: 'nova-2',  // Updated to nova-2 for better accuracy
    smart_format: true,
    language: 'en',
    encoding: 'mulaw',
    sample_rate: 8000,
    interim_results: true,
    utterance_end_ms: 1000,
  });

  dgConnection.on('transcriptReceived', async (data) => {
    const transcript = data.channel?.alternatives[0]?.transcript;
    if (transcript?.length > 0) {
      console.log('📝 Transcript:', transcript);
      ws.send(JSON.stringify({ transcript }));

      // Pipe to GPT/TTS
      const aiResponse = await processTranscript(transcript);
      ws.send(JSON.stringify({ aiResponse }));
    }
  });

  dgConnection.on('error', (err) => {
    console.error('Deepgram error:', err);
  });

  ws.on('message', (msg) => {
    if (dgConnection) dgConnection.send(msg);
  });

  ws.on('close', () => {
    console.log('🔴 WebSocket closed');
    if (dgConnection) dgConnection.finish();
  });
});

// ✅ Server start
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server listening on port ${PORT}`);
});











