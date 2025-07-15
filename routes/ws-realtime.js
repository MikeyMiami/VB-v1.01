const { OpenAI } = require('openai');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const { createWriteStream } = require('fs');
const path = require('path');
const WebSocket = require('ws');

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID;

const AUDIO_FOLDER = path.join(__dirname, '..', 'public', 'audio');

module.exports = (wss) => {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  wss.on('connection', (ws) => {
    console.log('🟢 WebSocket connected for real-time AI streaming');

    ws.on('message', async (rawData) => {
      const text = rawData.toString().trim();
      console.log('🗣️ User said:', text);

      try {
        const stream = await openai.chat.completions.create({
          model: 'gpt-3.5-turbo',
          messages: [
            { role: 'system', content: 'You are a helpful AI voice assistant.' },
            { role: 'user', content: text }
          ],
          stream: true
        });

        let buffer = '';

        for await (const chunk of stream) {
          const delta = chunk.choices?.[0]?.delta?.content;
          if (!delta) continue;

          buffer += delta;

          const shouldFlush = delta.includes('.') || buffer.split(' ').length >= 5;
          if (shouldFlush) {
            const response = await axios({
              method: 'post',
              url: `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`,
              headers: {
                'xi-api-key': ELEVENLABS_API_KEY,
                'Content-Type': 'application/json',
                'Accept': 'audio/mpeg'
              },
              data: {
                text: buffer,
                model_id: 'eleven_monolingual_v1',
                voice_settings: {
                  stability: 0.4,
                  similarity_boost: 0.75
                }
              },
              responseType: 'arraybuffer'
            });

            ws.send(response.data); // 🔊 Send audio buffer directly to caller
            buffer = '';
          }
        }

        // Final chunk
        if (buffer.trim()) {
          const response = await axios({
            method: 'post',
            url: `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`,
            headers: {
              'xi-api-key': ELEVENLABS_API_KEY,
              'Content-Type': 'application/json',
              'Accept': 'audio/mpeg'
            },
            data: {
              text: buffer,
              model_id: 'eleven_monolingual_v1',
              voice_settings: {
                stability: 0.4,
                similarity_boost: 0.75
              }
            },
            responseType: 'arraybuffer'
          });

          ws.send(response.data);
        }

        ws.send('[[END]]');
      } catch (err) {
        console.error('❌ Real-time GPT stream error:', err.message);
        ws.send('[[ERROR]]');
      }
    });

    ws.on('close', () => {
      console.log('🔴 WebSocket closed');
    });
  });
};
