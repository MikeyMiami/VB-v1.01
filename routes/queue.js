// routes/queue.js
const express = require('express');
const router = express.Router();
const db = require('../db');
const { Queue } = require('bullmq');
const { fetchLeads } = require('../utils/integrations');
const { fetchGoogleSheetLeads } = require('../utils/googleSheets');

const callQueue = new Queue('call-queue', {
  connection: {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379
  }
});

let queueState = {
  isPaused: false,
  currentJobIndex: 0,
  jobs: [],
  agentId: null,
  source: null,
};

// POST /queue/start
router.post('/start', async (req, res) => {
  try {
    const { agentId, source, listId } = req.body;

    if (!agentId || !source) {
      return res.status(400).json({ success: false, message: 'agentId and source are required.' });
    }

    // Fetch agent attributes
    const agent = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM Agents WHERE id = ?', [agentId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (!agent) {
      return res.status(404).json({ success: false, message: 'Agent not found.' });
    }

    let leads = [];

    if (source === 'google_sheets') {
      leads = await fetchGoogleSheetLeads();
    } else if (source === 'hubspot') {
      leads = await fetchLeads(agent.integrationId, listId);
    } else {
      return res.status(400).json({ success: false, message: 'Invalid source provided.' });
    }

    if (!leads.length) {
      return res.json({ success: true, message: 'No leads found with phone numbers.' });
    }

    // Clear existing queue and populate new one
    await callQueue.drain();
    queueState.jobs = [];
    queueState.currentJobIndex = 0;
    queueState.agentId = agentId;
    queueState.source = source;
    queueState.isPaused = false;

    for (let i = 0; i < leads.length; i++) {
      const lead = leads[i];
      const jobData = {
        agentId,
        agentAttributes: agent,
        lead,
        position: i + 1,
        total: leads.length,
      };

      await callQueue.add('call-lead', jobData);
      queueState.jobs.push(jobData);
    }

    res.json({
      success: true,
      message: `Queued ${leads.length} leads for calling.`,
      leadsQueued: leads.length
    });

  } catch (err) {
    console.error('❌ Failed to start bot queue:', err);
    res.status(500).json({ success: false, message: 'Server error while starting queue.', error: err.message });
  }
});

// POST /queue/pause
router.post('/pause', async (req, res) => {
  try {
    await callQueue.pause();
    queueState.isPaused = true;
    res.json({ success: true, message: 'Bot queue paused.' });
  } catch (err) {
    console.error('❌ Failed to pause queue:', err);
    res.status(500).json({ success: false, message: 'Server error while pausing queue.', error: err.message });
  }
});

// POST /queue/resume
router.post('/resume', async (req, res) => {
  try {
    await callQueue.resume();
    queueState.isPaused = false;
    res.json({ success: true, message: 'Bot queue resumed.' });
  } catch (err) {
    console.error('❌ Failed to resume queue:', err);
    res.status(500).json({ success: false, message: 'Server error while resuming queue.', error: err.message });
  }
});

// POST /queue/stop
router.post('/stop', async (req, res) => {
  try {
    await callQueue.drain();
    queueState.jobs = [];
    queueState.currentJobIndex = 0;
    queueState.isPaused = false;
    queueState.agentId = null;
    queueState.source = null;

    res.json({ success: true, message: 'Bot queue stopped and cleared.' });
  } catch (err) {
    console.error('❌ Failed to stop queue:', err);
    res.status(500).json({ success: false, message: 'Server error while stopping queue.', error: err.message });
  }
});

module.exports = router;
