// VB-v1.01-main/services/postCallSummary.js
const { postNoteToHubSpot } = require('../utils/hubspot');
const { postNoteToGoogleSheets } = require('../utils/googleSheets');
const db = require('../db');

async function postCallSummary({ agentId, contactId, noteContent }) {
  return new Promise((resolve, reject) => {
    db.get(`SELECT * FROM Integrations WHERE userId = ?`, [agentId], async (err, integration) => {
      if (err || !integration) return reject(err || new Error('Integration not found'));

      const creds = JSON.parse(integration.creds || '{}');

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

      resolve();
    });
  });
}

module.exports = { postCallSummary };
