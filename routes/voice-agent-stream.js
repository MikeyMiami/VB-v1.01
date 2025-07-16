const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { OpenAI } = require('openai');

const router = express.Router();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID;
const AUDIO_FOLDER = path.join(__dirname, '..', 'public', 'audio');

if (!fs.existsSync(AUDIO_FOLDER)) {
  fs.mkdirSync(AUDIO_FOLDER, { recursive: true });
}

router.post('/', async (req, res) => {
  const { messages, message } = req.body;

  console.log("📥 Incoming Request Body:", req.body);

  let payloadMessages;

  if (Array.isArray(messages)) {
    payloadMessages = messages;
  } else if (typeof message === 'string') {
    payloadMessages = [
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: message }
    ];
  } else {
    return res.status(400).json({ error: 'Missing valid "messages" array or "message" string in request body.' });
  }

  try {
    const gptStream = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: payloadMessages,
      stream: true
    });

    let buffer = '';
    const audioUrls = [];

    for await (const chunk of gptStream) {
      const delta = chunk.choices?.[0]?.delta?.content;
      if (!delta) continue;

      buffer += delta;

      const shouldSend = buffer.split(' ').length >= 4 || delta.includes('.') || delta.includes('!');
      if (shouldSend) {
        const audioBuffer = await synthesizeSpeech(buffer);
        const filename = `${uuidv4()}.mp3`;
        const filepath = path.join(AUDIO_FOLDER, filename);
        fs.writeFileSync(filepath, audioBuffer);

        const fileUrl = `${process.env.PUBLIC_URL}/audio/${filename}`;
        audioUrls.push(fileUrl);
        buffer = '';
      }
    }

    if (buffer.trim()) {
      const audioBuffer = await synthesizeSpeech(buffer);
      const filename = `${uuidv4()}.mp3`;
      const filepath = path.join(AUDIO_FOLDER, filename);
      fs.writeFileSync(filepath, audioBuffer);

      const fileUrl = `${process.env.PUBLIC_URL}/audio/${filename}`;
      audioUrls.push(fileUrl);
    }

    console.log("✅ Generated audio chunks:", audioUrls);
    res.status(200).json({ audioChunks: audioUrls });

  } catch (err) {
    console.error('❌ Error generating audio stream:', err.message);
    res.status(500).json({ error: 'Failed to stream and synthesize response' });
  }
});

async function synthesizeSpeech(text) {
  const response = await axios({
    method: 'post',
    url: `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`,
    headers: {
      'xi-api-key': ELEVENLABS_API_KEY,
      'Content-Type': 'application/json',
      'Accept': 'audio/mpeg'
    },
    data: {
      text: text,
      model_id: 'eleven_monolingual_v1',
      voice_settings: {
        stability: 0.4,
        similarity_boost: 0.75
      }
    },
    responseType: 'arraybuffer'
  });

  return response.data;
}

module.exports = router;






