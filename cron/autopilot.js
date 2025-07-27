// VB-v1.01-main/cron/autopilot.js
const db = require('../db');
const { fetchLeads } = require('../utils/integrations');
const { Queue } = require('bullmq');
const dayjs = require('dayjs');
const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD,
};
const callQueue = new Queue('call-lead', { connection: redisConfig });

async function runAutopilot() {
  const now = dayjs();
  const weekday = now.format('dddd').toLowerCase();
  const hour = now.hour();

  const { rows: agents } = await db.query(`SELECT * FROM Agents WHERE active = true`);

  for (const agent of agents) {
    try {
      const callDays = JSON.parse(agent.call_days || '[]');
      if (!callDays.includes(weekday)) continue;
      if (hour < agent.call_time_start || hour >= agent.call_time_end) continue;

      const leads = await fetchLeads(agent.integrationid);
      if (!leads || leads.length === 0) continue;

      for (const lead of leads) {
        await callQueue.add('call-lead', { agent, lead });
      }

      console.log(`✅ Autopilot: Queued ${leads.length} leads for Agent ${agent.name}`);
    } catch (err) {
      console.error(`❌ Error running autopilot for Agent ${agent.id}:`, err.message);
    }
  }
}

module.exports = runAutopilot;
