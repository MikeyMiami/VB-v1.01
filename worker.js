// worker.js
const { Worker } = require('bullmq');
const db = require('./db');
const { initiateCall } = require('./utils/twilio');
const dayjs = require('dayjs');

const QUEUE_NAME = 'call-lead';
const connection = {
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: process.env.REDIS_PORT || 6379,
};

const callWorker = new Worker(QUEUE_NAME, async (job) => {
  const { lead, agent } = job.data;

  const now = dayjs();
  const currentHour = now.hour();
  const currentDay = now.format('dddd').toLowerCase();

  const allowedDays = JSON.parse(agent.call_days || '[]');
  if (!allowedDays.includes(currentDay)) {
    console.log(`⏸️ Skipping call - ${currentDay} is not in agent's allowed days`);
    return;
  }

  if (currentHour < agent.call_time_start || currentHour >= agent.call_time_end) {
    console.log(`⏸️ Skipping call - outside call hours (${currentHour}h)`);
    return;
  }

  try {
    const result = await db.query(
      `SELECT COUNT(*) FROM "CallAttempts" WHERE "botId" = $1 AND DATE("createdDate") = CURRENT_DATE`,
      [agent.id]
    );

    const dialCount = parseInt(result.rows[0].count, 10);
    if (dialCount >= agent.dial_limit) {
      console.log(`⚠️ Dial limit reached (${dialCount}/${agent.dial_limit})`);
      return;
    }

    const call = await initiateCall(lead.phone, agent.id);

    await db.query(
      `INSERT INTO "CallAttempts" ("botId", "leadId", "phone_number", "status", "call_sid", "createdDate") 
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [agent.id, lead.id || null, lead.phone, 'initiated', call.sid]
    );

    console.log(`📞 Called ${lead.phone} from agent ${agent.name}`);
  } catch (err) {
    console.error(`❌ Call failed for ${lead.phone}:`, err.message);
    await db.query(
      `INSERT INTO "CallAttempts" ("botId", "leadId", "phone_number", "status", "createdDate") 
       VALUES ($1, $2, $3, $4, NOW())`,
      [agent.id, lead.id || null, lead.phone, 'failed']
    );
  }
}, { connection });

callWorker.on('completed', (job) => {
  console.log(`✅ Job completed for lead: ${job.id}`);
});

callWorker.on('failed', (job, err) => {
  console.error(`❌ Job failed for lead: ${job.id}`, err.message);
});


