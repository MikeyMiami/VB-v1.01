/// worker.js
const { Worker } = require('bullmq');
const db = require('./db'); // ✅ Use shared db.js file
const { initiateCall } = require('./utils/twilio');
const dayjs = require('dayjs');

const QUEUE_NAME = 'call-lead';
const connection = {
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: process.env.REDIS_PORT || 6379,
};

console.log('✅ Worker connected to Redis queue:', QUEUE_NAME);

const callWorker = new Worker(QUEUE_NAME, async (job) => {
  const {
    lead,
    agent,
  } = job.data;

  const now = dayjs();
  const currentHour = now.hour();
  const currentDay = now.format('dddd').toLowerCase(); // e.g., 'monday'

  // ✅ Call time/day enforcement
  const allowedDays = JSON.parse(agent.call_days || '[]');
  if (!allowedDays.includes(currentDay)) {
    console.log(`⏸️ Skipping call - ${currentDay} is not in agent's allowed days`);
    return;
  }
  if (currentHour < agent.call_time_start || currentHour >= agent.call_time_end) {
    console.log(`⏸️ Skipping call - outside call hours (${currentHour}h)`);
    return;
  }

  // ✅ Check dial limits for the day
  try {
    const result = await db.query(
      `SELECT COUNT(*) FROM CallAttempts WHERE agentId = $1 AND DATE(createdDate) = CURRENT_DATE`,
      [agent.id]
    );
    const dialCount = parseInt(result.rows[0].count) || 0;

    if (dialCount >= agent.dial_limit) {
      console.log(`⚠️ Dial limit reached (${dialCount}/${agent.dial_limit})`);
      return;
    }

    // ✅ Make the call
    const call = await initiateCall(lead.phone, agent.id);

    // Log to CallAttempts
    await db.query(
      `INSERT INTO CallAttempts (agentId, leadPhone, status, call_sid, createdDate)
       VALUES ($1, $2, $3, $4, NOW())`,
      [agent.id, lead.phone, 'initiated', call.sid]
    );

    console.log(`📞 Called ${lead.phone} from agent ${agent.name}`);

  } catch (err) {
    console.error(`❌ Call failed for ${lead.phone}:`, err.message);

    try {
      await db.query(
        `INSERT INTO CallAttempts (agentId, leadPhone, status, createdDate)
         VALUES ($1, $2, $3, NOW())`,
        [agent.id, lead.phone, 'failed']
      );
    } catch (logErr) {
      console.error('❌ Failed to log failed call attempt:', logErr.message);
    }
  }
}, { connection });

callWorker.on('completed', (job) => {
  console.log(`✅ Job completed for lead: ${job.id}`);
});

callWorker.on('failed', (job, err) => {
  console.error(`❌ Job failed for lead: ${job.id}`, err.message);
});



