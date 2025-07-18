// index.js (Updated: Lowered flush threshold, added silence-based flushing for better response triggering, enhanced logging)
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
const fs = require('fs'); // Added for saving audio chunks

fluentFfmpeg.setFfmpegPath(require('ffmpeg-static'));

dotenv.config();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Ensure audio directory exists
const audioDir = path.join(__dirname, 'public', 'audio');
if (!fs.existsSync(audioDir)) {
  fs.mkdirSync(audioDir, { recursive: true });
}

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
const wss = new WebSocket.Server({ server, path: '/ws' }); // Added 'new' here

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
  let dgConfig = { model: 'nova-2', smart_format: true, language: 'en', interim_results: true, utterance_end_ms: 1000 };
  const dgConnection = deepgram.listen.live(dgConfig); // Initial config; updated dynamically

  let twilioBuffer = Buffer.alloc(0); // Buffer for Twilio chunks
  let lastSpeechTime = Date.now(); // Track time of last speech chunk for silence detection

  const bufferInterval = setInterval(() => {
    const now = Date.now();
    const flushSize = 3200; // Lowered to ~0.4s for faster responses
    const minFlushSize = 1600; // Minimum for silence flush to avoid tiny sends

    // Size-based flush (for ongoing speech)
    if (twilioBuffer.length >= flushSize && dgConnection.getReadyState() === 1) {
      // Save the full buffer as a longer WAV before flushing
      const bufferFilename = `buffered_audio_${Date.now()}.wav`;
      saveBufferedAudioAsWav(twilioBuffer.slice(0, flushSize), bufferFilename);

      dgConnection.send(twilioBuffer.slice(0, flushSize));
      console.log(`Sent buffered MULAW to Deepgram: ${flushSize}`);
      twilioBuffer = twilioBuffer.slice(flushSize);
    }

    // Silence-based flush (if no new speech for 1s and buffer has enough)
    if (now - lastSpeechTime > 1000 && twilioBuffer.length >= minFlushSize && dgConnection.getReadyState() === 1) {
      // Save the full buffer as a longer WAV before flushing
      const bufferFilename = `buffered_audio_${Date.now()}.wav`;
      saveBufferedAudioAsWav(twilioBuffer, bufferFilename);

      dgConnection.send(twilioBuffer);
      console.log(`Flushed buffer on silence to Deepgram: ${twilioBuffer.length} bytes`);
      twilioBuffer = Buffer.alloc(0); // Clear buffer after silence flush
    }
  }, 500); // Check more frequently (every 0.5s) for better responsiveness

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
      console.log('No transcript in data (possible short/noisy audio)');
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
        if (data.media.track !== 'inbound') {
          console.log('Skipping non-inbound audio chunk (likely agent output)');
          return;
        }
        const audioBase64 = data.media.payload;
        const audioBuffer = Buffer.from(audioBase64, 'base64');
        console.log('Received Twilio inbound audio chunk:', audioBuffer.length);

        // Save individual chunk for debugging (optional; you can comment this out if not needed)
        const chunkFilename = `inbound_chunk_${Date.now()}.wav`;
        saveChunkAsWav(audioBuffer, chunkFilename);

        // Convert to PCM and calculate RMS for VAD
        const pcm = ulawToPcm(audioBuffer);
        let rms = 0;
        for (let i = 0; i < pcm.length; i++) {
          rms += pcm[i] * pcm[i];
        }
        rms = Math.sqrt(rms / pcm.length);
        console.log('RMS energy (PCM): ', rms); // Log to debug volume
        if (rms > 1000) { // Increased threshold for better sensitivity on PCM
          twilioBuffer = Buffer.concat([twilioBuffer, audioBuffer]);
          console.log('Speech detected - Buffered chunk, buffer size:', twilioBuffer.length);
          lastSpeechTime = Date.now(); // Update last speech time
        } else {
          console.log('Silence detected - Skipped chunk');
        }
        return;
      } else if (data.event === 'stop') {
        console.log('Twilio stream stopped');
        ws.close();
        return;
      }
    } catch (e) {
      // Not JSON: Assume browser raw PCM (Int16Array buffer)
      if (!isTwilio) {
        dgConfig.encoding = 'linear16';
        dgConfig.sample_rate = 16000;
        dgConfig.channels = 1;
        const pcmBuffer = Buffer.from(msg); // Already PCM from client
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
    clearInterval(bufferInterval); // Clean up buffer timer
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
        const ttsResponse = await axios({
          method: 'post',
          url: `https://api.elevenlabs.io/v1/text-to-speech/${process.env.ELEVENLABS_VOICE_ID}/stream`,
          headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY, 'Content-Type': 'application/json', 'Accept': 'audio/mpeg' },
          data: { text: buffer, model_id: 'eleven_monolingual_v1', voice_settings: { stability: 0.4, similarity_boost: 0.75 } },
          responseType: 'arraybuffer'
        });
        let audioChunk = ttsResponse.data; // MP3 buffer

        if (isTwilio) {
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
    const inputStream = new stream.PassThrough();
    inputStream.end(inputBuffer);
    const outputBuffers = [];
    fluentFfmpeg()
      .input(inputStream)
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











