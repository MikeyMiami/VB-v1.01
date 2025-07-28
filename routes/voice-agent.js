const express = require('express');
const router = express.Router();
const db = require('../db');
const { OpenAIStream } = require('../utils/openai-stream');
const { ElevenLabsStream } = require('../utils/tts');
const { DeepgramTranscriber } = require('../utils/stt');
const { createWriteStream } = require('fs');
const axios = require('axios');

router.ws('/voice-agent/:agentId', async (ws, req) => {
  const agentId = parseInt(req.params.agentId);
  const agent = await db.getAgentById(agentId);
  if (!agent) return ws.close();

  const transcriber = new DeepgramTranscriber();
  const audioStream = new ElevenLabsStream(agent.voice_id || process.env.ELEVENLABS_VOICE_ID);
  const gptStream = new OpenAIStream(agent.prompt);

  const transcriptFile = `./transcripts/session-${Date.now()}.txt`;
  const fileWriter = createWriteStream(transcriptFile);

  let currentTranscript = '';
  let aiResponseBuffer = '';
  let isBookingTriggered = false;

  ws.on('message', async (msg) => {
    const audioChunk = Buffer.from(msg);
    transcriber.write(audioChunk);

    if (!audioStream.isStreaming()) {
      const transcriptData = await transcriber.flush();
      const userText = transcriptData.text || '';

      currentTranscript += `User: ${userText}\n`;
      fileWriter.write(`User: ${userText}\n`);

      const gptReplyStream = await gptStream.sendPromptStream(userText, async (word) => {
        ws.send(word);
        aiResponseBuffer += word;

        // Detect inline booking trigger
        if (!isBookingTriggered && aiResponseBuffer.includes('"action":"book_calendar"')) {
          try {
            const match = aiResponseBuffer.match(/{[^}]*"action"\s*:\s*"book_calendar"[^}]*}/);
            if (match) {
              const payload = JSON.parse(match[0]);

              const { email, time } = payload;
              const response = await axios.post(`${process.env.API_BASE_URL || 'https://vb-v1-01-web-8zvw.onrender.com'}/calendar/create`, {
                agentId: agentId,
                recipientEmail: email,
                startTime: time,
                durationMinutes: agent.meeting_duration_minutes || 15,
                location: agent.calendar_type === 'zoom' ? 'Zoom' : 'Phone Call',
                title: agent.meeting_title_template || 'Appointment',
                description: `Call with ${agent.name || 'AI Assistant'}`
              });

              console.log('📅 Calendar booked:', response.data);
              isBookingTriggered = true;
            }
          } catch (err) {
            console.error('❌ Error processing booking trigger:', err.message);
          }
        }
      });

      currentTranscript += `Bot: ${gptReplyStream.fullResponse}\n`;
      fileWriter.write(`Bot: ${gptReplyStream.fullResponse}\n`);
    }
  });

  ws.on('close', () => {
    transcriber.end();
    fileWriter.end();
  });

  audioStream.pipe(ws);
});

module.exports = router;


