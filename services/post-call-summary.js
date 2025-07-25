// VB-v1.01-main/services/post-call-summary.js
const { postNoteToHubSpot } = require('../utils/hubspot');
const { postNoteToGoogleSheets } = require('../utils/googleSheets');
const db = require('../db');

module.exports = async function postCallSummary(req, res) {
  const { agentId, contactId, noteContent } = req.body;

  return new Promise((resolve, reject) => {
    db.get(`SELECT * FROM Integrations WHERE userId = ?`, [agentId], async (err, integration) => {
      if (err || !integration) return reject(err || new Error('Integration not found'));

      const creds = JSON.parse(integration.creds || '{}');

      try {
        switch (integration.integration_type) {
          case 'hubspot':
            await postNoteToHubSpot(integration.api_key, contactId, noteContent);
            break;
          case 'google_sheets':
            await postNoteToGoogleSheets(creds, contactId, noteContent);
            break;
          default:
            console.warn('⚠️ Unknown integration type');
        }

        res.status(200).json({ success: true });
        resolve();
      } catch (e) {
        res.status(500).json({ error: e.message });
        reject(e);
      }
    });
  });
};
