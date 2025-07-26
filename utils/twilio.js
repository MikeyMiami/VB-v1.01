// utils/twilio.js
const twilio = require('twilio');

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const fromNumber = process.env.TWILIO_PHONE_NUMBER;

if (!accountSid || !authToken || !fromNumber) {
  throw new Error('Twilio credentials are not properly configured.');
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
      url: `${process.env.PUBLIC_API_URL}/twilio/voice-response?botId=${encodeURIComponent(botId)}`,
      to,
      from: fromNumber,
      method: 'POST',
      statusCallback: `${process.env.PUBLIC_API_URL}/twilio/status-callback`,
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

