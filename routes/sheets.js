// VB-v1.01-main/routes/sheets.js
const express = require('express');
const router = express.Router();
const { getLeadsFromGoogleSheets } = require('../utils/googleSheets');

// GET /sheets/test-fetch
router.get('/test-fetch', async (req, res) => {
  try {
    const rows = await getLeadsFromGoogleSheets();
    res.json({ success: true, leads: rows });
  } catch (error) {
    console.error('❌ Failed to fetch leads from Google Sheets:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
