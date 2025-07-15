const express = require('express');
const router = express.Router();
const twilio = require('twilio');
const axios = require('axios');
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

// ✅ Start outbound call
router.post('/start', async (req, res) => {
  const { to } = req.body;
  if (!to) return res.status(400).json({ error: 'Missing "to" phone number' });

  try {
    const call = await client.calls.create({
      to,
      from: TWILIO_NUMBER,
      url: `${PUBLIC_URL}/twilio-call/voice`,
    });

    console.log(`📞 Outbound call started: ${call.sid}`);
    res.status(200).json({ message: 'Call started', sid: call.sid });
  } catch (err) {
    console.error('❌ Twilio error:', err.message);
    res.status(500).json({ error: 'Failed to start call' });
  }
});

// ✅ Respond to voice stream from Twilio
router.post('/voice', (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();

  // This connects Twilio's stream to Deepgram WebSocket
  twiml.say('Connecting you to the AI agent now.');
  twiml.start().stream({ url: DEEPGRAM_SOCKET_URL });

  res.type('text/xml');
  res.send(twiml.toString());
});

// ✅ Chat message → GPT → ElevenLabs → audio response
router.post('/chat', async (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ error: 'Missing message input' });

  try {
    // Get GPT-4 response
    const gptRes = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        { role: 'system', content: 'You are a helpful voice AI assistant.' },
        { role: 'user', content: message },
      ],
    });

    const reply = gptRes.choices[0].message.content;
    console.log('🤖 GPT-4 Reply:', reply);

    // Generate audio using ElevenLabs
    const elevenResponse = await axios({
      method: 'post',
      url: `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`,
      headers: {
        'xi-api-key': ELEVENLABS_API_KEY,
        'Content-Type': 'application/json',
        'Accept': 'audio/mpeg',
      },
      data: {
        text: reply,
        model_id: 'eleven_monolingual_v1',
        voice_settings: {
          stability: 0.4,
          similarity_boost: 0.75,
        },
      },
      responseType: 'arraybuffer',
    });

    // Send back audio buffer directly
    res.setHeader('Content-Type', 'audio/mpeg');
    res.send(elevenResponse.data);
  } catch (err) {
    console.error('❌ AI pipeline error:', err.message);
    res.status(500).json({ error: 'Failed to process AI response' });
  }
});

module.exports = router;





