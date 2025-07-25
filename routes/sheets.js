const express = require('express');
const router = express.Router();
const { fetchGoogleSheetLeads } = require('../utils/googleSheets');

// GET /sheets/test-fetch
router.get('/test-fetch', async (req, res) => {
  try {
    const rows = await fetchGoogleSheetLeads();
    res.json({ success: true, leads: rows });
  } catch (error) {
    console.error('❌ Failed to fetch leads from Google Sheets:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
