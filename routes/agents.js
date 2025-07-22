// VB-v1.01-main/routes/agents.js
const express = require('express');
const router = express.Router();
const db = require('../db');
const bcrypt = require('bcryptjs');
const { Queue } = require('bullmq');

const redisConnection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD
};

// Register (generate API key for new user)
router.post('/register', async (req, res) => {
  const { userId } = req.body;
  try {
    const hashedKey = await bcrypt.hash(userId + Date.now().toString(), 10);
    db.run(`INSERT INTO Integrations (userId, api_key) VALUES (?, ?)`, [userId, hashedKey], function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ apiKey: hashedKey });
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create bot
router.post('/create', (req, res) => {
  const { userId, name, prompt_script, dial_limit, max_calls_per_contact, call_time_start, call_time_end, call_days, double_dial_no_answer, integrationId } = req.body;
  const callDaysJson = JSON.stringify(call_days || []);
  db.run(`INSERT INTO Agents (userId, name, prompt_script, dial_limit, max_calls_per_contact, call_time_start, call_time_end, call_days, double_dial_no_answer, integrationId) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [userId, name, prompt_script, dial_limit, max_calls_per_contact, call_time_start, call_time_end, callDaysJson, double_dial_no_answer ? 1 : 0, integrationId],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ botId: this.lastID });
    }
  );
});

// Update bot
router.patch('/update/:botId', (req, res) => {
  const { prompt_script, dial_limit, max_calls_per_contact, call_time_start, call_time_end, call_days, double_dial_no_answer, integrationId } = req.body;
  const callDaysJson = JSON.stringify(call_days || []);
  db.run(`UPDATE Agents SET prompt_script = ?, dial_limit = ?, max_calls_per_contact = ?, call_time_start = ?, call_time_end = ?, call_days = ?, double_dial_no_answer = ?, integrationId = ?, modifiedDate = CURRENT_TIMESTAMP WHERE id = ?`,
    [prompt_script, dial_limit, max_calls_per_contact, call_time_start, call_time_end, callDaysJson, double_dial_no_answer ? 1 : 0, integrationId, req.params.botId],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
    }
  );
});

// Start bot
router.post('/start/:botId', (req, res) => {
  db.run(`UPDATE Agents SET active = 1 WHERE id = ?`, [req.params.botId], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

// Stop bot
router.post('/stop/:botId', (req, res) => {
  db.run(`UPDATE Agents SET active = 0 WHERE id = ?`, [req.params.botId], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

// Test call
router.post('/test/:botId', async (req, res) => {
  const { to } = req.body;
  db.get(`SELECT * FROM Agents WHERE id = ?`, [req.params.botId], async (err, agent) => {
    if (err || !agent) return res.status(404).json({ error: 'Bot not found' });

    const callQueue = new Queue('calls', { connection: redisConnection });
    await callQueue.add('dial', { botId: agent.id, phone: to, contactId: 'test' });
    res.json({ success: true });
  });
});

module.exports = router;
