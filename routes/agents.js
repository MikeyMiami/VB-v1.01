// VB-v1.01-main/routes/agents.js
const express = require('express');
const router = express.Router();
const db = require('../db');
const jwt = require('jsonwebtoken');
const { Queue } = require('bullmq');
const { fetchLeads } = require('../utils/integrations');

const redisConnection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD
};

// ─── Public endpoints ──────────────────────────────────────────────────────────

// Register (generate API key for new user)
router.post('/register', async (req, res) => {
  const { userId } = req.body;
  try {
    const apiKey = jwt.sign(
      { userId },
      process.env.JWT_SECRET || 'your-secret',
      { expiresIn: '1y' }
    );
    // Insert into Integrations and return the key
    const { rows } = await db.query(
      `INSERT INTO Integrations (userId, api_key)
       VALUES ($1, $2)
       RETURNING api_key`,
      [userId, apiKey]
    );
    res.json({ apiKey: rows[0].api_key });
  } catch (err) {
    console.error('❌ Error in /agents/register:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Fetch leads for a bot
router.post('/leads/:botId', async (req, res) => {
  const { listId } = req.body; // optional
  const { botId } = req.params;

  try {
    // Get the agent’s integrationId
    const { rows } = await db.query(
      `SELECT integrationId
       FROM Agents
       WHERE id = $1`,
      [botId]
    );
    const agent = rows[0];
    if (!agent) return res.status(404).json({ error: 'Bot not found' });
    if (!agent.integrationId) {
      return res.status(400).json({ error: 'No integration configured' });
    }

    // Delegate to your existing integration logic
    const leads = await fetchLeads(agent.integrationId, listId);
    res.json({ leads });
  } catch (err) {
    console.error('❌ Error in /agents/leads:', err.message);
    res.status(500).json({ error: 'Failed to fetch leads' });
  }
});

// ─── Protected endpoints (require valid JWT) ─────────────────────────────────

// Simple JWT auth for all routes below
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

// Create agent
router.post('/create', async (req, res) => {
  const {
    userId,
    name,
    prompt_script,
    dial_limit,
    max_calls_per_contact,
    call_time_start,
    call_time_end,
    call_days,
    double_dial_no_answer,
    integrationId,
    voice_id
  } = req.body;
  const callDaysJson = JSON.stringify(call_days || []);

  try {
    const { rows } = await db.query(
      `INSERT INTO Agents
         (userId, name, prompt_script, dial_limit, max_calls_per_contact,
          call_time_start, call_time_end, call_days, double_dial_no_answer,
          integrationId, voice_id)
       VALUES
         ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING id`,
      [
        userId, name, prompt_script, dial_limit, max_calls_per_contact,
        call_time_start, call_time_end, callDaysJson,
        double_dial_no_answer ? true : false,
        integrationId, voice_id
      ]
    );
    res.json({ botId: rows[0].id });
  } catch (err) {
    console.error('❌ Error in /agents/create:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Update agent
router.patch('/update/:botId', async (req, res) => {
  const {
    prompt_script,
    dial_limit,
    max_calls_per_contact,
    call_time_start,
    call_time_end,
    call_days,
    double_dial_no_answer,
    integrationId,
    voice_id
  } = req.body;
  const callDaysJson = JSON.stringify(call_days || []);
  const { botId } = req.params;

  try {
    await db.query(
      `UPDATE Agents
       SET prompt_script       = $1,
           dial_limit          = $2,
           max_calls_per_contact = $3,
           call_time_start     = $4,
           call_time_end       = $5,
           call_days           = $6,
           double_dial_no_answer = $7,
           integrationId       = $8,
           voice_id            = $9,
           modifiedDate        = CURRENT_TIMESTAMP
       WHERE id = $10`,
      [
        prompt_script,
        dial_limit,
        max_calls_per_contact,
        call_time_start,
        call_time_end,
        callDaysJson,
        double_dial_no_answer ? true : false,
        integrationId,
        voice_id,
        botId
      ]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('❌ Error in /agents/update:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Start agent
router.post('/start/:botId', async (req, res) => {
  const { botId } = req.params;
  try {
    await db.query(
      `UPDATE Agents SET active = TRUE WHERE id = $1`,
      [botId]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('❌ Error in /agents/start:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Stop agent
router.post('/stop/:botId', async (req, res) => {
  const { botId } = req.params;
  try {
    await db.query(
      `UPDATE Agents SET active = FALSE WHERE id = $1`,
      [botId]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('❌ Error in /agents/stop:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Test call
router.post('/test/:botId', async (req, res) => {
  const { botId } = req.params;
  const { to } = req.body;

  try {
    // Verify agent exists
    const { rows } = await db.query(
      `SELECT * FROM Agents WHERE id = $1`,
      [botId]
    );
    const agent = rows[0];
    if (!agent) return res.status(404).json({ error: 'Bot not found' });

    // Enqueue test dial
    const callQueue = new Queue('calls', { connection: redisConnection });
    await callQueue.add('dial', { botId: agent.id, phone: to, contactId: 'test' });
    res.json({ success: true });
  } catch (err) {
    console.error('❌ Error in /agents/test:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

