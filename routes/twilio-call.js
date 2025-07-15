const express = require('express');
const router = express.Router();
const twilio = require('twilio');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { OpenAI } = require('openai');

const {
  TWILIO_SID,
  TWILIO_AUTH,
  TWILIO_NUMBER,
  PUBLIC_URL,
  DEEPGRAM_SOCKET_URL,
  OPENAI_API_KEY,
  ELEVENLABS_API_KEY,
  ELEVENLABS_VOICE_ID,
} = process.env;

const client = twilio(TWILIO_SID, TWILIO_AUTH);
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

// Store generated audio files here
const audioDir = path.join(__dirname, '..', 'public', 'audio');
if (!fs.existsSync(audioDir)) fs.mkdirSync(audioDir, { recursive: true });

// 🔁 Start outbound call
router.post('/start', async (req, res) => {
  const { to } = req.body;

  if (!to) return res.status(400).json({ error: 'Missing "to" phone number' });

  try {
    const call = await client.calls.create({
      to,
      from: TWILIO_NUMBER,
      url: `${PUBLIC_URL}/twilio-call/voice`
    });

    console.log(`📞 Outbound call started: ${call.sid}`);
    res.status(200).json({ message: 'Call started', sid: call.sid });
  } catch (err) {
    console.error('❌ Twilio error:', err.message);
    res.status(500).json({ error: 'Failed to start call' });
  }
});

// 📞 Initial call response (stream + greeting)
router.post('/voice', (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();

  twiml.say('Connecting you to the AI agent now.');
  twiml.start().stream({ url: DEEPGRAM_SOCKET_URL });

  res.type('text/xml');
  res.send(twiml.toString());
});

// 🎙️ Create and play AI-generated response
router.post('/chat', async (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ error: 'Missing message input' });

  try {
    // Step 1: GPT
    const gptRes = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        { role: 'system', content: 'You are a helpful voice AI agent.' },
        { role: 'user', content: message }
      ]
    });

    const reply = gptRes.choices[0].message.content;
    console.log('🤖 GPT-4:', reply);

    // Step 2: ElevenLabs
    const audioRes = await axios({
      method: 'post',
      url: `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`,
      headers: {
        'xi-api-key': ELEVENLABS_API_KEY,
        'Content-Type': 'application/json',
        'Accept': 'audio/mpeg'
      },
      data: {
        text: reply,
        model_id: 'eleven_monolingual_v1',
        voice_settings: {
          stability: 0.4,
          similarity_boost: 0.75
        }
      },
      responseType: 'arraybuffer'
    });

    // Step 3: Save audio
    const filename = `${uuidv4()}.mp3`;
    const filepath = path.join(audioDir, filename);
    fs.writeFileSync(filepath, audioRes.data);

    const audioUrl = `${PUBLIC_URL}/audio/${filename}`;
    console.log('🔊 Audio hosted at:', audioUrl);

    // Step 4: TwiML Play response
    const twiml = new twilio.twiml.VoiceResponse();
    twiml.play(audioUrl);

    res.type('text/xml');
    res.send(twiml.toString());

  } catch (err) {
    console.error('❌ Chat error:', err.message);
    res.status(500).json({ error: 'Failed to generate audio' });
  }
});

module.exports = router;






