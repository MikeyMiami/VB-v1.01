// VB-v1.01-main/worker.js

const { Worker } = require('bullmq');
const path = require('path');
const { startOutboundCall } = require('./utils/twilio');
const db = require('./db');
require('dotenv').config();

const connection = {
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: process.env.REDIS_PORT || 6379,
};

const worker = new Worker('call-lead', async (job) => {
  const {
    lead,
    agentId,
    agentName,
    prompt_script,
    dial_limit,
    max_calls_per_contact,
    call_time_start,
    call_time_end,
    call_days,
    double_dial_no_answer,
    voice_id,
    userId
  } = job.data;

  try {
    console.log(`🚀 Calling lead ${lead.phone} for agent ${agentName}`);

    // Validate time constraints
    const now = new Date();
    const currentHour = now.getHours();
    const currentDay = now.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();

    const allowedDays = Array.isArray(call_days)
      ? call_days
      : JSON.parse(call_days || '[]');

    if (
      (call_time_start && currentHour < call_time_start) ||
      (call_time_end && currentHour >= call_time_end) ||
      (allowedDays.length && !allowedDays.includes(currentDay))
    ) {
      console.log(`⏰ Call to ${lead.phone} skipped due to time/day restrictions`);
      return;
    }

    // Check if this contact has exceeded max call attempts
    const callCountRow = await db.get(
      `SELECT count FROM CallAttempts WHERE lead_id = ? AND agent_id = ?`,
      [lead.id, agentId]
    );

    const attempts = callCountRow?.count || 0;

    if (max_calls_per_contact && attempts >= max_calls_per_contact) {
      console.log(`⚠️ Skipping ${lead.phone} — reached max calls (${attempts})`);
      return;
    }

    // Initiate outbound call
    const callSid = await startOutboundCall({
      lead,
      agentId,
      agentName,
      prompt_script,
      voice_id,
      userId
    });

    // Update call attempts
    if (callCountRow) {
      await db.run(
        `UPDATE CallAttempts SET count = count + 1 WHERE lead_id = ? AND agent_id = ?`,
        [lead.id, agentId]
      );
    } else {
      await db.run(
        `INSERT INTO CallAttempts (lead_id, agent_id, count) VALUES (?, ?, 1)`,
        [lead.id, agentId]
      );
    }

    console.log(`✅ Call placed to ${lead.phone}, SID: ${callSid}`);
  } catch (error) {
    console.error(`❌ Error calling lead ${lead.phone}:`, error.message);
  }
}, { connection });

console.log('👷 Worker is running and listening for call-lead jobs...');

