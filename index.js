// index.js (Updated: Fixed invalid Queue instantiation)
const express = require('express');
const app = express();
const dotenv = require('dotenv');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const cors = require('cors');
const { createClient, LiveTranscriptionEvents } = require('@deepgram/sdk');
const expressWs = require('express-ws')(app);
const axios = require('axios');
const fluentFfmpeg = require('fluent-ffmpeg');
const { OpenAI } = require('openai');
const stream = require('stream');
const fs = require('fs');
const cron = require('node-cron');
const { Queue, Worker } = require('bullmq');
const jwt = require('jsonwebtoken');
const twilio = require('twilio');
const db = require('./db'); // SQLite DB
const { fetchLeads, bookAppointment } = require('./utils/integrations');
const sheetsRoutes = require('./routes/sheets');
const debugRoutes = require('./routes/debug');
const testRoute = require('./routes/test');
const { runAutopilot } = require('./utils/autopilot');
const botControlRoutes = require('./routes/bot-control');



const client = twilio(process.env.TWILIO_SID, process.env.TWILIO_AUTH);

fluentFfmpeg.setFfmpegPath(require('ffmpeg-static'));

dotenv.config();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Ensure audio directory exists
const audioDir = path.join(__dirname, 'public', 'audio');
if (!fs.existsSync(audioDir)) {
  fs.mkdirSync(audioDir, { recursive: true });
}

// Call Queue (BullMQ with Redis)
const redisConnection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD
};

const callQueue = new Queue('calls', { connection: redisConnection });

// cron addition auto
cron.schedule('*/10 * * * *', async () => {
  console.log('🔁 Running autopilot...');
  await runAutopilot();
});

// Worker to process calls
new Worker('calls', async job => {
  const { botId, phone, contactId } = job.data;
  let agent;
  db.get(`SELECT * FROM Agents WHERE id = ?`, [botId], (err, row) => {
    if (err || !row || !row.active) return;
    agent = row;
  });

  const canDial = await canDialContact(botId, phone);
  if (!canDial) return;

  try {
    const call = await client.calls.create({
      to: phone,
      from: process.env.TWILIO_NUMBER,
      url: `${process.env.PUBLIC_URL}/twilio-call/voice?botId=${botId}`,
      statusCallback: `${process.env.PUBLIC_URL}/twilio-call/status?botId=${botId}&contactId=${contactId}&to=${phone}`,
      statusCallbackMethod: 'POST'
    });

    // Update stats
    const today = new Date().toISOString().split('T')[0];
    db.get(`SELECT * FROM DashboardStats WHERE botId = ? AND date = ?`, [botId, today], (err, stat) => {
      if (err) return;
      const dials = (stat ? stat.dials_count : 0) + 1;
      if (stat) {
        db.run(`UPDATE DashboardStats SET dials_count = ? WHERE id = ?`, [dials, stat.id]);
      } else {
        db.run(`INSERT INTO DashboardStats (botId, date, dials_count) VALUES (?, ?, 1)`, [botId, today]);
      }
    });
  } catch (err) {
    console.error('Call processing error:', err);
    // Optional: job.failed(err.message);
  }
}, { connection: redisConnection });

// Cron for autopilot (every hour) - Adds to queue
cron.schedule('0 * * * *', () => {
  const now = new Date();
  const day = now.toLocaleString('en-us', { weekday: 'long' }).toLowerCase();
  const hour = now.getHours();

  db.all(`SELECT * FROM Agents WHERE active = 1 AND call_days LIKE '%${day}%'`, [], async (err, activeAgents) => {
    if (err) return console.error('Cron error:', err);
    for (const agent of activeAgents) {
      if (hour < agent.call_time_start || hour >= agent.call_time_end) continue;

      const leads = await fetchLeads(agent.integrationId);
      for (const lead of leads) {
        await callQueue.add('dial', { botId: agent.id, phone: lead.phone, contactId: lead.id });
      }
    }
  });
});

// Auth Middleware
const authMiddleware = async (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret');
    req.userId = decoded.userId;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid key' });
  }
};

// ✅ Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true })); // Added to parse Twilio callbacks
app.use(cors());
app.options('*', cors());

// ✅ Static audio files
app.use('/audio', express.static(path.join(__dirname, 'public/audio')));

// ✅ Deepgram setup (for STT only now)
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
app.use('/agents', require('./routes/agents')); // Updated: No authMiddleware here; it's now selective in agents.js
app.use('/integrations', authMiddleware, require('./routes/integrations'));
app.use('/post-call-summary', require('./routes/post-call-summary'));
app.use('/notes', require('./routes/notes'));
app.use('/sheets', sheetsRoutes);
app.use('/debug', debugRoutes);
app.use('/', testRoute);



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

wss.on('connection', async (ws, request) => { // Add request param for query
  console.log('🟢 WebSocket connected');
  const botId = new URL(request.url, 'http://localhost').searchParams.get('botId'); // Parse botId from query
  let isTwilio = false;
  let streamSid = null;
  let dgConnection = null;
  let dgConfig = { model: 'nova-2-phonecall', smart_format: true, language: 'en', interim_results: true, utterance_end_ms: 1000, endpointing: 10 }; // Changed model to 'nova-2-phonecall' for phone audio
  let responding = false; // Flag to prevent overlapping responses

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
        dgConnection.on(LiveTranscriptionEvents.Open, () => console.log('Deepgram connection open')); // Corrected event names
        dgConnection.on(LiveTranscriptionEvents.Close, () => console.log('Deepgram connection closed'));
        dgConnection.on(LiveTranscriptionEvents.Error, (err) => console.error('Deepgram error:', err));
        dgConnection.on(LiveTranscriptionEvents.UtteranceEnd, (data) => console.log('UtteranceEnd received: ', JSON.stringify(data)));
        dgConnection.on(LiveTranscriptionEvents.Metadata, (data) => console.log('Metadata received: ', JSON.stringify(data)));
        dgConnection.on(LiveTranscriptionEvents.Transcript, async (data) => { // Changed to Transcript event
          console.log('Transcript data received: ', JSON.stringify(data));
          let transcript = data.channel?.alternatives[0]?.transcript?.trim(); // Added trim
          if (transcript?.length > 0 && data.is_final && data.speech_final && !responding) { // Only process final, complete utterances
            console.log('📝 Transcript (final):', transcript);
            responding = true; // Lock to prevent overlaps
            if (!isTwilio) {
              ws.send(JSON.stringify({ transcript }));
            }
            await streamAiResponse(transcript, ws, isTwilio, streamSid, botId); // Use botId from connection
            responding = false; // Unlock after done
          } else {
            if (transcript?.length > 0) console.log('📝 Interim Transcript (skipped):', transcript);
            else console.log('No transcript in data');
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
          // Add event listeners (updated to correct names)
          dgConnection.on(LiveTranscriptionEvents.Open, () => console.log('Deepgram connection open'));
          dgConnection.on(LiveTranscriptionEvents.Close, () => console.log('Deepgram connection closed'));
          dgConnection.on(LiveTranscriptionEvents.Error, (err) => console.error('Deepgram error:', err));
          dgConnection.on(LiveTranscriptionEvents.UtteranceEnd, (data) => console.log('UtteranceEnd received: ', JSON.stringify(data)));
          dgConnection.on(LiveTranscriptionEvents.Metadata, (data) => console.log('Metadata received: ', JSON.stringify(data)));
          dgConnection.on(LiveTranscriptionEvents.Transcript, async (data) => {
            console.log('Transcript data received: ', JSON.stringify(data));
            let transcript = data.channel?.alternatives[0]?.transcript?.trim();
            if (transcript?.length > 0 && data.is_final && data.speech_final && !responding) {
              console.log('📝 Transcript (final):', transcript);
              responding = true;
              if (!isTwilio) {
                ws.send(JSON.stringify({ transcript }));
              }
              await streamAiResponse(transcript, ws, isTwilio, streamSid, botId); // Use botId from connection
              responding = false;
            } else {
              if (transcript?.length > 0) console.log('📝 Interim Transcript (skipped):', transcript);
              else console.log('No transcript in data');
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
    if (dgConnection && dgConnection.getReadyState() === 1) {
      const silenceBuffer = generateSilenceBuffer(1000); // 1s final silence
      dgConnection.send(silenceBuffer);
      console.log('Sent final 1s silence on close');
    }
    if (dgConnection) dgConnection.finish();
  });
});

async function streamAiResponse(transcript, ws, isTwilio, streamSid, botId) {
  try {
    console.log('Generating AI response for transcript:', transcript);
    
    let agent = await new Promise((resolve, reject) => {
      db.get(`SELECT * FROM Agents WHERE id = ?`, [botId], (err, row) => {
        if (err) reject(err);
        resolve(row);
      });
    });
    if (!agent) {
      console.warn('Agent not found for botId:', botId);
      agent = { prompt_script: 'You are a helpful AI assistant. Respond concisely and naturally.' }; // Fallback prompt
    }

    // Generate response with OpenAI (customize prompt/model if needed)
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini', // Efficient and cheap; use 'gpt-4o' for better quality
      messages: [
        { role: 'system', content: agent.prompt_script || 'You are a helpful AI assistant. Respond concisely and naturally.' },
        { role: 'user', content: transcript }
      ],
      tools: [{ 
        type: 'function',
        function: {
          name: 'book_appointment',
          description: 'Book an appointment if user agrees',
          parameters: {
            type: 'object',
            properties: {
              time: { type: 'string' },
              details: { type: 'string' }
            }
          }
        }
      }],
      tool_choice: 'auto',
      max_tokens: 150,
      temperature: 0.7
    });

    let responseText = completion.choices[0].message.content.trim();

    if (completion.choices[0].message.tool_calls) {
      const toolCall = completion.choices[0].message.tool_calls[0];
      if (toolCall.function.name === 'book_appointment') {
        const args = JSON.parse(toolCall.function.arguments);
        await bookAppointment(agent.integrationId, args.time, args.details);
        responseText = 'Appointment booked successfully!'; // Or generate follow-up
      }
    }

    console.log('AI response text:', responseText);
    
    // Synthesize speech with ElevenLabs TTS (streaming for low latency)
    const voiceId = agent.voice_id || process.env.ELEVENLABS_VOICE_ID || 'uYXf8XasLslADfZ2MB4u'; // Per-bot voice ID with fallback
    const response = await axios({
      method: 'post',
      url: `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream`,
      headers: {
        'xi-api-key': process.env.ELEVENLABS_API_KEY,
        'Content-Type': 'application/json',
        'Accept': 'audio/mpeg'
      },
      data: {
        text: responseText,
        model_id: 'eleven_monolingual_v1',
        voice_settings: {
          stability: 0.4,
          similarity_boost: 0.75
        }
      },
      responseType: 'stream'
    });

    // Convert stream to Buffer (MP3 from ElevenLabs)
    const chunks = [];
    for await (const chunk of response.data) {
      chunks.push(chunk);
    }
    let audioBuffer = Buffer.concat(chunks);
    console.log('ElevenLabs TTS audio generated (MP3), length:', audioBuffer.length);

    // Resample MP3 to mu-law 8000Hz mono for Twilio (using ffmpeg)
    audioBuffer = await new Promise((resolve, reject) => {
      const inputStream = new stream.PassThrough();
      inputStream.end(audioBuffer);
      let buffers = [];
      fluentFfmpeg(inputStream)
        .inputFormat('mp3')
        .audioCodec('pcm_mulaw')
        .audioChannels(1)
        .audioFrequency(8000)
        .format('mulaw')
        .on('error', reject)
        .on('end', () => resolve(Buffer.concat(buffers)))
        .pipe(new stream.PassThrough({ highWaterMark: 1 << 25 }))
        .on('data', chunk => buffers.push(chunk));
    });
    console.log('Audio resampled to mu-law, length:', audioBuffer.length);

    // Save TTS as WAV for manual debug (mu-law to PCM)
    const ttsFilename = `tts_response_${Date.now()}.wav`;
    saveChunkAsWav(audioBuffer, ttsFilename);
    
    // Optional: Append short silence to end for flush
    const silence = generateSilenceBuffer(500); // 0.5s silence
    audioBuffer = Buffer.concat([audioBuffer, silence]);
    
    // Send audio back to Twilio via WebSocket (split into 160-byte chunks, paced at 20ms)
    if (isTwilio && ws.readyState === WebSocket.OPEN) {
      console.log('Starting audio send to Twilio');
      let offset = 0;
      let chunkNumber = 1;
      let timestamp = 0;
      const chunkSize = 160; // ~20ms of mu-law audio
      let sentBytes = 0;
      while (offset < audioBuffer.length) {
        if (ws.readyState !== WebSocket.OPEN) {
          console.warn('WebSocket closed mid-send; aborting remaining audio');
          break;
        }
        const end = Math.min(offset + chunkSize, audioBuffer.length);
        const chunk = audioBuffer.slice(offset, end);
        ws.send(JSON.stringify({
          event: 'media',
          streamSid: streamSid,
          media: {
            track: 'outbound',
            chunk: chunkNumber.toString(),
            timestamp: timestamp.toString(),
            payload: chunk.toString('base64')
          }
        }));
        console.log(`Sent audio chunk ${chunkNumber}, length: ${chunk.length}`);
        sentBytes += chunk.length;
        offset = end;
        chunkNumber++;
        timestamp += 20; // Increment by ms per chunk
        await new Promise(resolve => setTimeout(resolve, 20)); // Pace to match real-time playback
      }
      if (sentBytes === audioBuffer.length) {
        console.log('Audio sent to Twilio successfully');
      } else {
        console.warn(`Audio send incomplete (sent ${sentBytes}/${audioBuffer.length} bytes)`);
      }
    } else {
      console.warn('Not Twilio or WebSocket closed; skipping audio send');
    }
  } catch (error) {
    console.error('Error in streamAiResponse:', error.message);
  }
}

async function canDialContact(agentId, phone) {
  return new Promise((resolve, reject) => {
    const today = new Date().toISOString().split('T')[0];
    db.get(`SELECT * FROM Agents WHERE id = ?`, [agentId], (err, agent) => {
      if (err) return reject(err);
      if (!agent) return resolve(false);

      db.get(`SELECT * FROM DashboardStats WHERE botId = ? AND date = ?`, [agentId, today], (err, stat) => {
        if (err) return reject(err);
        if ((stat ? stat.dials_count : 0) >= agent.dial_limit) return resolve(false);

        db.get(`SELECT COUNT(*) as count FROM CallLogs WHERE botId = ? AND contact_phone = ? AND DATE(call_date) = ?`, [agentId, phone, today], (err, row) => {
          if (err) return reject(err);
          resolve(row.count < agent.max_calls_per_contact);
        });
      });
    });
  });
}

// ✅ Server start
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server listening on port ${PORT}`);
});







