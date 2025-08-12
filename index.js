// index.js (Postgres migration)
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
const db = require('./db'); // Postgres pool
const { fetchLeads, bookAppointment } = require('./utils/integrations');
const sheetsRoutes = require('./routes/sheets');
const debugRoutes = require('./routes/debug');
const testRoute = require('./routes/test');
const { runAutopilot } = require('./utils/autopilot');
const botControlRoutes = require('./routes/bot-control');
const { router: logStreamRouter } = require('./routes/queue/logs');

const client = twilio(process.env.TWILIO_SID, process.env.TWILIO_AUTH);

fluentFfmpeg.setFfmpegPath(require('ffmpeg-static'));

dotenv.config();

// ✅ Middleware (moved near top for JSON parsing to work)
app.use(express.json());
app.use(express.urlencoded({ extended: true })); // Added to parse Twilio callbacks
app.use(cors());
app.options('*', cors());

// ✅ Routes: calendar routes (fixed order and conflict)
app.use('/calendar', require('./routes/calendar'));         // handles /calendar/create and /calendar/test-create
app.use('/calendar/save', require('./routes/calendar-save')); // handles /calendar/save/save-tokens

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Ensure audio directory exists
const audioDir = path.join(__dirname, 'public', 'audio');
if (!fs.existsSync(audioDir)) {
  fs.mkdirSync(audioDir, { recursive: true });
}

//part 2
// Call Queue (BullMQ with Redis)
const redisConnection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD
};

const callQueue = new Queue('calls', { connection: redisConnection });

// cron addition auto - daily update/on/off - mikey
//cron.schedule('*/10 * * * *', async () => {
//  console.log('🔁 Running 10m autopilot...');
//  await runAutopilot();
//});

// Worker to process calls
new Worker('calls', async job => {
  const { botId, phone, contactId } = job.data;

  // fetch agent from Postgres
  const { rows: agentRows } = await db.query(
    'SELECT * FROM Agents WHERE id = $1', [botId]
  );
  const agent = agentRows[0];
  if (!agent || !agent.active) return;

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

    // Update stats in Postgres
    const today = new Date().toISOString().split('T')[0];
    const { rows: statRows } = await db.query(
      'SELECT * FROM DashboardStats WHERE botId = $1 AND date = $2',
      [botId, today]
    );
    const stat = statRows[0];

    if (stat) {
      await db.query(
        'UPDATE DashboardStats SET dials_count = $1 WHERE id = $2',
        [stat.dials_count + 1, stat.id]
      );
    } else {
      await db.query(
        'INSERT INTO DashboardStats (botId, date, dials_count) VALUES ($1, $2, 1)',
        [botId, today]
      );
    }
  } catch (err) {
    console.error('Call processing error:', err);
  }
}, { connection: redisConnection });

//part 3
// Cron for autopilot (every hour) - Adds to queue - mikey daily on/off
//cron.schedule('0 * * * *', async () => {
//  const now = new Date();
//  const day = now.toLocaleString('en-us', { weekday: 'long' }).toLowerCase();
//  const hour = now.getHours();


  try {
    const { rows: activeAgents } = await db.query(
      "SELECT * FROM Agents WHERE active = true AND call_days ILIKE '%' || $1 || '%'",
      [day]
    );

    for (const agent of activeAgents) {
      if (hour < agent.call_time_start || hour >= agent.call_time_end) continue;

      const leads = await fetchLeads(agent.integrationId);
      for (const lead of leads) {
        await callQueue.add('dial', {
          botId: agent.id,
          phone: lead.phone,
          contactId: lead.id
        });
      }
    }
  } catch (err) {
    console.error('Cron error:', err);
  }
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

// ✅ Static audio files
app.use('/audio', express.static(path.join(__dirname, 'public/audio')));

// ✅ Deepgram setup (for STT only now)
const deepgram = createClient(process.env.DEEPGRAM_API_KEY);

// ✅ Health check
app.get('/', (req, res) => {
  res.send('✅ Voicebot backend is live and running.');
});

//part 4
// ✅ Routes (load AI routes first)
app.use('/voice-agent/stream', require('./routes/voice-agent-stream'));
app.use('/voice-agent', require('./routes/voice-agent'));
app.use('/stream-tts', require('./routes/stream-tts'));
app.use('/gpt', require('./routes/gpt'));
app.use('/stream-playback', require('./routes/stream-playback'));
app.use('/test-ai', require('./routes/test-ai'));
app.use('/deepgram', require('./routes/deepgram'));
app.use('/elevenlabs', require('./routes/elevenlabs'));
app.use('/outbound', require('./routes/outbound'));
app.use('/twilio-call', require('./routes/twilio-call'));
app.use('/playback', require('./routes/playback'));
app.use('/realtime', require('./routes/realtime'));
app.use('/agents', require('./routes/agents')); // selective auth inside
app.use('/integrations', authMiddleware, require('./routes/integrations'));
app.use('/post-call-summary', require('./routes/post-call-summary'));
app.use('/notes', require('./routes/notes'));
app.use('/sheets', sheetsRoutes);
app.use('/debug', debugRoutes);
app.use('/', testRoute);
app.use('/bot', botControlRoutes);
app.use('/queue/log-stream', logStreamRouter);

//part 5
// ⏰ Every 60 seconds (once a minute)
const runAgentUsageReset = require('./jobs/resetAgentUsage');

setInterval(() => {
  runAgentUsageReset();
}, 60 * 1000);

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

//part 6
// —————————————
// μ‑law ↔ PCM & WAV helpers
// —————————————
function ulawToPcm(ulawBuffer) {
  const pcm = new Int16Array(ulawBuffer.length);
  for (let i = 0; i < ulawBuffer.length; i++) {
    let sample = ~(ulawBuffer[i] & 0xFF);
    const sign = (sample & 0x80) ? -1 : 1;
    sample &= 0x7F;
    const exponent = (sample >> 4) & 0x07;
    const mantissa = sample & 0x0F;
    let value = (mantissa << (exponent + 3)) + (0x21 << exponent) - 0x21;
    pcm[i] = sign * value * 4;
  }
  return pcm;
}

function saveChunkAsWav(mulawBuffer, filename) {
  const pcm = ulawToPcm(mulawBuffer);
  const wavBuffer = Buffer.alloc(44 + pcm.length * 2);
  wavBuffer.write('RIFF', 0);
  wavBuffer.writeUInt32LE(36 + pcm.length * 2, 4);
  wavBuffer.write('WAVE', 8);
  wavBuffer.write('fmt ', 12);
  wavBuffer.writeUInt32LE(16, 16);
  wavBuffer.writeUInt16LE(1, 20);
  wavBuffer.writeUInt16LE(1, 22);
  wavBuffer.writeUInt32LE(8000, 24);
  wavBuffer.writeUInt32LE(16000, 28);
  wavBuffer.writeUInt16LE(2, 32);
  wavBuffer.writeUInt16LE(16, 34);
  wavBuffer.write('data', 36);
  wavBuffer.writeUInt32LE(pcm.length * 2, 40);
  pcm.forEach((val, i) => wavBuffer.writeInt16LE(val, 44 + i * 2));

  const fullPath = path.join(audioDir, filename);
  fs.writeFileSync(fullPath, wavBuffer);
  console.log(`Saved audio chunk for debugging: ${fullPath}`);
}

function generateSilenceBuffer(durationMs = 500) {
  const sampleRate = 8000;
  const size = (sampleRate * durationMs) / 1000;
  return Buffer.alloc(size, 0xFF);
}

function normalizeMulaw(mulawBuffer) {
  let maxAmp = 0;
  for (const byte of mulawBuffer) {
    const amp = byte - 127;
    maxAmp = Math.max(maxAmp, Math.abs(amp));
  }
  if (maxAmp > 0) {
    const scale = 127 / maxAmp;
    for (let i = 0; i < mulawBuffer.length; i++) {
      let amp = mulawBuffer[i] - 127;
      amp = Math.round(amp * scale);
      mulawBuffer[i] = (amp + 127) & 0xFF;
    }
  }
  return mulawBuffer;
}

function saveBufferedAudioAsWav(bufferedMulaw, filename) {
  const pcm = ulawToPcm(bufferedMulaw);
  const wavBuffer = Buffer.alloc(44 + pcm.length * 2);
  wavBuffer.write('RIFF', 0);
  wavBuffer.writeUInt32LE(36 + pcm.length * 2, 4);
  wavBuffer.write('WAVE', 8);
  wavBuffer.write('fmt ', 12);
  wavBuffer.writeUInt32LE(16, 16);
  wavBuffer.writeUInt16LE(1, 20);
  wavBuffer.writeUInt16LE(1, 22);
  wavBuffer.writeUInt32LE(8000, 24);
  wavBuffer.writeUInt32LE(16000, 28);
  wavBuffer.writeUInt16LE(2, 32);
  wavBuffer.writeUInt16LE(16, 34);
  wavBuffer.write('data', 36);
  wavBuffer.writeUInt32LE(pcm.length * 2, 40);
  pcm.forEach((val, i) => wavBuffer.writeInt16LE(val, 44 + i * 2));

  const fullPath = path.join(audioDir, filename);
  fs.writeFileSync(fullPath, wavBuffer);
  console.log(`Saved buffered audio (longer) for debugging: ${fullPath}`);
}

//part 7
// Part 7 of 9: WebSocket connection & control events
wss.on('connection', (ws, request) => {
  console.log('🟢 WebSocket connected');
  const botId = new URL(request.url, 'http://localhost').searchParams.get('botId');
  let isTwilio = false,
      streamSid = null,
      dgConnection = null,
      responding = false,
      lastChunkTime = Date.now();

  const dgConfig = {
    model: 'nova-2-phonecall',
    smart_format: true,
    language: 'en',
    interim_results: true,
    utterance_end_ms: 1000,
    endpointing: 10
  };

  // Drive endpointing with silence
  const bufferInterval = setInterval(() => {
    if (dgConnection?.getReadyState() === 1 &&
        Date.now() - lastChunkTime > 1000) {
      dgConnection.send(generateSilenceBuffer());
      console.log('Sent 0.5s silence');
    }
  }, 250);

  // Keep‑alive ping
  const keepAliveInterval = setInterval(() => {
    if (dgConnection?.getReadyState() === 1) {
      dgConnection.keepAlive();
      console.log('Sent KeepAlive');
    }
  }, 5000);

  // Single message handler; Part 8 picks up in the same scope
  ws.on('message', async msg => {
    let data;
    try {
      data = JSON.parse(msg.toString());
    } catch {
      data = null;
    }

    if (data?.event === 'connected') {
      isTwilio = true;
      console.log('Twilio connected');
      return;
    }

    if (data?.event === 'start') {
      streamSid = data.streamSid;
      console.log('Stream started, SID:', streamSid);
      Object.assign(dgConfig, {
        encoding: 'mulaw',
        sample_rate: 8000,
        channels: 1
      });
      dgConnection = deepgram.listen.live(dgConfig);
      dgConnection
        .on(LiveTranscriptionEvents.Open,   () => console.log('DG open'))
        .on(LiveTranscriptionEvents.Close,  () => console.log('DG closed'))
        .on(LiveTranscriptionEvents.Error,  err => console.error('DG err:', err))
        .on(LiveTranscriptionEvents.UtteranceEnd,
            d => console.log('DG UtteranceEnd:', JSON.stringify(d)))
        .on(LiveTranscriptionEvents.Metadata,
            d => console.log('DG Metadata:', JSON.stringify(d)))
        .on(LiveTranscriptionEvents.Transcript,
            async d => {
              const t = d.channel?.alternatives?.[0]?.transcript?.trim();
              if (t && d.is_final && d.speech_final && !responding) {
                console.log('📝 Transcript:', t);
                responding = true;
                if (!isTwilio) ws.send(JSON.stringify({ transcript: t }));
                await streamAiResponse(t, ws, isTwilio, streamSid, botId);
                responding = false;
              }
            });
      return;
    }

    // Everything else (media/stop/browser) moves into Part 8
    // …no duplicate ws.on('message') here…
  });

//part 8 
// Part 8 of 9: media, stop, browser audio & close handler
  ws.on('message', async msg => {
    let data;
    try {
      data = JSON.parse(msg.toString());
    } catch {
      data = null;
    }

    // Twilio media
    if (data?.event === 'media') {
      if (data.media.track !== 'inbound') return;
      const audioBuffer = Buffer.from(data.media.payload, 'base64');
      console.log('Inbound chunk:', audioBuffer.length);
      saveChunkAsWav(audioBuffer, `inbound_chunk_${Date.now()}.wav`);
      const norm = normalizeMulaw(audioBuffer);
      if (dgConnection?.getReadyState() === 1) {
        dgConnection.send(norm);
      }
      lastChunkTime = Date.now();
      return;
    }

    // Twilio stop
    if (data?.event === 'stop') {
      console.log('Stream stopped');
      ws.close();
      return;
    }

    // Browser PCM
    if (!data && !isTwilio) {
      if (!dgConnection) {
        Object.assign(dgConfig, {
          encoding: 'linear16',
          sample_rate: 16000,
          channels: 1
        });
        dgConnection = deepgram.listen.live(dgConfig);
        dgConnection
          .on(LiveTranscriptionEvents.Open,   () => console.log('DG open'))
          .on(LiveTranscriptionEvents.Close,  () => console.log('DG closed'))
          .on(LiveTranscriptionEvents.Error,  err => console.error('DG err:', err))
          .on(LiveTranscriptionEvents.UtteranceEnd,
              d => console.log('DG UtteranceEnd:', JSON.stringify(d)))
          .on(LiveTranscriptionEvents.Metadata,
              d => console.log('DG Metadata:', JSON.stringify(d)))
          .on(LiveTranscriptionEvents.Transcript,
              async d => {
                const t = d.channel?.alternatives?.[0]?.transcript?.trim();
                if (t && d.is_final && d.speech_final && !responding) {
                  console.log('📝 Transcript:', t);
                  responding = true;
                  ws.send(JSON.stringify({ transcript: t }));
                  await streamAiResponse(t, ws, isTwilio, streamSid, botId);
                  responding = false;
                }
              });
      }
      const pcmBuffer = Buffer.from(msg);
      if (dgConnection.getReadyState() === 1) {
        dgConnection.send(pcmBuffer);
      }
    }
  });

  // Close handler (inside the same connection)
  ws.on('close', () => {
    console.log('🔴 WS closed');
    clearInterval(keepAliveInterval);
    clearInterval(bufferInterval);
    if (dgConnection?.getReadyState() === 1) {
      dgConnection.send(generateSilenceBuffer(1000));
      dgConnection.finish();
    }
  });
}); // ← closes wss.on('connection')


//part 9
// Part 9 of 9: streamAiResponse & canDialContact (functions + server.listen)

// —————————————
// streamAiResponse using Postgres
// —————————————
async function streamAiResponse(transcript, ws, isTwilio, streamSid, botId) {
  try {
    console.log('Generating AI response for transcript:', transcript);

    // 1) fetch agent from Postgres
    const { rows: agentRows } = await db.query(
      'SELECT * FROM Agents WHERE id = $1',
      [botId]
    );
    let agent = agentRows[0];
    if (!agent) {
      console.warn('Agent not found for botId:', botId);
      agent = { prompt_script: 'You are a helpful AI assistant. Respond concisely and naturally.' };
    }

    // 2) call OpenAI
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system',  content: agent.prompt_script },
        { role: 'user',    content: transcript }
      ],
      tools: [{
        type: 'function',
        function: {
          name: 'book_appointment',
          description: 'Book an appointment if user agrees',
          parameters: {
            type: 'object',
            properties: {
              time:    { type: 'string' },
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

    // 3) handle tool_calls
    if (completion.choices[0].message.tool_calls) {
      const call = completion.choices[0].message.tool_calls[0];
      if (call.function.name === 'book_appointment') {
        const args = JSON.parse(call.function.arguments);
        await bookAppointment(agent.integrationId, args.time, args.details);
        responseText = 'Appointment booked successfully!';
      }
    }

    console.log('AI response text:', responseText);

    // 4) ElevenLabs TTS streaming
    const voiceId = agent.voice_id || process.env.ELEVENLABS_VOICE_ID;
    const ttsRes = await axios.post(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream`,
      {
        text: responseText,
        model_id: 'eleven_monolingual_v1',
        voice_settings: { stability: 0.4, similarity_boost: 0.75 }
      },
      {
        headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY },
        responseType: 'stream'
      }
    );

    // 5) collect MP3 chunks
    const mp3Chunks = [];
    for await (const chunk of ttsRes.data) {
      mp3Chunks.push(chunk);
    }
    let audioBuffer = Buffer.concat(mp3Chunks);
    console.log('ElevenLabs TTS audio length:', audioBuffer.length);

    // 6) resample to mu-law 8k mono
    audioBuffer = await new Promise((resolve, reject) => {
      const inStream = new stream.PassThrough();
      inStream.end(audioBuffer);
      const outChunks = [];
      fluentFfmpeg(inStream)
        .inputFormat('mp3')
        .audioCodec('pcm_mulaw')
        .audioChannels(1)
        .audioFrequency(8000)
        .format('mulaw')
        .on('error', reject)
        .on('end', () => resolve(Buffer.concat(outChunks)))
        .pipe(new stream.PassThrough({ highWaterMark: 1 << 25 }))
        .on('data', c => outChunks.push(c));
    });
    console.log('Resampled to mu-law, length:', audioBuffer.length);

    // 7) save debug WAV
    saveChunkAsWav(audioBuffer, `tts_response_${Date.now()}.wav`);

    // 8) append 0.5s silence
    audioBuffer = Buffer.concat([audioBuffer, generateSilenceBuffer(500)]);

    // 9) send chunks back over WS to Twilio
    if (isTwilio && ws.readyState === WebSocket.OPEN) {
      let offset = 0;
      let chunkNum = 1;
      let timestamp = 0;
      let sentBytes = 0;
      const chunkSize = 160; // ~20ms per chunk
      while (offset < audioBuffer.length) {
        const end = Math.min(offset + chunkSize, audioBuffer.length);
        const chunk = audioBuffer.slice(offset, end);
        ws.send(JSON.stringify({
          event:    'media',
          streamSid,
          media: {
            track:     'outbound',
            chunk:     chunkNum.toString(),
            timestamp: timestamp.toString(),
            payload:   chunk.toString('base64')
          }
        }));
        sentBytes += chunk.length;
        offset = end;
        chunkNum++;
        timestamp += 20;
        await new Promise(r => setTimeout(r, 20));
      }
      console.log(`Sent ${sentBytes}/${audioBuffer.length} bytes`);
    } else {
      console.warn('Skipping audio send (not Twilio/ws closed)');
    }

  } catch (error) {
    console.error('Error in streamAiResponse:', error);
  }
}

// —————————————
// canDialContact using Postgres
// —————————————
async function canDialContact(agentId, phone) {
  const today = new Date().toISOString().split('T')[0];

  const { rows: agentRows2 } = await db.query(
    'SELECT * FROM Agents WHERE id = $1',
    [agentId]
  );
  const agent2 = agentRows2[0];
  if (!agent2 || !agent2.active) return false;

  const { rows: statRows2 } = await db.query(
    'SELECT * FROM DashboardStats WHERE botId = $1 AND date = $2',
    [agentId, today]
  );
  const stat2 = statRows2[0];
  if ((stat2?.dials_count || 0) >= agent2.dial_limit) return false;

  const { rows: countRows } = await db.query(
    `SELECT COUNT(*)::int AS count
       FROM CallLogs
       WHERE botId = $1
         AND contact_phone = $2
         AND DATE(call_date) = $3`,
    [agentId, phone, today]
  );
  return countRows[0].count < agent2.max_calls_per_contact;
}

// ✅ Server start
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server listening on port ${PORT}`);
});








