const express = require('express');
const router = express.Router();
const db = require('../db');
const jwt = require('jsonwebtoken');
const { Queue } = require('bullmq');

const redisConnection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD
};

// Register (generate API key for new user) - No auth required
router.post('/register', (req, res) => {
  const { userId } = req.body;
  try {
    const apiKey = jwt.sign({ userId }, process.env.JWT_SECRET || 'your-secret', { expiresIn: '1y' }); // Generate JWT
    db.run(`INSERT INTO Integrations (userId, api_key) VALUES (?, ?)`, [userId, apiKey], function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ apiKey });
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Protected routes below (require authMiddleware)
router.post('/create', (req, res) => {
  const { userId, name, prompt_script, dial_limit, max_calls_per_contact, call_time_start, call_time_end, call_days, double_dial_no_answer, integrationId, voice_id } = req.body;
  const callDaysJson = JSON.stringify(call_days || []);
  db.run(`INSERT INTO Agents (userId, name, prompt_script, dial_limit, max_calls_per_contact, call_time_start, call_time_end, call_days, double_dial_no_answer, integrationId, voice_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [userId, name, prompt_script, dial_limit, max_calls_per_contact, call_time_start, call_time_end, callDaysJson, double_dial_no_answer ? 1 : 0, integrationId, voice_id],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ botId: this.lastID });
    }
  );
});

// Update bot
router.patch('/update/:botId', (req, res) => {
  const { prompt_script, dial_limit, max_calls_per_contact, call_time_start, call_time_end, call_days, double_dial_no_answer, integrationId, voice_id } = req.body;
  const callDaysJson = JSON.stringify(call_days || []);
  db.run(`UPDATE Agents SET prompt_script = ?, dial_limit = ?, max_calls_per_contact = ?, call_time_start = ?, call_time_end = ?, call_days = ?, double_dial_no_answer = ?, integrationId = ?, voice_id = ?, modifiedDate = CURRENT_TIMESTAMP WHERE id = ?`,
    [prompt_script, dial_limit, max_calls_per_contact, call_time_start, call_time_end, callDaysJson, double_dial_no_answer ? 1 : 0, integrationId, voice_id, req.params.botId],
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

// Middleware for protected routes (applied after public ones)
router.use((req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret');
    req.userId = decoded.userId;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid key' });
  }
});

module.exports = router;
