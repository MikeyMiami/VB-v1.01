// utils/autopilot.js
const db = require('../db');
const { fetchLeads } = require('./integrations');
const { Queue } = require('bullmq');
const callQueue = new Queue('call-lead', {
  connection: {
    host: process.env.REDIS_HOST,
    port: process.env.REDIS_PORT,
    password: process.env.REDIS_PASSWORD
  }
});

async function runAutopilot() {
  const now = new Date();
  const currentHour = now.getHours();
  const currentDay = now.toLocaleString('en-US', { weekday: 'long' }).toLowerCase();

  const result = await db.query(`
    SELECT * FROM Agents
    WHERE bot_status = 'running'
      AND autopilot_enabled = true
  `);

  for (const agent of result.rows) {
    const allowedDays = JSON.parse(agent.call_days || '[]');

    if (!allowedDays.includes(currentDay)) {
      console.log(`⏩ [${agent.name}] Skipped - ${currentDay} not allowed`);
      continue;
    }

    if (currentHour < agent.call_time_start || currentHour >= agent.call_time_end) {
      console.log(`⏩ [${agent.name}] Skipped - Outside call hours`);
      continue;
    }

    if (!agent.last_lead_source || !agent.last_list_id) {
      console.log(`⚠️ [${agent.name}] Missing lead source info`);
      continue;
    }

    try {
      const leads = await fetchLeads(agent.integration_id, agent.last_list_id);
      const leadsWithPhone = leads.filter(l => l.phone);

      for (const lead of leadsWithPhone) {
        await callQueue.add('call-lead', {
          lead,
          agent
        });
      }

      console.log(`📞 [${agent.name}] Enqueued ${leadsWithPhone.length} leads`);
    } catch (err) {
      console.error(`❌ [${agent.name}] Failed to fetch or enqueue leads:`, err.message);
    }
  }
}

module.exports = { runAutopilot };
