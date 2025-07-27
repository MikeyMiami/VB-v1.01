const { Worker } = require('bullmq');
const db = require('./db'); // ✅ Use shared db.js file
const twilio = require('twilio');
const dayjs = require('dayjs');
const { logAgentQueue } = require('./utils/queueLogger');

const QUEUE_NAME = 'call-lead';
const connection = {
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: process.env.REDIS_PORT || 6379,
};

console.log('✅ Worker connected to Redis queue:', QUEUE_NAME);

const client = twilio(process.env.TWILIO_SID, process.env.TWILIO_AUTH);

const callWorker = new Worker(QUEUE_NAME, async (job) => {
  const { lead, agent } = job.data;

  const now = dayjs();
  const currentHour = now.hour();
  const currentDay = now.format('dddd').toLowerCase(); // e.g., 'monday'

  // ✅ Call time/day enforcement
  const allowedDays = JSON.parse(agent.call_days || '[]');
  if (!allowedDays.includes(currentDay)) {
    const msg = `⏸️ Skipping call - ${currentDay} is not in agent's allowed days`;
    console.log(msg);
    await logAgentQueue(agent.id, msg);
    return;
  }

  if (currentHour < agent.call_time_start || currentHour >= agent.call_time_end) {
    const msg = `⏸️ Skipping call - outside call hours (${currentHour}h)`;
    console.log(msg);
    await logAgentQueue(agent.id, msg);
    return;
  }

  try {
    // ✅ Check dial limits for the day
    const result = await db.query(
      `SELECT COUNT(*) FROM CallAttempts WHERE agentId = $1 AND DATE(createdDate) = CURRENT_DATE`,
      [agent.id]
    );
    const dialCount = parseInt(result.rows[0].count) || 0;

    if (dialCount >= agent.dial_limit) {
      const msg = `⚠️ Dial limit reached (${dialCount}/${agent.dial_limit})`;
      console.log(msg);
      await logAgentQueue(agent.id, msg);
      return;
    }

    // ✅ Check monthly minutes usage
    if (agent.minutes_used >= agent.max_monthly_minutes) {
      const msg = `⚠️ Max monthly minutes reached (${agent.minutes_used}/${agent.max_monthly_minutes})`;
      console.log(msg);
      await logAgentQueue(agent.id, msg);
      return;
    }

    // ✅ Get the correct Twilio number
    const fromNumber = agent?.twilio_number || process.env.TWILIO_NUMBER;

    const msgDialing = `📞 Calling ${lead.phone} from ${fromNumber}`;
    console.log(msgDialing);
    await logAgentQueue(agent.id, msgDialing);

    const call = await client.calls.create({
      to: lead.phone,
      from: fromNumber,
      url: `https://${process.env.SERVER_DOMAIN}/voice/handler?agentId=${agent.id}&leadId=${lead.id}`,
      statusCallback: `https://${process.env.SERVER_DOMAIN}/voice/status`,
      statusCallbackMethod: 'POST',
      statusCallbackEvent: ['completed']
    });

    // ✅ Log to CallAttempts
    await db.query(
      `INSERT INTO CallAttempts (agentId, leadPhone, status, call_sid, createdDate)
       VALUES ($1, $2, $3, $4, NOW())`,
      [agent.id, lead.phone, 'initiated', call.sid]
    );

    const msg = `✅ Call initiated to ${lead.phone} (Call SID: ${call.sid})`;
    console.log(msg);
    await logAgentQueue(agent.id, msg);

  } catch (err) {
    const errorMsg = `❌ Call failed for ${lead.phone}: ${err.message}`;
    console.error(errorMsg);
    await logAgentQueue(agent.id, errorMsg);

    try {
      await db.query(
        `INSERT INTO CallAttempts (agentId, leadPhone, status, createdDate)
         VALUES ($1, $2, $3, NOW())`,
        [agent.id, lead.phone, 'failed']
      );
    } catch (logErr) {
      const logErrorMsg = '❌ Failed to log failed call attempt: ' + logErr.message;
      console.error(logErrorMsg);
      await logAgentQueue(agent.id, logErrorMsg);
    }
  }
}, { connection });

callWorker.on('completed', (job) => {
  console.log(`✅ Job completed for lead: ${job.id}`);
});

callWorker.on('failed', (job, err) => {
  console.error(`❌ Job failed for lead: ${job.id}`, err.message);
});

