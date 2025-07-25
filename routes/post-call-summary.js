// routes/post-call-summary.js

const express = require('express');
const router = express.Router();
const { handlePostCallSummary } = require('../services/post-call-summary');

// POST /post-call-summary
router.post('/', handlePostCallSummary);

module.exports = router;
