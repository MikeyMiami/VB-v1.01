// VB-v1.01-main/routes/queue.js
const express = require('express');
const router = express.Router();
const db = require('../db');
const { Queue } = require('bullmq');
const { fetchLeadsFromGoogleSheets } = require('../utils/googleSheets');
const { fetchLeadsFromHubspot } = require('../utils/hubspot'); // placeholder for future
const redisConnection = {
  host: process.env.REDIS_HOST,
  port: process.env.REDIS_PORT
};
const callQueue = new Queue('callQueue', { connection: redisConnection });

// POST /queue/start
router.post('/start', async (req, res) => {
  const { agentId, source } = req.body;

  if (!agentId || !source) {
    return res.status(400).json({ success: false, error: 'Missing agentId or source' });
  }

  try {
    // 1. Get agent settings
    const agent = await new Promise((resolve, reject) => {
      db.get(`SELECT * FROM Agents WHERE id = ?`, [agentId], (err, row) => {
        if (err) return reject(err);
        resolve(row);
      });
    });

    if (!agent) {
      return res.status(404).json({ success: false, error: 'Agent not found' });
    }

    // 2. Get leads from the chosen source
    let leads = [];
    if (source === 'google_sheets') {
      leads = await fetchLeadsFromGoogleSheets(agent.integrationId);
    } else if (source === 'hubspot') {
      leads = await fetchLeadsFromHubspot(agent.integrationId); // You can implement this
    } else {
      return res.status(400).json({ success: false, error: 'Unsupported lead source' });
    }

    // 3. Filter leads with phone numbers
    const filteredLeads = leads.filter(lead => !!lead.phone);

    // 4. Queue each lead
    for (let i = 0; i < filteredLeads.length; i++) {
      const lead = filteredLeads[i];
      await callQueue.add('call', {
        agentId,
        lead,
        position: i + 1,
        total: filteredLeads.length,
        config: {
          prompt_script: agent.prompt_script,
          dial_limit: agent.dial_limit,
          max_calls_per_contact: agent.max_calls_per_contact,
          call_time_start: agent.call_time_start,
          call_time_end: agent.call_time_end,
          call_days: JSON.parse(agent.call_days || '[]'),
          double_dial_no_answer: !!agent.double_dial_no_answer,
          voice_id: agent.voice_id
        }
      });
    }

    res.json({
      success: true,
      message: `Enqueued ${filteredLeads.length} leads for calling.`,
      totalLeads: filteredLeads.length
    });

  } catch (error) {
    console.error('❌ Failed to start queue:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
