const express = require('express');
const router = express.Router();
const Agent = require('../models/Agent');

// Create bot
router.post('/create', async (req, res) => {
  try {
    const { userId, name, ...settings } = req.body;
    const newAgent = new Agent({ userId, name, ...settings });
    await newAgent.save();
    res.json({ botId: newAgent._id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update
router.patch('/update/:botId', async (req, res) => {
  try {
    await Agent.findByIdAndUpdate(req.params.botId, req.body, { new: true });
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Start
router.post('/start/:botId', async (req, res) => {
  try {
    await Agent.findByIdAndUpdate(req.params.botId, { active: true });
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Stop
router.post('/stop/:botId', async (req, res) => {
  try {
    await Agent.findByIdAndUpdate(req.params.botId, { active: false });
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Test call
router.post('/test/:botId', async (req, res) => {
  const { to } = req.body;
  try {
    const agent = await Agent.findById(req.params.botId);
    if (!agent) return res.status(404).json({ error: 'Bot not found' });

    // One-off dial
    const callQueue = new (require('bullmq').Queue)('calls', { connection: { host: process.env.REDIS_HOST || 'localhost', port: process.env.REDIS_PORT || 6379, password: process.env.REDIS_PASSWORD } });
    await callQueue.add('dial', { botId: agent._id, to, contactId: 'test' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
