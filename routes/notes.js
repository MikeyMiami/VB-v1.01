// VB-v1.01-main/routes/notes.js
const express = require('express');
const router = express.Router();
const { postCallSummary } = require('../services/postCallSummary');

// POST /notes/create
router.post('/create', async (req, res) => {
  const { agentId, contactId, summaryText } = req.body;
  if (!agentId || !contactId || !summaryText) {
    return res.status(400).json({ error: 'Missing fields' });
  }

  try {
    await postCallSummary({
      agentId,
      contactId,
      noteContent: summaryText
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
