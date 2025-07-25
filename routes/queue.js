// VB-v1.01-main/routes/queue.js
const express = require('express');
const router = express.Router();
const { Queue } = require('bullmq');
const db = require('../db');
const fetchLeads = require('../utils/integrations');
const { getLeadsFromGoogleSheets } = require('../utils/googleSheets');

const callQueue = new Queue('callQueue', {
  connection: {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: process.env.REDIS_PORT || 6379,
  },
});

// POST /queue/start
router.post('/start', async (req, res) => {
  const { agentId, source } = req.body;

  if (!agentId || !source) {
    return res.status(400).json({ success: false, error: 'agentId and source are required' });
  }

  try {
    db.get('SELECT * FROM Agents WHERE id = ?', [agentId], async (err, agent) => {
      if (err || !agent) {
        return res.status(404).json({ success: false, error: 'Agent not found' });
      }

      let leads = [];

      if (source === 'google_sheets') {
        leads = await getLeadsFromGoogleSheets();
      } else if (source === 'hubspot') {
        leads = await fetchLeads(agent.integrationId);
      } else {
        return res.status(400).json({ success: false, error: 'Invalid source' });
      }

      const filteredLeads = leads.filter(l => l.phone); // Only enqueue leads with phone

      for (let i = 0; i < filteredLeads.length; i++) {
        const lead = filteredLeads[i];

        await callQueue.add(`call-${agentId}-${i}`, {
          agentId,
          lead,
          position: i + 1,
          total: filteredLeads.length,
          agentAttributes: agent,
        });
      }

      res.json({
        success: true,
        message: `Queue started with ${filteredLeads.length} leads from ${source}.`,
      });
    });
  } catch (err) {
    console.error('❌ Failed to start queue:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /queue/pause
router.post('/pause', async (req, res) => {
  try {
    await callQueue.pause();
    res.json({ success: true, message: 'Queue paused successfully.' });
  } catch (error) {
    console.error('❌ Failed to pause queue:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /queue/resume
router.post('/resume', async (req, res) => {
  try {
    await callQueue.resume();
    res.json({ success: true, message: 'Queue resumed successfully.' });
  } catch (error) {
    console.error('❌ Failed to resume queue:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /queue/stop
router.post('/stop', async (req, res) => {
  try {
    await callQueue.drain(); // Clear waiting jobs
    await callQueue.clean(0, 1000, 'delayed');
    await callQueue.clean(0, 1000, 'wait');
    await callQueue.clean(0, 1000, 'active');
    await callQueue.clean(0, 1000, 'completed');
    await callQueue.clean(0, 1000, 'failed');
    res.json({ success: true, message: 'Queue stopped and cleared.' });
  } catch (error) {
    console.error('❌ Failed to stop queue:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;

