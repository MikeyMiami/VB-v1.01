// utils/twilio.js
const twilio = require('twilio');

const accountSid = process.env.TWILIO_SID;
const authToken = process.env.TWILIO_AUTH;
const fromNumber = process.env.TWILIO_NUMBER;
const publicUrl = process.env.PUBLIC_URL;

if (!accountSid || !authToken || !fromNumber || !publicUrl) {
  throw new Error('Twilio or public URL environment variables are not properly configured.');
}

const client = twilio(accountSid, authToken);

/**
 * Initiates a voice call to a given number using Twilio.
 * @param {string} to - The phone number to call (in E.164 format).
 * @param {string} botId - A unique identifier for the bot session (e.g. agentId).
 * @returns {Promise<object>} Twilio call response.
 */
async function initiateCall(to, botId) {
  try {
    const call = await client.calls.create({
      url: `${publicUrl}/twilio/voice-response?botId=${encodeURIComponent(botId)}`,
      to,
      from: fromNumber,
      method: 'POST',
      statusCallback: `${publicUrl}/twilio/status-callback`,
      statusCallbackMethod: 'POST',
      statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed']
    });

    console.log(`✅ Call initiated to ${to} - SID: ${call.sid}`);
    return call;
  } catch (err) {
    console.error(`❌ Error initiating call to ${to}:`, err.message);
    throw err;
  }
}

module.exports = {
  initiateCall,
};

