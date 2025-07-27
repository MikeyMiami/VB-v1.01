// VB-v1.01-main/routes/queue.js
const express = require('express');
const router = express.Router();
const db = require('../db');
const { Queue } = require('bullmq');
const { fetchLeads } = require('../utils/integrations');
const { logAgentQueue } = require('../utils/queueLogger');
const dayjs = require('dayjs');

const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD,
};

const callQueue = new Queue('call-lead', { connection: redisConfig });

// ✅ /queue/load — Selects the lead source only (no jobs enqueued)
router.post('/load', async (req, res) => {
  const { agentId, integrationId } = req.body;
  if (!agentId || !integrationId) {
    return res.status(400).json({ error: 'Missing agentId or integrationId' });
  }

  try {
    await db.query(`UPDATE Agents SET integrationId = $1 WHERE id = $2`, [integrationId, agentId]);
    return res.status(200).json({ message: '✅ Lead source successfully loaded for agent.' });
  } catch (err) {
    console.error('❌ Error loading leads:', err.message);
    return res.status(500).json({ error: 'Failed to load lead source.' });
  }
});

// ✅ /queue/start — Starts bot & calls only if time/day match
router.post('/start', async (req, res) => {
  const { agentId } = req.body;
  if (!agentId) return res.status(400).json({ error: 'Missing agentId' });

  try {
    const { rows } = await db.query(`SELECT * FROM Agents WHERE id = $1`, [agentId]);
    const agent = rows[0];
    if (!agent) return res.status(404).json({ error: 'Agent not found' });

    await db.query(`UPDATE Agents SET active = true WHERE id = $1`, [agentId]);
    await logAgentQueue(agentId, `🟢 Bot started for Agent ${agent.name}`);

    const now = dayjs();
    const weekday = now.format('dddd').toLowerCase();
    const hour = now.hour();
    const callDays = JSON.parse(agent.call_days || '[]');

    if (!callDays.includes(weekday)) {
      await logAgentQueue(agentId, `⏸️ Today (${weekday}) is not in allowed call_days.`);
      return res.status(200).json({
        message: `🟡 Bot started for Agent ${agent.name}, but today (${weekday}) is not in call_days.`,
      });
    }

    if (hour < agent.call_time_start || hour >= agent.call_time_end) {
      await logAgentQueue(agentId, `🕒 Outside allowed calling hours: (${hour})`);
      return res.status(200).json({
        message: `🕒 Bot started for Agent ${agent.name}, but it is outside of allowed calling hours.`,
      });
    }

    const leads = await fetchLeads(agent.integrationid);
    if (!leads || leads.length === 0) {
      await logAgentQueue(agentId, `⚠️ No leads found to queue`);
      return res.status(200).json({ message: 'Bot is active, but no leads found.' });
    }

    for (const lead of leads) {
      await callQueue.add('call-lead', { agent, lead });
    }

    await logAgentQueue(agentId, `✅ Queued ${leads.length} leads`);

    return res.status(200).json({
      message: `✅ Bot started and ${leads.length} leads queued for Agent ${agent.name}.`,
    });
  } catch (err) {
    console.error('❌ Error starting bot:', err.message);
    return res.status(500).json({ error: 'Failed to start queue.' });
  }
});

// 🟡 Pause route
router.post('/pause', async (req, res) => {
  const { agentId } = req.body;
  if (!agentId) return res.status(400).json({ error: 'Missing agentId' });

  try {
    await db.query(`UPDATE Agents SET active = false WHERE id = $1`, [agentId]);
    await logAgentQueue(agentId, `⏸️ Bot manually paused`);
    return res.status(200).json({ message: '⏸️ Bot paused successfully.' });
  } catch (err) {
    console.error('❌ Error pausing bot:', err.message);
    return res.status(500).json({ error: 'Failed to pause bot.' });
  }
});

// 🟡 Resume route
router.post('/resume', async (req, res) => {
  const { agentId } = req.body;
  if (!agentId) return res.status(400).json({ error: 'Missing agentId' });

  try {
    await db.query(`UPDATE Agents SET active = true WHERE id = $1`, [agentId]);
    await logAgentQueue(agentId, `▶️ Bot resumed`);
    return res.status(200).json({ message: '▶️ Bot resumed successfully.' });
  } catch (err) {
    console.error('❌ Error resuming bot:', err.message);
    return res.status(500).json({ error: 'Failed to resume bot.' });
  }
});

// 🟡 Stop route
router.post('/stop', async (req, res) => {
  const { agentId } = req.body;
  if (!agentId) return res.status(400).json({ error: 'Missing agentId' });

  try {
    await db.query(`UPDATE Agents SET active = false WHERE id = $1`, [agentId]);
    await logAgentQueue(agentId, `🛑 Bot stopped`);
    return res.status(200).json({ message: '🛑 Bot stopped successfully.' });
  } catch (err) {
    console.error('❌ Error stopping bot:', err.message);
    return res.status(500).json({ error: 'Failed to stop bot.' });
  }
});

module.exports = router;

