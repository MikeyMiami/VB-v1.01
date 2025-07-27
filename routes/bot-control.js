// routes/bot-control.js
const express = require('express');
const router = express.Router();
const db = require('../db');

router.post('/start', async (req, res) => {
  const { agentId, source, listId } = req.body;

  if (!agentId || !source) {
    return res.status(400).json({ error: 'Missing agentId or source' });
  }

  try {
    await db.query(
      `UPDATE Agents
       SET bot_status = 'running',
           autopilot_enabled = true,
           last_lead_source = $1,
           last_list_id = $2
       WHERE id = $3`,
      [source, listId || null, agentId]
    );

    return res.json({ success: true, message: 'Bot started with autopilot' });
  } catch (err) {
    console.error('❌ Error starting bot:', err.message);
    return res.status(500).json({ error: 'Failed to start bot' });
  }
});

router.post('/pause', async (req, res) => {
  const { agentId } = req.body;

  if (!agentId) {
    return res.status(400).json({ error: 'Missing agentId' });
  }

  try {
    await db.query(
      `UPDATE Agents
       SET bot_status = 'paused',
           autopilot_enabled = false
       WHERE id = $1`,
      [agentId]
    );

    return res.json({ success: true, message: 'Bot paused' });
  } catch (err) {
    console.error('❌ Error pausing bot:', err.message);
    return res.status(500).json({ error: 'Failed to pause bot' });
  }
});

router.post('/stop', async (req, res) => {
  const { agentId } = req.body;

  if (!agentId) {
    return res.status(400).json({ error: 'Missing agentId' });
  }

  try {
    await db.query(
      `UPDATE Agents
       SET bot_status = 'stopped',
           autopilot_enabled = false
       WHERE id = $1`,
      [agentId]
    );

    return res.json({ success: true, message: 'Bot stopped' });
  } catch (err) {
    console.error('❌ Error stopping bot:', err.message);
    return res.status(500).json({ error: 'Failed to stop bot' });
  }
});

module.exports = router;
