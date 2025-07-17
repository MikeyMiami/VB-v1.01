// index.js
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

fluentFfmpeg.setFfmpegPath(require('ffmpeg-static'));

dotenv.config();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

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

wss.on('connection', async (ws) => {
  console.log('🟢 WebSocket connected');
  let isTwilio = false;
  let streamSid = null;
  let dgConfig = { model: 'nova-2', smart_format: true, language: 'en', interim_results: true, utterance_end_ms: 1000 };
  const dgConnection = deepgram.listen.live(dgConfig); // Initial config; updated dynamically

  // Send KeepAlive every 5s
  const keepAliveInterval = setInterval(() => {
    if (dgConnection.getReadyState() === 1) {
      dgConnection.keepAlive();
      console.log('Sent KeepAlive');
    }
  }, 5000);

  dgConnection.on('open', () => console.log('Deepgram connection open'));
  dgConnection.on('close', () => console.log('Deepgram connection closed'));
  dgConnection.on('error', (err) => console.error('Deepgram error:', err));

  dgConnection.on('transcriptReceived', async (data) => {
    console.log('Transcript data received: ', JSON.stringify(data)); // Log full data for debug
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

  ws.on('message', (msg) => {
    try {
      const data = JSON.parse(msg.toString()); // Twilio sends JSON strings
      if (data.event === 'connected') {
        isTwilio = true;
        console.log('Twilio connected');
        return;
      } else if (data.event === 'start') {
        streamSid = data.streamSid;
        console.log('Twilio stream started, SID:', streamSid);
        // Update Deepgram config for Twilio
        dgConfig.encoding = 'mulaw';
        dgConfig.sample_rate = 8000;
        dgConfig.channels = 1;
        return;
      } else if (data.event === 'media') {
        const audioBase64 = data.media.payload;
        const audioBuffer = Buffer.from(audioBase64, 'base64');
        console.log('Received Twilio audio chunk:', audioBuffer.length);
        if (dgConnection.getReadyState() === 1) {
          dgConnection.send(audioBuffer); // MULAW direct to Deepgram
        }
        return;
      } else if (data.event === 'stop') {
        console.log('Twilio stream stopped');
        ws.close();
        return;
      }
    } catch (e) {
      // Not JSON: Assume browser raw binary (PCM linear16 16kHz)
      if (!isTwilio) {
        dgConfig.encoding = 'linear16';
        dgConfig.sample_rate = 16000;
        dgConfig.channels = 1;
        console.log('Received browser audio chunk:', msg.length);
        if (dgConnection.getReadyState() === 1) {
          dgConnection.send(msg);
        }
      }
    }
  });

  ws.on('close', () => {
    console.log('🔴 WebSocket closed');
    clearInterval(keepAliveInterval);
    if (dgConnection) dgConnection.finish();
  });
});

async function streamAiResponse(transcript, ws, isTwilio, streamSid) {
  try {
    const gptStream = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: transcript }],
      stream: true
    });

    let buffer = '';
    for await (const chunk of gptStream) {
      const delta = chunk.choices[0]?.delta?.content || '';
      buffer += delta;

      const shouldFlush = buffer.split(' ').length >= 4 || delta.includes('.');
      if (shouldFlush) {
        // Generate TTS chunk (ElevenLabs streaming for low latency)
        const ttsResponse = await axios({
          method: 'post',
          url: `https://api.elevenlabs.io/v1/text-to-speech/${process.env.ELEVENLABS_VOICE_ID}/stream`,
          headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY, 'Content-Type': 'application/json', 'Accept': 'audio/mpeg' },
          data: { text: buffer, model_id: 'eleven_monolingual_v1', voice_settings: { stability: 0.4, similarity_boost: 0.75 } },
          responseType: 'arraybuffer'
        });
        let audioChunk = ttsResponse.data; // MP3 buffer

        if (isTwilio) {
          // Convert MP3 to MULAW 8000Hz mono
          audioChunk = await convertToMulaw(audioChunk);
          const base64Audio = audioChunk.toString('base64');
          ws.send(JSON.stringify({
            event: 'media',
            streamSid: streamSid,
            media: { payload: base64Audio }
          }));
        } else {
          ws.send(audioChunk); // Raw MP3 for browser
        }
        buffer = '';
      }
    }

    // Final flush
    if (buffer.trim()) {
      const ttsResponse = await axios({
        method: 'post',
        url: `https://api.elevenlabs.io/v1/text-to-speech/${process.env.ELEVENLABS_VOICE_ID}/stream`,
        headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY, 'Content-Type': 'application/json', 'Accept': 'audio/mpeg' },
        data: { text: buffer, model_id: 'eleven_monolingual_v1', voice_settings: { stability: 0.4, similarity_boost: 0.75 } },
        responseType: 'arraybuffer'
      });
      let audioChunk = ttsResponse.data;

      if (isTwilio) {
        audioChunk = await convertToMulaw(audioChunk);
        const base64Audio = audioChunk.toString('base64');
        ws.send(JSON.stringify({
          event: 'media',
          streamSid: streamSid,
          media: { payload: base64Audio }
        }));
      } else {
        ws.send(audioChunk);
      }
    }

    console.log('✅ AI response streamed');
    if (!isTwilio) {
      ws.send(JSON.stringify({ aiResponse: 'complete' }));
    }
  } catch (err) {
    console.error('❌ Error streaming AI:', err.message);
  }
}

function convertToMulaw(inputBuffer) {
  return new Promise((resolve, reject) => {
    const outputBuffers = [];
    fluentFfmpeg()
      .input(inputBuffer)
      .inputFormat('mp3')
      .audioCodec('pcm_mulaw')
      .audioChannels(1)
      .audioFrequency(8000)
      .outputFormat('mulaw')
      .on('error', reject)
      .on('end', () => resolve(Buffer.concat(outputBuffers)))
      .pipe()
      .on('data', (chunk) => outputBuffers.push(chunk));
  });
}

// ✅ Server start
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server listening on port ${PORT}`);
});











