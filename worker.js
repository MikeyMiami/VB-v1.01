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
  db.get(
    `SELECT COUNT(*) AS count FROM CallAttempts WHERE botId = ? AND date(created_at) = date('now')`,
    [agent.id],
    async (err, row) => {
      if (err) {
        console.error('❌ Error checking dial count:', err);
        return;
      }
      const dialCount = row?.count || 0;
      if (dialCount >= agent.dial_limit) {
        console.log(`⚠️ Dial limit reached (${dialCount}/${agent.dial_limit})`);
        return;
      }

      // ✅ Make the call
      try {
        const call = await initiateCall(lead.phone, agent.id);

        // Log to CallAttempts
        db.run(
          `INSERT INTO CallAttempts (botId, leadId, phone_number, status, call_sid, created_at) VALUES (?, ?, ?, ?, ?, datetime('now'))`,
          [agent.id, lead.id || null, lead.phone, 'initiated', call.sid]
        );

        console.log(`📞 Called ${lead.phone} from agent ${agent.name}`);
      } catch (err) {
        console.error(`❌ Call failed for ${lead.phone}:`, err.message);

        db.run(
          `INSERT INTO CallAttempts (botId, leadId, phone_number, status, created_at) VALUES (?, ?, ?, ?, datetime('now'))`,
          [agent.id, lead.id || null, lead.phone, 'failed']
        );
      }
    }
  );
}, { connection });

callWorker.on('completed', (job) => {
  console.log(`✅ Job completed for lead: ${job.id}`);
});

callWorker.on('failed', (job, err) => {
  console.error(`❌ Job failed for lead: ${job.id}`, err.message);
});

// ✅ TEST: Can the worker read from shared DB? (non-blocking, runs once on boot)
db.all(`SELECT * FROM test_table`, (err, rows) => {
  if (err) {
    console.error('❌ Worker DB test failed (could not read test_table):', err.message);
  } else {
    console.log('✅ Worker DB test succeeded. Found rows in test_table:', rows);
  }
});

