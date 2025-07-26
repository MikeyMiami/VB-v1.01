// VB-v1.01-main/worker.js
const { Worker } = require('bullmq');
const db = require('./db');
const { getCallAttempts, incrementCallAttempt, markCallAttemptStatus } = require('./utils/queueUtils');
const { makeCallWithBot } = require('./utils/twilio'); // You'll build this next
const IORedis = require('ioredis');

const connection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379');

const callWorker = new Worker(
  'call-lead',
  async (job) => {
    const { agentId, lead } = job.data;

    try {
      // Fetch agent config
      const agent = await new Promise((resolve, reject) => {
        db.get('SELECT * FROM Agents WHERE id = ?', [agentId], (err, row) => {
          if (err) return reject(err);
          resolve(row);
        });
      });

      if (!agent) throw new Error(`Agent with ID ${agentId} not found.`);

      // Skip if max attempts reached
      const attemptCount = await getCallAttempts(agentId, lead.phone);
      if (attemptCount >= agent.max_calls_per_contact) {
        console.log(`❌ Skipping ${lead.phone} — max attempts reached.`);
        return;
      }

      // Log call attempt
      await incrementCallAttempt(agentId, lead.phone);
      console.log(`📞 Calling ${lead.phone}... [Attempt ${attemptCount + 1}]`);

      // Make the call (replace this stub with real logic in utils/twilio.js)
      const callResult = await makeCallWithBot({
        agent,
        lead,
      });

      // Mark status (you can make this dynamic if you inspect Twilio status later)
      await markCallAttemptStatus(agentId, lead.phone, callResult.success ? 'success' : 'failed');
      console.log(`✅ Call ${lead.phone} complete: ${callResult.status}`);
    } catch (err) {
      console.error('❌ Call worker error:', err);
    }
  },
  { connection }
);

callWorker.on('completed', (job) => {
  console.log(`🎉 Job ${job.id} completed`);
});

callWorker.on('failed', (job, err) => {
  console.error(`💥 Job ${job.id} failed:`, err);
});

