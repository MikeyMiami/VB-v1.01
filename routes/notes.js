// VB-v1.01-main/routes/notes.js
const express = require('express');
const router = express.Router();
const db = require('../db');
const { postNoteToHubSpot } = require('../utils/hubspot');
const { postNoteToGoogleSheets } = require('../utils/googleSheets');
const handlePostCallSummary = require('../services/post-call-summary');

// Route: POST /notes
router.post('/', async (req, res) => {
  const { agentId, contactId, noteContent } = req.body;
  if (!agentId || !contactId || !noteContent) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    // Load integration record
    const { rows } = await db.query(
      'SELECT * FROM Integrations WHERE userId = $1',
      [agentId]
    );
    const integration = rows[0];
    if (!integration) {
      return res.status(500).json({ error: 'Integration not found or database error' });
    }

    // Parse creds if needed
    const creds = JSON.parse(integration.creds || '{}');

    // Dispatch based on integration type
    switch (integration.integration_type) {
      case 'hubspot':
        await postNoteToHubSpot(integration.api_key, contactId, noteContent);
        break;
      case 'google_sheets':
        await postNoteToGoogleSheets(creds, contactId, noteContent);
        break;
      default:
        return res.status(400).json({ error: 'Unsupported integration type' });
    }

    return res.json({ success: true, message: 'Note added successfully' });

  } catch (err) {
    console.error('❌ Failed to post note:', err.message);
    return res.status(500).json({ error: 'Failed to post note' });
  }
});

// ✅ Route: POST /notes/test (For Google Sheets Test Flow)
router.post('/test', async (req, res) => {
  try {
    const { contact, status, summary, integrationId } = req.body;
    await handlePostCallSummary({
      botId: integrationId,  // align with handlePostCallSummary signature
      contactId: contact,
      callTime: '',         // no-op for test
      duration: 0,          // no-op for test
      outcome: status,
      summary
    });
    res.status(200).json({ message: 'Test note sent to Google Sheets successfully.' });
  } catch (error) {
    console.error('❌ Test note error:', error.message);
    res.status(500).json({ error: 'Failed to send test note.' });
  }
});

module.exports = router;

