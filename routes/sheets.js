// VB-v1.01-main/routes/sheets.js
const express = require('express');
const router = express.Router();
const { fetchGoogleSheetLeads } = require('../utils/googleSheets');

// GET /sheets/test-fetch
router.get('/test-fetch', async (req, res) => {
  try {
    const leads = await fetchGoogleSheetLeads();
    res.json({ success: true, leads });
  } catch (error) {
    console.error('❌ Failed to fetch leads from Google Sheets:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
