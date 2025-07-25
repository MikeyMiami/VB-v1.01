// VB-v1.01-main/worker.js
const { Worker } = require('bullmq');
const db = require('./db');
const { makeCall } = require('./utils/twilio'); // This is your outbound call logic
const { updateLeadStatus } = require('./utils/leadTracking'); // Optional: update status post-call

const connection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT) || 6379,
};

const worker = new Worker('call-queue', async job => {
  const { lead, agentId } = job.data;

  try {
    // Fetch agent attributes
    const agent = await new Promise((resolve, reject) => {
      db.get(`SELECT * FROM Agents WHERE id = ?`, [agentId], (err, row) => {
        if (err) return reject(err);
        resolve(row);
      });
    });

    if (!agent) throw new Error(`Agent with ID ${agentId} not found.`);

    // Respect call time window (e.g., 9 AM to 5 PM)
    const now = new Date();
    const hour = now.getHours();
    if (hour < agent.call_time_start || hour >= agent.call_time_end) {
      console.log(`Skipping call for ${lead.phone}: Outside call window.`);
      return;
    }

    // Make the call
    console.log(`📞 Calling ${lead.name || lead.phone} using bot: ${agent.name}`);
    await makeCall(lead, agent);

    // Optional: update status
    if (lead.id && updateLeadStatus) {
      await updateLeadStatus(lead.id, 'Attempted Contact');
    }

  } catch (err) {
    console.error(`❌ Error processing call job:`, err);
  }
}, { connection });

worker.on('completed', job => {
  console.log(`✅ Completed call job for ${job.data.lead.phone}`);
});

worker.on('failed', (job, err) => {
  console.error(`🔥 Call job failed for ${job.data.lead.phone}:`, err);
});

