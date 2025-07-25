// VB-v1.01-main/routes/post-call-summary.js
const express = require('express');
const router = express.Router();
const { postCallSummary } = require('../services/post-call-summary');

router.post('/', async (req, res) => {
  const { agentId, contactId, callTime, duration, outcome, aiSummary } = req.body;

  try {
    await postCallSummary({ agentId, contactId, callTime, duration, outcome, aiSummary });
    res.json({ success: true });
  } catch (err) {
    console.error('❌ Error posting call summary:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
