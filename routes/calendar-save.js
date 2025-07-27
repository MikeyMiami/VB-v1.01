// routes/calendar-save.js
const express = require('express');
const router = express.Router();
const db = require('../db');

router.post('/save-tokens', async (req, res) => {
  const { agentId, tokens, email } = req.body;

  if (!agentId || !tokens) return res.status(400).json({ error: 'Missing data' });

  try {
    await db.query(
      `UPDATE Agents SET calendar_type = 'google', calendar_token = $1, calendar_email = $2 WHERE id = $3`,
      [JSON.stringify(tokens), email, agentId]
    );

    res.status(200).json({ message: 'Calendar connected' });
  } catch (err) {
    console.error('❌ Token save error:', err.message);
    res.status(500).json({ error: 'Failed to save tokens' });
  }
});

module.exports = router;
