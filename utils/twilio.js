// VB-v1.01-main/utils/twilio.js

const twilio = require('twilio');
const db = require('../db');
const VoiceResponse = twilio.twiml.VoiceResponse;

const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

/**
 * Starts an outbound call using Twilio with the given lead and agent data.
 * @param {Object} jobData - Contains lead info and agent attributes.
 */
async function startOutboundCall(jobData) {
  const {
    lead,
    agentId,
    agentName,
    prompt_script,
    voice_id,
    userId
  } = jobData;

  if (!lead.phone) {
    throw new Error('Lead does not have a phone number.');
  }

  try {
    const call = await client.calls.create({
      url: `${process.env.BASE_URL}/twilio-call/stream?leadId=${lead.id}&agentId=${agentId}`,
      to: lead.phone,
      from: process.env.TWILIO_CALLER_ID,
      method: 'POST',
    });

    console.log(`📞 Started call to ${lead.phone}, Call SID: ${call.sid}`);

    // Optionally update DB or logs here to reflect the call was started

    return call.sid;
  } catch (error) {
    console.error(`❌ Error placing call to ${lead.phone}:`, error.message);
    throw error;
  }
}

module.exports = {
  startOutboundCall,
};
