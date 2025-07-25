const express = require('express');
const router = express.Router();
const handlePostCallSummary = require('../services/post-call-summary');

router.post('/', async (req, res) => {
  try {
    const { botId, contactId, summary, callTime, duration, outcome } = req.body;

    console.log('🟨 Received /post-call-summary payload:', req.body);

    await handlePostCallSummary({
      botId,
      contactId,
      summary,
      callTime,
      duration,
      outcome
    });

    console.log('🟩 Post-call summary processed successfully.');
    res.status(200).json({ success: true });
  } catch (err) {
    console.error('❌ Error in /post-call-summary:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
