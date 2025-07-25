// routes/post-call-summary.js
const express = require('express');
const router = express.Router();
const postCallSummary = require('../services/post-call-summary'); // ✅ make sure this is correct

router.post('/', postCallSummary);

module.exports = router;
